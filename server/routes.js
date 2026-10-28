const express = require('express');
const db = require('./db');
const schema = require('./schema');
const { hashPassword } = require('./auth');
const asistencias = require('./asistencias');
const { normalizarCarnet, MENSAJE_CARNET } = require('./carnet');
const progreso = require('./progreso');

const router = express.Router();

// ============================================================
//  VALIDACIÓN
//  Se corre antes de tocar la base. Devuelve una lista de errores
//  legibles; si viene vacía, los datos pasan.
// ============================================================
// Nombre de persona: solo letras (con tildes/ñ), espacios, apóstrofe, punto y
// guion. Sin números. Igual que en el inicio de sesión de la página.
const NOMBRE_RE = /^\p{L}[\p{L}\s'.\-]*$/u;

// Correo: debe tener letras antes del @ (no solo números), dominio con letras y terminación de 2+ letras.
const CORREO_RE = /^(?=[^@]*[A-Za-z])[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$/;
// Teléfono: solo dígitos, de 7 a 8.
const TELEFONO_RE = /^\d{7,8}$/;

// Fecha AAAA-MM-DD que exista de verdad (rechaza 2026-02-31).
function fechaIsoValida(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

const IMAGEN_MAX_BYTES = 3 * 1024 * 1024; // 3 MB ya comprimida
const IMAGEN_TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function validarImagen(valor, etiqueta, errores) {
  const m = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(valor);
  if (!m) {
    errores.push(`${etiqueta}: el formato de la imagen no es válido.`);
    return;
  }
  if (!IMAGEN_TIPOS.includes(m[1].toLowerCase())) {
    errores.push(`${etiqueta}: solo se aceptan JPG, PNG, WEBP o GIF.`);
    return;
  }
  const bytes = Math.floor((m[2].replace(/\s/g, '').length * 3) / 4);
  if (bytes > IMAGEN_MAX_BYTES) {
    errores.push(`${etiqueta}: la imagen pesa demasiado (máx. 3 MB).`);
  }
}

function validarDatos(config, data, { creando }) {
  const errores = [];

  config.fields.forEach(f => {
    if (f.readonly) return;
    const presente = f.name in data;
    const valor = data[f.name];
    const vacio = valor === undefined || valor === null || String(valor).trim() === '';

    // Obligatorios: al crear siempre; al editar solo si mandan el campo.
    if (f.required && !f.createOnly && ((creando && (!presente || vacio)) || (presente && vacio))) {
      errores.push(`${f.label} es obligatorio.`);
      return;
    }
    if (f.required && f.createOnly && creando && vacio) {
      errores.push(`${f.label} es obligatorio.`);
      return;
    }
    if (!presente || vacio) {
      if (presente && f.soloCarnet) data[f.name] = null;
      return;
    }

    const texto = String(valor).trim();

    if (f.soloNombre) {
      if (texto.length < 2 || !NOMBRE_RE.test(texto)) {
        errores.push(`${f.label} solo puede tener letras (sin números ni símbolos).`);
      }
    }

    if (f.soloTelefono && !TELEFONO_RE.test(texto)) {
      errores.push(`${f.label}: solo números, de 7 a 8 dígitos.`);
    }

    if (f.soloCarnet) {
      const carnet = normalizarCarnet(texto);
      if (!carnet) errores.push(`${f.label}: ${MENSAJE_CARNET}`);
      else data[f.name] = carnet; // queda en mayúsculas y sin espacios
    }

    if (f.soloFechas) {
      const dias = texto.split(/[\s,;]+/).filter(Boolean);
      const mala = dias.find(d => !fechaIsoValida(d));
      if (mala) errores.push(`${f.label}: "${mala}" no es una fecha válida (usa AAAA-MM-DD).`);
      else data[f.name] = [...new Set(dias)].sort().join(',');
    }

    if (f.type === 'image') {
      validarImagen(texto, f.label, errores);
    } else if (f.type === 'number') {
      if (isNaN(Number(texto))) errores.push(`${f.label} debe ser un número.`);
      else if (f.min != null && Number(texto) < f.min) errores.push(`${f.label} no puede ser menor a ${f.min}.`);
    } else if (f.type === 'email') {
      if (!CORREO_RE.test(texto)) errores.push(`${f.label}: escribe un correo válido (con letras y @, no solo números).`);
    } else if (f.type === 'select' && Array.isArray(f.options)) {
      if (!f.options.includes(texto)) errores.push(`${f.label}: valor no permitido.`);
    } else if (f.type === 'password') {
      if (texto.length < 6) errores.push(`${f.label} debe tener al menos 6 caracteres.`);
    } else if (f.type === 'fk') {
      if (!/^\d+$/.test(texto)) errores.push(`${f.label}: selección no válida.`);
    }

    if (f.maxLength && texto.length > f.maxLength) {
      errores.push(`${f.label}: máximo ${f.maxLength} caracteres.`);
    }
  });

  return errores;
}


// ============================================================
//  GANCHOS POR TABLA
//  Lógica extra que el CRUD genérico no sabe hacer.
// ============================================================
function fechaISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ganchos = {
  // Mensajes de contacto: si el admin escribe una contraseña, se crea el
  // usuario (cliente) con ese nombre, correo y contraseña, y el mensaje queda
  // ligado a él. La contraseña nunca se guarda en la tabla de mensajes.
  mensajes_contacto(data, { creando }) {
    const clave = data['contraseña'];
    const carnet = data.carnet || null;
    delete data['contraseña'];
    delete data.carnet; // no es columna de esta tabla: solo sirve para crear el usuario
    if (!creando) return null;

    const correo = String(data.correo || '').trim().toLowerCase();
    if (clave) {
      if (!correo) return 'Para crear el usuario hace falta el correo.';
      if (db.prepare('SELECT id FROM usuarios WHERE lower(correo) = ?').get(correo)) {
        return 'Ya existe un usuario con ese correo.';
      }
      const info = db
        .prepare("INSERT INTO usuarios (nombre_completo, correo, telefono, carnet, contraseña, rol, estado) VALUES (?, ?, '', ?, ?, 'cliente', 'activo')")
        .run(String(data.nombre).trim(), correo, carnet, hashPassword(clave));
      db.prepare('INSERT INTO clientes (usuario_id) VALUES (?)').run(info.lastInsertRowid);
      data.usuario_id = Number(info.lastInsertRowid);
    } else if (correo) {
      const u = db.prepare('SELECT id FROM usuarios WHERE lower(correo) = ?').get(correo);
      if (u) data.usuario_id = u.id;
    }
    return null;
  },

  // Pagos: al marcar "pagado" sin fecha de vencimiento, se calcula sola con
  // la duración del plan. Si venía como solicitud pendiente, la fecha de
  // pago pasa a ser hoy (es cuando empieza a correr la membresía).
  pagos(data, { existente }) {
    const estado = data.estado !== undefined ? data.estado : existente && existente.estado;
    if (estado !== 'pagado' || data.fecha_vencimiento) return null;

    const membresiaId = data.membresia_id || (existente && existente.membresia_id);
    const m = membresiaId && db.prepare('SELECT duracion_dias FROM membresias WHERE id = ?').get(membresiaId);
    if (m && m.duracion_dias) {
      const f = new Date();
      f.setDate(f.getDate() + Number(m.duracion_dias));
      data.fecha_vencimiento = fechaISO(f);
    }
    return null;
  }
};


// ============================================================
//  PERMISOS POR ROL
//  admin: todo. entrenador y cajero: lo que el admin marque en el panel
//  (tabla permisos_roles). La tabla "usuarios" es solo del admin.
// ============================================================
const TODO = { ver: true, crear: true, editar: true, eliminar: true };
const ACCION_POR_METODO = { GET: 'ver', POST: 'crear', PUT: 'editar', DELETE: 'eliminar' };
const ROLES_EDITABLES = ['entrenador', 'cajero'];
const SOLO_ADMIN = ['usuarios'];

function permisosDe(user, tabla) {
  if (user.rol === 'admin') return TODO;
  if (!ROLES_EDITABLES.includes(user.rol) || SOLO_ADMIN.includes(tabla)) return {};
  const f = db.prepare('SELECT ver, crear, editar, eliminar FROM permisos_roles WHERE rol = ? AND tabla = ?').get(user.rol, tabla);
  if (!f) return {};
  return { ver: !!f.ver, crear: !!f.crear, editar: !!f.editar, eliminar: !!f.eliminar };
}

// Se aplica a TODAS las rutas de abajo (la validación real está en el servidor,
// no solo en los botones del panel).
router.use((req, res, next) => {
  const partes = req.path.split('/');
  let tabla = partes[1];
  let accion = ACCION_POR_METODO[req.method];
  if (tabla === 'meta') return next();
  if (tabla === 'panel') {
    if (partes[2] === 'asistencias') {
      tabla = 'asistencias';
      accion = req.method === 'GET' ? 'ver' : 'editar';
    } else if (req.user.rol === 'admin') {
      return next();
    } else {
      return res.status(403).json({ error: 'Solo el administrador' });
    }
  }
  if (!accion || !permisosDe(req.user, tabla)[accion]) {
    return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  }
  next();
});

// GET /api/meta -> le da al frontend las tablas que este usuario puede ver
// (con sus permisos) para construir el menú y los formularios.
router.get('/meta', (req, res) => {
  const visible = {};
  for (const [tabla, config] of Object.entries(schema)) {
    const permisos = permisosDe(req.user, tabla);
    if (permisos.ver) visible[tabla] = { ...config, permisos };
  }
  res.json(visible);
});

// ---------- Panel → Permisos por rol (solo admin) ----------
router.get('/panel/permisos', (req, res) => {
  const tablas = Object.entries(schema)
    .filter(([t]) => !SOLO_ADMIN.includes(t))
    .map(([t, c]) => ({ tabla: t, label: c.label, icon: c.icon }));
  const permisos = db.prepare('SELECT rol, tabla, ver, crear, editar, eliminar FROM permisos_roles').all();
  res.json({ roles: ROLES_EDITABLES, tablas, permisos });
});

router.put('/panel/permisos', (req, res) => {
  try {
    const lista = Array.isArray(req.body && req.body.permisos) ? req.body.permisos : null;
    if (!lista) return res.status(400).json({ error: 'Faltan los permisos' });
    const validas = Object.keys(schema).filter(t => !SOLO_ADMIN.includes(t));
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM permisos_roles');
      const ins = db.prepare('INSERT INTO permisos_roles (rol, tabla, ver, crear, editar, eliminar) VALUES (?,?,?,?,?,?)');
      for (const p of lista) {
        if (!ROLES_EDITABLES.includes(p.rol) || !validas.includes(p.tabla)) continue;
        const ver = p.ver || p.crear || p.editar || p.eliminar ? 1 : 0; // si puede hacer algo, también ve
        if (!ver) continue;
        ins.run(p.rol, p.tabla, 1, p.crear ? 1 : 0, p.editar ? 1 : 0, p.eliminar ? 1 : 0);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Panel → Contenido del sitio (solo admin) ----------
router.put('/panel/contenido', (req, res) => {
  try {
    const datos = req.body || {};
    if (datos.contacto_telefono && !TELEFONO_RE.test(String(datos.contacto_telefono).trim())) {
      return res.status(400).json({ error: 'El teléfono debe tener solo números, de 7 a 8 dígitos.' });
    }
    const up = db.prepare("INSERT INTO contenido_sitio (clave, valor, actualizado) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado = CURRENT_TIMESTAMP");
    for (const [k, v] of Object.entries(datos)) {
      if (!/^[a-z0-9_]{1,60}$/.test(k)) continue;
      up.run(k, String(v == null ? '' : v).slice(0, 2000));
    }
    const out = {};
    db.prepare('SELECT clave, valor FROM contenido_sitio').all().forEach(r => { out[r.clave] = r.valor; });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Panel → Asistencias ----------
// Usuarios con membresía pagada + calendario para marcar los días.
router.get('/panel/asistencias', (req, res) => {
  try {
    res.json(asistencias.listar());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/panel/asistencias/marcar', (req, res) => {
  try {
    const { cliente_id, fecha, presente } = req.body || {};
    const r = asistencias.marcar(cliente_id, fecha, Boolean(presente));
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/panel/asistencias/dias', (req, res) => {
  try {
    const { pago_id, dias } = req.body || {};
    const r = asistencias.cambiarDias(pago_id, dias);
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Para clientes y entrenadores el texto que se muestra es el NOMBRE del usuario
// (no el número, ni "objetivo" / "especialidad").
const ETIQUETA_FK = {
  clientes: alias => `(SELECT u.nombre_completo FROM usuarios u WHERE u.id = ${alias}.usuario_id)`,
  entrenadores: alias => `(SELECT u.nombre_completo FROM usuarios u WHERE u.id = ${alias}.usuario_id)`
};

// Código único del usuario (LK 1, LK 2 …) que se muestra bajo el nombre en el panel.
// Para clientes y entrenadores se busca por su usuario_id; para usuarios, por su id.
const CODIGO_FK = {
  usuarios: alias => db.codigoDeUsuarioSql(`${alias}.id`),
  clientes: alias => db.codigoDeUsuarioSql(`${alias}.usuario_id`),
  entrenadores: alias => db.codigoDeUsuarioSql(`${alias}.usuario_id`)
};
// Código de "la persona de la fila" (para tablas que muestran su propio nombre).
const CODIGO_PROPIO = {
  usuarios: db.codigoDeUsuarioSql('t.id'),
  clientes: db.codigoDeUsuarioSql('t.usuario_id'),
  entrenadores: db.codigoDeUsuarioSql('t.usuario_id'),
  asistencias: db.codigoDeUsuarioSql('(SELECT cc.usuario_id FROM clientes cc WHERE cc.id = t.cliente_id)'),
  mensajes_contacto: db.codigoDeUsuarioSql("COALESCE(t.usuario_id, (SELECT uu.id FROM usuarios uu WHERE lower(uu.correo) = lower(t.correo) LIMIT 1))")
};

// Construye dinámicamente una ruta CRUD por cada tabla del schema.
for (const [table, config] of Object.entries(schema)) {
  const columns = config.fields.filter(f => !f.virtual).map(f => f.name);

  // LISTAR (con joins simples para mostrar el texto del FK, no solo el id)
  router.get(`/${table}`, (req, res) => {
    try {
      let sql = `SELECT t.* `;
      const joins = [];
      config.fields.forEach(f => {
        if (f.type === 'fk') {
          const alias = `fk_${f.name}`;
          const etiqueta = ETIQUETA_FK[f.fk.table];
          sql += etiqueta
            ? `, ${etiqueta(alias)} AS ${f.name}_label `
            : `, ${alias}.${f.fk.display} AS ${f.name}_label `;
          joins.push(`LEFT JOIN ${f.fk.table} ${alias} ON ${alias}.id = t.${f.name}`);
          if (CODIGO_FK[f.fk.table]) sql += `, ${CODIGO_FK[f.fk.table](alias)} AS ${f.name}_codigo `;
        }
      });
      if (CODIGO_PROPIO[table]) sql += `, ${CODIGO_PROPIO[table]} AS codigo `;
      sql += `FROM ${table} t ${joins.join(' ')} ORDER BY t.id DESC`;
      let rows = db.prepare(sql).all();
      // Pagos: la lista no lleva la imagen del comprobante (pesa); solo avisa si hay.
      // "Ver recibo" la pide aparte con GET /pagos/:id.
      if (table === 'pagos') {
        rows = rows.map(r => {
          const tiene = Boolean(r.comprobante);
          delete r.comprobante;
          return { ...r, tiene_comprobante: tiene ? 1 : 0 };
        });
      }
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // OBTENER UNO
  router.get(`/${table}/:id`, (req, res) => {
    try {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!row) return res.status(404).json({ error: 'No encontrado' });
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // CREAR
  router.post(`/${table}`, (req, res) => {
    try {
      const data = { ...req.body };

      const errores = validarDatos(config, data, { creando: true });
      if (errores.length) return res.status(400).json({ error: errores.join(' '), errores });

      if (ganchos[table]) {
        const problema = ganchos[table](data, { creando: true, existente: null });
        if (problema) return res.status(400).json({ error: problema, errores: [problema] });
      }

      // Solo aceptar columnas conocidas del schema (evita inyección de columnas)
      const usable = columns.filter(c => c in data);

      // Hashear contraseña si esta tabla la tiene
      config.fields.forEach(f => {
        if (f.type === 'password' && data[f.name]) {
          data[f.name] = hashPassword(data[f.name]);
        }
      });

      const placeholders = usable.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${usable.join(', ')}) VALUES (${placeholders})`;
      const info = db.prepare(sql).run(...usable.map(c => data[c]));
      const created = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
      if (table === 'clientes') progreso.sincronizar(created.id); // peso/altura también en la tabla progreso
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ACTUALIZAR
  router.put(`/${table}/:id`, (req, res) => {
    try {
      const data = { ...req.body };

      const errores = validarDatos(config, data, { creando: false });
      if (errores.length) return res.status(400).json({ error: errores.join(' '), errores });

      const existente = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!existente) return res.status(404).json({ error: 'No encontrado' });
      if (ganchos[table]) {
        const problema = ganchos[table](data, { creando: false, existente });
        if (problema) return res.status(400).json({ error: problema, errores: [problema] });
      }

      let usable = columns.filter(c => c in data);

      // No permitir sobreescribir campos de solo lectura ni "createOnly"
      usable = usable.filter(c => {
        const f = config.fields.find(fld => fld.name === c);
        if (f && f.readonly) return false;
        if (f && f.createOnly && !data[c]) return false;
        return true;
      });

      config.fields.forEach(f => {
        if (f.type === 'password' && data[f.name]) {
          data[f.name] = hashPassword(data[f.name]);
        }
      });

      if (usable.length === 0) return res.status(400).json({ error: 'Nada para actualizar' });

      const setClause = usable.map(c => `${c} = ?`).join(', ');
      const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
      db.prepare(sql).run(...usable.map(c => data[c]), req.params.id);
      if (table === 'pagos' && existente.estado !== 'pagado' && data.estado === 'pagado') {
        db.prepare('UPDATE pagos SET fecha_pago = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
      }
      const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!updated) return res.status(404).json({ error: 'No encontrado' });
      if (table === 'clientes') progreso.sincronizar(updated.id); // peso/altura también en la tabla progreso
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ELIMINAR
  router.delete(`/${table}/:id`, (req, res) => {
    try {
      let info;
      if (table === 'clientes') {
        // Su fila de progreso se crea sola al iniciar sesión, así que se borra junto con el cliente
        // (si el cliente tiene pagos o reservas, todo se revierte y avisa).
        db.exec('BEGIN');
        try {
          db.prepare('DELETE FROM progreso WHERE cliente_id = ?').run(req.params.id);
          info = db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw e; }
      } else {
        info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
      }
      if (info.changes === 0) return res.status(404).json({ error: 'No encontrado' });
      res.status(204).send();
    } catch (err) {
      // Suele fallar por FOREIGN KEY si otras tablas dependen de este registro
      res.status(400).json({ error: 'No se puede eliminar: hay registros relacionados (' + err.message + ')' });
    }
  });
}

module.exports = router;
