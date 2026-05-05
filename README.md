import { MessagingResponse } from 'twilio/lib/twiml/MessagingResponse.js';

const SENDGRID_API_KEY = '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';
const CORREO_DESTINO = 'citas@vitalclub.com.ec';
const CORREO_REMITENTE = 'citas@vitalclub.com.ec';

const sesiones = {};

async function enviarCorreo(datos) {
  const cuerpo = `
    Nueva cita agendada en Vital Club\n
    Nombre: ${datos.nombre}
    Edad: ${datos.edad}
    Cédula: ${datos.cedula}
    Número: ${datos.numero}
    Correo: ${datos.correo}
    Fecha de nacimiento: ${datos.fechaNacimiento}
    Horario requerido: ${datos.horario}
  `;

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

  // PASO 0 — Saludo inicial
  if (sesion.paso === 0) {
    respuesta = `¡Hol
