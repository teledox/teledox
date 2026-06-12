const { SUPABASE_URL, SUPABASE_KEY } = require('../src/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'Falta id' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/documentos_firmados?id=eq.${encodeURIComponent(id)}&select=titular,tipo_documento,creado_en`,
      {
        headers: {
          apikey:        SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (!r.ok) {
      const msg = await r.text();
      console.error('[verificar-firma]', msg);
      return res.status(500).json({ error: msg });
    }

    const registros = await r.json();
    if (!registros.length) return res.status(404).json({ error: 'Documento no encontrado' });

    return res.status(200).json(registros[0]);
  } catch (e) {
    console.error('[verificar-firma]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
