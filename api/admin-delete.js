/**
 * api/admin-delete.js
 * Endpoint seguro para eliminación de pacientes y consultas.
 * Usa SUPABASE_KEY (service role) para bypassear RLS completamente.
 * Solo ejecuta si el token JWT pertenece a un usuario admin activo.
 */

const SUPA_URL         = process.env.SUPABASE_URL;
const SUPA_SERVICE_KEY = process.env.SUPABASE_KEY; // service_role en Vercel env vars
const { verificarUsuario } = require('../src/services/authVerify');

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

// ── Borrar recetas + toda su cadena de dependientes
async function borrarCadenaRecetas(recetaIds) {
  if (!recetaIds.length) return;
  const inR = `(${recetaIds.join(',')})`;
  // seguimiento_respuestas → recordatorios → recetas
  const recordatorios = await q('GET', 'recordatorios', `?receta_id=in.${inR}&select=id`);
  const recIds = (recordatorios || []).map(r => r.id);
  if (recIds.length) {
    await q('DELETE', 'seguimiento_respuestas', `?recordatorio_id=in.(${recIds.join(',')})`);
    await q('DELETE', 'recordatorios', `?receta_id=in.${inR}`);
  }
  await q('DELETE', 'recetas', `?id=in.${inR}`);
}

// ── Eliminar consulta completa (manual en cascada)
async function eliminarConsulta(consultaId) {
  // 1. Recetas y su cadena
  const recetas = await q('GET', 'recetas', `?consulta_id=eq.${consultaId}&select=id`);
  await borrarCadenaRecetas((recetas || []).map(r => r.id));

  // 2. Resto de dependientes
  await Promise.allSettled([
    q('DELETE', 'notificaciones',  `?consulta_id=eq.${consultaId}`),
    q('DELETE', 'documentos',      `?consulta_id=eq.${consultaId}`),
    q('DELETE', 'planillaje_b2b',  `?consulta_id=eq.${consultaId}`),
    q('DELETE', 'documentos_datos',`?consulta_id=eq.${consultaId}`),
  ]);

  // 3. Consulta
  await q('DELETE', 'consultas', `?id=eq.${consultaId}`);
}

// ── Actualizar datos de un usuario de la plataforma
const CAMPOS_USUARIO_PERMITIDOS = ['nombre', 'apellidos', 'rol', 'especialidad', 'numero_registro', 'cedula', 'telefono', 'activo'];

async function actualizarUsuario(id, campos) {
  const update = {};
  for (const campo of CAMPOS_USUARIO_PERMITIDOS) {
    if (campo in campos) update[campo] = campos[campo];
  }
  if (Object.keys(update).length === 0) throw new Error('Sin campos válidos para actualizar');
  if ('nombre' in update && !update.nombre) throw new Error('El nombre es obligatorio');
  if ('apellidos' in update && !update.apellidos) throw new Error('Los apellidos son obligatorios');

  const r = await fetch(`${SUPA_URL}/rest/v1/usuarios?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey':        SUPA_SERVICE_KEY,
      'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
    body: JSON.stringify(update)
  });

  const text = await r.text();
  if (!r.ok) {
    let detalle = text;
    try { detalle = JSON.parse(text).message || JSON.parse(text).hint || text; } catch {}
    throw new Error(`Error de Supabase (${r.status}): ${detalle}`);
  }

  const data = JSON.parse(text || '[]');
  if (!data.length) throw new Error('Usuario no encontrado');
  return data[0];
}

// ── Eliminar paciente completo (manual en cascada)
async function eliminarPaciente(pacienteId) {
  // 1. Consultas del paciente
  const consultas = await q('GET', 'consultas', `?paciente_id=eq.${pacienteId}&select=id`);
  const cIds = (consultas || []).map(c => c.id);

  if (cIds.length) {
    const inC = `(${cIds.join(',')})`;

    // 1a. Recetas y su cadena (recordatorios, seguimiento_respuestas)
    const recetas = await q('GET', 'recetas', `?consulta_id=in.${inC}&select=id`);
    await borrarCadenaRecetas((recetas || []).map(r => r.id));

    // 1b. Resto de dependientes de consultas
    await Promise.allSettled([
      q('DELETE', 'notificaciones',  `?consulta_id=in.${inC}`),
      q('DELETE', 'documentos',      `?consulta_id=in.${inC}`),
      q('DELETE', 'planillaje_b2b',  `?consulta_id=in.${inC}`),
      q('DELETE', 'documentos_datos',`?consulta_id=in.${inC}`),
    ]);

    await q('DELETE', 'consultas', `?paciente_id=eq.${pacienteId}`);
  }

  // 2. Tablas directas del paciente
  await Promise.allSettled([
    q('DELETE', 'enfermedades_cronicas', `?paciente_id=eq.${pacienteId}`),
    q('DELETE', 'antecedentes',          `?paciente_id=eq.${pacienteId}`),
    q('DELETE', 'documentos',            `?paciente_id=eq.${pacienteId}`),
    q('DELETE', 'notificaciones',        `?paciente_id=eq.${pacienteId}`),
    q('DELETE', 'seguimiento',           `?paciente_id=eq.${pacienteId}`),
    q('DELETE', 'registros_cronicos',    `?paciente_id=eq.${pacienteId}`),
  ]);

  // 3. Paciente
  await q('DELETE', 'pacientes', `?id=eq.${pacienteId}`);
}

// ── Handler principal ─────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tipo, id, token, campos } = req.body || {};
  if (!tipo || !id) return res.status(400).json({ error: 'Faltan parámetros (tipo, id)' });

  try {
    await verificarUsuario(token, ['admin']);

    if (tipo === 'consulta') {
      await eliminarConsulta(id);
      return res.status(200).json({ ok: true, msg: 'Consulta eliminada' });
    }
    if (tipo === 'paciente') {
      await eliminarPaciente(id);
      return res.status(200).json({ ok: true, msg: 'Paciente eliminado' });
    }
    if (tipo === 'usuario') {
      const usuario = await actualizarUsuario(id, campos || {});
      return res.status(200).json({ ok: true, usuario });
    }
    return res.status(400).json({ error: `Tipo desconocido: ${tipo}` });

  } catch (e) {
    console.error('[admin-delete]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
