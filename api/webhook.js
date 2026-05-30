const twilio = require('twilio');

const SUPABASE_URL = 'https://kcoopkkvbkgrnkpksiuh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cxK_dgG5vRrJQynj06G-Bg_MrZotk6D';
const TWILIO_SID = 'AC37998a4481bd86a7017c898df68f96e5';
const TWILIO_TOKEN = 'a0ddbeb684ee71818d106c922747829b';
const TWILIO_NUMBER = 'whatsapp:+14155238886';
const TELEGRAM_TOKEN = '8210302688:AAGYUXIg0ys0pMxJmtD2HeYFLV1hk50Qcq4';
const TELEGRAM_CHAT_ID = '8239902044';

async function supabaseQuery(method, table, body, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  return res.json();
}

async function alertarTelegram(mensaje) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensaje, parse_mode: 'HTML' })
  });
}

async function obtenerSesion(telefono) {
  const data = await supabaseQuery('GET', 'sesiones_bot', null, `?telefono=eq.${encodeURIComponent(telefono)}`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function guardarSesion(telefono, paso, datos) {
  const sesion = await obtenerSesion(telefono);
  if (sesion) {
    await supabaseQuery('PATCH', 'sesiones_bot', { paso, datos, updated_at: new Date().toISOString() }, `?telefono=eq.${encodeURIComponent(telefono)}`);
  } else {
    await supabaseQuery('POST', 'sesiones_bot', { telefono, paso, datos });
  }
}

async function eliminarSesion(telefono) {
  await supabaseQuery('DELETE', 'sesiones_bot', null, `?telefono=eq.${encodeURIComponent(telefono)}`);
}

async function buscarPaciente(cedula) {
  const data = await supabaseQuery('GET', 'pacientes', null, `?cedula=eq.${cedula}&select=*,clientes_b2b(*)`);
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function actualizarPaciente(cedula, datos) {
  await supabaseQuery('PATCH', 'pacientes', datos, `?cedula=eq.${cedula}`);
}

async function crearNotificacion(tipo, titulo, mensaje, paciente_id, consulta_id) {
  await supabaseQuery('POST', 'notificaciones', { tipo, titulo, mensaje, paciente_id, consulta_id });
}

async function buscarRecordatorioActivo(telefono) {
  const data = await supabaseQuery('GET', 'recordatorios', null,
    `?telefono=eq.${encodeURIComponent(telefono)}&activo=eq.true&order=fecha_proximo.asc&limit=1`
  );
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function buscarUltimaRespuestaPendiente(telefono) {
  const pacientes = await supabaseQuery('GET', 'pacientes', null, `?telefono=eq.${telefono.replace('whatsapp:','')}`);
  if (!pacientes || pacientes.length === 0) return null;
  const paciente_id = pacientes[0].id;
  const data = await supabaseQuery('GET', 'seguimiento_respuestas', null,
    `?paciente_id=eq.${paciente_id}&respuesta=is.null&order=created_at.desc&limit=1&select=*,recordatorios(*)`
  );
  return Array.isArray(data) && data.length > 0 ? { respuesta: data[0], paciente: pacientes[0] } : null;
}

function tieneApellidos(texto) {
  return texto.trim().split(/\s+/).length >= 3;
}

function clasificarSintomas(texto) {
  const t = texto.toLowerCase();
  const graves = ['dolor de pecho', 'presion en el pecho', 'opresion en el pecho', 'no puedo respirar', 'dificultad para respirar', 'dificultad respiratoria', 'no respiro', 'me ahogo', 'perdida de conciencia', 'perdi el conocimiento', 'convulsion', 'convulsiones', 'paralisis', 'no puedo mover', 'sangrado incontrolable', 'hemorragia', 'infarto', 'ataque al corazon', 'derrame cerebral', 'stroke', 'labios morados', 'piel azul', 'vomito con sangre', 'heces con sangre', 'dolor abdominal insoportable'];
  const medios = ['fiebre alta', 'fiebre de 39', 'fiebre de 40', 'vomito repetitivo', 'vomitos frecuentes', 'diarrea con sangre', 'diarrea severa', 'dolor abdominal fuerte', 'desmayo leve', 'mareo intenso', 'herida infectada', 'dificultad respirar leve', 'palpitaciones', 'presion 160', 'presion 170', 'glucosa 300', 'hipoglucemia', 'reaccion alergica fuerte', 'fractura', 'hueso roto', 'sangrado moderado'];
  if (graves.some(s => t.includes(s))) return 3;
  if (medios.some(s => t.includes(s))) return 2;
  return 1;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const body = req.body || {};
  const mensaje = (body.Body || '').trim();
  const telefono = body.From || '';
  const nombreWhatsApp = body.ProfileName || 'estimado/a';

  const twiml = new twilio.twiml.MessagingResponse();

  // Verificar si hay un recordatorio pendiente de respuesta para este número
  const pendiente = await buscarUltimaRespuestaPendiente(telefono);

  if (pendiente && pendiente.respuesta) {
    const r = pendiente.respuesta;
    const paciente = pendiente.paciente;
    const recordatorio = r.recordatorios;
    let respuestaBot = '';

    if (recordatorio?.tipo === 'medicamento') {
      const tomo = mensaje.toLowerCase() === 'sí' || mensaje.toLowerCase() === 'si' || mensaje.toLowerCase() === '1';
      await supabaseQuery('PATCH', 'seguimiento_respuestas', {
        respuesta: mensaje,
        tomo_medicamento: tomo
      }, `?id=eq.${r.id}`);

      if (tomo) {
        respuestaBot = `✅ ¡Perfecto! Registro guardado.\n\nSiga tomando su medicamento según las indicaciones del médico. 💊\n\nSi presenta algún efecto adverso o malestar escríbanos *hola*.`;
      } else {
        respuestaBot = `⚠️ Recuerde que es
