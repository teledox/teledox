const { WA_VERIFY_TOKEN } = require('../src/config');
const { enviar } = require('../src/services/whatsapp');

// Lazy load — se cargan solo cuando llega un mensaje POST, no al inicio
// Esto evita que el bundler de Vercel falle por pdf-lib al verificar el webhook
function getFlows() {
  return {
    obtener:                    require('../src/services/sesiones').obtener,
    guardar:                    require('../src/services/sesiones').guardar,
    eliminar:                   require('../src/services/sesiones').eliminar,
    buscarRespuestaPendiente:   require('../src/services/seguimiento').buscarRespuestaPendiente,
    procesarRespuestaSeguimiento: require('../src/flows/flujo-seguimiento').procesarRespuestaSeguimiento,
    procesarPaso:               require('../src/flows/flujo-consulta').procesarPaso,
    procesarReagendamiento:     require('../src/flows/flujo-reagendar').procesarReagendamiento,
    procesarCronica:            require('../src/flows/flujo-cronicas').procesarCronica,
    procesarAntecedentes:       require('../src/flows/flujo-antecedentes').procesarAntecedentes,
  };
}

module.exports = async function handler(req, res) {

  // ── GET: verificación del webhook por Meta ──────────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
      console.log('Webhook verificado por Meta ✅');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // ── POST: mensajes entrantes de Meta ────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Meta siempre espera 200 rápido — respondemos primero y procesamos después
  res.status(200).send('OK');

  try {
    const body = req.body || {};

    // Validar que es un evento de WhatsApp con mensajes
    if (body.object !== 'whatsapp_business_account') return;

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    // Ignorar status updates (delivered, read, etc.)
    if (!value?.messages?.length) return;

    const msg            = value.messages[0];
    const telefono       = msg.from;
    const nombreWhatsApp = value.contacts?.[0]?.profile?.name || 'estimado/a';

    // Solo procesamos mensajes de texto
    if (msg.type !== 'text') {
      await enviar(telefono, 'Por favor envía tu mensaje como texto. 😊');
      return;
    }

    const mensaje = (msg.text?.body || '').trim();

    // Cargar flows aquí (lazy) para evitar problema de bundling con pdf-lib
    const {
      obtener, guardar, eliminar,
      buscarRespuestaPendiente, procesarRespuestaSeguimiento,
      procesarPaso, procesarReagendamiento, procesarCronica, procesarAntecedentes
    } = getFlows();

    async function responder(texto) {
      await enviar(telefono, texto);
    }

    // Reinicio de sesión con "hola"
    if (mensaje.toLowerCase() === 'hola') {
      await eliminar(telefono);
      const result = await procesarPaso(0, mensaje, {}, telefono, nombreWhatsApp);
      await guardar(telefono, result.paso, result.datos);
      return responder(result.respuesta);
    }

    // Verificar si hay una respuesta de seguimiento pendiente
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

  } catch (err) {
    console.error('Error en webhook:', err.message);
  }
};
