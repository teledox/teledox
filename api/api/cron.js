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

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const ahora = new Date();
  let procesados = 0;
  let errores = 0;

  try {
    // Obtener recordatorios activos que ya deben enviarse
    const recordatorios = await supa('GET', 'recordatorios', null,
      `?activo=eq.true&fecha_proximo=lte.${ahora.toISOString()}&fecha_fin=gte.${ahora.toISOString()}&select=*,pacientes(nombre,apellidos,telefono)`
    );

    for (const r of recordatorios || []) {
      try {
        const paciente = r.pacientes || {};
        const telefono = r.telefono;
        if (!telefono) continue;

        let mensaje = '';

        if (r.tipo === 'medicamento') {
          mensaje = `💊 *Recordatorio MediLyft*\n\nHola ${paciente.nombre||''}! Es hora de tomar su medicamento:\n\n*${r.medicamento}*\n${r.dosis ? `Dosis: ${r.dosis}` : ''}\n\n¿Ya tomó su medicamento?\n\nResponda *Sí* o *No*`;
        } else if (r.tipo === 'fin_tratamiento') {
          mensaje = `🏥 *Seguimiento MediLyft*\n\nHola ${paciente.nombre||''}! Su tratamiento con *${r.medicamento}* ha finalizado.\n\n¿Cómo se siente ahora?\n\n1️⃣ Me siento mejor, me curé\n2️⃣ Mejoré pero aún tengo síntomas\n3️⃣ No mejoré o me siento peor\n\nResponda con el número de su opción.`;
        }

        if (mensaje) {
          await enviarWhatsApp(telefono, mensaje);

          // Registrar recordatorio enviado
          await supa('POST', 'seguimiento_respuestas', {
            recordatorio_id: r.id,
            paciente_id: r.paciente_id,
            receta_id: r.receta_id,
            pregunta: mensaje
          });

          // Calcular próximo envío
          const proximoEnvio = new Date(ahora.getTime() + r.frecuencia_horas * 3600000);

          if (proximoEnvio <= new Date(r.fecha_fin)) {
            // Actualizar fecha del próximo recordatorio
            await supa('PATCH', 'recordatorios', {
              fecha_proximo: proximoEnvio.toISOString()
            }, `?id=eq.${r.id}`);
          } else {
            // El tratamiento terminó — desactivar recordatorio de medicamento
            // y activar recordatorio de evaluación final si es tipo medicamento
            await supa('PATCH', 'recordatorios', { activo: false }, `?id=eq.${r.id}`);

            if (r.tipo === 'medicamento') {
              // Crear recordatorio de evaluación final en 2 horas
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
        console.error('Error procesando recordatorio:', e.message);
        errores++;
      }
    }

    // Procesar respuestas de seguimiento pendientes en sesiones_bot
    // Buscar pacientes en paso 99 que tienen seguimiento activo
    const sesiones = await supa('GET', 'sesiones_bot', null, `?paso=eq.50`);

    console.log(`Cron ejecutado: ${procesados} recordatorios enviados, ${errores} errores`);

    return res.status(200).json({
      ok: true,
      procesados,
      errores,
      timestamp: ahora.toISOString()
    });

  } catch (e) {
    console.error('Error cron:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
