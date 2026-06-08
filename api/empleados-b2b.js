/**
 * api/empleados-b2b.js
 * Carga masiva de cédulas B2B usando service_role (bypass RLS).
 * Solo ejecuta si el token JWT pertenece a un usuario admin activo.
 */

const SUPA_URL         = process.env.SUPABASE_URL;
const SUPA_SERVICE_KEY = process.env.SUPABASE_KEY;

function decodeJWT(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch { return {}; }
}

async function verificarAdmin(token) {
  if (!token) throw new Error('Sin token de autenticación');
  const payload = decodeJWT(token);
  const email   = payload.email;
  if (!email) throw new Error('Token sin email');
  const res = await fetch(
    `${SUPA_URL}/rest/v1/usuarios?correo=eq.${encodeURIComponent(email)}&activo=eq.true&select=id,rol`,
    { headers: { 'apikey': SUPA_SERVICE_KEY, 'Authorization': `Bearer ${SUPA_SERVICE_KEY}` } }
  );
  const usuarios = await res.json().catch(() => []);
  const u = Array.isArray(usuarios) ? usuarios[0] : null;
  if (!u)              throw new Error(`Usuario no encontrado: ${email}`);
  if (u.rol !== 'admin') throw new Error(`Sin permisos de admin (rol: ${u.rol})`);
  return u.id;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, empresa_id, cedulas } = req.body || {};
  if (!empresa_id || !Array.isArray(cedulas) || !cedulas.length)
    return res.status(400).json({ error: 'Faltan parámetros (empresa_id, cedulas)' });

  try {
    await verificarAdmin(token);

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

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${r.status}`);
    }

    const insertadas = await r.json().catch(() => []);
    return res.status(200).json({ ok: true, insertadas: insertadas.length, total: cedulas.length });

  } catch (e) {
    console.error('[empleados-b2b]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
