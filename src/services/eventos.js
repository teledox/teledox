const { query } = require('./supabase');

// Registra un evento de observabilidad del bot. NUNCA lanza: la bitácora no
// debe poder tumbar el procesamiento de un mensaje.
//
// ev = { tipo, direccion?, telefono?, wamid?, flujo?, paso?, estado?, error?, detalle? }
//   tipo: 'entrante' | 'saliente' | 'estado' | 'duplicado' | 'error'
async function registrarEvento(ev = {}) {
  try {
    await query('POST', 'bot_eventos', {
      tipo:      ev.tipo,
      direccion: ev.direccion ?? null,
      telefono:  ev.telefono ? String(ev.telefono).replace('whatsapp:', '').replace('+', '').trim() : null,
      wamid:     ev.wamid ?? null,
      flujo:     ev.flujo ?? null,
      paso:      ev.paso != null ? String(ev.paso) : null,
      estado:    ev.estado ?? null,
      error:     ev.error ? String(ev.error).slice(0, 500) : null,
      detalle:   ev.detalle ?? null,
    }, '', 'return=minimal');
  } catch (e) {
    console.error('[eventos] registrarEvento falló:', e.message);
  }
}

// Dedup idempotente de un mensaje entrante por su wamid.
// Devuelve true si es NUEVO (debe procesarse) y false si ya fue procesado
// (reintento de webhook de Meta → ignorar). Ante cualquier error de la
// bitácora devuelve true (mejor procesar de más que perder un mensaje real).
async function marcarProcesado(wamid) {
  if (!wamid) return true;
  try {
    const filas = await query('POST', 'bot_mensajes_procesados',
      { wamid }, '?on_conflict=wamid',
      'return=representation,resolution=ignore-duplicates');
    return Array.isArray(filas) && filas.length > 0;
  } catch (e) {
    console.error('[eventos] marcarProcesado falló:', e.message);
    return true;
  }
}

module.exports = { registrarEvento, marcarProcesado };
