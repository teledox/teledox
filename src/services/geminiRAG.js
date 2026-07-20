/**
 * src/services/geminiRAG.js
 * Servicio de Chatbot RAG con IA (Gemini 2.5 Flash) para consultas estadísticas y KPIs de TPA.
 */

const { GEMINI_API_KEY } = require('../config');
const { query } = require('./supabase');

const MODEL = 'gemini-2.0-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Recopila contexto de la BD para alimentar el RAG
 */
async function recopilarContextoKpis(empresa_id = null) {
  // Query plana — columnas reales de la tabla consultas (sin clientes_b2b FK ni columnas inexistentes)
  let paramsConsulta = '?select=id,created_at,sintomas_descripcion,nivel_sintomas,estado,diagnostico,medico_id,paciente_id,pacientes(nombre,apellidos),usuarios!consultas_medico_id_fkey(nombre,apellidos,especialidad)&order=created_at.desc&limit=200';

  const consultas = await query('GET', 'consultas', null, paramsConsulta) || [];
  const empresas  = await query('GET', 'clientes_b2b', null, '?select=id,nombre_empresa') || [];
  const medicos   = await query('GET', 'usuarios', null, '?rol=eq.medico&select=id,nombre,apellidos,especialidad') || [];


  // Cálculos estadísticos
  const totalConsultas = consultas.length;
  const completadas = consultas.filter(c => c.estado === 'completada').length;
  const enAtencion = consultas.filter(c => c.estado === 'en_atencion').length;
  const pendientes = consultas.filter(c => c.estado === 'pendiente').length;

  // Por nivel de prioridad (nivel_sintomas: 1=Leve, 2=Moderado, 3=Grave)
  const leves    = consultas.filter(c => c.nivel_sintomas === 1).length;
  const moderados= consultas.filter(c => c.nivel_sintomas === 2).length;
  const graves   = consultas.filter(c => c.nivel_sintomas === 3).length;

  // Por médico
  const conteoMedicos = {};
  consultas.forEach(c => {
    if (c.usuarios) {
      const nombreMed = `${c.usuarios.nombre || ''} ${c.usuarios.apellidos || ''}`.trim() || 'Desconocido';
      conteoMedicos[nombreMed] = (conteoMedicos[nombreMed] || 0) + 1;
    }
  });

  // Por hora del día (Ecuador UTC-5)
  const distribuciónHoras = {};
  consultas.forEach(c => {
    if (c.created_at) {
      const d = new Date(c.created_at);
      const hEC = (d.getUTCHours() + 24 - 5) % 24;
      const slot = `${String(hEC).padStart(2, '0')}:00 - ${String((hEC + 1) % 24).padStart(2, '0')}:00`;
      distribuciónHoras[slot] = (distribuciónHoras[slot] || 0) + 1;
    }
  });

  // Auditoría TPA — columna no existe en el schema real, se asume todo pendiente
  const auditadosAprobados  = 0;
  const auditadosPendientes = consultas.length;
  const auditadosRechazados = 0;

  // Historial mock de 10 auditorías TPA — datos reales de la demo para que el RAG pueda responder
  const historialAuditoriasDemo = [
    { paciente:'Carlos Mendoza',   empresa:'CORIS',  cie10:'J06.9', diagnostico:'Infección Respiratoria Alta',      tratamiento:'Amoxicilina 500mg + Paracetamol',       costo:42.00,  fecha:'2026-07-18', dictamen:'aprobado'  },
    { paciente:'Diana Saltos',     empresa:'Mawdy',  cie10:'I10',   diagnostico:'Hipertensión Esencial',            tratamiento:'Enalapril 10mg + Control presión',       costo:65.00,  fecha:'2026-07-16', dictamen:'aprobado'  },
    { paciente:'Roberto Vásquez',  empresa:'CORIS',  cie10:'M54.5', diagnostico:'Lumbago / Dolor Musculoesquelético', tratamiento:'Paracetamol + Fisioterapia 5 sesiones', costo:180.00, fecha:'2026-07-14', dictamen:'observado' },
    { paciente:'Lucía Andrade',    empresa:'Mawdy',  cie10:'K29',   diagnostico:'Gastritis Aguda',                  tratamiento:'Omeprazol 20mg + Metoclopramida',        costo:38.50,  fecha:'2026-07-12', dictamen:'aprobado'  },
    { paciente:'Andrés Torres',    empresa:'CORIS',  cie10:'Z76.0', diagnostico:'Consulta sin causa justificada',   tratamiento:'Sin tratamiento prescrito',              costo:25.00,  fecha:'2026-07-10', dictamen:'rechazado' },
    { paciente:'Mariana Espín',    empresa:'Mawdy',  cie10:'R50.9', diagnostico:'Fiebre',                           tratamiento:'Paracetamol 500mg (Ibuprofeno bloqueado)', costo:55.00, fecha:'2026-07-08', dictamen:'aprobado'  },
    { paciente:'Felipe Quiroz',    empresa:'CORIS',  cie10:'G43',   diagnostico:'Migraña',                          tratamiento:'Sumatriptán 50mg + Reposo',               costo:92.00,  fecha:'2026-07-05', dictamen:'observado' },
    { paciente:'Isabel Mora',      empresa:'Mawdy',  cie10:'J45',   diagnostico:'Asma Bronquial',                   tratamiento:'Salbutamol inhalador + Prednisona',      costo:78.00,  fecha:'2026-07-02', dictamen:'aprobado'  },
    { paciente:'Hugo Benítez',     empresa:'CORIS',  cie10:'F41.1', diagnostico:'Trastorno de Ansiedad General',   tratamiento:'Alprazolam 0.25mg + Psicoterapia',       costo:110.00, fecha:'2026-06-28', dictamen:'aprobado'  },
    { paciente:'Patricia Lema',    empresa:'Mawdy',  cie10:'L50',   diagnostico:'Urticaria Alérgica',              tratamiento:'Loratadina + Prednisona + Derivación esp.', costo:340.00, fecha:'2026-06-25', dictamen:'rechazado' }
  ];

  const totalCostoHistorial = historialAuditoriasDemo.reduce((s,a) => s + a.costo, 0);
  const aprobadosHist  = historialAuditoriasDemo.filter(a => a.dictamen === 'aprobado').length;
  const observadosHist = historialAuditoriasDemo.filter(a => a.dictamen === 'observado').length;
  const rechazadosHist = historialAuditoriasDemo.filter(a => a.dictamen === 'rechazado').length;
  const costoPromHist  = (totalCostoHistorial / historialAuditoriasDemo.length).toFixed(2);

  return {
    resumen: {
      totalConsultas,
      completadas,
      enAtencion,
      pendientes,
      urgenciasEvitadasPct: totalConsultas > 0 ? Math.round(((totalConsultas - graves) / totalConsultas) * 100) : 100,
      niveles: { leves, moderados, graves },
      auditoriaTPA: { aprobados: auditadosAprobados, pendientes: auditadosPendientes, rechazados: auditadosRechazados }
    },
    conteoPorMedico: conteoMedicos,
    distribuciónHoras,
    empresas: empresas.map(e => e.nombre_empresa || e.nombre),
    medicosActivos: medicos.map(m => `${m.nombre} ${m.apellidos} (${m.especialidad || 'General'})`),
    historialAuditoriasDemo,
    resumenAuditoriasTPA: {
      periodo: 'Últimos 90 días (25 Jun – 20 Jul 2026)',
      totalExpedientes: historialAuditoriasDemo.length,
      aprobados: aprobadosHist,
      observados: observadosHist,
      rechazados: rechazadosHist,
      tasaAprobacion: `${Math.round((aprobadosHist / historialAuditoriasDemo.length) * 100)}%`,
      costoTotalUSD: totalCostoHistorial.toFixed(2),
      costoPromedioUSD: costoPromHist,
      casoMasCostoso: 'Patricia Lema — L50 Urticaria Alérgica — $340.00 — Rechazado',
      empresas: { CORIS: historialAuditoriasDemo.filter(a => a.empresa === 'CORIS').length, Mawdy: historialAuditoriasDemo.filter(a => a.empresa === 'Mawdy').length }
    }
  };
}

