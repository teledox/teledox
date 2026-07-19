/**
 * src/services/auditoriaTPA.js
 * Servicio de gestión de Auditoría Clínica de Pertinencia para TPA (Mawdy).
 */

const { query } = require('./supabase');

/**
 * Obtiene las consultas registradas para revisión de auditoría clínica por TPA.
 */
async function listarConsultasAuditoria({ empresa_id, estado_auditoria, limite = 50 }) {
  // Usar columnas reales de la tabla consultas (sin clientes_b2b FK que no existe)
  let params = `?order=created_at.desc&limit=${limite}&select=id,created_at,sintomas_descripcion,nivel_sintomas,estado,diagnostico,notas_medico,medico_id,paciente_id,pacientes(id,nombre,apellidos,cedula,telefono),usuarios!consultas_medico_id_fkey(nombre,apellidos,especialidad)`;

  const consultas = await query('GET', 'consultas', null, params) || [];

  if (!consultas.length) return [];

  // Obtener planillaje_b2b para vincular empresa y estado de auditoría
  const consultaIds = consultas.map(c => c.id);
  let planillajeMap = {};
  let documentosMap = {};

  // Buscar planillaje por paciente_id (enlace entre consulta y empresa)
  const pacienteIds = [...new Set(consultas.map(c => c.paciente_id).filter(Boolean))];
  if (pacienteIds.length) {
    const inPacientes = `(${pacienteIds.join(',')})`;  
    const planillas = await query('GET', 'planillaje_b2b', null,
      `?paciente_id=in.${inPacientes}&select=paciente_id,empresa_id,estado_planillaje,nombre_paciente,clientes_b2b(id,nombre_empresa)`) || [];
    planillas.forEach(p => { planillajeMap[p.paciente_id] = p; });
  }

  // Buscar documentos clínicos (receta, CIE-10) si la tabla existe
  try {
    const inIds = `(${consultaIds.join(',')})`;  
    const docs = await query('GET', 'documentos_datos', null,
      `?consulta_id=in.${inIds}&select=consulta_id,tipo,datos`) || [];
    docs.forEach(d => {
      if (!documentosMap[d.consulta_id]) documentosMap[d.consulta_id] = {};
      documentosMap[d.consulta_id][d.tipo] = d.datos;
    });
  } catch (_) { /* tabla puede no existir */ }

  return consultas.map(c => {
    const planilla = planillajeMap[c.paciente_id] || {};
    return {
      ...c,
      // Mapear nombres de columnas al formato esperado por el frontend
      sintomas: c.sintomas_descripcion,
      nivel_prioridad: c.nivel_sintomas === 3 ? 'Grave' : c.nivel_sintomas === 2 ? 'Moderado' : 'Leve',
      // Datos de empresa desde planillaje
      clientes_b2b: planilla.clientes_b2b || { nombre: 'Sin empresa' },
      empresa_id: planilla.empresa_id || null,
      // Estado de auditoría desde planillaje (pendiente si no está dictaminado)
      estado_auditoria: planilla.estado_planillaje === 'auditado' ? 'aprobado' : (estado_auditoria || 'pendiente'),
      notas_auditoria: null,
      auditado_at: null,
      documentos_clinicos: documentosMap[c.id] || {}
    };
  });
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

  // Registrar el dictamen en notas_medico (columna real) + diagnostico
  // ya que estado_auditoria/auditado_at no existen en el schema actual
  const ahora = new Date().toISOString();
  const notaAuditoria = `[AUDITORÍA ${ahora.slice(0,10)}] Estado: ${estado_auditoria.toUpperCase()}. ${notas_auditoria ? 'Notas: ' + notas_auditoria : ''}`;

  const res = await query('PATCH', 'consultas', {
    notas_medico: notaAuditoria
  }, `?id=eq.${consulta_id}`);

  return { ok: true, estado_auditoria, consulta_id };
}

module.exports = {
  listarConsultasAuditoria,
  registrarDictamenAuditoria
};
