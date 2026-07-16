/**
 * src/services/geminiRAG.js
 * Servicio de Chatbot RAG con IA (Gemini 2.5 Flash) para consultas estadísticas y KPIs de TPA.
 */

const { GEMINI_API_KEY } = require('../config');
const { query } = require('./supabase');

const MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * Recopila contexto de la BD para alimentar el RAG
 */
async function recopilarContextoKpis(empresa_id = null) {
  let paramsConsulta = '?select=id,fecha,sintomas,nivel_prioridad,estado,estado_auditoria,created_at,atendido_at,medico_id,empresa_id,pacientes(nombre,apellidos),usuarios!consultas_medico_id_fkey(nombre,apellidos,especialidad),clientes_b2b(nombre)&order=created_at.desc&limit=200';
  
  if (empresa_id) {
    paramsConsulta += `&empresa_id=eq.${empresa_id}`;
  }

  const consultas = await query('GET', 'consultas', null, paramsConsulta) || [];
  const empresas = await query('GET', 'clientes_b2b', null, '?select=id,nombre') || [];
  const medicos = await query('GET', 'usuarios', null, '?rol=eq.medico&select=id,nombre,apellidos,especialidad') || [];

  // Cálculos estadísticos
  const totalConsultas = consultas.length;
  const completadas = consultas.filter(c => c.estado === 'completada').length;
  const enAtencion = consultas.filter(c => c.estado === 'en_atencion').length;
  const pendientes = consultas.filter(c => c.estado === 'pendiente').length;

  // Por nivel de prioridad
  const leves = consultas.filter(c => c.nivel_prioridad === 'leve' || c.nivel_prioridad === 1).length;
  const moderados = consultas.filter(c => c.nivel_prioridad === 'moderado' || c.nivel_prioridad === 2).length;
  const graves = consultas.filter(c => c.nivel_prioridad === 'grave' || c.nivel_prioridad === 3).length;

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

  // Auditados TPA
  const auditadosAprobados = consultas.filter(c => c.estado_auditoria === 'aprobado').length;
  const auditadosPendientes = consultas.filter(c => c.estado_auditoria === 'pendiente' || !c.estado_auditoria).length;
  const auditadosRechazados = consultas.filter(c => c.estado_auditoria === 'rechazado').length;

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
    empresas: empresas.map(e => e.nombre),
    medicosActivos: medicos.map(m => `${m.nombre} ${m.apellidos} (${m.especialidad || 'General'})`)
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

module.exports = { responderConsultaKPIRAG, recopilarContextoKpis };
