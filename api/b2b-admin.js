/**
 * api/b2b-admin.js
 * Operaciones admin B2B (antes empresa-codigo.js + empleados-b2b.js).
 * Requiere body.action: 'codigo' | 'empleados'
 */

const SUPA_URL         = process.env.SUPABASE_URL;
const SUPA_SERVICE_KEY = process.env.SUPABASE_KEY;
const { verificarUsuario } = require('../src/services/authVerify');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, action, empresa_id, codigo, cedulas } = req.body || {};
  if (!empresa_id) return res.status(400).json({ error: 'Falta empresa_id' });

  try {
    await verificarUsuario(token, ['admin']);

    if (action === 'empleados') {
      if (!Array.isArray(cedulas) || !cedulas.length)
        return res.status(400).json({ error: 'Falta cedulas[]' });

      const rows = cedulas.map(c => ({ empresa_id, cedula: String(c).trim() }));
      const r = await fetch(
        `${SUPA_URL}/rest/v1/empleados_b2b?on_conflict=empresa_id%2Ccedula`,
        {
          method: 'POST',
          headers: {
            'apikey':        SUPA_SERVICE_KEY,
            'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
            'Content-Type':  'application/json',
            'Prefer':        'resolution=ignore-duplicates,return=representation'
          },
          body: JSON.stringify(rows)
        }
      );
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `HTTP ${r.status}`); }
      const insertadas = await r.json().catch(() => []);
      return res.status(200).json({ ok: true, insertadas: insertadas.length, total: cedulas.length });
    }

    // action === 'codigo' (default)
    const r = await fetch(`${SUPA_URL}/rest/v1/clientes_b2b?id=eq.${empresa_id}`, {
      method: 'PATCH',
      headers: {
        'apikey':        SUPA_SERVICE_KEY,
        'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal'
      },
      body: JSON.stringify({ codigo_acceso: codigo || null })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `HTTP ${r.status}`); }
    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('[b2b-admin]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
