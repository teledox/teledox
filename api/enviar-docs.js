const { WA_TOKEN, WA_PHONE_ID, SUPABASE_URL, SUPABASE_KEY } = require('../src/config');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { paciente_id, consulta_id, telefono } = req.body || {};
  if (!paciente_id || !telefono) return res.status(400).json({ error: 'Faltan paciente_id o telefono' });

  try {
    // 1. Obtener documentos marcados como enviados de esta consulta
    const docsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/documentos?paciente_id=eq.${paciente_id}&consulta_id=eq.${consulta_id}&enviado_paciente=eq.true`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const docs = await docsRes.json();
    if (!docs?.length) return res.status(200).json({ ok: true, enviados: 0 });

    // Limpiar número: quitar todo excepto dígitos
    // Si empieza con 0 → Ecuador (reemplazar con 593)
    // Si ya tiene código de país → usar tal cual
    const soloDigitos = telefono.replace(/\D/g, '');
    const numero = soloDigitos.startsWith('0') ? '593' + soloDigitos.slice(1) : soloDigitos;
    console.log(`[enviar-docs] Enviando a paciente_id=${paciente_id}, telefono original="${telefono}" → número WhatsApp="${numero}"`);

    let enviados = 0;
    const errores = [];
    for (const doc of docs) {
      // 2. Generar URL firmada (válida 1 hora)
      const signRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/sign/documentos-pacientes/${doc.storage_path}`,
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ expiresIn: 3600 })
        }
      );
      const signData = await signRes.json();
      if (!signRes.ok || !signData.signedURL) {
        console.error(`[enviar-docs] Error firmando URL de ${doc.tipo} (${doc.storage_path}):`, JSON.stringify(signData));
        errores.push({ tipo: doc.tipo, status: signRes.status, detalle: { error: { message: signData.message || signData.error || 'No se pudo generar el enlace firmado del documento' } } });
        continue;
      }
      const urlFirmada = `${SUPABASE_URL}/storage/v1${signData.signedURL}`;

      const nombreDoc = {
        receta: 'Receta Médica',
        certificado: 'Certificado Médico',
        pedido_laboratorio: 'Pedido de Laboratorio',
        historia_clinica: 'Historia Clínica',
        interconsulta: 'Interconsulta'
      }[doc.tipo] || doc.tipo;

      // 3. Enviar por WhatsApp como documento
      const waRes = await fetch(`https://graph.facebook.com/v25.0/${WA_PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numero,
          type: 'document',
          document: {
            link: urlFirmada,
            caption: `📄 ${nombreDoc} — MediLyft`,
            filename: `${doc.tipo}.pdf`
          }
        })
      });

      const waData = await waRes.json();
      if (!waRes.ok) {
        console.error(`[enviar-docs] Error WhatsApp ${doc.tipo}:`, JSON.stringify(waData));
        errores.push({ tipo: doc.tipo, status: waRes.status, detalle: waData });
      } else {
        enviados++;
      }
    }

    return res.status(200).json({ ok: true, enviados, numero, errores: errores.length ? errores : undefined });
  } catch (err) {
    console.error('[enviar-docs]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
