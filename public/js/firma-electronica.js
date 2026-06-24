// ─────────────────────────────────────────────────────────────────────────
// Firma electrónica de PDFs (PAdES-B / PKCS#7 detached) usando el certificado
// .p12 del médico (ver perfil.js → getP12Activo()).
//
// La contraseña del .p12 nunca sale del navegador: se usa solo en memoria,
// dentro de esta función, para desbloquear la clave privada con node-forge.
// ─────────────────────────────────────────────────────────────────────────

const SIG_PLACEHOLDER_BYTES   = 16000;
const SIG_PLACEHOLDER_HEX_LEN = SIG_PLACEHOLDER_BYTES * 2;
const BYTE_RANGE_PLACEHOLDER  = 9999999999;

// ECIs acreditadas por ARCOTEL en Ecuador. Se compara contra issuer CN + O en minúsculas.
const _ECI_ACREDITADAS = [
  'banco central del ecuador',
  'bce - entidad de certificacion',
  'bce-entidad de certificacion',
  'registro civil',
  'rc-entidad de certificacion',
  'security data',
  'anf ac ecuador',
  'anf autoridad de certificacion',
  'consejo de la judicatura',
  'cj - entidad de certificacion',
  'cj-entidad de certificacion',
];

// Detecta si el emisor del certificado es una ECI acreditada.
// Exportada como global para que perfil.js la use al guardar el .p12.
function _validarEmisorECI(cert) {
  const getField = (attrs, name) => (attrs.find(a => a.name === name || a.shortName === name) || {}).value || '';
  const issAttrs = cert.issuer.attributes;
  const cn  = getField(issAttrs, 'commonName').toLowerCase();
  const org = getField(issAttrs, 'organizationName').toLowerCase();
  const texto = cn + ' ' + org;
  const acreditada = _ECI_ACREDITADAS.some(eci => texto.includes(eci));
  const emisor = getField(issAttrs, 'commonName') || getField(issAttrs, 'organizationName') || 'Desconocido';
  return { acreditada, emisor };
}

// ── Log estructurado de sesión de firma ──────────────────────────────────────
// Accesible en consola como window._firmaLogs para debugging.
// Se limpia al inicio de cada llamada a guardarPDFConFirma().
const _firmaLogs = [];
window._firmaLogs = _firmaLogs;

// UUID del documento registrado por dibujarFirmaElectronicaPDF; leído por
// guardarPDFConFirma para enviar el token TSA al registro correcto.
let _firmaDocIdActual = null;

function _logFirma(paso, ok, detalle = '') {
  const entry = { ts: new Date().toISOString(), paso, ok, detalle };
  _firmaLogs.push(entry);
  (ok ? console.log : console.error)(`[firma:${paso}]`, detalle || (ok ? 'OK' : 'FALLO'));
  if (typeof _firmaActualizarPanel === 'function') _firmaActualizarPanel();
  return entry;
}

