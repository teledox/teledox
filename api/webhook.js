const { WA_VERIFY_TOKEN } = require('../src/config');
const { enviar, enviarBotones, enviarLista } = require('../src/services/whatsapp');
const { esSi } = require('../src/utils/validaciones');

// ¿El mensaje es una respuesta plausible al recordatorio de seguimiento pendiente?
// medicamento → Sí/No · fin_tratamiento → 1/2/3
function esRespuestaSeguimiento(respuestaPendiente, mensaje) {
  const tipo = respuestaPendiente?.recordatorios?.tipo;
  const m = (mensaje || '').trim().toLowerCase();
  if (tipo === 'medicamento') return esSi(m) || /^no$/.test(m);
  if (tipo === 'fin_tratamiento') return ['1', '2', '3'].includes(m);
  return false;
}

function getFlows() {
  return {
    obtener:                      require('../src/services/sesiones').obtener,
    guardar:                      require('../src/services/sesiones').guardar,
    eliminar:                     require('../src/services/sesiones').eliminar,
    buscarRespuestaPendiente:     require('../src/services/seguimiento').buscarRespuestaPendiente,
    procesarRespuestaSeguimiento: require('../src/flows/flujo-seguimiento').procesarRespuestaSeguimiento,
    procesarPaso:                 require('../src/flows/flujo-consulta').procesarPaso,
    procesarReagendamiento:       require('../src/flows/flujo-reagendar').procesarReagendamiento,
    procesarCronica:              require('../src/flows/flujo-cronicas').procesarCronica,
    procesarAntecedentes:         require('../src/flows/flujo-antecedentes').procesarAntecedentes,
  };
}

// Envía la respuesta usando texto, botones o lista según lo que retorne el flow
async function despachar(telefono, result) {
  const { respuesta, botones, lista } = result;
  if (botones && botones.length > 0) {
    await enviarBotones(telefono, respuesta, botones);
  } else if (lista && lista.secciones) {
    await enviarLista(telefono, respuesta, lista.secciones, lista.botonTexto);
  } else {
    await enviar(telefono, respuesta);
  }
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

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const body = req.body || {};
    if (body.object !== 'whatsapp_business_account') return res.status(200).send('OK');

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;
    if (!value?.messages?.length) return res.status(200).send('OK');

    const msg            = value.messages[0];
    const telefono       = msg.from;
    const nombreWhatsApp = value.contacts?.[0]?.profile?.name || 'estimado/a';

    // ── Extraer texto (texto plano o respuesta de botón/lista) ──────────
    let mensaje = '';
    if (msg.type === 'text') {
      mensaje = (msg.text?.body || '').trim();
    } else if (msg.type === 'interactive') {
      const ir = msg.interactive;
      if (ir?.type === 'button_reply') {
        mensaje = ir.button_reply?.id || ir.button_reply?.title || '';
      } else if (ir?.type === 'list_reply') {
        mensaje = ir.list_reply?.id || ir.list_reply?.title || '';
      }
    } else {
      // Imagen u otro tipo — solo en paso 60 (comprobante de pago) se acepta
      mensaje = '__media__';
    }

    const {
      obtener, guardar, eliminar,
      buscarRespuestaPendiente, procesarRespuestaSeguimiento,
      procesarPaso, procesarReagendamiento, procesarCronica, procesarAntecedentes
    } = getFlows();

    // Reinicio de sesión con "hola"
    if (mensaje.toLowerCase() === 'hola') {
      await eliminar(telefono);
      const result = await procesarPaso(0, mensaje, {}, telefono, nombreWhatsApp);
      await guardar(telefono, result.paso, result.datos);
      await despachar(telefono, result);
      return res.status(200).send('OK');
    }

    let sesion = await obtener(telefono);
    const pasoActual = sesion?.paso ?? 0;
    const enFlujoConsulta = pasoActual >= 1 && pasoActual <= 12;

    // Respuesta a un recordatorio de seguimiento. Tiene prioridad si el paciente no está
    // en medio de una consulta, O si el mensaje es claramente una respuesta al recordatorio
    // (Sí/No para medicamento, 1/2/3 para fin de tratamiento). Así un "Sí" al recordatorio
    // no se confunde con la cédula aunque haya quedado una sesión vieja a medias.
    const pendiente = await buscarRespuestaPendiente(telefono);
    if (pendiente?.respuesta && (!enFlujoConsulta || esRespuestaSeguimiento(pendiente.respuesta, mensaje))) {
      const resp = await procesarRespuestaSeguimiento(pendiente, mensaje, telefono);
      if (resp) {
        await enviar(telefono, resp);
        return res.status(200).send('OK');
      }
    }

    if (!sesion) sesion = { paso: 0, datos: {} };
    let { paso, datos } = sesion;
    datos = datos || {};

    // Pasos 13-17 — antecedentes médicos
    if (paso >= 13 && paso <= 17) {
      const result = await procesarAntecedentes(paso, mensaje, datos, telefono);
      if (!result.terminar) await guardar(telefono, result.paso, result.datos);
      await despachar(telefono, result);
      return res.status(200).send('OK');
    }

    // Paso 200+ — enfermedades crónicas
    if (paso >= 200) {
      const result = await procesarCronica(paso, mensaje, datos, telefono, nombreWhatsApp);
      await despachar(telefono, result);
      return res.status(200).send('OK');
    }

    // Paso 98 — reagendar
    if (paso === 98) {
      const result = await procesarReagendamiento(datos, mensaje, telefono);
      if (!result.terminar) await guardar(telefono, result.paso, result.datos);
      await despachar(telefono, result);
      return res.status(200).send('OK');
    }

    // Paso 99 — ya registrado
    if (paso === 99) {
      await enviar(telefono, `Su consulta ya fue registrada. 😊\n\nUn asesor de *MediLyft* le contactará pronto.\n\nPara una nueva consulta escriba *hola*.`);
      return res.status(200).send('OK');
    }

    // Flujo principal de consulta
    const result = await procesarPaso(paso, mensaje, datos, telefono, nombreWhatsApp);
    if (!result.terminar) {
      await guardar(telefono, result.paso, result.datos);
    }
    await despachar(telefono, result);
    return res.status(200).send('OK');

  } catch (err) {
    console.error('Error en webhook:', err.message);
    return res.status(200).send('OK');
  }
};
