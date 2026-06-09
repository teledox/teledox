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

  seccion('MEDICAMENTOS PRESCRITOS');
  const meds = [...document.querySelectorAll('#rec-meds-body tr')].map(tr => {
    const nombre = tr.querySelector('.med-nombre')?.value.trim();
    if (!nombre) return null;
    const frecSel = tr.querySelector('.med-frecuencia');
    const frecuencia = frecSel?.value ? (frecSel.selectedOptions[0]?.textContent || '') : '';
    return { nombre: _pdfSafe(nombre), dosis: _pdfSafe(tr.querySelector('.med-dosis')?.value.trim() || ''), frecuencia: _pdfSafe(frecuencia), dias: _pdfSafe(tr.querySelector('.med-dias')?.value.trim() || '') };
  }).filter(m => m && m.nombre);
  if (!meds.length) {
    page.drawText('—', { x: 44, y, size: 9, font: normal, color: negro }); y -= 14;
  } else {
    meds.forEach((m, i) => {
      page.drawText(`${i + 1}. ${m.nombre}`, { x: 44, y, size: 9, font: bold, color: negro }); y -= 13;
      const detalle = [m.dosis, m.frecuencia, m.dias ? `${m.dias} día(s)` : ''].filter(Boolean).join(' · ');
      page.drawText(detalle, { x: 54, y, size: 9, font: normal, color: gris }); y -= 16;
    });
  }
  y -= 4;

  seccion('INDICACIONES');
  wrap(gV('rec-indicaciones'));
  y -= 4;

  seccion('MEDIDAS NO FARMACOLÓGICAS');
  wrap(gV('rec-medidas-no-farmacologicas'));
  y -= 30;

  // Firma
  const medNom = gV('rec-nombre-medico') || (currentUser ? `Dr. ${currentUser.nombre || ''} ${currentUser.apellidos || ''}`.trim() : '—');
  page.drawLine({ start: { x: width - 220, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
  page.drawText(medNom, { x: width - 215, y: y - 14, size: 9, font: normal, color: gris });
  const reg = gV('rec-reg-medico');
  if (reg) page.drawText(reg, { x: width - 215, y: y - 26, size: 8, font: normal, color: gris });
  page.drawText(gV('rec-esp-medico') || '—', { x: width - 215, y: y - 38, size: 8, font: normal, color: gris });
  page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: 40, y: 40, size: 7, font: normal, color: gris });

  return await doc.save();
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
  const gCB = ids => ids.filter(id => { const el = document.getElementById(id); return el && el.checked; }).map(id => id.replace(/^hcaf-/,'').replace(/-/g,' ')).join(', ') || '—';

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
    page.drawText(String(valor || '—'), { x: x2 + 140, y, size: 9, font: normal, color: negro });
    y -= 14;
  }
  function campoDoble(l1, v1, l2, v2) {
    const half = width / 2 - 40;
    campo(l1, v1, 44); y += 14;
    page.drawText(`${l2}:`, { x: 44 + half, y, size: 9, font: bold, color: gris });
    page.drawText(String(v2 || '—'), { x: 44 + half + 140, y, size: 9, font: normal, color: negro });
    y -= 14;
  }
  function wrap(texto, startX, maxW) {
    const palabras = (texto || '—').split(' '); let linea = '';
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
  wrap(gV('hc-ant-personales') || '—', 44, width - 90); y -= 4; checkPage();

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

  // Signos vitales
  seccion('SIGNOS VITALES Y ANTROPOMETRÍA');
  const sv = [['Peso',gV('hc-peso')],['Talla',gV('hc-talla')],['Temperatura',gV('hc-temperatura')],['Pulso',gV('hc-pulso')],['Respiración',gV('hc-respiracion')],['Tensión Arterial',gV('hc-ta')],['Oximetría',gV('hc-oximetria')],['IMC',gV('hc-imc')]];
  sv.forEach(([l, v], i) => {
    const xPos = i % 2 === 0 ? 44 : width / 2;
    page.drawText(`${l}: ${v || '—'}`, { x: xPos, y, size: 9, font: normal, color: negro });
    if (i % 2 === 1) y -= 14;
  });
  y -= 14; checkPage();

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
    page.drawText('—', { x: 44, y, size: 9, font: normal, color: negro }); y -= 14;
  } else {
    evoluciones.forEach(e => {
      page.drawText(`${e.fecha || '—'}`, { x: 44, y, size: 9, font: bold, color: negro }); y -= 13;
      wrap(`Evolución: ${e.evolucion || '—'}`, 54, width - 100);
      wrap(`Prescripción: ${e.prescripcion || '—'}`, 54, width - 100);
      y -= 4;
    });
  }
  y -= 16; checkPage();

  // Firma
  const medNomFirma = currentUser ? `Dr. ${currentUser.nombre || ''} ${currentUser.apellidos || ''}`.trim() : '—';
  page.drawLine({ start: { x: width - 220, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
  page.drawText(medNomFirma, { x: width - 215, y: y - 14, size: 9, font: normal, color: gris });
  page.drawText('Médico tratante · MediLyft', { x: width - 215, y: y - 26, size: 8, font: normal, color: gris });
  page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: 40, y: 40, size: 7, font: normal, color: gris });

  return await doc.save();
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
  page.drawLine({ start: { x: width - 220, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
  page.drawText(medNom, { x: width - 215, y: y - 14, size: 9, font: normal, color: gris });
  if (reg) page.drawText(`Reg. MSP: ${reg}`, { x: width - 215, y: y - 26, size: 8, font: normal, color: gris });
  page.drawText('Firma y sello', { x: width - 215, y: y - 38, size: 8, font: normal, color: gris });
  page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: 40, y: 40, size: 7, font: normal, color: gris });

  return await doc.save();
}

async function generarCertificadoPDF() {
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
  const gCB = id => document.getElementById(id)?.checked || false;

  page.drawRectangle({ x: 0, y: height - 75, width, height: 75, color: brand });
  page.drawText('MEDILYFT', { x: 40, y: height - 42, size: 20, font: bold, color: blanco });
  page.drawText('Certificado Médico', { x: 40, y: height - 62, size: 11, font: normal, color: blanco });
  page.drawText(gV('cert-lugar-fecha') || `Fecha: ${new Date().toLocaleDateString('es-EC')}`, { x: width - 220, y: height - 52, size: 9, font: normal, color: blanco });

  let y = height - 95;

  function seccion(titulo) {
    page.drawRectangle({ x: 40, y: y - 4, width: width - 80, height: 20, color: rgb(0.99, 0.95, 0.95) });
    page.drawText(titulo, { x: 44, y, size: 10, font: bold, color: brand }); y -= 26;
  }
  function campo(label, valor) {
    page.drawText(`${label}:`, { x: 44, y, size: 9, font: bold, color: gris });
    page.drawText(String(valor || '—'), { x: 220, y, size: 9, font: normal, color: negro }); y -= 14;
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

  seccion('A) DATOS DEL ESTABLECIMIENTO DE SALUD');
  campo('Nombre del establecimiento', gV('cert-establecimiento'));
  campo('Correo del médico', gV('cert-correo-medico'));
  campo('Teléfono del emisor', gV('cert-tel-emisor'));
  campo('Dirección del establecimiento', gV('cert-direccion-establecimiento'));
  campo('Lugar y fecha de emisión', gV('cert-lugar-fecha-emision'));
  y -= 4;

  seccion('B) DATOS DEL PACIENTE');
  campo('Apellidos y nombres', gV('cert-paciente'));
  campo('Dirección domiciliaria', gV('cert-direccion'));
  campo('Número de teléfono', gV('cert-telefono'));
  campo('Puesto de trabajo', gV('cert-puesto-trabajo'));
  campo('Número de identificación', gV('cert-cedula'));
  campo('Número de historia clínica', gV('cert-hc'));
  campo('Institución/empresa de trabajo', gV('cert-empresa'));
  y -= 4;

  seccion('C) MOTIVO DE AISLAMIENTO/ENFERMEDAD');
  campo('Diagnóstico', gV('cert-diagnostico'));
  campo('Código CIE-10', gV('cert-cie10'));
  campo('Tipo de contingencia', gV('cert-tipo-contingencia'));
  campo('Aislamiento/teletrabajo', gCB('cert-aislamiento') ? 'SÍ' : 'NO');
  campo('Presenta síntomas', gR('cert-sintomas'));
  page.drawText('Descripción de la enfermedad:', { x: 44, y, size: 9, font: bold, color: gris }); y -= 14;
  wrap(gV('cert-descripcion'));
  y -= 4;
  campo('Total de días concedidos', `${gV('cert-dias-num') || '—'} (${gV('cert-dias-letra') || '—'})`);
  campo('Desde', `${gV('cert-desde') || '—'} — ${gV('cert-desde-letra') || '—'}`);
  campo('Hasta', `${gV('cert-hasta') || '—'} — ${gV('cert-hasta-letra') || '—'}`);
  y -= 30;

  // Firma
  const medNom = gV('cert-nombre-medico') || (currentUser ? `Dr. ${currentUser.nombre || ''} ${currentUser.apellidos || ''}`.trim() : '—');
  page.drawLine({ start: { x: width - 220, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
  page.drawText(medNom, { x: width - 215, y: y - 14, size: 9, font: normal, color: gris });
  const reg = gV('cert-reg-medico');
  if (reg) page.drawText(reg, { x: width - 215, y: y - 26, size: 8, font: normal, color: gris });
  page.drawText('Firma y sello', { x: width - 215, y: y - 38, size: 8, font: normal, color: gris });
  page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: 40, y: 40, size: 7, font: normal, color: gris });

  return await doc.save();
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
  page.drawLine({ start: { x: width - 220, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
  page.drawText(nombreMedico2, { x: width - 215, y: y - 14, size: 8, font: normal, color: gris });
  const regMedico = gV('lab-reg-medico');
  if (regMedico) page.drawText(regMedico, { x: width - 215, y: y - 26, size: 8, font: normal, color: gris });
  page.drawText(gV('lab-esp-medico') || '—', { x: width - 215, y: y - 38, size: 8, font: normal, color: gris });

  page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: 40, y: 40, size: 7, font: normal, color: gris });

  return await doc.save();
}
