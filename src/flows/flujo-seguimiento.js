const { query } = require('../services/supabase');
const { alertar } = require('../services/telegram');
const { guardar, eliminar } = require('../services/sesiones');
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
      await guardar(telefono, 98, { receta_id: r.receta_id, paciente_id: paciente.id });
      return `👨‍⚕️ Entendemos que aún tiene síntomas.\n\n¿Desea agendar una consulta de seguimiento?\n\nResponda *Sí* o *No*`;

    } else if (mensaje === '3') {
      await guardar(telefono, 98, { receta_id: r.receta_id, paciente_id: paciente.id });
      await alertar(`🔴 <b>Sin mejoría — requiere atención</b>\nPaciente: ${paciente.nombre} ${paciente.apellidos || ''}\nMedicamento: ${recordatorio.medicamento}\nTeléfono: ${telefono}`);
      return `😟 Es importante que sea evaluado por un médico.\n\n¿Desea agendar una teleconsulta ahora?\n\nResponda *Sí* o *No*`;

    } else {
      return `Por favor responda con:\n1️⃣ Me siento mejor\n2️⃣ Mejoré pero aún tengo síntomas\n3️⃣ No mejoré o me siento peor`;
    }
  }

  return null;
}

module.exports = { procesarRespuestaSeguimiento };
