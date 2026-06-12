const { crear: crearConsulta, crearNotificacion, nivelACategoria } = require('../services/consultas');
const { buscarPorCedula, crear: crearPaciente } = require('../services/pacientes');
const { guardar, eliminar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');
const { descargarMedia } = require('../services/whatsapp');
const { subirArchivo, registrarDocumento } = require('../services/documentos');
const { analizarComprobante } = require('../services/gemini');
const { query } = require('../services/supabase');
const { clasificarSintomas, esSi, inferirSexo, separarNombre } = require('../utils/validaciones');
const { mensajeBienvenida } = require('./flujo-inicio');
const { estaEnHorarioAtencion, proximaApertura, mensajeFueraHorario, BOTONES_HORARIO } = require('../utils/horarios');

const MONTO_TELECONSULTA = 8.00;

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_KEY;

const SEGUROS_ALIADOS = [
  'vitaldent', 'seguros aliados', 'bupa', 'metlife', 'equivida',
  'integral', 'panamericana', 'latina seguros', 'sucre', 'qbe'
];

const BOTONES_PAGO = [
  { id: 'transferencia', titulo: '🏦 Transferencia' },
  { id: 'tarjeta',       titulo: '💳 Con tarjeta'   },
];

// Mensaje uniforme cuando el usuario no responde con uno de los botones esperados
const MSG_REINTENTAR_BOTON = `No entendí su respuesta. Por favor toque uno de los botones de arriba 👆\n\n¿Cómo desea realizar el pago?`;

// ¿El mensaje confirma el envío del comprobante de pago?
// Requiere una imagen/documento adjunto, o una palabra clave explícita de confirmación.
function esConfirmacionComprobante(mensaje) {
  const m = mensaje.trim().toLowerCase();
  return mensaje === '__media__' ||
    /\b(listo|enviado|envie|envié|pagado|pagu[ée]|hecho|realizad[oa]|comprobante)\b/.test(m);
}

async function registrarFacturacionB2C(datos) {
  const ahora = new Date();
  const body = {
    nombre_completo: datos.nombreCompleto || '',
    cedula: datos.cedula || '',
    correo: datos.correo || '',
    telefono: datos.telefonoContacto || datos.telefono || '',
    direccion: datos.lugar_residencia || '',
    fecha_consulta: ahora.toISOString(),
    monto: 8.00,
    forma_pago: datos.forma_pago || '',
    comprobante_url: datos.comprobante_ref || '',
    estado_factura: 'pendiente',
    sintomas: datos.sintomas || '',
    nivel_sintomas: datos.nivel || 1,
    mes: ahora.getMonth() + 1,
    anio: ahora.getFullYear()
  };
  const res = await fetch(`${SUPA_URL}/rest/v1/facturacion_b2c`, {
    method: 'POST',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Supabase POST facturacion_b2c: ${data?.message || `HTTP ${res.status}`}`);
  }
}

function esSeguroAliado(nombre) {
  const n = nombre.toLowerCase().trim();
  return SEGUROS_ALIADOS.some(s => n.includes(s));
}

async function procesarB2C(paso, mensaje, datos, telefono, nombreWhatsApp, msg) {
  let respuesta = '';
  let nuevoPaso = paso;

  const LISTA_MODALIDAD = {
    secciones: [{
      titulo: 'Seleccione una opción',
      filas: [
        {
          id: 'seguro',
          titulo: '🏥 Mi seguro es afiliado',
          descripcion: 'Mi seguro/empresa es afiliada a MediLyft'
        },
        {
          id: 'directo',
          titulo: '💳 Pago directo $8.00',
          descripcion: 'Teleconsulta particular sin seguro'
        }
      ]
    }],
    botonTexto: '📋 Seleccionar'
  };

  // Paso 50: preguntar si tiene seguro o pago directo
  if (paso === 50) {
    return {
      respuesta: `No encontramos su cédula *${datos.cedula}* en nuestro sistema.\n\n¿Cómo desea continuar?`,
      paso: 51, datos, terminar: false,
      lista: LISTA_MODALIDAD
    };

  } else if (paso === 51) {
    const m = mensaje.trim().toLowerCase();
    if (m === '1' || m === 'seguro') {
      respuesta = `Por favor indíquenos el nombre de su seguro médico o empresa:`;
      nuevoPaso = 52;
    } else if (m === '2' || m === 'directo') {
      respuesta = `Perfecto. La teleconsulta tiene un costo de *$8.00*.\n\nPor favor indíquenos su *nombre y apellidos completos:*`;
      datos.modalidad = 'b2c';
      nuevoPaso = 53;
    } else {
      return { respuesta: `Por favor selecciona una opción:`, paso: 51, datos, terminar: false, lista: LISTA_MODALIDAD };
    }

  } else if (paso === 52) {
    if (esSeguroAliado(mensaje)) {
      respuesta = `✅ Su seguro *${mensaje}* forma parte de nuestra red de alianzas.\n\nPor favor indíquenos su *nombre y apellidos completos:*`;
      datos.seguro_nombre = mensaje;
      datos.modalidad = 'b2b_externo';
      nuevoPaso = 53;
    } else {
      datos.seguro_rechazado = mensaje;
      return {
        respuesta: `Su seguro/empresa *${mensaje}* no forma parte de nuestra red de alianzas.\n\n¿Desea continuar con pago directo ($8.00)?`,
        paso: 61, datos, terminar: false,
        botones: [
          { id: 'si',  titulo: '✅ Sí, continuar' },
          { id: 'no',  titulo: '❌ No, cancelar'  },
        ]
      };
    }

  } else if (paso === 61) {
    if (esSi(mensaje)) {
      respuesta = `Entendido. La teleconsulta tiene un costo de *$8.00*.\n\nPor favor indíquenos su *nombre y apellidos completos:*`;
      datos.modalidad = 'b2c';
      nuevoPaso = 53;
    } else {
      respuesta = `Entendido. Si cambia de opinión escríbanos *hola*. 👋`;
      await eliminar(telefono);
      return { respuesta, paso: 0, datos, terminar: true };
    }

  } else if (paso === 53) {
    datos.nombreCompleto = mensaje.trim();
    respuesta = `*Edad:*`;
    nuevoPaso = 54;

  } else if (paso === 54) {
    datos.edad = mensaje;
    respuesta = `*Correo electrónico:*`;
    nuevoPaso = 55;

  } else if (paso === 55) {
    datos.correo = mensaje;
    return {
      respuesta: `*Número de teléfono de contacto:*\n\n¿Desea usar el número desde el que nos escribe (*${telefono}*) o prefiere indicar otro?`,
      paso: 62, datos, terminar: false,
      botones: [
        { id: 'actual', titulo: '📱 Usar este número' },
        { id: 'otro',   titulo: '✏️ Indicar otro'     },
      ]
    };

  } else if (paso === 62) {
    const m = mensaje.trim().toLowerCase();
    if (m === 'actual' || m.includes('usar este')) {
      datos.telefonoContacto = telefono;
      respuesta = `*Lugar de residencia* (ciudad y barrio):`;
      nuevoPaso = 57;
    } else {
      respuesta = `Indíquenos el número de teléfono que desea registrar:`;
      nuevoPaso = 56;
    }

  } else if (paso === 56) {
    datos.telefonoContacto = mensaje;
    respuesta = `*Lugar de residencia* (ciudad y barrio):`;
    nuevoPaso = 57;

  } else if (paso === 57) {
    datos.lugar_residencia = mensaje;
    respuesta = `¿Cuál es el motivo de su consulta?\n\nDescríbanos sus síntomas con detalle:`;
    nuevoPaso = 58;

  } else if (paso === 58) {
    const nivel = clasificarSintomas(mensaje);
    datos.sintomas = mensaje;
    datos.nivel = nivel;

    if (nivel === 3) {
      await alertar(`🚨 <b>EMERGENCIA - PACIENTE B2C</b>\nNombre: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      await eliminar(telefono);
      return {
        respuesta: `🚨 *EMERGENCIA MÉDICA* 🚨\n\nSus síntomas indican una situación de *riesgo vital*.\n\n*Llame al 911 AHORA MISMO.*\n\n📞 tel:911`,
        paso: 0, datos, terminar: true
      };
    } else if (nivel === 2) {
      await alertar(`⚠️ <b>SÍNTOMAS MEDIOS - B2C</b>\nNombre: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
    }

    if (!estaEnHorarioAtencion()) {
      return {
        respuesta: mensajeFueraHorario(),
        paso: 64, datos, terminar: false,
        botones: BOTONES_HORARIO
      };
    }

    return {
      respuesta: `✅ Sus síntomas han sido registrados.\n\nEl costo de la teleconsulta es *$8.00*.\n\n¿Cómo desea realizar el pago?`,
      paso: 59, datos, terminar: false,
      botones: BOTONES_PAGO
    };

  } else if (paso === 64) {
    const m = mensaje.trim().toLowerCase();
    if (m === 'confirmar' || m.includes('confirmar')) {
      datos.inicio_atencion = proximaApertura().toISOString();
      return {
        respuesta: `✅ Sus síntomas han sido registrados.\n\nEl costo de la teleconsulta es *$8.00*.\n\n¿Cómo desea realizar el pago?`,
        paso: 59, datos, terminar: false,
        botones: BOTONES_PAGO
      };
    } else if (m === 'abandonar' || m.includes('abandonar')) {
      await eliminar(telefono);
      return {
        respuesta: `Entendido. Cuando lo desee, escríbanos *hola* para iniciar de nuevo. 👋`,
        paso: 0, datos, terminar: true
      };
    } else {
      return { respuesta: mensajeFueraHorario(), paso: 64, datos, terminar: false, botones: BOTONES_HORARIO };
    }

  } else if (paso === 59) {
    const m = mensaje.trim().toLowerCase();
    if (m === '1' || m === 'transferencia') {
      datos.forma_pago = 'transferencia';
      respuesta = `🏦 *Datos para transferencia:*\n\n🏦 Banco Internacional\n📋 Cuenta Corriente: *640618402*\n🏢 RUC: *1793197189001*\n💰 Monto: *$8.00*\n📝 Concepto: Teleconsulta MediLyft\n\nRealice la transferencia y envíenos la *captura de pantalla COMPLETA* del comprobante (sin recortar), donde se vea el *logo del banco*, *beneficiario*, *monto*, *fecha y hora*, y *número de referencia*.`;
      nuevoPaso = 60;
    } else if (m === '2' || m === 'tarjeta') {
      datos.forma_pago = 'tarjeta';
      respuesta = `💳 *Pago con tarjeta:*\n\nHaga clic en el siguiente enlace para pago seguro de *$8.00*:\n\nhttps://app.pagoplux.com/paybox/MTc4OA%3D%3D/MA%3D%3D/OA%3D%3D/UEFHTyBWSURFTyBDT05TVUxUQQ%3D%3D\n\nUna vez realizado el pago, envíenos la *captura de pantalla COMPLETA* del comprobante (sin recortar), donde se vea el *monto*, *fecha y hora*, y *número de referencia*.`;
      nuevoPaso = 60;
    } else {
      return { respuesta: MSG_REINTENTAR_BOTON, paso: 59, datos, terminar: false, botones: BOTONES_PAGO };
    }

  } else if (paso === 60) {
    // Solo se acepta la foto/captura real del comprobante — se verifica con Gemini Vision
    const media = msg?.image || msg?.document;

    if (mensaje !== '__media__' || !media?.id) {
      respuesta = `Por favor envíenos la *foto o captura del comprobante* de su transferencia (monto *$8.00*) para confirmar su consulta.`;
      nuevoPaso = 60;

    } else {
      let buffer, mimeType, storagePath;
      try {
        ({ buffer, mimeType } = await descargarMedia(media.id));
        const extension = mimeType?.split('/')[1] || 'jpg';
        const carpeta = (telefono || 'sin-telefono').replace(/\D/g, '');
        storagePath = await subirArchivo(carpeta, 'comprobante', buffer, extension, mimeType || 'image/jpeg');
      } catch (e) {
        console.error('Error descargando/subiendo comprobante:', e.message);
        return {
          respuesta: `⚠️ Hubo un problema al recibir su imagen. Por favor intente enviarla nuevamente.`,
          paso: 60, datos, terminar: false
        };
      }

      let verificacion = null;
      try {
        verificacion = await analizarComprobante(buffer, mimeType);
      } catch (e) {
        console.error('Error analizando comprobante con Gemini:', e.message);
      }

      const coincideMonto = typeof verificacion?.monto === 'number' &&
        Math.abs(verificacion.monto - MONTO_TELECONSULTA) < 0.01;
      const beneficiarioValido = !!verificacion?.beneficiario &&
        /medilyft|1793197189001/i.test(verificacion.beneficiario);

      // ¿Esta referencia ya fue usada en un comprobante aprobado antes? (evita reutilizar el mismo comprobante)
      let referenciaDuplicada = false;
      if (verificacion?.referencia) {
        const previos = await query('GET', 'verificaciones_comprobante', null,
          `?referencia=eq.${encodeURIComponent(verificacion.referencia)}&aprobado=eq.true&select=id`
        ).catch(() => []);
        referenciaDuplicada = Array.isArray(previos) && previos.length > 0;
      }

      // Checks obligatorios: previenen fraude/cobro incorrecto, no admiten excepción
      const pasaObligatorios = !!verificacion?.es_comprobante && coincideMonto && !referenciaDuplicada;

      // Checks secundarios: dependen de la calidad de la foto/lectura de Gemini.
      // Se exige un mínimo de 75% (3 de 4) para tolerar fallos puntuales de un check aislado.
      const checksSecundarios = {
        captura_completa: !!verificacion?.captura_completa,
        logo_banco_valido: !!verificacion?.logo_banco_valido,
        fecha_reciente: !!verificacion?.fecha_reciente,
        beneficiario_valido: beneficiarioValido,
      };
      const totalSecundarios = Object.keys(checksSecundarios).length;
      const aprobadosSecundarios = Object.values(checksSecundarios).filter(Boolean).length;
      const scoreSecundarios = aprobadosSecundarios / totalSecundarios;

      const aprobado = pasaObligatorios && scoreSecundarios >= 0.75;

      // Registrar el intento (aprobado o no) para auditoría
      await query('POST', 'verificaciones_comprobante', {
        telefono,
        storage_path: storagePath,
        es_comprobante: !!verificacion?.es_comprobante,
        captura_completa: checksSecundarios.captura_completa,
        logo_banco_valido: checksSecundarios.logo_banco_valido,
        banco: verificacion?.banco || null,
        monto: verificacion?.monto ?? null,
        monto_esperado: MONTO_TELECONSULTA,
        coincide_monto: coincideMonto,
        fecha_reciente: checksSecundarios.fecha_reciente,
        score_secundarios: scoreSecundarios,
        aprobado,
        fecha_comprobante: verificacion?.fecha || null,
        referencia: verificacion?.referencia || null,
        beneficiario: verificacion?.beneficiario || null,
        observaciones: verificacion?.observaciones || null,
      }).catch(e => console.error('Error guardando verificación de comprobante:', e.message));

      if (referenciaDuplicada) {
        return {
          respuesta: `❌ Este comprobante ya fue utilizado anteriormente.\n\nPor favor realice una *nueva transferencia* de $8.00 y envíe el comprobante correspondiente.`,
          paso: 60, datos, terminar: false
        };
      }

      if (!aprobado) {
        return {
          respuesta: `❌ No pudimos validar su comprobante.\n\nVerifique que la imagen sea una *captura de pantalla completa* (sin recortar) donde se vea:\n• El *logo del banco*\n• El *beneficiario*\n• El monto exacto de *$8.00*\n• La *fecha y hora* (de las últimas 48 horas)\n• El *número de referencia*\n\nPor favor envíe nuevamente la captura del comprobante.`,
          paso: 60, datos, terminar: false
        };
      }

      datos.comprobante_ref = storagePath;

      // 1. Crear o reutilizar paciente en BD
      let pacienteId = datos.paciente_id || null;
      if (!pacienteId) {
        const { nombre, apellidos } = separarNombre(datos.nombreCompleto);
        const existente = await buscarPorCedula(datos.cedula);
        if (existente) {
          pacienteId = existente.id;
        } else {
          const nuevo = await crearPaciente({
            cedula: datos.cedula || '',
            nombre,
            apellidos,
            edad: datos.edad || null,
            sexo: inferirSexo(datos.nombreCompleto || nombre),
            correo: datos.correo || '',
            telefono: datos.telefonoContacto || telefono,
            lugar_residencia: datos.lugar_residencia || '',
          });
          pacienteId = nuevo?.id || null;
        }
        datos.paciente_id = pacienteId;
      }

      // 2. Crear consulta
      const inicioAtencion = datos.inicio_atencion ? new Date(datos.inicio_atencion) : new Date();
      const consulta = await crearConsulta({
        paciente_id: pacienteId,
        nivel_sintomas: datos.nivel || 1,
        sintomas_descripcion: datos.sintomas || '',
        estado: 'pendiente',
        inicio_atencion: inicioAtencion.toISOString(),
      });

      // 3. Crear notificación en el panel
      const esAliado = datos.modalidad === 'b2b_externo';
      await crearNotificacion(
        'nueva_consulta',
        esAliado ? '🏥 Nuevo pago — Seguro aliado' : '💰 Nuevo pago B2C',
        `${datos.nombreCompleto} registró teleconsulta (${esAliado ? `seguro: ${datos.seguro_nombre}` : 'pago directo $8.00'})`,
        pacienteId,
        consulta?.id,
        { origen: esAliado ? 'b2b' : 'b2c', categoria: nivelACategoria(datos.nivel), etiqueta: esAliado ? 'PAGO SEGURO' : 'PAGO', inicio_atencion: inicioAtencion.toISOString() }
      );

      // 4. Registrar en facturacion_b2c
      await registrarFacturacionB2C(datos);

      // 5. Registrar documento del comprobante
      await registrarDocumento(pacienteId, consulta?.id, 'comprobante', datos.comprobante_ref).catch(e =>
        console.error('Error registrando documento comprobante:', e.message)
      );

      // 6. Alertar al operador
      await alertar(`💰 <b>NUEVO PAGO DIRECTO B2C - MEDILYFT</b>\nNombre: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nCorreo: ${datos.correo}\nSíntomas: ${datos.sintomas}\nPago: ${datos.forma_pago}\nMonto: $8.00`);

      return {
        respuesta: `✅ *¡Pago confirmado!*\n\n🎉 Su teleconsulta ha sido registrada exitosamente.\n\nUn asesor de *MediLyft* le contactará en breve para confirmar el horario.\n\n📧 La factura electrónica será enviada a *${datos.correo}*.\n\n¡Gracias por confiar en MediLyft! 💙`,
        paso: 63, datos, terminar: false,
        botones: [
          { id: 'otra_consulta', titulo: '✅ Otra consulta'     },
          { id: 'finalizar',     titulo: '🔚 Finalizar proceso' },
        ]
      };
    }

  } else if (paso === 63) {
    if (mensaje === 'otra_consulta' || mensaje.toLowerCase().includes('otra consulta')) {
      return mensajeBienvenida(nombreWhatsApp);
    } else {
      return {
        respuesta: `Para completar su historia clínica necesitamos algunas preguntas más:\n\n💊 ¿Tiene *alergias* conocidas a medicamentos o alimentos?\n\nResponda *No* o descríbalas brevemente.`,
        paso: 13, datos, terminar: false
      };
    }
  }

  return { respuesta, paso: nuevoPaso, datos, terminar: false };
}

module.exports = { procesarB2C, BOTONES_PAGO, MSG_REINTENTAR_BOTON, registrarFacturacionB2C, esConfirmacionComprobante };
