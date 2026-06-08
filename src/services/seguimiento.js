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
  // Solo recordatorios recientes (últimas 48h): un recordatorio sin responder de hace
  // días no debe secuestrar un mensaje nuevo (ej. una cédula de una consulta nueva).
  const desde = new Date(Date.now() - 48 * 3600000).toISOString();
  const data = await query('GET', 'seguimiento_respuestas', null,
    `?paciente_id=eq.${paciente_id}&respuesta=is.null&created_at=gte.${desde}&order=created_at.desc&limit=1&select=*,recordatorios(*)`
  );
  return Array.isArray(data) && data.length > 0 ? { respuesta: data[0], paciente: pacientes[0] } : null;
}

module.exports = { buscarRecordatorioActivo, buscarRespuestaPendiente };
