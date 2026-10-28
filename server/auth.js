const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// En producción, define JWT_SECRET como variable de entorno real.
// Este valor por defecto es solo para desarrollo local.
const JWT_SECRET = process.env.JWT_SECRET || 'megatlon-dev-secret-cambiar-en-produccion';
const TOKEN_EXPIRY = '8h';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function comparePassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, correo: user.correo, rol: user.rol, nombre_completo: user.nombre_completo },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// Sesión de cliente de la landing: dura más que la del panel.
function signTokenCliente(user) {
  return jwt.sign(
    { id: user.id, correo: user.correo, rol: user.rol, nombre_completo: user.nombre_completo },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Requiere rol admin' });
  }
  next();
}

const ROLES_PERSONAL = ['admin', 'entrenador', 'cajero'];

// Personal del panel: admin, entrenador y cajero. Los clientes no entran.
// Lo que puede hacer cada rol dentro del panel se define en routes.js.
function requireStaff(req, res, next) {
  if (!req.user || !ROLES_PERSONAL.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No tienes acceso al panel' });
  }
  next();
}

module.exports = { hashPassword, comparePassword, signToken, signTokenCliente, requireAuth, requireAdmin, requireStaff, ROLES_PERSONAL };
