const twilio = require('twilio');

const SUPABASE_URL = 'https://kcoopkkvbkgrnkpksiuh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cxK_dgG5vRrJQynj06G-Bg_MrZotk6D';
const TWILIO_SID = 'AC37998a4481bd86a7017c898df68f96e5';
const TWILIO_TOKEN = 'a0ddbeb684ee71818d106c922747829b';
const TWILIO_NUMBER = 'whatsapp:+14155238886';
const TELEGRAM_TOKEN = '8210302688:AAGYUXIg0ys0pMxJmtD2HeYFLV1hk50Qcq4';
const TELEGRAM_CHAT_ID = '8239902044';

// Definición de enfermedades crónicas (misma que en cron.js)
const ENFERMEDADES = {
  'hipertension': {
    nombre: 'Hipertensión Arterial',
    pasos: [
      { param: 'sistolica', pregunta: '¿Cuál es su presión *sistólica*? (número mayor, ej: 120)' },
      { param: 'diastolica', pregunta: '¿Cuál es su presión *diastólica*? (número menor, ej: 80)' },
      { param: 'sintomas', pregunta: '¿Tiene síntomas?\n1️⃣ Sin síntomas\n2️⃣ Cefalea o mareos leves\n3️⃣ Visión borrosa o dolor de cabeza fuerte' }
    ],
    evaluar: (vals) => {
      const s = parseInt(vals.sistolica);
      const d = parseInt(vals.diastolica);
      if (isNaN(s) || isNaN(d)) return { nivel: 1, msg: '✅ Valores registrados. Gracias.' };
      if (s >= 180 || d >= 110) return { nivel: 3, msg: `🚨 EMERGENCIA: Presión ${s}/${d} mmHg — CRISIS HIPERTENSIVA. Llame al 911 AHORA.` };
      if (s < 90 || d < 60) return { nivel: 3, msg: `🚨 EMERGENCIA: Presión ${s}/${d} mmHg — HIPOTENSIÓN GRAVE. Llame al 911.` };
      if (s >= 160 || d >= 100) return { nivel: 2, msg: `⚠️ Presión ${s}/${d} mmHg — Muy alta. Contacte a su médico hoy.` };
      if (s >= 130 || d >= 85) return { nivel: 2, msg: `⚠️ Presión ${s}/${d} mmHg — Elevada. Monitoree con frecuencia.` };
      return { nivel: 1, msg: `✅ Presión ${s}/${d} mmHg — Normal. ¡Excelente control!` };
    }
  },
  'diabetes_tipo1': {
    nombre: 'Diabetes Tipo 1',
    pasos: [
      { param: 'glucosa', pregunta: '¿Cuál es su nivel de glucosa actual? (mg/dL)\nEj: 95' },
      { param: 'sintomas', pregunta: '¿Tiene síntomas?\n1️⃣ Sin síntomas\n2️⃣ Temblor, sudoración o mareo\n3️⃣ Confusión o pérdida de conocimiento' }
    ],
    evaluar: (vals) => {
      const g = parseInt(vals.glucosa);
      if (isNaN(g)) return { nivel: 1, msg: '✅ Valores registrados.' };
      if (g < 54 || g > 400) return { nivel: 3, msg: `🚨 EMERGENCIA: Glucosa ${g} mg/dL. LLAME AL 911.` };
      if (g < 70) return { nivel: 3, msg: `🚨 HIPOGLUCEMIA GRAVE: Glucosa ${g} mg/dL. Tome azúcar ahora y llame al médico.` };
      if (g > 300) return { nivel: 2, msg: `⚠️ HIPERGLUCEMIA: Glucosa ${g} mg/dL. Contacte a su médico urgente.` };
      if (g > 180) return { nivel: 2, msg: `⚠️ Glucosa ${g} mg/dL — Elevada. Revise su dosis de insulina.` };
      return { nivel: 1, msg: `✅ Glucosa ${g} mg/dL — En rango. ¡Buen control!` };
    }
  },
  'diabetes_tipo2': {
    nombre: 'Diabetes Tipo 2',
    pasos: [
      { param: 'glucosa', pregunta: '¿Cuál es su nivel de glucosa? (mg/dL)\nEj: 110' },
      { param: 'medicacion', pregunta: '¿Tomó su medicación hoy?\n1️⃣ Sí\n2️⃣ No' }
    ],
    evaluar: (vals) => {
      const g = parseInt(vals.glucosa);
      if (isNaN(g)) return { nivel: 1, msg: '✅ Valores registrados.' };
      if (g < 54 || g > 400) return { nivel: 3, msg: `🚨 EMERGENCIA: Glucosa ${g} mg/dL. LLAME AL 911.` };
      if (g < 70) return { nivel: 3, msg: `🚨 HIPOGLUCEMIA: Glucosa ${g} mg/dL. Tome azúcar ahora.` };
      if (g > 300) return { nivel: 2, msg: `⚠️ Glucosa ${g} mg/dL — Muy alta. Contacte a su médico.` };
      if (g > 180) return { nivel: 2, msg: `⚠️ Glucosa ${g} mg/dL — Elevada. Revise dieta y medicación.` };
      return { nivel: 1, msg: `✅ Glucosa ${g} mg/dL — En rango. ¡Buen control!` };
    }
  },
  'epoc': {
    nombre: 'EPOC',
    pasos: [
      { param: 'spo2', pregunta: '¿Cuál es su saturación de oxígeno? (SpO2 %)\nEj: 92' },
      { param: 'disnea', pregunta: '¿Cómo está su respiración hoy?\n1️⃣ Normal para mí\n2️⃣ Un poco más difícil\n3️⃣ Muy difícil o agitada' }
    ],
    evaluar: (vals) => {
      const s = parseInt(vals.spo2);
      if (isNaN(s)) return { nivel: 1, msg: '✅ Valores registrados.' };
      if (s < 85) return { nivel: 3, msg: `🚨 EMERGENCIA: SpO2 ${s}% — PELIGRO VITAL. Llame al 911.` };
      if (s < 88) return { nivel: 2, msg: `⚠️ SpO2 ${s}% — Muy baja. Contacte médico urgente.` };
      if (s < 91) return { nivel: 2, msg: `⚠️ SpO2 ${s}% — Baja. Monitoree de cerca.` };
      return { nivel: 1, msg: `✅ SpO2 ${s}% — Aceptable. Continúe con su tratamiento.` };
    }
  },
  'asma': {
    nombre: 'Asma',
    pasos: [
      { param: 'spo2', pregunta: '¿Cuál es su saturación de oxígeno? (SpO2 %)\nEj: 97' },
      { param: 'rescatador', pregunta: '¿Usó su inhalador de rescate hoy?\n1️⃣ No lo necesité\n2️⃣ Sí, 1–2 veces\n3️⃣ Sí, 3 o más veces' }
    ],
    evaluar: (vals) => {
      const s = parseInt(vals.spo2);
      if (isNaN(s)) return { nivel: 1, msg: '✅ Valores registrados.' };
      if (s < 90) return { nivel: 3, msg: `🚨 EMERGENCIA: SpO2 ${s}% — CRISIS ASMÁTICA. Llame al 911.` };
      if (s < 94 || vals.rescatador === '3') return { nivel: 2, msg: `⚠️ SpO2 ${s}% o uso frecuente de rescatador. Contacte a su médico.` };
      return { nivel: 1, msg: `✅ SpO2 ${s}% — Asma controlada. ¡Bien!` };
    }
  },
  'insuficiencia_cardiaca': {
    nombre: 'Insuficiencia Cardíaca',
    pasos: [
      { param: 'peso', pregunta: '¿Cuánto pesa hoy? (kg)\nEj: 72.5' },
      { param: 'edema', pregunta: '¿Tiene hinchazón en tobillos o piernas?\n1️⃣ No\n2️⃣ Leve\n3️⃣ Moderada o severa' },
      { param: 'disnea', pregunta: '¿Tiene dificultad para respirar?\n1️⃣ No\n2️⃣ Solo con esfuerzo\n3️⃣ En reposo o al acostarse' }
    ],
    evaluar: (vals, anterior) => {
      const pesoActual = parseFloat(vals.peso);
      const pesoAnterior = anterior ? parseFloat(anterior.peso || pesoActual) : pesoActual;
      const diff = pesoActual - pesoAnterior;
      if (diff >= 3 || vals.disnea === '3') return { nivel: 3, msg: `🚨 EMERGENCIA: ${diff >= 3 ? `Aumentó ${diff.toFixed(1)} kg` : 'Disnea severa'}. LLAME AL 911.` };
      if (diff >= 2 || vals.edema === '3') return { nivel: 2, msg: `⚠️ Retención de líquidos o edema severo. Contacte a su médico HOY.` };
      if (diff >= 1 || vals.edema === '2') return { nivel: 2, msg: `⚠️ Leve aumento de peso o edema. Monitoree y reporte si continúa.` };
      return { nivel: 1, msg: `✅ Peso estable (${pesoActual} kg). ¡Buen control!` };
    }
  },
  'enfermedad_renal': {
    nombre: 'Enfermedad Renal Crónica',
    pasos: [
      { param: 'pa_sistolica', pregunta: '¿Cuál es su presión arterial sistólica? (número mayor)\nEj: 125' },
      { param: 'sintomas', pregunta: '¿Tiene síntomas?\n1️⃣ Sin síntomas\n2️⃣ Hinchazón leve en cara o pies\n3️⃣ Orina espumosa, muy poca orina o confusión' }
    ],
    evaluar: (vals) => {
      const pa = parseInt(vals.pa_sistolica);
      if (isNaN(pa)) return { nivel: 1, msg: '✅ Valores registrados.' };
      if (pa >= 180 || vals.sintomas === '3') return { nivel: 3, msg: `🚨 EMERGENCIA: PA ${pa} mmHg o síntomas graves. Llame al 911.` };
      if (pa >= 160 || vals.sintomas === '2') return { nivel: 2, msg: `⚠️ PA ${pa} mmHg o síntomas renales. Contacte a su médico.` };
      return { nivel: 1, msg: `✅ PA ${pa} mmHg — En rango. ¡Bien controlado!` };
    }
  },
  'tiroides': {
    nombre: 'Trastorno Tiroideo',
    pasos: [
      { param: 'sintomas', pregunta: '¿Cómo se siente hoy?\n1️⃣ Bien, sin síntomas nuevos\n2️⃣ Fatiga excesiva o frío intenso\n3️⃣ Palpitaciones, temblor o sudoración' },
      { param: 'medicacion', pregunta: '¿Tomó su medicación hoy?\n1️⃣ Sí\n2️⃣ No' }
    ],
    evaluar: (vals) => {
      if (vals.sintomas === '3') return { nivel: 2, msg: `⚠️ Síntomas de hipertiroidismo. Contacte a su médico.` };
      if (vals.sintomas === '2') return { nivel: 2, msg: `⚠️ Síntomas de hipotiroidismo. Revise con su médico.` };
      return { nivel: 1, msg: `✅ Sin síntomas nuevos. ${vals.medicacion === '2' ? 'Recuerde tomar su medicación.' : '¡Excelente!'}` };
    }
  },
  'artritis_reumatoide': {
    nombre: 'Artritis Reumatoide',
    pasos: [
      { param: 'dolor', pregunta: '¿Cuánto dolor articular tiene hoy? (0 = sin dolor, 10 = dolor máximo)\nEj: 3' },
      { param: 'rigidez', pregunta: '¿Cuántos minutos duró la rigidez matutina?\nEj: 20' }
    ],
    evaluar: (vals) => {
      const d = parseInt(vals.dolor);
      const r = parseInt(vals.rigidez);
      if (d >= 8 || r > 60) return { nivel: 2, msg: `⚠️ Brote severo: dolor ${d}/10, rigidez ${r} min. Contacte a su médico.` };
      if (d >= 5 || r > 30) return { nivel: 2, msg: `⚠️ Actividad moderada: dolor ${d}/10. Monitoree.` };
      return { nivel: 1, msg: `✅ Artritis controlada: dolor ${d}/10. ¡Bien manejada!` };
    }
  },
  'lupus': {
    nombre: 'Lupus Eritematoso Sistémico',
    pasos: [
      { param: 'fiebre', pregunta: '¿Tiene fiebre hoy?\n1️⃣ No, temperatura normal\n2️⃣ Fiebre leve (37.3–38°C)\n3️⃣ Fiebre alta (>38°C)' },
      { param: 'sintomas', pregunta: '¿Tiene síntomas nuevos?\n1️⃣ Sin síntomas nuevos\n2️⃣ Erupciones, dolor articular o fatiga\n3️⃣ Múltiples síntomas o empeoramiento súbito' }
    ],
    evaluar: (vals) => {
      if (vals.fiebre === '3' || vals.sintomas === '3') return { nivel: 2, msg: `⚠️ Posible brote de lupus. Contacte a su médico hoy.` };
      if (vals.fiebre === '2' || vals.sintomas === '2') return { nivel: 2, msg: `⚠️ Síntomas leves. Monitoree y reporte si empeoran.` };
      return { nivel: 1, msg: `✅ Sin actividad de lupus. ¡Excelente!` };
    }
  },
  'epilepsia': {
    nombre: 'Epilepsia',
    pasos: [
      { param: 'medicacion', pregunta: '¿Tomó su medicación antiepiléptica hoy?\n1️⃣ Sí, todas las dosis\n2️⃣ Me olvidé una dosis\n3️⃣ No tomé la medicación' },
      { param: 'crisis', pregunta: '¿Tuvo alguna crisis convulsiva?\n1️⃣ No\n2️⃣ Sí, una crisis leve\n3️⃣ Sí, crisis severa o múltiples' }
    ],
    evaluar: (vals) => {
      if (vals.crisis === '3') return { nivel: 3, msg: `🚨 EMERGENCIA: Crisis epiléptica severa. LLAME AL 911.` };
      if (vals.crisis === '2') return { nivel: 2, msg: `⚠️ Crisis epiléptica reportada. Contacte a su médico hoy.` };
      if (vals.medicacion === '3') return { nivel: 2, msg: `⚠️ Sin medicación antiepiléptica. Tome su medicación ahora.` };
      return { nivel: 1, msg: `✅ Sin crisis. ${vals.medicacion === '1' ? 'Medicación tomada.' : 'Recuerde completar sus dosis.'} ¡Excelente!` };
    }
  },
  'post_acv': {
    nombre: 'Post ACV',
    pasos: [
      { param: 'pa_sistolica', pregunta: '¿Cuál es su presión arterial sistólica?\nEj: 125' },
      { param: 'sintomas', pregunta: '¿Tiene síntomas nuevos?\n1️⃣ Sin síntomas nuevos\n2️⃣ Debilidad en brazo/pierna o habla difícil\n3️⃣ Parálisis facial, confusión súbita o pérdida de visión' }
    ],
    evaluar: (vals) => {
      const pa = parseInt(vals.pa_sistolica);
      if (vals.sintomas === '3') return { nivel: 3, msg: `🚨 POSIBLE NUEVO ACV. Llame al 911 INMEDIATAMENTE.` };
      if (pa >= 180 || vals.sintomas === '2') return { nivel: 2, msg: `⚠️ PA ${pa} mmHg o síntomas neurológicos. Contacte médico urgente.` };
      return { nivel: 1, msg: `✅ PA ${pa} mmHg — Sin síntomas nuevos. ¡Buen control!` };
    }
  },
  'fibrilacion_auricular': {
    nombre: 'Fibrilación Auricular',
    pasos: [
      { param: 'fc', pregunta: '¿Cuál es su frecuencia cardíaca? (lpm)\nEj: 75' },
      { param: 'sintomas', pregunta: '¿Tiene palpitaciones, mareos o falta de aire?\n1️⃣ No\n2️⃣ Palpitaciones leves\n3️⃣ Palpitaciones intensas, síncope o dolor de pecho' }
    ],
    evaluar: (vals) => {
      const fc = parseInt(vals.fc);
      if (vals.sintomas === '3' || fc > 150 || fc < 40) return { nivel: 3, msg: `🚨 EMERGENCIA: FC ${fc} lpm o síntomas graves. LLAME AL 911.` };
      if (fc > 110 || vals.sintomas === '2') return { nivel: 2, msg: `⚠️ FC ${fc} lpm elevada. Contacte a su médico.` };
      return { nivel: 1, msg: `✅ FC ${fc} lpm — Controlada. ¡Bien!` };
    }
  },
  'depresion': {
    nombre: 'Depresión Crónica',
    pasos: [
      { param: 'estado_animo', pregunta: '¿Cómo se siente hoy?\n1️⃣ Bien o regular\n2️⃣ Triste o sin energía\n3️⃣ Muy mal o con pensamientos negativos intensos' },
      { param: 'medicacion', pregunta: '¿Tomó su medicación hoy?\n1️⃣ Sí\n2️⃣ No' }
    ],
    evaluar: (vals) => {
      if (vals.estado_animo === '3') return { nivel: 2, msg: `⚠️ Estado de ánimo muy bajo. Su médico le contactará pronto. Recuerde que no está solo/a. 💙` };
      if (vals.estado_animo === '2') return { nivel: 2, msg: `⚠️ Síntomas depresivos reportados. Recomendamos hablar con su médico.` };
      return { nivel: 1, msg: `✅ Gracias por su reporte. Continúe con su tratamiento. ¡Ánimo! 💙` };
    }
  },
  'obesidad': {
    nombre: 'Obesidad / Sobrepeso',
    pasos: [
      { param: 'peso', pregunta: '¿Cuánto pesa hoy? (kg)\nEj: 85.5' },
      { param: 'actividad', pregunta: '¿Realizó actividad física esta semana?\n1️⃣ Sí, 3 o más días\n2️⃣ Sí, 1–2 días\n3️⃣ No realicé ejercicio' }
    ],
    evaluar: (vals) => {
      return { nivel: 1, msg: `✅ Peso registrado: ${vals.peso} kg. ${vals.actividad === '3' ? '💡 Recuerde que la actividad física es fundamental.' : '¡Siga con la actividad física!'}` };
    }
  },
  'osteoporosis': {
    nombre: 'Osteoporosis',
    pasos: [
      { param: 'medicacion', pregunta: '¿Tomó su calcio y vitamina D hoy?\n1️⃣ Sí\n2️⃣ No' },
      { param: 'caida', pregunta: '¿Tuvo alguna caída o golpe?\n1️⃣ No\n2️⃣ Sí, caída leve sin lesión\n3️⃣ Sí, caída con dolor intenso' }
    ],
    evaluar: (vals) => {
      if (vals.caida === '3') return { nivel: 3, msg: `🚨 Posible fractura. LLAME AL 911 o vaya a urgencias.` };
      if (vals.caida === '2') return { nivel: 2, msg: `⚠️ Caída reportada. Monitoree y consulte si aparece dolor.` };
      return { nivel: 1, msg: `✅ Sin caídas. ${vals.medicacion === '1' ? 'Medicación tomada.' : 'Recuerde tomar su calcio y vitamina D.'} ¡Bien!` };
    }
  },
  'vih': {
    nombre: 'VIH/SIDA',
    pasos: [
      { param: 'medicacion', pregunta: '¿Tomó su medicación antirretroviral hoy?\n1️⃣ Sí, todas las dosis\n2️⃣ Olvidé una dosis\n3️⃣ No tomé la medicación' },
      { param: 'sintomas', pregunta: '¿Tiene síntomas nuevos?\n1️⃣ Sin síntomas\n2️⃣ Fiebre, fatiga o pérdida de peso\n3️⃣ Síntomas severos o infección' }
    ],
    evaluar: (vals) => {
      if (vals.sintomas === '3') return { nivel: 2, msg: `⚠️ Síntomas severos reportados. Contacte a su médico hoy.` };
      if (vals.medicacion === '3') return { nivel: 2, msg: `⚠️ Sin medicación ARV hoy. La adherencia es fundamental. Tome su medicación ahora.` };
      return { nivel: 1, msg: `✅ ${vals.medicacion === '1' ? 'Medicación tomada.' : 'Recuerde completar sus dosis.'} ¡Siga adelante!` };
    }
  }
};

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

