// Sanitiza texto para pdf-lib (fuentes estándar = WinAnsi). Caracteres fuera de
// Latin-1 (emoji, comillas/guiones tipográficos, espacios raros de copiar/pegar)
// hacen que drawText lance error y rompa la generación. Acá se normalizan o eliminan.
function _pdfSafe(s) {
  return String(s == null ? '' : s)
    .normalize('NFC')
    .replace(/[‘’‚‹›]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[     ]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, '');
}

async function generarRecetaPDF() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const resp = await fetch('/templates/receta.pdf');
  if (!resp.ok) { showToast('Error: plantilla receta.pdf no encontrada'); return; }
  const doc  = await PDFDocument.load(new Uint8Array(await resp.arrayBuffer()));
  const page = doc.getPage(0);
  const H    = page.getHeight();

  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negro   = rgb(0.05, 0.05, 0.05);
  const blanco  = rgb(1, 1, 1);
  const grisOsc = rgb(0.3, 0.3, 0.3);
  const teal    = rgb(0.0, 0.69, 0.68);

  const gV = id => { const el = document.getElementById(id); return _pdfSafe((el ? (el.value || el.textContent || '') : '').trim()); };
  const gR = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || '');

  const p   = currentPacienteData || {};
  const u   = currentUser || {};
  const medNom = _pdfSafe(gV('rec-nombre-medico') || `${u.nombre||''} ${u.apellidos||''}`.trim());
  const medReg = _pdfSafe(u.numero_registro ? 'Reg. MSP: ' + u.numero_registro : (gV('rec-reg-medico') || ''));
  const medEsp = _pdfSafe(gV('rec-esp-medico') || u.especialidad || 'MEDICINA GENERAL');

  // White-out Vital Club logo (left side x=0-292, top=0-140 → y_pdf=702-842)
  page.drawRectangle({ x: 0, y: H - 140, width: 293, height: 140, color: blanco });

  // MediLyft branding
  page.drawText('MEDILYFT', { x: 18, y: H - 28, size: 15, font: bold,   color: teal    });
  page.drawText('Teleconsultas Medicas', { x: 18, y: H - 43, size: 8, font: normal, color: grisOsc });
  page.drawLine({ start:{x:18, y: H - 50}, end:{x:280, y: H - 50}, thickness: 0.5, color: rgb(0.8,0.8,0.8) });
  if (medNom) page.drawText(medNom, { x: 18, y: H - 63, size: 9,   font: bold,   color: negro   });
  if (medEsp) page.drawText(medEsp, { x: 18, y: H - 75, size: 8,   font: normal, color: grisOsc });
  if (medReg) page.drawText(medReg, { x: 18, y: H - 87, size: 7.5, font: normal, color: grisOsc });
  if (u.telefono) page.drawText(_pdfSafe('Tel: ' + u.telefono), { x: 18, y: H - 99, size: 7.5, font: normal, color: grisOsc });

  // Right side: receta number (after "RECETA No." label, top≈99 → y_pdf=735)
  const recNum = gV('rec-numero');
  if (recNum) page.drawText(recNum, { x: 470, y: H - 105, size: 8, font: bold, color: negro });

  // PATIENT ROW (pdfplumber top=142-153 → text at y_pdf = H-151)
  const PY = H - 151;
  page.drawText(_pdfSafe((p.nombre   ||'').toUpperCase()), { x: 24,  y: PY, size: 7, font: normal, color: negro, maxWidth: 104 });
  page.drawText(_pdfSafe((p.apellidos||'').toUpperCase()), { x: 134, y: PY, size: 7, font: normal, color: negro, maxWidth: 104 });
  page.drawText(gV('rec-cedula'),      { x: 244, y: PY, size: 7, font: normal, color: negro, maxWidth: 64  });
  page.drawText(gV('rec-edad'),        { x: 314, y: PY, size: 7, font: normal, color: negro, maxWidth: 72  });
  page.drawText(gV('rec-sexo'),        { x: 394, y: PY, size: 7, font: normal, color: negro, maxWidth: 50  });
  page.drawText(gV('rec-hoja') || '1', { x: 450, y: PY, size: 7, font: normal, color: negro, maxWidth: 34  });
  page.drawText(gV('rec-atencion'),    { x: 490, y: PY, size: 7, font: normal, color: negro, maxWidth: 82  });

  // ALERGIAS ROW (pdfplumber top=164-175 → text at y_pdf = H-171)
  const AY = H - 171;
  const alergia = gR('rec-alergias') || 'NO';
  if (alergia === 'SI') page.drawRectangle({ x: 68, y: AY, width: 5, height: 5, color: negro });
  else                  page.drawRectangle({ x: 82, y: AY, width: 5, height: 5, color: negro });
  const esp = gV('rec-alergias-especificar');
  if (esp) page.drawText(esp, { x: 138, y: AY, size: 7, font: normal, color: negro, maxWidth: 168 });
  const peso = gV('rec-peso');
  if (peso)  page.drawText(peso + ' kg',  { x: 344, y: AY, size: 7, font: normal, color: negro, maxWidth: 42 });
  const talla = gV('rec-talla');
  if (talla) page.drawText(talla + ' cm', { x: 450, y: AY, size: 7, font: normal, color: negro, maxWidth: 32 });

  // MEDICINES (template box content area top=200-221 → y_pdf start = H-207, 3 medicines max at 7.5pt)
  const meds = [...document.querySelectorAll('#rec-meds-body tr')].map(tr => {
    const nombre = tr.querySelector('.med-nombre')?.value.trim();
    if (!nombre) return null;
    const frecSel = tr.querySelector('.med-frecuencia');
    return {
      nombre: _pdfSafe(nombre),
      dosis:  _pdfSafe(tr.querySelector('.med-dosis')?.value.trim()  || ''),
      frec:   _pdfSafe(frecSel?.value ? (frecSel.selectedOptions[0]?.textContent || '') : ''),
      dias:   _pdfSafe(tr.querySelector('.med-dias')?.value.trim()   || '')
    };
  }).filter(Boolean);

  let medY = H - 207;
  for (let i = 0; i < Math.min(meds.length, 3); i++) {
    const m = meds[i];
    page.drawText(`${i+1}. ${m.nombre}${m.dosis ? ' ' + m.dosis : ''}`, { x: 35, y: medY, size: 7.5, font: bold, color: negro, maxWidth: 290 });
    medY -= 9;
    if (m.frec || m.dias) {
      page.drawText([m.frec, m.dias ? m.dias + ' dia(s)' : ''].filter(Boolean).join(' - '), { x: 42, y: medY, size: 6.5, font: normal, color: grisOsc, maxWidth: 283 });
      medY -= 9;
    }
  }

  // INDICACIONES (right column x=331-565, same medicine row height)
  const indicTxt = gV('rec-indicaciones');
  if (indicTxt) {
    let indY = H - 207;
    for (const linea of indicTxt.split(/[\r\n]+/).filter(l => l.trim()).slice(0, 4)) {
      page.drawText(_pdfSafe(linea), { x: 335, y: indY, size: 7.5, font: normal, color: negro, maxWidth: 226 });
      indY -= 9;
    }
  }

  // DIAGNÓSTICO (template row top=223-243 → text at y_pdf = H-237)
  const diagStr = gV('rec-diagnostico') + (gV('rec-cie10') ? ` (${gV('rec-cie10')})` : '');
  page.drawText(diagStr, { x: 35, y: H - 237, size: 8, font: normal, color: negro, maxWidth: 526 });

  // MEDIDAS NO FARMACOLÓGICAS (template label at top=327 → content starts at y_pdf = H-345)
  const medFarm = gV('rec-medidas-no-farmacologicas');
  if (medFarm) {
    const words = medFarm.split(' '); let linea = '', mfY = H - 345;
    for (const w of words) {
      const test = linea ? linea + ' ' + w : w;
      if (normal.widthOfTextAtSize(test, 7.5) > 360 && linea) {
        page.drawText(_pdfSafe(linea), { x: 32, y: mfY, size: 7.5, font: normal, color: negro }); mfY -= 10; linea = w;
      } else linea = test;
    }
    if (linea) page.drawText(_pdfSafe(linea), { x: 32, y: mfY, size: 7.5, font: normal, color: negro });
  }

  // DOCTOR (right column x=411-576, NOMBRE top=263-274 → y_pdf = H-271)
  page.drawText(medNom,  { x: 415, y: H - 271, size: 8.5, font: bold,   color: negro,   maxWidth: 158 });
  if (medReg) page.drawText(medReg, { x: 415, y: H - 283, size: 7.5, font: normal, color: grisOsc, maxWidth: 158 });
  if (medEsp) page.drawText(medEsp, { x: 415, y: H - 295, size: 7.5, font: normal, color: grisOsc, maxWidth: 158 });

  await dibujarFirmaElectronicaPDF(doc, page, { font: normal, color: grisOsc, tipoDocumento: 'Receta medica' });
  return await guardarPDFConFirma(doc, 'Receta medica');
}

