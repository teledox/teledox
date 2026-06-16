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
    procesarTracking:             require('../src/flows/flujo-tracking').procesarTracking,
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
      procesarCallCenter, buscarEmpresaPorCodigo, procesarTracking
    } = getFlows();

    // Reinicio de sesión con "hola"
    if (mensaje.toLowerCase() === 'hola') {
      await eliminar(telefono);

      // Si el teléfono tiene un caso de tracking activo, arranca ese flujo
      // en vez del flujo de consulta normal — evita que el paciente derivado
      // de otra empresa entre por error al flujo B2C.
      const { query: qTracking } = require('../src/services/supabase');
      const casosTracking = await qTracking('GET', 'tracking_casos', null,
        `?telefono=eq.${telefono}&estado=eq.activo&limit=1`);
      const casoT = casosTracking?.[0];

      if (casoT) {
        const meds = Array.isArray(casoT.medicamentos) ? casoT.medicamentos : [];
        const medsTexto = meds.length
          ? `\n\n💊 Medicamentos:\n${meds.map(m => `• ${m.nombre}${m.dosis ? ` ${m.dosis}` : ''}`).join('\n')}`
          : '';
        const saludoTracking = (casoT.paciente_nombre || nombreWhatsApp) ? `Hola ${casoT.paciente_nombre || nombreWhatsApp}!` : '¡Hola!';
        const msgTracking = `🩺 *Seguimiento MediLyft*\n\n${saludoTracking} Registramos tu activación de seguimiento.\n\n📋 Diagnóstico: ${casoT.diagnostico || '—'}${medsTexto}\n\n¿Cómo te sientes hoy?\n\n1️⃣ Muy mal\n2️⃣ Mal\n3️⃣ Regular\n4️⃣ Bien\n5️⃣ Muy bien`;
        await guardar(telefono, 400, {
          caso_id: casoT.id,
          empresa_id: casoT.empresa_id,
          paciente_nombre: casoT.paciente_nombre,
          diagnostico: casoT.diagnostico,
          medicamentos: meds,
          paso_tracking: 1,
          respuestas: {}
        });
        await enviar(telefono, msgTracking);
        return res.status(200).send('OK');
      }

      const result = await procesarPaso(0, mensaje, {}, telefono, nombreWhatsApp);
      await guardar(telefono, result.paso, result.datos);
      await despachar(telefono, result);
      return res.status(200).send('OK');
    }

    let sesion = await obtener(telefono);

    // Sesiones abandonadas hace más de 6 horas se consideran expiradas: el paciente
    // empieza de cero en vez de quedar atrapado en un paso intermedio (ej. "Ingrese
    // su cédula") sin contexto de por qué se le pide eso.
    if (sesion?.updated_at) {
      const actualizada = new Date(/Z|[+-]\d\d:\d\d$/.test(sesion.updated_at) ? sesion.updated_at : sesion.updated_at + 'Z');
      if (Date.now() - actualizada.getTime() > 6 * 3600000) {
        await eliminar(telefono);
        sesion = null;
      }
    }

    // Los botones/listas interactivas siempre pertenecen al flujo activo —
    // nunca deben ser interceptados por el seguimiento de medicamentos.
    const esInteractivo = msg.type === 'interactive';

    // Respuesta a un recordatorio de seguimiento. Solo se intercepta si el mensaje
    // coincide claramente con el formato esperado (Sí/No para medicamento, 1/2/3
    // para fin de tratamiento). Así cualquier otro mensaje (ej. "quiero una consulta")
    // nunca queda atrapado respondiendo a un recordatorio pendiente y siempre puede
    // iniciar una nueva interacción.
    // El seguimiento NUNCA intercepta mensajes interactivos (botones/listas),
    // ya que el seguimiento solo usa texto libre — los botones siempre son del flujo de consulta.
    // Una conversación activa de seguimiento crónico (paso 200+) tiene prioridad:
    // sus respuestas (ej. "1", "2", "3") no deben ser interceptadas por recordatorios
    // de medicación/laboratorio pendientes de consultas anteriores.
    const enCronica = (sesion?.paso || 0) >= 200;

    const pendiente = (!esInteractivo && !enCronica) ? await buscarRespuestaPendiente(telefono) : null;
    if (pendiente?.respuesta && esRespuestaSeguimiento(pendiente.respuesta, mensaje)) {
      const resp = await procesarRespuestaSeguimiento(pendiente, mensaje, telefono);
      if (resp) {
        await enviar(telefono, resp);
        return res.status(200).send('OK');
      }
    }

    // Respuesta a un recordatorio de seguimiento de examen de laboratorio (Sí/No).
    const pendienteLab = (!esInteractivo && !enCronica) ? await buscarRespuestaLabPendiente(telefono) : null;
    if (pendienteLab?.respuesta && esRespuestaLab(mensaje)) {
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

    // Paso 400+ — tracking de seguimiento externo (empresas médicas)
    if (paso >= 400) {
      const result = await procesarTracking(paso, mensaje, datos, telefono);
      await despachar(telefono, result);
      return res.status(200).send('OK');
    }

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
    let result = await procesarPaso(paso, mensaje, datos, telefono, nombreWhatsApp, msg);

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
