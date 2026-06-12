const { SUPABASE_URL, SUPABASE_KEY } = require('../src/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { usuario_id, titular, tipo_documento } = req.body || {};
  if (!usuario_id) return res.status(400).json({ error: 'Falta usuario_id' });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/documentos_firmados`, {
      method: 'POST',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=representation'
      },
      body: JSON.stringify({
        usuario_id,
        titular:        titular ?? null,
        tipo_documento: tipo_documento ?? null
      })
    });

    if (!r.ok) {
      const msg = await r.text();
      console.error('[registrar-firma]', msg);
      return res.status(500).json({ error: msg });
    }

    const [registro] = await r.json();
    return res.status(200).json({ id: registro.id });
  } catch (e) {
    console.error('[registrar-firma]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
