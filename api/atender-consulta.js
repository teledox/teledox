/**
 * api/atender-consulta.js
 * Asigna un médico a una consulta usando service_role (bypass RLS).
 * Verifica que el solicitante sea médico o admin activo.
 */

const { query } = require('../src/services/supabase');
const { enviar } = require('../src/services/whatsapp');
const { guardar, obtener } = require('../src/services/sesiones');
const { ENFERMEDADES } = require('../src/flows/flujo-cronicas');

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

// Dispara manualmente (desde el panel) el envío de la primera pregunta de
// seguimiento de una enfermedad crónica, para pruebas/demo sin esperar al cron.
async function dispararSeguimientoCronico(req, res) {
  const { enfermedad_id } = req.body || {};
  if (!enfermedad_id) return res.status(400).json({ error: 'Falta enfermedad_id' });

  const rows = await query('GET', 'enfermedades_cronicas', null,
    `?id=eq.${enfermedad_id}&select=*,pacientes(nombre,apellidos,telefono)`
  );
  const c = rows?.[0];
  if (!c) return res.status(404).json({ error: 'Enfermedad crónica no encontrada' });
  if (!c.activo) return res.status(400).json({ error: 'El seguimiento está pausado' });

  const telefono = c.pacientes?.telefono;
  if (!telefono) return res.status(400).json({ error: 'El paciente no tiene teléfono registrado' });

  const enfDef = ENFERMEDADES[c.enfermedad];
  if (!enfDef) return res.status(400).json({ error: `Enfermedad desconocida: ${c.enfermedad}` });

  // Igual que el loop de cron.js: usar el teléfono del paciente tal cual está en la BD
  // (sin reformatear), para que coincida con la sesión que luego busca webhook.js.
  const sesion = await obtener(telefono);
  if (sesion && sesion.paso !== 0) return res.status(409).json({ error: 'El paciente ya tiene una conversación activa con el bot' });

  const paciente = c.pacientes || {};
  const primeraPregunta = enfDef.pasos[0];
  const mensaje = `🩺 *Seguimiento MediLyft — ${enfDef.nombre}*\n\nHola ${paciente.nombre || ''}! Es hora de su control diario.\n\n${primeraPregunta.pregunta}`;

  await enviar(telefono, mensaje);

  await guardar(telefono, 200, {
    enfermedad_key: c.enfermedad,
    enfermedad_id: c.id,
    paciente_id: c.paciente_id,
    paso_cronico: 1
  });

  const ahora = new Date();
  const proximoSeguimiento = new Date(ahora.getTime() + (c.frecuencia_horas || 24) * 3600000);
  await query('PATCH', 'enfermedades_cronicas', {
    ultima_consulta: ahora.toISOString(),
    proximo_seguimiento: proximoSeguimiento.toISOString()
  }, `?id=eq.${c.id}`);

  return res.status(200).json({ ok: true, numero: telefono, paciente: `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim() });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, consulta_id, accion } = req.body || {};

  try {
    const medicoId = await verificarMedico(token);

    if (accion === 'disparar_cronico') return await dispararSeguimientoCronico(req, res);

    if (!consulta_id) return res.status(400).json({ error: 'Falta consulta_id' });

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
          medico_id:   medicoId,
          estado:      'en_atencion',
          atendido_at: new Date().toISOString()
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
