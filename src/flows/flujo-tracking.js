const { query } = require('../services/supabase');
const { eliminar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');
const { crearNotificacion } = require('../services/consultas');
const { esSi } = require('../utils/validaciones');

const LIKERT = { '1': 'Muy bien', '2': 'Bien', '3': 'Regular', '4': 'Mal', '5': 'Muy mal' };

const MAPA_CIERRE = {
  'trk_cierre_bien':    'exitoso',
  'trk_cierre_regular': 'parcial',
  'trk_cierre_mal':     'sin_mejoria',
  '1': 'exitoso',
  '2': 'parcial',
  '3': 'sin_mejoria'
};

// ── Cierre de tracking (duracion_dias cumplida, paciente responde) ────────
async function procesarCierreTracking(mensaje, datos, telefono) {
  const resultado = MAPA_CIERRE[mensaje.trim()];

  if (!resultado) {
    return {
      respuesta: 'Por favor seleccione una opción:',
      botones: [
        { id: 'trk_cierre_bien',    titulo: '😊 Me siento bien'  },
        { id: 'trk_cierre_regular', titulo: '😐 Regular'         },
        { id: 'trk_cierre_mal',     titulo: '😟 Sin mejoría'     }
      ],
      terminar: false
    };
  }

  await query('PATCH', 'tracking_casos', { estado: 'alta' }, `?id=eq.${datos.caso_id}`);

  try {
    await query('POST', 'cierres_casos', {
      tipo:              'tracking',
      resultado,
      paciente_id:       datos.paciente_id  || null,
      empresa_id:        datos.empresa_id   || null,
      tracking_caso_id:  datos.caso_id,
      duracion_dias:     datos.duracion_dias || null,
      respuesta_paciente: mensaje
    });
  } catch (e) {
    console.error('Error registrando cierre tracking:', e.message);
  }

  if (resultado === 'sin_mejoria' && datos.paciente_id) {
    await crearNotificacion(
      'seguimiento', '🔴 Cierre de tracking sin mejoría',
      `Paciente completó seguimiento (${datos.duracion_dias || '—'} días) pero reporta sin mejoría. Diagnóstico: ${datos.diagnostico || '—'}.`,
      datos.paciente_id, null,
      { origen: 'seguimiento', categoria: 'grave', etiqueta: 'CIERRE', estado_validacion: 'pendiente' }
    );
  }

  await eliminar(telefono);

  const mensajes = {
    exitoso:     '🎉 ¡Qué bueno que se siente bien! Su seguimiento ha sido registrado como *exitoso*.\n\nGracias por confiar en MediLyft. Si necesita atención futura, escríbanos *hola*. 💙',
    parcial:     '👨‍⚕️ Gracias por contarnos. Hemos registrado su estado. Su equipo médico estará al tanto.\n\nSi necesita atención, escríbanos *hola*. 💙',
    sin_mejoria: '😟 Lamentamos que no haya mejorado. Hemos alertado a su equipo médico para revisar su caso con prioridad.\n\nSi los síntomas son graves, *llame al 911* o escríbanos *hola*. 💙'
  };

  return { respuesta: mensajes[resultado], terminar: true };
}

// Bienestar Likert 1-5 → nivel de alerta 1-3 (1=Muy bien, 5=Muy mal)
function evaluar(bienestar) {
  const b = parseInt(bienestar);
  if (isNaN(b)) return 1;
  if (b >= 4) return 3;
  if (b === 3) return 2;
  return 1;
}

// ── Chequeo de bienestar (paso 400, tipo:'bienestar') ─────────────────────
async function procesarTracking(paso, mensaje, datos, telefono) {
  if (datos.tipo === 'cierre_tracking') return procesarCierreTracking(mensaje, datos, telefono);

  const { caso_id, paciente_nombre, diagnostico } = datos;

  const bienestarRaw = mensaje.trim();
  const bienestar    = parseInt(bienestarRaw);

  // Respuesta inválida: pedir de nuevo con lista interactiva
  if (isNaN(bienestar) || bienestar < 1 || bienestar > 5) {
    return {
      respuesta: 'Por favor selecciona cómo te sientes hoy:',
      lista: {
        secciones: [{ titulo: 'Bienestar de hoy', filas: [
          { id: '1', titulo: 'Muy bien', descripcion: '😊 Me siento muy bien' },
          { id: '2', titulo: 'Bien',     descripcion: '🙂 Me siento bien' },
          { id: '3', titulo: 'Regular',  descripcion: '😐 Más o menos' },
          { id: '4', titulo: 'Mal',      descripcion: '😞 Me siento mal' },
          { id: '5', titulo: 'Muy mal',  descripcion: '😢 Necesito atención' },
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
