const { WA_TOKEN, WA_PHONE_ID } = require('../config');

async function enviar(telefono, mensaje) {
  try {
    // Normalizar número — Meta espera solo dígitos sin "+" ni "whatsapp:"
    const numero = telefono.replace('whatsapp:', '').replace('+', '').trim();

    const res = await fetch(
      `https://graph.facebook.com/v25.0/${WA_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numero,
          type: 'text',
          text: { body: mensaje },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      console.error('Error WhatsApp Meta:', JSON.stringify(err));
    }
  } catch (e) {
    console.error('Error WhatsApp:', e.message);
  }
}

module.exports = { enviar };
