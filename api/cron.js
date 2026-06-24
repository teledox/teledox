const { SUPABASE_URL, SUPABASE_KEY } = require('../src/config');
const { query } = require('../src/services/supabase');
const { enviar, enviarTemplate, enviarBotones, enviarLista } = require('../src/services/whatsapp');
const { alertar } = require('../src/services/telegram');
const { obtener, guardar } = require('../src/services/sesiones');
const { ENFERMEDADES } = require('../src/flows/flujo-cronicas');
const { enviarRecordatorioLab } = require('../src/services/seguimientoLaboratorio');
const { procesarTracking: _procesarTracking } = require('../src/flows/flujo-tracking');
const { getMsgPregunta: getPsiPregunta } = require('../src/flows/flujo-psicosocial');

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

// Rama de prueba: POST /api/cron?caso_id=X desde el panel (auth JWT)
async function handleTestReminder(req, res) {
  const jwt = (req.headers.authorization || '').replace('Bearer ', '');
  if (!jwt || jwt === SUPABASE_KEY) return res.status(401).json({ error: 'Sesión inválida' });
  const authCheck = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${jwt}` }
  });
  if (!authCheck.ok) return res.status(401).json({ error: 'Sesión inválida — inicia sesión en el panel' });

  const caso_id = req.query.caso_id;
  const casos = await query('GET', 'tracking_casos', null, `?id=eq.${caso_id}`);
  const c = Array.isArray(casos) && casos[0];
  if (!c)              return res.status(404).json({ error: 'Caso no encontrado' });
  if (!c.activado)     return res.status(400).json({ error: 'El caso no está activado aún' });
  if (c.estado !== 'activo') return res.status(400).json({ error: `El caso está ${c.estado}, no activo` });
  if (!c.telefono)     return res.status(400).json({ error: 'El caso no tiene teléfono registrado' });

  const ahora = new Date();
  const saludo = c.paciente_nombre ? `Hola ${c.paciente_nombre}!` : '¡Hola!';
  await enviarLista(
    c.telefono,
    `🩺 *Seguimiento MediLyft*\n\n${saludo} Hora de tu reporte diario.\n\n📋 Diagnóstico: ${c.diagnostico || '—'}\n\n¿Cómo te sientes hoy?`,
    [{ titulo: 'Bienestar de hoy', filas: [
      { id: '1', titulo: 'Muy mal',  descripcion: '😢 Me siento muy mal' },
      { id: '2', titulo: 'Mal',      descripcion: '😞 Me siento mal' },
      { id: '3', titulo: 'Regular',  descripcion: '😐 Más o menos' },
      { id: '4', titulo: 'Bien',     descripcion: '🙂 Me siento bien' },
      { id: '5', titulo: 'Muy bien', descripcion: '😊 Excelente!' },
    ]}],
    'Seleccionar'
  );
  // Siempre sobreescribir la sesión en modo prueba (aunque haya una activa)
  await guardar(c.telefono, 400, {
    tipo: 'bienestar', caso_id: c.id, empresa_id: c.empresa_id,
    paciente_nombre: c.paciente_nombre, diagnostico: c.diagnostico,
    biometricos_activos: c.biometricos_activos || false, altura: c.altura_cm || null
  }, 'tracking');

  // Diferir proximo_seguimiento 2h para que el cron normal no interfiera durante la prueba
  await query('PATCH', 'tracking_casos', {
    proximo_seguimiento: new Date(ahora.getTime() + 2 * 3600000).toISOString(),
    meds_recordatorios:  {}
  }, `?id=eq.${c.id}`);

  return res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Rama de prueba desde el panel (JWT, no CRON_SECRET)
  if (req.method === 'POST' && req.query.caso_id) {
    return handleTestReminder(req, res);
  }

  const auth = req.headers.authorization || '';
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send('Unauthorized');
  }

  const ahora = new Date();
  let procesados = 0;
  let errores = 0;

  try {
    // Activar consultas que llegaron a su horario de apertura diferida
    await query('PATCH', 'consultas', { estado: 'pendiente' },
      `?estado=eq.pendiente_apertura&activada_at=lte.${ahora.toISOString()}`
    );

    // fecha_fin puede ser NULL (sin límite) — usar or() para incluir ambos casos
    const recordatorios = await query('GET', 'recordatorios', null,
      `?activo=eq.true&fecha_proximo=lte.${ahora.toISOString()}&or=(fecha_fin.is.null,fecha_fin.gte.${ahora.toISOString()})&select=*,pacientes(nombre,apellidos,telefono)`
    );

    for (const r of recordatorios || []) {
      try {
        // Usar siempre el teléfono actual del paciente desde la BD
        // Garantiza que en consultas de call center el mensaje llegue al paciente, no al operador
        const telefonoPaciente = r.pacientes?.telefono;
        if (!telefonoPaciente) continue;
        const soloDigRec = String(telefonoPaciente).replace(/\D/g, '');
        if (!soloDigRec || soloDigRec.length < 7) continue;
        // telefono → para enviar mensajes (WA Cloud API acepta dígitos puros)
        // telefonoSesion → clave de sesión, debe coincidir con msg.from del webhook
        const telefono       = `whatsapp:+${soloDigRec.startsWith('0') ? '593' + soloDigRec.slice(1) : soloDigRec}`;
        const telefonoSesion = soloDigRec.startsWith('0') ? '593' + soloDigRec.slice(1) : soloDigRec;

        const paciente = r.pacientes || {};

        if (r.tipo === 'medicamento') {
          const sesionMedRec = await obtener(telefonoSesion);
          if (sesionMedRec && sesionMedRec.paso !== 0) { procesados++; continue; }

          const textoMed = `💊 *Recordatorio MediLyft*\n\nHola ${paciente.nombre || ''}! Es hora de tomar su medicamento:\n\n*${r.medicamento}*\n${r.dosis ? `Dosis: ${r.dosis}` : ''}\n\n¿Ya lo tomó?`;

          await enviarBotones(telefono, textoMed, [
            { id: 'seg_med_si', titulo: '✅ Sí, ya lo tomé' },
            { id: 'seg_med_no', titulo: '❌ No todavía'    }
          ]);

          await query('POST', 'seguimiento_respuestas', {
            recordatorio_id: r.id,
            paciente_id:     r.paciente_id,
            receta_id:       r.receta_id,
            consulta_id:     r.consulta_id || null,
            pregunta:        textoMed
          });

          await guardar(telefonoSesion, 1, {
            recordatorio_id: r.id,
            paciente_id:     r.paciente_id,
            medicamento:     r.medicamento,
            dosis:           r.dosis || null,
            paciente_nombre: `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim()
          }, 'seg_med');

          const proximoEnvioMed = new Date(ahora.getTime() + r.frecuencia_horas * 3600000);
          const fdMed = r.fecha_fin ? new Date(/Z|[+-]\d\d:\d\d$/.test(r.fecha_fin) ? r.fecha_fin : r.fecha_fin + 'Z') : null;
          if (!fdMed || proximoEnvioMed <= fdMed) {
            await query('PATCH', 'recordatorios', { fecha_proximo: proximoEnvioMed.toISOString() }, `?id=eq.${r.id}`);
          } else {
            await query('PATCH', 'recordatorios', { activo: false }, `?id=eq.${r.id}`);
            await query('POST', 'recordatorios', {
              receta_id: r.receta_id, paciente_id: r.paciente_id,
              consulta_id: r.consulta_id || null, telefono: r.telefono,
              medicamento: r.medicamento, dosis: r.dosis,
              frecuencia_horas: 999,
              fecha_proximo: new Date(ahora.getTime() + 2 * 3600000).toISOString(),
              fecha_fin:     new Date(ahora.getTime() + 3 * 3600000).toISOString(),
              activo: true, tipo: 'fin_tratamiento'
            });
          }

          procesados++;
          continue;

        } else if (r.tipo === 'fin_tratamiento') {
          const sesionFinRec = await obtener(telefonoSesion);
          if (sesionFinRec && sesionFinRec.paso !== 0) { procesados++; continue; }

          const textoFin = `🏥 *Seguimiento MediLyft*\n\nHola ${paciente.nombre || ''}! Su tratamiento con *${r.medicamento}* ha finalizado.\n\n¿Cómo se siente ahora?`;

          await enviarBotones(telefono, textoFin, [
            { id: 'seg_fin_si',      titulo: '😊 Me siento mejor'  },
            { id: 'seg_fin_parcial', titulo: '😐 Sigo con síntomas' },
            { id: 'seg_fin_no',      titulo: '😟 No mejoré'         }
          ]);

          const srFin = await query('POST', 'seguimiento_respuestas', {
            recordatorio_id: r.id,
            paciente_id:     r.paciente_id,
            receta_id:       r.receta_id,
            consulta_id:     r.consulta_id || null,
            pregunta:        textoFin
          });
          const srFinId = Array.isArray(srFin) ? srFin[0]?.id : srFin?.id;

          await guardar(telefonoSesion, 1, {
            seguimiento_respuesta_id: srFinId,
            recordatorio_id:  r.id,
            paciente_id:      r.paciente_id,
            consulta_id:      r.consulta_id || null,
            medicamento:      r.medicamento,
            paciente_nombre:  `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim()
          }, 'seg_fin_trat');

          const proximoEnvioFin = new Date(ahora.getTime() + r.frecuencia_horas * 3600000);
          const fdFin = r.fecha_fin ? new Date(/Z|[+-]\d\d:\d\d$/.test(r.fecha_fin) ? r.fecha_fin : r.fecha_fin + 'Z') : null;
          if (!fdFin || proximoEnvioFin <= fdFin) {
            await query('PATCH', 'recordatorios', { fecha_proximo: proximoEnvioFin.toISOString() }, `?id=eq.${r.id}`);
          } else {
            await query('PATCH', 'recordatorios', { activo: false }, `?id=eq.${r.id}`);
          }

          procesados++;
          continue;

        } else if (r.tipo === 'bienestar') {
          const sesionBienRec = await obtener(telefonoSesion);
          if (sesionBienRec && sesionBienRec.paso !== 0) { procesados++; continue; }

          await enviarLista(
            telefono,
            `💙 *Seguimiento MediLyft*\n\nHola ${paciente.nombre || ''}! Tu médico quiere saber cómo estás hoy.`,
            [{ titulo: 'Bienestar de hoy', filas: [
              { id: '1', titulo: '⭐⭐⭐⭐⭐ Excelente', descripcion: 'Me siento muy bien' },
              { id: '2', titulo: '⭐⭐⭐⭐ Bien',        descripcion: 'Me siento bien' },
              { id: '3', titulo: '⭐⭐⭐ Regular',       descripcion: 'Más o menos' },
              { id: '4', titulo: '⭐⭐ Mal',            descripcion: 'Me siento mal' },
              { id: '5', titulo: '⭐ Muy mal',          descripcion: 'Necesito atención urgente' }
            ]}],
            'Seleccionar'
          );

          const srBien = await query('POST', 'seguimiento_respuestas', {
            recordatorio_id: r.id,
            paciente_id:     r.paciente_id,
            consulta_id:     r.consulta_id || null,
            tipo:            'bienestar',
            pregunta:        '¿Cómo te sientes hoy?'
          });
          const srBienId = Array.isArray(srBien) ? srBien[0]?.id : srBien?.id;

          await guardar(telefonoSesion, 1, {
            seguimiento_respuesta_id: srBienId,
            paciente_id:     r.paciente_id,
            consulta_id:     r.consulta_id || null,
            paciente_nombre: `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim()
          }, 'seg_bienestar');

          const proximoEnvioBienestar = new Date(ahora.getTime() + r.frecuencia_horas * 3600000);
          const _fdBienestar = r.fecha_fin ? new Date(/Z|[+-]\d\d:\d\d$/.test(r.fecha_fin) ? r.fecha_fin : r.fecha_fin + 'Z') : null;
          const puedeSeguirBienestar  = !_fdBienestar || _fdBienestar.getFullYear() >= 2090 || proximoEnvioBienestar <= _fdBienestar;
          if (puedeSeguirBienestar) {
            await query('PATCH', 'recordatorios', { fecha_proximo: proximoEnvioBienestar.toISOString() }, `?id=eq.${r.id}`);
          } else {
            await query('PATCH', 'recordatorios', { activo: false }, `?id=eq.${r.id}`);
          }
          procesados++;
          continue;
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
        }, 'cronicas');

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

        if (!c.activado) {
          // Primera vez — el paciente aún no activó el seguimiento.
          // Enviamos la plantilla aprobada (fuera de la ventana de 24h).
          // Los payloads de los botones se definen aquí, no en Meta.
          await enviarTemplate(
            telefono,
            'med_reminder',
            [c.diagnostico || '—'],
            ['hola', 'que_es_esto']
          );
          // Volver a intentar en 24h si el paciente no responde
          await query('PATCH', 'tracking_casos', {
            proximo_seguimiento: new Date(ahora.getTime() + 24 * 3600000).toISOString()
          }, `?id=eq.${c.id}`);
        } else {
          // Ya activado — la ventana de 24h debería estar abierta.
          // Enviamos el check-in diario como texto libre.
          const saludo = c.paciente_nombre ? `Hola ${c.paciente_nombre}!` : '¡Hola!';

          await enviarLista(
            telefono,
            `🩺 *Seguimiento MediLyft*\n\n${saludo} Hora de tu reporte diario.\n\n📋 Diagnóstico: ${c.diagnostico || '—'}\n\n¿Cómo te sientes hoy?`,
            [{ titulo: 'Bienestar de hoy', filas: [
              { id: '1', titulo: 'Muy mal',  descripcion: '😢 Me siento muy mal' },
              { id: '2', titulo: 'Mal',      descripcion: '😞 Me siento mal' },
              { id: '3', titulo: 'Regular',  descripcion: '😐 Más o menos' },
              { id: '4', titulo: 'Bien',     descripcion: '🙂 Me siento bien' },
              { id: '5', titulo: 'Muy bien', descripcion: '😊 Excelente!' },
            ]}],
            'Seleccionar'
          );

          await guardar(telefono, 400, {
            tipo: 'bienestar',
            caso_id: c.id,
            empresa_id: c.empresa_id,
            paciente_nombre: c.paciente_nombre,
            diagnostico: c.diagnostico,
            biometricos_activos: c.biometricos_activos || false,
            altura: c.altura_cm || null
          }, 'tracking');

          const rawNext = new Date(ahora.getTime() + (c.frecuencia_horas || 24) * 3600000);
          const horIn   = c.horario_inicio ?? 8;
          const horFin  = c.horario_fin    ?? 21;
          const dias    = Array.isArray(c.dias_activos) && c.dias_activos.length ? c.dias_activos : [1,2,3,4,5,6];
          const proximoSeguimiento = siguienteSlotValido(rawNext, horIn, horFin, dias);
          await query('PATCH', 'tracking_casos', {
            proximo_seguimiento: proximoSeguimiento.toISOString()
          }, `?id=eq.${c.id}`);
        }

        procesados++;
      } catch (e) {
        console.error('Error procesando tracking caso:', c.id, e.message);
        errores++;
      }
    }

    // Evaluación psicosocial MRL — trimestral, anónima, por caso
    const casosPsi = await query('GET', 'tracking_casos', null,
      `?estado=eq.activo&activado=eq.true&psicosocial_activo=eq.true&or=(proximo_psicosocial.is.null,proximo_psicosocial.lte.${ahora.toISOString()})`
    );

    for (const c of casosPsi || []) {
      try {
        const telefono = c.telefono;
        if (!telefono) continue;
        const sesion = await obtener(telefono);
        if (sesion && sesion.paso !== 0) continue;

        const msg1 = getPsiPregunta(1);
        await enviarLista(telefono, msg1.texto, msg1.secciones, msg1.botonTexto);
        await guardar(telefono, 1, {
          _flujo: 'psicosocial',
          caso_id: c.id,
          empresa_id: c.empresa_id,
          r: []
        }, 'psicosocial');

        // Programar próxima evaluación en 90 días
        await query('PATCH', 'tracking_casos', {
          proximo_psicosocial: new Date(ahora.getTime() + 90 * 86400000).toISOString()
        }, `?id=eq.${c.id}`);

        procesados++;
      } catch (e) {
        console.error('Error enviando psicosocial caso:', c.id, e.message);
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
        // Soporta hora_inicio + frecuencia_horas (nuevo) y hora legado (anterior)
        const medsAhora = meds.filter(m => {
          const horaIn  = m.hora_inicio ?? m.hora ?? 8;
          const freq    = m.frecuencia_horas || 24;
          let h = horaIn % 24;
          while (h < 24) { if (h === horaActualEC) return true; h += freq; }
          return false;
        });
        if (!medsAhora.length) continue;

        const tel = c.telefono;
        if (!tel) continue;

        // Deduplicar: saltear si ya enviamos en las últimas 20h
        const medRec = c.meds_recordatorios || {};
        // Clave por medicamento + hora para evitar colisiones entre meds distintos
        const medKey = `${medsAhora.map(m=>m.nombre).join('_').replace(/\s+/g,'').slice(0,20)}_h${horaActualEC}`;
        if (medRec[medKey]) {
          const diff = ahora - new Date(medRec[medKey] + (medRec[medKey].endsWith('Z') ? '' : 'Z'));
          if (diff < 20 * 3600000) continue;
        }

        // No interrumpir sesión activa
        const sesionMed = await obtener(tel);
        if (sesionMed && sesionMed.paso !== 0) continue;

        const saludo = c.paciente_nombre ? `Hola ${c.paciente_nombre}!` : '¡Hola!';
        const listaStr = medsAhora.map(m => `• ${m.nombre}${m.dosis ? ` ${m.dosis}` : ''}`).join('\n');
        const plural = medsAhora.length > 1 ? 'los' : 'lo';

        await enviarBotones(
          tel,
          `💊 *Recordatorio de medicación*\n\n${saludo}\n\nEs hora de tomar:\n${listaStr}\n\n¿Ya ${plural} tomó?`,
          [
            { id: '1', titulo: '✅ Sí, ya tomé' },
            { id: '2', titulo: '❌ No todavía' }
          ]
        );

        await guardar(tel, 400, {
          tipo: 'med_reminder',
          caso_id: c.id,
          empresa_id: c.empresa_id,
          paciente_nombre: c.paciente_nombre,
          medicamentos_ahora: medsAhora
        }, 'tracking');

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

    // Propuestas de consulta pendientes (médico activó desde el panel cuando bienestar ≥ 4)
    const propuestasCasos = await query('GET', 'tracking_casos', null,
      `?propuesta_pendiente=eq.true&activado=eq.true&estado=eq.activo`);

    for (const c of propuestasCasos || []) {
      try {
        const telefono = c.telefono;
        if (!telefono) continue;

        const sesion = await obtener(telefono);
        if (sesion && sesion.paso !== 0) continue;

        const saludo = c.paciente_nombre ? `Hola ${c.paciente_nombre}!` : '¡Hola!';
        await enviarBotones(
          telefono,
          `${saludo} 👋\n\nTu equipo médico quiere programar una *consulta de seguimiento* con MediLyft.\n\n¿Te interesa agendar?`,
          [
            { id: 'propuesta_consulta_si', titulo: '✅ Sí, me interesa' },
            { id: 'propuesta_consulta_no', titulo: '⏸ Ahora no' }
          ]
        );

        await query('PATCH', 'tracking_casos', {
          propuesta_pendiente:  false,
          propuesta_enviada_at: ahora.toISOString()
        }, `?id=eq.${c.id}`);

        procesados++;
      } catch (e) {
        console.error('Error procesando propuesta:', c.id, e.message);
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
