const { query } = require('../services/supabase');
const { eliminar } = require('../services/sesiones');

// 15 preguntas — 5 dimensiones MRL Ecuador × 3 preguntas c/u
// inversa=true → mayor respuesta = menor riesgo (se invierte al calcular)
const PREGUNTAS_PSI = [
  // Dimensión 1: Carga cuantitativa de trabajo
  { dim: 'carga',      texto: '¿Tienes que trabajar muy rápido o bajo presión constante de tiempo?',                   inversa: false },
  { dim: 'carga',      texto: '¿Tu trabajo exige que memorices muchas cosas o tomes decisiones complejas?',            inversa: false },
  { dim: 'carga',      texto: '¿Sientes que tienes más trabajo del que puedes hacer bien en el tiempo disponible?',    inversa: false },
  // Dimensión 2: Autonomía y control
  { dim: 'autonomia',  texto: '¿Puedes organizar y decidir cómo realizar tu propio trabajo?',                          inversa: true  },
  { dim: 'autonomia',  texto: '¿Puedes tomar un descanso o pausar cuando lo necesitas?',                               inversa: true  },
  { dim: 'autonomia',  texto: '¿Tienes influencia sobre las decisiones importantes de tu trabajo?',                    inversa: true  },
  // Dimensión 3: Apoyo social y liderazgo
  { dim: 'apoyo',      texto: '¿Tu jefe o supervisor apoya, motiva y reconoce el trabajo de su equipo?',               inversa: true  },
  { dim: 'apoyo',      texto: '¿Recibes la información y los recursos que necesitas para trabajar bien?',              inversa: true  },
  { dim: 'apoyo',      texto: '¿Hay colaboración y buen ambiente entre tus compañeros de trabajo?',                    inversa: true  },
  // Dimensión 4: Relaciones y conflictos
  { dim: 'relaciones', texto: '¿Estás expuesto a comportamientos hostiles, burlas o falta de respeto en tu trabajo?',  inversa: false },
  { dim: 'relaciones', texto: '¿Sientes que tu trabajo es valorado y reconocido por tu organización?',                 inversa: true  },
  { dim: 'relaciones', texto: '¿Existen conflictos frecuentes o tensiones entre personas en tu área de trabajo?',     inversa: false },
  // Dimensión 5: Doble presencia (equilibrio trabajo-vida)
  { dim: 'doble_pres', texto: '¿Piensas en problemas del trabajo cuando estás fuera de él (casa, descanso)?',         inversa: false },
  { dim: 'doble_pres', texto: '¿El trabajo te impide atender tus responsabilidades personales o familiares?',         inversa: false },
  { dim: 'doble_pres', texto: '¿Sientes que tienes un equilibrio saludable entre tu trabajo y tu vida personal?',     inversa: true  },
];

const OPCIONES_FREQ = [
  { id: '1', titulo: 'Nunca'          },
  { id: '2', titulo: 'Rara vez'       },
  { id: '3', titulo: 'A veces'        },
  { id: '4', titulo: 'Frecuentemente' },
  { id: '5', titulo: 'Siempre'        },
];

function getMsgPregunta(n) {
  const pregunta = PREGUNTAS_PSI[n - 1];
  return {
    texto: `🧠 *Evaluación de bienestar laboral* _(anónima)_\n*Pregunta ${n} de ${PREGUNTAS_PSI.length}*\n\n${pregunta.texto}`,
    secciones: [{ titulo: 'Con qué frecuencia...', filas: OPCIONES_FREQ }],
    botonTexto: 'Responder'
  };
}

function calcDim(dim, respuestas) {
  const qs = PREGUNTAS_PSI.map((q, i) => ({ ...q, val: respuestas[i] })).filter(q => q.dim === dim);
  const riesgos = qs.map(q => q.inversa ? (5 - q.val) : (q.val - 1)); // escala 0-4
  const avg = riesgos.reduce((s, v) => s + v, 0) / riesgos.length;
  return Math.round(avg * 25); // normalizar a 0-100
}

async function procesarPsicosocial(paso, mensaje, datos, telefono) {
  const val = parseInt((mensaje || '').trim());
  const total = PREGUNTAS_PSI.length;

  if (isNaN(val) || val < 1 || val > 5) {
    const msg = getMsgPregunta(paso);
    return {
      respuesta: `⚠️ Responde con un número del 1 al 5.\n\n${PREGUNTAS_PSI[paso - 1].texto}`,
      lista: { secciones: msg.secciones, botonTexto: msg.botonTexto },
      paso,
      datos,
      terminar: false
    };
  }

  datos.r = datos.r || [];
  datos.r.push(val);

  // Si quedan preguntas, enviar la siguiente
  if (paso < total) {
    const msg = getMsgPregunta(paso + 1);
    return {
      respuesta: msg.texto,
      lista: { secciones: msg.secciones, botonTexto: msg.botonTexto },
      paso: paso + 1,
      datos,
      terminar: false
    };
  }

  // Última pregunta — calcular y guardar
  const dim_carga      = calcDim('carga',      datos.r);
  const dim_autonomia  = calcDim('autonomia',   datos.r);
  const dim_apoyo      = calcDim('apoyo',       datos.r);
  const dim_relaciones = calcDim('relaciones',  datos.r);
  const dim_doble_pres = calcDim('doble_pres',  datos.r);
  const score_global   = Math.round(
    [dim_carga, dim_autonomia, dim_apoyo, dim_relaciones, dim_doble_pres].reduce((s, v) => s + v, 0) / 5
  );

  await query('POST', 'tracking_psicosocial', {
    empresa_id:   datos.empresa_id,
    caso_id:      datos.caso_id,
    dim_carga,
    dim_autonomia,
    dim_apoyo,
    dim_relaciones,
    dim_doble_pres,
    score_global
  });

  await query('PATCH', 'tracking_casos', {
    ultima_evaluacion_psicosocial: new Date().toISOString()
  }, `?id=eq.${datos.caso_id}`);

  await eliminar(telefono);

  return {
    respuesta: `✅ *¡Evaluación completada — gracias!*\n\nTus respuestas se procesaron de forma completamente anónima.\nLos resultados ayudarán a mejorar el bienestar en tu empresa. 💙`,
    terminar: true
  };
}

module.exports = { procesarPsicosocial, getMsgPregunta };
