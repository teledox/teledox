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

    // 4. Simulador WhatsApp Web — Motor de triaje autónomo para demos (sin llamadas reales a DB)
    if (action === 'simular_webhook') {
      const msgTexto = (req.body.mensaje || '').trim();
      const tel      = req.body.telefono || '593999999999';

      // Recuperar sesión demo desde Supabase (sesiones_bot tabla, sólo lectura)
      // Si falla, iniciamos desde cero sin bloquear
      let sesionDemo = null;
      try {
        const { query } = require('../services/supabase');
        const rows = await query('GET', 'sesiones_bot', null, `?telefono=eq.${encodeURIComponent(tel)}`);
        sesionDemo = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      } catch (_) {}

      const pasoActual    = sesionDemo?.paso || 'bienvenida';
      const datosActuales = sesionDemo?.datos || {};

      // Motor de triaje autónomo — sin llamadas a Supabase, sin alertas Telegram
      let respuesta     = '';
      let nuevoPaso     = pasoActual;
      let botones       = null;
      let healthScore   = 76;
      let penalizacion  = '−0 pts';
      let prioridad     = 'Normal';

      // Clasificador de síntomas local (replica validaciones.js pero sin importar el módulo)
      function clasificarLocal(texto) {
        const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const graves = ['pecho','no respiro','me ahogo','convulsion','derrame','infarto','hemorragia','sangrado','ahogo','infarto'];
        const medios = ['fiebre','vomito','diarrea','desmayo','mareo','palpitacion','fractura','fractura','presion alta'];
        if (graves.some(s => t.includes(s))) return 3;
        if (medios.some(s => t.includes(s))) return 2;
        return 1;
      }

      // Guardar sesión demo en Supabase (sin lanzar errores)
      async function guardarSesionDemo(paso, datos) {
        try {
          const { query } = require('../services/supabase');
          if (sesionDemo) {
            await query('PATCH', 'sesiones_bot', { paso, datos, updated_at: new Date().toISOString() }, `?telefono=eq.${encodeURIComponent(tel)}`);
          } else {
            await query('POST', 'sesiones_bot', { telefono: tel, paso, datos });
            sesionDemo = { paso, datos }; // marcar como creado
          }
        } catch (_) {}
      }

      // ────────────── ESTADO: bienvenida ──────────────
      if (pasoActual === 'bienvenida' || pasoActual === 'inicio') {
        respuesta = `✅ Síntomas recibidos. Estamos evaluando su caso.\n\nNivel de prioridad: *Moderado*\n\nUn médico le atenderá en breve. ¿Tiene alguna alergia conocida?`;
        nuevoPaso = 'alergias';

      // ────────────── ESTADO: sintomas (primer mensaje del paciente) ──────────────
      } else if (pasoActual === 'sintomas' || pasoActual === 'bienvenida') {
        const nivel = clasificarLocal(msgTexto);
        if (nivel === 3) {
          healthScore  = 28; penalizacion = '−48 pts (Emergencia)'; prioridad = '🚨 Emergencia';
          respuesta    = `🚨 *EMERGENCIA MÉDICA*\n\nSus síntomas indican riesgo vital. Hemos alertado a nuestro equipo de forma *prioritaria*.\n\n• Acuda al hospital más cercano\n• Llame al *911*\n\n¿Necesita que le llamemos ahora?`;
          botones      = [{ id: 'llamar', titulo: '📞 Llamar ahora' }, { id: 'hospital', titulo: '🏥 Ir al hospital' }];
          nuevoPaso    = 'emergencia';
        } else if (nivel === 2) {
          healthScore  = 52; penalizacion = '−24 pts (Síndrome Agudo)'; prioridad = '⚠️ Urgente';
          respuesta    = `⚠️ Sus síntomas requieren *atención urgente*.\n\nHemos notificado a un médico. Le atenderemos en los próximos *15 minutos*.\n\n¿Tiene alguna alergia conocida a medicamentos?`;
          nuevoPaso    = 'alergias';
        } else {
          healthScore  = 68; penalizacion = '−8 pts (Consulta Programada)'; prioridad = '🟡 Leve';
          respuesta    = `✅ Sus síntomas pueden atenderse por *teleconsulta*.\n\nHemos registrado su caso. Un médico le atenderá hoy.\n\n¿Tiene alguna alergia conocida a medicamentos?`;
          nuevoPaso    = 'alergias';
        }

      // ────────────── ESTADO: alergias ──────────────
      } else if (pasoActual === 'alergias') {
        datosActuales.alergias = msgTexto;
        healthScore = 72; penalizacion = '+4 pts (Historial Actualizado)'; prioridad = '🟡 En seguimiento';
        respuesta   = `✅ Registrado. *Alergias:* ${msgTexto}\n\n¿Toma algún medicamento habitualmente?`;
        nuevoPaso   = 'medicamentos';

      // ────────────── ESTADO: medicamentos ──────────────
      } else if (pasoActual === 'medicamentos') {
        datosActuales.medicamentos = msgTexto;
        healthScore = 76; penalizacion = '+4 pts (Perfil Completo)'; prioridad = '🟢 Controlado';
        respuesta   = `📋 *Resumen del caso:*\n\n👤 *Paciente:* Verónica Ruiz\n🏢 *Empresa:* Mawdy TPA\n💊 *Medicamentos:* ${msgTexto}\n🚨 *Alergias:* ${datosActuales.alergias || 'Ninguna'}\n\n✅ Su consulta ha sido agendada. Un médico le contactará en breve.\n\n¿Desea recibir la confirmación por correo?`;
        botones     = [{ id: 'si_correo', titulo: '📧 Sí, enviar' }, { id: 'no_correo', titulo: '❌ No, gracias' }];
        nuevoPaso   = 'confirmacion';

      // ────────────── ESTADO: confirmacion ──────────────
      } else if (pasoActual === 'confirmacion') {
        healthScore = 80; penalizacion = '+4 pts (Confirmado)'; prioridad = '🟢 Agendado';
        respuesta   = `✅ *¡Consulta confirmada!*\n\n📅 Su cita telemédica ha sido registrada.\n🩺 El médico de Mawdy TPA le contactará en los próximos 15 minutos.\n\n_MediLyft — Salud empresarial inteligente_ 💙`;
        nuevoPaso   = 'bienvenida'; // reset para próxima demo

      } else {
        // Cualquier estado no reconocido → reiniciar con pregunta de síntomas
        respuesta = `👋 Hola de nuevo, *Verónica*. ¿Cuáles son sus síntomas hoy?`;
        nuevoPaso = 'sintomas';
      }

      // Persistir nueva sesión (sin bloquear respuesta si falla)
      await guardarSesionDemo(nuevoPaso, { ...datosActuales, sintomas: msgTexto, paso: nuevoPaso });

      return res.status(200).json({
        ok: true,
        respuesta,
        paso: nuevoPaso,
        botones,
        datos: { ...datosActuales, sintomas: msgTexto },
        healthScore,
        penalizacionText: penalizacion,
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
