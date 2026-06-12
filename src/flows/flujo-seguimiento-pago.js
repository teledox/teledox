const { crear: crearConsulta, crearNotificacion, nivelACategoria } = require('../services/consultas');
const { guardar, eliminar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');
const { clasificarSintomas, esSi } = require('../utils/validaciones');
const { BOTONES_PAGO, MSG_REINTENTAR_BOTON, registrarFacturacionB2C, esConfirmacionComprobante } = require('./flujo-b2c');
const { estaEnHorarioAtencion, proximaApertura, mensajeFueraHorario, BOTONES_HORARIO } = require('../utils/horarios');

// Pasos 90-97 — flujo de "consulta de seguimiento" aprobada por el médico desde
// el panel (api/seguimiento-decision.js). El paciente ya fue identificado y
// `datos` viene precargado con sus datos (ver seguimiento-decision.js).

function faltaDato(datos) {
  if (!datos.correo) return 'correo';
  if (!datos.telefonoContacto) return 'telefonoContacto';
  if (!datos.lugar_residencia) return 'lugar_residencia';
  return null;
}

async function irAPago(datos, telefono, omitirCheckHorario = false) {
  if (!omitirCheckHorario && !estaEnHorarioAtencion()) {
    return {
      respuesta: mensajeFueraHorario(),
      paso: 97, datos, terminar: false,
      botones: BOTONES_HORARIO
    };
  }

  const inicioAtencion = datos.inicio_atencion ? new Date(datos.inicio_atencion) : new Date();

  if (datos.cliente_b2b_id) {
    const consulta = await crearConsulta({
      paciente_id: datos.paciente_id,
      nivel_sintomas: datos.nivel || 1,
      sintomas_descripcion: datos.sintomas_seguimiento || '',
      estado: 'pendiente',
      origen: 'seguimiento_aprobado',
      consulta_seguimiento_de: datos.consulta_origen_id || null,
      inicio_atencion: inicioAtencion.toISOString(),
    });
    await crearNotificacion(
      'nueva_consulta', '🔁 Consulta de seguimiento agendada',
      `${datos.nombreCompleto} — seguimiento aprobado por médico (cubierto por empresa)`,
      datos.paciente_id, consulta?.id,
      { origen: 'b2b', categoria: nivelACategoria(datos.nivel), etiqueta: 'AFILIADO', inicio_atencion: inicioAtencion.toISOString() }
    );
    await alertar(`🔁 <b>SEGUIMIENTO AGENDADO (sin costo - B2B)</b>\nPaciente: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nSíntomas: ${datos.sintomas_seguimiento}`);
    await eliminar(telefono);
    return {
      respuesta: `✅ ¡Listo! Su consulta de seguimiento fue registrada *sin costo* (cubierta por su empresa).\n\nUn asesor le contactará para coordinar el horario. 💙`,
      paso: 0, datos, terminar: true
    };
  }

  return {
    respuesta: `Para su consulta de seguimiento, el costo es *$8.00*.\n\n¿Cómo desea realizar el pago?`,
    paso: 95, datos, terminar: false, botones: BOTONES_PAGO
  };
}

async function procesarSeguimientoPago(paso, mensaje, datos, telefono, nombreWhatsApp) {
  let respuesta = '';
  let nuevoPaso = paso;

  if (paso === 90) {
    if (esSi(mensaje)) {
      respuesta = `Para continuar, cuéntenos: ¿cómo se siente actualmente? ¿Persisten los síntomas o han cambiado?`;
      nuevoPaso = 91;
    } else {
      await eliminar(telefono);
      return {
        respuesta: `Entendido, no agendaremos por ahora. 🙏\n\nSi en cualquier momento desea una consulta, escríbanos *hola*. 💙`,
        paso: 0, datos, terminar: true
      };
    }

  } else if (paso === 91) {
    const nivel = clasificarSintomas(mensaje);
    datos.sintomas_seguimiento = mensaje;
    datos.nivel = nivel;

    if (nivel === 3) {
      await alertar(`🚨 <b>EMERGENCIA - SEGUIMIENTO</b>\nNombre: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      await eliminar(telefono);
      return {
        respuesta: `🚨 *EMERGENCIA MÉDICA* 🚨\n\nSus síntomas indican una situación de *riesgo vital*.\n\n*Llame al 911 AHORA MISMO.*\n\n📞 tel:911`,
        paso: 0, datos, terminar: true
      };
    }

    const falta = faltaDato(datos);
    if (falta === 'correo')          return { respuesta: `*Correo electrónico:*`, paso: 92, datos, terminar: false };
    if (falta === 'telefonoContacto') return { respuesta: `Indíquenos un *número de teléfono* de contacto:`, paso: 93, datos, terminar: false };
    if (falta === 'lugar_residencia') return { respuesta: `Indíquenos su *lugar de residencia* (ciudad y barrio):`, paso: 94, datos, terminar: false };
    return await irAPago(datos, telefono);

  } else if (paso === 92) {
    datos.correo = mensaje.trim();
    const falta = faltaDato(datos);
    if (falta === 'telefonoContacto') return { respuesta: `Indíquenos un *número de teléfono* de contacto:`, paso: 93, datos, terminar: false };
    if (falta === 'lugar_residencia') return { respuesta: `Indíquenos su *lugar de residencia* (ciudad y barrio):`, paso: 94, datos, terminar: false };
    return await irAPago(datos, telefono);

  } else if (paso === 93) {
    datos.telefonoContacto = mensaje.trim();
    const falta = faltaDato(datos);
    if (falta === 'lugar_residencia') return { respuesta: `Indíquenos su *lugar de residencia* (ciudad y barrio):`, paso: 94, datos, terminar: false };
    return await irAPago(datos, telefono);

  } else if (paso === 94) {
    datos.lugar_residencia = mensaje.trim();
    return await irAPago(datos, telefono);

  } else if (paso === 95) {
    const m = mensaje.trim().toLowerCase();
    if (m === '1' || m === 'transferencia') {
      datos.forma_pago = 'transferencia';
      respuesta = `🏦 *Datos para transferencia:*\n\n🏦 Banco Internacional\n📋 Cuenta Corriente: *640618402*\n🏢 RUC: *1793197189001*\n💰 Monto: *$8.00*\n📝 Concepto: Teleconsulta de seguimiento MediLyft\n\nRealice la transferencia y envíenos la *foto del comprobante* para confirmar.`;
      nuevoPaso = 96;
    } else if (m === '2' || m === 'tarjeta') {
      datos.forma_pago = 'tarjeta';
      respuesta = `💳 *Pago con tarjeta:*\n\nHaga clic en el siguiente enlace para pago seguro de *$8.00*:\n\nhttps://app.pagoplux.com/paybox/MTc4OA%3D%3D/MA%3D%3D/OA%3D%3D/UEFHTyBWSURFTyBDT05TVUxUQQ%3D%3D\n\nUna vez realizado el pago, envíenos la *captura del comprobante* para confirmar.`;
      nuevoPaso = 96;
    } else {
      return { respuesta: MSG_REINTENTAR_BOTON, paso: 95, datos, terminar: false, botones: BOTONES_PAGO };
    }

  } else if (paso === 96) {
    // Recibe imagen/documento del comprobante, o una confirmación explícita
    if (!esConfirmacionComprobante(mensaje)) {
      return {
        respuesta: `Por favor envíenos la *foto o captura del comprobante* de su pago para confirmar. Si ya realizó el pago, también puede escribir *"listo"*.`,
        paso: 96, datos, terminar: false
      };
    }

    datos.comprobante_ref = `WhatsApp-${telefono}-${Date.now()}`;

    const inicioAtencion = datos.inicio_atencion ? new Date(datos.inicio_atencion) : new Date();
    const consulta = await crearConsulta({
      paciente_id: datos.paciente_id,
      nivel_sintomas: datos.nivel || 1,
      sintomas_descripcion: datos.sintomas_seguimiento || '',
      estado: 'pendiente',
      origen: 'seguimiento_aprobado',
      consulta_seguimiento_de: datos.consulta_origen_id || null,
      inicio_atencion: inicioAtencion.toISOString(),
    });

    await crearNotificacion(
      'nueva_consulta', '🔁 Pago - Consulta de seguimiento',
      `${datos.nombreCompleto} pagó consulta de seguimiento (${datos.forma_pago}, $8.00)`,
      datos.paciente_id, consulta?.id,
      { origen: 'b2c', categoria: nivelACategoria(datos.nivel), etiqueta: 'PAGO', inicio_atencion: inicioAtencion.toISOString() }
    );

    await registrarFacturacionB2C(datos);

    await alertar(`💰 <b>PAGO SEGUIMIENTO - MEDILYFT</b>\nNombre: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nSíntomas: ${datos.sintomas_seguimiento}\nPago: ${datos.forma_pago}\nMonto: $8.00`);

    await eliminar(telefono);
    return {
      respuesta: `✅ *¡Pago confirmado!*\n\n🎉 Su consulta de seguimiento ha sido registrada.\n\nUn asesor de *MediLyft* le contactará en breve para confirmar el horario.\n\n📧 La factura electrónica será enviada a *${datos.correo}*.\n\n¡Gracias por confiar en MediLyft! 💙`,
      paso: 0, datos, terminar: true
    };

  } else if (paso === 97) {
    const m = mensaje.trim().toLowerCase();
    if (m === 'confirmar' || m.includes('confirmar')) {
      datos.inicio_atencion = proximaApertura().toISOString();
      return await irAPago(datos, telefono, true);
    } else if (m === 'abandonar' || m.includes('abandonar')) {
      await eliminar(telefono);
      return {
        respuesta: `Entendido. Cuando lo desee, escríbanos *hola* para iniciar de nuevo. 👋`,
        paso: 0, datos, terminar: true
      };
    } else {
      return { respuesta: mensajeFueraHorario(), paso: 97, datos, terminar: false, botones: BOTONES_HORARIO };
    }
  }

  return { respuesta, paso: nuevoPaso, datos, terminar: false };
}

module.exports = { procesarSeguimientoPago };