// ===== HISTORIA CLÍNICA PDF =====
async function generarHistoriaClinicaPDF() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();
  const brand = rgb(1.0, 0.353, 0.373);
  const gris  = rgb(0.4, 0.4, 0.4);
  const negro = rgb(0, 0, 0);
  const blanco = rgb(1, 1, 1);
  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const gV = id => { const el = document.getElementById(id); return _pdfSafe(el ? (el.value || el.textContent || '').trim() : ''); };
  const gR = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || "—");
  const gCB = ids => ids.filter(id => { const el = document.getElementById(id); return el && el.checked; }).map(id => id.replace(/^hcaf-/,'').replace(/-/g,' ')).join(', ') || '-';

  function buildPage() {
    const page = doc.addPage([595, 842]);
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 75, width, height: 75, color: brand });
    page.drawText('MEDILYFT', { x: 40, y: height - 42, size: 20, font: bold, color: blanco });
    page.drawText('Historia Clínica', { x: 40, y: height - 62, size: 11, font: normal, color: blanco });
    page.drawText(`Fecha: ${new Date().toLocaleDateString('es-EC')}`, { x: width - 185, y: height - 52, size: 9, font: normal, color: blanco });
    const medNom = currentUser ? `Dr. ${currentUser.nombre || ''} ${currentUser.apellidos || ''}`.trim() : '';
    if (medNom) page.drawText(medNom, { x: width - 185, y: height - 64, size: 8, font: normal, color: blanco });
    return { page, y: height - 90, width, height };
  }

  let { page, y, width } = buildPage();

  function seccion(titulo) {
    page.drawRectangle({ x: 40, y: y - 4, width: width - 80, height: 20, color: rgb(0.99, 0.95, 0.95) });
    page.drawText(titulo, { x: 44, y, size: 10, font: bold, color: brand });
    y -= 26;
  }
  function campo(label, valor, x2 = 44) {
    page.drawText(`${label}:`, { x: x2, y, size: 9, font: bold, color: gris });
    page.drawText(_pdfSafe(valor) || '-', { x: x2 + 140, y, size: 9, font: normal, color: negro });
    y -= 14;
  }
  function campoDoble(l1, v1, l2, v2) {
    const half = width / 2 - 40;
    campo(l1, v1, 44); y += 14;
    page.drawText(`${l2}:`, { x: 44 + half, y, size: 9, font: bold, color: gris });
    page.drawText(_pdfSafe(v2) || '-', { x: 44 + half + 140, y, size: 9, font: normal, color: negro });
    y -= 14;
  }
  function wrap(texto, startX, maxW) {
    const palabras = (_pdfSafe(texto) || '-').split(' '); let linea = '';
    for (const p of palabras) {
      const test = linea ? `${linea} ${p}` : p;
      if (normal.widthOfTextAtSize(test, 9) > maxW && linea) {
        page.drawText(linea, { x: startX, y, size: 9, font: normal, color: negro }); y -= 13; linea = p;
      } else linea = test;
    }
    if (linea) { page.drawText(linea, { x: startX, y, size: 9, font: normal, color: negro }); y -= 13; }
  }

  function checkPage() {
    if (y < 80) {
      page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
      page.drawText('MediLyft · Historia Clínica · Continúa en la siguiente hoja', { x: 40, y: 40, size: 7, font: normal, color: gris });
      const np = buildPage(); page = np.page; y = np.y; width = np.width;
    }
  }

  // Identificación
  seccion('FICHA DE IDENTIFICACIÓN');
  campo('No. de historial', gV('hc-historial'));
  campo('Nombre completo', gV('hc-nombre'));
  campoDoble('Primer apellido', gV('hc-primer-ap'), 'Segundo apellido', gV('hc-segundo-ap')); y -= 0;
  campoDoble('Cédula', gV('hc-cedula'), 'Edad', gV('hc-edad'));
  campoDoble('Sexo', gR('hc-sexo'), 'Fecha nacimiento', gV('hc-fecha-nac'));
  campo('Lugar de nacimiento', gV('hc-lugar-nac'));
  campo('Estado civil', gR('hc-estado-civil'));
  campo('Domicilio', gV('hc-domicilio'));
  campoDoble('Ocupación', gV('hc-ocupacion'), 'Teléfono', gV('hc-telefono'));
  y -= 4; checkPage();

  seccion('MOTIVO DE LA CONSULTA');
  wrap(gV('hc-motivo') || '—', 44, width - 90); y -= 4; checkPage();

  seccion('ANTECEDENTES PERSONALES');
  const _cronicas = gV('hc-cronicas-texto');
  if (_cronicas) { campo('Enf. crónicas activas', _cronicas); checkPage(); }
  wrap(gV('hc-ant-personales') || '-', 44, width - 90); y -= 4; checkPage();

  seccion('ANTECEDENTES FAMILIARES');
  wrap(gCB(['hcaf-cardiopatia','hcaf-diabetes','hcaf-enf-cardiovascular','hcaf-hipertension','hcaf-cancer','hcaf-tuberculosis','hcaf-enf-mental','hcaf-enf-infecciosa','hcaf-mal-formacion','hcaf-otro']), 44, width - 90);
  const antFamNotes = gV('hc-ant-familiares-notas');
  if (antFamNotes) wrap(antFamNotes, 44, width - 90);
  y -= 4; checkPage();

  seccion('ENFERMEDAD O PROBLEMA ACTUAL');
  wrap(gV('hc-enfermedad') || '—', 44, width - 90); y -= 4; checkPage();

  // Revisión de órganos y sistemas (CP = Con patología · SP = Sin patología)
  function listaCpSp(items) {
    items.forEach(([n, id], i) => {
      const xPos = i % 2 === 0 ? 44 : width / 2;
      page.drawText(`${n}: ${gR(id)}`, { x: xPos, y, size: 9, font: normal, color: negro });
      if (i % 2 === 1) y -= 14;
    });
    if (items.length % 2 === 1) y -= 14;
  }

  seccion('REVISIÓN DE ÓRGANOS Y SISTEMAS (CP = Con patología · SP = Sin patología)');
  listaCpSp([['Cardiopatía','hco-card'],['Respiratorio','hco-resp'],['Cardiovascular','hco-cardv'],['Digestivo','hco-dig'],['Genital','hco-gen'],['Urinario','hco-uri'],['Músculo Esquel.','hco-musc'],['Endócrino','hco-end'],['Hemo Linfático','hco-hem'],['Nervioso','hco-nerv']]);
  const organosNotas = gV('hc-organos-notas');
  if (organosNotas) wrap(organosNotas, 44, width - 90);
  y -= 4; checkPage();

  // Examen físico regional (CP = Con patología · SP = Sin patología)
  seccion('EXAMEN FÍSICO REGIONAL (CP = Con patología · SP = Sin patología)');
  listaCpSp([['Cabeza','hce-cab'],['Cuello','hce-cue'],['Tórax','hce-tor'],['Abdomen','hce-abd'],['Pelvis','hce-pel'],['Extremidades','hce-ext']]);
  const examenNotas = gV('hc-examen-notas');
  if (examenNotas) wrap(examenNotas, 44, width - 90);
  y -= 4; checkPage();

  // Diagnóstico
  seccion('DIAGNÓSTICO');
  for (let i = 1; i <= 4; i++) {
    const dxV = gV(`hc-dx-${i}`);
    if (dxV) {
      const tipo = gR(`hc-dx-tipo-${i}`);
      page.drawText(`${i}. ${dxV}  [${tipo}]`, { x: 44, y, size: 9, font: normal, color: negro }); y -= 14;
    }
  }
  y -= 4; checkPage();

  seccion('PLANES DE TRATAMIENTO');
  wrap(gV('hc-tratamiento') || '—', 44, width - 90);
  y -= 4; checkPage();

  seccion('EVOLUCIÓN Y PRESCRIPCIONES');
  const evoluciones = [...document.querySelectorAll('#hc-evolucion-body tr')].map(tr => {
    const inputs = tr.querySelectorAll('input');
    if (inputs.length < 3) return null;
    const fecha = inputs[0].value.trim(), evolucion = inputs[1].value.trim(), prescripcion = inputs[2].value.trim();
    return (fecha || evolucion || prescripcion) ? { fecha, evolucion, prescripcion } : null;
  }).filter(Boolean);
  if (!evoluciones.length) {
    page.drawText('-', { x: 44, y, size: 9, font: normal, color: negro }); y -= 14;
  } else {
    evoluciones.forEach(e => {
      page.drawText(_pdfSafe(e.fecha) || '-', { x: 44, y, size: 9, font: bold, color: negro }); y -= 13;
      wrap(`Evolucion: ${e.evolucion || '-'}`, 54, width - 100);
      wrap(`Prescripcion: ${e.prescripcion || '-'}`, 54, width - 100);
      y -= 4;
    });
  }
  y -= 16; checkPage();

  // Firma
  const medNomFirma = currentUser ? `Dr. ${currentUser.nombre || ''} ${currentUser.apellidos || ''}`.trim() : '-';
  const _p12HC = typeof getP12Activo === 'function' ? getP12Activo() : null;
  if (!_p12HC) {
    page.drawLine({ start: { x: width - 220, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
    page.drawText(medNomFirma, { x: width - 215, y: y - 14, size: 9, font: normal, color: gris });
    page.drawText('Médico tratante · MediLyft', { x: width - 215, y: y - 26, size: 8, font: normal, color: gris });
  }
  page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: 40, y: 40, size: 7, font: normal, color: gris });
  await dibujarFirmaElectronicaPDF(doc, page, { font: normal, color: gris, tipoDocumento: 'Historia clinica' });

  return await guardarPDFConFirma(doc, 'Historia clinica');
}

