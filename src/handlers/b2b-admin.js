/**
 * api/b2b-admin.js -> src/handlers/b2b-admin.js
 * Operaciones admin B2B, Auditoría TPA y Chatbot RAG IA.
 * Actions: 'codigo' | 'empleados' | 'auditoria_listar' | 'auditoria_dictamen' | 'rag_kpi'
 */

const SUPA_URL         = process.env.SUPABASE_URL;
const SUPA_SERVICE_KEY = process.env.SUPABASE_KEY;
const { verificarUsuario } = require('../services/authVerify');
const { listarConsultasAuditoria, registrarDictamenAuditoria } = require('../services/auditoriaTPA');
const { responderConsultaKPIRAG } = require('../services/geminiRAG');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, action, empresa_id, codigo, cedulas, estado_auditoria, consulta_id, notas_auditoria, pregunta } = req.body || {};

  try {
    // 3. Chatbot IA RAG — Consulta de KPIs en lenguaje natural (Público para Demos / Pitch)
    if (action === 'rag_kpi') {
      if (!pregunta || !pregunta.trim()) {
        return res.status(400).json({ error: 'Falta pregunta' });
      }
      const resultadoRAG = await responderConsultaKPIRAG(pregunta, empresa_id);
      return res.status(200).json({ ok: true, ...resultadoRAG });
    }

    // 4. Simulador WhatsApp Web — Procesa mensajes a través del flujo de consulta real (Público para Demos)
    if (action === 'simular_webhook') {
      const { obtener, guardar } = require('../services/sesiones');
      const { procesarPaso } = require('../flows/flujo-consulta');
      const { clasificarSintomas } = require('../utils/validaciones');
      const { buscarPorCedula, crear: crearPaciente } = require('../services/pacientes');

      const tel = req.body.telefono || '593999999999';
      const msgTexto = (req.body.mensaje || '').trim();

      // Asegurar que el paciente Verónica Ruiz existe con un UUID válido en Supabase
      let paciente = await buscarPorCedula('1701234567').catch(() => null);
      if (!paciente) {
        paciente = await crearPaciente({
          cedula: '1701234567',
          nombre: 'Verónica',
          apellidos: 'Ruiz',
          telefono: tel,
          correo: 'veronica.ruiz@mawdy.com',
          lugar_residencia: 'Quito',
          sexo: 'F',
          edad: '42'
        }).catch(() => null);
      }

      let sesion = await obtener(tel).catch(() => null);
      let pasoActual = sesion?.paso || 'sintomas';
      let datosActuales = sesion?.datos || {
        cedula: '1701234567',
        paciente_id: paciente?.id || null,
        nombre_paciente: 'Verónica Ruiz',
        nombreCompleto: 'Verónica Ruiz',
        empresa: 'Mawdy TPA',
        empresa_id: paciente?.empresa_id || '9069d2d4-3ff3-4b68-80f0-c20e2ef5b0e5',
        alergias: 'Ibuprofeno',
        telefono: tel,
        correo: 'veronica.ruiz@mawdy.com',
        lugar_residencia: 'Quito'
      };

      const result = await procesarPaso(pasoActual, msgTexto, datosActuales, tel, 'Verónica Ruiz', {});
      await guardar(tel, result.paso || pasoActual, result.datos || datosActuales).catch(() => {});

      // Calcular Health Score en vivo según triaje real
      let healthScore = 76;
      let penalizacionText = '-0 pts';
      let prioridad = 'Moderado';

      if (msgTexto) {
        const triaje = clasificarSintomas(msgTexto);
        if (triaje.nivel === 'grave' || /fiebre|emergencia|inconsciente|pecho/i.test(msgTexto)) {
          healthScore = 45;
          penalizacionText = '-31 pts (Alerta Aguda)';
          prioridad = 'Grave';
        } else if (triaje.nivel === 'moderado' || /cabeza|cefalea|dolor|malestar/i.test(msgTexto)) {
          healthScore = 61;
          penalizacionText = '-15 pts (Síndrome Febril)';
          prioridad = 'Moderado';
        } else {
          healthScore = 72;
          penalizacionText = '-4 pts (Sintomatología Leve)';
          prioridad = 'Leve';
        }
      }

      return res.status(200).json({
        ok: true,
        respuesta: result.respuesta || '⚡ Caso registrado y derivado a telemedicina.',
        paso: result.paso,
        botones: result.botones || null,
        datos: result.datos,
        healthScore,
        penalizacionText,
        prioridad
      });
    }

    // Para las acciones administrativas de control, verificar permisos: 'admin', 'auditor' o 'medico'
    const user = await verificarUsuario(token, ['admin', 'auditor', 'medico']);

    // 1. Auditoría TPA — Listar consultas
    if (action === 'auditoria_listar') {
      const consultas = await listarConsultasAuditoria({ empresa_id, estado_auditoria });
      return res.status(200).json({ ok: true, consultas });
    }

    // 2. Auditoría TPA — Dictaminar pertinentes / observados / rechazados
    if (action === 'auditoria_dictamen') {
      const resultado = await registrarDictamenAuditoria({
        consulta_id,
        auditor_id: user.id,
        estado_auditoria,
        notas_auditoria
      });
      return res.status(200).json({ ok: true, resultado });
    }

    // Para las acciones de gestión B2B clásicas ('codigo', 'empleados'), requerir empresa_id
    if (!empresa_id) return res.status(400).json({ error: 'Falta empresa_id' });

    if (action === 'empleados') {
      if (!Array.isArray(cedulas) || !cedulas.length)
        return res.status(400).json({ error: 'Falta cedulas[]' });

      const rows = cedulas.map(c => ({ empresa_id, cedula: String(c).trim() }));
      const r = await fetch(
        `${SUPA_URL}/rest/v1/empleados_b2b?on_conflict=empresa_id%2Ccedula`,
        {
          method: 'POST',
          headers: {
            'apikey':        SUPA_SERVICE_KEY,
            'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
            'Content-Type':  'application/json',
            'Prefer':        'resolution=ignore-duplicates,return=representation'
          },
          body: JSON.stringify(rows)
        }
      );
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `HTTP ${r.status}`); }
      const insertadas = await r.json().catch(() => []);
      return res.status(200).json({ ok: true, insertadas: insertadas.length, total: cedulas.length });
    }

    // action === 'codigo' (default)
    const r = await fetch(`${SUPA_URL}/rest/v1/clientes_b2b?id=eq.${empresa_id}`, {
      method: 'PATCH',
      headers: {
        'apikey':        SUPA_SERVICE_KEY,
        'Authorization': `Bearer ${SUPA_SERVICE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal'
      },
      body: JSON.stringify({ codigo_acceso: codigo || null })
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `HTTP ${r.status}`); }
    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('[b2b-admin]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
