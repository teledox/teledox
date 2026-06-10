const { query } = require('../src/services/supabase');
const { enviar } = require('../src/services/whatsapp');
const { alertar } = require('../src/services/telegram');
const { obtener, guardar } = require('../src/services/sesiones');
const { ENFERMEDADES } = require('../src/flows/flujo-cronicas');

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

    console.log(`Cron ejecutado: ${procesados} enviados, ${errores} errores`);
    return res.status(200).json({ ok: true, procesados, errores, timestamp: ahora.toISOString() });

  } catch (e) {
    console.error('Error cron:', e.message);
    await alertar(`🔴 <b>Error en cron de recordatorios</b>\n${e.message}`);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
