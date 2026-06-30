const { query } = require('./supabase');
const { alertar } = require('./telegram');
const { crearNotificacion } = require('./consultas');
const { calcularScoreAdherencia } = require('../utils/calcularScoreAdherencia');

const VENTANA_DIAS = 30;

// Calcula el Health Score de adherencia de un paciente sobre los últimos 30 días
// de actividad ya registrada, guarda el resultado y escala a un médico si hace falta.
async function calcularYGuardarScorePaciente(paciente) {
  const hasta  = new Date();
  const desde  = new Date(hasta.getTime() - VENTANA_DIAS * 86400000);
  const desdeIso = desde.toISOString();

  const respuestas = await query('GET', 'seguimiento_respuestas', null,
    `?paciente_id=eq.${paciente.id}&created_at=gte.${desdeIso}&respuesta=not.is.null&select=*,recordatorios(tipo)`
  ) || [];

  // Adherencia al tratamiento: % de "sí tomé" sobre recordatorios de medicamento respondidos
  const respuestasMed = respuestas.filter(r => r.recordatorios?.tipo === 'medicamento');
  const adherenciaTratamientoPct = respuestasMed.length
    ? Math.round((respuestasMed.filter(r => r.tomo_medicamento === true).length / respuestasMed.length) * 100)
    : null;

  // Hábitos de bienestar: promedio de check-ins (1=Excelente … 5=Muy mal)
  const respuestasBienestar = respuestas.filter(r => r.tipo === 'bienestar' && r.nivel_bienestar != null);
  const bienestarProm = respuestasBienestar.length
    ? respuestasBienestar.reduce((s, r) => s + r.nivel_bienestar, 0) / respuestasBienestar.length
    : null;

  // Controles preventivos: % de exámenes de laboratorio confirmados sobre solicitados
  const labs = await query('GET', 'seguimiento_laboratorio', null,
    `?paciente_id=eq.${paciente.id}&created_at=gte.${desdeIso}`
  ) || [];
  const controlesPreventivosPct = labs.length
    ? Math.round((labs.filter(l => l.estado === 'confirmado').length / labs.length) * 100)
    : null;

  // Participación activa: % de recordatorios (de cualquier tipo) respondidos sobre enviados
  const enviados = await query('GET', 'seguimiento_respuestas', null,
    `?paciente_id=eq.${paciente.id}&created_at=gte.${desdeIso}`
  ) || [];
  const participacionActivaPct = enviados.length
    ? Math.round((enviados.filter(r => r.respuesta != null).length / enviados.length) * 100)
    : null;

  const { score, etiqueta } = calcularScoreAdherencia({
    adherenciaTratamientoPct, bienestarProm, controlesPreventivosPct, participacionActivaPct
  });

  if (score == null) return null; // sin datos suficientes en la ventana, no se guarda

  await query('POST', 'paciente_health_score', {
    paciente_id: paciente.id,
    score_calculado: score,
    etiqueta,
    adherencia_tratamiento_pct: adherenciaTratamientoPct,
    bienestar_promedio: bienestarProm != null ? Math.round(bienestarProm * 100) / 100 : null,
    controles_preventivos_pct: controlesPreventivosPct,
    participacion_activa_pct: participacionActivaPct,
    periodo_desde: desde.toISOString(),
    periodo_hasta: hasta.toISOString()
  });

  if (etiqueta === 'alerta') {
    const nombrePac = `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim();
    await crearNotificacion(
      'health_score', `🔴 Health Score bajo — ${nombrePac}`,
      `${nombrePac} tiene un Health Score de ${score}/100 en los últimos ${VENTANA_DIAS} días (adherencia, bienestar y participación en seguimiento).`,
      paciente.id, null,
      { origen: 'health_score', categoria: 'medio', etiqueta: 'HEALTH_SCORE', estado_validacion: 'pendiente' }
    );
    await alertar(`🔴 <b>Health Score bajo</b>\nPaciente: ${nombrePac}\nScore: ${score}/100\nTeléfono: ${paciente.telefono || '—'}`);
  }

  return { score, etiqueta };
}

module.exports = { calcularYGuardarScorePaciente, VENTANA_DIAS };