// ===== INTERCONSULTA PDF =====
async function generarInterconsultaPDF() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();
  const brand = rgb(1.0, 0.353, 0.373);
  const gris  = rgb(0.4, 0.4, 0.4);
  const negro = rgb(0, 0, 0);
  const blanco = rgb(1, 1, 1);
  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const gV = id => { const el = document.getElementById(id); return _pdfSafe(el ? (el.value || el.textContent || '').trim() : ''); };
  const gR = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || "—");

  page.drawRectangle({ x: 0, y: height - 75, width, height: 75, color: brand });
  page.drawText('MEDILYFT', { x: 40, y: height - 42, size: 20, font: bold, color: blanco });
  page.drawText('Hoja de Interconsulta', { x: 40, y: height - 62, size: 11, font: normal, color: blanco });
  page.drawText(`Fecha: ${gV('inter-fecha') || new Date().toLocaleDateString('es-EC')}`, { x: width - 185, y: height - 52, size: 9, font: normal, color: blanco });

  let y = height - 95;

  function seccion(titulo) {
    page.drawRectangle({ x: 40, y: y - 4, width: width - 80, height: 20, color: rgb(0.99, 0.95, 0.95) });
    page.drawText(titulo, { x: 44, y, size: 10, font: bold, color: brand }); y -= 26;
  }
  function campo(label, valor) {
    page.drawText(`${label}:`, { x: 44, y, size: 9, font: bold, color: gris });
    page.drawText(String(valor || '—'), { x: 190, y, size: 9, font: normal, color: negro }); y -= 14;
  }
  function campoDoble(l1, v1, l2, v2) {
    campo(l1, v1); y += 14;
    page.drawText(`${l2}:`, { x: width / 2 + 4, y, size: 9, font: bold, color: gris });
    page.drawText(String(v2 || '—'), { x: width / 2 + 4 + 140, y, size: 9, font: normal, color: negro }); y -= 14;
  }
  function wrap(texto) {
    const palabras = (texto || '—').split(' '); let linea = '';
    for (const p of palabras) {
      const test = linea ? `${linea} ${p}` : p;
      if (normal.widthOfTextAtSize(test, 9) > width - 90 && linea) {
        page.drawText(linea, { x: 44, y, size: 9, font: normal, color: negro }); y -= 13; linea = p;
      } else linea = test;
    }
    if (linea) { page.drawText(linea, { x: 44, y, size: 9, font: normal, color: negro }); y -= 13; }
  }

  seccion('DATOS DEL PACIENTE');
  campo('No. de historial', gV('inter-historial'));
  campo('Nombre completo', gV('inter-nombre'));
  campoDoble('Cédula', gV('inter-cedula'), 'Edad', gV('inter-edad'));
  campoDoble('Sexo', gR('inter-sexo'), 'Fecha nacimiento', gV('inter-fecha-nac'));
  campo('Estado civil', gR('inter-estado-civil'));
  campo('Domicilio', gV('inter-domicilio'));
  campo('Teléfono', gV('inter-telefono'));
  y -= 4;

  seccion('DATOS DE INTERCONSULTA');
  campo('Enviado del servicio de', gV('inter-de-servicio'));
  campo('Al servicio de', gV('inter-al-servicio'));
  campo('Diagnóstico', gV('inter-diagnostico'));
  campo('CIE-10', gV('inter-cie10-val'));
  campo('Tipo diagnóstico', gR('inter-dx-tipo'));
  y -= 4;

  seccion('JUSTIFICACIÓN');
  wrap(gV('inter-justificacion') || '—');
  y -= 30;

  // Firma
  const medNom = currentUser ? `Dr. ${currentUser.nombre || ''} ${currentUser.apellidos || ''}`.trim() : '—';
  const reg = currentUser?.numero_registro || '';
  page.drawText(`Fecha de solicitud: ${gV('inter-fecha')}`, { x: 44, y, size: 9, font: normal, color: negro }); y -= 14;
  page.drawText(`Profesional: ${medNom}`, { x: 44, y, size: 9, font: normal, color: negro }); y -= 30;
  const _p12Inter = typeof getP12Activo === 'function' ? getP12Activo() : null;
  if (!_p12Inter) {
    page.drawLine({ start: { x: width - 220, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
    page.drawText(medNom, { x: width - 215, y: y - 14, size: 9, font: normal, color: gris });
    if (reg) page.drawText(`Reg. MSP: ${reg}`, { x: width - 215, y: y - 26, size: 8, font: normal, color: gris });
    page.drawText('Firma y sello', { x: width - 215, y: y - 38, size: 8, font: normal, color: gris });
  }
  page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: 40, y: 40, size: 7, font: normal, color: gris });
  await dibujarFirmaElectronicaPDF(doc, page, { font: normal, color: gris, tipoDocumento: 'Interconsulta medica' });

  return await guardarPDFConFirma(doc, 'Interconsulta medica');
}

