const { query } = require('../services/supabase');
const { alertar } = require('../services/telegram');
const { guardar, eliminar } = require('../services/sesiones');
const { crear: crearConsulta, crearNotificacion } = require('../services/consultas');

const ENFERMEDADES = {
  'hipertension': {
    nombre: 'Hipertensión Arterial',
    pasos: [
      { param: 'sistolica', pregunta: '¿Cuál es su presión *sistólica*? (número mayor, ej: 120)' },
      { param: 'diastolica', pregunta: '¿Cuál es su presión *diastólica*? (número menor, ej: 80)' },
      { param: 'sintomas', pregunta: '¿Tiene síntomas?\n1️⃣ Sin síntomas\n2️⃣ Cefalea o mareos leves\n3️⃣ Visión borrosa o dolor de cabeza fuerte' }
    ],
    evaluar: (vals) => {
      const s = parseInt(vals.sistolica), d = parseInt(vals.diastolica);
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
      { param: 'dolor', pregunta: '¿Cuánto dolor articular tiene hoy? (0–10)\nEj: 3' },
      { param: 'rigidez', pregunta: '¿Cuántos minutos duró la rigidez matutina?\nEj: 20' }
    ],
    evaluar: (vals) => {
      const d = parseInt(vals.dolor), r = parseInt(vals.rigidez);
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

function validarRespuestaCronica(pregunta, mensaje) {
  const valor = (mensaje || '').trim();
  const opciones = (pregunta.match(/[1-9]️⃣/g) || []).length;
  if (opciones > 0) {
    return new RegExp(`^[1-${opciones}]$`).test(valor);
  }
  return /^\d+(\.\d+)?$/.test(valor);
}

// Convierte una pregunta con opciones 1️⃣2️⃣3️⃣ en botones WhatsApp.
// Retorna { texto, botones } o null si la pregunta no tiene opciones.
function preguntaABotones(pregunta) {
  const lineas = pregunta.split('\n');
  const opts = lineas.filter(l => /^[1-9]️⃣/.test(l));
  if (opts.length === 0 || opts.length > 3) return null;
  const texto = lineas.filter(l => !/^[1-9]️⃣/.test(l)).join('\n').trimEnd();
  const botones = opts.map((l, i) => {
    const titulo = l.replace(/^[1-9]️⃣\s*/, '');
    const corto = titulo.length <= 20 ? titulo
      : titulo.lastIndexOf(' ', 19) > 0 ? titulo.substring(0, titulo.lastIndexOf(' ', 19))
      : titulo.substring(0, 20);
    return { id: String(i + 1), titulo: corto };
  });
  return { texto, botones };
}

async function procesarCronica(paso, mensaje, datos, telefono, nombreWhatsApp) {
  const enfKey = datos.enfermedad_key;
  const enfDef = ENFERMEDADES[enfKey];
  const pasoCronico = datos.paso_cronico || 1;

  if (!enfDef) {
    await eliminar(telefono);
    return { respuesta: `Escriba *hola* para iniciar una consulta. 👋`, terminar: true };
  }

  // Guardar respuesta del paso actual (validando el formato esperado)
  const preguntaActual = enfDef.pasos[pasoCronico - 1];
  const paramActual = preguntaActual?.param;
  if (paramActual) {
    if (!validarRespuestaCronica(preguntaActual.pregunta, mensaje)) {
      const opciones = (preguntaActual.pregunta.match(/[1-9]️⃣/g) || []).length;
      const hint = opciones > 0
        ? `Por favor seleccione una opción:`
        : `Por favor ingrese solo el número, ej: 120`;
      await guardar(telefono, 200, datos, 'cronicas');
      const parsedErr = preguntaABotones(preguntaActual.pregunta);
      if (parsedErr) {
        return { respuesta: `❌ No entendí su respuesta.\n\n${hint}\n\n${parsedErr.texto}`, botones: parsedErr.botones, terminar: false };
      }
      return { respuesta: `❌ No entendí su respuesta.\n\n${hint}\n\n${preguntaActual.pregunta}`, terminar: false };
    }
    datos.valores = datos.valores || {};
    datos.valores[paramActual] = mensaje.trim();
  }

  // ¿Hay más preguntas?
  if (pasoCronico < enfDef.pasos.length) {
    const siguientePaso = enfDef.pasos[pasoCronico];
    datos.paso_cronico = pasoCronico + 1;
    await guardar(telefono, 200, datos, 'cronicas');
    const parsed = preguntaABotones(siguientePaso.pregunta);
    if (parsed) {
      return { respuesta: parsed.texto, botones: parsed.botones, terminar: false };
    }
    return { respuesta: siguientePaso.pregunta, terminar: false };
  }

  // Todas las preguntas respondidas — evaluar
  const ultimoReg = await query('GET', 'registros_cronicos', null,
    `?enfermedad_id=eq.${datos.enfermedad_id}&order=created_at.desc&limit=2`
  );
  const anterior = ultimoReg?.[1]?.valores || null;
  const resultado = enfDef.evaluar(datos.valores, anterior);

  await query('POST', 'registros_cronicos', {
    enfermedad_id: datos.enfermedad_id,
    paciente_id: datos.paciente_id,
    valores: datos.valores,
    nivel_alerta: resultado.nivel
  });

  let respuesta;
  if (resultado.nivel === 3) {
    respuesta = `${resultado.msg}\n\n📞 *Llame al 911 AHORA*\ntel:911`;
    await alertar(`🚨 <b>ALERTA GRAVE CRÓNICO — ${enfDef.nombre}</b>\nPaciente: ${nombreWhatsApp}\nTeléfono: ${telefono}\nValores: ${JSON.stringify(datos.valores)}`);
    const consultaGrave = await crearConsulta({
      paciente_id: datos.paciente_id,
      nivel_sintomas: 3,
      sintomas_descripcion: `Seguimiento de ${enfDef.nombre} fuera de rango (alerta grave): ${JSON.stringify(datos.valores)}`,
      estado: 'pendiente'
    });
    await crearNotificacion('urgente', `🚨 Alerta grave — ${enfDef.nombre}`, `${nombreWhatsApp} reportó valores fuera de rango en su seguimiento crónico. Requiere agendar consulta de seguimiento con prioridad.`, datos.paciente_id, consultaGrave?.id, { origen: 'seguimiento', categoria: 'grave', etiqueta: 'CRÓNICO', estado_validacion: 'pendiente' });
  } else if (resultado.nivel === 2) {
    respuesta = `${resultado.msg}\n\nHemos notificado a su equipo médico. Le contactarán pronto.\n\nSi empeora, llame al *911* de inmediato.`;
    await alertar(`⚠️ <b>ALERTA MEDIA CRÓNICO — ${enfDef.nombre}</b>\nPaciente: ${nombreWhatsApp}\nTeléfono: ${telefono}\nValores: ${JSON.stringify(datos.valores)}`);
    const consultaMedia = await crearConsulta({
      paciente_id: datos.paciente_id,
      nivel_sintomas: 2,
      sintomas_descripcion: `Seguimiento de ${enfDef.nombre} con valores de atención: ${JSON.stringify(datos.valores)}`,
      estado: 'pendiente'
    });
    await crearNotificacion('urgente', `⚠️ Valores de atención — ${enfDef.nombre}`, `${nombreWhatsApp} reportó valores de atención en su seguimiento crónico. Considere agendar una consulta de seguimiento.`, datos.paciente_id, consultaMedia?.id, { origen: 'seguimiento', categoria: 'medio', etiqueta: 'CRÓNICO', estado_validacion: 'pendiente' });
  } else {
    respuesta = `${resultado.msg}\n\nGracias por su reporte diario. Su seguimiento ha sido registrado. 📋\n\nSi tiene algún síntoma nuevo escriba *hola*.`;
  }

  await eliminar(telefono);
  return { respuesta, terminar: true };
}

module.exports = { procesarCronica, ENFERMEDADES };
