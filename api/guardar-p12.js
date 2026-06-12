const { SUPABASE_URL, SUPABASE_KEY } = require('../src/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { usuario_id, firma_p12, firma_p12_info } = req.body || {};
  if (!usuario_id) return res.status(400).json({ error: 'Falta usuario_id' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?id=eq.${usuario_id}`,
      {
        method: 'PATCH',
        headers: {
          apikey:          SUPABASE_KEY,
          Authorization:   `Bearer ${SUPABASE_KEY}`,
          'Content-Type':  'application/json',
          Prefer:          'return=minimal'
        },
        body: JSON.stringify({
          firma_p12:      firma_p12      ?? null,
          firma_p12_info: firma_p12_info ?? null
        })
      }
    );

    if (!r.ok) {
      const msg = await r.text();
      console.error('[guardar-p12]', msg);
      return res.status(500).json({ error: msg });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[guardar-p12]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
