const { SUPABASE_URL, SUPABASE_KEY } = require('../src/config');

// Endpoint consolidado de firma electrónica (para no exceder el límite de
// funciones serverless del plan Hobby de Vercel). Combina 3 operaciones:
//   GET  ?id=...                                 -> verificar documento firmado
//   POST { usuario_id, firma_p12, firma_p12_info } -> guardar certificado .p12
//   POST { usuario_id, titular, tipo_documento }   -> registrar documento firmado
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') return verificarFirma(req, res);
  if (req.method === 'POST') {
    const body = req.body || {};
    if ('firma_p12' in body || 'firma_p12_info' in body) return guardarP12(req, res);
    return registrarFirma(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
};

async function guardarP12(req, res) {
  const { usuario_id, firma_p12, firma_p12_info } = req.body || {};
  if (!usuario_id) return res.status(400).json({ error: 'Falta usuario_id' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?id=eq.${usuario_id}`,
      {
        method: 'PATCH',
        headers: {
          apikey:          SUPABASE_KEY,
          Authorization:   `Bearer ${SUPABASE_KEY}`,
          'Content-Type':  'application/json',
          Prefer:          'return=minimal'
        },
        body: JSON.stringify({
          firma_p12:      firma_p12      ?? null,
          firma_p12_info: firma_p12_info ?? null
        })
      }
    );

    if (!r.ok) {
      const msg = await r.text();
      console.error('[firma-electronica:guardarP12]', msg);
      return res.status(500).json({ error: msg });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[firma-electronica:guardarP12]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

async function registrarFirma(req, res) {
  const { usuario_id, titular, tipo_documento } = req.body || {};
  if (!usuario_id) return res.status(400).json({ error: 'Falta usuario_id' });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/documentos_firmados`, {
      method: 'POST',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=representation'
      },
      body: JSON.stringify({
        usuario_id,
        titular:        titular ?? null,
        tipo_documento: tipo_documento ?? null
      })
    });

    if (!r.ok) {
      const msg = await r.text();
      console.error('[firma-electronica:registrarFirma]', msg);
      return res.status(500).json({ error: msg });
    }

    const [registro] = await r.json();
    return res.status(200).json({ id: registro.id });
  } catch (e) {
    console.error('[firma-electronica:registrarFirma]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

async function verificarFirma(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'Falta id' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/documentos_firmados?id=eq.${encodeURIComponent(id)}&select=titular,tipo_documento,creado_en`,
      {
        headers: {
          apikey:        SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (!r.ok) {
      const msg = await r.text();
      console.error('[firma-electronica:verificarFirma]', msg);
      return res.status(500).json({ error: msg });
    }

    const registros = await r.json();
    if (!registros.length) return res.status(404).json({ error: 'Documento no encontrado' });

    return res.status(200).json(registros[0]);
  } catch (e) {
    console.error('[firma-electronica:verificarFirma]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
