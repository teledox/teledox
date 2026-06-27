const { query } = require('../services/supabase');
const { alertar } = require('../services/telegram');
const { crearNotificacion } = require('../services/consultas');
const { esSi } = require('../utils/validaciones');

async function registrarCierrePrescripcion(resultado, paciente, recordatorio, respuestaPaciente) {
  try {
    await query('POST', 'cierres_casos', {
      tipo:               'prescripcion',
      resultado,
      paciente_id:        paciente.id,
      empresa_id:         paciente.cliente_b2b_id || null,
      consulta_id:        recordatorio?.consulta_id || null,
      medicamento:        recordatorio?.medicamento || null,
      respuesta_paciente: respuestaPaciente
    });
  } catch (e) {
    console.error('Error registrando cierre prescripcion:', e.message);
  }
}

async function procesarRespuestaSeguimiento(pendiente, mensaje, telefono) {
  const r = pendiente.respuesta;
  const paciente = pendiente.paciente;
  const recordatorio = r.recordatorios;

  if (recordatorio?.tipo === 'medicamento') {
    const tomo = esSi(mensaje);
    await query('PATCH', 'seguimiento_respuestas', {
      respuesta: mensaje,
      tomo_medicamento: tomo
    }, `?id=eq.${r.id}`);

    if (tomo) {
      return `✅ ¡Perfecto! Registro guardado.\n\nSiga tomando su medicamento según las indicaciones del médico. 💊\n\nSi presenta algún efecto adverso escríbanos *hola*.`;
    } else {
      await alertar(`⚠️ <b>Incumplimiento de tratamiento</b>\nPaciente: ${paciente.nombre} ${paciente.apellidos || ''}\nMedicamento: ${recordatorio.medicamento}\nTeléfono: ${telefono}`);
      return `⚠️ Recuerde que es importante seguir el tratamiento completo.\n\nIntente tomar *${recordatorio.medicamento}* lo antes posible.\n\nSi no puede tomarlo escríbanos *hola*.`;
    }
  }

  if (recordatorio?.tipo === 'fin_tratamiento') {
    await query('PATCH', 'seguimiento_respuestas', { respuesta: mensaje }, `?id=eq.${r.id}`);

    if (mensaje === '1') {
      await query('PATCH', 'seguimiento_respuestas', { se_siente_mejor: true, respuesta: 'curado' }, `?id=eq.${r.id}`);
      await alertar(`✅ <b>Tratamiento exitoso</b>\nPaciente: ${paciente.nombre} ${paciente.apellidos || ''}\nMedicamento: ${recordatorio.medicamento}`);
      await registrarCierrePrescripcion('exitoso', paciente, recordatorio, mensaje);
      return `🎉 ¡Nos alegra mucho que se sienta mejor!\n\nSu caso fue registrado como *exitoso*.\n\nEn MediLyft estamos disponibles 24/7. Si necesita atención escriba *hola*. 💙`;

    } else if (mensaje === '2') {
      await crearNotificacion(
        'seguimiento', '🔁 Paciente con síntomas persistentes',
        `${paciente.nombre} ${paciente.apellidos || ''} mejoró parcialmente pero aún presenta síntomas (medicamento: ${recordatorio.medicamento || '—'}).`,
        paciente.id, recordatorio?.consulta_id || null,
        { origen: 'seguimiento', categoria: 'medio', etiqueta: 'SEGUIMIENTO', estado_validacion: 'pendiente', seguimiento_respuesta_id: r.id }
      );
      await registrarCierrePrescripcion('parcial', paciente, recordatorio, mensaje);
      return `👨‍⚕️ Gracias por contarnos. Hemos registrado que aún presenta síntomas.\n\nUn médico revisará su caso y, si lo considera necesario, le contactaremos para agendar una *consulta de seguimiento*.\n\nSi en cualquier momento desea atención, escríbanos *hola*. 💙`;

    } else if (mensaje === '3') {
      await alertar(`🔴 <b>Sin mejoría — requiere atención</b>\nPaciente: ${paciente.nombre} ${paciente.apellidos || ''}\nMedicamento: ${recordatorio.medicamento}\nTeléfono: ${telefono}`);
      await crearNotificacion(
        'seguimiento', '🔴 Paciente sin mejoría',
        `${paciente.nombre} ${paciente.apellidos || ''} indica que NO mejoró o empeoró (medicamento: ${recordatorio.medicamento || '—'}).`,
        paciente.id, recordatorio?.consulta_id || null,
        { origen: 'seguimiento', categoria: 'grave', etiqueta: 'SEGUIMIENTO', estado_validacion: 'pendiente', seguimiento_respuesta_id: r.id }
      );
      await registrarCierrePrescripcion('sin_mejoria', paciente, recordatorio, mensaje);
      return `😟 Lamentamos que no se sienta mejor. Hemos alertado a un médico para revisar su caso con prioridad.\n\nLe contactaremos en breve. Si los síntomas son graves, *llame al 911* o escríbanos *hola*. 💙`;

    } else {
      return `Por favor responda con:\n1️⃣ Me siento mejor\n2️⃣ Mejoré pero aún tengo síntomas\n3️⃣ No mejoré o me siento peor`;
    }
  }

  if (recordatorio?.tipo === 'bienestar') {
    const nivel = parseInt(mensaje);
    if (![1, 2, 3, 4, 5].includes(nivel)) {
      return `Por favor selecciona una opción del 1 al 5 en el menú de bienestar. 💙`;
    }

    await query('PATCH', 'seguimiento_respuestas', {
      respuesta:        String(nivel),
      nivel_bienestar:  nivel
    }, `?id=eq.${r.id}`);

    const nombrePac = `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim();

    if (nivel === 4) {
      await crearNotificacion(
        'seguimiento', `💙 Bienestar bajo — ${nombrePac}`,
        `${nombrePac} reportó bienestar nivel ${nivel}/5 (Mal). Revisar.`,
        paciente.id, recordatorio?.consulta_id || null,
        { origen: 'seguimiento', categoria: 'medio', etiqueta: 'BIENESTAR', estado_validacion: 'pendiente', seguimiento_respuesta_id: r.id }
      );
    } else if (nivel === 5) {
      await alertar(`🔴 <b>Bienestar muy bajo</b>\nPaciente: ${nombrePac}\nNivel: 5/5 (Muy mal)\nTeléfono: ${telefono}`);
      await crearNotificacion(
        'seguimiento', `🔴 Bienestar crítico — ${nombrePac}`,
        `${nombrePac} reportó bienestar nivel 5/5 (Muy mal). Requiere atención prioritaria.`,
        paciente.id, recordatorio?.consulta_id || null,
        { origen: 'seguimiento', categoria: 'grave', etiqueta: 'BIENESTAR', estado_validacion: 'pendiente', seguimiento_respuesta_id: r.id }
      );
    }

    const respuestas = [
      '',
      '💙 ¡Qué bueno saberlo! Nos alegra que te sientas excelente.',
      '💙 Bien, sigue cuidándote.',
      '💙 Gracias por contarnos. Si algo cambia, escríbenos *hola*.',
      '💙 Entendido. Tu médico estará informado. Si lo necesitas escríbenos *hola*.',
      '💙 Lamentamos que te sientas así. Hemos notificado a tu médico con prioridad. Si es urgente llama al *911*.'
    ];
    return respuestas[nivel];
  }

  return null;
}

module.exports = { procesarRespuestaSeguimiento };
