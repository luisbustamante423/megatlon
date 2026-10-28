const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = process.env.GYM_DB_PATH || path.join(__dirname, 'gym.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ---------- Migraciones suaves ----------
// Solo AGREGAN columnas que falten. No borran ni modifican nada de lo que
// ya tienes guardado. Si la columna ya existe, no se hace nada.
function agregarColumnaSiFalta(tabla, columna, definicion) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${tabla})`).all();
    if (!cols.length) return; // la tabla no existe todavía
    if (cols.some(c => c.name === columna)) return; // ya está
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
    console.log(`[db] columna agregada: ${tabla}.${columna}`);
  } catch (err) {
    console.warn(`[db] no se pudo agregar ${tabla}.${columna}:`, err.message);
  }
}

// Foto del entrenador (se guarda como data URL base64, así no hace falta
// carpeta de subidas ni dependencias extra).
agregarColumnaSiFalta('entrenadores', 'foto', 'TEXT');

// Imagen de fondo para las tarjetas de la landing.
agregarColumnaSiFalta('membresias', 'imagen', 'TEXT');
agregarColumnaSiFalta('clases', 'imagen', 'TEXT');

// Instalaciones: no existía tabla, se crea solo si falta.
try {
  db.exec(`CREATE TABLE IF NOT EXISTS instalaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    imagen TEXT,
    orden INTEGER DEFAULT 0
  )`);
} catch (err) {
  console.warn('[db] no se pudo crear instalaciones:', err.message);
}

// Mensajes del formulario de contacto ("Da el primer paso"). Cuando el
// admin marca "destacado" en el panel, el mensaje pasa a mostrarse como
// testimonio ("Historias reales") en la página, con sus estrellas.
try {
  db.exec(`CREATE TABLE IF NOT EXISTS mensajes_contacto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    correo TEXT,
    mensaje TEXT,
    calificacion INTEGER,
    destacado INTEGER DEFAULT 0,
    leido INTEGER DEFAULT 0,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (err) {
  console.warn('[db] no se pudo crear mensajes_contacto:', err.message);
}

// Quién dejó cada mensaje (cuando viene de un usuario que inició sesión).
agregarColumnaSiFalta('mensajes_contacto', 'usuario_id', 'INTEGER');

// Música: la playlist de cada usuario (canciones de YouTube que marcó con
// el corazón). Una fila por usuario + video.
try {
  db.exec(`CREATE TABLE IF NOT EXISTS musica (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    video_id TEXT NOT NULL,
    titulo TEXT NOT NULL,
    canal TEXT,
    miniatura TEXT,
    consulta TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(usuario_id, video_id),
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
  )`);
} catch (err) {
  console.warn('[db] no se pudo crear musica:', err.message);
}

// Carnet de identidad del usuario (se pide al iniciar sesión y se puede
// buscar en Asistencias). Solo agrega la columna; no toca nada existente.
agregarColumnaSiFalta('usuarios', 'carnet', 'TEXT');