// SHA-256 de un Uint8Array, devuelve hex string.
async function _sha256Hex(uint8Array) {
  const buf = await crypto.subtle.digest('SHA-256', uint8Array);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function _fechaPDFFirma(d) {
  const pad = n => String(n).padStart(2, '0');
  return `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-05'00'`;
}

function _bytesToLatin1(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return s;
}

function _writeLatin1(bytes, str, offset) {
  for (let i = 0; i < str.length; i++) bytes[offset + i] = str.charCodeAt(i);
}

// Agrega al PDFDocument el placeholder de firma (/Sig, /Widget, /AcroForm)
function _agregarPlaceholderFirma(doc, { nombre, motivo }) {
  const { PDFName, PDFNumber, PDFHexString, PDFString, PDFArray } = PDFLib;
  const { context } = doc;
  const page = doc.getPage(0);

  const sigDict = context.obj({
    Type: PDFName.of('Sig'),
    Filter: PDFName.of('Adobe.PPKLite'),
    SubFilter: PDFName.of('adbe.pkcs7.detached'),
    ByteRange: PDFArray.withContext(context),
    Contents: PDFHexString.of('00'.repeat(SIG_PLACEHOLDER_BYTES)),
    Name: PDFString.of(nombre || ''),
    Reason: PDFString.of(motivo || 'Documento firmado electronicamente'),
    M: PDFString.of(_fechaPDFFirma(new Date())),
  });

  const byteRange = sigDict.get(PDFName.of('ByteRange'));
  byteRange.push(PDFNumber.of(0));
  byteRange.push(PDFNumber.of(BYTE_RANGE_PLACEHOLDER));
  byteRange.push(PDFNumber.of(BYTE_RANGE_PLACEHOLDER));
  byteRange.push(PDFNumber.of(BYTE_RANGE_PLACEHOLDER));

  const sigRef = context.register(sigDict);

  const widgetDict = context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Widget'),
    FT: PDFName.of('Sig'),
    Rect: [0, 0, 0, 0],
    V: sigRef,
    T: PDFString.of('FirmaElectronica'),
    F: 132,
    P: page.ref,
  });
  const widgetRef = context.register(widgetDict);

  const existingAnnots = page.node.lookup(PDFName.of('Annots'), PDFArray);
  if (existingAnnots) existingAnnots.push(widgetRef);
  else page.node.set(PDFName.of('Annots'), context.obj([widgetRef]));

  const acroForm = context.obj({
    Fields: context.obj([widgetRef]),
    SigFlags: 3,
  });
  doc.catalog.set(PDFName.of('AcroForm'), context.register(acroForm));
}

// Ubica los placeholders /ByteRange y /Contents dentro de los bytes ya serializados
function _localizarPlaceholders(pdfBytes) {
  const str = _bytesToLatin1(pdfBytes);

  const byteRangeNeedle = `/ByteRange [ 0 ${BYTE_RANGE_PLACEHOLDER} ${BYTE_RANGE_PLACEHOLDER} ${BYTE_RANGE_PLACEHOLDER} ]`;
  const byteRangeIdx = str.indexOf(byteRangeNeedle);
  if (byteRangeIdx === -1) throw new Error('No se encontró el placeholder /ByteRange');

  const contentsNeedle = `/Contents <${'00'.repeat(SIG_PLACEHOLDER_BYTES)}>`;
  const contentsIdx = str.indexOf(contentsNeedle);
  if (contentsIdx === -1) throw new Error('No se encontró el placeholder /Contents');

  const hexStart = contentsIdx + '/Contents <'.length;
  const hexEnd = hexStart + SIG_PLACEHOLDER_HEX_LEN;

  return { byteRangeIdx, byteRangeNeedle, hexStart, hexEnd };
}

// Sustituye los números del /ByteRange placeholder por los offsets reales,
// preservando el largo en bytes (rellena con espacios).
function _aplicarByteRange(bytes, byteRangeIdx, byteRangeNeedle, A, B, C) {
  const width = String(BYTE_RANGE_PLACEHOLDER).length;
  const pad = n => String(n).padEnd(width, ' ');
  const real = `/ByteRange [ 0 ${pad(A)} ${pad(B)} ${pad(C)} ]`;
  if (real.length !== byteRangeNeedle.length) throw new Error('Longitud de /ByteRange inesperada');
  _writeLatin1(bytes, real, byteRangeIdx);
}

function _derToHex(der) {
  let hex = '';
  for (let i = 0; i < der.length; i++) hex += der.charCodeAt(i).toString(16).padStart(2, '0');
  return hex;
}