async function generarCertificadoPDF() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const resp = await fetch('/templates/certificado-medico.pdf');
  if (!resp.ok) { showToast('Error: plantilla certificado-medico.pdf no encontrada'); return; }
  const doc  = await PDFDocument.load(new Uint8Array(await resp.arrayBuffer()));
  const page = doc.getPage(0);
  const H    = page.getHeight();

  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negro   = rgb(0.05, 0.05, 0.05);
  const blanco  = rgb(1, 1, 1);
  const grisOsc = rgb(0.3, 0.3, 0.3);
  const teal    = rgb(0.0, 0.69, 0.68);

  const gV  = id => { const el = document.getElementById(id); return _pdfSafe((el ? (el.value || el.textContent || '') : '').trim()); };
  const gR  = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || '');
  const gCB = id => document.getElementById(id)?.checked || false;

  // White-out Vital Club logo/sello centrado (x=269-319, top=20-70 → y_pdf=772-822)
  page.drawRectangle({ x: 254, y: H - 72, width: 92, height: 57, color: blanco });
  const mltW = bold.widthOfTextAtSize('MEDILYFT', 9);
  page.drawText('MEDILYFT', { x: (595 - mltW) / 2, y: H - 52, size: 9, font: bold, color: teal });

  // Overlay helper: draws value text just above the template underline
  // yTop = pdfplumber "top" coordinate of the underline stroke
  const V = (val, x, yTop, maxW) => {
    const v = _pdfSafe(String(val || ''));
    if (v) page.drawText(v, { x, y: H - yTop + 3, size: 8, font: normal, color: negro, maxWidth: maxW || 355 });
  };

  // SECCIÓN A — datos del establecimiento (underlines at top=132, 147, 162, 177, 192)
  V(gV('cert-establecimiento'),           210, 132);
  V(gV('cert-correo-medico'),             210, 147);
  V(gV('cert-tel-emisor'),                210, 162);
  V(gV('cert-direccion-establecimiento'), 210, 177);
  V(gV('cert-lugar-fecha-emision'),       210, 192);

  // SECCIÓN B — datos del paciente (underlines at top=233, 248, 263, 278, 293, 307, 322)
  V(gV('cert-paciente'),       210, 233);
  V(gV('cert-direccion'),      210, 248);
  V(gV('cert-telefono'),       210, 263);
  V(gV('cert-empresa'),        210, 278);
  V(gV('cert-puesto-trabajo'), 210, 293);
  V(gV('cert-cedula'),         210, 307);
  V(gV('cert-hc'),             210, 322);

  // SECCIÓN C — diagnóstico (underlines at top=373 y 388)
  V(gV('cert-diagnostico'), 210, 373);
  V(gV('cert-cie10'),        210, 388);

  // Checkboxes fila 1 (top=395-410): Síntomas SI (x=225-255) / NO (x=532-562)
  if (gR('cert-sintomas') === 'SI') page.drawText('X', { x: 234, y: H - 406, size: 10, font: bold, color: negro });
  if (gR('cert-sintomas') === 'NO') page.drawText('X', { x: 541, y: H - 406, size: 10, font: bold, color: negro });

  // Checkboxes fila 2 (top=413-428): Enfermedad (x=225-255) / Aislamiento (x=532-562)
  if (gCB('cert-tipo-enfermedad'))  page.drawText('X', { x: 234, y: H - 424, size: 10, font: bold, color: negro });
  if (gCB('cert-tipo-aislamiento')) page.drawText('X', { x: 541, y: H - 424, size: 10, font: bold, color: negro });

  // Tipo de contingencia (underline top=448)
  V(gV('cert-tipo-contingencia'), 210, 448);

  // Descripción (caja x=45-569, top=473-533 → y_pdf=309-369)
  const descWords = _pdfSafe(gV('cert-descripcion') || '').split(' ');
  let dLinea = '', dY = H - 483;
  for (const w of descWords) {
    if (dY < H - 530) break;
    const test = dLinea ? dLinea + ' ' + w : w;
    if (normal.widthOfTextAtSize(test, 8) > 516 && dLinea) {
      page.drawText(dLinea, { x: 50, y: dY, size: 8, font: normal, color: negro }); dY -= 11; dLinea = w;
    } else dLinea = test;
  }
  if (dLinea && dY >= H - 530) page.drawText(dLinea, { x: 50, y: dY, size: 8, font: normal, color: negro });

  // Tipo de reposo (entre caja desc y campo días, top≈543)
  const tipoRep = gR('cert-reposo-tipo') || 'ABSOLUTO';
  page.drawText('Tipo de reposo: REPOSO ' + tipoRep, { x: 50, y: H - 543, size: 8, font: bold, color: negro });

  // Días concedidos (underline top=555)
  const diasNum   = gV('cert-dias-num');
  const diasLetra = gV('cert-dias-letra');
  V([diasNum ? diasNum + ' dias' : '', diasLetra ? '(' + diasLetra + ')' : ''].filter(Boolean).join(' '), 210, 555);

  // Desde (underline top=583)
  V([gV('cert-desde'), gV('cert-desde-letra')].filter(Boolean).join('   '), 210, 583);

  // Hasta (underline top=612)
  V([gV('cert-hasta'), gV('cert-hasta-letra')].filter(Boolean).join('   '), 210, 612);

  // White-out datos pre-rellenos de Vital Club (top=720-752 → y_pdf=90-122)
  page.drawRectangle({ x: 195, y: H - 758, width: 260, height: 54, color: blanco });

  // Línea de firma + datos del médico real
  const docNom = _pdfSafe(gV('cert-nombre-medico') || (currentUser ? `Dr. ${currentUser.nombre||''} ${currentUser.apellidos||''}`.trim() : ''));
  const docReg = _pdfSafe(gV('cert-reg-medico') || (currentUser?.numero_registro ? 'Reg. MSP: ' + currentUser.numero_registro : ''));
  const docEsp = _pdfSafe(currentUser?.especialidad || 'MEDICINA GENERAL');

  page.drawLine({ start:{x:245, y: H - 712}, end:{x:480, y: H - 712}, thickness: 0.5, color: rgb(0.5,0.5,0.5) });
  if (docNom) page.drawText(docNom, { x: 250, y: H - 726, size: 8,   font: bold,   color: negro,   maxWidth: 226 });
  if (docReg) page.drawText(docReg, { x: 250, y: H - 738, size: 7.5, font: normal, color: grisOsc, maxWidth: 226 });
  if (docEsp) page.drawText(docEsp, { x: 250, y: H - 750, size: 7.5, font: normal, color: grisOsc, maxWidth: 226 });

  await dibujarFirmaElectronicaPDF(doc, page, { font: normal, color: grisOsc, tipoDocumento: 'Certificado medico' });
  return await guardarPDFConFirma(doc, 'Certificado medico');
}

