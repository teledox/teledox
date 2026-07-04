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
const { estaEnHorario, proximaApertura } = require('../utils/horarioOperacion');
const { mensajeFueraHorario } = require('../utils/mensajesFueraHorario');
const { DEMO_PHONE_NUMBERS } = require('../config');

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

const MSG_REINTENTAR_BOTON = `No entendí su respuesta. Por favor toque uno de los botones de arriba 👆\n\n¿Cómo desea realizar el pago?`;

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

// Crea paciente (si no existe) + consulta + notificación + factura + registro
// de documento — el mismo camino que sigue un pago real ya verificado, para
// que tanto el pago aprobado por Gemini como el bypass de demo (DEMOTEST)
// terminen en una consulta real visible en el panel, no solo en un mensaje
// de WhatsApp que aparenta éxito sin dejar rastro en la base de datos.
async function crearConsultaB2C(datos, telefono) {
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
        sexo: datos.sexo || inferirSexo(datos.nombreCompleto || nombre),
        correo: datos.correo || '',
        telefono: datos.telefonoContacto || telefono,
        lugar_residencia: datos.lugar_residencia || '',
      });
      pacienteId = nuevo?.id || null;
    }
    datos.paciente_id = pacienteId;
  }

  const consulta = await crearConsulta({
    paciente_id: pacienteId,
    nivel_sintomas: datos.nivel || 1,
    sintomas_descripcion: datos.sintomas || '',
    estado: 'pendiente',
  });

  const esAliado = datos.modalidad === 'b2b_externo';
  await crearNotificacion(
    'nueva_consulta',
    esAliado ? '🏥 Nuevo pago — Seguro aliado' : '💰 Nuevo pago B2C',
    `${datos.nombreCompleto} registró teleconsulta (${esAliado ? `seguro: ${datos.seguro_nombre}` : 'pago directo $8.00'})`,
    pacienteId,
    consulta?.id,
    { origen: esAliado ? 'b2b' : 'b2c', categoria: nivelACategoria(datos.nivel), etiqueta: esAliado ? 'PAGO SEGURO' : 'PAGO' }
  );

  await registrarFacturacionB2C(datos);

  await registrarDocumento(pacienteId, consulta?.id, 'comprobante', datos.comprobante_ref).catch(e =>
    console.error('Error registrando documento comprobante:', e.message)
  );

  return { pacienteId, consulta };
}

