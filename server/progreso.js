/**
 * Progreso físico de cada cliente: peso y altura "antes" y "después".
 *
 *  - clientes.peso / clientes.altura                 → el "antes" (se piden al iniciar sesión)
 *  - clientes.peso_despues / clientes.altura_despues → el "después" (lo actualiza el cliente)
 *  - progreso: una fila por cliente con los mismos datos + nombre + IMC.
 *
 * Las dos tablas se mantienen iguales: todo pasa por aquí.
 */
const db = require('./db');

// Peso en kg: entre 20 y 400. Acepta coma decimal ("70,5"). Devuelve número o null.
function limpiarPeso(valor) {
  const n = Number(String(valor == null ? '' : valor).trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 20 && n <= 400 ? Math.round(n * 10) / 10 : null;
}

// Altura en metros: acepta 1.75, 1,75 o 175 (centímetros). Devuelve metros o null.
function limpiarAltura(valor) {
  let n = Number(String(valor == null ? '' : valor).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (n >= 100 && n <= 250) n = n / 100; // venía en centímetros
  return n >= 0.5 && n <= 2.5 ? Math.round(n * 100) / 100 : null;
}

function imc(peso, altura) {
  return peso && altura ? Math.round((peso / (altura * altura)) * 10) / 10 : null;
}

// Copia lo que hay en "clientes" a la tabla "progreso" (crea o actualiza su fila).
function sincronizar(clienteId) {
  const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
  if (!c) return null;
  const nombre = c.nombre || (db.prepare('SELECT nombre_completo AS n FROM usuarios WHERE id = ?').get(c.usuario_id) || {}).n || null;
  const valor = imc(c.peso_despues || c.peso, c.altura_despues || c.altura);
  const existe = db.prepare('SELECT id FROM progreso WHERE cliente_id = ?').get(clienteId);
  if (existe) {
    db.prepare(`UPDATE progreso SET nombre = ?, peso = ?, altura = ?, peso_despues = ?, altura_despues = ?, imc = ?, fecha = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(nombre, c.peso, c.altura, c.peso_despues, c.altura_despues, valor, existe.id);
  } else if (c.peso != null || c.altura != null || c.peso_despues != null || c.altura_despues != null) {
    db.prepare(`INSERT INTO progreso (cliente_id, nombre, peso, altura, peso_despues, altura_despues, imc) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(clienteId, nombre, c.peso, c.altura, c.peso_despues, c.altura_despues, valor);
  }
  return leer(clienteId);
}

// Lo que ve el cliente en "Mi progreso".
function leer(clienteId) {
  const c = db.prepare('SELECT peso, altura, peso_despues, altura_despues FROM clientes WHERE id = ?').get(clienteId);
  if (!c) return null;
  return {
    peso: c.peso, altura: c.altura,
    peso_despues: c.peso_despues, altura_despues: c.altura_despues,
    imc_antes: imc(c.peso, c.altura),
    imc_despues: imc(c.peso_despues, c.altura_despues)
  };
}

// Al iniciar sesión: guarda el peso y la altura SOLO si todavía no estaban.
function inicializar(clienteId, peso, altura) {
  db.prepare('UPDATE clientes SET peso = COALESCE(peso, ?), altura = COALESCE(altura, ?) WHERE id = ?').run(peso, altura, clienteId);
  return sincronizar(clienteId);
}

// Actualizar desde "Mi progreso". Cada campo es opcional:
// Solo se pueden editar peso_despues y altura_despues (las veces que quiera).
//   undefined → no se toca · '' o null → se borra (solo el "después") · valor → se guarda.
// Devuelve { error } o { progreso }.
function actualizar(clienteId, datos) {
  const sets = [];
  const vals = [];
  const campos = [
    // El "antes" (peso y altura del registro) NO se puede editar desde "Mi progreso": se ignora aunque llegue en la petición.
    ['peso_despues', limpiarPeso, 'peso (después)', true],
    ['altura_despues', limpiarAltura, 'altura (después)', true]
  ];
  for (const [nombre, limpiar, etiqueta, puedeQuedarVacio] of campos) {
    const crudo = datos[nombre];
    if (crudo === undefined) continue;
    const vacio = crudo === null || String(crudo).trim() === '';
    if (vacio) {
      if (!puedeQuedarVacio) return { error: `Escribe tu ${etiqueta}.` };
      sets.push(`${nombre} = NULL`);
      continue;
    }
    const v = limpiar(crudo);
    if (v == null) {
      return { error: nombre.startsWith('peso')
        ? `El ${etiqueta} debe estar entre 20 y 400 kg.`
        : `La ${etiqueta} debe estar entre 0.50 y 2.50 m (puedes escribir 1.75 o 175).` };
    }
    sets.push(`${nombre} = ?`);
    vals.push(v);
  }
  if (!sets.length) return { error: 'No hay nada para guardar.' };
  db.prepare(`UPDATE clientes SET ${sets.join(', ')} WHERE id = ?`).run(...vals, clienteId);
  sincronizar(clienteId);
  return { progreso: leer(clienteId) };
}

module.exports = { limpiarPeso, limpiarAltura, imc, sincronizar, leer, inicializar, actualizar };
