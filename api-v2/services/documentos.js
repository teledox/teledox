const { SUPABASE_URL, SUPABASE_KEY } = require('../config');
const { query } = require('./supabase');

const BUCKET = 'documentos-pacientes';

async function subirPDF(paciente_id, tipo, pdfBytes) {
  const fecha = new Date().toISOString().split('T')[0];
  const path = `${paciente_id}/${tipo}_${fecha}.pdf`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true'
    },
    body: pdfBytes
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage upload failed: ${err}`);
  }

  return path;
}

async function registrarDocumento(paciente_id, consulta_id, tipo, storage_path) {
  await query('POST', 'documentos', {
    paciente_id,
    consulta_id,
    tipo,
    storage_path,
    enviado_paciente: false,
    created_at: new Date().toISOString()
  });
}

module.exports = { subirPDF, registrarDocumento };
