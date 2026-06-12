const { SUPABASE_URL, SUPABASE_KEY } = require('../src/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { id, ...campos } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Falta id del usuario' });

  // Solo permitir campos seguros (evitar que se pasen campos sensibles arbitrarios)
  const permitidos = ['nombre', 'apellidos', 'rol', 'especialidad', 'numero_registro', 'cedula', 'telefono', 'activo'];
  const update = {};
  for (const k of permitidos) {
    if (k in campos) update[k] = campos[k];
  }

  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=representation'
      },
      body: JSON.stringify(update)
    });

    const data = await r.json();
    if (!r.ok) {
      console.error('[actualizar-usuario]', data);
      return res.status(500).json({ error: data.message || JSON.stringify(data) });
    }

    return res.status(200).json({ ok: true, usuario: Array.isArray(data) ? data[0] : data });
  } catch (e) {
    console.error('[actualizar-usuario]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
