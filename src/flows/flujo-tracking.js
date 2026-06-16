const { query } = require('../services/supabase');
const { guardar, eliminar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');

// Evalúa las respuestas de seguimiento y devuelve nivel de alerta 1-3.
function evaluar(respuestas) {
  const bienestar = parseInt(respuestas.bienestar);
  let nivel = 1;
  if (!isNaN(bienestar)) {
    if (bienestar <= 4) nivel = 3;
    else if (bienestar <= 6) nivel = 2;
  }
  // No tomó medicación → sube al menos a nivel 2
  if (respuestas.medicacion === '2' && nivel < 2) nivel = 2;
  return nivel;
}

async function procesarTracking(paso, mensaje, datos, telefono) {
  const { caso_id, paciente_nombre, diagnostico, medicamentos, paso_tracking } = datos;
  const pasActual = paso_tracking || 1;
  const tieneMeds = Array.isArray(medicamentos) ? medicamentos.length > 0 : false;
  const totalPreguntas = tieneMeds ? 2 : 1;

  // Guardar respuesta del paso actual
  datos.respuestas = datos.respuestas || {};
  if (pasActual === 1) datos.respuestas.bienestar = mensaje.trim();
  if (pasActual === 2) datos.respuestas.medicacion = mensaje.trim();

  // ¿Hay más preguntas?
  if (pasActual < totalPreguntas) {
    datos.paso_tracking = pasActual + 1;
    await guardar(telefono, 400, datos);

    const medsTexto = tieneMeds
      ? medicamentos.map(m => `• ${m.nombre}${m.dosis ? ` ${m.dosis}` : ''}`).join('\n')
      : '';
    return {
      respuesta: `¿Tomó sus medicamentos hoy?\n\n${medsTexto}\n\n1️⃣ Sí, los tomé todos\n2️⃣ No los tomé`,
      terminar: false
    };
  }

  // Todas las respuestas recolectadas — evaluar y registrar
  const nivel = evaluar(datos.respuestas);

  await query('POST', 'tracking_registros', {
    caso_id,
    respuestas: datos.respuestas,
    nivel_alerta: nivel
  });

  // Actualizar estado del caso si es alerta grave
  if (nivel === 3) {
    await query('PATCH', 'tracking_casos', { estado: 'alerta' }, `?id=eq.${caso_id}`);
    await alertar(`🚨 <b>ALERTA TRACKING</b>\nPaciente: ${paciente_nombre}\nDiagnóstico: ${diagnostico}\nBienestar: ${datos.respuestas.bienestar}/10${datos.respuestas.medicacion ? `\nMedicación: ${datos.respuestas.medicacion === '1' ? 'Sí' : 'No'}` : ''}`);
  }

  await eliminar(telefono);

  const msgs = {
    3: `🚨 Hemos registrado su reporte. Su bienestar (${datos.respuestas.bienestar}/10) requiere atención.\n\nEl equipo médico ha sido notificado. Si es una emergencia llame al *911*.`,
    2: `⚠️ Registramos su reporte (bienestar ${datos.respuestas.bienestar}/10). Su equipo de seguimiento estará pendiente.\n\nSi empeora, llame al *911*.`,
    1: `✅ ¡Gracias por su reporte diario! (bienestar ${datos.respuestas.bienestar}/10)\n\nTodo se ve bien. Seguiremos en contacto. 👋`
  };

  return { respuesta: msgs[nivel], terminar: true };
}

module.exports = { procesarTracking };
