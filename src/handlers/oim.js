/**
 * src/handlers/oim.js
 * Handler principal para los endpoints de OIM (Agendamiento, Métricas y Exportación CSV).
 */

const { agendarPacienteOIM, obtenerMetricasOIM, exportarAuditoriaCSV, obtenerConsultasAuditoriaOIM } = require('../services/oimService');

module.exports = async function handler(req, res) {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const urlPath = (req.url || '').split('?')[0].replace(/\/$/, '');
  const method = req.method;

  try {
    // 1. Agendamiento de Pacientes (Flujo Operador OIM)
    if (urlPath.endsWith('/agendamiento') || req.body?.action === 'agendamiento') {
      if (method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Use POST para agendamiento.' });
      }
      const data = req.body || {};
      const resultado = await agendarPacienteOIM(data);
      return res.status(200).json(resultado);
    }

    // 2. Endpoints de Métricas de Pacientes OIM
    if (urlPath.endsWith('/metricas') || req.body?.action === 'metricas') {
      const filters = method === 'GET' ? (req.query || {}) : (req.body || {});
      const resultado = await obtenerMetricasOIM(filters);
      return res.status(200).json(resultado);
    }

    // 3. Listado de Consultas OIM para Auditoría en Vivo
    if (urlPath.endsWith('/consultas') || req.body?.action === 'consultas') {
      const filters = method === 'GET' ? (req.query || {}) : (req.body || {});
      const resultado = await obtenerConsultasAuditoriaOIM(filters);
      return res.status(200).json(resultado);
    }

    // 4. Exportación de Auditoría de Consultas en CSV
    if (urlPath.endsWith('/exportar-auditoria-csv') || req.body?.action === 'exportar_csv') {
      const filters = method === 'GET' ? (req.query || {}) : (req.body || {});
      const { filename, csvContent, total_registros } = await exportarAuditoriaCSV(filters);

      if (req.query?.download === 'true' || method === 'GET') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(csvContent);
      }

      return res.status(200).json({
        ok: true,
        total_registros,
        filename,
        csv_data: csvContent
      });
    }

    // Si se consulta el endpoint base /api/oim con action
    const action = req.body?.action || req.query?.action;
    if (action === 'agendar') {
      const resultado = await agendarPacienteOIM(req.body || {});
      return res.status(200).json(resultado);
    } else if (action === 'metricas') {
      const resultado = await obtenerMetricasOIM(req.body || req.query || {});
      return res.status(200).json(resultado);
    } else if (action === 'consultas') {
      const resultado = await obtenerConsultasAuditoriaOIM();
      return res.status(200).json(resultado);
    } else if (action === 'exportar_csv') {
      const resultado = await exportarAuditoriaCSV(req.body || req.query || {});
      return res.status(200).json(resultado);
    }

    return res.status(400).json({
      error: 'Acción u sub-ruta no especificada. Rutas disponibles: /api/oim/agendamiento, /api/oim/metricas, /api/oim/consultas, /api/oim/exportar-auditoria-csv'
    });

  } catch (err) {
    console.error('[Handler OIM Error]:', err.message);
    return res.status(500).json({
      error: err.message || 'Error interno procesando requerimiento OIM'
    });
  }
};
