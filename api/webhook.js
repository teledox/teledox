const crypto = require('crypto');
const { WA_VERIFY_TOKEN } = require('../src/config');

function detectarCrisis(texto) {
  return /(suicid|matar(me|nos)|no quiero (vivir|seguir|estar|existir)|quiero (morir|no vivir)|acabar (con mi vida|conmigo|con todo)|hacerme daño|quitarme la vida|ya no quiero (vivir|seguir)|me quiero morir|pensamientos? de (muerte|daño|suicid))/i
    .test(String(texto || ''));
}
const { enviar, enviarBotones, enviarLista } = require('../src/services/whatsapp');
const { alertar } = require('../src/services/telegram');
const { registrarEvento, marcarProcesado } = require('../src/services/eventos');
const { esSi } = require('../src/utils/validaciones');

// ¿El mensaje es una respuesta plausible al recordatorio de seguimiento pendiente?
// medicamento → Sí/No · fin_tratamiento → 1/2/3 · bienestar → 1/2/3/4/5
function esRespuestaSeguimiento(respuestaPendiente, mensaje) {
  const tipo = respuestaPendiente?.recordatorios?.tipo;
  const m = (mensaje || '').trim().toLowerCase();
  if (tipo === 'medicamento') return esSi(m) || /^no$/.test(m);
  if (tipo === 'fin_tratamiento') return ['1', '2', '3'].includes(m);
  if (tipo === 'bienestar') return ['1', '2', '3', '4', '5'].includes(m);
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
    procesarRespuestaMed:         require('../src/flows/flujo-tracking').procesarRespuestaMed,
    procesarMigracion:            require('../src/flows/flujo-tracking-consulta').procesarMigracion,
    procesarB2C:                  require('../src/flows/flujo-b2c').procesarB2C,
    procesarSeguimientoPago:      require('../src/flows/flujo-seguimiento-pago').procesarSeguimientoPago,
    procesarPreguntaConsulta:     require('../src/flows/flujo-pregunta-consulta').procesarPreguntaConsulta,
    procesarBiometricos:             require('../src/flows/flujo-biometricos').procesarBiometricos,
    procesarPsicosocial:             require('../src/flows/flujo-psicosocial').procesarPsicosocial,
    confirmarConsultaFueraHorario:   require('../src/flows/flujo-consulta').confirmarConsultaFueraHorario,
    confirmarMigracionFueraHorario:  require('../src/flows/flujo-tracking-consulta').confirmarMigracionFueraHorario,
    confirmarCallCenterFueraHorario: require('../src/flows/flujo-callcenter').confirmarCallCenterFueraHorario,
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

  // Body crudo: si ya viene puesto en req.rawBody (nuestro harness de pruebas
  // en scripts/test-bot/server.js lo hace), se usa tal cual. En producción
  // (Vercel) nadie lo pone — Vercel expone req.body ya parseado vía un getter
  // "lazy" que solo se dispara al accederlo, así que leemos el stream crudo
  // nosotros mismos ANTES de tocar req.body en cualquier lugar del archivo.
  // Antes se reconstruía con JSON.stringify(req.body), que no coincide byte
  // a byte con lo que Meta firmó para payloads más complejos (botones,
  // listas, multimedia) — solo texto simple pasaba la verificación por
  // casualidad, y el resto se rechazaba con 401 en silencio.
  let rawBody;
  if (typeof req.rawBody === 'string') {
    rawBody = req.rawBody;
  } else {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    rawBody = Buffer.concat(chunks).toString('utf8');
  }

  let parsedBody;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // Verificación de firma Meta (X-Hub-Signature-256) — fail-closed: sin
  // secreto configurado o sin header, se rechaza (antes se dejaba pasar).
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error('WHATSAPP_APP_SECRET no configurado — rechazando webhook');
    return res.status(401).send('Unauthorized');
  }
  const sigHeader = req.headers['x-hub-signature-256'] || '';
  const expected  = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(sigHeader);
  const expBuf = Buffer.from(expected);
  const firmaValida = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  if (!firmaValida) {
    console.warn('Firma Meta inválida — posible replay o spoofing:', sigHeader);
    return res.status(401).send('Unauthorized');
  }

  // Declarados fuera del try para poder reportarlos en el catch si algo falla
  let telefono = null;
  let paso = null;

  try {
    const body = parsedBody;
    if (body.object !== 'whatsapp_business_account') return res.status(200).send('OK');

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    // ── Callbacks de estado de WhatsApp (sent/delivered/read/failed) ────
    // Meta los envía en value.statuses, no en value.messages. Es la forma
    // canónica de saber que un mensaje NO llegó (status=failed con motivo).
    if (value?.statuses?.length) {
      for (const st of value.statuses) {
        await registrarEvento({
          tipo: 'estado', direccion: 'out',
          telefono: st.recipient_id, wamid: st.id, estado: st.status,
          error: st.errors?.[0]?.title || st.errors?.[0]?.message || null,
          detalle: st.errors ? { errors: st.errors } : null,
        });
      }
      return res.status(200).send('OK');
    }

    if (!value?.messages?.length) return res.status(200).send('OK');

    const msg            = value.messages[0];
    const nombreWhatsApp = value.contacts?.[0]?.profile?.name || 'estimado/a';
    telefono = msg.from;

    // ── Dedup: WhatsApp reintenta la entrega del webhook. Si este wamid ya
    // fue procesado, ignorar para no responder/avanzar el flujo dos veces. ──
    if (msg.id) {
      const esNuevo = await marcarProcesado(msg.id);
      if (!esNuevo) {
        await registrarEvento({ tipo: 'duplicado', direccion: 'in', telefono, wamid: msg.id });
        return res.status(200).send('OK');
      }
      await registrarEvento({
        tipo: 'entrante', direccion: 'in', telefono, wamid: msg.id,
        detalle: { type: msg.type, text: msg.text?.body?.slice(0, 200) || null },
      });
    }

    // ── Extraer texto (texto plano o respuesta de botón/lista) ──────────
    let mensaje = '';
    if (msg.type === 'text') {
      mensaje = (msg.text?.body || '').trim();

      // Detector global de crisis — intercepta ANTES de cualquier flujo
      if (detectarCrisis(mensaje)) {
        await alertar(
          `🆘 <b>CRISIS DETECTADA</b>\nTeléfono: ${telefono}\nNombre: ${nombreWhatsApp}\nMensaje: ${mensaje}`
        );
        await enviar(telefono,
          `🆘 Gracias por contarnos cómo te sientes. Eso toma mucho valor.\n\n` +
          `Si estás pensando en hacerte daño, por favor llama al *911* ahora o ve a la sala de emergencias más cercana.\n\n` +
          `Tu equipo médico fue notificado y se comunicará contigo muy pronto. No estás solo/a. 💙`
        );
        return res.status(200).send('OK');
      }
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
      procesarCallCenter, buscarEmpresaPorCodigo, procesarTracking, procesarRespuestaMed,
      procesarB2C, procesarSeguimientoPago, procesarMigracion, procesarPreguntaConsulta,
      procesarBiometricos, procesarPsicosocial,
      confirmarConsultaFueraHorario, confirmarMigracionFueraHorario, confirmarCallCenterFueraHorario
    } = getFlows();

    // Comando global de salida — funciona en cualquier paso de cualquier flujo
    // (ej. si el paciente no tiene el comprobante de pago o el examen de
    // laboratorio a la mano y quiere cancelar en vez de quedarse atascado
    // esperando a que se le pida una foto).
    if (['cancelar', 'salir', 'menu', 'menú'].includes(mensaje.toLowerCase())) {
      const habiaSesion = await obtener(telefono);
      await eliminar(telefono);
      if (habiaSesion) {
        await enviar(telefono, `❌ Proceso cancelado.\n\nEscribe *hola* cuando quieras empezar de nuevo.`);
      } else {
        await enviar(telefono, `No tienes ningún proceso activo en este momento.\n\nEscribe *hola* para comenzar.`);
      }
      return res.status(200).send('OK');
    }

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
        if (!casoT.activado) {
          // Primera activación — marcar y arrancar bienestar directamente
          await qTracking('PATCH', 'tracking_casos', { activado: true }, `?id=eq.${casoT.id}`);
          const saludoTracking = (casoT.paciente_nombre || nombreWhatsApp) ? `Hola ${casoT.paciente_nombre || nombreWhatsApp}!` : '¡Hola!';
          await guardar(telefono, 'tracking', {
            tipo: 'bienestar',
            caso_id: casoT.id,
            empresa_id: casoT.empresa_id,
            paciente_nombre: casoT.paciente_nombre,
            diagnostico: casoT.diagnostico
          }, 'tracking');
          await enviarLista(telefono,
            `🩺 *Seguimiento MediLyft*\n\n${saludoTracking} Registramos tu activación de seguimiento.\n\n📋 Diagnóstico: ${casoT.diagnostico || '—'}\n\n¿Cómo te sientes hoy?`,
            [{ titulo: 'Bienestar de hoy', filas: [
              { id: '1', titulo: 'Muy bien', descripcion: '😊 Me siento muy bien' },
              { id: '2', titulo: 'Bien',     descripcion: '🙂 Me siento bien' },
              { id: '3', titulo: 'Regular',  descripcion: '😐 Más o menos' },
              { id: '4', titulo: 'Mal',      descripcion: '😞 Me siento mal' },
              { id: '5', titulo: 'Muy mal',  descripcion: '😢 Necesito atención' },
            ]}],
            'Seleccionar'
          );
        } else {
          // Ya activado — ofrecer elección entre reporte diario y consulta médica
          const nombre = casoT.paciente_nombre || nombreWhatsApp;
          await enviarBotones(telefono,
            `¡Hola ${nombre}! 👋 ¿En qué te puedo ayudar hoy?`,
            [
              { id: 'tracking_reporte',  titulo: '📊 Reporte de seguimiento' },
              { id: 'tracking_consulta', titulo: '🏥 Consulta médica' }
            ]
          );
        }
        return res.status(200).send('OK');
      }

      // Si el paciente tiene una consulta completada en las últimas 72h, ofrecer
      // la opción de hacer una pregunta antes de iniciar un flujo nuevo.
      const { query: qPQ } = require('../src/services/supabase');
      const pacPQ = await qPQ('GET', 'pacientes', null, `?telefono=eq.${telefono}&select=id,nombre&limit=1`);
      if (pacPQ?.[0]) {
        const limite72h = new Date(Date.now() - 72 * 3600000).toISOString();
        const consultaPQ = await qPQ('GET', 'consultas', null,
          `?paciente_id=eq.${pacPQ[0].id}&estado=eq.completada&created_at=gte.${limite72h}&order=created_at.desc&limit=1`);
        if (consultaPQ?.[0]) {
          const c = consultaPQ[0];
          const fechaStr = new Date(c.created_at).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
          await guardar(telefono, 'pq_inicio', {
            _flujo: 'pregunta_consulta',
            consulta_id: c.id,
            paciente_id: pacPQ[0].id
          }, 'pregunta_consulta');
          await enviarBotones(telefono,
            `¡Hola ${pacPQ[0].nombre || nombreWhatsApp}! 👋\n\nVemos que tuvo una consulta el ${fechaStr}. ¿En qué le podemos ayudar?`,
            [
              { id: 'pq_pregunta', titulo: '❓ Tengo una pregunta' },
              { id: 'pq_nueva',    titulo: '🏥 Nueva consulta'    }
            ]
          );
          return res.status(200).send('OK');
        }
      }

      const result = await procesarPaso(0, mensaje, {}, telefono, nombreWhatsApp);
      await guardar(telefono, result.paso, result.datos, 'consulta');
      await despachar(telefono, result);
      return res.status(200).send('OK');
    }

    // Botón "¿Qué es esto?" de la plantilla de activación tracking
    if (mensaje === 'que_es_esto') {
      const { query: qTk } = require('../src/services/supabase');
      const casosTk = await qTk('GET', 'tracking_casos', null,
        `?telefono=eq.${telefono}&estado=eq.activo&limit=1`);
      if (casosTk?.[0]) {
        await enviarBotones(
          telefono,
          `MediLyft es el servicio de seguimiento médico de tu clínica. Te contactamos periódicamente para saber cómo evolucionas con tu tratamiento.\n\nNo reemplaza a tu médico — solo lo mantiene informado entre consultas.\n\n¿Quieres activarlo?`,
          [
            { id: 'hola',    titulo: '✅ Sí, continuar' },
            { id: 'ahora_no', titulo: '⏸ Ahora no' }
          ]
        );
      } else {
        await enviar(telefono, `Para iniciar una consulta médica escribe *hola*. 😊`);
      }
      return res.status(200).send('OK');
    }

    // Botón "Ahora no" — el paciente decidió no activar por el momento
    if (mensaje === 'ahora_no') {
      await enviar(telefono,
        `Entendido 👍\n\nCuando quieras empezar, escríbenos *hola* y activamos tu seguimiento.`
      );
      return res.status(200).send('OK');
    }

    // Botón "Reporte de seguimiento" (desde el menú de hola con tracking activo)
    if (mensaje === 'tracking_reporte') {
      const { query: qTr } = require('../src/services/supabase');
      const casosTr = await qTr('GET', 'tracking_casos', null,
        `?telefono=eq.${telefono}&estado=eq.activo&limit=1`);
      const cTr = casosTr?.[0];
      if (cTr) {
        const s = cTr.paciente_nombre ? `Hola ${cTr.paciente_nombre}!` : '¡Hola!';
        await guardar(telefono, 'tracking', {
          tipo: 'bienestar', caso_id: cTr.id, empresa_id: cTr.empresa_id,
          paciente_nombre: cTr.paciente_nombre, diagnostico: cTr.diagnostico
        }, 'tracking');
        await enviarLista(telefono,
          `🩺 *Seguimiento MediLyft*\n\n${s}\n\n📋 Diagnóstico: ${cTr.diagnostico || '—'}\n\n¿Cómo te sientes hoy?`,
          [{ titulo: 'Bienestar de hoy', filas: [
            { id: '1', titulo: 'Muy bien', descripcion: '😊 Me siento muy bien' },
            { id: '2', titulo: 'Bien',     descripcion: '🙂 Me siento bien' },
            { id: '3', titulo: 'Regular',  descripcion: '😐 Más o menos' },
            { id: '4', titulo: 'Mal',      descripcion: '😞 Me siento mal' },
            { id: '5', titulo: 'Muy mal',  descripcion: '😢 Necesito atención' },
          ]}],
          'Seleccionar'
        );
      } else {
        await enviar(telefono, `No encontramos un seguimiento activo. Para iniciar una consulta escribe *hola*.`);
      }
      return res.status(200).send('OK');
    }

    // Botón "Consulta médica" (desde el menú de hola con tracking activo)
    if (mensaje === 'tracking_consulta') {
      await eliminar(telefono);
      const result = await procesarPaso(0, mensaje, {}, telefono, nombreWhatsApp);
      await guardar(telefono, result.paso, result.datos, 'consulta');
      await despachar(telefono, result);
      return res.status(200).send('OK');
    }

    // Propuesta de consulta — el paciente acepta (botón enviado por cron desde el panel)
    if (mensaje === 'propuesta_consulta_si') {
      const { query: qPr } = require('../src/services/supabase');
      const casosPr = await qPr('GET', 'tracking_casos', null,
        `?telefono=eq.${telefono}&estado=eq.activo&limit=1`);
      const cPr = casosPr?.[0];
      if (!cPr) {
        await enviar(telefono, `No encontramos un caso de seguimiento activo. Escribe *hola* para comenzar.`);
        return res.status(200).send('OK');
      }
      await guardar(telefono, 'tm_inicio', {
        caso_id: cPr.id, empresa_id: cPr.empresa_id,
        paciente_nombre: cPr.paciente_nombre,
        diagnostico: cPr.diagnostico, tratamiento: cPr.tratamiento
      }, 'tracking_migracion');
      await enviarBotones(telefono,
        `¡Perfecto! 🙌 Para registrar tu consulta necesito un dato más.\n\n¿Tienes número de *cédula ecuatoriana*?`,
        [
          { id: 'propuesta_cedula_si', titulo: '✅ Sí, la tengo' },
          { id: 'propuesta_cedula_no', titulo: '➡️ No / Soy extranjero' }
        ]
      );
      return res.status(200).send('OK');
    }

    // Propuesta de consulta — el paciente declina
    if (mensaje === 'propuesta_consulta_no') {
      await enviar(telefono,
        `Entendido 👍\n\nCuando quieras una consulta escribe *hola* y selecciona *"🏥 Consulta médica"*. ¡Que te mejores pronto!`
      );
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
    // Cualquier sesión con flujo nombrado activo o paso >= 200 tiene prioridad
    // sobre los interceptores de seguimiento — evita que "Sí/No", "1/2/3" sean
    // capturados por recordatorios pasados mientras hay una conversación activa.
    // 'consulta' se excluye: sus pasos solo aceptan cédula/texto, nunca ratings 1-5,
    // por lo que el interceptor de bienestar puede disparar sin ambigüedad.
    const enCronica = (sesion?.datos?._flujo && sesion.datos._flujo !== 'consulta') || (typeof sesion?.paso === 'number' && sesion.paso >= 200);

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
        if (resultLab.paso) await guardar(telefono, resultLab.paso, resultLab.datos, 'laboratorio');
        await enviar(telefono, resultLab.respuesta);
        return res.status(200).send('OK');
      }
    }

    // Bienestar interactivo (lista_reply 1-5): se envía con enviarLista, no como texto libre,
    // por lo que no pasa por el interceptor de texto de arriba. Check separado aquí.
    if (esInteractivo && !enCronica) {
      const pendienteBienestar = await buscarRespuestaPendiente(telefono);
      if (pendienteBienestar?.respuesta?.recordatorios?.tipo === 'bienestar') {
        if (['1', '2', '3', '4', '5'].includes(mensaje)) {
          const resp = await procesarRespuestaSeguimiento(pendienteBienestar, mensaje, telefono);
          if (resp) {
            await enviar(telefono, resp);
            // Si había una consulta en curso, re-enviar el último mensaje del bot para
            // que el paciente sepa dónde continuar sin tener que escribir hola de nuevo.
            if (sesion?.paso > 0 && sesion?.datos?._ultimoMensajeBot) {
              await enviar(telefono, `📍 *Continuamos donde estábamos:*\n\n${sesion.datos._ultimoMensajeBot}`);
            }
            return res.status(200).send('OK');
          }
        }
      }
    }

    if (!sesion) sesion = { paso: 0, datos: {} };
    let datos;
    ({ paso, datos } = sesion);
    // Flujos no migrados (antecedentes=13, laboratorio=150, etc.) almacenan
    // pasos numéricos que la columna TEXT devuelve como strings — revertir aquí.
    if (typeof paso === 'string' && /^\d+$/.test(paso)) paso = parseInt(paso, 10);
    datos = datos || {};

    // ── Ruteo por flujo nombrado (Fase 2) ──────────────────────────────────
    const flujo = datos._flujo || null;

    if (flujo) {
      switch (flujo) {

        case 'tracking': {
          const result = datos.tipo === 'med_reminder'
            ? await procesarRespuestaMed(mensaje, datos, telefono)
            : await procesarTracking(paso, mensaje, datos, telefono);
          await despachar(telefono, result);

          // Después del check-in de bienestar, encadenar registro biométrico si está activo
          if (result.terminar && datos.tipo === 'bienestar' && datos.biometricos_activos) {
            const alturaGuardada = datos.altura || null;
            const pasoBio = alturaGuardada ? 'bio_presion' : 'bio_altura';
            const bioData = {
              _flujo:          'tracking_biometrico',
              caso_id:         datos.caso_id,
              empresa_id:      datos.empresa_id,
              paciente_nombre: datos.paciente_nombre,
              diagnostico:     datos.diagnostico,
              bienestar:       mensaje,
              altura:          alturaGuardada,
            };
            await guardar(telefono, pasoBio, bioData, 'tracking_biometrico');
            await enviar(telefono, pasoBio === 'bio_altura'
              ? `📊 *Registro biométrico*\n\nAntes de empezar, necesito tu altura para calcular tu IMC.\n\n¿Cuánto mides? Escribe solo el número en cm (ej: *170*).\nSolo te lo pregunto esta vez. 📏`
              : `📊 *Registro biométrico*\n\n¿Pudiste medir tu *presión arterial* hoy?\n\n` +
                `Escríbela así: *120/80* (sistólica/diastólica)\nSi no pudiste, responde *no medí*.`
            );
          }

          return res.status(200).send('OK');
        }

        case 'tracking_biometrico': {
          const result = await procesarBiometricos(paso, mensaje, datos, telefono);
          if (!result.terminar) await guardar(telefono, result.paso, result.datos ?? datos, 'tracking_biometrico');
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

        case 'psicosocial': {
          const result = await procesarPsicosocial(paso, mensaje, datos, telefono);
          if (!result.terminar) await guardar(telefono, result.paso, result.datos ?? datos, 'psicosocial');
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

        case 'callcenter': {
          const result = await procesarCallCenter(paso, mensaje, datos, telefono);
          if (!result.terminar) await guardar(telefono, result.paso, result.datos, 'callcenter');
          else await eliminar(telefono);
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

        case 'antecedentes': {
          const result = await procesarAntecedentes(paso, mensaje, datos, telefono);
          if (!result.terminar) await guardar(telefono, result.paso, result.datos, 'antecedentes');
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

        case 'cronicas': {
          const result = await procesarCronica(paso, mensaje, datos, telefono, nombreWhatsApp);
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

        case 'emergencia': {
          const BOTONES_EM = [
            { id: 'emergencia_911',      titulo: '📞 Llamar al 911'   },
            { id: 'emergencia_consulta', titulo: '🏥 Consulta urgente' },
          ];

          if (mensaje === 'emergencia_911') {
            await eliminar(telefono);
            await enviar(telefono,
              `📞 Marca el número *911* desde tu teléfono ahora mismo.\n\nTu equipo médico ya fue notificado. 🆘`
            );
            return res.status(200).send('OK');
          }

          if (mensaje === 'emergencia_consulta' || paso === 'em_cedula') {
            const { query: qEm } = require('../src/services/supabase');
            const { buscarPorCedula: buscarEm } = require('../src/services/pacientes');
            const { BOTONES_PAGO: BOTONES_PAGOEm } = require('../src/flows/flujo-b2c');

            let pacienteId = datos.paciente_id || null;

            if (paso === 'em_cedula') {
              // El paciente acaba de ingresar su cédula
              const cedula = mensaje.trim().replace(/\D/g, '');
              datos.cedula = cedula;
              const pac = await buscarEm(cedula);
              if (pac) {
                pacienteId = pac.id;
                datos.nombreCompleto   = datos.nombreCompleto   || `${pac.nombre || ''} ${pac.apellidos || ''}`.trim();
                datos.correo           = datos.correo           || pac.correo          || '';
                datos.edad             = datos.edad             || pac.edad            || '';
                datos.telefonoContacto = datos.telefonoContacto || pac.telefono        || telefono;
                datos.lugar_residencia = datos.lugar_residencia || pac.lugar_residencia || '';
              }
            }

            if (!pacienteId && datos.caso_id) {
              const caso = await qEm('GET', 'tracking_casos', null,
                `?id=eq.${datos.caso_id}&select=paciente_id&limit=1`);
              pacienteId = caso?.[0]?.paciente_id || null;
            }

            if (!pacienteId && datos.cedula) {
              const pac = await buscarEm(datos.cedula);
              if (pac) {
                pacienteId = pac.id;
                datos.nombreCompleto   = datos.nombreCompleto   || `${pac.nombre || ''} ${pac.apellidos || ''}`.trim();
                datos.correo           = datos.correo           || pac.correo          || '';
                datos.edad             = datos.edad             || pac.edad            || '';
                datos.telefonoContacto = datos.telefonoContacto || pac.telefono        || telefono;
                datos.lugar_residencia = datos.lugar_residencia || pac.lugar_residencia || '';
              }
            }

            if (!pacienteId) {
              await guardar(telefono, 'em_cedula', datos, 'emergencia');
              await enviar(telefono,
                `Para registrar su consulta de emergencia, necesitamos su *número de cédula:*`
              );
              return res.status(200).send('OK');
            }

            const datosB2C = {
              ...datos,
              _flujo:          'b2c',
              paciente_id:     pacienteId,
              sintomas:        `EMERGENCIA — ${datos.contexto || 'Consulta urgente'}`,
              nivel:           3,
              modalidad:       'b2c',
              correo:          datos.correo          || '',
              nombreCompleto:  datos.nombreCompleto  || nombreWhatsApp,
              edad:            datos.edad            || '',
              telefonoContacto: datos.telefonoContacto || telefono,
              lugar_residencia: datos.lugar_residencia || '',
            };
            await guardar(telefono, 'pago', datosB2C, 'b2c');
            await enviarBotones(telefono,
              `🏥 *Consulta de emergencia urgente*\n\n📋 ${datos.contexto || 'Emergencia médica'}\n\nEl costo de la teleconsulta es *$8.00*.\n\n¿Cómo desea realizar el pago?`,
              BOTONES_PAGOEm
            );
            return res.status(200).send('OK');
          }

          // Fallback: re-enviar botones
          await enviarBotones(telefono,
            `🚨 *Emergencia médica*\n\n¿Cómo desea proceder?`,
            BOTONES_EM
          );
          return res.status(200).send('OK');
        }

        case 'laboratorio': {
          const result = await procesarSubidaExamen(paso, mensaje, datos, telefono, msg);
          if (!result.terminar) await guardar(telefono, result.paso, result.datos, 'laboratorio');
          else await eliminar(telefono);
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

        case 'reagendar': {
          const result = await procesarReagendamiento(datos, mensaje, telefono);
          // Reagendar siempre transiciona a consulta (paso 3) o termina
          if (!result.terminar) await guardar(telefono, result.paso, result.datos, 'consulta');
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

        case 'b2c': {
          const result = await procesarB2C(paso, mensaje, datos, telefono, nombreWhatsApp, msg);
          const targetFlujoB2C = result.datos?._flujo;
          if (!result.terminar && (!targetFlujoB2C || targetFlujoB2C === 'b2c')) {
            await guardar(telefono, result.paso, result.datos, 'b2c');
          }
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

        case 'seguimiento_pago': {
          const result = await procesarSeguimientoPago(paso, mensaje, datos, telefono, nombreWhatsApp);
          if (!result.terminar) await guardar(telefono, result.paso, result.datos, 'seguimiento_pago');
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

        case 'seg_med': {
          const { recordatorio_id, medicamento, paciente_nombre } = datos;
          if (mensaje !== 'seg_med_si' && mensaje !== 'seg_med_no') {
            await enviarBotones(telefono, `¿Ya tomó su medicamento (*${medicamento}*)?`, [
              { id: 'seg_med_si', titulo: '✅ Sí, ya lo tomé' },
              { id: 'seg_med_no', titulo: '❌ No todavía'    }
            ]);
            return res.status(200).send('OK');
          }
          const tomo = mensaje === 'seg_med_si';
          const { query: qSegMed } = require('../src/services/supabase');
          await qSegMed('PATCH', 'seguimiento_respuestas', {
            respuesta: tomo ? 'Sí' : 'No',
            tomo_medicamento: tomo
          }, `?recordatorio_id=eq.${recordatorio_id}&respuesta=is.null`);
          if (!tomo) {
            await alertar(`⚠️ <b>Incumplimiento de tratamiento</b>\nPaciente: ${paciente_nombre || telefono}\nMedicamento: ${medicamento}\nTeléfono: ${telefono}`);
          }
          await eliminar(telefono);
          await enviar(telefono, tomo
            ? `✅ ¡Perfecto! Registro guardado.\n\nSiga tomando su medicamento según las indicaciones del médico. 💊\n\nSi presenta algún efecto adverso escríbanos *hola*.`
            : `⚠️ Recuerde que es importante seguir el tratamiento completo.\n\nIntente tomar *${medicamento}* lo antes posible.\n\nSi no puede tomarlo escríbanos *hola*.`
          );
          return res.status(200).send('OK');
        }

        case 'seg_fin_trat': {
          const { seguimiento_respuesta_id: srFinId, medicamento: medFin, paciente_id: pacFinId, consulta_id: conFinId, paciente_nombre: nombreFin } = datos;
          if (!['seg_fin_si', 'seg_fin_parcial', 'seg_fin_no'].includes(mensaje)) {
            await enviarBotones(telefono, `¿Cómo se siente después del tratamiento con *${medFin}*?`, [
              { id: 'seg_fin_si',      titulo: '😊 Me siento mejor'  },
              { id: 'seg_fin_parcial', titulo: '😐 Sigo con síntomas' },
              { id: 'seg_fin_no',      titulo: '😟 No mejoré'         }
            ]);
            return res.status(200).send('OK');
          }
          const { query: qFin } = require('../src/services/supabase');
          const { crearNotificacion: notifFin } = require('../src/services/consultas');
          if (mensaje === 'seg_fin_si') {
            if (srFinId) await qFin('PATCH', 'seguimiento_respuestas', { respuesta: 'curado', se_siente_mejor: true }, `?id=eq.${srFinId}`);
            await alertar(`✅ <b>Tratamiento exitoso</b>\nPaciente: ${nombreFin || telefono}\nMedicamento: ${medFin}`);
            await eliminar(telefono);
            await enviar(telefono, `🎉 ¡Nos alegra mucho que se sienta mejor!\n\nSu caso fue registrado como *exitoso*.\n\nEn MediLyft estamos disponibles 24/7. Si necesita atención escriba *hola*. 💙`);
          } else if (mensaje === 'seg_fin_parcial') {
            if (srFinId) await qFin('PATCH', 'seguimiento_respuestas', { respuesta: 'parcial' }, `?id=eq.${srFinId}`);
            await notifFin('seguimiento', '🔁 Paciente con síntomas persistentes',
              `${nombreFin || telefono} mejoró parcialmente pero aún presenta síntomas (medicamento: ${medFin || '—'}).`,
              pacFinId, conFinId || null,
              { origen: 'seguimiento', categoria: 'medio', etiqueta: 'SEGUIMIENTO', estado_validacion: 'pendiente', seguimiento_respuesta_id: srFinId });
            await eliminar(telefono);
            await enviar(telefono, `👨‍⚕️ Gracias por contarnos. Hemos registrado que aún presenta síntomas.\n\nUn médico revisará su caso y, si lo considera necesario, le contactaremos para agendar una *consulta de seguimiento*.\n\nSi desea atención ahora escríbanos *hola*. 💙`);
          } else {
            if (srFinId) await qFin('PATCH', 'seguimiento_respuestas', { respuesta: 'sin_mejora' }, `?id=eq.${srFinId}`);
            await alertar(`🔴 <b>Sin mejoría — requiere atención</b>\nPaciente: ${nombreFin || telefono}\nMedicamento: ${medFin}\nTeléfono: ${telefono}`);
            await notifFin('seguimiento', '🔴 Paciente sin mejoría',
              `${nombreFin || telefono} indica que NO mejoró o empeoró (medicamento: ${medFin || '—'}).`,
              pacFinId, conFinId || null,
              { origen: 'seguimiento', categoria: 'grave', etiqueta: 'SEGUIMIENTO', estado_validacion: 'pendiente', seguimiento_respuesta_id: srFinId });
            await eliminar(telefono);
            await enviar(telefono, `😟 Lamentamos que no se sienta mejor. Hemos alertado a un médico para revisar su caso con prioridad.\n\nLe contactaremos en breve. Si los síntomas son graves, *llame al 911* o escríbanos *hola*. 💙`);
          }
          return res.status(200).send('OK');
        }

        case 'seg_bienestar': {
          const { seguimiento_respuesta_id: srBienId, paciente_id: pacBienId, consulta_id: conBienId, paciente_nombre: nombreBien } = datos;
          const nivel = parseInt(mensaje);
          if (isNaN(nivel) || nivel < 1 || nivel > 5) {
            await enviarLista(telefono, '¿Cómo te sientes hoy?', [{ titulo: 'Bienestar de hoy', filas: [
              { id: '1', titulo: '⭐⭐⭐⭐⭐ Excelente', descripcion: 'Me siento muy bien' },
              { id: '2', titulo: '⭐⭐⭐⭐ Bien',        descripcion: 'Me siento bien' },
              { id: '3', titulo: '⭐⭐⭐ Regular',       descripcion: 'Más o menos' },
              { id: '4', titulo: '⭐⭐ Mal',            descripcion: 'Me siento mal' },
              { id: '5', titulo: '⭐ Muy mal',          descripcion: 'Necesito atención urgente' }
            ]}], 'Seleccionar');
            return res.status(200).send('OK');
          }
          const { query: qBien } = require('../src/services/supabase');
          const { crearNotificacion: notifBien } = require('../src/services/consultas');
          if (srBienId) await qBien('PATCH', 'seguimiento_respuestas', { respuesta: String(nivel), nivel_bienestar: nivel }, `?id=eq.${srBienId}`);
          if (nivel === 4) {
            await notifBien('seguimiento', `💙 Bienestar bajo — ${nombreBien || telefono}`,
              `${nombreBien || telefono} reportó bienestar nivel ${nivel}/5 (Mal). Revisar.`,
              pacBienId, conBienId || null,
              { origen: 'seguimiento', categoria: 'medio', etiqueta: 'BIENESTAR', estado_validacion: 'pendiente', seguimiento_respuesta_id: srBienId });
          } else if (nivel === 5) {
            await alertar(`🔴 <b>Bienestar muy bajo</b>\nPaciente: ${nombreBien || telefono}\nNivel: 5/5 (Muy mal)\nTeléfono: ${telefono}`);
            await notifBien('seguimiento', `🔴 Bienestar crítico — ${nombreBien || telefono}`,
              `${nombreBien || telefono} reportó bienestar nivel 5/5 (Muy mal). Requiere atención prioritaria.`,
              pacBienId, conBienId || null,
              { origen: 'seguimiento', categoria: 'grave', etiqueta: 'BIENESTAR', estado_validacion: 'pendiente', seguimiento_respuesta_id: srBienId });
          }
          await eliminar(telefono);
          const respBien = ['','💙 ¡Qué bueno saberlo! Nos alegra que te sientas excelente.','💙 Bien, sigue cuidándote.','💙 Gracias por contarnos. Si algo cambia, escríbenos *hola*.','💙 Entendido. Tu médico estará informado. Si lo necesitas escríbenos *hola*.','💙 Lamentamos que te sientas así. Hemos notificado a tu médico con prioridad. Si es urgente llama al *911*.'];
          await enviar(telefono, respBien[nivel]);
          return res.status(200).send('OK');
        }

        case 'seg_lab': {
          const { seg_lab_respuesta_id: srLabId, seguimiento_id: segLabId, paciente_id: pacLabId, consulta_id: conLabId } = datos;
          if (mensaje !== 'seg_lab_si' && mensaje !== 'seg_lab_no') {
            await enviarBotones(telefono, '¿Ya se realizó el examen de laboratorio?', [
              { id: 'seg_lab_si', titulo: '✅ Sí, ya lo hice' },
              { id: 'seg_lab_no', titulo: '❌ Aún no'         }
            ]);
            return res.status(200).send('OK');
          }
          const { query: qLab } = require('../src/services/supabase');
          if (mensaje === 'seg_lab_si') {
            if (srLabId) await qLab('PATCH', 'seguimiento_laboratorio_respuestas', { respuesta: 'si' }, `?id=eq.${srLabId}`);
            if (segLabId) await qLab('PATCH', 'seguimiento_laboratorio', { activo: false, estado: 'confirmado' }, `?id=eq.${segLabId}`);
            await guardar(telefono, 150, { _flujo: 'laboratorio', paciente_id: pacLabId, consulta_id: conLabId }, 'laboratorio');
            await enviar(telefono, `📋 ¡Excelente! Por favor envíenos la *foto o el PDF* del resultado de su examen de laboratorio.`);
          } else {
            if (srLabId) await qLab('PATCH', 'seguimiento_laboratorio_respuestas', { respuesta: 'no' }, `?id=eq.${srLabId}`);
            await eliminar(telefono);
            await enviar(telefono, `Entendido, gracias. Le preguntaremos nuevamente más adelante.`);
          }
          return res.status(200).send('OK');
        }

        case 'tracking_migracion': {
          const result = await procesarMigracion(paso, mensaje, datos, telefono);
          const targetFlujoM = result.datos?._flujo;
          if (!result.terminar && (!targetFlujoM || targetFlujoM === 'tracking_migracion')) {
            await guardar(telefono, result.paso ?? paso, result.datos ?? datos, 'tracking_migracion');
          } else if (result.terminar) {
            await eliminar(telefono);
          }
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

        case 'fuera_horario': {
          if (mensaje === 'fuera_horario_agendar') {
            let result;
            if (datos._pendingOrigen === 'b2c') {
              const { BOTONES_PAGO: BP } = require('../src/flows/flujo-b2c');
              const b2cDatos = { ...datos, _flujo: 'b2c' };
              await guardar(telefono, 'pago', b2cDatos, 'b2c');
              result = {
                respuesta: `✅ Perfecto, tu consulta será atendida ${datos._proximaTexto}.\n\nEl costo de la teleconsulta es *$8.00*.\n\n¿Cómo desea realizar el pago?`,
                paso: 'pago', datos: b2cDatos, terminar: false,
                botones: BP
              };
            } else if (datos._pendingOrigen === 'callcenter') {
              result = await confirmarCallCenterFueraHorario(datos, telefono);
            } else if (datos._pendingOrigen === 'tracking') {
              result = await confirmarMigracionFueraHorario(datos, telefono);
            } else {
              result = await confirmarConsultaFueraHorario(datos, telefono);
            }
            await despachar(telefono, result);
          } else {
            await eliminar(telefono);
            await enviar(telefono, 'Entendido. Puedes escribirnos cuando quieras. 👋');
          }
          return res.status(200).send('OK');
        }

        case 'pregunta_consulta': {
          const result = await procesarPreguntaConsulta(paso, mensaje, datos, telefono);
          if (result._iniciarConsulta) {
            await eliminar(telefono);
            const newResult = await procesarPaso('cedula', '', {}, telefono, nombreWhatsApp);
            await guardar(telefono, newResult.paso, newResult.datos, 'consulta');
            await despachar(telefono, newResult);
            return res.status(200).send('OK');
          }
          if (!result.terminar) await guardar(telefono, result.paso, result.datos, 'pregunta_consulta');
          else await eliminar(telefono);
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

        case 'consulta': {
          let result = await procesarPaso(paso, mensaje, datos, telefono, nombreWhatsApp, msg);
          if (result._redirect) {
            const ccResult = await procesarCallCenter('cc_inicio', '', result._redirect.datos, telefono);
            await guardar(telefono, ccResult.paso, ccResult.datos, 'callcenter');
            await despachar(telefono, ccResult);
            return res.status(200).send('OK');
          }
          // Si la delegación interna (B2C o seguimiento_pago) ya guardó con su propio
          // _flujo, no sobreescribir — result.datos._flujo diferente a 'consulta' lo indica.
          const targetFlujo = result.datos?._flujo;
          if (!result.terminar && (!targetFlujo || targetFlujo === 'consulta')) {
            result.datos._ultimoMensajeBot = result.respuesta;
            await guardar(telefono, result.paso, result.datos, 'consulta');
          }
          await despachar(telefono, result);
          return res.status(200).send('OK');
        }

      }
    }

    // Fallback: sin _flujo → flujo de consulta (usuario sin sesión activa)
    let result = await procesarPaso(paso, mensaje, datos, telefono, nombreWhatsApp, msg);
    if (result._redirect) {
      const ccResult = await procesarCallCenter(300, '', result._redirect.datos, telefono);
      await guardar(telefono, ccResult.paso, ccResult.datos, 'callcenter');
      await despachar(telefono, ccResult);
      return res.status(200).send('OK');
    }
    if (!result.terminar) {
      result.datos._ultimoMensajeBot = result.respuesta;
      await guardar(telefono, result.paso, result.datos, 'consulta');
    }
    await despachar(telefono, result);
    return res.status(200).send('OK');

  } catch (err) {
    console.error('Error en webhook:', err.message);

    await registrarEvento({
      tipo: 'error', telefono, paso, error: err.message,
      detalle: { stack: err.stack?.split('\n').slice(0, 3).join(' | ') || null },
    });

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
