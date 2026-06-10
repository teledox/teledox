const { query } = require('./supabase');
const { enviar } = require('./whatsapp');

// Calendario de reintentos (offsets en horas desde created_at): 48h, día 3, día 5, día 7
const OFFSETS_LAB_H = [48, 72, 120, 168];

function formatearTelefono(telefonoPaciente) {
  const soloDig = String(telefonoPaciente || '').replace(/\D/g, '');
  if (!soloDig || soloDig.length < 7) return null;
  return `whatsapp:+${soloDig.startsWith('0') ? '593' + soloDig.slice(1) : soloDig}`;
}

// Crea el seguimiento de laboratorio para una consulta si no existe uno activo.
// Se llama al enviar el "Pedido de laboratorio" al paciente.
async function crearSeguimientoLab(consulta_id, paciente_id, proximoEnvio) {
  const existentes = await query('GET', 'seguimiento_laboratorio', null,
    `?consulta_id=eq.${consulta_id}&activo=eq.true`);
  if (existentes?.length) return existentes[0];

  const creados = await query('POST', 'seguimiento_laboratorio', {
    consulta_id,
    paciente_id,
    proximo_envio: (proximoEnvio || new Date(Date.now() + OFFSETS_LAB_H[0] * 3600000)).toISOString()
  });
  return Array.isArray(creados) ? creados[0] : creados;
}

// Envía el recordatorio "¿ya se realizó el examen?" para un seguimiento, registra el
// intento en seguimiento_laboratorio_respuestas y programa (o cierra) el siguiente intento.
async function enviarRecordatorioLab(seguimiento, paciente) {
  const telefono = formatearTelefono(paciente?.telefono);
  if (!telefono) throw new Error('El paciente no tiene un teléfono válido registrado');

  const intentoActual = (seguimiento.intento || 0) + 1;
  const mensaje = `🧪 *Seguimiento MediLyft*\n\nHola ${paciente.nombre || ''}! Le recordamos que el médico le solicitó un examen de laboratorio.\n\n¿Ya se realizó el examen?\n\nResponda *Sí* o *No*`;

  await enviar(telefono, mensaje);

  await query('POST', 'seguimiento_laboratorio_respuestas', {
    seguimiento_id: seguimiento.id,
    paciente_id: seguimiento.paciente_id,
    consulta_id: seguimiento.consulta_id,
    intento: intentoActual,
    pregunta: mensaje
  });

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
