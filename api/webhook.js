const twilio = require('twilio');
const { obtener, guardar, eliminar } = require('../src/services/sesiones');
const { buscarRespuestaPendiente } = require('../src/services/seguimiento');
const { procesarRespuestaSeguimiento } = require('../src/flows/flujo-seguimiento');
const { procesarPaso } = require('../src/flows/flujo-consulta');
const { procesarReagendamiento } = require('../src/flows/flujo-reagendar');
const { procesarCronica } = require('../src/flows/flujo-cronicas');
const { procesarAntecedentes } = require('../src/flows/flujo-antecedentes');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const body = req.body || {};
  const mensaje = (body.Body || '').trim();
  const telefono = body.From || '';
  const nombreWhatsApp = body.ProfileName || 'estimado/a';

  const twiml = new twilio.twiml.MessagingResponse();

  function responder(texto) {
    twiml.message(texto);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml.toString());
  }

  // Reinicio de sesión con "hola"
  if (mensaje.toLowerCase() === 'hola') {
    await eliminar(telefono);
    const result = await procesarPaso(0, mensaje, {}, telefono, nombreWhatsApp);
    await guardar(telefono, result.paso, result.datos);
    return responder(result.respuesta);
  }

  // Verificar si hay una respuesta de seguimiento pendiente
  // Solo se procesa si NO hay sesión activa en flujo principal
  let sesion = await obtener(telefono);
  const pasoActual = sesion?.paso ?? 0;
  const enFlujoConsulta = pasoActual >= 1 && pasoActual <= 12;

  if (!enFlujoConsulta) {
    const pendiente = await buscarRespuestaPendiente(telefono);
    if (pendiente?.respuesta) {
      const respuesta = await procesarRespuestaSeguimiento(pendiente, mensaje, telefono);
      if (respuesta) return responder(respuesta);
    }
  }

  if (!sesion) sesion = { paso: 0, datos: {} };
  let { paso, datos } = sesion;
  datos = datos || {};

  // Pasos 13-17 — antecedentes médicos + generación historia clínica
  if (paso >= 13 && paso <= 17) {
    const result = await procesarAntecedentes(paso, mensaje, datos, telefono);
    if (!result.terminar) await guardar(telefono, result.paso, result.datos);
    return responder(result.respuesta);
  }

  // Paso 200+ — enfermedades crónicas
  if (paso >= 200) {
    const result = await procesarCronica(paso, mensaje, datos, telefono, nombreWhatsApp);
    return responder(result.respuesta);
  }

  // Paso 98 — reagendar post seguimiento
  if (paso === 98) {
    const result = await procesarReagendamiento(datos, mensaje, telefono);
    if (!result.terminar) await guardar(telefono, result.paso, result.datos);
    return responder(result.respuesta);
  }

  // Paso 99 — ya registrado, espera "hola" para nueva consulta
  if (paso === 99) {
    return responder(`Su consulta ya fue registrada. 😊\n\nUn asesor de *MediLyft* le contactará pronto.\n\nPara una nueva consulta escriba *hola*.`);
  }

  // Flujo principal de consulta
  const result = await procesarPaso(paso, mensaje, datos, telefono, nombreWhatsApp);
  if (!result.terminar) {
    await guardar(telefono, result.paso, result.datos);
  }
  return responder(result.respuesta);
};