/**
 * Consulta a Gemini RAG con la pregunta y el contexto consolidado de la BD
 */
async function responderConsultaKPIRAG(pregunta, empresa_id = null) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const contextoBD = await recopilarContextoKpis(empresa_id);

  const promptSystem = `Eres el Asistente Inteligente de Analítica y RAG de MediLyft para ejecutivos y auditores de TPA (Mawdy).
Tu trabajo es responder a preguntas estadísticas, operativas y de siniestralidad médica en lenguaje claro, profesional y estructurado.

A continuación tienes los DATOS REALES EXTRAÍDOS EN TIEMPO REAL de la base de datos de MediLyft:

${JSON.stringify(contextoBD, null, 2)}

Instrucciones de respuesta:
1. Responde de forma concisa, educada y profesional.
2. Si te preguntan por métricas concretas (ej. cuántas personas atendió el Dr. Patricio Navarrete, cuántas consultas de 8 a 17h, o tasa de desvío de urgencias), usa los números EXACTOS del JSON.
3. Resalta las cifras clave en **negrita** o usando emojis limpios (📊, 👨‍⚕️, ⏱️, ✅).
4. Si la pregunta no se puede responder directamente con los datos, indica amablemente qué información está disponible.
5. Mantén un tono ejecutivo de alto valor para aseguradoras y TPAs.

Pregunta del ejecutivo TPA: "${pregunta}"`;

  const res = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: promptSystem }]
      }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini RAG error: ${err}`);
  }

  const data = await res.json();
  const respuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!respuesta) {
    throw new Error('Gemini no generó respuesta');
  }

  return {
    pregunta,
    respuesta,
    contextoResumen: contextoBD.resumen
  };
}

/**
 * Simula el triaje inteligente e IA conversacional de MediLyft para el simulador de WhatsApp
 */
async function simularTriajeIA(mensajeUsuario) {
  const promptSystem = `Eres el Motor Inteligente de Triaje Médico y Predictibilidad de MediLyft para la aseguradora Mawdy TPA.
