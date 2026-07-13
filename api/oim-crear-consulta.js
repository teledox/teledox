/**
 * api/oim-crear-consulta.js
 * Endpoint para que la OIM registre consultas de sus beneficiarios desde sistemas externos.
 */

const { WA_TOKEN, WA_PHONE_ID, SUPABASE_URL, SUPABASE_KEY } = require('../src/config');
const { separarNombre } = require('../src/utils/validaciones');

async function obtenerEmpresaOIM() {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/clientes_b2b?nombre=ilike.*oim*&activo=eq.true&select=id,nombre&limit=1`,
    { headers }
  );
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

module.exports = async function handler(req, res) {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  // Validaciones básicas
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

    // 1. Obtener la empresa OIM
    const oim = await obtenerEmpresaOIM();
    const empresaId = oim?.id || null;
    const empresaNombre = oim?.nombre || 'OIM Ecuador';

    // 2. Buscar si el paciente ya existe por cédula
    const pacRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pacientes?cedula=eq.${encodeURIComponent(cedula.trim())}&select=id`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const pacRows = await pacRes.json();
    let pacienteId = pacRows?.[0]?.id || null;

    // 3. Crear el paciente si no existe
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

    // 4. Crear la consulta
    const consultaRes = await fetch(`${SUPABASE_URL}/rest/v1/consultas`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        paciente_id:          pacienteId,
        nivel_sintomas:       1, // Inicializar en leve, se actualiza si es del caso
        sintomas_descripcion: sintomas.trim(),
        estado:               'pendiente'
      })
    });
    const consultaData = await consultaRes.json();
    if (!consultaRes.ok) {
      throw new Error(consultaData.message || 'Error al crear consulta');
    }
    const consultaId = consultaData?.[0]?.id || null;

    // 5. Crear notificación para el panel
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

    // 6. Enviar notificación WhatsApp automática al paciente
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
};
