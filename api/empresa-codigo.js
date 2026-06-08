/**
 * api/empresa-codigo.js
 * Guarda o elimina el codigo_acceso de una empresa B2B.
 * Usa service_role para bypass de RLS.
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
  if (!token) throw new Error('Sin token');
  const email = decodeJWT(token).email;
  if (!email) throw new Error('Token inválido');
  const res = await fetch(
    `${SUPA_URL}/rest/v1/usuarios?correo=eq.${encodeURIComponent(email)}&activo=eq.true&select=id,rol`,
    { headers: { 'apikey': SUPA_SERVICE_KEY, 'Authorization': `Bearer ${SUPA_SERVICE_KEY}` } }
  );
  const rows = await res.json().catch(() => []);
  const u = rows?.[0];
  if (!u) throw new Error('Usuario no encontrado');
  if (u.rol !== 'admin') throw new Error('Solo admins pueden modificar códigos');
  return u.id;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, empresa_id, codigo } = req.body || {};
  if (!empresa_id) return res.status(400).json({ error: 'Falta empresa_id' });

  try {
    await verificarAdmin(token);

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

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${r.status}`);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[empresa-codigo]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