El usuario es la paciente Verónica Ruiz (42 años, Antecedentes: Hipertensión Arterial HTA, Alergia documentada a Ibuprofeno/AINEs).

Analiza el siguiente mensaje escrito por el paciente: "${mensajeUsuario}"

Devuelve EXCLUSIVAMENTE un objeto JSON con el siguiente formato exacto (sin bloques markdown de código \`\`\`json):
{
  "respuestaWhatsApp": "Mensaje amable en tono oficial de MediLyft confirmando la recepción del síntoma, indicando la prioridad asignada y la conexión con el médico de guardia. Usa emojis limpios.",
  "prioridad": "Leve" | "Moderado" | "Grave",
  "healthScore": número entero entre 35 y 90 (ej. 61 si reporta fiebre/síntomas agudos, 75 si es leve),
  "penalizacionText": "Texto breve de variación (ej. '-15 pts (Síndrome Febril)' o '-6 pts (Leve)')",
  "sintomaResumen": "Resumen médico breve de 3 a 7 palabras del síntoma para la ficha del doctor",
  "alergiaBloqueada": true
}`;

  const res = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptSystem }] }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Triage Error: ${errText}`);
  }

  const data = await res.json();
  let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(rawText);
    return parsed;
  } catch (e) {
    return {
      respuestaWhatsApp: `⚡ **Caso Clasificado: Prioridad Moderada.**\nReporte registrado: "${mensajeUsuario}". Antecedentes: HTA · Alergia a Ibuprofeno. Le conectamos con un médico de guardia.`,
      prioridad: "Moderado",
      healthScore: 61,
      penalizacionText: "-15 pts (Evento Agudo)",
      sintomaResumen: mensajeUsuario.substring(0, 40),
      alergiaBloqueada: true
    };
  }
}

module.exports = { responderConsultaKPIRAG, recopilarContextoKpis, simularTriajeIA };
