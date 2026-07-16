const { query } = require('../services/supabase');
const { enviar } = require('../services/whatsapp');
const { verificarUsuario } = require('../services/authVerify');

const SUPA_URL  = process.env.SUPABASE_URL;
const SUPA_KEY  = process.env.SUPABASE_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, mensaje_id, respuesta } = req.body || {};
  if (!mensaje_id || !respuesta?.trim()) {
    return res.status(400).json({ error: 'Faltan mensaje_id o respuesta' });
  }

  try {
    const medico = await verificarUsuario(token, ['medico', 'admin']);

    // Obtener la pregunta original con el teléfono del paciente
    const msgRes = await fetch(
      `${SUPA_URL}/rest/v1/mensajes_consulta?id=eq.${mensaje_id}&select=*,pacientes(telefono,nombre,apellidos)`,
      { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
    );
    const msgs = await msgRes.json().catch(() => []);
    const msg = msgs?.[0];
    if (!msg) return res.status(404).json({ error: 'Pregunta no encontrada' });
    if (msg.tipo !== 'pregunta_paciente') return res.status(400).json({ error: 'Solo se puede responder preguntas del paciente' });

    const telefono = msg.pacientes?.telefono;
    if (!telefono) return res.status(400).json({ error: 'El paciente no tiene teléfono registrado' });

    // Guardar la respuesta
    await query('POST', 'mensajes_consulta', {
      consulta_id: msg.consulta_id,
      paciente_id: msg.paciente_id,
      medico_id:   medico.id,
      tipo:        'respuesta_medico',
      contenido:   respuesta.trim(),
      leido:       true
    });

    // Marcar la pregunta como leída
    await query('PATCH', 'mensajes_consulta', { leido: true }, `?id=eq.${mensaje_id}`);

    // Enviar respuesta al paciente por WhatsApp
    const soloDigitos = String(telefono).replace(/\D/g, '');
    const numero = soloDigitos.startsWith('0') ? '593' + soloDigitos.slice(1) : soloDigitos;
    const medicoNombre = `${medico.nombre || ''} ${medico.apellidos || ''}`.trim();
    await enviar(numero,
      `💬 *Respuesta de su médico${medicoNombre ? `, Dr(a). ${medicoNombre}` : ''}:*\n\n${respuesta.trim()}\n\n_— MediLyft_`
    );

    return res.status(200).json({ ok: true, numero });
  } catch (err) {
    console.error('[responder-mensaje]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
