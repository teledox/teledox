const { query } = require('./supabase');

async function buscarPorCedula(cedula) {
  const data = await query('GET', 'pacientes', null, `?cedula=eq.${cedula}&select=*,clientes_b2b(*)`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function actualizar(cedula, datos) {
  await query('PATCH', 'pacientes', datos, `?cedula=eq.${cedula}`);
}

module.exports = { buscarPorCedula, actualizar };
