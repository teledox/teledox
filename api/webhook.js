const { WA_VERIFY_TOKEN } = require('../src/config');
const { enviar, enviarBotones, enviarLista } = require('../src/services/whatsapp');
const { alertar } = require('../src/services/telegram');
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
    buscarRespuestaLabPendiente:  require('../src/services/seguimiento').buscarRespuestaLabPendiente,
    procesarRespuestaSeguimiento: require('../src/flows/flujo-seguimiento').procesarRespuestaSeguimiento,
    procesarRespuestaLab:         require('../src/flows/flujo-seguimiento-laboratorio').procesarRespuestaLab,
    procesarSubidaExamen:         require('../src/flows/flujo-seguimiento-laboratorio').procesarSubidaExamen,
    esRespuestaLab:               require('../src/flows/flujo-seguimiento-laboratorio').esRespuestaLab,
    procesarPaso:                 require('../src/flows/flujo-consulta').procesarPaso,
    procesarReagendamiento:       require('../src/flows/flujo-reagendar').procesarReagendamiento,
    procesarCronica:              require('../src/flows/flujo-cronicas').procesarCronica,
    procesarAntecedentes:         require('../src/flows/flujo-antecedentes').procesarAntecedentes,
    procesarCallCenter:           require('../src/flows/flujo-callcenter').procesarCallCenter,
    buscarEmpresaPorCodigo:       require('../src/flows/flujo-callcenter').buscarEmpresaPorCodigo,
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

  // Declarados fuera del try para poder reportarlos en el catch si algo falla
  let telefono = null;
  let paso = null;

  try {
    const body = req.body || {};
    if (body.object !== 'whatsapp_business_account') return res.status(200).send('OK');

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;
    if (!value?.messages?.length) return res.status(200).send('OK');

    const msg            = value.messages[0];
    const nombreWhatsApp = value.contacts?.[0]?.profile?.name || 'estimado/a';
    telefono = msg.from;

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
      // Imagen u otro tipo — solo en paso 60 (comprobante de pago) y paso 150
      // (resultado de examen de laboratorio) se acepta
      mensaje = '__media__';
    }

    const {
      obtener, guardar, eliminar,
      buscarRespuestaPendiente, procesarRespuestaSeguimiento,
      buscarRespuestaLabPendiente, procesarRespuestaLab, procesarSubidaExamen, esRespuestaLab,
      procesarPaso, procesarReagendamiento, procesarCronica, procesarAntecedentes,
      procesarCallCenter, buscarEmpresaPorCodigo
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

    // Los botones/listas interactivas siempre pertenecen al flujo activo —
    // nunca deben ser interceptados por el seguimiento de medicamentos.
    const esInteractivo = msg.type === 'interactive';
    const enFlujoConsulta = esInteractivo || (pasoActual >= 1 && pasoActual <= 89);

    // Respuesta a un recordatorio de seguimiento. Tiene prioridad si el paciente no está
    // en medio de una consulta, O si el mensaje es claramente una respuesta al recordatorio
    // (Sí/No para medicamento, 1/2/3 para fin de tratamiento). Así un "Sí" al recordatorio
    // no se confunde con la cédula aunque haya quedado una sesión vieja a medias.
    // El seguimiento NUNCA intercepta mensajes interactivos (botones/listas),
    // ya que el seguimiento solo usa texto libre — los botones siempre son del flujo de consulta.
    const pendiente = !esInteractivo ? await buscarRespuestaPendiente(telefono) : null;
    if (pendiente?.respuesta) {
      const coincide = esRespuestaSeguimiento(pendiente.respuesta, mensaje);
      if (enFlujoConsulta && !coincide) {
        // El mensaje no coincide con el formato esperado y el usuario está en
        // medio de una consulta — dejamos que continúe su flujo activo; el
        // seguimiento pendiente se volverá a evaluar en el próximo mensaje.
      } else if (!coincide && pendiente.respuesta?.recordatorios?.tipo === 'medicamento') {
        // No está en una consulta, pero su respuesta no es un Sí/No claro —
        // evitamos interpretarla como "No tomé el medicamento" y reinsistimos.
        await enviar(telefono, `No entendimos su respuesta. 🙏\n\n¿Tomó su medicamento como se le indicó?\n\nResponda *Sí* o *No*.`);
        return res.status(200).send('OK');
      } else {
        const resp = await procesarRespuestaSeguimiento(pendiente, mensaje, telefono);
        if (resp) {
          await enviar(telefono, resp);
          return res.status(200).send('OK');
        }
      }
    }

    // Respuesta a un recordatorio de seguimiento de examen de laboratorio (Sí/No).
    const pendienteLab = !esInteractivo ? await buscarRespuestaLabPendiente(telefono) : null;
    if (pendienteLab?.respuesta && (!enFlujoConsulta || esRespuestaLab(mensaje))) {
      const resultLab = await procesarRespuestaLab(pendienteLab, mensaje, telefono);
      if (resultLab) {
        if (resultLab.paso) await guardar(telefono, resultLab.paso, resultLab.datos);
        await enviar(telefono, resultLab.respuesta);
        return res.status(200).send('OK');
      }
    }

    if (!sesion) sesion = { paso: 0, datos: {} };
    let datos;
    ({ paso, datos } = sesion);
    datos = datos || {};

    // Pasos 300+ — flujo call center B2B
    if (paso >= 300) {
      const result = await procesarCallCenter(paso, mensaje, datos, telefono);
      if (!result.terminar) await guardar(telefono, result.paso, result.datos);
      else await eliminar(telefono);
      await despachar(telefono, result);
      return res.status(200).send('OK');
    }

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

    // Paso 150 — esperando subida del resultado de examen de laboratorio
    if (paso === 150) {
      const result = await procesarSubidaExamen(paso, mensaje, datos, telefono, msg);
      if (!result.terminar) await guardar(telefono, result.paso, result.datos);
      else await eliminar(telefono);
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
    let result = await procesarPaso(paso, mensaje, datos, telefono, nombreWhatsApp);

    // Redirección a call center cuando el paso 1 detecta un código de empresa
    if (result._redirect) {
      const ccResult = await procesarCallCenter(300, '', result._redirect.datos, telefono);
      await guardar(telefono, ccResult.paso, ccResult.datos);
      await despachar(telefono, ccResult);
      return res.status(200).send('OK');
    }

    if (!result.terminar) {
      await guardar(telefono, result.paso, result.datos);
    }
    await despachar(telefono, result);
    return res.status(200).send('OK');

  } catch (err) {
    console.error('Error en webhook:', err.message);

    try {
      await alertar(`🔴 <b>Error en webhook</b>\nTeléfono: ${telefono || 'desconocido'}\nPaso: ${paso ?? 'desconocido'}\nError: ${err.message}`);
    } catch (e2) {
      console.error('Error enviando alerta de error:', e2.message);
    }

    if (telefono) {
      try {
        await enviar(telefono, `⚠️ Tuvimos un problema técnico procesando su mensaje. Por favor intente de nuevo en unos minutos.`);
      } catch (e3) {
        console.error('Error enviando mensaje de error al usuario:', e3.message);
      }
    }

    return res.status(200).send('OK');
  }
};
