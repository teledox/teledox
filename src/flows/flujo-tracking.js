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

  // Respuesta inválida: pedir de nuevo (sesión permanece activa)
  if (isNaN(bienestar) || bienestar < 1 || bienestar > 5) {
    return {
      respuesta: 'Por favor responda del *1 al 5*:\n\n1️⃣ Muy mal\n2️⃣ Mal\n3️⃣ Regular\n4️⃣ Bien\n5️⃣ Muy bien',
      terminar: false
    };
  }

  const nivel = evaluar(bienestarRaw);

  await query('POST', 'tracking_registros', {
    caso_id,
    respuestas: { tipo: 'bienestar', bienestar: bienestarRaw },
    nivel_alerta: nivel
  });

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

  // Respuesta no reconocida: pedir de nuevo (sesión permanece activa)
  if (tomo === null) {
    return {
      respuesta: 'Por favor responda:\n\n1️⃣ Sí, ya los tomé\n2️⃣ No los tomé todavía',
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
