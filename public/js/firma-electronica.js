// ─────────────────────────────────────────────────────────────────────────
// Firma electrónica de PDFs (PAdES-B / PKCS#7 detached) usando el certificado
// .p12 del médico (ver perfil.js → getP12Activo()).
//
// La contraseña del .p12 nunca sale del navegador: se usa solo en memoria,
// dentro de esta función, para desbloquear la clave privada con node-forge.
// ─────────────────────────────────────────────────────────────────────────

const SIG_PLACEHOLDER_BYTES   = 12000;
const SIG_PLACEHOLDER_HEX_LEN = SIG_PLACEHOLDER_BYTES * 2;
const BYTE_RANGE_PLACEHOLDER  = 9999999999;

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
function _firmarPKCS7(messageBytes, p12b64, pass) {
  const p12Der = atob(p12b64);
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, pass);

  const certBags = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]) || [];
  const keyBags  = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]) || [];

  if (certBags.length === 0) throw new Error('El certificado .p12 no contiene certificados');
  const keyBag = keyBags[0];
  if (!keyBag) throw new Error('El certificado .p12 no contiene una clave privada');

  const keyId = keyBag.attributes?.localKeyId?.[0];
  const leafBag = certBags.find(b => {
    const certKeyId = b.attributes?.localKeyId?.[0];
    return keyId && certKeyId && certKeyId === keyId;
  }) || certBags[0];

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
  const titular = leafBag.cert.subject.getField('CN')?.value || '';
  return { der, titular };
}

// Firma electrónicamente un PDFDocument (pdf-lib) que aún no fue guardado.
// Devuelve los bytes finales (Uint8Array) ya firmados (PAdES-B / PKCS#7).
async function firmarPdfConP12(doc, { nombre, motivo, p12b64, pass }) {
  _agregarPlaceholderFirma(doc, { nombre, motivo });

  const pdfBytes = await doc.save({ useObjectStreams: false });
  const { byteRangeIdx, byteRangeNeedle, hexStart, hexEnd } = _localizarPlaceholders(pdfBytes);

  const A = hexStart;
  const B = hexEnd;
  const C = pdfBytes.length - B;
  _aplicarByteRange(pdfBytes, byteRangeIdx, byteRangeNeedle, A, B, C);

  const firmado = new Uint8Array(A + C);
  firmado.set(pdfBytes.subarray(0, A), 0);
  firmado.set(pdfBytes.subarray(B, B + C), A);

  const { der, titular } = _firmarPKCS7(firmado, p12b64, pass);
  const sigHex = _derToHex(der);
  if (sigHex.length > SIG_PLACEHOLDER_HEX_LEN) {
    throw new Error('La firma PKCS#7 no entra en el espacio reservado del PDF');
  }
  _writeLatin1(pdfBytes, sigHex.padEnd(SIG_PLACEHOLDER_HEX_LEN, '0'), hexStart);

  return { pdfBytes, titular };
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
// esquina inferior izquierda de la página, encima de la línea del pie de
// página. Devuelve true si lo dibujó (hay un certificado .p12 activo) o
// false si no hay nada que mostrar (el caller mantiene su layout original).
async function dibujarFirmaElectronicaPDF(doc, page, { font, color, tipoDocumento }) {
  const p12 = typeof getP12Activo === 'function' ? getP12Activo() : null;
  if (!p12 || typeof qrcode === 'undefined') return false;

  const info = p12.info || {};
  const titular = info.titular
    || (typeof currentUser !== 'undefined' ? `${currentUser?.nombre || ''} ${currentUser?.apellidos || ''}`.trim() : '')
    || 'Médico';
  const fecha = new Date().toLocaleString('es-EC');

  // Registra el documento en MediLyft para que el QR apunte a una página de
  // verificación pública con los datos del firmante. Si el registro falla
  // (sin conexión, etc.), el QR cae de vuelta a mostrar la info en texto.
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
        usuario_id: typeof currentUser !== 'undefined' ? currentUser?.id : null,
        titular,
        tipo_documento: tipoDocumento || null,
      })
    });
    if (r.ok) {
      const { id } = await r.json();
      if (id) qrTexto = `https://www.medilyft.app/verificar.html?id=${id}`;
    }
  } catch (e) {
    console.error('No se pudo registrar la firma para verificación:', e.message);
  }

  try {
    const dataUrl = _generarQRDataURL(qrTexto);
    const qrImg = await doc.embedPng(dataUrl.split(',')[1]);
    const size = 38;
    const x = 40, y = 60;
    page.drawImage(qrImg, { x, y, width: size, height: size });
    page.drawText('Firmado electronicamente', { x: x + size + 6, y: y + size - 9, size: 7, font, color });
    page.drawText(titular,                    { x: x + size + 6, y: y + size - 18, size: 7, font, color });
    page.drawText(fecha,                      { x: x + size + 6, y: y + size - 27, size: 6, font, color });
    return true;
  } catch (e) {
    console.error('No se pudo generar el sello visual de firma electronica:', e.message);
    return false;
  }
}

// Guarda el PDF, firmándolo con el .p12 activo del médico si está disponible.
// Si algo falla (sin certificado activo, contraseña incorrecta, etc.) cae
// de vuelta a un PDF sin firma criptográfica (con la firma/sello visuales).
async function guardarPDFConFirma(doc, motivo) {
  try {
    const p12 = typeof getP12Activo === 'function' ? getP12Activo() : null;
    if (p12) {
      const nombre = typeof currentUser !== 'undefined'
        ? `${currentUser?.nombre || ''} ${currentUser?.apellidos || ''}`.trim()
        : '';
      const { pdfBytes, titular } = await firmarPdfConP12(doc, { nombre, motivo, p12b64: p12.p12b64, pass: p12.pass });
      console.log(`✓ PDF firmado electrónicamente (${titular})`);
      return pdfBytes;
    }
  } catch (e) {
    console.error('No se pudo firmar electrónicamente el PDF, se genera sin firma criptográfica:', e.message);
  }
  return await doc.save();
}