async function generarPedidoPDF() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const azul   = rgb(1.0, 0.353, 0.373);
  const gris   = rgb(0.4, 0.4, 0.4);
  const negro  = rgb(0, 0, 0);
  const blanco = rgb(1, 1, 1);

  const gV = id => { const el = document.getElementById(id); return _pdfSafe(el ? (el.value || el.textContent || '').trim() : ''); };

  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: azul });
  page.drawText('MEDILYFT', { x: 40, y: height - 45, size: 22, font: bold, color: blanco });
  page.drawText('Pedido de Laboratorio', { x: 40, y: height - 65, size: 11, font: normal, color: blanco });
  page.drawText(`Fecha: ${gV('lab-fecha') || new Date().toLocaleDateString('es-EC')}`, { x: width - 185, y: height - 55, size: 9, font: normal, color: blanco });

  let y = height - 110;

  function seccion(titulo) {
    page.drawRectangle({ x: 40, y: y - 4, width: width - 80, height: 20, color: rgb(0.9, 0.93, 0.97) });
    page.drawText(titulo, { x: 44, y, size: 10, font: bold, color: azul });
    y -= 28;
  }

  function campo(label, valor) {
    page.drawText(`${label}:`, { x: 44, y, size: 9, font: bold, color: gris });
    page.drawText(String(valor || '—'), { x: 180, y, size: 9, font: normal, color: negro });
    y -= 16;
  }

  function wrap(texto) {
    const palabras = (texto || '').split(' '); let linea = '';
    for (const p of palabras) {
      const test = linea ? `${linea} ${p}` : p;
      if (normal.widthOfTextAtSize(test, 9) > width - 100 && linea) {
        page.drawText(linea, { x: 54, y, size: 9, font: normal, color: negro }); y -= 14; linea = p;
      } else { linea = test; }
    }
    if (linea) { page.drawText(linea, { x: 54, y, size: 9, font: normal, color: negro }); y -= 14; }
  }

  seccion('DATOS DEL PACIENTE');
  campo('Nombre', gV('lab-paciente'));
  campo('Cédula', gV('lab-cedula'));
  campo('Edad', gV('lab-edad'));
  y -= 6;

  seccion('DIAGNÓSTICO / INDICACIÓN');
  campo('Diagnóstico', gV('lab-diagnostico'));
  y -= 6;

  seccion('EXÁMENES SOLICITADOS');
  const categorias = [...document.querySelectorAll('#docLaboratorio .lab-col')].map(col => ({
    titulo: col.querySelector('.lab-col-title')?.textContent.trim() || '',
    items: [...col.querySelectorAll('.lab-item')]
      .filter(item => item.querySelector('.lab-check')?.checked)
      .map(item => item.textContent.trim())
  })).filter(c => c.items.length);
  const otrosExamenes = gV('lab-otros-examenes');

  if (!categorias.length && !otrosExamenes) {
    page.drawText('—', { x: 44, y, size: 9, font: normal, color: negro }); y -= 16;
  } else {
    categorias.forEach(c => {
      page.drawText(c.titulo, { x: 44, y, size: 9, font: bold, color: negro }); y -= 14;
      c.items.forEach(it => { page.drawText(`• ${it}`, { x: 54, y, size: 9, font: normal, color: negro }); y -= 14; });
      y -= 4;
    });
    if (otrosExamenes) {
      page.drawText('Otros exámenes', { x: 44, y, size: 9, font: bold, color: negro }); y -= 14;
      wrap(otrosExamenes);
      y -= 4;
    }
  }
  y -= 6;

  const instrucciones = gV('lab-instrucciones');
  if (instrucciones) {
    seccion('INSTRUCCIONES / PREPARACIÓN');
    wrap(instrucciones);
    y -= 6;
  }

  y -= 30;
  const nombreMedico2 = gV('lab-nombre-medico') || (currentUser ? `Dr. ${currentUser.nombre || ''} ${currentUser.apellidos || ''}`.trim() : '—');
  const _p12Lab = typeof getP12Activo === 'function' ? getP12Activo() : null;
  if (!_p12Lab) {
    page.drawLine({ start: { x: width - 220, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
    page.drawText(nombreMedico2, { x: width - 215, y: y - 14, size: 8, font: normal, color: gris });
    const regMedico = gV('lab-reg-medico');
    if (regMedico) page.drawText(regMedico, { x: width - 215, y: y - 26, size: 8, font: normal, color: gris });
    page.drawText(gV('lab-esp-medico') || '—', { x: width - 215, y: y - 38, size: 8, font: normal, color: gris });
  }
  page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: 40, y: 40, size: 7, font: normal, color: gris });
  await dibujarFirmaElectronicaPDF(doc, page, { font: normal, color: gris, tipoDocumento: 'Pedido de laboratorio' });

  return await guardarPDFConFirma(doc, 'Pedido de laboratorio');
}
