/**
 * Panel → Asistencias.
 *
 * Aparecen automáticamente todos los usuarios que ya tienen una membresía
 * pagada (el último pago con estado "pagado" de cada cliente). El panel
 * marca los días con un calendario; aquí se calcula el periodo de cada
 * membresía y se guardan / quitan los checks en la tabla `asistencias`.
 *
 * Los días se manejan como "YYYY-MM-DD" en hora de Bolivia (UTC-4) para que
 * un pago hecho de noche no caiga en el día equivocado.
 */
const db = require('./db');

const MS_DIA = 86400000;
const OFFSET_BO_MS = -4 * 3600000;
const DIAS_POR_DEFECTO = 30;

// ---------- fechas ----------
function diaBo(date) {
  return new Date(date.getTime() + OFFSET_BO_MS).toISOString().slice(0, 10);
}

function hoyBo() {
  return diaBo(new Date());
}

// "2026-09-28 14:00:00" (UTC, como lo guarda SQLite) o "2026-10-30" → "YYYY-MM-DD"
function diaDe(texto) {
  if (!texto) return null;
  const t = String(texto).trim();
  if (t.length <= 10) return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  const d = new Date(`${t.replace(' ', 'T')}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? '' : 'Z'}`);
  return isNaN(d.getTime()) ? null : diaBo(d);
}

function sumarDias(dia, n) {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffDias(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DIA);
}

function fechaValida(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f))) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

// ---------- pagos ----------
const SQL_PAGADOS = `
  SELECT p.id AS pago_id, p.cliente_id, p.fecha_pago, p.fecha_vencimiento,
         m.nombre AS membresia, m.duracion_dias,
         u.id AS usuario_id, (SELECT cu.codigo FROM codigos_usuario cu WHERE cu.usuario_id = u.id) AS codigo, u.nombre_completo, u.correo, u.telefono, u.carnet
  FROM pagos p
  JOIN clientes c ON c.id = p.cliente_id
  JOIN usuarios u ON u.id = c.usuario_id
  LEFT JOIN membresias m ON m.id = p.membresia_id
  WHERE p.estado = 'pagado'`;

// Último pago "pagado" de cada cliente (el más reciente manda).
function ultimosPagados() {
  const vistos = new Set();
  return db.prepare(`${SQL_PAGADOS} ORDER BY p.id DESC`).all().filter(p => {
    if (vistos.has(p.cliente_id)) return false;
    vistos.add(p.cliente_id);
    return true;
  });
}

function ultimoPagadoDe(clienteId) {
  return db.prepare(`${SQL_PAGADOS} AND p.cliente_id = ? ORDER BY p.id DESC LIMIT 1`).get(clienteId) || null;
}

// Periodo de la membresía: del día del pago al día de vencimiento (ambos incluidos).
function periodo(pago) {
  const inicio = diaDe(pago.fecha_pago) || hoyBo();
  let vence = diaDe(pago.fecha_vencimiento);
  if (!vence) vence = sumarDias(inicio, Number(pago.duracion_dias) || DIAS_POR_DEFECTO);
  if (vence < inicio) vence = inicio;
  return { inicio, vence, dias: diffDias(inicio, vence), vigente: vence >= hoyBo() };
}

function contarEnPeriodo(fechas, per) {
  return fechas.filter(f => f >= per.inicio && f <= per.vence).length;
}

// ============================================================
//  Lista para el panel
// ============================================================
// Días que asistió cada cliente, tomados de la columna "dias_presentes"
// (texto con fechas AAAA-MM-DD separadas por coma). Devuelve Map(cliente_id → [fechas]).
function diasPorCliente() {
  const porCliente = new Map();
  db.prepare('SELECT cliente_id, dias_presentes FROM asistencias').all().forEach(f => {
    if (!porCliente.has(f.cliente_id)) porCliente.set(f.cliente_id, new Set());
    String(f.dias_presentes || '').split(',').map(x => x.trim()).filter(fechaValida).forEach(x => porCliente.get(f.cliente_id).add(x));
  });
  const out = new Map();
  for (const [id, set] of porCliente) out.set(id, [...set].sort());
  return out;
}

