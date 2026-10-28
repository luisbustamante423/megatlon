// Carga el archivo .env de la carpeta raíz (SMTP, JWT_SECRET, etc.), si existe.
try {
  const ruta = require('path').join(__dirname, '..', '.env');
  if (require('fs').existsSync(ruta)) process.loadEnvFile(ruta);
} catch (err) {
  console.warn('[env] no se pudo leer .env:', err.message);
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { comparePassword, signToken, requireAuth, requireStaff } = require('./auth');
// Código único del usuario (LK 1, LK 2 …) de la tabla codigos_usuario.
function codigoDe(usuarioId) {
  const f = db.prepare('SELECT codigo FROM codigos_usuario WHERE usuario_id = ?').get(usuarioId);
  return f ? f.codigo : '';
}
const apiRoutes = require('./routes');
const cliente = require('./cliente');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Límite ampliado: las fotos de entrenadores viajan como data URL (base64)
// dentro del JSON. El default de Express es 100kb y se quedaba corto.
app.use(express.json({ limit: '12mb' }));

// ---------- LOGIN (público) ----------
app.post('/api/auth/login', (req, res) => {
  const { correo, contraseña } = req.body;
  if (!correo || !contraseña) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos' });
  }

  const user = db.prepare('SELECT * FROM usuarios WHERE correo = ?').get(correo);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const ok = comparePassword(contraseña, user.contraseña);
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

  if (user.estado !== 'activo') {
    return res.status(403).json({ error: 'Usuario inactivo' });
  }

  // Al panel solo entra el personal (admin o entrenador).
  if (!['admin', 'entrenador', 'cajero'].includes(user.rol)) {
    return res.status(403).json({ error: 'Esta cuenta no tiene acceso al panel' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, nombre_completo: user.nombre_completo, correo: user.correo, rol: user.rol, codigo: codigoDe(user.id) }
  });
});

// Quién soy (para revalidar sesión al recargar el panel)
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ ...req.user, codigo: codigoDe(req.user.id) });
});

// ---------- LECTURA PÚBLICA (para pintar la landing) ----------
// Sin login: solo lectura, y solo de lo que tiene sentido mostrar en la
// página pública. Van antes del "app.use('/api', requireAuth, ...)" para
// que no les aplique esa protección.
app.get('/api/public/membresias', (req, res) => {
  try {
    const rows = db
      .prepare(
        "SELECT id, nombre, precio, duracion_dias, beneficios, imagen FROM membresias WHERE estado = 'activa' ORDER BY precio ASC"
      )
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public/clases', (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT c.id, c.nombre, c.horario, c.cupos, c.imagen, e.especialidad AS entrenador
         FROM clases c
         LEFT JOIN entrenadores e ON e.id = c.entrenador_id
         ORDER BY c.id ASC`
      )
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public/entrenadores', (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT e.id, e.especialidad, e.experiencia, e.foto,
                u.nombre_completo AS nombre
         FROM entrenadores e
         LEFT JOIN usuarios u ON u.id = e.usuario_id
         ORDER BY e.id ASC`
      )
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public/instalaciones', (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, nombre, descripcion, imagen
         FROM instalaciones
         ORDER BY orden ASC, id ASC`
      )
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historias reales: solo los mensajes que el admin marcó para mostrarse en
// la página desde el panel (sección Mensajes de contacto).
app.get('/api/public/testimonios', (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT nombre, mensaje, calificacion
         FROM mensajes_contacto
         WHERE destacado = 1
         ORDER BY id DESC
         LIMIT 12`
      )
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Contenido del sitio (hero, contacto, redes): lo lee la landing sin login.
app.get('/api/public/contenido', (req, res) => {
  try {
    const out = {};
    db.prepare('SELECT clave, valor FROM contenido_sitio').all().forEach(r => { out[r.clave] = r.valor; });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// QR de pago: el más reciente que subió el admin (tabla imagen_qr). Lo usa la
// ventana "Pagar por QR" de la página.
app.get('/api/public/qr', (req, res) => {
  try {
    const fila = db.prepare('SELECT id, imagen, fecha FROM imagen_qr ORDER BY id DESC LIMIT 1').get();
    res.json(fila || { imagen: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login por código de correo y búsqueda de música (sin sesión).
app.use('/api/public', cliente.publico);

// Rutas del cliente con sesión (perfil, membresía, reservas, playlist, mensajes).
// Van antes del "app.use('/api', requireAuth, requireAdmin, ...)" de abajo.
app.use('/api/cliente', cliente.privado);

// ---------- API protegida (todo lo del panel admin) ----------
// Entran admin y entrenador; routes.js limita qué puede hacer cada rol.
app.use('/api', requireAuth, requireStaff, apiRoutes);

// ---------- Archivos estáticos ----------
app.use('/css', express.static(path.join(__dirname, '..', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', 'js')));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'html', 'index.html'));
});
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'html', 'admin.html'));
});
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'html', 'favicon.ico'));
});

app.listen(PORT, () => {
  const { estado } = require('./mailer');
  const e = estado();
  console.log(e === 'ok'
    ? `[correo] Listo: los códigos salen desde ${process.env.SMTP_USER}`
    : e === 'sin_nodemailer'
      ? '[correo] ATENCIÓN: falta ejecutar "npm install" (nodemailer). No se enviarán códigos.'
      : '[correo] ATENCIÓN: falta configurar .env (SMTP_USER y SMTP_PASS). No se enviarán códigos.');
  console.log(`Megatlón corriendo en http://localhost:${PORT}`);
  console.log(`Panel admin:          http://localhost:${PORT}/admin.html`);
});