// Firma PKCS#7 detached (CMS) con la clave privada del .p12. La contraseña
// solo se usa aquí, en memoria, para descifrar la clave; nunca se transmite.
// Devuelve también eciAcreditada y certEmisor para registrarlos en Supabase.
function _firmarPKCS7(messageBytes, p12b64, pass) {
  _logFirma('pkcs7:parsear-p12', true, 'inicio parseo forge');
  const p12Der = atob(p12b64);
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, pass);

  const certBags = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]) || [];
  const keyBags  = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]) || [];
  _logFirma('pkcs7:bags', true, `certBags=${certBags.length}, keyBags=${keyBags.length}`);

  if (certBags.length === 0) {
    _logFirma('pkcs7:validar-certs', false, 'P12 sin certificados');
    throw new Error('El certificado .p12 no contiene certificados');
  }
  const keyBag = keyBags[0];
  if (!keyBag) {
    _logFirma('pkcs7:validar-key', false, 'P12 sin clave privada');
    throw new Error('El certificado .p12 no contiene una clave privada');
  }

  const keyId = keyBag.attributes?.localKeyId?.[0];
  const leafBag = certBags.find(b => {
    const certKeyId = b.attributes?.localKeyId?.[0];
    return keyId && certKeyId && certKeyId === keyId;
  }) || certBags[0];

  const usóLocalKeyId = !!(keyId && leafBag.attributes?.localKeyId?.[0] === keyId);
  const titular = leafBag.cert.subject.getField('CN')?.value || '';
  _logFirma('pkcs7:leaf-cert', true,
    `titular="${titular}", localKeyId=${usóLocalKeyId ? 'sí' : 'NO — fallback a certBags[0]'}`);

  // Validar si el emisor es una ECI acreditada por ARCOTEL
  const { acreditada: eciAcreditada, emisor: certEmisor } = _validarEmisorECI(leafBag.cert);
  _logFirma('pkcs7:eci', eciAcreditada,
    `emisor="${certEmisor}" — ${eciAcreditada ? 'ECI acreditada (firma certificada)' : 'NO es ECI acreditada (firma simple)'}`);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(_bytesToLatin1(messageBytes));
  certBags.forEach(b => p7.addCertificate(b.cert));
  p7.addSigner({
    key: keyBag.key,
    certificate: leafBag.cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  _logFirma('pkcs7:firma-der', true,
    `${der.length} bytes DER → ${der.length * 2} hex (placeholder=${SIG_PLACEHOLDER_HEX_LEN})`);

  return { der, titular, eciAcreditada, certEmisor };
}

// Firma electrónicamente un PDFDocument (pdf-lib) que aún no fue guardado.
// Devuelve los bytes finales (Uint8Array) ya firmados (PAdES-B / PKCS#7).
async function firmarPdfConP12(doc, { nombre, motivo, p12b64, pass }) {
  _logFirma('pades:placeholder', true, 'insertando /Sig /Widget /AcroForm');
  _agregarPlaceholderFirma(doc, { nombre, motivo });

  _logFirma('pades:serializar', true, 'doc.save() con useObjectStreams=false');
  const pdfBytes = await doc.save({ useObjectStreams: false });
  _logFirma('pades:serializar', true, `${pdfBytes.length} bytes`);

  const { byteRangeIdx, byteRangeNeedle, hexStart, hexEnd } = _localizarPlaceholders(pdfBytes);
  _logFirma('pades:byterange-localizar', true, `hexStart=${hexStart}, hexEnd=${hexEnd}`);

  const A = hexStart;
  const B = hexEnd;
  const C = pdfBytes.length - B;
  _aplicarByteRange(pdfBytes, byteRangeIdx, byteRangeNeedle, A, B, C);
  _logFirma('pades:byterange-aplicar', true, `[0, ${A}, ${B}, ${C}]`);

  const firmado = new Uint8Array(A + C);
  firmado.set(pdfBytes.subarray(0, A), 0);
  firmado.set(pdfBytes.subarray(B, B + C), A);
  _logFirma('pades:mensaje', true, `${firmado.length} bytes a firmar`);

  const { der, titular, eciAcreditada, certEmisor } = _firmarPKCS7(firmado, p12b64, pass);

  const sigHex = _derToHex(der);
  _logFirma('pades:sig-hex', sigHex.length <= SIG_PLACEHOLDER_HEX_LEN,
    `${sigHex.length} chars hex, max=${SIG_PLACEHOLDER_HEX_LEN}`);

  if (sigHex.length > SIG_PLACEHOLDER_HEX_LEN) {
    _logFirma('pades:overflow', false,
      `OVERFLOW: firma ${sigHex.length} > placeholder ${SIG_PLACEHOLDER_HEX_LEN} — aumentar SIG_PLACEHOLDER_BYTES`);
    throw new Error(`La firma PKCS#7 excede el espacio reservado (${sigHex.length} > ${SIG_PLACEHOLDER_HEX_LEN}). Contacte soporte.`);
  }

  _writeLatin1(pdfBytes, sigHex.padEnd(SIG_PLACEHOLDER_HEX_LEN, '0'), hexStart);
  _logFirma('pades:completo', true, `PDF firmado como "${titular}"`);

  // SHA-256 de los bytes DER de la firma → se enviará al proxy TSA
  const derUint8 = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) derUint8[i] = der.charCodeAt(i);
  const sigHashHex = await _sha256Hex(derUint8);
  _logFirma('pades:sig-hash', true, `SHA-256 DER = ${sigHashHex.slice(0, 16)}…`);

  return { pdfBytes, titular, eciAcreditada, certEmisor, sigHashHex };
}

