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
      return false;
    }
    return true;
  } catch (e) {
    console.error('WhatsApp fetch error:', e.message);
    return false;
  }
}

// ── Mensaje de texto plano ────────────────────────────────────────────────
async function enviar(telefono, mensaje) {
  const numero = telefono.replace('whatsapp:', '').replace('+', '').trim();
  return _post({
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

// ── Descarga de un archivo multimedia recibido (imagen/documento) ────────
async function descargarMedia(mediaId) {
  const metaRes = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  });
  const meta = await metaRes.json();
  if (!meta.url) throw new Error('No se pudo obtener la URL del archivo de WhatsApp');

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  });
  if (!fileRes.ok) throw new Error('No se pudo descargar el archivo de WhatsApp');

  return { buffer: Buffer.from(await fileRes.arrayBuffer()), mimeType: meta.mime_type };
}

// ── Plantilla de WhatsApp (mensajes fuera de la ventana de 24h) ──────────
// variables: ['Juan', 'Hipertensión']  →  {{1}}, {{2}} en el cuerpo
// payloadsBotones: ['hola', 'que_es_esto']  →  payload de cada quick_reply
async function enviarTemplate(telefono, nombrePlantilla, variables = [], payloadsBotones = []) {
  const numero = telefono.replace('whatsapp:', '').replace('+', '').trim();

  const components = [];

  if (variables.length > 0) {
    components.push({
      type: 'body',
      parameters: variables.map(v => ({ type: 'text', text: String(v) }))
    });
  }

  payloadsBotones.forEach((payload, i) => {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(i),
      parameters: [{ type: 'payload', payload: String(payload) }]
    });
  });

  return _post({
    messaging_product: 'whatsapp',
    to: numero,
    type: 'template',
    template: {
      name: nombrePlantilla,
      language: { code: 'es' },
      components
    }
  });
}

module.exports = { enviar, enviarBotones, enviarLista, descargarMedia, enviarTemplate };
