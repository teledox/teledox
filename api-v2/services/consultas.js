const { query } = require('./supabase');

async function crear(datos) {
  const result = await query('POST', 'consultas', datos);
  return result?.[0] ?? null;
}

async function crearNotificacion(tipo, titulo, mensaje, paciente_id, consulta_id) {
  await query('POST', 'notificaciones', { tipo, titulo, mensaje, paciente_id, consulta_id });
}

module.exports = { crear, crearNotificacion };
