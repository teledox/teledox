const { query } = require('../services/supabase');
const { alertar } = require('../services/telegram');
const { crearNotificacion } = require('../services/consultas');
const { esSi } = require('../utils/validaciones');

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
      return `🎉 ¡Nos alegra mucho que se sienta mejor!\n\nSu caso fue registrado como *exitoso*.\n\nEn MediLyft estamos disponibles 24/7. Si necesita atención escriba *hola*. 💙`;

    } else if (mensaje === '2') {
      await crearNotificacion(
        'seguimiento', '🔁 Paciente con síntomas persistentes',
        `${paciente.nombre} ${paciente.apellidos || ''} mejoró parcialmente pero aún presenta síntomas (medicamento: ${recordatorio.medicamento || '—'}).`,
        paciente.id, recordatorio?.consulta_id || null,
        { origen: 'seguimiento', categoria: 'medio', etiqueta: 'SEGUIMIENTO', estado_validacion: 'pendiente', seguimiento_respuesta_id: r.id }
      );
      return `👨‍⚕️ Gracias por contarnos. Hemos registrado que aún presenta síntomas.\n\nUn médico revisará su caso y, si lo considera necesario, le contactaremos para agendar una *consulta de seguimiento*.\n\nSi en cualquier momento desea atención, escríbanos *hola*. 💙`;

    } else if (mensaje === '3') {
      await alertar(`🔴 <b>Sin mejoría — requiere atención</b>\nPaciente: ${paciente.nombre} ${paciente.apellidos || ''}\nMedicamento: ${recordatorio.medicamento}\nTeléfono: ${telefono}`);
      await crearNotificacion(
        'seguimiento', '🔴 Paciente sin mejoría',
        `${paciente.nombre} ${paciente.apellidos || ''} indica que NO mejoró o empeoró (medicamento: ${recordatorio.medicamento || '—'}).`,
        paciente.id, recordatorio?.consulta_id || null,
        { origen: 'seguimiento', categoria: 'grave', etiqueta: 'SEGUIMIENTO', estado_validacion: 'pendiente', seguimiento_respuesta_id: r.id }
      );
      return `😟 Lamentamos que no se sienta mejor. Hemos alertado a un médico para revisar su caso con prioridad.\n\nLe contactaremos en breve. Si los síntomas son graves, *llame al 911* o escríbanos *hola*. 💙`;

    } else {
      return `Por favor responda con:\n1️⃣ Me siento mejor\n2️⃣ Mejoré pero aún tengo síntomas\n3️⃣ No mejoré o me siento peor`;
    }
  }

  return null;
}

module.exports = { procesarRespuestaSeguimiento };
