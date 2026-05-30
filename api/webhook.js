const twilio = require('twilio');

const SUPABASE_URL = 'https://kcoopkkvbkgrnkpksiuh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cxK_dgG5vRrJQynj06G-Bg_MrZotk6D';
const TWILIO_SID = 'AC37998a4481bd86a7017c898df68f96e5';
const TWILIO_TOKEN = 'a0ddbeb684ee71818d106c922747829b';
const TWILIO_NUMBER = 'whatsapp:+14155238886';
const TELEGRAM_TOKEN = '8210302688:AAGYUXIg0ys0pMxJmtD2HeYFLV1hk50Qcq4';
const TELEGRAM_CHAT_ID = '8239902044';

async function supabaseQuery(method, table, body, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  return res.json();
}

async function alertarTelegram(mensaje) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensaje, parse_mode: 'HTML' })
  });
}

async function obtenerSesion(telefono) {
  const data = await supabaseQuery('GET', 'sesiones_bot', null, `?telefono=eq.${encodeURIComponent(telefono)}`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function guardarSesion(telefono, paso, datos) {
  const sesion = await obtenerSesion(telefono);
  if (sesion) {
    await supabaseQuery('PATCH', 'sesiones_bot', { paso, datos, updated_at: new Date().toISOString() }, `?telefono=eq.${encodeURIComponent(telefono)}`);
  } else {
    await supabaseQuery('POST', 'sesiones_bot', { telefono, paso, datos });
  }
}

async function eliminarSesion(telefono) {
  await supabaseQuery('DELETE', 'sesiones_bot', null, `?telefono=eq.${encodeURIComponent(telefono)}`);
}

async function buscarPaciente(cedula) {
  const data = await supabaseQuery('GET', 'pacientes', null, `?cedula=eq.${cedula}&select=*,clientes_b2b(*)`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function actualizarPaciente(cedula, datos) {
  await supabaseQuery('PATCH', 'pacientes', datos, `?cedula=eq.${cedula}`);
}

async function crearNotificacion(tipo, titulo, mensaje, paciente_id, consulta_id) {
  await supabaseQuery('POST', 'notificaciones', { tipo, titulo, mensaje, paciente_id, consulta_id });
}

function tieneApellidos(texto) {
  return texto.trim().split(/\s+/).length >= 3;
}

function clasificarSintomas(texto) {
  const t = texto.toLowerCase();
  const graves = ['dolor de pecho', 'presion en el pecho', 'opresion en el pecho', 'no puedo respirar', 'dificultad para respirar', 'dificultad respiratoria', 'no respiro', 'me ahogo', 'perdida de conciencia', 'perdi el conocimiento', 'me desmaye', 'convulsion', 'convulsiones', 'paralisis', 'no puedo mover', 'sangrado incontrolable', 'hemorragia', 'infarto', 'ataque al corazon', 'ataque cardiaco', 'derrame cerebral', 'stroke', 'labios morados', 'piel azul', 'vomito con sangre', 'heces con sangre', 'dolor abdominal insoportable'];
  const medios = ['fiebre alta', 'fiebre de 39', 'fiebre de 40', 'vomito repetitivo', 'vomitos frecuentes', 'diarrea con sangre', 'diarrea severa', 'dolor abdominal fuerte', 'desmayo leve', 'mareo intenso', 'herida infectada', 'dificultad respirar leve', 'palpitaciones', 'presion 160', 'presion 170', 'glucosa 300', 'hipoglucemia', 'reaccion alergica fuerte', 'fractura', 'hueso roto', 'sangrado moderado'];
  if (graves.some(s => t.includes(s))) return 3;
  if (medios.some(s => t.includes(s))) return 2;
  return 1;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const body = req.body || {};
  const mensaje = (body.Body || '').trim();
  const telefono = body.From || '';
  const nombreWhatsApp = body.ProfileName || 'estimado/a';

  let sesion = await obtenerSesion(telefono);
  if (!sesion) sesion = { paso: 0, datos: {} };

  const twiml = new twilio.twiml.MessagingResponse();
  let respuesta = '';
  let paso = sesion.paso;
  let datos = sesion.datos || {};

  if (paso === 99) {
    respuesta = `Su consulta ya fue registrada. 😊\n\nUn asesor de *MediLyft* le contactará pronto.\n\nSi necesita una nueva consulta escriba *hola*.`;
    twiml.message(respuesta);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml.toString());
  }

  if (paso === 0) {
    respuesta = `¡Hola, ${nombreWhatsApp}! 👋 Bienvenido a *MediLyft*.\n\nEstamos listos para ayudarte.\n\nPor favor indícanos tu número de *cédula de identidad*:`;
    paso = 1;

  } else if (paso === 1) {
    const paciente = await buscarPaciente(mensaje);
    if (paciente) {
      datos.cedula = mensaje;
      datos.paciente_id = paciente.id;
      datos.nombre_paciente = paciente.nombre;
      datos.empresa = paciente.clientes_b2b?.nombre_empresa || 'su empresa';
      datos.seguro = paciente.clientes_b2b?.nombre_seguro || 'su seguro';
      respuesta = `✅ Hemos identificado que pertenece a *${datos.empresa}* con cobertura de *${datos.seguro}*.\n\n¿Acepta el uso y tratamiento de sus datos personales con fines médicos?\n\nResponda *Sí* o *No*`;
      paso = 2;
    } else {
      respuesta = `No encontramos la cédula *${mensaje}* en nuestro sistema.\n\nVerifique el número e inténtelo nuevamente:`;
    }

  } else if (paso === 2) {
    if (mensaje.toLowerCase() === 'sí' || mensaje.toLowerCase() === 'si') {
      respuesta = `Gracias por su autorización. ✅\n\n¿Cuál es el motivo de su consulta?\n\nDescríbanos sus síntomas con detalle:`;
      paso = 3;
    } else {
      respuesta = `Sin su autorización no es posible continuar.\n\nSi cambia de opinión escríbanos *hola*. 👋`;
      await eliminarSesion(telefono);
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());
    }

  } else if (paso === 3) {
    const nivel = clasificarSintomas(mensaje);
    datos.sintomas = mensaje;
    datos.nivel = nivel;

    if (nivel === 3) {
      respuesta = `🚨 *EMERGENCIA MÉDICA* 🚨\n\nSus síntomas indican una situación de *riesgo vital*.\n\n*Llame al 911 AHORA MISMO.*\n\n📞 tel:911\n\nNo espere — su vida puede estar en peligro.`;
      await alertarTelegram(`🚨 <b>ALERTA GRAVE - EMERGENCIA</b>\nPaciente: ${datos.nombre_paciente || nombreWhatsApp}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      await eliminarSesion(telefono);
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());

    } else if (nivel === 2) {
      respuesta = `⚠️ *Atención prioritaria requerida*\n\nSus síntomas necesitan evaluación médica urgente.\n\nHemos notificado a nuestro equipo y le contactarán a la brevedad.\n\nMientras espera: si los síntomas empeoran *llame al 911 de inmediato*.`;
      await alertarTelegram(`⚠️ <b>SÍNTOMAS MEDIOS - ATENCIÓN URGENTE</b>\nPaciente: ${datos.nombre_paciente || nombreWhatsApp}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      const consulta = await supabaseQuery('POST', 'consultas', { paciente_id: datos.paciente_id, nivel_sintomas: 2, sintomas_descripcion: mensaje, estado: 'pendiente' });
      await crearNotificacion('urgente', '⚠️ Síntomas medios', `Paciente ${datos.nombre_paciente} requiere atención urgente`, datos.paciente_id, consulta?.[0]?.id);
      await eliminarSesion(telefono);
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());

    } else {
      respuesta = `✅ Sus síntomas pueden ser atendidos por *teleconsulta*.\n\nNecesitamos completar sus datos. Por favor indíquenos:\n\n👤 *Nombre y apellidos completos:*`;
      paso = 4;
    }

  } else if (paso === 4) {
    const nombreCompleto = mensaje.trim();
    datos.nombreCompleto = nombreCompleto;
    if (tieneApellidos(nombreCompleto)) {
      const partes = nombreCompleto.split(/\s+/);
      datos.nombre = partes[0];
      datos.apellidos = partes.slice(1).join(' ');
      respuesta = `*Edad:*`;
      paso = 6;
    } else {
      datos.nombre = nombreCompleto;
      respuesta = `*Apellidos completos:*`;
      paso = 5;
    }

  } else if (paso === 5) {
    datos.apellidos = mensaje;
    datos.nombreCompleto = `${datos.nombre} ${datos.apellidos}`;
    respuesta = `*Edad:*`;
    paso = 6;

  } else if (paso === 6) {
    datos.edad = mensaje;
    respuesta = `*Fecha de nacimiento* (ej: 15/03/1990):`;
    paso = 7;

  } else if (paso === 7) {
    datos.fecha_nacimiento = mensaje;
    respuesta = `*Correo electrónico:*`;
    paso = 8;

  } else if (paso === 8) {
    datos.correo = mensaje;
    respuesta = `*Número de teléfono de contacto:*`;
    paso = 9;

  } else if (paso === 9) {
    datos.telefono = mensaje;
    respuesta = `*Lugar de residencia* (ciudad y barrio):`;
    paso = 10;

  } else if (paso === 10) {
    datos.lugar_residencia = mensaje;
    respuesta = `*Horario de preferencia* para la teleconsulta\n(ej: mañana martes a las 10:00 AM):`;
    paso = 11;

  } else if (paso === 11) {
    datos.horario = mensaje;
    respuesta = `Confirme sus datos:\n\n👤 *Nombre:* ${datos.nombreCompleto}\n🎂 *Edad:* ${datos.edad}\n📅 *Nacimiento:* ${datos.fecha_nacimiento}\n📧 *Correo:* ${datos.correo}\n📱 *Teléfono:* ${datos.telefono}\n📍 *Residencia:* ${datos.lugar_residencia}\n🕐 *Horario:* ${datos.horario}\n\nResponda *Confirmar* o *Corregir*`;
    paso = 12;

  } else if (paso === 12) {
    if (mensaje.toLowerCase() === 'confirmar') {
      // Actualizar datos del paciente en base de datos
      await actualizarPaciente(datos.cedula, {
        nombre: datos.nombre,
        apellidos: datos.apellidos,
        edad: datos.edad,
        fecha_nacimiento: datos.fecha_nacimiento,
        correo: datos.correo,
        telefono: datos.telefono,
        lugar_residencia: datos.lugar_residencia,
        updated_at: new Date().toISOString()
      });

      // Crear consulta
      const consulta = await supabaseQuery('POST', 'consultas', {
        paciente_id: datos.paciente_id,
        nivel_sintomas: 1,
        sintomas_descripcion: datos.sintomas,
        estado: 'pendiente'
      });

      const consulta_id = consulta?.[0]?.id;

      // Crear notificación para operador
      await crearNotificacion(
        'nueva_consulta',
        '📅 Nueva teleconsulta',
        `${datos.nombreCompleto} solicita teleconsulta para ${datos.horario}`,
        datos.paciente_id,
        consulta_id
      );

      // Alertar por Telegram
      await alertarTelegram(`📅 <b>NUEVA TELECONSULTA - MEDILYFT</b>\nPaciente: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa}\nSíntomas: ${datos.sintomas}\nHorario: ${datos.horario}\nTeléfono: ${datos.telefono}\nCorreo: ${datos.correo}\nResidencia: ${datos.lugar_residencia}`);

      respuesta = `🎉 *¡Consulta registrada exitosamente!*\n\nSus datos han sido guardados en nuestro sistema.\n\nUn asesor de *MediLyft* le confirmará su teleconsulta a la brevedad.\n\n¡Gracias por confiar en nosotros! 💙`;
      await eliminarSesion(telefono);
      await guardarSesion(telefono, 99, {});
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());

    } else {
      datos = { cedula: datos.cedula, paciente_id: datos.paciente_id, nombre_paciente: datos.nombre_paciente, empresa: datos.empresa, seguro: datos.seguro, sintomas: datos.sintomas, nivel: datos.nivel };
      respuesta = `Entendido, volvamos a empezar.\n\n👤 *Nombre y apellidos completos:*`;
      paso = 4;
    }

  } else {
    respuesta = `Escriba *hola* para iniciar una nueva consulta. 👋`;
    await eliminarSesion(telefono);
    paso = 0;
    datos = {};
  }

  await guardarSesion(telefono, paso, datos);
  twiml.message(respuesta);
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml.toString());
};
