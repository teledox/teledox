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

  const resp = await fetch('/templates/historial-clinico.pdf');
  if (!resp.ok) { showToast('Error: plantilla historial-clinico.pdf no encontrada'); return; }
  const doc   = await PDFDocument.load(new Uint8Array(await resp.arrayBuffer()));
  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negro   = rgb(0.05, 0.05, 0.05);
  const gris    = rgb(0.35, 0.35, 0.35);
  const H = 842;

  const gV  = id => { const el = document.getElementById(id); return _pdfSafe((el ? (el.value || el.textContent || '') : '').trim()); };
  const gR  = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || '');
  const gCB = id => document.getElementById(id)?.checked || false;

  // Escribe valor en el campo del template usando coordenadas pdfplumber
  // x, yBot = coordenadas del borde inferior del label en pdfplumber
  const V = (pg, val, x, yBot, maxW) => {
    const v = _pdfSafe(String(val || ''));
    if (v) pg.drawText(v, { x, y: H - yBot + 1, size: 7.5, font: normal, color: negro, maxWidth: maxW || 240 });
  };
  const MX = (pg, x, yTop) => pg.drawText('X', { x, y: H - yTop - 7, size: 9, font: bold, color: negro });

  const p1 = doc.getPage(0);
  const p2 = doc.getPage(1);
  const p3 = doc.getPage(2);

  // ── PÁGINA 1 — Identificación ──────────────────────────────────────────────
  // No. de Historial (label bot=122, x=134)
  V(p1, gV('hc-historial'),  260, 122, 75);
  // Nombre Completo (label bot=144, x=133)
  V(p1, gV('hc-nombre'),     260, 144, 290);
  // Primer / Segundo Apellido (label bot=166)
  V(p1, gV('hc-primer-ap'),  110, 166, 190);
  V(p1, gV('hc-segundo-ap'), 408, 166, 140);
  // Cédula / Edad (label bot=188)
  V(p1, gV('hc-cedula'),     115, 188, 250);
  V(p1, gV('hc-edad'),       444, 188, 85);
  // Sexo (radio): Femenino x=89, Masculino x=220 (label top=198)
  if (gR('hc-sexo') === 'F' || gR('hc-sexo').toLowerCase().includes('fem')) MX(p1, 80, 198);
  else MX(p1, 211, 198);
  // Fecha de Nacimiento (label bot=210, x=329)
  V(p1, gV('hc-fecha-nac'), 442, 210, 115);
  // Lugar de Nacimiento (label bot=232)
  V(p1, gV('hc-lugar-nac'), 262, 232, 295);
  // Estado Civil (label top=242): Soltero x=131, Casado x=212, Divorciado x=296, Viudo x=397, Unión x=471
  const ecHC = { 'Soltero':122, 'Casado':203, 'Divorciado':287, 'Viudo':388, 'Union Libre':462, 'Unión Libre':462 };
  const ecHCx = ecHC[gR('hc-estado-civil')];
  if (ecHCx) MX(p1, ecHCx, 242);
  // Domicilio (label bot=276)
  V(p1, gV('hc-domicilio'), 250, 276, 295);
  // Ocupación / Teléfono (label bot=298)
  V(p1, gV('hc-ocupacion'), 100, 298, 195);
  V(p1, gV('hc-telefono'),  430, 298, 130);
  // Motivo de consulta (área bajo label top=338)
  V(p1, gV('hc-motivo'), 33, 388, 520);
  // Antecedentes personales (área bajo label top=391, texto en y≈H-470)
  const antPers = [gV('hc-cronicas-texto'), gV('hc-ant-personales')].filter(Boolean).join(' | ');
  if (antPers) p1.drawText(_pdfSafe(antPers), { x: 33, y: H - 470, size: 7.5, font: normal, color: negro, maxWidth: 520 });
  // Antecedentes Familiares checkboxes (top=541 y top=566)
  const afPos = [
    ['hcaf-cardiopatia',24,541],['hcaf-diabetes',131,541],['hcaf-enf-cardiovascular',221,541],
    ['hcaf-hipertension',385,541],['hcaf-cancer',498,541],
    ['hcaf-tuberculosis',24,566],['hcaf-enf-mental',141,566],['hcaf-enf-infecciosa',252,566],
    ['hcaf-mal-formacion',380,566],['hcaf-otro',507,566],
  ];
  afPos.forEach(([id, x, yTop]) => { if (gCB(id)) MX(p1, x, yTop); });
  const antFamNotas = gV('hc-ant-familiares-notas');
  if (antFamNotas) p1.drawText(antFamNotas, { x: 33, y: H - 610, size: 7.5, font: normal, color: negro, maxWidth: 520 });
  // Enfermedad o Problema Actual (label top=669, texto bajo)
  V(p1, gV('hc-enfermedad'), 33, 720, 520);

  // ── PÁGINA 2 — Órganos / Signos Vitales ───────────────────────────────────
  // CP/SP para órganos — fila 1 (labels top=71): CP/SP headers top=62
  const orgFila1 = [
    ['hco-card', 86, 104],['hco-resp', 202, 220],['hco-cardv', 332, 348],
    ['hco-dig',  434, 450],['hco-gen',  524, 542],
  ];
  const orgFila2 = [
    ['hco-uri',  70, 86],['hco-musc', 216, 234],['hco-end', 314, 330],
    ['hco-hem', 434, 452],['hco-nerv', 526, 542],
  ];
  [...orgFila1, ...orgFila2].forEach(([radio, cpX, spX], i) => {
    const yTop = i < 5 ? 62 : 90;
    const val = gR(radio);
    if (val === 'CP') MX(p2, cpX, yTop);
    if (val === 'SP') MX(p2, spX, yTop);
  });
  // Examen físico regional — usa mismas posiciones pero en área diferente (approximado top=120)
  const efPos = [
    ['hce-cab',55,120],['hce-cue',205,120],['hce-tor',330,120],
    ['hce-abd',55,130],['hce-pel',205,130],['hce-ext',330,130],
  ];
  efPos.forEach(([radio, x, yTop]) => {
    const val = gR(radio);
    if (val === 'CP') p2.drawText('CP', { x, y: H-yTop-7, size: 7, font: bold, color: negro });
    if (val === 'SP') p2.drawText('SP', { x, y: H-yTop-7, size: 7, font: bold, color: negro });
  });
  // Signos Vitales (label bots: Peso/Talla=234, Temperatura/Pulso/Respiración=256, T/A/Oximetría=278)
  V(p2, gV('hc-peso')        ? gV('hc-peso') + ' kg'  : '', 100, 234, 70);
  V(p2, gV('hc-talla')       ? gV('hc-talla') + ' cm' : '', 245, 234, 70);
  V(p2, gV('hc-temperatura') || '', 145, 256, 75);
  V(p2, gV('hc-pulso')       || '', 295, 256, 75);
  V(p2, gV('hc-respiracion') || '', 460, 256, 75);
  V(p2, gV('hc-tension-arterial') || '', 145, 278, 85);
  V(p2, gV('hc-oximetria')   || '', 345, 278, 75);
  // Diagnóstico (aproximado, área baja de página 2)
  for (let i = 1; i <= 4; i++) {
    const dx = gV(`hc-dx-${i}`);
    if (dx) {
      const tipo = gR(`hc-dx-tipo-${i}`);
      p2.drawText(`${i}. ${_pdfSafe(dx)}${tipo ? ' [' + tipo + ']' : ''}`, { x: 33, y: H - 340 - (i-1)*14, size: 7.5, font: normal, color: negro, maxWidth: 520 });
    }
  }
  // Tratamiento
  const trat = gV('hc-tratamiento');
  if (trat) p2.drawText(_pdfSafe(trat), { x: 33, y: H - 430, size: 7.5, font: normal, color: negro, maxWidth: 520 });

  // ── PÁGINA 3 — Evolución ───────────────────────────────────────────────────
  const evoluciones = [...document.querySelectorAll('#hc-evolucion-body tr')].map(tr => {
    const inputs = tr.querySelectorAll('input');
    if (inputs.length < 3) return null;
    const fecha = inputs[0].value.trim(), evolucion = inputs[1].value.trim(), prescripcion = inputs[2].value.trim();
    return (fecha || evolucion || prescripcion) ? { fecha, evolucion, prescripcion } : null;
  }).filter(Boolean);
  let evY = H - 100;
  evoluciones.slice(0, 8).forEach(e => {
    if (e.fecha)        p3.drawText(_pdfSafe(e.fecha),        { x: 33,  y: evY, size: 7, font: bold,   color: negro, maxWidth: 90  });
    if (e.evolucion)    p3.drawText(_pdfSafe(e.evolucion),    { x: 133, y: evY, size: 7, font: normal, color: negro, maxWidth: 178 });
    if (e.prescripcion) p3.drawText(_pdfSafe(e.prescripcion), { x: 323, y: evY, size: 7, font: normal, color: negro, maxWidth: 235 });
    evY -= 22;
  });

  await dibujarFirmaElectronicaPDF(doc, p3, { font: normal, color: gris, tipoDocumento: 'Historia clinica' });
  return await guardarPDFConFirma(doc, 'Historia clinica');
}

