// Servidor local que expone api/webhook.js para pruebas, con el envío de
// WhatsApp mockeado (no llama a la API real de Meta — ver mock-whatsapp.js).
//
// Uso: node --env-file=.env.local scripts/test-bot/server.js

const http = require('http');
const crypto = require('crypto');

// api/webhook.js ahora exige X-Hub-Signature-256 válida (fail-closed). Los
// escenarios de prueba firman su payload con este mismo secreto — ver
// firmarPayload() más abajo, usado por run.js y repl.js.
process.env.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || 'test-secret-solo-para-scripts-test-bot';

// Habilita el atajo media.id === '__TEST__' de flujo-b2c.js (confirmación de
// pago sin comprobante real) SOLO dentro de este harness de pruebas.
process.env.ALLOW_TEST_BYPASS = 'true';

function firmarPayload(rawBody) {
  return 'sha256=' + crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex');
}

const whatsappPath = require.resolve('../../src/services/whatsapp');
const mock = require('./mock-whatsapp');
require.cache[whatsappPath] = {
  id: whatsappPath,
  filename: whatsappPath,
  loaded: true,
  exports: mock,
};

// Forzar "dentro de horario" para que los escenarios sean deterministas a
// cualquier hora del día (sin esto, correr de noche rutea los flujos a
// "fuera de horario" y rompe las aserciones de pago/consulta registrada).
const horarioPath = require.resolve('../../src/utils/horarioOperacion');
const horarioReal = require('../../src/utils/horarioOperacion');
require.cache[horarioPath] = {
  id: horarioPath,
  filename: horarioPath,
  loaded: true,
  exports: { ...horarioReal, estaEnHorario: () => true },
};

const handler = require('../../src/handlers/webhook');

function attachExpressLike(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (data) => { res.end(typeof data === 'string' ? data : JSON.stringify(data)); };
  return res;
}

const server = http.createServer((req, res) => {
  attachExpressLike(res);

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    req.query = Object.fromEntries(url.searchParams);
    return handler(req, res);
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    req.rawBody = body;
    try { req.body = JSON.parse(body || '{}'); } catch { req.body = {}; }
    handler(req, res).catch((err) => {
      console.error('Error no manejado:', err);
      res.status(500).send('Error');
    });
  });
});

const PORT = process.env.TEST_PORT || 3333;

const ready = new Promise((resolve) => {
  server.listen(PORT, () => {
    if (require.main === module) {
      console.log(`Servidor de pruebas (webhook mockeado) en http://localhost:${PORT}/api/webhook`);
    }
    resolve();
  });
});

module.exports = { server, mock, PORT, ready, firmarPayload };
