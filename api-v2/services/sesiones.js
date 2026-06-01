const { query } = require('./supabase');

async function obtener(telefono) {
  const data = await query('GET', 'sesiones_bot', null, `?telefono=eq.${encodeURIComponent(telefono)}`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function guardar(telefono, paso, datos) {
  const existente = await obtener(telefono);
  if (existente) {
    await query('PATCH', 'sesiones_bot', { paso, datos, updated_at: new Date().toISOString() }, `?telefono=eq.${encodeURIComponent(telefono)}`);
  } else {
    await query('POST', 'sesiones_bot', { telefono, paso, datos });
  }
}

async function eliminar(telefono) {
  await query('DELETE', 'sesiones_bot', null, `?telefono=eq.${encodeURIComponent(telefono)}`);
}

module.exports = { obtener, guardar, eliminar };
