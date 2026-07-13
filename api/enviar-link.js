/**
 * api/enviar-link.js
 * Envía un link de teleconsulta al WhatsApp del paciente.
 */

const { WA_TOKEN, WA_PHONE_ID, SUPABASE_URL, SUPABASE_KEY } = require('../src/config');
const { separarNombre } = require('../src/utils/validaciones');

// Avisa al paciente por WhatsApp que su consulta de seguimiento fue agendada/confirmada.
async function notificarAgendamiento(req, res) {
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
      body: JSON.stringify({ messaging_product: 'whatsapp', to: numero, type: 'text', text: { body: mensaje } })
    });

    const waData = await waRes.json();
    if (!waRes.ok || waData.error) {
      const msg = waData.error?.message || JSON.stringify(waData);
      console.error('[enviar-link:agendamiento] WA error:', msg);
      return res.status(500).json({ error: msg });
    }

    console.log(`[enviar-link:agendamiento] Aviso de consulta enviado a ${pac.nombre} ${pac.apellidos || ''} · ${numero}`);
    return res.status(200).json({ ok: true, numero, paciente: `${pac.nombre} ${pac.apellidos || ''}`.trim() });

  } catch (e) {
    console.error('[enviar-link:agendamiento]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

async function obtenerEmpresaOIM() {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/clientes_b2b?nombre=ilike.*oim*&activo=eq.true&select=id,nombre&limit=1`,
    { headers }
  );
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function crearConsultaOIM(req, res) {
  const {
    cedula,
    nombre_completo,
    telefono,
    sintomas,
    edad,
    sexo,
    correo,
    residencia
  } = req.body || {};

  if (!cedula || !nombre_completo || !telefono || !sintomas) {
    return res.status(400).json({ error: 'Faltan campos requeridos: cedula, nombre_completo, telefono, sintomas' });
  }

  try {
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    };

    const oim = await obtenerEmpresaOIM();
    const empresaId = oim?.id || null;

    const pacRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pacientes?cedula=eq.${encodeURIComponent(cedula.trim())}&select=id`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const pacRows = await pacRes.json();
    let pacienteId = pacRows?.[0]?.id || null;

    if (!pacienteId) {
      const { nombre, apellidos } = separarNombre(nombre_completo);
      const nuevoPacRes = await fetch(`${SUPABASE_URL}/rest/v1/pacientes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cedula:           cedula.trim(),
          nombre,
          apellidos,
          edad:             edad || null,
          sexo:             sexo || 'M',
          correo:           correo || '',
          telefono:         telefono.trim(),
          lugar_residencia: residencia || '',
          cliente_b2b_id:   empresaId
        })
      });
      const nuevoPacData = await nuevoPacRes.json();
      if (!nuevoPacRes.ok) {
        throw new Error(nuevoPacData.message || 'Error al crear paciente');
      }
      pacienteId = nuevoPacData?.[0]?.id || null;
    }

    if (!pacienteId) throw new Error('No se pudo identificar o crear al paciente.');

    const consultaRes = await fetch(`${SUPABASE_URL}/rest/v1/consultas`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        paciente_id:          pacienteId,
        nivel_sintomas:       1,
        sintomas_descripcion: sintomas.trim(),
        estado:               'pendiente'
      })
    });
    const consultaData = await consultaRes.json();
    if (!consultaRes.ok) {
      throw new Error(consultaData.message || 'Error al crear consulta');
    }
    const consultaId = consultaData?.[0]?.id || null;

    await fetch(`${SUPABASE_URL}/rest/v1/notificaciones`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        tipo: 'nueva_consulta',
        titulo: `📅 Consulta OIM — API Externa`,
        mensaje: `${nombre_completo} (${cedula}) registrado mediante integración OIM`,
        paciente_id: pacienteId,
        consulta_id: consultaId,
        metadatos: { origen: 'oim_api', categoria: 'bajo', etiqueta: 'OIM API' }
      })
    });

    const soloDigitos = String(telefono).replace(/\D/g, '');
    const numeroWA = soloDigitos.startsWith('0') ? '593' + soloDigitos.slice(1) : soloDigitos;
    
    if (numeroWA && numeroWA.length >= 10) {
      const msgPaciente = `Hola ${nombre_completo}. 🩺 OIM ha coordinado una teleconsulta médica para ti hoy. Un médico de MediLyft te contactará por este chat en breve. Por favor mantente atento.`;
      
      await fetch(`https://graph.facebook.com/v25.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WA_TOKEN}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numeroWA,
          type: 'text',
          text: { body: msgPaciente }
        })
      }).catch(e => console.error('[oim-api:whatsapp] Error:', e.message));
    }

    console.log(`[oim-api] Consulta agendada vía API: Paciente ID ${pacienteId} · Consulta ID ${consultaId}`);
    return res.status(200).json({ ok: true, paciente_id: pacienteId, consulta_id: consultaId });

  } catch (e) {
    console.error('[oim-api:error]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (req.body?.accion === 'agendamiento') return notificarAgendamiento(req, res);
  if (req.body?.accion === 'oim_crear_consulta') return crearConsultaOIM(req, res);

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
