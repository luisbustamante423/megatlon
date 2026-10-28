/**
 * Carnet de identidad (CI) de Bolivia.
 * Solo acepta NÚMEROS: de 5 a 10 dígitos (sin letras, guiones ni complemento).
 *   1234567  ✔      1234567-1A  ✘      1234567LP  ✘
 * Se quitan los espacios antes de revisar, así "123 4567" también pasa.
 */
const CARNET_RE = /^\d{5,10}$/;

function normalizarCarnet(texto) {
  const t = String(texto == null ? '' : texto).replace(/\s+/g, '');
  return CARNET_RE.test(t) ? t : null;
}

const MENSAJE_CARNET = 'El carnet de identidad solo acepta números (de 5 a 10 dígitos, ej. 1234567).';

module.exports = { normalizarCarnet, MENSAJE_CARNET };
