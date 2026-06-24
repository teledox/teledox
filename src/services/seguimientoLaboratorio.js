const { query } = require('./supabase');
const { enviarBotones } = require('./whatsapp');
const { guardar, obtener } = require('./sesiones');
const { normalizePhone } = require('../utils/telefono');

// Calendario de reintentos (offsets en horas desde created_at): 48h, día 3, día 5, día 7
const OFFSETS_LAB_H = [48, 72, 120, 168];

// Crea el seguimiento de laboratorio para una consulta si no existe uno activo.
// Se llama al enviar el "Pedido de laboratorio" al paciente.
async function crearSeguimientoLab(consulta_id, paciente_id, proximoEnvio, nombre_examen) {
  const existentes = await query('GET', 'seguimiento_laboratorio', null,
    `?consulta_id=eq.${consulta_id}&activo=eq.true`);
  if (existentes?.length) return existentes[0];

  const payload = {
    consulta_id,
    paciente_id,
    proximo_envio: (proximoEnvio || new Date(Date.now() + OFFSETS_LAB_H[0] * 3600000)).toISOString()
  };
  if (nombre_examen) payload.nombre_examen = nombre_examen;

  const creados = await query('POST', 'seguimiento_laboratorio', payload);
  return Array.isArray(creados) ? creados[0] : creados;
}

// Envía el recordatorio "¿ya se realizó el examen?" para un seguimiento, registra el
// intento en seguimiento_laboratorio_respuestas y programa (o cierra) el siguiente intento.
async function enviarRecordatorioLab(seguimiento, paciente) {
  const telefono = normalizePhone(paciente?.telefono);
  if (!telefono) throw new Error('El paciente no tiene un teléfono válido registrado');

  // No interrumpir sesión activa — reagendar +5min para no perder el intento
  const sesionActiva = await obtener(telefono);
  if (sesionActiva && sesionActiva.paso !== 0) {
    await query('PATCH', 'seguimiento_laboratorio', { proximo_envio: new Date(Date.now() + 5 * 60000).toISOString() }, `?id=eq.${seguimiento.id}`);
    return { omitido: true };
  }

  const intentoActual = (seguimiento.intento || 0) + 1;
  const examen = seguimiento.nombre_examen ? `*${seguimiento.nombre_examen}*` : 'un examen de laboratorio';
  const texto = `🧪 *Seguimiento MediLyft*\n\nHola ${paciente.nombre || ''}! Le recordamos que el médico le solicitó ${examen}.\n\n¿Ya se realizó el examen?`;

  await enviarBotones(telefono, texto, [
    { id: 'seg_lab_si', titulo: '✅ Sí, ya lo hice' },
    { id: 'seg_lab_no', titulo: '❌ Aún no'         }
  ]);

  const srLab = await query('POST', 'seguimiento_laboratorio_respuestas', {
    seguimiento_id: seguimiento.id,
    paciente_id:    seguimiento.paciente_id,
    consulta_id:    seguimiento.consulta_id,
    intento:        intentoActual,
    pregunta:       texto,
    enviado:        true
  });
  const srLabId = Array.isArray(srLab) ? srLab[0]?.id : srLab?.id;

  await guardar(telefono, 1, {
    seg_lab_respuesta_id: srLabId,
    seguimiento_id:       seguimiento.id,
    paciente_id:          seguimiento.paciente_id,
    consulta_id:          seguimiento.consulta_id
  }, 'seg_lab');

  if (intentoActual < OFFSETS_LAB_H.length) {
    const proximoEnvio = new Date(new Date(seguimiento.created_at).getTime() + OFFSETS_LAB_H[intentoActual] * 3600000);
    await query('PATCH', 'seguimiento_laboratorio', {
      intento: intentoActual,
      proximo_envio: proximoEnvio.toISOString()
    }, `?id=eq.${seguimiento.id}`);
  } else {
    await query('PATCH', 'seguimiento_laboratorio', {
      intento: intentoActual,
      activo: false,
      estado: 'sin_examen'
    }, `?id=eq.${seguimiento.id}`);
  }

  return { telefono, intento: intentoActual };
}

module.exports = { OFFSETS_LAB_H, crearSeguimientoLab, enviarRecordatorioLab };
