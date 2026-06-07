const { query } = require('./supabase');

async function buscarCedulaB2B(cedula) {
  const data = await query(
    'GET', 'empleados_b2b', null,
    `?cedula=eq.${cedula}&select=*,clientes_b2b(id,nombre_empresa,nombre_seguro)&limit=1`
  );
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function cargarCedulasB2B(empresaId, cedulas) {
  // Upsert masivo — ignora duplicados por (empresa_id, cedula)
  const rows = cedulas.map(c => ({ empresa_id: empresaId, cedula: String(c).trim() }));
  return await query('POST', 'empleados_b2b', rows, '?on_conflict=empresa_id,cedula');
}

module.exports = { buscarCedulaB2B, cargarCedulasB2B };
