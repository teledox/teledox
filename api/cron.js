const twilio = require('twilio');

const SUPABASE_URL = 'https://kcoopkkvbkgrnkpksiuh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cxK_dgG5vRrJQynj06G-Bg_MrZotk6D';
const TWILIO_SID = 'AC37998a4481bd86a7017c898df68f96e5';
const TWILIO_TOKEN = 'a0ddbeb684ee71818d106c922747829b';
const TWILIO_NUMBER = 'whatsapp:+14155238886';
const TELEGRAM_TOKEN = '8210302688:AAGYUXIg0ys0pMxJmtD2HeYFLV1hk50Qcq4';
const TELEGRAM_CHAT_ID = '8239902044';

async function supa(method, table, body, query = '') {
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

async function enviarWhatsApp(telefono, mensaje) {
  try {
    const client = twilio(TWILIO_SID, TWILIO_TOKEN);
    await client.messages.create({
      from: TWILIO_NUMBER,
      to: telefono.startsWith('whatsapp:') ? telefono : `whatsapp:${telefono}`,
      body: mensaje
    });
  } catch (e) {
    console.error('Error WhatsApp:', e.message);
  }
}

async function alertarTelegram(mensaje) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensaje, parse_mode: 'HTML' })
    });
  } catch (e) {
    console.error('Error Telegram:', e.message);
  }
}

