/**
 * api/notificar-agendamiento.js
 * Avisa por WhatsApp al paciente que su consulta de seguimiento fue agendada/confirmada.
 */

const { WA_TOKEN, WA_PHONE_ID, SUPABASE_URL, SUPABASE_KEY } = require('../src/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { paciente_id, fecha, medico_nombre, notas } = req.body || {};
  if (!paciente_id || !fecha) return res.status(400).json({ error: 'Faltan paciente_id o fecha' });

  try {
    const pacRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pacientes?id=eq.${paciente_id}&select=nombre,apellidos,telefono`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const pacRows = await pacRes.json();
    const pac = pacRows?.[0];
    if (!pac?.telefono) return res.status(400).json({ error: 'El paciente no tiene teléfono registrado' });

    const soloDigitos = String(pac.telefono).replace(/\D/g, '');
    const numero = soloDigitos.startsWith('0') ? '593' + soloDigitos.slice(1) : soloDigitos;
    if (!numero || numero.length < 10) return res.status(400).json({ error: `Teléfono inválido: ${pac.telefono}` });

    const fechaFmt = new Date(fecha).toLocaleString('es-EC', { dateStyle: 'long', timeStyle: 'short' });
    const medico = medico_nombre ? `con Dr(a). ${medico_nombre}` : 'con su médico';
    const mensaje = `🩺 *MediLyft — Consulta de seguimiento*\n\nHola ${pac.nombre || ''}! Su equipo médico agendó una consulta de seguimiento ${medico}.\n\n📅 *Fecha:* ${fechaFmt}${notas ? `\n📝 *Nota:* ${notas}` : ''}\n\nLe contactaremos por este chat cuando esté por comenzar.`;

    const waRes = await fetch(`https://graph.facebook.com/v25.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero,
        type: 'text',
        text: { body: mensaje }
      })
    });

    const waData = await waRes.json();
    if (!waRes.ok || waData.error) {
      const msg = waData.error?.message || JSON.stringify(waData);
      console.error('[notificar-agendamiento] WA error:', msg);
      return res.status(500).json({ error: msg });
    }

    console.log(`[notificar-agendamiento] Aviso de consulta enviado a ${pac.nombre} ${pac.apellidos || ''} · ${numero}`);

    return res.status(200).json({ ok: true, numero, paciente: `${pac.nombre} ${pac.apellidos || ''}`.trim() });

  } catch (e) {
    console.error('[notificar-agendamiento]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
