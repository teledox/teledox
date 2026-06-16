const { query } = require('./supabase');

async function obtener(telefono) {
  const data = await query('GET', 'sesiones_bot', null, `?telefono=eq.${encodeURIComponent(telefono)}`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

// flujo: nombre del flujo activo (ej. 'consulta', 'b2c', 'callcenter').
// Se embebe en datos como _flujo para no requerir cambio de esquema.
// Fase 2 de la migración lo usa para rutear sin rangos numéricos.
async function guardar(telefono, paso, datos, flujo = null) {
  const datosGuardar = flujo !== null ? { ...datos, _flujo: flujo } : datos;
  const existente = await obtener(telefono);
  if (existente) {
    await query('PATCH', 'sesiones_bot', { paso, datos: datosGuardar, updated_at: new Date().toISOString() }, `?telefono=eq.${encodeURIComponent(telefono)}`);
  } else {
    await query('POST', 'sesiones_bot', { telefono, paso, datos: datosGuardar });
  }
}

async function eliminar(telefono) {
  await query('DELETE', 'sesiones_bot', null, `?telefono=eq.${encodeURIComponent(telefono)}`);
}

module.exports = { obtener, guardar, eliminar };
