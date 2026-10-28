/**
 * Envío del código de acceso por correo.
 *
 * Para que los correos lleguen de verdad hay que configurar un SMTP con
 * variables de entorno (ver README). Ejemplo con Gmail (necesita una
 * "contraseña de aplicación", no la contraseña normal):
 *
 *   SMTP_USER=tucuenta@gmail.com
 *   SMTP_PASS=xxxx xxxx xxxx xxxx
 *
 * Con otro proveedor: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y,
 * opcionalmente, SMTP_FROM y SMTP_SECURE=1.
 *
 * Si no hay SMTP configurado, el código NO se envía: se imprime en la
 * consola del servidor (útil para probar en local).
 */
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch {
  // no instalado todavía: se avisa al enviar
}

function configurado() {
  return Boolean(nodemailer && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// 'ok' | 'sin_nodemailer' | 'sin_config'
function estado() {
  if (!nodemailer) return 'sin_nodemailer';
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return 'sin_config';
  return 'ok';
}

let transporte = null;
function obtenerTransporte() {
  if (transporte) return transporte;
  const host = process.env.SMTP_HOST || (/@(gmail|googlemail)\./i.test(process.env.SMTP_USER) ? 'smtp.gmail.com' : '');
  if (!host) throw new Error('Falta SMTP_HOST en las variables de entorno.');
  const puerto = Number(process.env.SMTP_PORT || 465);
  transporte = nodemailer.createTransport({
    host,
    port: puerto,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === '1' : puerto === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporte;
}

function escapar(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Devuelve { enviado: true } si salió por SMTP, { enviado: false } si solo
 * se imprimió en consola. Lanza error si el SMTP está configurado pero falla.
 */
async function enviarCodigo(correo, nombre, codigo) {
  if (!configurado()) {
    console.log('');
    console.log('[correo] SMTP sin configurar: no se envió ningún correo.');
    console.log(`[correo] Código de acceso para ${correo}: ${codigo}`);
    console.log('');
    return { enviado: false };
  }

  const de = process.env.SMTP_FROM || `Megatlón Bolivia <${process.env.SMTP_USER}>`;
  await obtenerTransporte().sendMail({
    from: de,
    to: correo,
    subject: `Tu código de acceso Megatlón: ${codigo}`,
    text:
      `Hola ${nombre},\n\nTu código para iniciar sesión en Megatlón Bolivia es: ${codigo}\n` +
      `Vence en 10 minutos. Si no fuiste tú, ignora este mensaje.\n`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;background:#111;color:#fff;border-radius:12px">
        <h2 style="margin:0 0 8px;color:#e53935">Megatlón Bolivia</h2>
        <p>Hola <b>${escapar(nombre)}</b>, este es tu código para iniciar sesión:</p>
        <p style="font-size:34px;letter-spacing:10px;font-weight:700;margin:20px 0;text-align:center">${escapar(codigo)}</p>
        <p style="color:#aaa;font-size:13px">Vence en 10 minutos. Si no fuiste tú, ignora este mensaje.</p>
      </div>`
  });
  return { enviado: true };
}

module.exports = { enviarCodigo, configurado, estado };
