/**
 * api/enviar-link.js
 * Envía un link de teleconsulta al WhatsApp del paciente.
 */

const { WA_TOKEN, WA_PHONE_ID, SUPABASE_URL, SUPABASE_KEY } = require('../src/config');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { paciente_id, consulta_id, link, medico_nombre, medico_id } = req.body || {};
  if (!paciente_id || !link) return res.status(400).json({ error: 'Faltan paciente_id o link' });

  try {
    // Obtener teléfono del paciente desde la BD
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

    const medico = medico_nombre ? `Dr(a). ${medico_nombre}` : 'su médico';
    const mensaje = `🩺 *MediLyft — Teleconsulta*\n\nHola ${pac.nombre || ''}! ${medico} le invita a su teleconsulta.\n\n🔗 *Únase aquí:*\n${link}\n\n_Si el enlace no abre, cópielo y péguelo en su navegador._`;

    const waRes = await fetch(`https://graph.facebook.com/v25.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WA_TOKEN}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero,
        type: 'text',
        text: { body: mensaje, preview_url: true }
      })
    });

    const waData = await waRes.json();
    if (!waRes.ok || waData.error) {
      const msg = waData.error?.message || JSON.stringify(waData);
      console.error('[enviar-link] WA error:', msg);
      return res.status(500).json({ error: msg });
    }

    console.log(`[enviar-link] Link enviado a ${pac.nombre} ${pac.apellidos || ''} · ${numero}`);

    // Registrar el envío para mostrarlo en el historial de la consulta
    await fetch(`${SUPABASE_URL}/rest/v1/enlaces_teleconsulta`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ paciente_id, consulta_id: consulta_id || null, medico_id: medico_id || null, link })
    }).catch(e => console.error('[enviar-link] Error registrando enlace:', e.message));

    return res.status(200).json({ ok: true, numero, paciente: `${pac.nombre} ${pac.apellidos || ''}`.trim() });

  } catch (e) {
    console.error('[enviar-link]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
