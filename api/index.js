/**
 * api/index.js
 * Router maestro de Vercel Serverless Functions para MediLyft.
 * Agrupa todas las rutas de /api/* en una sola función serverless,
 * respetando el límite de Vercel Hobby y manteniendo compatibilidad total.
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
  '/api/admin-delete':           require('../src/handlers/admin-delete')
};

module.exports = async function masterRouter(req, res) {
  const urlPath = (req.url || '').split('?')[0].replace(/\/$/, '');

  const handler = handlers[urlPath];
  if (handler) {
    return handler(req, res);
  }

  return res.status(404).json({ error: `Ruta ${urlPath} no encontrada` });
};
