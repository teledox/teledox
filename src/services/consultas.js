const { query } = require('./supabase');

async function crear(datos) {
  const result = await query('POST', 'consultas', datos);
  return result?.[0] ?? null;
}

async function crearNotificacion(tipo, titulo, mensaje, paciente_id, consulta_id, extra = {}) {
  await query('POST', 'notificaciones', { tipo, titulo, mensaje, paciente_id, consulta_id, ...extra });
}

// Helper para mapear nivel_sintomas (1/2/3) -> categoria del panel
function nivelACategoria(nivel) {
  return nivel === 3 ? 'grave' : nivel === 2 ? 'medio' : 'leve';
}

module.exports = { crear, crearNotificacion, nivelACategoria };
