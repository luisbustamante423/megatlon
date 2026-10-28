/**
 * Borra de la base de datos las tablas que ya no se usan.
 * (Desde esta versión server/db.js ya las elimina solo al arrancar; este script
 * queda por si quieres correrlo a mano. La tabla "progreso" SÍ se usa: no se borra.)
 *   npm run limpiar-tablas
 *
 * Antes de borrar hace una copia de seguridad: gym.respaldo-AAAAMMDD-HHMMSS.db
 * (junto a gym.db). Se puede ejecutar varias veces sin problema.
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');

const TABLAS = ['rutina_ejercicios', 'rutinas', 'ejercicios', 'inventario', 'codigos_login'];

const ruta = db.prepare('PRAGMA database_list').all().find(d => d.name === 'main').file;
const existentes = TABLAS.filter(t =>
  db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)
);

if (!existentes.length) {
  console.log('Nada que borrar: esas tablas ya no existen.');
  process.exit(0);
}

db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
const sello = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const respaldo = path.join(path.dirname(ruta), `gym.respaldo-${sello}.db`);
fs.copyFileSync(ruta, respaldo);
console.log('Respaldo guardado en:', respaldo);

for (const t of existentes) {
  const filas = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
  db.exec(`DROP TABLE "${t}"`);
  console.log(`Borrada: ${t} (${filas} filas)`);
}
db.exec('VACUUM');
console.log('Listo.');