function listar() {
  const porCliente = diasPorCliente();

  const filas = ultimosPagados().map(p => {
    const per = periodo(p);
    const fechas = porCliente.get(p.cliente_id) || [];
    return {
      cliente_id: p.cliente_id,
      pago_id: p.pago_id,
      nombre: p.nombre_completo,
      codigo: p.codigo || '',
      carnet: p.carnet || '',
      correo: p.correo || '',
      telefono: p.telefono || '',
      membresia: p.membresia || '',
      inicio: per.inicio,
      vence: per.vence,
      dias: per.dias,
      vigente: per.vigente,
      asistidos: contarEnPeriodo(fechas, per),
      fechas
    };
  });

  // Vigentes primero; dentro de cada grupo, por nombre.
  filas.sort((a, b) => Number(b.vigente) - Number(a.vigente) || a.nombre.localeCompare(b.nombre, 'es'));
  return { hoy: hoyBo(), usuarios: filas };
}

// ============================================================
//  Marcar / quitar el check de un día
// ============================================================
// Devuelve { error } o { asistidos }.
function marcar(clienteId, fecha, presente) {
  if (!fechaValida(fecha)) return { error: 'Fecha no válida.' };
  const pago = ultimoPagadoDe(Number(clienteId));
  if (!pago) return { error: 'Ese usuario no tiene una membresía pagada.' };

  const per = periodo(pago);
  if (fecha > hoyBo()) return { error: 'No se puede marcar un día que todavía no llegó.' };
  if (fecha < per.inicio || fecha > per.vence) {
    return { error: 'Ese día está fuera de la membresía. Cambia los días de la membresía si hace falta.' };
  }

  const dias = new Set(diasPorCliente().get(pago.cliente_id) || []);
  if (presente) dias.add(fecha); else dias.delete(fecha);
  const lista = [...dias].sort();
  const texto = lista.join(',');
  const ultima = lista.length ? lista[lista.length - 1] : null;

  const filas = db.prepare('SELECT id FROM asistencias WHERE cliente_id = ? ORDER BY id').all(pago.cliente_id);
  if (filas.length) {
    db.prepare("UPDATE asistencias SET dias_presentes = ?, fecha = ?, metodo = 'manual' WHERE id = ?").run(texto, ultima, filas[0].id);
    filas.slice(1).forEach(f => db.prepare('DELETE FROM asistencias WHERE id = ?').run(f.id)); // una sola fila por cliente
  } else if (lista.length) {
    // El nombre lo completa solo la base de datos (disparador).
    db.prepare("INSERT INTO asistencias (cliente_id, dias_presentes, fecha, metodo) VALUES (?, ?, ?, 'manual')").run(pago.cliente_id, texto, ultima);
  }

  const fechas = lista;
  return { asistidos: contarEnPeriodo(fechas, per) };
}

// ============================================================
//  Más o menos días de membresía
// ============================================================
// El vencimiento pasa a ser: día del pago + los días que se elijan.
// Devuelve { error } o { dias, vence, vigente }.
function cambiarDias(pagoId, dias) {
  const n = Number(dias);
  if (!Number.isInteger(n) || n < 1 || n > 365) return { error: 'Los días deben ser un número entre 1 y 365.' };

  const pago = db.prepare(`${SQL_PAGADOS} AND p.id = ?`).get(Number(pagoId));
  if (!pago) return { error: 'Ese pago no existe o todavía no está pagado.' };

  const inicio = diaDe(pago.fecha_pago) || hoyBo();
  const vence = sumarDias(inicio, n);
  db.prepare('UPDATE pagos SET fecha_vencimiento = ? WHERE id = ?').run(vence, pago.pago_id);
  return { dias: n, vence, vigente: vence >= hoyBo() };
}

module.exports = { listar, marcar, cambiarDias };
