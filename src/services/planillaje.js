const { query } = require('./supabase');

// Registra un registro de planillaje B2B para facturación a la empresa.
// `datos` puede venir del flujo de consulta normal (nombreCompleto, cedula, sintomas, nivel)
// o del flujo call center (cc_nombre, cc_cedula, cc_sintomas, cc_nivel).
async function registrarPlanillajeB2B(datos, consultaId) {
  const ahora = new Date();
  const body = {
    paciente_id: datos.paciente_id || datos.cc_paciente_id || null,
    empresa_id: datos.empresa_id || datos.cc_empresa_id || null,
    nombre_paciente: datos.nombreCompleto || datos.nombre_paciente || datos.cc_nombre || '',
    cedula_paciente: datos.cedula || datos.cc_cedula || '',
    fecha_consulta: ahora.toISOString(),
    sintomas: datos.sintomas || datos.cc_sintomas || '',
    nivel_sintomas: datos.nivel || datos.cc_nivel || 1,
    estado_planillaje: 'pendiente',
    mes: ahora.getMonth() + 1,
    anio: ahora.getFullYear()
  };
  await query('POST', 'planillaje_b2b', body);
}

module.exports = { registrarPlanillajeB2B };