// Definición completa de enfermedades crónicas
const ENFERMEDADES = {
  'hipertension': {
    nombre: 'Hipertensión Arterial',
    pregunta: `🩺 *Seguimiento MediLyft - Hipertensión*\n\nHola {nombre}! Es hora de registrar su presión arterial.\n\nPor favor indíquenos:\n📊 *Presión sistólica* (número mayor, ej: 120):`,
    pregunta2: `¿Y su presión *diastólica* (número menor, ej: 80)?`,
    pregunta3: `¿Tiene alguno de estos síntomas?\n1️⃣ Sin síntomas\n2️⃣ Cefalea o mareos leves\n3️⃣ Visión borrosa o dolor de cabeza fuerte`,
    unidad: 'mmHg',
    parametros: ['sistolica', 'diastolica', 'sintomas'],
    evaluar: (vals) => {
      const s = parseInt(vals.sistolica);
      const d = parseInt(vals.diastolica);
      if (s >= 180 || d >= 110) return { nivel: 3, msg: `🚨 EMERGENCIA: Presión ${s}/${d} mmHg — CRISIS HIPERTENSIVA. Llame al 911.` };
      if (s < 90 || d < 60) return { nivel: 3, msg: `🚨 EMERGENCIA: Presión ${s}/${d} mmHg — HIPOTENSIÓN GRAVE. Llame al 911.` };
      if (s >= 160 || d >= 100) return { nivel: 2, msg: `⚠️ Presión ${s}/${d} mmHg — ALTA. Requiere atención médica urgente.` };
      if (s >= 130 || d >= 85) return { nivel: 2, msg: `⚠️ Presión ${s}/${d} mmHg — Por encima del rango normal. Monitoree con frecuencia.` };
      return { nivel: 1, msg: `✅ Presión ${s}/${d} mmHg — Normal. ¡Excelente control!` };
    }
  },
  'diabetes_tipo1': {
    nombre: 'Diabetes Tipo 1',
    pregunta: `🩺 *Seguimiento MediLyft - Diabetes*\n\nHola {nombre}! Hora de registrar su glucosa.\n\n¿Cuál es su nivel de glucosa actual? (mg/dL)\n\nSi midió en *ayunas* indique solo el número.\nEj: 95`,
    unidad: 'mg/dL',
    parametros: ['glucosa'],
    evaluar: (vals) => {
      const g = parseInt(vals.glucosa);
      if (g < 54 || g > 400) return { nivel: 3, msg: `🚨 EMERGENCIA: Glucosa ${g} mg/dL. LLAME AL 911 INMEDIATAMENTE.` };
      if (g < 70) return { nivel: 3, msg: `🚨 HIPOGLUCEMIA GRAVE: Glucosa ${g} mg/dL. Tome azúcar ahora y llame al médico.` };
      if (g > 300) return { nivel: 2, msg: `⚠️ HIPERGLUCEMIA: Glucosa ${g} mg/dL. Contacte a su médico urgente.` };
      if (g > 180 || g < 70) return { nivel: 2, msg: `⚠️ Glucosa ${g} mg/dL — Fuera de rango. Requiere ajuste.` };
      return { nivel: 1, msg: `✅ Glucosa ${g} mg/dL — En rango normal. ¡Buen control!` };
    }
  },
  'diabetes_tipo2': {
    nombre: 'Diabetes Tipo 2',
    pregunta: `🩺 *Seguimiento MediLyft - Diabetes*\n\nHola {nombre}! Hora de registrar su glucosa.\n\n¿Cuál es su nivel de glucosa actual? (mg/dL)\nEj: 110`,
    unidad: 'mg/dL',
    parametros: ['glucosa'],
    evaluar: (vals) => {
      const g = parseInt(vals.glucosa);
      if (g < 54 || g > 400) return { nivel: 3, msg: `🚨 EMERGENCIA: Glucosa ${g} mg/dL. LLAME AL 911 INMEDIATAMENTE.` };
      if (g < 70) return { nivel: 3, msg: `🚨 HIPOGLUCEMIA: Glucosa ${g} mg/dL. Tome azúcar ahora.` };
      if (g > 300) return { nivel: 2, msg: `⚠️ Glucosa ${g} mg/dL — Muy alta. Contacte a su médico.` };
      if (g > 180) return { nivel: 2, msg: `⚠️ Glucosa ${g} mg/dL — Elevada. Revise dieta y medicación.` };
      return { nivel: 1, msg: `✅ Glucosa ${g} mg/dL — En rango. ¡Buen control!` };
    }
  },
  'epoc': {
    nombre: 'EPOC',
    pregunta: `🩺 *Seguimiento MediLyft - EPOC*\n\nHola {nombre}! Registro diario EPOC.\n\n¿Cuál es su saturación de oxígeno? (SpO2 %)\nEj: 92`,
    pregunta2: `¿Cómo describiría su respiración hoy?\n1️⃣ Normal para mí\n2️⃣ Un poco más difícil que lo habitual\n3️⃣ Muy difícil o agitada`,
    unidad: '%',
    parametros: ['spo2', 'disnea'],
    evaluar: (vals) => {
      const s = parseInt(vals.spo2);
      if (s < 85) return { nivel: 3, msg: `🚨 EMERGENCIA: SpO2 ${s}% — PELIGRO VITAL. Llame al 911.` };
      if (s < 88) return { nivel: 2, msg: `⚠️ SpO2 ${s}% — Muy baja. Contacte médico urgente.` };
      if (s < 91) return { nivel: 2, msg: `⚠️ SpO2 ${s}% — Por debajo del rango. Monitoree de cerca.` };
      return { nivel: 1, msg: `✅ SpO2 ${s}% — Aceptable para EPOC. Continúe con su tratamiento.` };
    }
  },
  'asma': {
    nombre: 'Asma',
    pregunta: `🩺 *Seguimiento MediLyft - Asma*\n\nHola {nombre}! Seguimiento de asma.\n\n¿Cuál es su saturación de oxígeno? (SpO2 %)\nEj: 97`,
    pregunta2: `¿Usó su inhalador de rescate hoy?\n1️⃣ No lo necesité\n2️⃣ Sí, 1–2 veces\n3️⃣ Sí, 3 o más veces`,
    unidad: '%',
    parametros: ['spo2', 'rescatador'],
    evaluar: (vals) => {
      const s = parseInt(vals.spo2);
      if (s < 90) return { nivel: 3, msg: `🚨 EMERGENCIA: SpO2 ${s}% — CRISIS ASMÁTICA GRAVE. Llame al 911.` };
      if (s < 94) return { nivel: 2, msg: `⚠️ SpO2 ${s}% — Use su inhalador y contacte a su médico.` };
      return { nivel: 1, msg: `✅ SpO2 ${s}% — Asma controlada. ¡Bien!` };
    }
  },
  'insuficiencia_cardiaca': {
    nombre: 'Insuficiencia Cardíaca',
    pregunta: `🩺 *Seguimiento MediLyft - Insuficiencia Cardíaca*\n\nHola {nombre}! Registro diario.\n\n¿Cuánto pesa hoy? (kg)\nEj: 72.5`,
    pregunta2: `¿Tiene hinchazón en los tobillos o piernas?\n1️⃣ No\n2️⃣ Leve\n3️⃣ Moderada o severa`,
    pregunta3: `¿Tiene dificultad para respirar?\n1️⃣ No\n2️⃣ Solo con esfuerzo\n3️⃣ En reposo o al acostarse`,
    unidad: 'kg',
    parametros: ['peso', 'edema', 'disnea'],
    evaluar: (vals, anterior) => {
      const pesoActual = parseFloat(vals.peso);
      const pesoAnterior = anterior ? parseFloat(anterior.peso) : pesoActual;
      const diff = pesoActual - pesoAnterior;
      if (diff >= 3) return { nivel: 3, msg: `🚨 EMERGENCIA: Aumentó ${diff.toFixed(1)} kg en 24h. LLAME AL 911.` };
      if (diff >= 2) return { nivel: 2, msg: `⚠️ Aumentó ${diff.toFixed(1)} kg. Contacte a su médico HOY.` };
      if (diff >= 1) return { nivel: 2, msg: `⚠️ Aumentó ${diff.toFixed(1)} kg. Monitoree y reporte si continúa.` };
      return { nivel: 1, msg: `✅ Peso estable (${pesoActual} kg). ¡Buen control!` };
    }
  },
  'enfermedad_renal': {
    nombre: 'Enfermedad Renal Crónica',
    pregunta: `🩺 *Seguimiento MediLyft - Enfermedad Renal*\n\nHola {nombre}! Seguimiento renal.\n\n¿Cuál es su presión arterial sistólica hoy? (número mayor)\nEj: 125`,
    pregunta2: `¿Tiene alguno de estos síntomas?\n1️⃣ Sin síntomas\n2️⃣ Hinchazón leve en cara o pies\n3️⃣ Orina espumosa, muy poca orina o confusión`,
    unidad: 'mmHg',
    parametros: ['pa_sistolica', 'sintomas'],
    evaluar: (vals) => {
      const pa = parseInt(vals.pa_sistolica);
      if (pa >= 180) return { nivel: 3, msg: `🚨 EMERGENCIA: PA ${pa} mmHg — CRISIS. Llame al 911.` };
      if (pa >= 160) return { nivel: 2, msg: `⚠️ PA ${pa} mmHg — Muy alta para paciente renal. Médico urgente.` };
      if (pa >= 130) return { nivel: 2, msg: `⚠️ PA ${pa} mmHg — Elevada. Revise medicación.` };
      return { nivel: 1, msg: `✅ PA ${pa} mmHg — En rango objetivo para ERC.` };
    }
  },
  'tiroides': {
    nombre: 'Trastorno Tiroideo',
    pregunta: `🩺 *Seguimiento MediLyft - Tiroides*\n\nHola {nombre}! Seguimiento tiroideo.\n\n¿Cómo se siente hoy?\n1️⃣ Bien, sin síntomas nuevos\n2️⃣ Fatiga excesiva o frío intenso (hipotiroidismo)\n3️⃣ Palpitaciones, temblor o sudoración excesiva (hipertiroidismo)`,
    pregunta2: `¿Tomó su medicación hoy?\n1️⃣ Sí\n2️⃣ No`,
    unidad: 'síntomas',
    parametros: ['sintomas', 'medicacion'],
    evaluar: (vals) => {
      if (vals.sintomas === '3') return { nivel: 2, msg: `⚠️ Síntomas de hipertiroidismo reportados. Contacte a su médico.` };
      if (vals.sintomas === '2') return { nivel: 2, msg: `⚠️ Síntomas de hipotiroidismo reportados. Revise con su médico.` };
      return { nivel: 1, msg: `✅ Sin síntomas nuevos. Continúe con su tratamiento.` };
    }
  },
  'artritis_reumatoide': {
    nombre: 'Artritis Reumatoide',
    pregunta: `🩺 *Seguimiento MediLyft - Artritis Reumatoide*\n\nHola {nombre}! Seguimiento artritis.\n\n¿Cuánto dolor articular tiene hoy? (0 = sin dolor, 10 = dolor máximo)\nEj: 3`,
    pregunta2: `¿Cuántos minutos duró la rigidez matutina?\nEj: 20`,
    unidad: 'escala 0-10',
    parametros: ['dolor', 'rigidez'],
    evaluar: (vals) => {
      const d = parseInt(vals.dolor);
      const r = parseInt(vals.rigidez);
      if (d >= 8 || r > 60) return { nivel: 2, msg: `⚠️ Brote severo: dolor ${d}/10, rigidez ${r} min. Contacte a su médico.` };
      if (d >= 5 || r > 30) return { nivel: 2, msg: `⚠️ Actividad moderada: dolor ${d}/10. Monitoree y reporte si empeora.` };
      return { nivel: 1, msg: `✅ Artritis controlada: dolor ${d}/10. ¡Bien manejada!` };
    }
  },
  'lupus': {
    nombre: 'Lupus Eritematoso Sistémico',
    pregunta: `🩺 *Seguimiento MediLyft - Lupus*\n\nHola {nombre}! Seguimiento LES.\n\n¿Tiene fiebre hoy?\n1️⃣ No, temperatura normal\n2️⃣ Sí, fiebre leve (37.3–38°C)\n3️⃣ Sí, fiebre alta (>38°C)`,
    pregunta2: `¿Tiene síntomas nuevos?\n1️⃣ Sin síntomas nuevos\n2️⃣ Erupciones, dolor articular o fatiga\n3️⃣ Múltiples síntomas o empeoramiento súbito`,
    unidad: 'síntomas',
    parametros: ['fiebre', 'sintomas'],
    evaluar: (vals) => {
      if (vals.fiebre === '3' || vals.sintomas === '3') return { nivel: 2, msg: `⚠️ Posible brote de lupus. Contacte a su médico hoy.` };
      if (vals.fiebre === '2' || vals.sintomas === '2') return { nivel: 2, msg: `⚠️ Síntomas leves reportados. Monitoree y reporte si empeoran.` };
      return { nivel: 1, msg: `✅ Sin actividad de lupus reportada. ¡Excelente!` };
    }
  },
  'epilepsia': {
    nombre: 'Epilepsia',
    pregunta: `🩺 *Seguimiento MediLyft - Epilepsia*\n\nHola {nombre}! Seguimiento epilepsia.\n\n¿Tomó su medicación antiepiléptica hoy?\n1️⃣ Sí, todas las dosis\n2️⃣ Me olvidé una dosis\n3️⃣ No tomé la medicación`,
    pregunta2: `¿Tuvo alguna crisis convulsiva?\n1️⃣ No\n2️⃣ Sí, una crisis leve\n3️⃣ Sí, crisis severa o múltiples`,
    unidad: 'síntomas',
    parametros: ['medicacion', 'crisis'],
    evaluar: (vals) => {
      if (vals.crisis === '3') return { nivel: 3, msg: `🚨 EMERGENCIA: Crisis epiléptica severa. LLAME AL 911.` };
      if (vals.crisis === '2') return { nivel: 2, msg: `⚠️ Crisis epiléptica reportada. Contacte a su médico hoy.` };
      if (vals.medicacion === '3') return { nivel: 2, msg: `⚠️ Sin medicación antiepiléptica. Riesgo de crisis. Tome su medicación ahora.` };
      return { nivel: 1, msg: `✅ Sin crisis. Medicación tomada. ¡Excelente control!` };
    }
  },
  'post_acv': {
    nombre: 'Post ACV / Enfermedad Cerebrovascular',
    pregunta: `🩺 *Seguimiento MediLyft - Post ACV*\n\nHola {nombre}! Seguimiento post ACV.\n\n¿Cuál es su presión arterial sistólica? (número mayor)\nEj: 125`,
    pregunta2: `¿Tiene alguno de estos síntomas?\n1️⃣ Sin síntomas nuevos\n2️⃣ Debilidad en brazo/pierna o habla difícil\n3️⃣ Parálisis facial, confusión súbita o pérdida de visión`,
    unidad: 'mmHg',
    parametros: ['pa_sistolica', 'sintomas'],
    evaluar: (vals) => {
      const pa = parseInt(vals.pa_sistolica);
      if (vals.sintomas === '3') return { nivel: 3, msg: `🚨 POSIBLE NUEVO ACV. Llame al 911 INMEDIATAMENTE.` };
      if (pa >= 180 || vals.sintomas === '2') return { nivel: 2, msg: `⚠️ PA ${pa} mmHg o síntomas neurológicos. Contacte médico urgente.` };
      return { nivel: 1, msg: `✅ PA ${pa} mmHg — Sin síntomas nuevos. ¡Buen control!` };
    }
  },
  'insuficiencia_cardiaca_cronica': {
    nombre: 'Cardiopatía Isquémica Crónica',
    pregunta: `🩺 *Seguimiento MediLyft - Cardiopatía*\n\nHola {nombre}! Seguimiento cardíaco.\n\n¿Tiene dolor o presión en el pecho hoy?\n1️⃣ No\n2️⃣ Leve con esfuerzo (angina estable)\n3️⃣ En reposo o más intenso que lo habitual`,
    pregunta2: `¿Cuál es su frecuencia cardíaca? (lpm)\nEj: 72`,
    unidad: 'síntomas',
    parametros: ['dolor_pecho', 'fc'],
    evaluar: (vals) => {
      const fc = parseInt(vals.fc);
      if (vals.dolor_pecho === '3') return { nivel: 3, msg: `🚨 EMERGENCIA CARDÍACA. LLAME AL 911 AHORA.` };
      if (fc < 40 || fc > 150) return { nivel: 3, msg: `🚨 FC ${fc} lpm — PELIGROSA. LLAME AL 911.` };
      if (vals.dolor_pecho === '2' || fc < 50 || fc > 120) return { nivel: 2, msg: `⚠️ Angina o FC alterada. Contacte a su médico hoy.` };
      return { nivel: 1, msg: `✅ Sin dolor y FC ${fc} lpm — Normal. ¡Buen control!` };
    }
  },
  'fibrilacion_auricular': {
    nombre: 'Fibrilación Auricular',
    pregunta: `🩺 *Seguimiento MediLyft - Fibrilación Auricular*\n\nHola {nombre}! Seguimiento FA.\n\n¿Cuál es su frecuencia cardíaca? (lpm)\nEj: 75`,
    pregunta2: `¿Tiene palpitaciones, mareos o falta de aire?\n1️⃣ No\n2️⃣ Palpitaciones leves\n3️⃣ Palpitaciones intensas, síncope o dolor de pecho`,
    unidad: 'lpm',
    parametros: ['fc', 'sintomas'],
    evaluar: (vals) => {
      const fc = parseInt(vals.fc);
      if (vals.sintomas === '3' || fc > 150 || fc < 40) return { nivel: 3, msg: `🚨 EMERGENCIA: FC ${fc} lpm. LLAME AL 911.` };
      if (fc > 110 || vals.sintomas === '2') return { nivel: 2, msg: `⚠️ FC ${fc} lpm — Elevada. Contacte a su médico.` };
      return { nivel: 1, msg: `✅ FC ${fc} lpm — Controlada. ¡Bien!` };
    }
  },
  'depresion': {
    nombre: 'Depresión Crónica',
    pregunta: `🩺 *Seguimiento MediLyft - Salud Mental*\n\nHola {nombre}! Seguimiento de bienestar.\n\n¿Cómo se siente hoy en general?\n1️⃣ Bien o regular\n2️⃣ Triste, sin energía o con dificultad para actividades\n3️⃣ Muy mal, pensamientos negativos intensos`,
    pregunta2: `¿Tomó su medicación hoy?\n1️⃣ Sí\n2️⃣ No`,
    unidad: 'síntomas',
    parametros: ['estado_animo', 'medicacion'],
    evaluar: (vals) => {
      if (vals.estado_animo === '3') return { nivel: 2, msg: `⚠️ Estado de ánimo muy bajo reportado. Su médico le contactará pronto. Recuerde que no está solo/a.` };
      if (vals.estado_animo === '2') return { nivel: 2, msg: `⚠️ Síntomas depresivos reportados. Recomendamos hablar con su médico.` };
      return { nivel: 1, msg: `✅ Gracias por su reporte. Continúe con su tratamiento. ¡Ánimo!` };
    }
  },
  'obesidad': {
    nombre: 'Obesidad / Sobrepeso',
    pregunta: `🩺 *Seguimiento MediLyft - Control de Peso*\n\nHola {nombre}! Seguimiento semanal.\n\n¿Cuánto pesa hoy? (kg)\nEj: 85.5`,
    pregunta2: `¿Realizó actividad física esta semana?\n1️⃣ Sí, 3 o más días\n2️⃣ Sí, 1–2 días\n3️⃣ No realicé ejercicio`,
    unidad: 'kg',
    parametros: ['peso', 'actividad'],
    evaluar: (vals) => {
      return { nivel: 1, msg: `✅ Peso registrado: ${vals.peso} kg. ${vals.actividad === '3' ? 'Recuerde que la actividad física es fundamental para su salud.' : '¡Siga con la actividad física!'}` };
    }
  },
  'osteoporosis': {
    nombre: 'Osteoporosis',
    pregunta: `🩺 *Seguimiento MediLyft - Osteoporosis*\n\nHola {nombre}! Seguimiento osteoporosis.\n\n¿Tomó su calcio y vitamina D hoy?\n1️⃣ Sí\n2️⃣ No`,
    pregunta2: `¿Tuvo alguna caída o golpe?\n1️⃣ No\n2️⃣ Sí, caída leve sin lesión\n3️⃣ Sí, caída con dolor intenso o imposibilidad de moverse`,
    unidad: 'síntomas',
    parametros: ['medicacion', 'caida'],
    evaluar: (vals) => {
      if (vals.caida === '3') return { nivel: 3, msg: `🚨 Posible fractura. LLAME AL 911 o vaya a urgencias.` };
      if (vals.caida === '2') return { nivel: 2, msg: `⚠️ Caída reportada. Monitoree y consulte a su médico si aparece dolor.` };
      return { nivel: 1, msg: `✅ Sin caídas. ${vals.medicacion === '1' ? 'Medicación tomada.' : 'Recuerde tomar su calcio y vitamina D.'} ¡Bien!` };
    }
  },
  'vih': {
    nombre: 'VIH/SIDA',
    pregunta: `🩺 *Seguimiento MediLyft - VIH*\n\nHola {nombre}! Seguimiento de tratamiento.\n\n¿Tomó su medicación antirretroviral hoy?\n1️⃣ Sí, todas las dosis\n2️⃣ Olvidé una dosis\n3️⃣ No tomé la medicación`,
    pregunta2: `¿Tiene síntomas nuevos?\n1️⃣ Sin síntomas\n2️⃣ Fiebre, fatiga o pérdida de peso\n3️⃣ Síntomas severos o infección`,
    unidad: 'síntomas',
    parametros: ['medicacion', 'sintomas'],
    evaluar: (vals) => {
      if (vals.sintomas === '3') return { nivel: 2, msg: `⚠️ Síntomas severos reportados. Contacte a su médico hoy.` };
      if (vals.medicacion === '3') return { nivel: 2, msg: `⚠️ Sin medicación ARV. La adherencia es fundamental. Tome su medicación ahora.` };
      return { nivel: 1, msg: `✅ ${vals.medicacion === '1' ? 'Medicación tomada.' : 'Recuerde completar sus dosis.'} ¡Siga adelante!` };
    }
  }
};

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const ahora = new Date();
  let procesados = 0;
  let errores = 0;

  try {
    // 1. PROCESAR RECORDATORIOS DE MEDICAMENTOS
    const recordatorios = await supa('GET', 'recordatorios', null,
      `?activo=eq.true&fecha_proximo=lte.${ahora.toISOString()}&fecha_fin=gte.${ahora.toISOString()}&enfermedad_id=is.null&select=*,pacientes(nombre,apellidos,telefono)`
    );

    for (const r of recordatorios || []) {
      try {
        const paciente = r.pacientes || {};
        const telefono = r.telefono;
        if (!telefono) continue;

        let mensaje = '';
        if (r.tipo === 'medicamento') {
          mensaje = `💊 *Recordatorio MediLyft*\n\nHola ${paciente.nombre||''}! Es hora de tomar:\n\n*${r.medicamento}*\n${r.dosis ? `Dosis: ${r.dosis}` : ''}\n\n¿Ya tomó su medicamento?\n\nResponda *Sí* o *No*`;
        } else if (r.tipo === 'fin_tratamiento') {
          mensaje = `🏥 *Seguimiento MediLyft*\n\nHola ${paciente.nombre||''}! Su tratamiento con *${r.medicamento}* ha finalizado.\n\n¿Cómo se siente ahora?\n\n1️⃣ Me siento mejor, me curé\n2️⃣ Mejoré pero aún tengo síntomas\n3️⃣ No mejoré o me siento peor`;
        }

        if (mensaje) {
          await enviarWhatsApp(telefono, mensaje);
          await supa('POST', 'seguimiento_respuestas', {
            recordatorio_id: r.id,
            paciente_id: r.paciente_id,
            receta_id: r.receta_id,
            pregunta: mensaje
          });

          const proximoEnvio = new Date(ahora.getTime() + r.frecuencia_horas * 3600000);
          if (proximoEnvio <= new Date(r.fecha_fin)) {
            await supa('PATCH', 'recordatorios', { fecha_proximo: proximoEnvio.toISOString() }, `?id=eq.${r.id}`);
          } else {
            await supa('PATCH', 'recordatorios', { activo: false }, `?id=eq.${r.id}`);
            if (r.tipo === 'medicamento') {
              await supa('POST', 'recordatorios', {
                receta_id: r.receta_id,
                paciente_id: r.paciente_id,
                telefono: r.telefono,
                medicamento: r.medicamento,
                dosis: r.dosis,
                frecuencia_horas: 999,
                fecha_proximo: new Date(ahora.getTime() + 2 * 3600000).toISOString(),
                fecha_fin: new Date(ahora.getTime() + 3 * 3600000).toISOString(),
                activo: true,
                tipo: 'fin_tratamiento'
              });
            }
          }
          procesados++;
        }
      } catch (e) {
        console.error('Error recordatorio:', e.message);
        errores++;
      }
    }

    // 2. PROCESAR SEGUIMIENTOS CRÓNICOS
    const cronicosActivos = await supa('GET', 'enfermedades_cronicas', null,
      `?activo=eq.true&select=*,pacientes(nombre,apellidos,telefono,cedula)`
    );

    for (const ec of cronicosActivos || []) {
      try {
        const paciente = ec.pacientes || {};
        const telefono = paciente.telefono;
        if (!telefono) continue;

        const tel = `whatsapp:+593${telefono.replace(/^0/, '')}`;

        // Verificar si ya se envió un recordatorio crónico reciente
        const ultimoRegistro = await supa('GET', 'registros_cronicos', null,
          `?enfermedad_id=eq.${ec.id}&order=created_at.desc&limit=1`
        );

        const ultimaFecha = ultimoRegistro?.[0]?.created_at ? new Date(ultimoRegistro[0].created_at) : null;
        const horasDesdeUltimo = ultimaFecha ? (ahora - ultimaFecha) / 3600000 : 9999;

        if (horasDesdeUltimo < ec.frecuencia_horas) continue;

        // Verificar que no haya sesión activa del paciente
        const sesionActiva = await supa('GET', 'sesiones_bot', null,
          `?telefono=eq.${encodeURIComponent(tel)}`
        );
        if (sesionActiva && sesionActiva.length > 0 && sesionActiva[0].paso > 0 && sesionActiva[0].paso < 99) continue;

        const enfDef = ENFERMEDADES[ec.enfermedad];
        if (!enfDef) continue;

        const pregunta = enfDef.pregunta.replace('{nombre}', paciente.nombre || 'estimado/a');
        await enviarWhatsApp(tel, pregunta);

        // Guardar estado en sesiones_bot con paso especial para crónico
        const sesionData = {
          enfermedad_id: ec.id,
          enfermedad_key: ec.enfermedad,
          paciente_id: ec.paciente_id,
          paso_cronico: 1,
          valores: {},
          preguntas_pendientes: enfDef.parametros.length
        };

        const sesionExiste = sesionActiva && sesionActiva.length > 0;
        if (sesionExiste) {
          await supa('PATCH', 'sesiones_bot', { paso: 200, datos: sesionData, updated_at: ahora.toISOString() },
            `?telefono=eq.${encodeURIComponent(tel)}`);
        } else {
          await supa('POST', 'sesiones_bot', { telefono: tel, paso: 200, datos: sesionData });
        }

        procesados++;
      } catch (e) {
        console.error('Error crónico:', e.message);
        errores++;
      }
    }

    console.log(`Cron: ${procesados} enviados, ${errores} errores`);
    return res.status(200).json({ ok: true, procesados, errores, timestamp: ahora.toISOString() });

  } catch (e) {
    console.error('Error cron general:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