async function procesarB2C(paso, mensaje, datos, telefono, nombreWhatsApp, msg) {
  let respuesta = '';
  let nuevoPaso = paso;

  const LISTA_MODALIDAD = {
    secciones: [{
      titulo: 'Seleccione una opción',
      filas: [
        { id: 'seguro',  titulo: '🏥 Mi seguro es afiliado', descripcion: 'Mi seguro/empresa es afiliada a MediLyft' },
        { id: 'directo', titulo: '💳 Pago directo $8.00',    descripcion: 'Teleconsulta particular sin seguro' }
      ]
    }],
    botonTexto: '📋 Seleccionar'
  };

  if (paso === 'inicio_b2c') {
    return {
      respuesta: `No encontramos su cédula *${datos.cedula}* en nuestro sistema.\n\n¿Cómo desea continuar?`,
      paso: 'modalidad', datos, terminar: false,
      lista: LISTA_MODALIDAD
    };

  } else if (paso === 'modalidad') {
    const m = mensaje.trim().toLowerCase();
    if (m === '1' || m === 'seguro') {
      respuesta = `Por favor indíquenos el nombre de su seguro médico o empresa:`;
      nuevoPaso = 'nombre_seguro';
    } else if (m === '2' || m === 'directo') {
      respuesta = `Perfecto. La teleconsulta tiene un costo de *$8.00*.\n\nPor favor indíquenos su *nombre y apellidos completos:*`;
      datos.modalidad = 'b2c';
      nuevoPaso = 'nombre';
    } else {
      return { respuesta: `Por favor selecciona una opción:`, paso: 'modalidad', datos, terminar: false, lista: LISTA_MODALIDAD };
    }

  } else if (paso === 'nombre_seguro') {
    if (esSeguroAliado(mensaje)) {
      respuesta = `✅ Su seguro *${mensaje}* forma parte de nuestra red de alianzas.\n\nPor favor indíquenos su *nombre y apellidos completos:*`;
      datos.seguro_nombre = mensaje;
      datos.modalidad = 'b2b_externo';
      nuevoPaso = 'nombre';
    } else {
      datos.seguro_rechazado = mensaje;
      return {
        respuesta: `Su seguro/empresa *${mensaje}* no forma parte de nuestra red de alianzas.\n\n¿Desea continuar con pago directo ($8.00)?`,
        paso: 'confirmar_b2c', datos, terminar: false,
        botones: [
          { id: 'si', titulo: '✅ Sí, continuar' },
          { id: 'no', titulo: '❌ No, cancelar'  },
        ]
      };
    }

  } else if (paso === 'confirmar_b2c') {
    if (esSi(mensaje)) {
      respuesta = `Entendido. La teleconsulta tiene un costo de *$8.00*.\n\nPor favor indíquenos su *nombre y apellidos completos:*`;
      datos.modalidad = 'b2c';
      nuevoPaso = 'nombre';
    } else {
      respuesta = `Entendido. Si cambia de opinión escríbanos *hola*. 👋`;
      await eliminar(telefono);
      return { respuesta, paso: 0, datos, terminar: true };
    }

  } else if (paso === 'nombre') {
    datos.nombreCompleto = mensaje.trim();
    respuesta = `*Edad:*`;
    nuevoPaso = 'edad';

  } else if (paso === 'edad') {
    datos.edad = mensaje;
    return {
      respuesta: `*Sexo biológico:*`,
      paso: 'sexo', datos, terminar: false,
      botones: [
        { id: 'masculino', titulo: '👨 Masculino' },
        { id: 'femenino',  titulo: '👩 Femenino'  },
      ]
    };

  } else if (paso === 'sexo') {
    const m = mensaje.trim().toLowerCase();
    datos.sexo = (m === 'femenino' || m === 'f') ? 'F' : 'M';
    respuesta = `*Correo electrónico:*`;
    nuevoPaso = 'correo';

  } else if (paso === 'correo') {
    datos.correo = mensaje;
    return {
      respuesta: `*Número de teléfono de contacto:*\n\n¿Desea usar el número desde el que nos escribe (*${telefono}*) o prefiere indicar otro?`,
      paso: 'confirmar_telefono', datos, terminar: false,
      botones: [
        { id: 'actual', titulo: '📱 Usar este número' },
        { id: 'otro',   titulo: '✏️ Indicar otro'     },
      ]
    };

  } else if (paso === 'confirmar_telefono') {
    const m = mensaje.trim().toLowerCase();
    if (m === 'actual' || m.includes('usar este')) {
      datos.telefonoContacto = telefono;
      respuesta = `*Lugar de residencia* (ciudad y barrio):`;
      nuevoPaso = 'residencia';
    } else {
      respuesta = `Indíquenos el número de teléfono que desea registrar:`;
      nuevoPaso = 'otro_telefono';
    }

  } else if (paso === 'otro_telefono') {
    datos.telefonoContacto = mensaje;
    respuesta = `*Lugar de residencia* (ciudad y barrio):`;
    nuevoPaso = 'residencia';

  } else if (paso === 'residencia') {
    datos.lugar_residencia = mensaje;
    respuesta = `¿Cuál es el motivo de su consulta?\n\nDescríbanos sus síntomas con detalle:`;
    nuevoPaso = 'sintomas';

  } else if (paso === 'sintomas') {
    const nivel = clasificarSintomas(mensaje);
    datos.sintomas = mensaje;
    datos.nivel = nivel;

    if (nivel === 3) {
      await alertar(`🚨 <b>EMERGENCIA - PACIENTE B2C</b>\nNombre: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      await guardar(telefono, 0, {
        _flujo: 'emergencia',
        paciente_id: datos.paciente_id || null,
        cedula: datos.cedula,
        nombreCompleto: datos.nombreCompleto,
        edad: datos.edad,
        correo: datos.correo,
        telefonoContacto: datos.telefonoContacto,
        lugar_residencia: datos.lugar_residencia,
        contexto: `Síntomas: ${mensaje}`
      }, 'emergencia');
      return {
        respuesta: `🚨 *EMERGENCIA MÉDICA* 🚨\n\nSus síntomas indican una situación de *riesgo vital*.\n\nPuede:\n• Acudir al hospital más cercano\n• Llamar al *911*\n• Iniciar una consulta urgente ahora`,
        paso: 0, datos: { ...datos, _flujo: 'emergencia' },
        botones: [
          { id: 'emergencia_911',      titulo: '📞 Llamar al 911'   },
          { id: 'emergencia_consulta', titulo: '🏥 Consulta urgente' },
        ],
        terminar: false
      };
    } else if (nivel === 2) {
      await alertar(`⚠️ <b>SÍNTOMAS MEDIOS - B2C</b>\nNombre: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
    }

    if (!estaEnHorario()) {
      const prox = proximaApertura();
      const fhDatos = { ...datos, _flujo: 'fuera_horario', _pendingOrigen: 'b2c' };
      await guardar(telefono, 0, fhDatos, 'fuera_horario');
      const { respuesta, botones } = mensajeFueraHorario(prox);
      return { respuesta, botones, paso: 0, datos: fhDatos, terminar: false };
    }

    return {
      respuesta: `✅ Sus síntomas han sido registrados.\n\nEl costo de la teleconsulta es *$8.00*.\n\n¿Cómo desea realizar el pago?`,
      paso: 'pago', datos, terminar: false,
      botones: BOTONES_PAGO
    };

  } else if (paso === 'pago') {
    const m = mensaje.trim().toLowerCase();
    if (m === '1' || m === 'transferencia') {
      datos.forma_pago = 'transferencia';
      respuesta = `🏦 *Datos para transferencia:*\n\n🏦 Banco Internacional\n📋 Cuenta Corriente: *640618402*\n🏢 RUC: *1793197189001*\n💰 Monto: *$8.00*\n📝 Concepto: Teleconsulta MediLyft\n\nRealice la transferencia y envíenos la *captura de pantalla COMPLETA* del comprobante (sin recortar), donde se vea el *logo del banco*, *beneficiario*, *monto*, *fecha y hora*, y *número de referencia*.`;
      nuevoPaso = 'comprobante';
    } else if (m === '2' || m === 'tarjeta') {
      datos.forma_pago = 'tarjeta';
      respuesta = `💳 *Pago con tarjeta:*\n\nHaga clic en el siguiente enlace para pago seguro de *$8.00*:\n\nhttps://app.pagoplux.com/paybox/MTc4OA%3D%3D/MA%3D%3D/OA%3D%3D/UEFHTyBWSURFTyBDT05TVUxUQQ%3D%3D\n\nUna vez realizado el pago, envíenos la *captura de pantalla COMPLETA* del comprobante (sin recortar), donde se vea el *monto*, *fecha y hora*, y *número de referencia*.`;
      nuevoPaso = 'comprobante';
    } else {
      return { respuesta: MSG_REINTENTAR_BOTON, paso: 'pago', datos, terminar: false, botones: BOTONES_PAGO };
    }

  } else if (paso === 'comprobante') {
    const media = msg?.image || msg?.document;
    const esDemoAutorizado = mensaje.trim().toUpperCase() === 'DEMOTEST'
      && DEMO_PHONE_NUMBERS.includes(String(telefono || '').replace(/\D/g, ''));

    if (esDemoAutorizado) {
      datos.comprobante_ref = '__demo_bypass__';
      await crearConsultaB2C(datos, telefono);
      await alertar(`💰 <b>NUEVO PAGO (MODO DEMO) B2C - MEDILYFT</b>\nNombre: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nSíntomas: ${datos.sintomas}`);
      return {
        respuesta: `✅ *¡Pago confirmado!* (modo demo)\n\n🎉 Su teleconsulta ha sido registrada exitosamente.\n\nUn asesor de *MediLyft* le contactará en breve para confirmar el horario.\n\n📧 La factura electrónica será enviada a *${datos.correo}*.\n\n¡Gracias por confiar en MediLyft! 💙`,
        paso: 'finalizar', datos, terminar: false,
        botones: [
          { id: 'otra_consulta', titulo: '✅ Otra consulta'     },
          { id: 'finalizar',     titulo: '🔚 Finalizar proceso' },
        ]
      };

    } else if (mensaje !== '__media__' || !media?.id) {
      respuesta = `Por favor envíenos la *foto o captura del comprobante* de su transferencia (monto *$8.00*) para confirmar su consulta.`;
      nuevoPaso = 'comprobante';

    } else if (media.id === '__TEST__' && process.env.ALLOW_TEST_BYPASS === 'true') {
      datos.comprobante_ref = '__test_bypass__';
      return {
        respuesta: `✅ *¡Pago confirmado!*\n\n🎉 Su teleconsulta ha sido registrada exitosamente.\n\nUn asesor de *MediLyft* le contactará en breve para confirmar el horario.\n\n📧 La factura electrónica será enviada a *${datos.correo}*.\n\n¡Gracias por confiar en MediLyft! 💙`,
        paso: 'finalizar', datos, terminar: false,
        botones: [
          { id: 'otra_consulta', titulo: '✅ Otra consulta'     },
          { id: 'finalizar',     titulo: '🔚 Finalizar proceso' },
        ]
      };

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
          paso: 'comprobante', datos, terminar: false
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

      let referenciaDuplicada = false;
      if (verificacion?.referencia) {
        const previos = await query('GET', 'verificaciones_comprobante', null,
          `?referencia=eq.${encodeURIComponent(verificacion.referencia)}&aprobado=eq.true&select=id`
        ).catch(() => []);
        referenciaDuplicada = Array.isArray(previos) && previos.length > 0;
      }

      const pasaObligatorios = !!verificacion?.es_comprobante && coincideMonto && !referenciaDuplicada;

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
          paso: 'comprobante', datos, terminar: false
        };
      }

      if (!aprobado) {
        return {
          respuesta: `❌ No pudimos validar su comprobante.\n\nVerifique que la imagen sea una *captura de pantalla completa* (sin recortar) donde se vea:\n• El *logo del banco*\n• El *beneficiario*\n• El monto exacto de *$8.00*\n• La *fecha y hora* (de las últimas 48 horas)\n• El *número de referencia*\n\nPor favor envíe nuevamente la captura del comprobante.`,
          paso: 'comprobante', datos, terminar: false
        };
      }

      datos.comprobante_ref = storagePath;

      await crearConsultaB2C(datos, telefono);

      await alertar(`💰 <b>NUEVO PAGO DIRECTO B2C - MEDILYFT</b>\nNombre: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nCorreo: ${datos.correo}\nSíntomas: ${datos.sintomas}\nPago: ${datos.forma_pago}\nMonto: $8.00`);

      return {
        respuesta: `✅ *¡Pago confirmado!*\n\n🎉 Su teleconsulta ha sido registrada exitosamente.\n\nUn asesor de *MediLyft* le contactará en breve para confirmar el horario.\n\n📧 La factura electrónica será enviada a *${datos.correo}*.\n\n¡Gracias por confiar en MediLyft! 💙`,
        paso: 'finalizar', datos, terminar: false,
        botones: [
          { id: 'otra_consulta', titulo: '✅ Otra consulta'     },
          { id: 'finalizar',     titulo: '🔚 Finalizar proceso' },
        ]
      };
    }

  } else if (paso === 'finalizar') {
    if (mensaje === 'otra_consulta' || mensaje.toLowerCase().includes('otra consulta')) {
      return mensajeBienvenida(nombreWhatsApp);
    } else {
      if (datos.paciente_id) {
        const existentes = await query('GET', 'antecedentes', null,
          `?paciente_id=eq.${datos.paciente_id}&limit=1`).catch(() => []);
        if (existentes?.length) {
          await eliminar(telefono);
          return {
            respuesta: `✅ Su historia clínica ya se encuentra registrada en nuestro sistema.\n\n¡Gracias por confiar en *MediLyft*! Hasta pronto 💙`,
            paso: 0, datos: {}, terminar: true
          };
        }
      }
      const datosAnt = { ...datos, _flujo: 'antecedentes' };
      await guardar(telefono, 13, datosAnt, 'antecedentes');
      return {
        respuesta: `Para completar su historia clínica necesitamos algunas preguntas más:\n\n💊 ¿Tiene *alergias* conocidas a medicamentos o alimentos?\n\nResponda *No* o descríbalas brevemente.`,
        paso: 13, datos: datosAnt, terminar: false
      };
    }
  }

  return { respuesta, paso: nuevoPaso, datos, terminar: false };
}

module.exports = { procesarB2C, BOTONES_PAGO, MSG_REINTENTAR_BOTON, registrarFacturacionB2C, esConfirmacionComprobante };
