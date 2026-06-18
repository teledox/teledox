const { query } = require('../services/supabase');

// paso 500: se mostró el menú "¿pregunta o nueva consulta?" — esperando elección
// paso 501: paciente eligió "tengo una pregunta" — esperando el texto de la pregunta

async function procesarPreguntaConsulta(paso, mensaje, datos, telefono) {
  if (paso === 500) {
    const m = mensaje.trim().toLowerCase();

    if (mensaje === 'pq_nueva' || m.includes('nueva consulta')) {
      return { respuesta: '', paso: 0, datos, terminar: true, _iniciarConsulta: true };
    }

    if (mensaje === 'pq_pregunta' || m.includes('pregunta')) {
      return {
        respuesta: 'Por favor, escríbanos su pregunta para el médico:',
        paso: 501, datos, terminar: false
      };
    }

    return {
      respuesta: 'Por favor seleccione una de las dos opciones.',
      paso: 500, datos, terminar: false,
      botones: [
        { id: 'pq_pregunta', titulo: '❓ Tengo una pregunta' },
        { id: 'pq_nueva',    titulo: '🏥 Nueva consulta'    }
      ]
    };
  }

  if (paso === 501) {
    await query('POST', 'mensajes_consulta', {
      consulta_id: datos.consulta_id,
      paciente_id: datos.paciente_id,
      tipo: 'pregunta_paciente',
      contenido: mensaje
    });

    return {
      respuesta: '✅ Su pregunta fue enviada al médico.\n\nLe responderemos por este mismo WhatsApp en cuanto el médico la atienda.',
      paso: 0, datos, terminar: true
    };
  }

  return { respuesta: 'Para iniciar escribe *hola*. 👋', paso: 0, datos, terminar: true };
}

module.exports = { procesarPreguntaConsulta };
