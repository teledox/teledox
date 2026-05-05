import { MessagingResponse } from 'twilio/lib/twiml/MessagingResponse.js';

const SENDGRID_API_KEY = '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';
const CORREO_DESTINO = 'citas@vitalclub.com.ec';
const CORREO_REMITENTE = 'citas@vitalclub.com.ec';

const sesiones = {};

async function enviarCorreo(datos) {
  const cuerpo = `Nueva cita agendada en Vital Club\n\nNombre: ${datos.nombre}\nEdad: ${datos.edad}\nCédula: ${datos.cedula}\nNúmero: ${datos.numero}\nCorreo: ${datos.correo}\nFecha de nacimiento: ${datos.fechaNacimiento}\nHorario requerido: ${datos.horario}`;

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: CORREO_DESTINO }] }],
      from: { email: CORREO_REMITENTE },
      subject: `Nueva cita - ${datos.nombre}`,
      content: [{ type: 'text/plain', value: cuerpo }]
    })
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const body = req.body || {};
  const mensaje = (body.Body || '').trim();
  const telefono = body.From || '';
  const nombreWhatsApp = body.ProfileName || 'estimado/a';

  if (!sesiones[telefono]) {
    sesiones[telefono] = { paso: 0, datos: {} };
  }

  const sesion = sesiones[telefono];
  const twiml = new MessagingResponse();
  let respuesta = '';

  if (sesion.paso === 0) {
    respuesta = `¡Hola, ${nombreWhatsApp}! 👋 Bienvenido/a a *Vital Club*.\n\n¿Desea agendar una teleconsulta médica?\n\nResponda *Sí* para continuar.`;
    sesion.paso = 1;
  } else if (sesion.paso === 1) {
    if (mensaje.toLowerCase() === 'sí' || mensaje.toLowerCase() === 'si') {
      respuesta = `Perfecto. Por favor complete los siguientes datos:\n\n*Nombre completo:*`;
      sesion.paso = 2;
    } else {
      respuesta = `Entendido. Si desea agendar una cita en otro momento, escríbanos *hola* y con gusto le atendemos. 😊`;
      delete sesiones[telefono];
    }
  } else if (sesion.paso === 2) {
    sesion.datos.nombre = mensaje;
    respuesta = `*Edad:*`;
    sesion.paso = 3;
  } else if (sesion.paso === 3) {
    sesion.datos.edad = mensaje;
    respuesta = `*Número de cédula:*`;
    sesion.paso = 4;
  } else if (sesion.paso === 4) {
    sesion.datos.cedula = mensaje;
    respuesta = `*Número de teléfono de contacto:*`;
    sesion.paso = 5;
  } else if (sesion.paso === 5) {
    sesion.datos.numero = mensaje;
    respuesta = `*Correo electrónico:*`;
    sesion.paso = 6;
  } else if (sesion.paso === 6) {
    sesion.datos.correo = mensaje;
    respuesta = `*Fecha de nacimiento* (ej: 15/03/1990):`;
    sesion.paso = 7;
  } else if (sesion.paso === 7) {
    sesion.datos.fechaNacimiento = mensaje;
    respuesta = `*Horario de preferencia* (ej: martes 13 de mayo a las 10:00 AM):`;
    sesion.paso = 8;
  } else if (sesion.paso === 8) {
    sesion.datos.horario = mensaje;
    const d = sesion.datos;
    respuesta = `Por favor confirme sus datos:\n\n👤 *Nombre:* ${d.nombre}\n🎂 *Edad:* ${d.edad}\n🪪 *Cédula:* ${d.cedula}\n📱 *Número:* ${d.numero}\n📧 *Correo:* ${d.correo}\n📅 *Fecha de nacimiento:* ${d.fechaNacimiento}\n🕐 *Horario:* ${d.horario}\n\n¿Los datos son correctos?\nResponda *Confirmar* para continuar o *Corregir* para volver a ingresar.`;
    sesion.paso = 9;
  } else if (sesion.paso === 9) {
    if (mensaje.toLowerCase() === 'confirmar') {
      respuesta = `✅ Datos confirmados.\n\nPara completar el agendamiento realice el pago mediante:\n\n🏦 *Transferencia bancaria:*\nVITALCLUB S.A.S\nBanco Internacional\nCuenta Corriente Nro. 640618402\nRUC: 1793197189001\nCorreo: contabilidad@vitalclub.com.ec\n\n📲 *PayPhone:* busque el número registrado a nombre de Vital Club.\n\nUna vez realizado el pago, por favor *envíe el comprobante* a este chat.`;
      sesion.paso = 10;
    } else {
      sesion.datos = {};
      sesion.paso = 2;
      respuesta = `Entendido, volvamos a empezar.\n\n*Nombre completo:*`;
    }
  } else if (sesion.paso === 10) {
    await enviarCorreo(sesion.datos);
    respuesta = `🎉 *¡Cita agendada exitosamente!*\n\nEn breve un asesor de Vital Club le confirmará su horario.\n\nGracias por confiar en nosotros. 💙`;
    delete sesiones[telefono];
  } else {
    respuesta = `Escriba *hola* para iniciar el proceso de agendamiento.`;
    delete sesiones[telefono];
  }

  twiml.message(respuesta);
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml.toString());
}
