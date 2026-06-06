/**
 * api/admin-delete.js
 * Endpoint seguro para eliminación de pacientes y consultas.
 * Usa SUPABASE_KEY (service role) para bypassear RLS completamente.
 * Solo ejecuta si el token JWT pertenece a un usuario admin activo.
 */

const SUPA_URL         = process.env.SUPABASE_URL;
const SUPA_SERVICE_KEY = process.env.SUPABASE_KEY; // service_role en Vercel env vars

async function q(method, table, query = '') {
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      'apikey':        SUPA_SERVICE_KEY,
      'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
  });
  if (r.status === 204 || r.status === 200) {
    const text = await r.text();
    return text ? JSON.parse(text) : [];
  }
  const err = await r.json().catch(() => ({}));
  throw new Error(err.message || `HTTP ${r.status} en ${table}`);
}

// ── Decodificar JWT localmente (sin llamada extra a Supabase) ─────────────
function uidDesdeJWT(token) {
  try {
    const payload = token.split('.')[1];
    // base64url → base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    const data = JSON.parse(json);
    return data.sub || null; // Supabase JWT usa "sub" como user ID
  } catch (e) {
    return null;
  }
}

// ── Validar que el token pertenece a un admin activo ──────────────────────
async function verificarAdmin(token) {
  if (!token) throw new Error('Sin token de autenticación');

  // Decodificar JWT para obtener el user ID sin llamada a auth API
  const uid = uidDesdeJWT(token);
  if (!uid) throw new Error('No se pudo leer el token');

  // Consultar usuarios con SUPA_SERVICE_KEY (igual que hace el bot)
  const res = await fetch(
    `${SUPA_URL}/rest/v1/usuarios?id=eq.${uid}&select=id,rol,activo`,
    {
      headers: {
        'apikey':        SUPA_SERVICE_KEY,
        'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
      }
    }
  );

  const text = await res.text();
  console.log('[admin-delete] uid:', uid, 'usuarios raw:', text);

  let usuarios;
  try { usuarios = JSON.parse(text); } catch { usuarios = []; }

  const u = Array.isArray(usuarios) ? usuarios[0] : null;

  if (!u) throw new Error(`Usuario no encontrado en BD (uid=${uid})`);
  if (u.rol !== 'admin') throw new Error(`Rol insuficiente: ${u.rol}`);
  if (!u.activo) throw new Error('Usuario inactivo');

  return uid;
}

// ── Eliminar consulta y todas sus dependencias ────────────────────────────
async function eliminarConsulta(consultaId) {
  const recetas = await q('GET', 'recetas', `?consulta_id=eq.${consultaId}&select=id`);
  const rIds    = (recetas || []).map(r => r.id);

  // Ola 1: dependencias directas de la consulta (paralelo)
  const tasks = [
    q('DELETE', 'notificaciones', `?consulta_id=eq.${consultaId}`),
    q('DELETE', 'documentos',     `?consulta_id=eq.${consultaId}`),
  ];
  if (rIds.length) {
    tasks.push(q('DELETE', 'recordatorios', `?receta_id=in.(${rIds.join(',')})`));
  }
  await Promise.allSettled(tasks);

  // Ola 2: recetas → consulta
  await q('DELETE', 'recetas',   `?consulta_id=eq.${consultaId}`);
  await q('DELETE', 'consultas', `?id=eq.${consultaId}`);
}

// ── Eliminar paciente y todos sus registros ───────────────────────────────
async function eliminarPaciente(pacienteId) {
  // Obtener IDs de consultas y recetas del paciente
  const consultas = await q('GET', 'consultas', `?paciente_id=eq.${pacienteId}&select=id`);
  const cIds      = (consultas || []).map(c => c.id);

  let rIds = [];
  if (cIds.length) {
    const recetas = await q('GET', 'recetas', `?consulta_id=in.(${cIds.join(',')})&select=id`);
    rIds = (recetas || []).map(r => r.id);
  }

  // Ola 1: hojas (todo en paralelo)
  const tasks = [
    q('DELETE', 'documentos',            `?paciente_id=eq.${pacienteId}`),
    q('DELETE', 'antecedentes',          `?paciente_id=eq.${pacienteId}`),
    q('DELETE', 'paciente_cronicas',     `?paciente_id=eq.${pacienteId}`),
    q('DELETE', 'recordatorios',         `?paciente_id=eq.${pacienteId}`),
    q('DELETE', 'notificaciones',        `?paciente_id=eq.${pacienteId}`),
    q('DELETE', 'seguimiento_respuestas',`?paciente_id=eq.${pacienteId}`),
  ];
  if (cIds.length) {
    tasks.push(q('DELETE', 'notificaciones', `?consulta_id=in.(${cIds.join(',')})`));
    tasks.push(q('DELETE', 'documentos',     `?consulta_id=in.(${cIds.join(',')})`));
  }
  if (rIds.length) {
    tasks.push(q('DELETE', 'recordatorios', `?receta_id=in.(${rIds.join(',')})`));
  }
  await Promise.allSettled(tasks);

  // Ola 2: recetas
  await q('DELETE', 'recetas', `?paciente_id=eq.${pacienteId}`);

  // Ola 3: consultas
  await q('DELETE', 'consultas', `?paciente_id=eq.${pacienteId}`);

  // Ola 4: paciente (final)
  const deleted = await q('DELETE', 'pacientes', `?id=eq.${pacienteId}`);
  if (!deleted?.length) throw new Error('Paciente no encontrado o ya eliminado');
}

// ── Handler principal ─────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tipo, id, token } = req.body || {};
  if (!tipo || !id) return res.status(400).json({ error: 'Faltan parámetros (tipo, id)' });

  try {
    await verificarAdmin(token);

    if (tipo === 'consulta') {
      await eliminarConsulta(id);
      return res.status(200).json({ ok: true, msg: 'Consulta eliminada' });
    }
    if (tipo === 'paciente') {
      await eliminarPaciente(id);
      return res.status(200).json({ ok: true, msg: 'Paciente eliminado' });
    }
    return res.status(400).json({ error: `Tipo desconocido: ${tipo}` });

  } catch (e) {
    console.error('[admin-delete]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