// ===== INTERCONSULTA PDF =====
async function generarInterconsultaPDF() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const resp = await fetch('/templates/interconsulta.pdf');
  if (!resp.ok) { showToast('Error: plantilla interconsulta.pdf no encontrada'); return; }
  const doc  = await PDFDocument.load(new Uint8Array(await resp.arrayBuffer()));
  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negro   = rgb(0.05, 0.05, 0.05);
  const gris    = rgb(0.35, 0.35, 0.35);
  const page = doc.getPage(0);
  const H = page.getHeight();

  const gV = id => { const el = document.getElementById(id); return _pdfSafe((el ? (el.value || el.textContent || '') : '').trim()); };
  const gR = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || '');

  const V = (val, x, yBot, maxW) => {
    const v = _pdfSafe(String(val || ''));
    if (v) page.drawText(v, { x, y: H - yBot + 1, size: 7.5, font: normal, color: negro, maxWidth: maxW || 240 });
  };
  const MX = (x, yTop) => page.drawText('X', { x, y: H - yTop - 7, size: 9, font: bold, color: negro });

  // Identificación (coordenadas pdfplumber)
  V(gV('inter-historial'),  265, 127, 170);   // No. de Historial (bot=127)
  V(gV('inter-nombre'),     265, 149, 290);   // Nombre Completo (bot=149)
  V(gV('inter-cedula'),     115, 193, 250);   // Cédula (bot=193)
  V(gV('inter-edad'),       444, 193, 80);    // Edad
  // Sexo: Femenino x=88, Masculino x=220 (top=203)
  if (gR('inter-sexo') === 'F' || gR('inter-sexo').toLowerCase().includes('fem')) MX(79, 203);
  else if (gR('inter-sexo')) MX(211, 203);
  V(gV('inter-fecha-nac'), 445, 215, 115);    // Fecha Nacimiento
  V(gV('inter-domicilio'), 250, 281, 295);    // Domicilio (bot=281)
  V(gV('inter-telefono'),  430, 303, 130);    // Teléfono (bot=303)
  // Estado Civil (top=247): Soltero x=127, Casado x=243, Viudo x=363, Unión Libre x=471
  const ecI = { 'Soltero':118, 'Casado':234, 'Viudo':354, 'Union Libre':462, 'Unión Libre':462 };
  const ecIx = ecI[gR('inter-estado-civil')];
  if (ecIx) MX(ecIx, 247);

  // Interconsulta
  V(gV('inter-de-servicio'), 185, 370, 130);  // Enviado del Servicio (bot=370)
  V(gV('inter-al-servicio'), 430, 370, 130);  // Al Servicio (bot=370)
  V(gV('inter-diagnostico'), 110, 403, 350);  // Diagnóstico (bot=403)
  V(gV('inter-cie10-val'),   490, 400, 65);   // CIE-10
  // PRE/DEF (top=380): PRE x=521, DEF x=546
  const dxT = gR('inter-dx-tipo');
  if (dxT === 'PRE' || dxT === 'PRESUNTIVO') MX(513, 380);
  if (dxT === 'DEF' || dxT === 'DEFINITIVO') MX(537, 380);

  // Justificación (área grande, top=436 → texto desde y=H-460)
  const just = _pdfSafe(gV('inter-justificacion'));
  if (just) {
    const words = just.split(' '); let linea = '', jY = H - 460;
    for (const w of words) {
      if (jY < H - 505) break;
      const test = linea ? linea + ' ' + w : w;
      if (normal.widthOfTextAtSize(test, 7.5) > 520 && linea) {
        page.drawText(linea, { x: 33, y: jY, size: 7.5, font: normal, color: negro }); jY -= 10; linea = w;
      } else linea = test;
    }
    if (linea) page.drawText(linea, { x: 33, y: jY, size: 7.5, font: normal, color: negro });
  }

  // Fecha de solicitud / Nombre del profesional
  V(gV('inter-fecha') || new Date().toLocaleDateString('es-EC'), 185, 522, 220);
  const medNom = _pdfSafe(currentUser ? `Dr. ${currentUser.nombre||''} ${currentUser.apellidos||''}`.trim() : '');
  V(medNom, 215, 552, 300);
  const medReg = currentUser?.numero_registro ? _pdfSafe('Reg. MSP: ' + currentUser.numero_registro) : '';
  if (medReg) page.drawText(medReg, { x: 215, y: H - 565, size: 7, font: normal, color: gris, maxWidth: 300 });

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

  const gV  = id => { const el = document.getElementById(id); return _pdfSafe((el ? (el.value || el.textContent || '') : '').trim()); };
  const gR  = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || '');
  const gCB = id => document.getElementById(id)?.checked || false;

  // ── WHITE-OUT todos los valores pre-rellenos de Vital Club ─────────────────
  // wo(x, yTop, w, h): blanquea el área de VALOR (justo encima del underline en pdfplumber top=yTop)
  const wo = (x, yTop, w, h) => page.drawRectangle({ x, y: H - yTop - (h - 3), width: w, height: h, color: blanco });

  // Logo Vital Club (top center, ~top=0-78)
  page.drawRectangle({ x: 215, y: H - 78, width: 165, height: 78, color: blanco });

  // Sección A (underlines top=132,147,162,177,192)
  [132, 147, 162, 177, 192].forEach(t => wo(208, t, 361, 16));

  // Sección B (underlines top=233,248,263,278,293,307,322)
  [233, 248, 263, 278, 293, 307, 322].forEach(t => wo(208, t, 361, 16));

  // Sección C — diagnóstico + CIE10 (top=373,388)
  [373, 388].forEach(t => wo(208, t, 361, 16));

  // Checkboxes filas (borrar marcas pre-rellenas)
  wo(213, 393, 58, 24); wo(519, 393, 58, 24);
  wo(213, 411, 58, 24); wo(519, 411, 58, 24);

  // Tipo contingencia (top=448)
  wo(208, 448, 361, 16);

  // Caja descripción (top=473-533)
  page.drawRectangle({ x: 46, y: H - 534, width: 521, height: 61, color: blanco });

  // Tipo reposo + días + desde + hasta (top=538-625)
  page.drawRectangle({ x: 30, y: H - 626, width: 534, height: 90, color: blanco });

  // Área firma — extendida para cubrir nombre pre-relleno "MARIA LORENA..." (top=676-761)
  page.drawRectangle({ x: 30, y: H - 761, width: 534, height: 87, color: blanco });

  // ── Logo MediLyft (SVG → PNG vía canvas) ───────────────────────────────────
  try {
    const svgR = await fetch('/landing/logo.svg');
    const svgT = await svgR.text();
    const blobUrl = URL.createObjectURL(new Blob([svgT], { type: 'image/svg+xml' }));
    const pngBytes = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        c.getContext('2d').drawImage(img, 0, 0, 64, 64);
        URL.revokeObjectURL(blobUrl);
        c.toBlob(b => { const r = new FileReader(); r.onload = e => res(new Uint8Array(e.target.result)); r.readAsArrayBuffer(b); }, 'image/png');
      };
      img.onerror = rej; img.src = blobUrl;
    });
    const logoImg = await doc.embedPng(pngBytes);
    page.drawImage(logoImg, { x: 266, y: H - 66, width: 64, height: 50 });
    page.drawText('MediLyft', { x: 270, y: H - 76, size: 10, font: bold, color: negro });
  } catch (_) {
    page.drawText('MediLyft', { x: 265, y: H - 55, size: 15, font: bold, color: negro });
  }

  // ── Overlay helper ───────────────────────────────────────────────────────────
  const V = (val, x, yTop, maxW) => {
    const v = _pdfSafe(String(val || ''));
    if (v) page.drawText(v, { x, y: H - yTop + 3, size: 8, font: normal, color: negro, maxWidth: maxW || 355 });
  };

  // SECCIÓN A
  V(gV('cert-establecimiento'),           210, 132);
  V(gV('cert-correo-medico'),             210, 147);
  V(gV('cert-tel-emisor'),                210, 162);
  V(gV('cert-direccion-establecimiento'), 210, 177);
  V(gV('cert-lugar-fecha-emision'),       210, 192);

  // SECCIÓN B
  V(gV('cert-paciente'),       210, 233);
  V(gV('cert-direccion'),      210, 248);
  V(gV('cert-telefono'),       210, 263);
  V(gV('cert-empresa'),        210, 278);
  V(gV('cert-puesto-trabajo'), 210, 293);
  V(gV('cert-cedula'),         210, 307);
  V(gV('cert-hc'),             210, 322);

  // SECCIÓN C
  V(gV('cert-diagnostico'), 210, 373);
  V(gV('cert-cie10'),        210, 388);

  // Checkboxes
  if (gR('cert-sintomas') === 'SI') page.drawText('X', { x: 234, y: H - 406, size: 10, font: bold, color: negro });
  if (gR('cert-sintomas') === 'NO') page.drawText('X', { x: 541, y: H - 406, size: 10, font: bold, color: negro });
  if (gCB('cert-tipo-enfermedad'))  page.drawText('X', { x: 234, y: H - 424, size: 10, font: bold, color: negro });
  if (gCB('cert-tipo-aislamiento')) page.drawText('X', { x: 541, y: H - 424, size: 10, font: bold, color: negro });

  // Tipo contingencia
  V(gV('cert-tipo-contingencia'), 210, 448);

  // Descripción
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

  // Tipo de reposo
  const tipoRep = gR('cert-reposo-tipo') || 'ABSOLUTO';
  page.drawText('Tipo de reposo: REPOSO ' + tipoRep, { x: 50, y: H - 543, size: 8, font: bold, color: negro });

  // Días / Desde / Hasta
  const diasNum   = gV('cert-dias-num');
  const diasLetra = gV('cert-dias-letra');
  V([diasNum ? diasNum + ' dias' : '', diasLetra ? '(' + diasLetra + ')' : ''].filter(Boolean).join(' '), 210, 555);
  V([gV('cert-desde'), gV('cert-desde-letra')].filter(Boolean).join('   '), 210, 583);
  V([gV('cert-hasta'), gV('cert-hasta-letra')].filter(Boolean).join('   '), 210, 612);

  // Médico (sobre área blanqueada)
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

  const azul   = rgb(0.145, 0.388, 0.922);
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
