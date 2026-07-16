/**
 * src/services/auditoriaTPA.js
 * Servicio de gestión de Auditoría Clínica de Pertinencia para TPA (Mawdy).
 */

const { query } = require('./supabase');

/**
 * Obtiene las consultas registradas para revisión de auditoría clínica por TPA.
 */
async function listarConsultasAuditoria({ empresa_id, estado_auditoria, limite = 50 }) {
  let params = `?order=created_at.desc&limit=${limite}&select=id,fecha,sintomas,nivel_prioridad,estado,estado_auditoria,notas_auditoria,auditado_at,created_at,pacientes(id,nombre,apellidos,cedula,telefono),usuarios!consultas_medico_id_fkey(nombre,apellidos,especialidad),clientes_b2b(id,nombre)`;

  if (empresa_id) {
    params += `&empresa_id=eq.${empresa_id}`;
  }
  if (estado_auditoria) {
    params += `&estado_auditoria=eq.${estado_auditoria}`;
  }

  const consultas = await query('GET', 'consultas', null, params) || [];

  // Enriquecer con los datos cargados de recetas/documentos (documentos_datos)
  const consultaIds = consultas.map(c => c.id);
  let documentosMap = {};
  
  if (consultaIds.length) {
    const inIds = `(${consultaIds.join(',')})`;
    const docs = await query('GET', 'documentos_datos', null, `?consulta_id=in.${inIds}&select=consulta_id,tipo,datos`) || [];
    docs.forEach(d => {
      if (!documentosMap[d.consulta_id]) documentosMap[d.consulta_id] = {};
      documentosMap[d.consulta_id][d.tipo] = d.datos;
    });
  }

  return consultas.map(c => ({
    ...c,
    documentos_clinicos: documentosMap[c.id] || {}
  }));
}

/**
 * Dictamina la pertinencia de una consulta médica por parte del auditor del TPA.
 */
async function registrarDictamenAuditoria({ consulta_id, auditor_id, estado_auditoria, notas_auditoria }) {
  if (!consulta_id || !estado_auditoria) {
    throw new Error('Faltan parámetros obligatorios (consulta_id, estado_auditoria)');
  }
  if (!['aprobado', 'observado', 'rechazado', 'pendiente'].includes(estado_auditoria)) {
    throw new Error('Estado de auditoría inválido');
  }

  const ahora = new Date().toISOString();
  const res = await query('PATCH', 'consultas', {
    estado_auditoria,
    notas_auditoria: notas_auditoria || null,
    auditor_id: auditor_id || null,
    auditado_at: ahora
  }, `?id=eq.${consulta_id}`);

  return Array.isArray(res) ? res[0] : res;
}

module.exports = {
  listarConsultasAuditoria,
  registrarDictamenAuditoria
};
