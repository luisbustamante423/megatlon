/**
 * Todo lo que usa la landing con sesión de cliente:
 *
 *  - publico  (/api/public/...)  → login por código de correo y búsqueda de música
 *  - privado  (/api/cliente/...) → perfil + membresía, inscripción, reservas,
 *                                  playlist y mensajes (exige sesión de cliente)
 */
const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const { hashPassword, signTokenCliente, requireAuth } = require('./auth');
const { normalizarCarnet, MENSAJE_CARNET } = require('./carnet');
const progreso = require('./progreso');

const publico = express.Router();
const privado = express.Router();

const CODIGO_VIDA_MS = 10 * 60 * 1000; // el código vence a los 10 minutos
const CODIGO_ESPERA_MS = 45 * 1000;    // mínimo entre un envío y el siguiente
const CODIGO_MAX_INTENTOS = 5;
const CODIGO_MAX_POR_HORA = 6;
// Nombre: solo letras (con tildes/ñ), espacios, apóstrofe, punto y guion. Sin números.
const NOMBRE_RE = /^\p{L}[\p{L}\s'.\-]*$/u;
// Teléfono: solo dígitos, de 7 a 8.
function limpiarTelefono(t) {
  const crudo = String(t || '').trim();
  return /^\d{7,8}$/.test(crudo) ? crudo : null;
}
const EMAIL_RE = /^(?=[^@]*[A-Za-z])[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$/;

// ---------- utilidades ----------
// Código único del usuario (LK 1, LK 2 …), de la tabla codigos_usuario.
function codigoDe(usuarioId) {
  const f = db.prepare('SELECT codigo FROM codigos_usuario WHERE usuario_id = ?').get(usuarioId);
  return f ? f.codigo : '';
}
// "Nombre (LK 3)" para los textos de las notificaciones del panel.
function nombreCodigo(u) {
  const c = codigoDe(u.id);
  return c ? `${u.nombre_completo} (${c})` : u.nombre_completo;
}

function usuarioPublico(u) {
  return { id: u.id, nombre_completo: u.nombre_completo, correo: u.correo, rol: u.rol, codigo: codigoDe(u.id) };
}

// tipo: 'pago' | 'solicitud' | 'inicio_sesion' | 'reserva' | 'mensaje' | 'otro'
// (el panel separa las notificaciones por este tipo).
function notificarAdmins(mensaje, tipo = 'otro') {
  try {
    const admins = db.prepare("SELECT id FROM usuarios WHERE rol = 'admin' AND estado = 'activo'").all();
    const ins = db.prepare('INSERT INTO notificaciones (usuario_id, mensaje, tipo) VALUES (?, ?, ?)');
    admins.forEach(a => ins.run(a.id, mensaje, tipo));
  } catch (err) {
    console.warn('[notificaciones]', err.message);
  }
}

// Convierte lo que guarda SQLite ("2026-09-28 14:00:00" en UTC o "2026-10-30") a Date.
function aFecha(texto) {
  if (!texto) return null;
  const t = String(texto).trim();
  const d = t.length <= 10 ? new Date(`${t}T23:59:59`) : new Date(`${t.replace(' ', 'T')}Z`);
  return isNaN(d.getTime()) ? null : d;
}

function clienteDe(usuarioId) {
  let c = db.prepare('SELECT * FROM clientes WHERE usuario_id = ?').get(usuarioId);
  if (!c) {
    const info = db.prepare('INSERT INTO clientes (usuario_id) VALUES (?)').run(usuarioId);
    c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid);
  }
  return c;
}

// ============================================================
//  LOGIN POR CÓDIGO
// ============================================================
// Entrada directa (sin código): nombre + correo. Crea la cuenta si no existe.
// Una cuenta existente conserva su nombre original.
publico.post('/auth/entrar', (req, res) => {
  try {
    const nombre = String(req.body.nombre || '').trim().replace(/\s+/g, ' ');
    const correo = String(req.body.correo || '').trim().toLowerCase();
    const telefono = limpiarTelefono(req.body.telefono);
    const carnet = normalizarCarnet(req.body.carnet);
    const peso = progreso.limpiarPeso(req.body.peso);
    const altura = progreso.limpiarAltura(req.body.altura);

    if (!nombre) return res.status(400).json({ error: 'Escribe tu nombre.' });
    if (nombre.length < 2 || nombre.length > 80 || !NOMBRE_RE.test(nombre)) {
      return res.status(400).json({ error: 'El nombre solo puede tener letras (sin números ni símbolos).' });
    }
    if (!EMAIL_RE.test(correo) || correo.length > 200) {
      return res.status(400).json({ error: 'Escribe un correo válido (con letras y @, no solo números).' });
    }
    if (!telefono) {
      return res.status(400).json({ error: 'Escribe un teléfono válido: solo números, de 7 a 8 dígitos.' });
    }
    if (!carnet) return res.status(400).json({ error: MENSAJE_CARNET });
    if (peso == null) return res.status(400).json({ error: 'Escribe tu peso en kilos (entre 20 y 400, ej. 70 o 70.5).' });
    if (altura == null) return res.status(400).json({ error: 'Escribe tu altura en metros (ej. 1.75) o en centímetros (ej. 175).' });
    if (limiteIp(req.ip, 20)) return res.status(429).json({ error: 'Demasiados intentos. Espera un momento.' });

    let usuario = db.prepare('SELECT * FROM usuarios WHERE lower(correo) = ?').get(correo);
    let esNuevo = false;
    if (usuario && usuario.rol === 'admin') {
      return res.status(403).json({ error: 'Este correo no puede iniciar sesión desde aquí.' });
    }
    if (usuario) {
      if (usuario.estado !== 'activo') return res.status(403).json({ error: 'Tu cuenta está inactiva. Contacta al gimnasio.' });
      // Si la cuenta no tenía teléfono guardado, se completa; si ya tenía, no se pisa.
      if (!usuario.telefono) db.prepare('UPDATE usuarios SET telefono = ? WHERE id = ?').run(telefono, usuario.id);
      // Igual con el carnet: si la cuenta aún no lo tenía, se completa; si ya tenía, no se pisa.
      if (!usuario.carnet) db.prepare('UPDATE usuarios SET carnet = ? WHERE id = ?').run(carnet, usuario.id);
    } else {
      const info = db
        .prepare("INSERT INTO usuarios (nombre_completo, correo, telefono, carnet, contraseña, rol, estado) VALUES (?, ?, ?, ?, ?, 'cliente', 'activo')")
        .run(nombre, correo, telefono, carnet, hashPassword(crypto.randomBytes(24).toString('hex')));
      usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(Number(info.lastInsertRowid));
      esNuevo = true;
    }
    usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuario.id);
    const clienteFila = clienteDe(usuario.id);
    // Peso y altura "antes": se guardan al iniciar sesión (clientes + progreso). Si el cliente ya los tenía, no se pisan:
    // para cambiarlos usa "Mi progreso" en la página.
    progreso.inicializar(clienteFila.id, peso, altura);

    const yaRegistrado = db
      .prepare("SELECT id FROM mensajes_contacto WHERE usuario_id = ? AND mensaje LIKE 'Inició sesión%'")
      .get(usuario.id);
    if (!yaRegistrado) {
      db.prepare('INSERT INTO mensajes_contacto (nombre, correo, mensaje, usuario_id) VALUES (?, ?, ?, ?)')
        .run(usuario.nombre_completo, usuario.correo, `Inició sesión en la página por primera vez. Tel: ${usuario.telefono || telefono} · CI: ${usuario.carnet || carnet} · Peso: ${peso} kg · Altura: ${altura} m`, usuario.id);
    }
    notificarAdmins(`${nombreCodigo(usuario)} (${usuario.correo}, tel. ${usuario.telefono || telefono}) ${esNuevo ? 'se registró e ' : ''}inició sesión en la página.`, 'inicio_sesion');

    res.json({ token: signTokenCliente(usuario), user: usuarioPublico(usuario) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
//  BÚSQUEDA DE MÚSICA EN YOUTUBE (pública: escuchar no requiere sesión)
// ============================================================
const cacheBusqueda = new Map(); // consulta → { t, resultados }
const CACHE_MS = 10 * 60 * 1000;
const visitasPorIp = new Map();  // ip → [timestamps]

function limiteIp(ip, max = 30) {
  const ahora = Date.now();
  const lista = (visitasPorIp.get(ip) || []).filter(t => ahora - t < 60000);
  lista.push(ahora);
  visitasPorIp.set(ip, lista);
  return lista.length > max;
}

function idDeUrl(texto) {
  const t = String(texto || '').trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

const miniaturaDe = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

async function buscarConApiOficial(q, key) {
  const url =
    'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=6' +
    `&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`YouTube API respondió ${r.status}`);
  const data = await r.json();
  return (data.items || [])
    .filter(i => i.id && i.id.videoId)
    .map(i => ({
      video_id: i.id.videoId,
      titulo: i.snippet.title,
      canal: i.snippet.channelTitle,
      miniatura: miniaturaDe(i.id.videoId)
    }));
}

// Sin API key: se lee la página pública de resultados de YouTube.
// Es la opción "sin configurar nada", pero YouTube puede cambiar su
// formato cuando quiera; con YOUTUBE_API_KEY es más estable.
async function buscarSinClave(q) {
  const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
      Cookie: 'CONSENT=YES+1; SOCS=CAI'
    }
  });
  if (!r.ok) throw new Error(`YouTube respondió ${r.status}`);
  const html = await r.text();
  const m = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});<\/script>/);
  if (!m) throw new Error('No se pudo leer la búsqueda de YouTube.');
  const data = JSON.parse(m[1]);

  const resultados = [];
  (function recorrer(nodo) {
    if (!nodo || typeof nodo !== 'object' || resultados.length >= 6) return;
    if (nodo.videoRenderer && nodo.videoRenderer.videoId) {
      const v = nodo.videoRenderer;
      const titulo = v.title && v.title.runs ? v.title.runs.map(x => x.text).join('') : '';
      const canal = v.ownerText && v.ownerText.runs ? v.ownerText.runs[0].text : '';
      if (titulo) resultados.push({ video_id: v.videoId, titulo, canal, miniatura: miniaturaDe(v.videoId) });
      return;
    }
    (Array.isArray(nodo) ? nodo : Object.values(nodo)).forEach(recorrer);
  })(data);
  return resultados;
}

async function datosDeVideo(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`);
    if (r.ok) {
      const d = await r.json();
      return { video_id: id, titulo: d.title, canal: d.author_name, miniatura: miniaturaDe(id) };
    }
  } catch { /* sigue con datos mínimos */ }
  return { video_id: id, titulo: 'Video de YouTube', canal: '', miniatura: miniaturaDe(id) };
}

publico.get('/musica/buscar', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.status(400).json({ error: 'Escribe qué quieres escuchar.' });
    if (limiteIp(req.ip)) return res.status(429).json({ error: 'Muchas búsquedas seguidas. Espera un momento.' });

    const clave = q.toLowerCase();
    const guardado = cacheBusqueda.get(clave);
    if (guardado && Date.now() - guardado.t < CACHE_MS) return res.json(guardado.resultados);

    let resultados;
    const id = idDeUrl(q);
    if (id) {
      resultados = [await datosDeVideo(id)];
    } else if (process.env.YOUTUBE_API_KEY) {
      resultados = await buscarConApiOficial(q, process.env.YOUTUBE_API_KEY);
    } else {
      resultados = await buscarSinClave(q);
    }

    if (!resultados.length) return res.status(404).json({ error: 'No encontramos resultados. Prueba con otro nombre.' });
    cacheBusqueda.set(clave, { t: Date.now(), resultados });
    res.json(resultados);
  } catch (err) {
    console.error('[musica/buscar]', err.message);
    res.status(502).json({ error: 'No se pudo buscar en YouTube ahora. Prueba pegando el enlace del video.' });
  }
});

// ============================================================
//  RUTAS DEL CLIENTE CON SESIÓN
// ============================================================
function requireCliente(req, res, next) {
  requireAuth(req, res, () => {
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.id);
    if (!u || u.rol !== 'cliente' || u.estado !== 'activo') {
      return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    }
    req.usuario = u;
    next();
  });
}
privado.use(requireCliente);

privado.get('/perfil', (req, res) => {
  try {
    const u = req.usuario;
    const cliente = clienteDe(u.id);

    const pagos = db
      .prepare(
        `SELECT p.id, p.membresia_id, p.monto, p.estado, p.fecha_pago, p.fecha_vencimiento,
                (p.comprobante IS NOT NULL AND p.comprobante != '') AS con_comprobante,
                m.nombre AS membresia, m.duracion_dias, m.precio
         FROM pagos p LEFT JOIN membresias m ON m.id = p.membresia_id
         WHERE p.cliente_id = ? ORDER BY p.id DESC`
      )
      .all(cliente.id);

    let membresia = null;
    const ahora = Date.now();
    const ultimaPagada = pagos.find(p => p.estado === 'pagado');
    if (ultimaPagada) {
      const inicio = aFecha(ultimaPagada.fecha_pago);
      let vence = aFecha(ultimaPagada.fecha_vencimiento);
      if (!vence && inicio && ultimaPagada.duracion_dias) {
        vence = new Date(inicio.getTime() + ultimaPagada.duracion_dias * 86400000);
      }
      const dias = vence ? Math.max(0, Math.ceil((vence.getTime() - ahora) / 86400000)) : null;
      const total = ultimaPagada.duracion_dias || null;
      membresia = {
        membresia_id: ultimaPagada.membresia_id,
        nombre: ultimaPagada.membresia,
        precio: ultimaPagada.precio,
        duracion_dias: total,
        inicio: inicio ? inicio.toISOString() : null,
        vence: vence ? vence.toISOString() : null,
        dias_restantes: dias,
        vigente: vence ? vence.getTime() >= ahora : true
      };
    }

    const pendiente = pagos.find(p => p.estado === 'pendiente');
    const reservas = db
      .prepare(
        `SELECT r.id, r.fecha, c.nombre AS clase, c.horario
         FROM reservas r LEFT JOIN clases c ON c.id = r.clase_id
         WHERE r.cliente_id = ? ORDER BY r.id DESC`
      )
      .all(cliente.id);

    res.json({
      user: usuarioPublico(u),
      membresia,
      solicitud_pendiente: pendiente
        ? { membresia: pendiente.membresia, fecha: pendiente.fecha_pago, en_revision: Boolean(pendiente.con_comprobante) }
        : null,
      progreso: progreso.leer(cliente.id),
      reservas
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inscribirse a un plan o cambiar de plan: queda como pago "pendiente".
// El admin lo confirma en el panel (Pagos → estado "pagado") y ahí empieza a
// correr la membresía.
privado.post('/membresia', (req, res) => {
  try {
    const membresiaId = Number(req.body.membresia_id);
    const m = db.prepare("SELECT * FROM membresias WHERE id = ? AND estado = 'activa'").get(membresiaId);
    if (!m) return res.status(404).json({ error: 'Ese plan ya no está disponible.' });

    const cliente = clienteDe(req.usuario.id);
    const repetida = db
      .prepare("SELECT id FROM pagos WHERE cliente_id = ? AND membresia_id = ? AND estado = 'pendiente'")
      .get(cliente.id, m.id);
    if (repetida) return res.json({ ok: true, ya_solicitada: true, plan: m.nombre });

    db.prepare("INSERT INTO pagos (cliente_id, membresia_id, monto, estado) VALUES (?, ?, ?, 'pendiente')")
      .run(cliente.id, m.id, m.precio);
    notificarAdmins(`${nombreCodigo(req.usuario)} solicitó el plan ${m.nombre} (Bs ${m.precio}).`, 'solicitud');
    res.status(201).json({ ok: true, plan: m.nombre });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

privado.post('/reservas', (req, res) => {
  try {
    const claseId = Number(req.body.clase_id);
    const clase = db.prepare('SELECT * FROM clases WHERE id = ?').get(claseId);
    if (!clase) return res.status(404).json({ error: 'Esa clase ya no existe.' });

    const cliente = clienteDe(req.usuario.id);
    const repetida = db.prepare('SELECT id FROM reservas WHERE cliente_id = ? AND clase_id = ?').get(cliente.id, clase.id);
    if (repetida) return res.json({ ok: true, ya_reservada: true, clase: clase.nombre });

    db.prepare('INSERT INTO reservas (cliente_id, clase_id) VALUES (?, ?)').run(cliente.id, clase.id);
    notificarAdmins(`${nombreCodigo(req.usuario)} reservó la clase ${clase.nombre}${clase.horario ? ' (' + clase.horario + ')' : ''}.`, 'reserva');
    res.status(201).json({ ok: true, clase: clase.nombre });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Pago por QR desde la página: el cliente paga con el QR que sube el admin,
// adjunta el comprobante y aquí queda registrado como pago "pendiente" con su
// imagen. El admin lo revisa en Pagos → "Ver recibo" y lo marca como pagado.
const COMPROBANTE_MAX_BYTES = 3 * 1024 * 1024;
const COMPROBANTE_TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

function comprobanteValido(valor) {
  const m = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(valor || ''));
  if (!m) return 'Adjunta una imagen del comprobante.';
  if (!COMPROBANTE_TIPOS.includes(m[1].toLowerCase())) return 'El comprobante debe ser una imagen JPG, PNG o WEBP.';
  if (Math.floor((m[2].replace(/\s/g, '').length * 3) / 4) > COMPROBANTE_MAX_BYTES) return 'El comprobante pesa demasiado (máx. 3 MB).';
  return null;
}

privado.post('/pago-qr', (req, res) => {
  try {
    const membresiaId = Number(req.body.membresia_id);
    const m = db.prepare("SELECT * FROM membresias WHERE id = ? AND estado = 'activa'").get(membresiaId);
    if (!m) return res.status(404).json({ error: 'Ese plan ya no está disponible.' });
    const problema = comprobanteValido(req.body.comprobante);
    if (problema) return res.status(400).json({ error: problema });

    const hoy = db
      .prepare("SELECT COUNT(*) AS n FROM pagos p JOIN clientes c ON c.id = p.cliente_id WHERE c.usuario_id = ? AND p.metodo_pago = 'qr' AND p.fecha_pago > datetime('now', '-1 day')")
      .get(req.usuario.id).n;
    if (hoy >= 10) return res.status(429).json({ error: 'Enviaste muchos comprobantes hoy. Escríbenos por WhatsApp.' });

    const cliente = clienteDe(req.usuario.id);
    // Si ya había una solicitud pendiente de este plan, se completa con el comprobante (no se duplica).
    const previa = db
      .prepare("SELECT id FROM pagos WHERE cliente_id = ? AND membresia_id = ? AND estado = 'pendiente' ORDER BY id DESC")
      .get(cliente.id, m.id);
    let pagoId;
    if (previa) {
      db.prepare("UPDATE pagos SET comprobante = ?, metodo_pago = 'qr', monto = ?, fecha_pago = CURRENT_TIMESTAMP WHERE id = ?")
        .run(req.body.comprobante, m.precio, previa.id);
      pagoId = previa.id;
    } else {
      const info = db
        .prepare("INSERT INTO pagos (cliente_id, membresia_id, monto, metodo_pago, estado, comprobante) VALUES (?, ?, ?, 'qr', 'pendiente', ?)")
        .run(cliente.id, m.id, m.precio, req.body.comprobante);
      pagoId = Number(info.lastInsertRowid);
    }
    const fila = db.prepare('SELECT fecha_pago FROM pagos WHERE id = ?').get(pagoId);
    notificarAdmins(`${nombreCodigo(req.usuario)} pagó por QR el plan ${m.nombre} (Bs ${m.precio}) y envió su comprobante. Revísalo en Pagos → Ver recibo.`, 'pago');

    res.status(201).json({
      ok: true,
      recibo: {
        numero: pagoId,
        cliente: req.usuario.nombre_completo,
        codigo: codigoDe(req.usuario.id),
        carnet: req.usuario.carnet || '',
        membresia: m.nombre,
        duracion_dias: m.duracion_dias,
        monto: m.precio,
        metodo: 'QR',
        estado: 'pendiente',
        fecha: fila && aFecha(fila.fecha_pago) ? aFecha(fila.fecha_pago).toISOString() : new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Mi progreso: peso y altura, antes y después ----------
privado.get('/progreso', (req, res) => {
  res.json(progreso.leer(clienteDe(req.usuario.id).id));
});

privado.put('/progreso', (req, res) => {
  try {
    const cliente = clienteDe(req.usuario.id);
    const r = progreso.actualizar(cliente.id, req.body || {});
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ ok: true, progreso: r.progreso });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Playlist ----------
privado.get('/musica', (req, res) => {
  const filas = db
    .prepare('SELECT video_id, titulo, canal, miniatura FROM musica WHERE usuario_id = ? ORDER BY id ASC')
    .all(req.usuario.id);
  res.json(filas);
});

privado.post('/musica', (req, res) => {
  try {
    const video_id = String(req.body.video_id || '').trim();
    const titulo = String(req.body.titulo || '').trim().slice(0, 200);
    const canal = String(req.body.canal || '').trim().slice(0, 120);
    const consulta = String(req.body.consulta || '').trim().slice(0, 100);
    if (!/^[\w-]{11}$/.test(video_id)) return res.status(400).json({ error: 'Video no válido.' });
    if (!titulo) return res.status(400).json({ error: 'Falta el título de la canción.' });

    const total = db.prepare('SELECT COUNT(*) AS n FROM musica WHERE usuario_id = ?').get(req.usuario.id).n;
    if (total >= 200) return res.status(400).json({ error: 'Tu playlist está llena (máx. 200 canciones).' });

    db.prepare('INSERT OR IGNORE INTO musica (usuario_id, video_id, titulo, canal, miniatura, consulta) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.usuario.id, video_id, titulo, canal || null, miniaturaDe(video_id), consulta || null);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

privado.delete('/musica/:video_id', (req, res) => {
  db.prepare('DELETE FROM musica WHERE usuario_id = ? AND video_id = ?').run(req.usuario.id, req.params.video_id);
  res.status(204).send();
});

// ---------- Mensaje para la página ("Historias reales") ----------
// Llega al panel en Mensajes de contacto; solo se muestra en la página si
// el admin lo marca.
privado.post('/mensaje', (req, res) => {
  try {
    const mensaje = String(req.body.mensaje || '').trim();
    let calificacion = req.body.calificacion == null || req.body.calificacion === '' ? null : Number(req.body.calificacion);
    if (!mensaje) return res.status(400).json({ error: 'Escribe tu mensaje.' });
    if (mensaje.length > 600) return res.status(400).json({ error: 'El mensaje es demasiado largo (máx. 600).' });
    if (calificacion != null && !(Number.isInteger(calificacion) && calificacion >= 1 && calificacion <= 5)) calificacion = null;

    const hoy = db
      .prepare("SELECT COUNT(*) AS n FROM mensajes_contacto WHERE usuario_id = ? AND mensaje NOT LIKE 'Inició sesión%' AND fecha > datetime('now', '-1 day')")
      .get(req.usuario.id).n;
    if (hoy >= 3) return res.status(429).json({ error: 'Ya enviaste varios mensajes hoy. Vuelve mañana.' });

    db.prepare('INSERT INTO mensajes_contacto (nombre, correo, mensaje, calificacion, usuario_id) VALUES (?, ?, ?, ?, ?)')
      .run(req.usuario.nombre_completo, req.usuario.correo, mensaje, calificacion, req.usuario.id);
    notificarAdmins(`${nombreCodigo(req.usuario)} dejó un mensaje nuevo.`, 'mensaje');
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { publico, privado };
