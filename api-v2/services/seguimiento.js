const { query } = require('./supabase');

async function buscarRecordatorioActivo(telefono) {
  const data = await query('GET', 'recordatorios', null,
    `?telefono=eq.${encodeURIComponent(telefono)}&activo=eq.true&order=fecha_proximo.asc&limit=1`
  );
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function buscarRespuestaPendiente(telefono) {
  const telefonoLimpio = telefono.replace('whatsapp:', '');
  const pacientes = await query('GET', 'pacientes', null, `?telefono=eq.${telefonoLimpio}`);
  if (!pacientes || pacientes.length === 0) return null;

  const paciente_id = pacientes[0].id;
  const data = await query('GET', 'seguimiento_respuestas', null,
    `?paciente_id=eq.${paciente_id}&respuesta=is.null&order=created_at.desc&limit=1&select=*,recordatorios(*)`
  );
  return Array.isArray(data) && data.length > 0 ? { respuesta: data[0], paciente: pacientes[0] } : null;
}

module.exports = { buscarRecordatorioActivo, buscarRespuestaPendiente };
