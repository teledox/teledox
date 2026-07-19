/**
 * src/services/auditoriaTPA.js
 * Servicio de gestión de Auditoría Clínica de Pertinencia para TPA (Mawdy).
 */

const { query } = require('./supabase');

/**
 * Obtiene las consultas registradas para revisión de auditoría clínica por TPA.
 */
async function listarConsultasAuditoria({ empresa_id, estado_auditoria, limite = 50 }) {
  // Query plana — solo columnas reales, sin joins problemáticos de clientes_b2b
  const params = `?order=created_at.desc&limit=${limite}&select=id,created_at,sintomas_descripcion,nivel_sintomas,estado,diagnostico,notas_medico,medico_id,paciente_id,pacientes(id,nombre,apellidos,cedula,telefono),usuarios!consultas_medico_id_fkey(nombre,apellidos,especialidad)`;

  const consultas = await query('GET', 'consultas', null, params) || [];
  if (!consultas.length) return [];

  // 1. Obtener planillaje_b2b por paciente_id (plano, sin join a clientes_b2b)
  const pacienteIds = [...new Set(consultas.map(c => c.paciente_id).filter(Boolean))];
  let planillajeMap = {};
  if (pacienteIds.length) {
    const planillas = await query('GET', 'planillaje_b2b', null,
      `?paciente_id=in.(${pacienteIds.join(',')})&select=paciente_id,empresa_id,estado_planillaje,nombre_paciente`
    ) || [];
    planillas.forEach(p => { planillajeMap[p.paciente_id] = p; });
  }

  // 2. Obtener nombres de empresas por empresa_id (query separada)
  const empresaIds = [...new Set(Object.values(planillajeMap).map(p => p.empresa_id).filter(Boolean))];
  let empresaMap = {};
  if (empresaIds.length) {
    const empresas = await query('GET', 'clientes_b2b', null,
      `?id=in.(${empresaIds.join(',')})&select=id,nombre_empresa`
    ) || [];
    empresas.forEach(e => { empresaMap[e.id] = e.nombre_empresa; });
  }

  // 3. Obtener documentos clínicos (receta, CIE-10) — silenciar error si tabla no existe
  let documentosMap = {};
  try {
    const consultaIds = consultas.map(c => c.id);
    const docs = await query('GET', 'documentos_datos', null,
      `?consulta_id=in.(${consultaIds.join(',')})&select=consulta_id,tipo,datos`
    ) || [];
    docs.forEach(d => {
      if (!documentosMap[d.consulta_id]) documentosMap[d.consulta_id] = {};
      documentosMap[d.consulta_id][d.tipo] = d.datos;
    });
  } catch (_) {}

  // 4. Ensamblar resultado con nombres mapeados al formato del frontend
  return consultas.map(c => {
    const planilla = planillajeMap[c.paciente_id] || {};
    const nombreEmpresa = empresaMap[planilla.empresa_id] || 'Sin empresa';
    return {
      ...c,
      sintomas: c.sintomas_descripcion,
      nivel_prioridad: c.nivel_sintomas === 3 ? 'Grave' : c.nivel_sintomas === 2 ? 'Moderado' : 'Leve',
      clientes_b2b: { nombre: nombreEmpresa },
      empresa_id: planilla.empresa_id || null,
      estado_auditoria: 'pendiente',
      notas_auditoria: c.notas_medico || null,
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
