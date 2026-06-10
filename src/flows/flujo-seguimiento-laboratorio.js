const { query } = require('../services/supabase');
const { descargarMedia } = require('../services/whatsapp');
const { subirArchivo, registrarDocumento } = require('../services/documentos');
const { esSi } = require('../utils/validaciones');

// ¿El mensaje es una respuesta plausible al recordatorio de seguimiento de laboratorio?
function esRespuestaLab(mensaje) {
  return esSi(mensaje) || /^no$/i.test((mensaje || '').trim());
}

// Procesa la respuesta Sí/No al recordatorio "¿ya se realizó el examen?"
async function procesarRespuestaLab(pendiente, mensaje, telefono) {
  const r = pendiente.respuesta;
  const seguimiento = r.seguimiento_laboratorio;

  if (esSi(mensaje)) {
    await query('PATCH', 'seguimiento_laboratorio_respuestas', { respuesta: 'si' }, `?id=eq.${r.id}`);
    if (seguimiento?.id) {
      await query('PATCH', 'seguimiento_laboratorio', { activo: false, estado: 'confirmado' }, `?id=eq.${seguimiento.id}`);
    }
    return {
      respuesta: `📋 ¡Excelente! Por favor envíenos la *foto o el PDF* del resultado de su examen de laboratorio.`,
      paso: 150,
      datos: { paciente_id: r.paciente_id, consulta_id: r.consulta_id }
    };
  }

  if (/^no$/i.test(mensaje.trim())) {
    await query('PATCH', 'seguimiento_laboratorio_respuestas', { respuesta: 'no' }, `?id=eq.${r.id}`);

    if (seguimiento && !seguimiento.activo) {
      return { respuesta: `Entendido. No le seguiremos preguntando por este examen. Si lo realiza más adelante, puede enviarnos el resultado escribiendo *hola*.` };
    }
    return { respuesta: `Entendido, gracias. Le preguntaremos nuevamente más adelante.` };
  }

  return null;
}

// Recibe la foto/PDF del resultado de laboratorio (paso 150) y lo registra como documento "examen"
async function procesarSubidaExamen(paso, mensaje, datos, telefono, msg) {
  const media = msg?.image || msg?.document;

  if (mensaje !== '__media__' || !media?.id) {
    return {
      respuesta: `Por favor envíenos la *foto* o el *PDF* del resultado de su examen de laboratorio.`,
      paso: 150, datos, terminar: false
    };
  }

  try {
    const { buffer, mimeType } = await descargarMedia(media.id);
    const extension = mimeType?.includes('pdf') ? 'pdf' : (mimeType?.split('/')[1] || 'jpg');
    const path = await subirArchivo(datos.paciente_id, 'examen', buffer, extension, mimeType || 'application/octet-stream');
    await registrarDocumento(datos.paciente_id, datos.consulta_id, 'examen', path);

    return {
      respuesta: `✅ ¡Recibimos su resultado de laboratorio! Quedó registrado en su expediente.\n\nSi necesita algo más, escríbanos *hola*.`,
      paso: 0, datos: {}, terminar: true
    };
  } catch (e) {
    console.error('Error subiendo examen de laboratorio:', e.message);
    return {
      respuesta: `⚠️ Hubo un problema al recibir su archivo. Por favor intente enviarlo nuevamente.`,
      paso: 150, datos, terminar: false
    };
  }
}

module.exports = { procesarRespuestaLab, procesarSubidaExamen, esRespuestaLab };
