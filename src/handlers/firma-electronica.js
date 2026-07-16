const crypto = require('crypto');
const { SUPABASE_URL, SUPABASE_KEY } = require('../config');

// Endpoint consolidado de firma electrónica (para no exceder el límite de
// funciones serverless del plan Hobby de Vercel). Combina 5 operaciones:
//   GET  ?id=...                                          -> verificar documento firmado
//   POST { usuario_id, firma_p12, firma_p12_info }        -> guardar certificado .p12
//   POST { action:'tsa', sigHashHex }                     -> proxy TSA (freetsa.org)
//   POST { action:'tsa_update', doc_id, tsa_token, tsa_ts } -> guardar token TSA en doc
//   POST { usuario_id, titular, tipo_documento, ... }     -> registrar documento firmado
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') return verificarFirma(req, res);
  if (req.method === 'POST') {
    const body = req.body || {};
    if ('firma_p12' in body || 'firma_p12_info' in body) return guardarP12(req, res);
    if (body.action === 'tsa')        return tsaProxy(req, res);
    if (body.action === 'tsa_update') return actualizarTSA(req, res);
    return registrarFirma(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
};

// ── Helpers DER para construir RFC 3161 TimeStampReq sin librerías externas ──

function _derLen(n) {
  if (n < 128) return Buffer.from([n]);
  if (n < 256) return Buffer.from([0x81, n]);
  return Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff]);
}
function _derSeq(c)  { return Buffer.concat([Buffer.from([0x30]), _derLen(c.length), c]); }
function _derInt(b)  {
  const p = (b[0] & 0x80) ? Buffer.concat([Buffer.from([0x00]), b]) : b;
  return Buffer.concat([Buffer.from([0x02]), _derLen(p.length), p]);
}
function _derOid(h)  { const b = Buffer.from(h, 'hex'); return Buffer.concat([Buffer.from([0x06]), _derLen(b.length), b]); }
function _derNull()  { return Buffer.from([0x05, 0x00]); }
function _derBool(v) { return Buffer.from([0x01, 0x01, v ? 0xff : 0x00]); }
function _derOctet(b){ return Buffer.concat([Buffer.from([0x04]), _derLen(b.length), b]); }

// SHA-256 OID: 2.16.840.1.101.3.4.2.1 → 60 86 48 01 65 03 04 02 01
function _buildTSReq(sha256HashBytes) {
  const algId      = _derSeq(Buffer.concat([_derOid('608648016503040201'), _derNull()]));
  const msgImprint = _derSeq(Buffer.concat([algId, _derOctet(sha256HashBytes)]));
  const version    = _derInt(Buffer.from([0x01]));
  const nonce      = _derInt(crypto.randomBytes(8));
  const certReq    = _derBool(true);
  return _derSeq(Buffer.concat([version, msgImprint, nonce, certReq]));
}

// ── Operaciones ───────────────────────────────────────────────────────────────

async function guardarP12(req, res) {
  const { usuario_id, firma_p12, firma_p12_info } = req.body || {};
  if (!usuario_id) return res.status(400).json({ error: 'Falta usuario_id' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/usuarios?id=eq.${usuario_id}`,
      {
        method: 'PATCH',
        headers: {
          apikey:         SUPABASE_KEY,
          Authorization:  `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer:         'return=minimal'
        },
        body: JSON.stringify({ firma_p12: firma_p12 ?? null, firma_p12_info: firma_p12_info ?? null })
      }
    );
    if (!r.ok) { const msg = await r.text(); console.error('[firma:guardarP12]', msg); return res.status(500).json({ error: msg }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[firma:guardarP12]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

async function registrarFirma(req, res) {
  const { usuario_id, titular, tipo_documento, cert_emisor, eci_acreditada } = req.body || {};
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
        titular:        titular        ?? null,
        tipo_documento: tipo_documento ?? null,
        cert_emisor:    cert_emisor    ?? null,
        eci_acreditada: eci_acreditada ?? false,
      })
    });
    if (!r.ok) { const msg = await r.text(); console.error('[firma:registrarFirma]', msg); return res.status(500).json({ error: msg }); }
    const [registro] = await r.json();
    return res.status(200).json({ id: registro.id });
  } catch (e) {
    console.error('[firma:registrarFirma]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// Proxy al TSA de freetsa.org. Recibe el SHA-256 (hex) de los bytes DER de la
// firma PKCS#7, construye el TimeStampReq (RFC 3161) y retorna el token base64.
async function tsaProxy(req, res) {
  const { sigHashHex } = req.body || {};
  if (!sigHashHex || sigHashHex.length !== 64) {
    return res.status(400).json({ error: 'Falta sigHashHex (SHA-256 hex de 64 chars)' });
  }

  try {
    const hashBytes = Buffer.from(sigHashHex, 'hex');
    const tsReq = _buildTSReq(hashBytes);

    const r = await fetch('https://freetsa.org/tsr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/timestamp-query' },
      body: tsReq,
      signal: AbortSignal.timeout(8000),
    });

    if (!r.ok) throw new Error(`TSA HTTP ${r.status}`);
    const tsRespBytes = Buffer.from(await r.arrayBuffer());

    // Validación mínima: debe ser una SEQUENCE y el primer campo (status) debe ser 0 (granted)
    if (tsRespBytes[0] !== 0x30) throw new Error('Respuesta TSA no es una SEQUENCE DER válida');
    const statusGranted = tsRespBytes.slice(0, 32).some((b, i, arr) =>
      b === 0x02 && arr[i + 1] === 0x01 && arr[i + 2] === 0x00
    );
    if (!statusGranted) throw new Error('TSA rechazó la solicitud (status != granted)');

    console.log(`[firma:tsaProxy] OK — ${tsRespBytes.length} bytes`);
    return res.status(200).json({
      tsaToken: tsRespBytes.toString('base64'),
      tsaTs:    new Date().toISOString(),
    });
  } catch (e) {
    console.error('[firma:tsaProxy]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// Persiste el token TSA en el registro de documentos_firmados ya creado.
async function actualizarTSA(req, res) {
  const { doc_id, tsa_token, tsa_ts } = req.body || {};
  if (!doc_id) return res.status(400).json({ error: 'Falta doc_id' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/documentos_firmados?id=eq.${encodeURIComponent(doc_id)}`,
      {
        method: 'PATCH',
        headers: {
          apikey:         SUPABASE_KEY,
          Authorization:  `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer:         'return=minimal'
        },
        body: JSON.stringify({ tsa_token: tsa_token ?? null, tsa_ts: tsa_ts ?? null })
      }
    );
    if (!r.ok) { const msg = await r.text(); console.error('[firma:actualizarTSA]', msg); return res.status(500).json({ error: msg }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[firma:actualizarTSA]', e.message);
    return res.status(500).json({ error: e.message });
  }
}

async function verificarFirma(req, res) {
  const { id } = req.query || {};
  if (!id) return res.status(400).json({ error: 'Falta id' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/documentos_firmados?id=eq.${encodeURIComponent(id)}&select=titular,tipo_documento,creado_en,cert_emisor,eci_acreditada,tsa_ts`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!r.ok) { const msg = await r.text(); console.error('[firma:verificarFirma]', msg); return res.status(500).json({ error: msg }); }
    const registros = await r.json();
    if (!registros.length) return res.status(404).json({ error: 'Documento no encontrado' });
    return res.status(200).json(registros[0]);
  } catch (e) {
    console.error('[firma:verificarFirma]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