// Genera un QR como data URL PNG usando qrcode-generator (global `qrcode`,
// cargado vía <script> en index.html). Prueba tamaños crecientes hasta que
// el texto entre ("code length overflow" si el QR es muy chico para el texto).
function _generarQRDataURL(texto, cellSize = 4, margin = 4) {
  let qr = null;
  for (let typeNumber = 4; typeNumber <= 20; typeNumber++) {
    try {
      qr = qrcode(typeNumber, 'M');
      qr.addData(texto);
      qr.make();
      break;
    } catch (e) {
      qr = null;
    }
  }
  if (!qr) throw new Error('El texto es demasiado largo para generar el QR');

  const moduleCount = qr.getModuleCount();
  const size = moduleCount * cellSize + margin * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) ctx.fillRect(margin + col * cellSize, margin + row * cellSize, cellSize, cellSize);
    }
  }
  return canvas.toDataURL('image/png');
}

// Dibuja un sello visual de firma electrónica (QR + datos del firmante) en la
// esquina inferior izquierda de la página. Registra el documento en Supabase
// para el QR de verificación y almacena el doc_id en _firmaDocIdActual para
// que guardarPDFConFirma pueda actualizar el registro con el token TSA.
async function dibujarFirmaElectronicaPDF(doc, page, { font, color, tipoDocumento, posY }) {
  const p12 = typeof getP12Activo === 'function' ? getP12Activo() : null;
  if (!p12) {
    _logFirma('sello:sin-p12', true, 'sin certificado activo — sin sello visual');
    return false;
  }
  if (typeof qrcode === 'undefined') {
    _logFirma('sello:sin-qrcode', false, 'librería qrcode-generator no disponible');
    return false;
  }

  const info = p12.info || {};
  const titular = info.titular
    || (typeof currentUser !== 'undefined' ? `${currentUser?.nombre || ''} ${currentUser?.apellidos || ''}`.trim() : '')
    || 'Médico';
  const especialidad   = (typeof currentUser !== 'undefined' ? currentUser?.especialidad : '') || '';
  const certEmisor     = info.certEmisor    || '';
  const eciAcreditada  = info.eciAcreditada || false;
  const fecha = new Date().toLocaleString('es-EC');

  _firmaDocIdActual = null; // resetear antes de cada documento

  let qrTexto = [
    'Documento firmado electronicamente',
    `Firmante: ${titular}`,
    `Fecha: ${fecha}`,
  ].join('\n');

  try {
    const r = await fetch('/api/firma-electronica', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario_id:     typeof currentUser !== 'undefined' ? currentUser?.id : null,
        titular,
        tipo_documento: tipoDocumento || null,
        cert_emisor:    certEmisor    || null,
        eci_acreditada: eciAcreditada,
      })
    });
    if (r.ok) {
      const { id } = await r.json();
      if (id) {
        qrTexto = `https://www.medilyft.app/verificar.html?id=${id}`;
        _firmaDocIdActual = id;
        _logFirma('sello:registro-api', true, `documento registrado id=${id}, eci=${eciAcreditada}`);
      }
    } else {
      _logFirma('sello:registro-api', false, `HTTP ${r.status} — QR usará texto plano`);
    }
  } catch (e) {
    _logFirma('sello:registro-api', false, `${e.message} — QR usará texto plano`);
  }

  try {
    const dataUrl = _generarQRDataURL(qrTexto);
    const qrImg = await doc.embedPng(dataUrl.split(',')[1]);
    const size = 38;
    const x = 40, y = posY ?? 60;
    page.drawImage(qrImg, { x, y, width: size, height: size });
    page.drawText('Firmado electronicamente',   { x: x + size + 6, y: y + size - 9,  size: 7, font, color });
    page.drawText(titular,                       { x: x + size + 6, y: y + size - 18, size: 7, font, color });
    page.drawText(fecha,                         { x: x + size + 6, y: y + size - 27, size: 6, font, color });
    if (especialidad) page.drawText(especialidad.toUpperCase(), { x: x + size + 6, y: y + size - 36, size: 6, font, color });
    _logFirma('sello:qr-dibujado', true, `titular="${titular}"`);
    return true;
  } catch (e) {
    _logFirma('sello:qr-fallo', false, e.message);
    return false;
  }
}

