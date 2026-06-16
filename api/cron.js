const { query } = require('../src/services/supabase');
const { enviar } = require('../src/services/whatsapp');
const { alertar } = require('../src/services/telegram');
const { obtener, guardar } = require('../src/services/sesiones');
const { ENFERMEDADES } = require('../src/flows/flujo-cronicas');
const { enviarRecordatorioLab } = require('../src/services/seguimientoLaboratorio');
const { procesarTracking: _procesarTracking } = require('../src/flows/flujo-tracking');

// Ecuador es UTC-5 sin horario de verano.
// Convierte una fecha UTC al día de semana y hora local ecuatoriana.
const OFFSET_EC = -5;
function horaEC(date) { return (date.getUTCHours() + 24 + OFFSET_EC) % 24; }
function diaEC(date) {
  const h = date.getUTCHours() + OFFSET_EC;
  return (date.getUTCDay() + 7 + (h < 0 ? -1 : 0)) % 7;
}

// Dado un momento UTC, avanza hora a hora hasta encontrar un slot válido
// según el rango horario y días activos del caso. Máximo 7 días de búsqueda.
function siguienteSlotValido(desde, horarioInicio, horarioFin, diasActivos) {
  let t = new Date(desde);
  t.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 7; i++) {
    if (diasActivos.includes(diaEC(t)) && horaEC(t) >= horarioInicio && horaEC(t) < horarioFin) return t;
    t = new Date(t.getTime() + 3600000);
  }
  return desde; // fallback: sin slot válido en 7 días, usar original
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const auth = req.headers.authorization || '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send('Unauthorized');
  }

  const ahora = new Date();
  let procesados = 0;
  let errores = 0;

  try {
    const recordatorios = await query('GET', 'recordatorios', null,
      `?activo=eq.true&fecha_proximo=lte.${ahora.toISOString()}&fecha_fin=gte.${ahora.toISOString()}&select=*,pacientes(nombre,apellidos,telefono)`
    );

    for (const r of recordatorios || []) {
      try {
        // Usar siempre el teléfono actual del paciente desde la BD
        // Garantiza que en consultas de call center el mensaje llegue al paciente, no al operador
        const telefonoPaciente = r.pacientes?.telefono;
        if (!telefonoPaciente) continue;
        const soloDigRec = String(telefonoPaciente).replace(/\D/g, '');
        if (!soloDigRec || soloDigRec.length < 7) continue;
        const telefono = `whatsapp:+${soloDigRec.startsWith('0') ? '593' + soloDigRec.slice(1) : soloDigRec}`;

        const paciente = r.pacientes || {};
        let mensaje = '';

        if (r.tipo === 'medicamento') {
          mensaje = `💊 *Recordatorio MediLyft*\n\nHola ${paciente.nombre || ''}! Es hora de tomar su medicamento:\n\n*${r.medicamento}*\n${r.dosis ? `Dosis: ${r.dosis}` : ''}\n\n¿Ya tomó su medicamento?\n\nResponda *Sí* o *No*`;
        } else if (r.tipo === 'fin_tratamiento') {
          mensaje = `🏥 *Seguimiento MediLyft*\n\nHola ${paciente.nombre || ''}! Su tratamiento con *${r.medicamento}* ha finalizado.\n\n¿Cómo se siente ahora?\n\n1️⃣ Me siento mejor\n2️⃣ Mejoré pero aún tengo síntomas\n3️⃣ No mejoré o me siento peor\n\nResponda con el número de su opción.`;
        }

        if (!mensaje) continue;

        await enviar(telefono, mensaje);

        await query('POST', 'seguimiento_respuestas', {
          recordatorio_id: r.id,
          paciente_id: r.paciente_id,
          receta_id: r.receta_id,
          consulta_id: r.consulta_id || null,
          pregunta: mensaje
        });

        const proximoEnvio = new Date(ahora.getTime() + r.frecuencia_horas * 3600000);

        if (proximoEnvio <= new Date(r.fecha_fin)) {
          await query('PATCH', 'recordatorios', {
            fecha_proximo: proximoEnvio.toISOString()
          }, `?id=eq.${r.id}`);
        } else {
          await query('PATCH', 'recordatorios', { activo: false }, `?id=eq.${r.id}`);

          if (r.tipo === 'medicamento') {
            await query('POST', 'recordatorios', {
              receta_id: r.receta_id,
              paciente_id: r.paciente_id,
              consulta_id: r.consulta_id || null,
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
      } catch (e) {
        console.error('Error procesando recordatorio:', r.id, e.message);
        errores++;
      }
    }

    // Chequeo proactivo diario de enfermedades crónicas
    const cronicas = await query('GET', 'enfermedades_cronicas', null,
      `?activo=eq.true&or=(proximo_seguimiento.is.null,proximo_seguimiento.lte.${ahora.toISOString()})&select=*,pacientes(nombre,apellidos,telefono)`
    );

    for (const c of cronicas || []) {
      try {
        const telefono = c.pacientes?.telefono;
        if (!telefono) continue;

        const enfDef = ENFERMEDADES[c.enfermedad];
        if (!enfDef) continue;

        // No interrumpir si el paciente ya está en una conversación activa
        const sesion = await obtener(telefono);
        if (sesion && sesion.paso !== 0) continue;

        const paciente = c.pacientes || {};
        const primeraPregunta = enfDef.pasos[0];
        const mensaje = `🩺 *Seguimiento MediLyft — ${enfDef.nombre}*\n\nHola ${paciente.nombre || ''}! Es hora de su control diario.\n\n${primeraPregunta.pregunta}`;

        await enviar(telefono, mensaje);

        await guardar(telefono, 200, {
          enfermedad_key: c.enfermedad,
          enfermedad_id: c.id,
          paciente_id: c.paciente_id,
          paso_cronico: 1
        });

        const proximoSeguimiento = new Date(ahora.getTime() + (c.frecuencia_horas || 24) * 3600000);
        await query('PATCH', 'enfermedades_cronicas', {
          ultima_consulta: ahora.toISOString(),
          proximo_seguimiento: proximoSeguimiento.toISOString()
        }, `?id=eq.${c.id}`);

        procesados++;
      } catch (e) {
        console.error('Error procesando crónica:', c.id, e.message);
        errores++;
      }
    }

    // Seguimiento de exámenes de laboratorio (48h, día 3, día 5, día 7)
    const seguimientosLab = await query('GET', 'seguimiento_laboratorio', null,
      `?activo=eq.true&proximo_envio=lte.${ahora.toISOString()}&select=*,pacientes(nombre,apellidos,telefono)`
    );

    for (const s of seguimientosLab || []) {
      try {
        if (!s.pacientes?.telefono) continue;
        await enviarRecordatorioLab(s, s.pacientes);
        procesados++;
      } catch (e) {
        console.error('Error procesando seguimiento de laboratorio:', s.id, e.message);
        errores++;
      }
    }

    // Seguimiento tracking externo (empresas médicas)
    const trackingCasos = await query('GET', 'tracking_casos', null,
      `?estado=eq.activo&or=(proximo_seguimiento.is.null,proximo_seguimiento.lte.${ahora.toISOString()})`
    );

    for (const c of trackingCasos || []) {
      try {
        const telefono = c.telefono;
        if (!telefono) continue;

        // Alta automática si se agotó la duración definida
        if (c.duracion_dias) {
          const inicio = new Date(c.created_at + (c.created_at.endsWith('Z') ? '' : 'Z'));
          const diasTranscurridos = (ahora - inicio) / 86400000;
          if (diasTranscurridos >= c.duracion_dias) {
            await query('PATCH', 'tracking_casos', { estado: 'alta' }, `?id=eq.${c.id}`);
            procesados++;
            continue;
          }
        }

        const sesion = await obtener(telefono);
        if (sesion && sesion.paso !== 0) continue;

        const saludo = c.paciente_nombre ? `Hola ${c.paciente_nombre}!` : '¡Hola!';
        const mensaje = `🩺 *Seguimiento MediLyft*\n\n${saludo} Hora de tu reporte diario.\n\n📋 Diagnóstico: ${c.diagnostico || '—'}\n\n¿Cómo te sientes hoy?\n\n1️⃣ Muy mal\n2️⃣ Mal\n3️⃣ Regular\n4️⃣ Bien\n5️⃣ Muy bien`;

        await enviar(telefono, mensaje);

        await guardar(telefono, 400, {
          tipo: 'bienestar',
          caso_id: c.id,
          empresa_id: c.empresa_id,
          paciente_nombre: c.paciente_nombre,
          diagnostico: c.diagnostico
        });

        const rawNext      = new Date(ahora.getTime() + (c.frecuencia_horas || 24) * 3600000);
        const horIn        = c.horario_inicio ?? 8;
        const horFin       = c.horario_fin    ?? 21;
        const dias         = Array.isArray(c.dias_activos) && c.dias_activos.length ? c.dias_activos : [1,2,3,4,5,6];
        const proximoSeguimiento = siguienteSlotValido(rawNext, horIn, horFin, dias);
        await query('PATCH', 'tracking_casos', {
          proximo_seguimiento: proximoSeguimiento.toISOString()
        }, `?id=eq.${c.id}`);

        procesados++;
      } catch (e) {
        console.error('Error procesando tracking caso:', c.id, e.message);
        errores++;
      }
    }

    // Recordatorios de medicación — independientes del chequeo de bienestar
    // Cada med tiene { nombre, dosis, hora } donde hora es entero 0-23 (Ecuador local).
    // meds_recordatorios JSONB guarda { "h8": "2026-06-15T13:00:00Z", ... } para deduplicar.
    const horaActualEC = horaEC(ahora);
    const casosConMeds = await query('GET', 'tracking_casos', null, `?estado=eq.activo`);

    for (const c of casosConMeds || []) {
      try {
        const meds = Array.isArray(c.medicamentos) ? c.medicamentos : [];
        const medsAhora = meds.filter(m => m.hora === horaActualEC);
        if (!medsAhora.length) continue;

        const tel = c.telefono;
        if (!tel) continue;

        // Deduplicar: saltear si ya enviamos en las últimas 20h
        const medRec = c.meds_recordatorios || {};
        const medKey = `h${horaActualEC}`;
        if (medRec[medKey]) {
          const diff = ahora - new Date(medRec[medKey] + (medRec[medKey].endsWith('Z') ? '' : 'Z'));
          if (diff < 20 * 3600000) continue;
        }

        // No interrumpir sesión activa
        const sesionMed = await obtener(tel);
        if (sesionMed && sesionMed.paso !== 0) continue;

        const saludo = c.paciente_nombre ? `Hola ${c.paciente_nombre}!` : '¡Hola!';
        const lista  = medsAhora.map(m => `• ${m.nombre}${m.dosis ? ` ${m.dosis}` : ''}`).join('\n');
        const plural = medsAhora.length > 1 ? 'los' : 'lo';
        const msgMed = `💊 *Recordatorio de medicación*\n\n${saludo}\n\nEs hora de tomar:\n${lista}\n\n¿Ya ${plural} tomó?\n\n1️⃣ Sí\n2️⃣ No`;

        await enviar(tel, msgMed);

        await guardar(tel, 400, {
          tipo: 'med_reminder',
          caso_id: c.id,
          empresa_id: c.empresa_id,
          paciente_nombre: c.paciente_nombre,
          medicamentos_ahora: medsAhora
        });

        // Registrar timestamp para deduplicación en próxima ejecución
        await query('PATCH', 'tracking_casos',
          { meds_recordatorios: { ...medRec, [medKey]: ahora.toISOString() } },
          `?id=eq.${c.id}`
        );

        procesados++;
      } catch (e) {
        console.error('Error en recordatorio med tracking:', c.id, e.message);
        errores++;
      }
    }

    console.log(`Cron ejecutado: ${procesados} enviados, ${errores} errores`);
    return res.status(200).json({ ok: true, procesados, errores, timestamp: ahora.toISOString() });

  } catch (e) {
    console.error('Error cron:', e.message);
    await alertar(`🔴 <b>Error en cron de recordatorios</b>\n${e.message}`);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
