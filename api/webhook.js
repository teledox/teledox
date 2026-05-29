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
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
      parse_mode: 'HTML'
    })
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

function clasificarSintomas(texto) {
  const t = texto.toLowerCase();
  const graves = ['dolor de pecho', 'presion en el pecho', 'no puedo respirar', 'dificultad para respirar', 'perdida de conciencia', 'convulsion', 'paralisis', 'sangrado incontrolable', 'infarto'];
  const medios = ['fiebre alta', 'vomito repetitivo', 'diarrea con sangre', 'dolor abdominal fuerte', 'desmayo', 'herida infectada', 'dificultad respirar'];
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

  if (paso === 0) {
    respuesta = `¡Hola, ${nombreWhatsApp}! 👋 Estamos listos para ayudarte.\n\nPara continuar, por favor indícanos tu número de *cédula de identidad*:`;
    paso = 1;

  } else if (paso === 1) {
    const paciente = await buscarPaciente(mensaje);
    if (paciente) {
      datos.cedula = mensaje;
      datos.paciente_id = paciente.id;
      datos.nombre_paciente = paciente.nombre;
      datos.empresa = paciente.clientes_b2b?.nombre_empresa || 'su empresa';
      datos.seguro = paciente.clientes_b2b?.nombre_seguro || 'su seguro';
      respuesta = `✅ Hemos identificado que pertenece a <b>${datos.empresa}</b> con cobertura de <b>${datos.seguro}</b>.\n\n¿Acepta el uso y tratamiento de sus datos personales con fines médicos?\n\nResponda *Sí* o *No*`;
      paso = 2;
    } else {
      respuesta = `No encontramos la cédula *${mensaje}* en nuestro sistema.\n\nVerifique el número e inténtelo nuevamente:`;
    }

  } else if (paso === 2) {
    if (mensaje.toLowerCase() === 'sí' || mensaje.toLowerCase() === 'si') {
      respuesta = `Gracias por su autorización. ✅\n\n¿Cuál es el motivo de su consulta?\n\nDescríbanos sus síntomas:`;
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
      respuesta = `🚨 *ALERTA GRAVE* 🚨\n\nSus síntomas requieren atención de *emergencia inmediata*.\n\nLlame al *911* ahora mismo.\n\n📞 tel:911`;
      await alertarTelegram(`🚨 <b>ALERTA GRAVE</b>\nPaciente: ${datos.nombre_paciente || nombreWhatsApp}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      await eliminarSesion(telefono);
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());

    } else if (nivel === 2) {
      respuesta = `⚠️ Sus síntomas requieren *atención prioritaria*.\n\nHemos notificado a nuestro equipo y le contactarán a la brevedad.\n\nSi los síntomas empeoran llame al *911* inmediatamente.`;
      await alertarTelegram(`⚠️ <b>SÍNTOMAS MEDIOS - URGENTE</b>\nPaciente: ${datos.nombre_paciente || nombreWhatsApp}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      await supabaseQuery('POST', 'consultas', { paciente_id: datos.paciente_id, nivel_sintomas: 2, sintomas_descripcion: mensaje, estado: 'pendiente' });
      await eliminarSesion(telefono);
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());

    } else {
      respuesta = `✅ Sus síntomas pueden ser atendidos por teleconsulta.\n\nPor favor complete sus datos:\n\n*Nombres completos:*`;
      paso = 4;
    }

  } else if (paso === 4) {
    datos.nombre = mensaje;
    respuesta = `*Apellidos completos:*`;
    paso = 5;

  } else if (paso === 5) {
    datos.apellidos = mensaje;
    respuesta = `*Edad:*`;
    paso = 6;

  } else if (paso === 6) {
    datos.edad = mensaje;
    respuesta = `*Correo electrónico:*`;
    paso = 7;

  } else if (paso === 7) {
    datos.correo = mensaje;
    respuesta = `*Fecha de nacimiento* (ej: 15/03/1990):`;
    paso = 8;

  } else if (paso === 8) {
    datos.fecha_nacimiento = mensaje;
    respuesta = `*Horario de preferencia* (ej: mañana martes a las 10:00 AM):`;
    paso = 9;

  } else if (paso === 9) {
    datos.horario = mensaje;
    respuesta = `Confirme sus datos:\n\n👤 *Nombres:* ${datos.nombre}\n👤 *Apellidos:* ${datos.apellidos}\n🎂 *Edad:* ${datos.edad}\n📧 *Correo:* ${datos.correo}\n📅 *Nacimiento:* ${datos.fecha_nacimiento}\n🕐 *Horario:* ${datos.horario}\n\nResponda *Confirmar* o *Corregir*`;
    paso = 10;

  } else if (paso === 10) {
    if (mensaje.toLowerCase() === 'confirmar') {
      await supabaseQuery('POST', 'consultas', { paciente_id: datos.paciente_id, nivel_sintomas: 1, sintomas_descripcion: datos.sintomas, estado: 'pendiente' });
      await alertarTelegram(`📅 <b>NUEVA TELECONSULTA</b>\nPaciente: ${datos.nombre} ${datos.apellidos}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa}\nSíntomas: ${datos.sintomas}\nHorario: ${datos.horario}\nTeléfono: ${telefono}\nCorreo: ${datos.correo}`);
      respuesta = `🎉 *¡Solicitud recibida!*\n\nUn asesor de Vital Club le confirmará su teleconsulta a la brevedad.\n\nGracias por confiar en nosotros. 💙`;
      await eliminarSesion(telefono);
    } else {
      datos = { cedula: datos.cedula, paciente_id: datos.paciente_id, nombre_paciente: datos.nombre_paciente, empresa: datos.empresa, seguro: datos.seguro, sintomas: datos.sintomas, nivel: datos.nivel };
      respuesta = `Volvamos a empezar. *Nombres completos:*`;
      paso = 4;
    }

  } else {
    respuesta = `Escriba *hola* para iniciar. 👋`;
    await eliminarSesion(telefono);
    paso = 0;
    datos = {};
  }

  await guardarSesion(telefono, paso, datos);
  twiml.message(respuesta);
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml.toString());
};
