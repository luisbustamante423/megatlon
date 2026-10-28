/**
 * Crea el primer usuario administrador.
 * Ejecutar una sola vez: npm run seed
 * Cambia el correo/contraseña abajo antes de correrlo, o pásalos por variables de entorno.
 */
const db = require('./db');
const { hashPassword } = require('./auth');

const correo = process.env.ADMIN_EMAIL || 'lb8879195@gmail.com';
const contraseñaPlana = process.env.ADMIN_PASSWORD || 'Luis12345@';
const nombre = process.env.ADMIN_NAME || 'Administrador';

const existente = db.prepare('SELECT id FROM usuarios WHERE correo = ?').get(correo);

if (existente) {
  console.log(`Ya existe un usuario con correo ${correo} (id ${existente.id}). No se creó nada.`);
} else {
  const hash = hashPassword(contraseñaPlana);
  const info = db.prepare(`
    INSERT INTO usuarios (nombre_completo, correo, telefono, contraseña, rol, estado)
    VALUES (?, ?, ?, ?, 'admin', 'activo')
  `).run(nombre, correo, '', hash);

  console.log('Usuario admin creado:');
  console.log('  id:', info.lastInsertRowid);
  console.log('  correo:', correo);
  console.log('  contraseña:', contraseñaPlana, '(cámbiala después de iniciar sesión)');
}