// ---------- Contenido del sitio (hero, contacto, redes) ----------
// Una fila por campo (clave/valor). Antes vivía en localStorage del navegador;
// ahora se guarda aquí para que los cambios del panel persistan.
try {
  db.exec(`CREATE TABLE IF NOT EXISTS contenido_sitio (
    clave TEXT PRIMARY KEY,
    valor TEXT,
    actualizado DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (err) {
  console.warn('[db] no se pudo crear contenido_sitio:', err.message);
}

// ---------- Permisos por rol ----------
// El admin elige desde el panel qué tablas ve cada rol (entrenador, cajero)
// y qué puede hacer en ellas. Una fila por rol + tabla.
try {
  db.exec(`CREATE TABLE IF NOT EXISTS permisos_roles (
    rol TEXT NOT NULL,
    tabla TEXT NOT NULL,
    ver INTEGER DEFAULT 0,
    crear INTEGER DEFAULT 0,
    editar INTEGER DEFAULT 0,
    eliminar INTEGER DEFAULT 0,
    PRIMARY KEY (rol, tabla)
  )`);
  const hay = db.prepare('SELECT COUNT(*) AS n FROM permisos_roles').get().n;
  if (!hay) {
    const ins = db.prepare('INSERT INTO permisos_roles (rol, tabla, ver, crear, editar, eliminar) VALUES (?,?,?,?,?,?)');
    const base = [
      ['entrenador', 'entrenadores', 1, 0, 0, 0],
      ['entrenador', 'clientes', 1, 0, 0, 0],
      ['cajero', 'clientes', 1, 1, 1, 0],
      ['cajero', 'membresias', 1, 0, 0, 0],
      ['cajero', 'pagos', 1, 1, 1, 0],
      ['cajero', 'asistencias', 1, 1, 1, 0]
    ];
    base.forEach(r => ins.run(...r));
  }
} catch (err) {
  console.warn('[db] no se pudo crear permisos_roles:', err.message);
}


// ============================================================
//  MIGRACIÓN v2 — cambios de estructura (se aplica sola, una vez)
//  - clientes: sin objetivo / nivel / entrenador_id; con nombre y peso/altura
//    "antes" y "después".
//  - asistencias: con nombre y dias_presentes (los días que asistió); sin
//    hora de entrada / salida. Una fila por cliente.
//  - progreso: con nombre, peso y altura (antes y después).
//  - pagos: guarda el comprobante (imagen) de los pagos por QR.
//  - notificaciones: cada una lleva su "tipo" (pago, solicitud, inicio de
//    sesión, reserva, mensaje) para separarlas en el panel.
//  - imagen_qr: el QR que se muestra al pagar (lo sube el admin).
//  - Se eliminan las tablas que ya no se usan.
//  Antes de tocar algo importante se guarda una copia: gym.respaldo-antes-de-cambios-*.db
// ============================================================
const fs = require('fs');

function existeTabla(nombre) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(nombre));
}
function columnasDe(tabla) {
  return db.prepare(`PRAGMA table_info(${tabla})`).all().map(c => c.name);
}

let respaldoHecho = false;
function respaldar() {
  if (respaldoHecho) return;
  respaldoHecho = true;
  try {
    const ruta = db.prepare('PRAGMA database_list').all().find(d => d.name === 'main').file;
    if (!ruta) return;
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const sello = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const destino = path.join(path.dirname(ruta), `gym.respaldo-antes-de-cambios-${sello}.db`);
    fs.copyFileSync(ruta, destino);
    console.log('[db] copia de seguridad creada:', destino);
  } catch (err) {
    console.warn('[db] no se pudo crear la copia de seguridad:', err.message);
  }
}

// Reconstruye una tabla con la estructura nueva (la forma oficial de SQLite
// para quitar columnas con claves foráneas). Todo en una transacción: si algo
// falla, la tabla queda como estaba.
function reconstruirTabla(tabla, crearSql, copiar) {
  respaldar();
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    // Las vistas y los disparadores se vuelven a crear más abajo, en cada arranque.
    db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('view', 'trigger')").all()
      .forEach(o => db.exec(`DROP ${o.type.toUpperCase()} IF EXISTS "${o.name}"`));
    db.exec(`DROP TABLE IF EXISTS ${tabla}_nueva`);
    db.exec(crearSql);
    copiar();
    db.exec(`DROP TABLE ${tabla}`);
    db.exec(`ALTER TABLE ${tabla}_nueva RENAME TO ${tabla}`);
    db.exec('COMMIT');
    console.log(`[db] tabla actualizada: ${tabla}`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.warn(`[db] no se pudo actualizar la tabla ${tabla}:`, err.message);
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

// ---- clientes ----
if (existeTabla('clientes')) {
  const cols = columnasDe('clientes');
  const vieja = ['objetivo', 'nivel', 'entrenador_id'].some(c => cols.includes(c));
  const faltan = ['nombre', 'peso_despues', 'altura_despues'].some(c => !cols.includes(c));
  if (vieja || faltan) {
    reconstruirTabla('clientes', `CREATE TABLE clientes_nueva (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      nombre TEXT,
      peso REAL,
      altura REAL,
      peso_despues REAL,
      altura_despues REAL,
      fecha_inscripcion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
    )`, () => {
      const d = c => (cols.includes(c) ? c : 'NULL');
      db.exec(`INSERT INTO clientes_nueva (id, usuario_id, nombre, peso, altura, peso_despues, altura_despues, fecha_inscripcion)
               SELECT c.id, c.usuario_id,
                      (SELECT u.nombre_completo FROM usuarios u WHERE u.id = c.usuario_id),
                      c.peso, c.altura, ${d('peso_despues')}, ${d('altura_despues')}, c.fecha_inscripcion
               FROM clientes c`);
    });
  }
}

// ---- asistencias: una fila por cliente, con la lista de días que asistió ----
if (existeTabla('asistencias')) {
  const cols = columnasDe('asistencias');
  if (cols.includes('hora_entrada') || cols.includes('hora_salida') || !cols.includes('nombre') || !cols.includes('dias_presentes')) {
    reconstruirTabla('asistencias', `CREATE TABLE asistencias_nueva (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      nombre TEXT,
      dias_presentes TEXT,
      fecha DATE,
      metodo TEXT,
      FOREIGN KEY(cliente_id) REFERENCES clientes(id)
    )`, () => {
      const porCliente = new Map();
      const columnasLeer = cols.includes('dias_presentes') ? 'cliente_id, fecha, metodo, dias_presentes' : 'cliente_id, fecha, metodo, NULL AS dias_presentes';
      db.prepare(`SELECT ${columnasLeer} FROM asistencias ORDER BY id`)
        .all()
        .forEach(f => {
          if (f.cliente_id == null) return;
          if (!porCliente.has(f.cliente_id)) porCliente.set(f.cliente_id, { dias: new Set(), metodo: f.metodo });
          const g = porCliente.get(f.cliente_id);
          if (f.fecha) g.dias.add(String(f.fecha).slice(0, 10));
          String(f.dias_presentes || '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => g.dias.add(x));
        });
      const ins = db.prepare('INSERT INTO asistencias_nueva (cliente_id, nombre, dias_presentes, fecha, metodo) VALUES (?, ?, ?, ?, ?)');
      const nombreDe = db.prepare('SELECT u.nombre_completo AS n FROM clientes c JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = ?');
      for (const [clienteId, g] of porCliente) {
        const dias = [...g.dias].sort();
        const fila = nombreDe.get(clienteId);
        ins.run(clienteId, fila ? fila.n : null, dias.join(','), dias.length ? dias[dias.length - 1] : null, g.metodo || 'manual');
      }
    });
  }
}

// ---- progreso: peso y altura, antes y después ----
if (existeTabla('progreso')) {
  const cols = columnasDe('progreso');
  if (['nombre', 'altura', 'peso_despues', 'altura_despues'].some(c => !cols.includes(c))) {
    reconstruirTabla('progreso', `CREATE TABLE progreso_nueva (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      nombre TEXT,
      peso REAL,
      altura REAL,
      peso_despues REAL,
      altura_despues REAL,
      imc REAL,
      medidas TEXT,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(cliente_id) REFERENCES clientes(id)
    )`, () => {
      const d = c => (cols.includes(c) ? c : 'NULL');
      db.exec(`INSERT INTO progreso_nueva (id, cliente_id, nombre, peso, altura, peso_despues, altura_despues, imc, medidas, fecha)
               SELECT p.id, p.cliente_id,
                      (SELECT u.nombre_completo FROM clientes c JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = p.cliente_id),
                      p.peso, ${d('altura')}, ${d('peso_despues')}, ${d('altura_despues')}, p.imc, p.medidas, p.fecha
               FROM progreso p`);
    });
  }
} else {
  db.exec(`CREATE TABLE progreso (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    nombre TEXT,
    peso REAL,
    altura REAL,
    peso_despues REAL,
    altura_despues REAL,
    imc REAL,
    medidas TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cliente_id) REFERENCES clientes(id)
  )`);
}

// Un solo registro de asistencias y de progreso por cliente.
for (const [indice, tabla] of [['ux_asistencias_cliente', 'asistencias'], ['ux_progreso_cliente', 'progreso']]) {
  try {
    if (existeTabla(tabla)) db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${indice} ON ${tabla}(cliente_id)`);
  } catch (err) {
    console.warn(`[db] no se pudo crear el índice ${indice}:`, err.message);
  }
}

