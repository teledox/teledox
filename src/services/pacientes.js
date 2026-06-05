const { query } = require('./supabase');

async function buscarPorCedula(cedula) {
  const data = await query('GET', 'pacientes', null, `?cedula=eq.${cedula}&select=*,clientes_b2b(*)`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function actualizar(cedula, datos) {
  await query('PATCH', 'pacientes', datos, `?cedula=eq.${cedula}`);
}

async function crear(datos) {
  await query('POST', 'pacientes', datos);
  // PGRST204 bloquea return=representation en algunas configs RLS
  // Hacemos GET inmediato por cédula para obtener el ID
  const result = await query('GET', 'pacientes', null, `?cedula=eq.${datos.cedula}&order=created_at.desc&limit=1`);
  return result?.[0] ?? null;
}

module.exports = { buscarPorCedula, actualizar, crear };
