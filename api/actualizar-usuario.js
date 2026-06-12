const SUPA_URL         = process.env.SUPABASE_URL;
const SUPA_SERVICE_KEY = process.env.SUPABASE_KEY; // service_role en Vercel env vars

const CAMPOS_PERMITIDOS = ['nombre', 'apellidos', 'rol', 'especialidad', 'numero_registro', 'cedula', 'telefono', 'activo'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPA_URL || !SUPA_SERVICE_KEY) {
    return res.status(500).json({ error: 'Config de Supabase no disponible (SUPABASE_URL / SUPABASE_KEY)' });
  }

  const { id, ...campos } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Falta id del usuario' });

  const update = {};
  for (const campo of CAMPOS_PERMITIDOS) {
    if (campo in campos) update[campo] = campos[campo];
  }
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'Sin campos válidos para actualizar' });
  }
  if ('nombre' in update && !update.nombre) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }
  if ('apellidos' in update && !update.apellidos) {
    return res.status(400).json({ error: 'Los apellidos son obligatorios' });
  }

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/usuarios?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        apikey:         SUPA_SERVICE_KEY,
        Authorization:  `Bearer ${SUPA_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=representation'
      },
      body: JSON.stringify(update)
    });

    const text = await r.text();

    if (!r.ok) {
      console.error('[actualizar-usuario] Supabase error:', r.status, text);
      return res.status(502).json({ error: `Error de Supabase (${r.status})` });
    }

    let data;
    try { data = JSON.parse(text); } catch { data = []; }

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json({ ok: true, usuario: data[0] });

  } catch (e) {
    console.error('[actualizar-usuario]', e.message);
    return res.status(500).json({ error: 'Error interno al actualizar el usuario' });
  }
};