// ---- tablas que ya no se usan ----
for (const tabla of ['rutina_ejercicios', 'rutinas', 'ejercicios', 'inventario', 'codigos_login']) {
  if (!existeTabla(tabla)) continue;
  try {
    respaldar();
    db.exec(`DROP TABLE "${tabla}"`);
    console.log(`[db] tabla eliminada: ${tabla}`);
  } catch (err) {
    console.warn(`[db] no se pudo eliminar ${tabla}:`, err.message);
  }
}

// ---- pagos: comprobante del pago por QR (imagen, como data URL) ----
agregarColumnaSiFalta('pagos', 'comprobante', 'TEXT');

// ---- notificaciones: tipo (para separarlas en el panel) ----
agregarColumnaSiFalta('notificaciones', 'tipo', 'TEXT');
try {
  db.exec(`UPDATE notificaciones SET tipo = CASE
      WHEN mensaje LIKE '%comprobante%' OR mensaje LIKE '%pagó%' THEN 'pago'
      WHEN mensaje LIKE '%solicitó el plan%' THEN 'solicitud'
      WHEN mensaje LIKE '%inició sesión%' THEN 'inicio_sesion'
      WHEN mensaje LIKE '%reservó la clase%' THEN 'reserva'
      WHEN mensaje LIKE '%mensaje nuevo%' THEN 'mensaje'
      ELSE 'otro' END
    WHERE tipo IS NULL OR tipo = ''`);
} catch (err) {
  console.warn('[db] no se pudo clasificar las notificaciones:', err.message);
}