async function buscarUltimaRespuestaPendiente(telefono) {
  const pacientes = await supabaseQuery('GET', 'pacientes', null, `?telefono=eq.${telefono.replace('whatsapp:+593', '0')}`);
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
  const graves = ['dolor de pecho', 'presion en el pecho', 'opresion en el pecho', 'no puedo respirar', 'dificultad para respirar', 'no respiro', 'me ahogo', 'perdida de conciencia', 'convulsion', 'paralisis', 'sangrado incontrolable', 'infarto', 'ataque al corazon', 'derrame cerebral', 'stroke'];
  const medios = ['fiebre alta', 'fiebre de 39', 'fiebre de 40', 'vomito repetitivo', 'diarrea con sangre', 'dolor abdominal fuerte', 'desmayo', 'mareo intenso', 'herida infectada', 'palpitaciones', 'presion 160', 'glucosa 300', 'hipoglucemia', 'fractura', 'sangrado moderado'];
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

  let sesion = await obtenerSesion(telefono);
  if (!sesion) sesion = { paso: 0, datos: {} };

  let respuesta = '';
  let paso = sesion.paso;
  let datos = sesion.datos || {};

  // ============================================================
  // PASO 200+ — MANEJO DE ENFERMEDADES CRÓNICAS
  // ============================================================
  if (paso >= 200) {
    const enfKey = datos.enfermedad_key;
    const enfDef = ENFERMEDADES[enfKey];
    const pasoCronico = datos.paso_cronico || 1;

    if (!enfDef) {
      await eliminarSesion(telefono);
      respuesta = `Escriba *hola* para iniciar una consulta. 👋`;
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());
    }

    // Guardar la respuesta del paso actual
    const paramActual = enfDef.pasos[pasoCronico - 1]?.param;
    if (paramActual) {
      datos.valores = datos.valores || {};
      datos.valores[paramActual] = mensaje;
    }

    // ¿Hay más preguntas?
    if (pasoCronico < enfDef.pasos.length) {
      const siguientePaso = enfDef.pasos[pasoCronico];
      respuesta = siguientePaso.pregunta;
      datos.paso_cronico = pasoCronico + 1;
      await guardarSesion(telefono, 200, datos);

    } else {
      // Todas las preguntas respondidas — evaluar
      const resultado = enfDef.evaluar(datos.valores);

      // Buscar último registro para comparar (IC necesita peso anterior)
      const ultimoReg = await supabaseQuery('GET', 'registros_cronicos', null,
        `?enfermedad_id=eq.${datos.enfermedad_id}&order=created_at.desc&limit=2`
      );
      const anterior = ultimoReg?.[1]?.valores || null;
      const resultadoFinal = enfDef.evaluar(datos.valores, anterior);

      // Guardar registro
      await supabaseQuery('POST', 'registros_cronicos', {
        enfermedad_id: datos.enfermedad_id,
        paciente_id: datos.paciente_id,
        valores: datos.valores,
        nivel_alerta: resultadoFinal.nivel
      });

      // Si hay alerta, notificar
      if (resultadoFinal.nivel === 3) {
        respuesta = `${resultadoFinal.msg}\n\n📞 *Llame al 911 AHORA*\ntel:911`;
        await alertarTelegram(`🚨 <b>ALERTA GRAVE CRÓNICO — ${enfDef.nombre}</b>\nPaciente: ${nombreWhatsApp}\nTeléfono: ${telefono}\nValores: ${JSON.stringify(datos.valores)}\nMensaje: ${resultadoFinal.msg}`);
        await crearNotificacion('urgente', `🚨 Alerta grave: ${enfDef.nombre}`, `${nombreWhatsApp} — ${resultadoFinal.msg}`, datos.paciente_id, null);
      } else if (resultadoFinal.nivel === 2) {
        respuesta = `${resultadoFinal.msg}\n\nHemos notificado a su equipo médico. Le contactarán pronto.\n\nSi empeora, llame al *911* de inmediato.`;
        await alertarTelegram(`⚠️ <b>ALERTA MEDIA CRÓNICO — ${enfDef.nombre}</b>\nPaciente: ${nombreWhatsApp}\nTeléfono: ${telefono}\nValores: ${JSON.stringify(datos.valores)}\nMensaje: ${resultadoFinal.msg}`);
        await crearNotificacion('urgente', `⚠️ Alerta: ${enfDef.nombre}`, `${nombreWhatsApp} — ${resultadoFinal.msg}`, datos.paciente_id, null);
      } else {
        respuesta = `${resultadoFinal.msg}\n\nGracias por su reporte diario. Su seguimiento ha sido registrado. 📋\n\nSi tiene algún síntoma nuevo escriba *hola*.`;
      }

      await eliminarSesion(telefono);
    }

    twiml.message(respuesta);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml.toString());
  }

  // ============================================================
  // MANEJO DE RESPUESTAS DE SEGUIMIENTO DE TRATAMIENTO
  // ============================================================
  const pendiente = await buscarUltimaRespuestaPendiente(telefono);

  if (pendiente && pendiente.respuesta && paso !== 0) {
    const r = pendiente.respuesta;
    const paciente = pendiente.paciente;
    const recordatorio = r.recordatorios;

    if (recordatorio?.tipo === 'medicamento') {
      const tomo = mensaje.toLowerCase() === 'sí' || mensaje.toLowerCase() === 'si';
      await supabaseQuery('PATCH', 'seguimiento_respuestas', { respuesta: mensaje, tomo_medicamento: tomo }, `?id=eq.${r.id}`);
      if (tomo) {
        respuesta = `✅ ¡Perfecto! Registro guardado.\n\nSiga tomando su medicamento según las indicaciones. 💊`;
      } else {
        respuesta = `⚠️ Recuerde que es importante completar el tratamiento.\n\nIntente tomar *${recordatorio.medicamento}* lo antes posible.`;
        await alertarTelegram(`⚠️ <b>Incumplimiento de tratamiento</b>\nPaciente: ${paciente.nombre} ${paciente.apellidos||''}\nMedicamento: ${recordatorio.medicamento}\nTeléfono: ${telefono}`);
      }
    } else if (recordatorio?.tipo === 'fin_tratamiento') {
      await supabaseQuery('PATCH', 'seguimiento_respuestas', { respuesta: mensaje }, `?id=eq.${r.id}`);
      if (mensaje === '1') {
        await supabaseQuery('PATCH', 'seguimiento_respuestas', { se_siente_mejor: true, respuesta: 'curado' }, `?id=eq.${r.id}`);
        respuesta = `🎉 ¡Excelente noticia! Nos alegra que se sienta mejor.\n\nSu caso ha sido registrado como *exitoso*. 💙\n\nSi necesita atención en el futuro escriba *hola*.`;
        await alertarTelegram(`✅ <b>Tratamiento exitoso</b>\nPaciente: ${paciente.nombre} ${paciente.apellidos||''}`);
      } else if (mensaje === '2') {
        await supabaseQuery('PATCH', 'seguimiento_respuestas', { se_siente_mejor: false, respuesta: 'mejora_parcial' }, `?id=eq.${r.id}`);
        respuesta = `👨‍⚕️ Entendemos que aún tiene síntomas.\n\n¿Desea agendar una consulta de seguimiento?\n\nResponda *Sí* o *No*`;
        await guardarSesion(telefono, 98, { receta_id: r.receta_id, paciente_id: paciente.id });
      } else if (mensaje === '3') {
        await supabaseQuery('PATCH', 'seguimiento_respuestas', { se_siente_mejor: false, respuesta: 'sin_mejoria' }, `?id=eq.${r.id}`);
        respuesta = `😟 Lamentamos escuchar eso.\n\n¿Desea agendar una teleconsulta urgente?\n\nResponda *Sí* o *No*`;
        await guardarSesion(telefono, 98, { receta_id: r.receta_id, paciente_id: paciente.id });
        await alertarTelegram(`🔴 <b>Sin mejoría</b>\nPaciente: ${paciente.nombre} ${paciente.apellidos||''}\nTeléfono: ${telefono}`);
      } else {
        respuesta = `Responda:\n1️⃣ Me siento mejor\n2️⃣ Mejoré pero aún tengo síntomas\n3️⃣ No mejoré`;
      }
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());
    }

    twiml.message(respuesta);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml.toString());
  }

  // ============================================================
  // PASO 98 — REAGENDAR CONSULTA POST TRATAMIENTO
  // ============================================================
  if (paso === 98) {
    if (mensaje.toLowerCase() === 'sí' || mensaje.toLowerCase() === 'si') {
      const pacienteData = await supabaseQuery('GET', 'pacientes', null, `?id=eq.${datos.paciente_id}&select=*,clientes_b2b(*)`);
      const p = (pacienteData || [])[0] || {};
      datos.cedula = p.cedula;
      datos.paciente_id = p.id;
      datos.nombre_paciente = p.nombre;
      datos.empresa = p.clientes_b2b?.nombre_empresa || 'su empresa';
      datos.seguro = p.clientes_b2b?.nombre_seguro || 'su seguro';
      datos.sintomas = 'Seguimiento de tratamiento — consulta de control';
      respuesta = `Perfecto. ¿Cuáles son sus síntomas actuales?`;
      paso = 3;
    } else {
      respuesta = `Entendido. Si necesita atención escriba *hola*. 💙`;
      await eliminarSesion(telefono);
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());
    }
    await guardarSesion(telefono, paso, datos);
    twiml.message(respuesta);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml.toString());
  }

  // ============================================================
  // PASO 99 — POST CONFIRMACIÓN
  // ============================================================
  if (paso === 99) {
    respuesta = `Su consulta ya fue registrada. 😊\n\nUn asesor de *MediLyft* le contactará pronto.\n\nSi necesita una nueva consulta escriba *hola*.`;
    twiml.message(respuesta);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml.toString());
  }

  // ============================================================
  // FLUJO PRINCIPAL — AGENDAMIENTO
  // ============================================================
  if (paso === 0) {
    respuesta = `¡Hola, ${nombreWhatsApp}! 👋 Bienvenido a *MediLyft*.\n\nEstamos listos para ayudarte.\n\nPor favor indícanos tu número de *cédula de identidad*:`;
    paso = 1;

  } else if (paso === 1) {
    const paciente = await buscarPaciente(mensaje);
    if (paciente) {
      datos.cedula = mensaje;
      datos.paciente_id = paciente.id;
      datos.nombre_paciente = paciente.nombre;
      datos.empresa = paciente.clientes_b2b?.nombre_empresa || 'su empresa';
      datos.seguro = paciente.clientes_b2b?.nombre_seguro || 'su seguro';
      respuesta = `✅ Hemos identificado que pertenece a *${datos.empresa}* con cobertura de *${datos.seguro}*.\n\n¿Acepta el uso y tratamiento de sus datos personales con fines médicos?\n\nResponda *Sí* o *No*`;
      paso = 2;
    } else {
      respuesta = `No encontramos la cédula *${mensaje}*.\n\nVerifique el número e inténtelo nuevamente:`;
    }

  } else if (paso === 2) {
    if (mensaje.toLowerCase() === 'sí' || mensaje.toLowerCase() === 'si') {
      respuesta = `Gracias por su autorización. ✅\n\n¿Cuál es el motivo de su consulta?\n\nDescríbanos sus síntomas:`;
      paso = 3;
    } else {
      respuesta = `Sin su autorización no es posible continuar.\n\nEscríbanos *hola* cuando desee. 👋`;
      await eliminarSesion(telefono);
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());
    }

  } else if (paso === 3) {
    const nivel = clasificarSintomas(mensaje);
    datos.sintomas = mensaje;
    datos.nivel = nivel;

    if (nivel === 3) {
      respuesta = `🚨 *EMERGENCIA MÉDICA* 🚨\n\nSus síntomas indican riesgo vital.\n\n*Llame al 911 AHORA MISMO.*\n\n📞 tel:911`;
      await alertarTelegram(`🚨 <b>ALERTA GRAVE</b>\nPaciente: ${datos.nombre_paciente || nombreWhatsApp}\nCédula: ${datos.cedula}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      await eliminarSesion(telefono);
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());

    } else if (nivel === 2) {
      respuesta = `⚠️ *Atención prioritaria requerida*\n\nHemos notificado a nuestro equipo. Le contactarán a la brevedad.\n\nSi empeora, *llame al 911 de inmediato*.`;
      await alertarTelegram(`⚠️ <b>SÍNTOMAS MEDIOS</b>\nPaciente: ${datos.nombre_paciente || nombreWhatsApp}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      const consulta = await supabaseQuery('POST', 'consultas', { paciente_id: datos.paciente_id, nivel_sintomas: 2, sintomas_descripcion: mensaje, estado: 'pendiente' });
      await crearNotificacion('urgente', '⚠️ Síntomas medios', `Paciente ${datos.nombre_paciente} requiere atención urgente`, datos.paciente_id, consulta?.[0]?.id);
      await eliminarSesion(telefono);
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());

    } else {
      respuesta = `✅ Sus síntomas pueden ser atendidos por *teleconsulta*.\n\nNecesitamos completar sus datos:\n\n👤 *Nombre y apellidos completos:*`;
      paso = 4;
    }

  } else if (paso === 4) {
    const nombreCompleto = mensaje.trim();
    datos.nombreCompleto = nombreCompleto;
    if (tieneApellidos(nombreCompleto)) {
      const partes = nombreCompleto.split(/\s+/);
      datos.nombre = partes[0];
      datos.apellidos = partes.slice(1).join(' ');
      respuesta = `*Edad:*`;
      paso = 6;
    } else {
      datos.nombre = nombreCompleto;
      respuesta = `*Apellidos completos:*`;
      paso = 5;
    }

  } else if (paso === 5) {
    datos.apellidos = mensaje;
    datos.nombreCompleto = `${datos.nombre} ${datos.apellidos}`;
    respuesta = `*Edad:*`;
    paso = 6;

  } else if (paso === 6) {
    datos.edad = mensaje;
    respuesta = `*Fecha de nacimiento* (ej: 15/03/1990):`;
    paso = 7;

  } else if (paso === 7) {
    datos.fecha_nacimiento = mensaje;
    respuesta = `*Correo electrónico:*`;
    paso = 8;

  } else if (paso === 8) {
    datos.correo = mensaje;
    respuesta = `*Número de teléfono de contacto:*`;
    paso = 9;

  } else if (paso === 9) {
    datos.telefono = mensaje;
    respuesta = `*Lugar de residencia* (ciudad y barrio):`;
    paso = 10;

  } else if (paso === 10) {
    datos.lugar_residencia = mensaje;
    respuesta = `*Horario de preferencia* para la teleconsulta\n(ej: mañana martes a las 10:00 AM):`;
    paso = 11;

  } else if (paso === 11) {
    datos.horario = mensaje;
    respuesta = `Confirme sus datos:\n\n👤 *Nombre:* ${datos.nombreCompleto}\n🎂 *Edad:* ${datos.edad}\n📅 *Nacimiento:* ${datos.fecha_nacimiento}\n📧 *Correo:* ${datos.correo}\n📱 *Teléfono:* ${datos.telefono}\n📍 *Residencia:* ${datos.lugar_residencia}\n🕐 *Horario:* ${datos.horario}\n\nResponda *Confirmar* o *Corregir*`;
    paso = 12;

  } else if (paso === 12) {
    if (mensaje.toLowerCase() === 'confirmar') {
      await actualizarPaciente(datos.cedula, {
        nombre: datos.nombre, apellidos: datos.apellidos, edad: datos.edad,
        fecha_nacimiento: datos.fecha_nacimiento, correo: datos.correo,
        telefono: datos.telefono, lugar_residencia: datos.lugar_residencia,
        updated_at: new Date().toISOString()
      });
      const consulta = await supabaseQuery('POST', 'consultas', {
        paciente_id: datos.paciente_id, nivel_sintomas: 1,
        sintomas_descripcion: datos.sintomas, estado: 'pendiente'
      });
      const consulta_id = consulta?.[0]?.id;
      await crearNotificacion('nueva_consulta', '📅 Nueva teleconsulta', `${datos.nombreCompleto} solicita teleconsulta para ${datos.horario}`, datos.paciente_id, consulta_id);
      await alertarTelegram(`📅 <b>NUEVA TELECONSULTA</b>\nPaciente: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa}\nSíntomas: ${datos.sintomas}\nHorario: ${datos.horario}\nTeléfono: ${datos.telefono}\nCorreo: ${datos.correo}`);
      respuesta = `🎉 *¡Consulta registrada exitosamente!*\n\nSus datos han sido guardados.\n\nUn asesor de *MediLyft* le confirmará su teleconsulta a la brevedad. 💙`;
      await eliminarSesion(telefono);
      await guardarSesion(telefono, 99, {});
      twiml.message(respuesta);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twiml.toString());
    } else {
      datos = { cedula: datos.cedula, paciente_id: datos.paciente_id, nombre_paciente: datos.nombre_paciente, empresa: datos.empresa, seguro: datos.seguro, sintomas: datos.sintomas, nivel: datos.nivel };
      respuesta = `Entendido, volvamos a empezar.\n\n👤 *Nombre y apellidos completos:*`;
      paso = 4;
    }

  } else {
    respuesta = `Escriba *hola* para iniciar una nueva consulta. 👋`;
    await eliminarSesion(telefono);
    paso = 0;
    datos = {};
  }

  await guardarSesion(telefono, paso, datos);
  twiml.message(respuesta);
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml.toString());
};
