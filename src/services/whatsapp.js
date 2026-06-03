const twilio = require('twilio');
const { TWILIO_SID, TWILIO_TOKEN, TWILIO_NUMBER } = require('../config');

async function enviar(telefono, mensaje) {
  try {
    const client = twilio(TWILIO_SID, TWILIO_TOKEN);
    await client.messages.create({
      from: TWILIO_NUMBER,
      to: telefono.startsWith('whatsapp:') ? telefono : `whatsapp:${telefono}`,
      body: mensaje
    });
  } catch (e) {
    console.error('Error WhatsApp:', e.message);
  }
}

module.exports = { enviar };
