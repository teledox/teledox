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
  page.drawText('Receta Médica', { x: 40, y: height - 62, size: 11, font: normal, color: blanco });
  page.drawText(`N° ${gV('rec-numero')}`, { x: width - 185, y: height - 52, size: 9, font: normal, color: blanco });
  page.drawText(`Fecha: ${gV('rec-fecha-header') || new Date().toLocaleDateString('es-EC')}`, { x: width - 185, y: height - 64, size: 8, font: normal, color: blanco });

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
    page.drawText(String(v2 || '—'), { x: width / 2 + 4 + 100, y, size: 9, font: normal, color: negro }); y -= 14;
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
  campo('Nombres y apellidos', gV('rec-paciente'));
  campoDoble('Cédula', gV('rec-cedula'), 'Edad', gV('rec-edad'));
  campoDoble('Sexo (M-F)', gV('rec-sexo'), 'N° Hoja', gV('rec-hoja'));
  campo('N° de atención', gV('rec-atencion'));
  y -= 4;

  seccion('DIAGNÓSTICO');
  campo('Diagnóstico', gV('rec-diagnostico'));
  campo('CIE-10', gV('rec-cie10'));
  y -= 4;

  seccion('ALERGIAS');
  const alergia = gR('rec-alergias');
  campo('¿Presenta alergias?', alergia);
  if (alergia === 'SI') campo('Especificar', gV('rec-alergias-especificar'));
  y -= 4;

  seccion('ANTROPOMETRÍA');
  campoDoble('Peso', gV('rec-peso') ? `${gV('rec-peso')} kg` : '—', 'Talla', gV('rec-talla') ? `${gV('rec-talla')} cm` : '—');
  y -= 4;

  const meds = [...document.querySelectorAll('#rec-meds-body tr')].map(tr => {
    const nombre = tr.querySelector('.med-nombre')?.value.trim();
    if (!nombre) return null;
    const frecSel = tr.querySelector('.med-frecuencia');
    const frecuencia = frecSel?.value ? (frecSel.selectedOptions[0]?.textContent || '') : '';
    return { nombre: _pdfSafe(nombre), dosis: _pdfSafe(tr.querySelector('.med-dosis')?.value.trim() || ''), frecuencia: _pdfSafe(frecuencia), dias: _pdfSafe(tr.querySelector('.med-dias')?.value.trim() || '') };
  }).filter(m => m && m.nombre);

  // MEDICINAS e INDICACIONES en dos columnas (facilidad de lectura para el paciente)
  const colGap = 18;
  const leftX = 44, rightX = width / 2 + colGap / 2;
  const colW = (width - 88 - colGap) / 2;

  function colHeader(titulo, x) {
    page.drawRectangle({ x: x - 4, y: y - 4, width: colW + 8, height: 18, color: rgb(0.99, 0.95, 0.95) });
    page.drawText(titulo, { x, y, size: 10, font: bold, color: brand });
  }
  colHeader('MEDICINAS', leftX);
  colHeader('INDICACIONES', rightX);
  const colStartY = y - 24;

  // Dibuja una columna de items numerados con wrapping; devuelve la y final
  function drawColumn(items, x, startY) {
    let cy = startY;
    (items.length ? items : ['—']).forEach((txt, i) => {
      const palabras = `${i + 1}. ${txt}`.split(' '); let linea = '';
      for (const p of palabras) {
        const test = linea ? `${linea} ${p}` : p;
        if (normal.widthOfTextAtSize(test, 9) > colW && linea) {
          page.drawText(linea, { x, y: cy, size: 9, font: normal, color: negro }); cy -= 12; linea = p;
        } else linea = test;
      }
      if (linea) { page.drawText(linea, { x, y: cy, size: 9, font: normal, color: negro }); cy -= 12; }
      cy -= 4;
    });
    return cy;
  }

  const medItems = meds.map(m => {
    const extra = [m.dosis, m.frecuencia, m.dias ? `${m.dias} día(s)` : ''].filter(Boolean).join(', ');
    return extra ? `${m.nombre} (${extra})` : m.nombre;
  });
  const indicTxt = gV('rec-indicaciones');
  const indicItems = indicTxt ? indicTxt.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];

  const yLeft  = drawColumn(medItems, leftX, colStartY);
  const yRight = drawColumn(indicItems, rightX, colStartY);
  y = Math.min(yLeft, yRight) - 6;

  seccion('MEDIDAS NO FARMACOLÓGICAS');
  wrap(gV('rec-medidas-no-farmacologicas'));
  y -= 30;

  // Firma
  const medNom = gV('rec-nombre-medico') || (currentUser ? `Dr. ${currentUser.nombre || ''} ${currentUser.apellidos || ''}`.trim() : '—');
  const _p12Rec = typeof getP12Activo === 'function' ? getP12Activo() : null;
  if (!_p12Rec) {
    page.drawLine({ start: { x: width - 220, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
    page.drawText(medNom, { x: width - 215, y: y - 14, size: 9, font: normal, color: gris });
    const reg = gV('rec-reg-medico');
    if (reg) page.drawText(reg, { x: width - 215, y: y - 26, size: 8, font: normal, color: gris });
    page.drawText(gV('rec-esp-medico') || '—', { x: width - 215, y: y - 38, size: 8, font: normal, color: gris });
  }
  page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: 40, y: 40, size: 7, font: normal, color: gris });
  await dibujarFirmaElectronicaPDF(doc, page, { font: normal, color: gris, tipoDocumento: 'Receta medica' });

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
  const doc = await PDFDocument.create();

  const azulOscuro = rgb(0.10, 0.22, 0.38);
  const azulMed    = rgb(0.16, 0.34, 0.60);
  const azulClaro  = rgb(0.88, 0.94, 0.99);
  const grisClaro  = rgb(0.95, 0.96, 0.97);
  const verdeClaro = rgb(0.86, 0.96, 0.86);
  const negro      = rgb(0.08, 0.08, 0.08);
  const gris       = rgb(0.38, 0.38, 0.38);
  const blanco     = rgb(1, 1, 1);
  const bordeCol   = rgb(0.78, 0.84, 0.90);

  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();

  const gV  = id => { const el = document.getElementById(id); return _pdfSafe((el ? (el.value || el.textContent || '') : '').trim()); };
  const gR  = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || '');
  const gCB = id => document.getElementById(id)?.checked || false;

  const L = 40, R = width - 40, W = R - L;
  const LBL = 185, RH = 18;
  const VX = L + LBL, VW = W - LBL;

  let y = height;

  // ── HEADER ──────────────────────────────────────────────────────────────────
  const HDR = 58;
  page.drawRectangle({ x: 0, y: height - HDR, width, height: HDR, color: azulOscuro });
  page.drawText('MEDILYFT', { x: L, y: height - 24, size: 15, font: bold, color: blanco });
  page.drawText('Teleconsultas medicas · Ecuador', { x: L, y: height - 39, size: 7.5, font: normal, color: rgb(0.78, 0.87, 0.96) });
  const titulo = 'CERTIFICADO MEDICO';
  const tW = bold.widthOfTextAtSize(titulo, 13);
  page.drawText(titulo, { x: (width - tW) / 2, y: height - 33, size: 13, font: bold, color: blanco });
  const fechaHdr = gV('cert-lugar-fecha') || new Date().toLocaleDateString('es-EC');
  page.drawText(fechaHdr, { x: R - normal.widthOfTextAtSize(fechaHdr, 7.5), y: height - 39, size: 7.5, font: normal, color: rgb(0.82, 0.90, 0.97) });

  y = height - HDR - 8;

  function secHdr(t) {
    page.drawRectangle({ x: L, y: y - 3, width: W, height: RH + 3, color: azulMed });
    page.drawText(_pdfSafe(t), { x: L + 6, y: y + 2, size: 9, font: bold, color: blanco });
    y -= RH + 3 + 2;
  }

  function fila(lbl, val, valBg) {
    const bg = valBg || azulClaro;
    page.drawRectangle({ x: L, y: y - 2, width: LBL, height: RH, color: grisClaro });
    page.drawText(_pdfSafe(lbl), { x: L + 5, y: y + 2, size: 7.5, font: bold, color: gris });
    page.drawRectangle({ x: VX, y: y - 2, width: VW, height: RH, color: bg });
    const v = _pdfSafe(String(val || ''));
    if (v) page.drawText(v, { x: VX + 5, y: y + 2, size: 8, font: normal, color: negro });
    page.drawLine({ start: { x: L, y: y - 2 }, end: { x: R, y: y - 2 }, thickness: 0.3, color: bordeCol });
    y -= RH;
  }

  function filaCheckbox(lbl, items) {
    page.drawRectangle({ x: L, y: y - 2, width: LBL, height: RH, color: grisClaro });
    page.drawText(_pdfSafe(lbl), { x: L + 5, y: y + 2, size: 7.5, font: bold, color: gris });
    page.drawRectangle({ x: VX, y: y - 2, width: VW, height: RH, color: azulClaro });
    let cx = VX + 6;
    for (const it of items) {
      page.drawRectangle({ x: cx, y: y + 1, width: 8, height: 8, color: blanco, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.7 });
      if (it.on) {
        page.drawLine({ start: { x: cx + 1, y: y + 4 }, end: { x: cx + 3, y: y + 1 }, thickness: 1.2, color: azulMed });
        page.drawLine({ start: { x: cx + 3, y: y + 1 }, end: { x: cx + 7, y: y + 7 }, thickness: 1.2, color: azulMed });
      }
      const tl = _pdfSafe(it.label);
      page.drawText(tl, { x: cx + 12, y: y + 2, size: 8, font: normal, color: negro });
      cx += 12 + normal.widthOfTextAtSize(tl, 8) + 18;
    }
    page.drawLine({ start: { x: L, y: y - 2 }, end: { x: R, y: y - 2 }, thickness: 0.3, color: bordeCol });
    y -= RH;
  }

  function filaTexto(lbl, txt) {
    const safe = _pdfSafe(txt) || '-';
    const words = safe.split(' ');
    const lines = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (normal.widthOfTextAtSize(test, 8) > VW - 10 && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    const h = Math.max(RH, lines.length * 12 + 6);
    page.drawRectangle({ x: L, y: y - h + RH, width: LBL, height: h, color: grisClaro });
    page.drawText(_pdfSafe(lbl), { x: L + 5, y: y + 2, size: 7.5, font: bold, color: gris });
    page.drawRectangle({ x: VX, y: y - h + RH, width: VW, height: h, color: azulClaro });
    let ty = y + 2;
    for (const l of lines) { page.drawText(l, { x: VX + 5, y: ty, size: 8, font: normal, color: negro }); ty -= 12; }
    page.drawLine({ start: { x: L, y: y - h + RH - 1 }, end: { x: R, y: y - h + RH - 1 }, thickness: 0.3, color: bordeCol });
    y -= h;
  }

  // ── SECCIÓN A ────────────────────────────────────────────────────────────────
  y -= 2;
  secHdr('A) DATOS DEL ESTABLECIMIENTO DE SALUD');
  fila('Nombre del establecimiento', gV('cert-establecimiento'));
  fila('Correo del medico', gV('cert-correo-medico'));
  fila('Telefono del emisor', gV('cert-tel-emisor'));
  fila('Direccion del establecimiento', gV('cert-direccion-establecimiento'));
  fila('Lugar y fecha de emision', gV('cert-lugar-fecha-emision'));
  y -= 5;

  // ── SECCIÓN B ────────────────────────────────────────────────────────────────
  secHdr('B) DATOS DEL PACIENTE');
  fila('Apellidos y nombres', gV('cert-paciente'));
  fila('Direccion domiciliaria', gV('cert-direccion'));
  fila('Numero de telefono', gV('cert-telefono'));
  fila('Institucion/empresa de trabajo', gV('cert-empresa'));
  fila('Puesto de trabajo', gV('cert-puesto-trabajo'));
  fila('Numero de identificacion', gV('cert-cedula'));
  fila('Numero de historia clinica', gV('cert-hc'));
  y -= 5;

  // ── SECCIÓN C ────────────────────────────────────────────────────────────────
  secHdr('C) MOTIVO DE AISLAMIENTO/ENFERMEDAD');
  fila('Diagnostico', gV('cert-diagnostico'));
  fila('Codigo CIE-10', gV('cert-cie10'));
  filaCheckbox('Presenta Sintomas', [
    { label: 'SI', on: gR('cert-sintomas') === 'SI' },
    { label: 'NO', on: gR('cert-sintomas') === 'NO' }
  ]);
  filaCheckbox('Tipo de caso', [
    { label: 'Enfermedad', on: gCB('cert-tipo-enfermedad') },
    { label: 'Aislamiento/teletrabajo', on: gCB('cert-tipo-aislamiento') }
  ]);
  fila('Tipo de Contingencia', gV('cert-tipo-contingencia'));
  filaTexto('Descripcion de la enfermedad', gV('cert-descripcion'));
  y -= 5;

  // ── REPOSO MÉDICO ─────────────────────────────────────────────────────────────
  secHdr('REPOSO MEDICO');
  const tipoRep = gR('cert-reposo-tipo') || 'ABSOLUTO';
  fila('Tipo de reposo', 'REPOSO ' + tipoRep, verdeClaro);
  fila('Total de dias concedidos', (gV('cert-dias-num') || '-') + ' dias   (' + (gV('cert-dias-letra') || '-') + ')');
  fila('Desde', (gV('cert-desde') || '-') + '   ' + (gV('cert-desde-letra') || '-'));
  fila('Hasta', (gV('cert-hasta') || '-') + '   ' + (gV('cert-hasta-letra') || '-'));
  y -= 14;

  // ── FIRMA ─────────────────────────────────────────────────────────────────────
  const medNom = _pdfSafe(gV('cert-nombre-medico') || (currentUser ? ('Dr. ' + (currentUser.nombre || '') + ' ' + (currentUser.apellidos || '')).trim() : '-'));
  const _p12Cert = typeof getP12Activo === 'function' ? getP12Activo() : null;
  if (!_p12Cert) {
    const sigX = R - 180;
    page.drawLine({ start: { x: sigX, y }, end: { x: R, y }, thickness: 0.5, color: gris });
    page.drawText(medNom, { x: sigX, y: y - 13, size: 8, font: normal, color: gris });
    const reg = gV('cert-reg-medico');
    if (reg) page.drawText(reg, { x: sigX, y: y - 25, size: 7.5, font: normal, color: gris });
    page.drawText('Firma y sello', { x: sigX, y: y - 37, size: 7.5, font: normal, color: gris });
  }
  page.drawLine({ start: { x: L, y: 55 }, end: { x: R, y: 55 }, thickness: 0.4, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: L, y: 42, size: 7, font: normal, color: gris });
  await dibujarFirmaElectronicaPDF(doc, page, { font: normal, color: gris, tipoDocumento: 'Certificado medico' });

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
