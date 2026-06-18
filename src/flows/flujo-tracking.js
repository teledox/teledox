const { query } = require('../services/supabase');
const { eliminar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');
const { esSi } = require('../utils/validaciones');

const LIKERT = { '1': 'Muy mal', '2': 'Mal', '3': 'Regular', '4': 'Bien', '5': 'Muy bien' };

// Bienestar Likert 1-5 → nivel de alerta 1-3
function evaluar(bienestar) {
  const b = parseInt(bienestar);
  if (isNaN(b)) return 1;
  if (b <= 2) return 3;
  if (b === 3) return 2;
  return 1;
}

// ── Chequeo de bienestar (paso 400, tipo:'bienestar') ─────────────────────
async function procesarTracking(paso, mensaje, datos, telefono) {
  const { caso_id, paciente_nombre, diagnostico } = datos;

  const bienestarRaw = mensaje.trim();
  const bienestar    = parseInt(bienestarRaw);

  // Respuesta inválida: pedir de nuevo con lista interactiva
  if (isNaN(bienestar) || bienestar < 1 || bienestar > 5) {
    return {
      respuesta: 'Por favor selecciona cómo te sientes hoy:',
      lista: {
        secciones: [{ titulo: 'Bienestar de hoy', filas: [
          { id: '1', titulo: 'Muy mal',  descripcion: '😢 Me siento muy mal' },
          { id: '2', titulo: 'Mal',      descripcion: '😞 Me siento mal' },
          { id: '3', titulo: 'Regular',  descripcion: '😐 Más o menos' },
          { id: '4', titulo: 'Bien',     descripcion: '🙂 Me siento bien' },
          { id: '5', titulo: 'Muy bien', descripcion: '😊 Excelente!' },
        ]}],
        botonTexto: 'Seleccionar'
      },
      terminar: false
    };
  }

  const nivel = evaluar(bienestarRaw);

  await query('POST', 'tracking_registros', {
    caso_id,
    respuestas: { tipo: 'bienestar', bienestar: bienestarRaw },
    nivel_alerta: nivel
  });

  // Actualizar flag bienestar_alto: true si los últimos 2 registros son nivel 1
  if (nivel === 1) {
    const ultimos2 = await query('GET', 'tracking_registros', null,
      `?caso_id=eq.${caso_id}&order=created_at.desc&limit=2`);
    const dosBien = (ultimos2 || []).length >= 2 && (ultimos2 || []).every(r => r.nivel_alerta === 1);
    if (dosBien) await query('PATCH', 'tracking_casos', { bienestar_alto: true }, `?id=eq.${caso_id}`);
  } else {
    await query('PATCH', 'tracking_casos', { bienestar_alto: false }, `?id=eq.${caso_id}`);
  }

  if (nivel === 3) {
    await query('PATCH', 'tracking_casos', { estado: 'alerta' }, `?id=eq.${caso_id}`);
    await alertar(`🚨 <b>ALERTA TRACKING</b>\nPaciente: ${paciente_nombre || telefono}\nDiagnóstico: ${diagnostico}\nBienestar: ${LIKERT[bienestarRaw] || bienestarRaw}`);
  }

  await eliminar(telefono);

  const bLabel = LIKERT[bienestarRaw] || bienestarRaw;
  const msgs = {
    3: `🚨 Hemos registrado su reporte (*${bLabel}*). El equipo médico ha sido notificado.\n\nSi es una emergencia llame al *911*.`,
    2: `⚠️ Registramos su reporte (*${bLabel}*). Su equipo de seguimiento estará pendiente.\n\nSi empeora, llame al *911*.`,
    1: `✅ ¡Gracias por su reporte diario! (*${bLabel}*)\n\nTodo se ve bien. Seguiremos en contacto. 👋`
  };

  return { respuesta: msgs[nivel], terminar: true };
}

// ── Recordatorio de medicación (paso 400, tipo:'med_reminder') ────────────
async function procesarRespuestaMed(mensaje, datos, telefono) {
  const { caso_id, medicamentos_ahora } = datos;
  const m    = mensaje.trim();
  const tomo = esSi(m) ? true : /^(no|2)$/i.test(m) ? false : null;

  // Respuesta no reconocida: pedir de nuevo con botones
  if (tomo === null) {
    return {
      respuesta: '¿Ya tomó su medicación?',
      botones: [
        { id: '1', titulo: '✅ Sí, ya tomé' },
        { id: '2', titulo: '❌ No todavía' }
      ],
      terminar: false
    };
  }

  await query('POST', 'tracking_registros', {
    caso_id,
    respuestas: {
      tipo: 'medicacion',
      medicamentos: (medicamentos_ahora || []).map(x => x.nombre),
      tomado: tomo
    },
    nivel_alerta: tomo ? 1 : 2
  });

  await eliminar(telefono);

  return {
    respuesta: tomo
      ? `✅ ¡Perfecto! Registramos que tomó sus medicamentos. 👍`
      : `⚠️ Recuerde tomarlos cuando pueda. Si tiene dudas, consulte con su médico.`,
    terminar: true
  };
}

module.exports = { procesarTracking, procesarRespuestaMed };
