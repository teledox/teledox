/**
 * api/webhook.js
 * Endpoint público de Webhook para Meta WhatsApp Cloud API.
 * Desactiva bodyParser de Vercel para entregar el stream de bytes crudos exacto
 * a src/handlers/webhook.js (necesario para validación HMAC y respuestas interactiva de botones).
 */
const handler = require('../src/handlers/webhook');

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
