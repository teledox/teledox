/**
 * api/atender-consulta.js
 * Asigna un médico a una consulta usando service_role (bypass RLS).
 * Verifica que el solicitante sea médico o admin activo.
 */

const SUPA_URL         = process.env.SUPABASE_URL;
const SUPA_SERVICE_KEY = process.env.SUPABASE_KEY;

function decodeJWT(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch { return {}; }
}

async function verificarMedico(token) {
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
  if (!u) throw new Error('Usuario no encontrado');
  if (!['medico', 'admin'].includes(u.rol)) throw new Error(`Sin permisos (rol: ${u.rol})`);
  return u.id;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, consulta_id } = req.body || {};
  if (!consulta_id) return res.status(400).json({ error: 'Falta consulta_id' });

  try {
    const medicoId = await verificarMedico(token);

    // Verificar que no esté ya tomada (race condition)
    const checkRes = await fetch(
      `${SUPA_URL}/rest/v1/consultas?id=eq.${consulta_id}&select=medico_id`,
      { headers: { 'apikey': SUPA_SERVICE_KEY, 'Authorization': `Bearer ${SUPA_SERVICE_KEY}` } }
    );
    const rows = await checkRes.json().catch(() => []);
    if (rows?.[0]?.medico_id) {
      return res.status(409).json({ error: 'ya_tomada' });
    }

    // Asignar médico con service_role
    const patchRes = await fetch(
      `${SUPA_URL}/rest/v1/consultas?id=eq.${consulta_id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey':        SUPA_SERVICE_KEY,
          'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal'
        },
        body: JSON.stringify({
          medico_id: medicoId,
          estado:    'en_atencion'
        })
      }
    );

    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${patchRes.status}`);
    }

    return res.status(200).json({ ok: true, medico_id: medicoId });

  } catch (e) {
    console.error('[atender-consulta]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