// ---- imagen_qr: el QR de pago que sube el admin (se usa el más reciente) ----
try {
  db.exec(`CREATE TABLE IF NOT EXISTS imagen_qr (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imagen TEXT NOT NULL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (err) {
  console.warn('[db] no se pudo crear imagen_qr:', err.message);
}

// ---- Disparadores: mantienen "nombre" al día en clientes, asistencias y progreso ----
// (el nombre sale siempre de la tabla usuarios, aunque el panel o la página
// inserten la fila sin escribirlo).
const NOMBRE_DE_CLIENTE = id => `(SELECT u.nombre_completo FROM clientes c JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = ${id})`;
const DISPARADORES = [
  `CREATE TRIGGER IF NOT EXISTS trg_clientes_nombre_ins AFTER INSERT ON clientes
   BEGIN UPDATE clientes SET nombre = (SELECT nombre_completo FROM usuarios WHERE id = NEW.usuario_id) WHERE id = NEW.id; END`,
  `CREATE TRIGGER IF NOT EXISTS trg_clientes_nombre_upd AFTER UPDATE OF usuario_id ON clientes
   BEGIN UPDATE clientes SET nombre = (SELECT nombre_completo FROM usuarios WHERE id = NEW.usuario_id) WHERE id = NEW.id; END`,
  `CREATE TRIGGER IF NOT EXISTS trg_asistencias_nombre_ins AFTER INSERT ON asistencias
   BEGIN UPDATE asistencias SET nombre = ${NOMBRE_DE_CLIENTE('NEW.cliente_id')} WHERE id = NEW.id; END`,
  `CREATE TRIGGER IF NOT EXISTS trg_progreso_nombre_ins AFTER INSERT ON progreso
   BEGIN UPDATE progreso SET nombre = ${NOMBRE_DE_CLIENTE('NEW.cliente_id')} WHERE id = NEW.id; END`,
  `CREATE TRIGGER IF NOT EXISTS trg_usuarios_nombre_upd AFTER UPDATE OF nombre_completo ON usuarios
   BEGIN
     UPDATE clientes SET nombre = NEW.nombre_completo WHERE usuario_id = NEW.id;
     UPDATE asistencias SET nombre = NEW.nombre_completo WHERE cliente_id IN (SELECT id FROM clientes WHERE usuario_id = NEW.id);
     UPDATE progreso SET nombre = NEW.nombre_completo WHERE cliente_id IN (SELECT id FROM clientes WHERE usuario_id = NEW.id);
   END`
];
for (const sql of DISPARADORES) {
  try { db.exec(sql); } catch (err) { console.warn('[db] no se pudo crear un disparador:', err.message); }
}
// Por si había filas sin nombre (p. ej. creadas antes de esta versión).
try {
  db.exec(`UPDATE clientes SET nombre = (SELECT u.nombre_completo FROM usuarios u WHERE u.id = clientes.usuario_id) WHERE nombre IS NULL`);
  db.exec(`UPDATE asistencias SET nombre = ${NOMBRE_DE_CLIENTE('asistencias.cliente_id')} WHERE nombre IS NULL`);
  db.exec(`UPDATE progreso SET nombre = ${NOMBRE_DE_CLIENTE('progreso.cliente_id')} WHERE nombre IS NULL`);
} catch (err) {
  console.warn('[db] no se pudo completar los nombres:', err.message);
}

// ============================================================
//  CÓDIGO ÚNICO DE USUARIO (LK 1, LK 2, LK 3 …)
//  Tabla propia "codigos_usuario": una fila por usuario.
//   - numero: AUTOINCREMENT → nunca se repite, ni siquiera si se elimina un usuario.
//   - codigo: se arma solo: 'LK ' || numero  (columna generada, no se escribe a mano).
//  Un disparador crea el código AUTOMÁTICAMENTE cada vez que se agrega un usuario
//  (desde el panel, desde la página, desde el seed, etc.) y, al arrancar,
//  se les asigna a los usuarios que ya existían (en orden de id).
// ============================================================
try {
  db.exec(`CREATE TABLE IF NOT EXISTS codigos_usuario (
    numero INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL UNIQUE,
    codigo TEXT GENERATED ALWAYS AS ('LK ' || numero) VIRTUAL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_codigos_usuario_codigo ON codigos_usuario(numero)`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS trg_usuarios_codigo_ins AFTER INSERT ON usuarios
           BEGIN INSERT OR IGNORE INTO codigos_usuario (usuario_id) VALUES (NEW.id); END`);
  // Usuarios que ya existían y todavía no tienen código.
  db.exec(`INSERT INTO codigos_usuario (usuario_id) SELECT id FROM usuarios WHERE id NOT IN (SELECT usuario_id FROM codigos_usuario) ORDER BY id`);
} catch (err) {
  console.warn('[db] no se pudo crear codigos_usuario:', err.message);
}

// Subconsulta reutilizable: código de un usuario a partir de una expresión con su id.
db.codigoDeUsuarioSql = (expr) => `(SELECT cu.codigo FROM codigos_usuario cu WHERE cu.usuario_id = ${expr})`;

// ---------- Vistas con nombres ----------
// Para mirar la base de datos con un visor (DB Browser, etc.): en lugar de
// "cliente_id = 5" muestran el nombre de la persona. Son solo de lectura y se
// regeneran en cada arranque; el panel y la API siguen usando las tablas.
const VISTAS = {
  v_clientes: `SELECT c.id, u.nombre_completo AS nombre, (SELECT cu.codigo FROM codigos_usuario cu WHERE cu.usuario_id = u.id) AS codigo, u.carnet, u.correo, u.telefono,
                      c.peso, c.altura, c.peso_despues, c.altura_despues, c.fecha_inscripcion
               FROM clientes c LEFT JOIN usuarios u ON u.id = c.usuario_id`,
  v_entrenadores: `SELECT e.id, u.nombre_completo AS nombre, (SELECT cu.codigo FROM codigos_usuario cu WHERE cu.usuario_id = u.id) AS codigo, u.correo, e.especialidad, e.experiencia
                   FROM entrenadores e LEFT JOIN usuarios u ON u.id = e.usuario_id`,
  v_pagos: `SELECT p.id, u.nombre_completo AS cliente, (SELECT cu.codigo FROM codigos_usuario cu WHERE cu.usuario_id = u.id) AS codigo, u.carnet, m.nombre AS membresia,
                   p.monto, p.metodo_pago, p.fecha_pago, p.fecha_vencimiento, p.estado,
                   CASE WHEN p.comprobante IS NULL OR p.comprobante = '' THEN 'no' ELSE 'sí' END AS tiene_comprobante
            FROM pagos p
            LEFT JOIN clientes c ON c.id = p.cliente_id
            LEFT JOIN usuarios u ON u.id = c.usuario_id
            LEFT JOIN membresias m ON m.id = p.membresia_id`,
  v_asistencias: `SELECT a.id, u.nombre_completo AS cliente, (SELECT cu.codigo FROM codigos_usuario cu WHERE cu.usuario_id = u.id) AS codigo, u.carnet, a.dias_presentes, a.fecha AS ultima_asistencia, a.metodo
                  FROM asistencias a
                  LEFT JOIN clientes c ON c.id = a.cliente_id
                  LEFT JOIN usuarios u ON u.id = c.usuario_id`,
  v_reservas: `SELECT r.id, u.nombre_completo AS cliente, (SELECT cu.codigo FROM codigos_usuario cu WHERE cu.usuario_id = u.id) AS codigo, k.nombre AS clase, r.fecha
               FROM reservas r
               LEFT JOIN clientes c ON c.id = r.cliente_id
               LEFT JOIN usuarios u ON u.id = c.usuario_id
               LEFT JOIN clases k ON k.id = r.clase_id`,
  v_clases: `SELECT k.id, k.nombre, ue.nombre_completo AS entrenador, k.horario, k.cupos
             FROM clases k
             LEFT JOIN entrenadores e ON e.id = k.entrenador_id
             LEFT JOIN usuarios ue ON ue.id = e.usuario_id`,
  v_notificaciones: `SELECT n.id, u.nombre_completo AS usuario, (SELECT cu.codigo FROM codigos_usuario cu WHERE cu.usuario_id = u.id) AS codigo, n.tipo, n.mensaje, n.fecha, n.leido
                     FROM notificaciones n LEFT JOIN usuarios u ON u.id = n.usuario_id`,
  v_progreso: `SELECT p.id, p.nombre, (SELECT cu.codigo FROM codigos_usuario cu WHERE cu.usuario_id = u.id) AS codigo, u.carnet, p.peso, p.altura, p.peso_despues, p.altura_despues, p.imc, p.fecha
               FROM progreso p
               LEFT JOIN clientes c ON c.id = p.cliente_id
               LEFT JOIN usuarios u ON u.id = c.usuario_id`,
  v_musica: `SELECT m.id, u.nombre_completo AS usuario, (SELECT cu.codigo FROM codigos_usuario cu WHERE cu.usuario_id = u.id) AS codigo, m.titulo, m.canal, m.fecha
             FROM musica m LEFT JOIN usuarios u ON u.id = m.usuario_id`
};
for (const [nombre, sql] of Object.entries(VISTAS)) {
  try {
    db.exec(`DROP VIEW IF EXISTS ${nombre}`);
    db.exec(`CREATE VIEW ${nombre} AS ${sql}`);
  } catch (err) {
    console.warn(`[db] no se pudo crear la vista ${nombre}:`, err.message);
  }
}

module.exports = db;
