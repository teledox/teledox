/**
 * api/index.js
 * Router maestro de Vercel Serverless Functions para MediLyft.
 * Agrupa todas las rutas de /api/* en una sola función serverless.
 * Build v2.2.0 — 2026-07-17
 */

const handlers = {
  '/api/webhook':                require('../src/handlers/webhook'),
  '/api/cron':                   require('../src/handlers/cron'),
  '/api/atender-consulta':       require('../src/handlers/atender-consulta'),
  '/api/b2b-admin':              require('../src/handlers/b2b-admin'),
  '/api/compress':               require('../src/handlers/compress'),
  '/api/enviar-docs':            require('../src/handlers/enviar-docs'),
  '/api/enviar-link':            require('../src/handlers/enviar-link'),
  '/api/enviar-seguimiento-lab': require('../src/handlers/enviar-seguimiento-lab'),
  '/api/firma-electronica':      require('../src/handlers/firma-electronica'),
  '/api/responder-mensaje':      require('../src/handlers/responder-mensaje'),
  '/api/seguimiento-decision':   require('../src/handlers/seguimiento-decision'),
  '/api/admin-delete':           require('../src/handlers/admin-delete'),
  '/api/oim':                    require('../src/handlers/oim'),
  '/api/oim/agendamiento':       require('../src/handlers/oim'),
  '/api/oim/metricas':           require('../src/handlers/oim'),
  '/api/oim/consultas':          require('../src/handlers/oim'),
  '/api/oim/exportar-auditoria-csv': require('../src/handlers/oim')
};

async function masterRouter(req, res) {
  // Desactivar bodyParser automático de Vercel para capturar el rawBody exacto de Meta (firmas HMAC)
  if (!req.rawBody && req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      req.rawBody = buffer.toString('utf8');

      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json') && req.rawBody) {
        try { req.body = JSON.parse(req.rawBody); } catch {}
      } else if (contentType.includes('application/pdf')) {
        req.body = buffer;
      }
    } catch (err) {
      console.error('[masterRouter] Error leyendo rawBody:', err.message);
    }
  }

  const urlPath = (req.url || '').split('?')[0].replace(/\/$/, '');

  const handler = handlers[urlPath];
  if (handler) {
    return handler(req, res);
  }

  return res.status(404).json({ error: `Ruta ${urlPath} no encontrada` });
}

module.exports = masterRouter;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
