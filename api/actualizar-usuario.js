const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { id, ...campos } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Falta id del usuario' });
  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: 'Config de BD no disponible' });

  // Solo permitir campos seguros
  const permitidos = ['nombre', 'apellidos', 'rol', 'especialidad', 'numero_registro', 'cedula', 'telefono', 'activo'];
  const update = {};
  for (const k of permitidos) {
    if (k in campos) update[k] = campos[k];
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Sin campos para actualizar' });

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/usuarios?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        apikey:         SUPA_KEY,
        Authorization:  `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=representation'
      },
      body: JSON.stringify(update)
    });

    const text = await r.text();

    if (!r.ok) {
      console.error('[actualizar-usuario] Supabase error:', r.status, text);
      return res.status(500).json({ error: `Supabase ${r.status}: ${text}` });
    }

    let data;
    try { data = JSON.parse(text); } catch { data = []; }

    if (!Array.isArray(data) || data.length === 0) {
      console.warn('[actualizar-usuario] No se actualizó ninguna fila. id=', id);
      return res.status(404).json({ error: 'Usuario no encontrado o sin cambios' });
    }

    console.log('[actualizar-usuario] OK id=', id, 'campos=', Object.keys(update).join(','));
    return res.status(200).json({ ok: true, usuario: data[0] });

  } catch (e) {
    console.error('[actualizar-usuario]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
