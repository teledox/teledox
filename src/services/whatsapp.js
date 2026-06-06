const { WA_TOKEN, WA_PHONE_ID } = require('../config');

const API_URL = `https://graph.facebook.com/v25.0/${WA_PHONE_ID}/messages`;

const HEADERS = {
  'Authorization': `Bearer ${WA_TOKEN}`,
  'Content-Type': 'application/json',
};

async function _post(payload) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error('WhatsApp API error:', JSON.stringify(err));
    }
  } catch (e) {
    console.error('WhatsApp fetch error:', e.message);
  }
}

// ── Mensaje de texto plano ────────────────────────────────────────────────
async function enviar(telefono, mensaje) {
  const numero = telefono.replace('whatsapp:', '').replace('+', '').trim();
  await _post({
    messaging_product: 'whatsapp',
    to: numero,
    type: 'text',
    text: { body: mensaje },
  });
}

// ── Botones de respuesta rápida (max 3 botones, título max 20 chars) ──────
// botones: [{ id, titulo }]
async function enviarBotones(telefono, texto, botones, cabecera = null) {
  const numero = telefono.replace('whatsapp:', '').replace('+', '').trim();

  const interactive = {
    type: 'button',
    body: { text: texto },
    action: {
      buttons: botones.slice(0, 3).map(b => ({
        type: 'reply',
        reply: {
          id: String(b.id).substring(0, 256),
          title: String(b.titulo).substring(0, 20),
        },
      })),
    },
  };

  if (cabecera) {
    interactive.header = { type: 'text', text: String(cabecera).substring(0, 60) };
  }

  await _post({
    messaging_product: 'whatsapp',
    to: numero,
    type: 'interactive',
    interactive,
  });
}

// ── Lista de opciones (max 10 por sección, título max 24 chars) ──────────
// secciones: [{ titulo, filas: [{ id, titulo, descripcion? }] }]
async function enviarLista(telefono, texto, secciones, botonTexto = 'Ver opciones', cabecera = null) {
  const numero = telefono.replace('whatsapp:', '').replace('+', '').trim();

  const interactive = {
    type: 'list',
    body: { text: texto },
    action: {
      button: String(botonTexto).substring(0, 20),
      sections: secciones.map(s => ({
        title: String(s.titulo).substring(0, 24),
        rows: s.filas.map(f => ({
          id: String(f.id).substring(0, 256),
          title: String(f.titulo).substring(0, 24),
          ...(f.descripcion ? { description: String(f.descripcion).substring(0, 72) } : {}),
        })),
      })),
    },
  };

  if (cabecera) {
    interactive.header = { type: 'text', text: String(cabecera).substring(0, 60) };
  }

  await _post({
    messaging_product: 'whatsapp',
    to: numero,
    type: 'interactive',
    interactive,
  });
}

module.exports = { enviar, enviarBotones, enviarLista };
