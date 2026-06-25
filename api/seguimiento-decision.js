/**
 * api/seguimiento-decision.js
 * Médico aprueba o rechaza una solicitud de "consulta de seguimiento".
 * - rechazada: solo marca la notificación, no se envía nada al paciente.
 * - aprobada: marca la notificación y envía WhatsApp al paciente preguntando
 *   si desea agendar (inicia flujo en paso 90).
 */

const SUPA_URL         = process.env.SUPABASE_URL;
const SUPA_SERVICE_KEY = process.env.SUPABASE_KEY;

const { guardar }      = require('../src/services/sesiones');
const { enviarBotones } = require('../src/services/whatsapp');

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
    `${SUPA_URL}/rest/v1/usuarios?correo=eq.${encodeURIComponent(email)}&activo=eq.true&select=id,rol,nombre,apellidos`,
    { headers: { 'apikey': SUPA_SERVICE_KEY, 'Authorization': `Bearer ${SUPA_SERVICE_KEY}` } }
  );
  const usuarios = await res.json().catch(() => []);
  const u = Array.isArray(usuarios) ? usuarios[0] : null;
  if (!u) throw new Error('Usuario no encontrado');
  if (!['medico', 'admin'].includes(u.rol)) throw new Error(`Sin permisos (rol: ${u.rol})`);
  return u;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, notificacion_id, decision } = req.body || {};
  if (!notificacion_id || !['aprobada', 'rechazada'].includes(decision)) {
    return res.status(400).json({ error: 'Faltan parámetros (notificacion_id, decision)' });
  }

  try {
    const medico = await verificarMedico(token);

    const notifRes = await fetch(
      `${SUPA_URL}/rest/v1/notificaciones?id=eq.${notificacion_id}&select=*,pacientes(*)`,
      { headers: { 'apikey': SUPA_SERVICE_KEY, 'Authorization': `Bearer ${SUPA_SERVICE_KEY}` } }
    );
    const rows = await notifRes.json().catch(() => []);
    const notif = rows?.[0];
    if (!notif) return res.status(404).json({ error: 'Notificación no encontrada' });
    if (notif.origen !== 'seguimiento') return res.status(400).json({ error: 'No es una alerta de seguimiento' });

    await fetch(`${SUPA_URL}/rest/v1/notificaciones?id=eq.${notificacion_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_SERVICE_KEY, 'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ estado_validacion: decision, medico_validador_id: medico.id })
    });

    if (decision === 'aprobada') {
      const p = notif.pacientes;
      const telefono = p?.telefono;
      if (telefono) {
        const datosSesion = {
          paciente_id: p.id,
          cedula: p.cedula,
          nombre: p.nombre,
          apellidos: p.apellidos,
          nombreCompleto: `${p.nombre || ''} ${p.apellidos || ''}`.trim(),
          edad: p.edad,
          correo: p.correo,
          telefonoContacto: p.telefono,
          lugar_residencia: p.lugar_residencia,
          cliente_b2b_id: p.cliente_b2b_id || null,
          consulta_origen_id: notif.consulta_id || null,
        };
        await guardar(telefono, 'sp_confirmar', datosSesion, 'seguimiento_pago');

        const medicoNombre = `${medico.nombre || ''} ${medico.apellidos || ''}`.trim();
        await enviarBotones(
          telefono,
          `Hola ${p.nombre || ''} 👋\n\nEl Dr./Dra. ${medicoNombre || 'su médico'} revisó su evolución y considera conveniente realizar una *consulta de seguimiento* para revisar cómo sigue.\n\n¿Desea agendar esta consulta de control?`,
          [
            { id: 'si', titulo: '✅ Sí, agendar' },
            { id: 'no', titulo: '❌ No, gracias' },
          ]
        );
      }
    }

    return res.status(200).json({ ok: true, decision });

  } catch (e) {
    console.error('[seguimiento-decision]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
