const { query } = require('../services/supabase');
const { eliminar } = require('../services/sesiones');
const { calcularScore } = require('../utils/calcularScore');

const ETIQUETA_COLOR = { controlado: '✅', en_riesgo: '⚠️', alerta: '🚨' };

function parsarPresion(texto) {
  const m = texto.trim().match(/^(\d{2,3})\s*[\/\-]\s*(\d{2,3})$/);
  if (!m) return null;
  return { sistolica: parseInt(m[1]), diastolica: parseInt(m[2]) };
}

function esNoMedi(texto) {
  return /^(no\s+med[ií]|no\s+pude|no\s+s[eé]|ns|-)$/i.test(texto.trim());
}

async function procesarBiometricos(paso, mensaje, datos, telefono) {
  const txt = mensaje.trim();

  if (paso === 419) {
    // Altura — solo se pregunta una vez; queda guardada en tracking_casos
    const h = parseInt(txt.replace(/[^\d]/g, ''));
    if (isNaN(h) || h < 100 || h > 220) {
      return {
        respuesta: `⚠️ No entendí el valor. Escribe tu altura en centímetros (ej: *170*).\n\nSi no la sabes con exactitud, una aproximación está bien.`,
        paso: 419, datos, terminar: false
      };
    }
    datos.altura = h;
    await query('PATCH', 'tracking_casos', { altura_cm: h }, `?id=eq.${datos.caso_id}`);
    return {
      respuesta: `✅ Altura registrada (${h} cm) — no te la volveré a preguntar.\n\n` +
        `📊 *Registro biométrico*\n\n¿Pudiste medir tu *presión arterial* hoy?\n\n` +
        `Escríbela así: *120/80* (sistólica/diastólica)\nSi no pudiste, responde *no medí*.`,
      paso: 420, datos, terminar: false
    };
  }

  if (paso === 420) {
    if (esNoMedi(txt)) {
      datos.sistolica  = null;
      datos.diastolica = null;
    } else {
      const p = parsarPresion(txt);
      if (!p) {
        return {
          respuesta: `⚠️ No entendí el formato. Escríbelo así: *120/80* (sistólica/diastólica).\n\nSi no pudiste medirla, responde *no medí*.`,
          paso: 420, datos, terminar: false
        };
      }
      datos.sistolica  = p.sistolica;
      datos.diastolica = p.diastolica;
    }
    return {
      respuesta: `💉 *Glucosa*\n\n¿Mediste tu glucosa hoy?\n\nEscribe el valor en mg/dL (ej: *98*).\nSi no la mediste, responde *no medí*.`,
      paso: 421, datos, terminar: false
    };

  } else if (paso === 421) {
    if (esNoMedi(txt)) {
      datos.glucosa = null;
    } else {
      const g = parseInt(txt.replace(/[^\d]/g, ''));
      if (isNaN(g) || g < 40 || g > 600) {
        return {
          respuesta: `⚠️ No entendí el valor. Escribe solo el número en mg/dL (ej: *98*).\n\nSi no la mediste, responde *no medí*.`,
          paso: 421, datos, terminar: false
        };
      }
      datos.glucosa = g;
    }
    return {
      respuesta: `⚖️ *Peso*\n\n¿Cuánto pesaste hoy?\n\nEscribe el valor en kg (ej: *72.5*).\nSi no te pesaste, responde *no medí*.`,
      paso: 422, datos, terminar: false
    };

  } else if (paso === 422) {
    if (esNoMedi(txt)) {
      datos.peso = null;
    } else {
      const p = parseFloat(txt.replace(',', '.'));
      if (isNaN(p) || p < 20 || p > 350) {
        return {
          respuesta: `⚠️ No entendí el valor. Escribe solo el número en kg (ej: *72.5*).\n\nSi no te pesaste, responde *no medí*.`,
          paso: 422, datos, terminar: false
        };
      }
      datos.peso = p;
    }

    const { score, etiqueta } = calcularScore({
      bienestar:  datos.bienestar  ?? null,
      sistolica:  datos.sistolica  ?? null,
      diastolica: datos.diastolica ?? null,
      glucosa:    datos.glucosa    ?? null,
      peso:       datos.peso       ?? null,
      altura:     datos.altura     ?? null,
    });

    // Guardar registro biométrico
    await query('POST', 'tracking_biometricos', {
      caso_id:            datos.caso_id,
      presion_sistolica:  datos.sistolica  ?? null,
      presion_diastolica: datos.diastolica ?? null,
      glucosa:            datos.glucosa    ?? null,
      peso:               datos.peso       ?? null,
      score_calculado:    score,
      etiqueta
    });

    // Alerta directa al panel — actualizar estado del caso
    if (etiqueta === 'alerta') {
      await query('PATCH', 'tracking_casos', { estado: 'alerta' }, `?id=eq.${datos.caso_id}`);
    }

    await eliminar(telefono);

    const mensajes = {
      controlado: `✅ *¡Tus biométricos se ven bien!*\n\nScore de salud: *${score}/100*\nEstado: *Controlado*\n\nSigue así. Tu equipo médico revisará tus datos. 💙`,
      en_riesgo:  `⚠️ *Algunos valores merecen atención.*\n\nScore de salud: *${score}/100*\nEstado: *En riesgo*\n\nTe recomendamos hablar con tu médico próximamente.`,
      alerta:     `🚨 *Se detectaron valores que requieren atención.*\n\nScore de salud: *${score}/100*\nEstado: *Alerta*\n\nTu equipo médico ha sido notificado. Si tienes síntomas graves, llama al *911*.`,
    };

    return {
      respuesta: mensajes[etiqueta] || mensajes.en_riesgo,
      terminar: true
    };
  }

  // Paso desconocido
  await eliminar(telefono);
  return { respuesta: `Algo salió mal. Escribe *hola* para empezar de nuevo.`, terminar: true };
}

module.exports = { procesarBiometricos };
