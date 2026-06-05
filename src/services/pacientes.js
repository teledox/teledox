const { query } = require('./supabase');

async function buscarPorCedula(cedula) {
  const data = await query('GET', 'pacientes', null, `?cedula=eq.${cedula}&select=*,clientes_b2b(*)`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function actualizar(cedula, datos) {
  await query('PATCH', 'pacientes', datos, `?cedula=eq.${cedula}`);
}

async function crear(datos) {
  const result = await query('POST', 'pacientes', datos);
  return result?.[0] ?? null;
}

module.exports = { buscarPorCedula, actualizar, crear };
