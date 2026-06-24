// Convierte cualquier formato de teléfono a la forma canónica que WhatsApp entrega
// en msg.from: dígitos puros, código de país incluido (ej. 593991234567).
// Regla Ecuador: si empieza en '0' reemplaza por '593'.
// Devuelve null si el número es claramente inválido (< 7 dígitos).
function normalizePhone(tel) {
  const digits = String(tel || '').replace(/\D/g, '');
  if (!digits || digits.length < 7) return null;
  return digits.startsWith('0') ? '593' + digits.slice(1) : digits;
}

module.exports = { normalizePhone };