// Guarda el PDF, firmándolo con el .p12 activo del médico si está disponible.
// Después de firmar, solicita un timestamp RFC 3161 al proxy TSA y actualiza
// el registro en Supabase. Si cualquier paso falla, degrada sin romper el PDF.
async function guardarPDFConFirma(doc, motivo) {
  _firmaLogs.length = 0; // limpiar log de sesión anterior
  _logFirma('guardar:inicio', true, `motivo="${motivo}"`);

  const p12 = typeof getP12Activo === 'function' ? getP12Activo() : null;
  if (!p12) {
    _logFirma('guardar:sin-p12', true, 'sin certificado activo — PDF sin firma criptográfica');
    return await doc.save();
  }

  try {
    _logFirma('guardar:intentar-firma', true, 'P12 activo, iniciando firma PAdES');
    const nombre = typeof currentUser !== 'undefined'
      ? `${currentUser?.nombre || ''} ${currentUser?.apellidos || ''}`.trim()
      : '';
    const { pdfBytes, titular, sigHashHex } = await firmarPdfConP12(doc, {
      nombre, motivo, p12b64: p12.p12b64, pass: p12.pass
    });
    _logFirma('guardar:exito', true, `PDF firmado correctamente como "${titular}"`);

    // Solicitar timestamp TSA y persistirlo (no bloqueante: fallo no invalida el PDF)
    _solicitarYGuardarTSA(sigHashHex).catch(e =>
      _logFirma('tsa:error-no-bloqueante', false, e.message)
    );

    return pdfBytes;
  } catch (e) {
    _logFirma('guardar:fallo-firma', false, e.message);
    if (typeof showToast === 'function') {
      showToast(`⚠️ Firma electrónica falló: ${e.message}. PDF generado SIN firma criptográfica.`);
    }
    return await doc.save();
  }
}

// Solicita un timestamp RFC 3161 a freetsa.org (vía nuestro proxy) y lo
// guarda en el registro de documentos_firmados. Separado para no bloquear
// la entrega del PDF al médico si el TSA tarda o falla.
async function _solicitarYGuardarTSA(sigHashHex) {
  if (!_firmaDocIdActual || !sigHashHex) return;
  _logFirma('tsa:solicitar', true, `sigHashHex=${sigHashHex.slice(0, 16)}…`);

  const r = await fetch('/api/firma-electronica', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'tsa', sigHashHex })
  });

  if (!r.ok) {
    const err = await r.text();
    _logFirma('tsa:proxy-error', false, err);
    return;
  }

  const { tsaToken, tsaTs } = await r.json();
  _logFirma('tsa:recibido', true, `tsaTs=${tsaTs}`);

  const r2 = await fetch('/api/firma-electronica', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'tsa_update', doc_id: _firmaDocIdActual, tsa_token: tsaToken, tsa_ts: tsaTs })
  });

  if (r2.ok) {
    _logFirma('tsa:guardado', true, `doc_id=${_firmaDocIdActual}`);
  } else {
    _logFirma('tsa:update-error', false, await r2.text());
  }
}
