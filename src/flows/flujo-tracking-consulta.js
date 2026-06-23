const { query }          = require('../services/supabase');
const { buscarPorCedula, crear: crearPaciente } = require('../services/pacientes');
const { crear: crearConsulta }                  = require('../services/consultas');
const { alertar }        = require('../services/telegram');
const { validarCedula, separarNombre } = require('../utils/validaciones');
const { guardar, eliminar } = require('../services/sesiones');
const { estaEnHorario, proximaApertura } = require('../utils/horarioOperacion');
const { mensajeFueraHorario } = require('../utils/mensajesFueraHorario');

// Mini-flujo de migración tracking → consulta MediLyft
// Entrada: el paciente aceptó la propuesta del médico (propuesta_consulta_si)
// Sesión guardada con _flujo:'tracking_migracion'
//
// datos esperados: { caso_id, empresa_id, paciente_nombre, diagnostico, tratamiento }
//
// paso 410 — esperando respuesta al botón ¿tienes cédula?
// paso 411 — esperando el número de cédula

async function procesarMigracion(paso, mensaje, datos, telefono) {
  const { caso_id, paciente_nombre, diagnostico, tratamiento } = datos;

  if (paso === 410) {
    if (mensaje === 'propuesta_cedula_si') {
      return {
        respuesta: 'Ingresa tu número de *cédula* (10 dígitos):',
        paso: 411, datos, terminar: false
      };
    }

    if (mensaje === 'propuesta_cedula_no') {
      // Sin cédula → instrucciones para el flujo B2C normal
      return {
        respuesta: `Sin problema. 😊\n\nPara agendar tu consulta médica escribe *hola* y selecciona *"🏥 Consulta médica"*. Te guiaremos paso a paso.\n\nSi tienes una urgencia llama al *911*.`,
        terminar: true
      };
    }

    // Respuesta inesperada — reenviar botones
    return {
      respuesta: '¿Tienes número de cédula ecuatoriana?',
      botones: [
        { id: 'propuesta_cedula_si', titulo: '✅ Sí, la tengo' },
        { id: 'propuesta_cedula_no', titulo: '➡️ No / Soy extranjero' }
      ],
      paso: 410, datos, terminar: false
    };
  }

  if (paso === 411) {
    const { valida, error, cedula: cedulaLimpia } = validarCedula(mensaje);
    if (!valida) {
      return {
        respuesta: `❌ ${error}\n\nIngresa tu *cédula* (10 dígitos):`,
        paso: 411, datos, terminar: false
      };
    }

    const cedula = cedulaLimpia || mensaje.replace(/\D/g, '');

    let paciente = await buscarPorCedula(cedula);
    if (!paciente) {
      const { nombre, apellidos } = separarNombre(paciente_nombre || '');
      paciente = await crearPaciente({
        cedula,
        nombre:    nombre    || paciente_nombre || '',
        apellidos: apellidos || '',
        telefono:  telefono.replace(/\D/g, ''),
      });
    }

    if (!paciente?.id) {
      return {
        respuesta: 'Hubo un problema al registrar tus datos. Por favor intenta de nuevo en unos minutos.',
        paso: 411, datos, terminar: false
      };
    }

    // Verificar horario de operación antes de crear la consulta
    if (!estaEnHorario()) {
      const prox = proximaApertura();
      const fhDatos = {
        ...datos,
        paciente_id:    paciente.id,
        _flujo:         'fuera_horario',
        _pendingOrigen: 'tracking',
        _activada_at:   prox.fecha.toISOString(),
        _proximaTexto:  prox.texto
      };
      await guardar(telefono, 0, fhDatos, 'fuera_horario');
      const { respuesta, botones } = mensajeFueraHorario(prox);
      return { respuesta, botones, paso: 0, datos: fhDatos, terminar: false };
    }

    await crearConsulta({
      paciente_id:         paciente.id,
      nivel_sintomas:      1,
      sintomas_descripcion: [diagnostico, tratamiento ? `Tratamiento: ${tratamiento}` : ''].filter(Boolean).join(' — ') || 'Seguimiento tracking',
      estado:              'pendiente',
      activada_at:         new Date().toISOString()
    });

    await query('PATCH', 'tracking_casos', { estado: 'derivado' }, `?id=eq.${caso_id}`);

    await alertar(
      `📋 <b>Paciente tracking derivado a consulta</b>\n` +
      `Paciente: ${paciente_nombre || telefono}\n` +
      `Cédula: ${cedula}\n` +
      `Diagnóstico: ${diagnostico || '—'}`
    );

    return {
      respuesta: `✅ ¡Tu consulta fue registrada!\n\nUn asesor de *MediLyft* te contactará pronto para confirmar el horario.\n\nSi tienes una urgencia llama al *911*.`,
      terminar: true
    };
  }

  // Paso desconocido — reiniciar
  return {
    respuesta: '¿Tienes número de cédula ecuatoriana?',
    botones: [
      { id: 'propuesta_cedula_si', titulo: '✅ Sí, la tengo' },
      { id: 'propuesta_cedula_no', titulo: '➡️ No / Soy extranjero' }
    ],
    paso: 410, datos, terminar: false
  };
}

// Confirma una migración tracking→consulta agendada fuera de horario.
// Llamada desde webhook.js cuando el paciente presiona "✅ Agendar mi cita".
async function confirmarMigracionFueraHorario(datos, telefono) {
  const { paciente_nombre, diagnostico, tratamiento, caso_id, paciente_id } = datos;

  await crearConsulta({
    paciente_id,
    nivel_sintomas:      1,
    sintomas_descripcion: [diagnostico, tratamiento ? `Tratamiento: ${tratamiento}` : ''].filter(Boolean).join(' — ') || 'Seguimiento tracking',
    estado:              'pendiente_apertura',
    activada_at:         datos._activada_at || null
  });

  await query('PATCH', 'tracking_casos', { estado: 'derivado' }, `?id=eq.${caso_id}`);

  await alertar(
    `📋 <b>Paciente tracking → consulta (fuera de horario)</b>\n` +
    `Paciente: ${paciente_nombre || telefono}\n` +
    `Diagnóstico: ${diagnostico || '—'}\n` +
    `Activa: ${datos._proximaTexto}`
  );

  await eliminar(telefono);

  return {
    respuesta: `✅ ¡Tu cita fue agendada!\n\nUn asesor de *MediLyft* la atenderá ${datos._proximaTexto}.\n\nSi tienes una urgencia llama al *911*.`,
    terminar: true
  };
}

module.exports = { procesarMigracion, confirmarMigracionFueraHorario };
