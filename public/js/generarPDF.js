// Sanitiza texto para pdf-lib (fuentes estándar = WinAnsi). Caracteres fuera de
// Latin-1 (emoji, comillas/guiones tipográficos, espacios raros de copiar/pegar)
// hacen que drawText lance error y rompa la generación. Acá se normalizan o eliminan.
function _pdfSafe(s) {
  return String(s == null ? '' : s)
    .normalize('NFC')
    .replace(/[''‚‹›]/g, "'")
    .replace(/[""„«»]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[     ]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, '');
}

// Helper compartido: incrusta el logo SVG de MediLyft como PNG en el doc.
// Retorna el objeto de imagen (o null si falla). Llamar con await.
async function _embedLogo(doc) {
  try {
    const svgR = await fetch('/landing/logo.svg');
    if (!svgR.ok) return null;
    const svgT = await svgR.text();
    const blobUrl = URL.createObjectURL(new Blob([svgT], { type: 'image/svg+xml' }));
    const pngBytes = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = 48; c.height = 48;
        c.getContext('2d').drawImage(img, 0, 0, 48, 48);
        URL.revokeObjectURL(blobUrl);
        c.toBlob(b => { const r = new FileReader(); r.onload = e => res(new Uint8Array(e.target.result)); r.readAsArrayBuffer(b); }, 'image/png');
      };
      img.onerror = rej; img.src = blobUrl;
    });
    return await doc.embedPng(pngBytes);
  } catch (_) { return null; }
}

// Dibuja cabecera estándar MediLyft / VitalClub en una página.
function _drawHeader(pg, logoImg, titulo, subtitulo, H, bold, normal, negro, grisOsc) {
  if (logoImg) pg.drawImage(logoImg, { x: 272, y: H - 52, width: 48, height: 38 });
  const medW = bold.widthOfTextAtSize('MediLyft', 10);
  pg.drawText('MediLyft', { x: (595 - medW) / 2, y: H - 62, size: 10, font: bold, color: negro });
  const vitW = normal.widthOfTextAtSize('VitalClub', 8);
  pg.drawText('VitalClub', { x: (595 - vitW) / 2, y: H - 72, size: 8, font: normal, color: grisOsc });
  const titW = bold.widthOfTextAtSize(titulo, 13);
  pg.drawText(titulo, { x: (595 - titW) / 2, y: H - 86, size: 13, font: bold, color: negro });
  if (subtitulo) {
    const subW = normal.widthOfTextAtSize(subtitulo, 7.5);
    pg.drawText(subtitulo, { x: (595 - subW) / 2, y: H - 98, size: 7.5, font: normal, color: grisOsc });
  }
  pg.drawLine({ start: { x: 36, y: H - 103 }, end: { x: 559, y: H - 103 }, thickness: 0.4, color: PDFLib.rgb(0.82, 0.82, 0.82) });
}

// ===== RECETA MÉDICA PDF =====
async function generarRecetaPDF() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const doc  = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const H = 842;

  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negro   = rgb(0.05, 0.05, 0.05);
  const grisOsc = rgb(0.3, 0.3, 0.3);
  const azul    = rgb(0.09, 0.27, 0.55);
  const grisBg  = rgb(0.93, 0.94, 0.96);
  const blanco  = rgb(1, 1, 1);

  const gV = id => { const el = document.getElementById(id); return _pdfSafe((el ? (el.value || el.textContent || '') : '').trim()); };
  const gR = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || '');

  const p = currentPacienteData || {};
  const u = currentUser || {};
  const medNom = _pdfSafe(gV('rec-nombre-medico') || `${u.nombre||''} ${u.apellidos||''}`.trim());
  const medReg = _pdfSafe(u.numero_registro ? 'Reg. MSP: ' + u.numero_registro : (gV('rec-reg-medico') || ''));
  const medEsp = _pdfSafe(gV('rec-esp-medico') || u.especialidad || 'MEDICINA GENERAL');

  const logoImg = await _embedLogo(doc);
  const recNum = gV('rec-numero');
  _drawHeader(page, logoImg, 'RECETA MEDICA', recNum ? 'N° ' + recNum : null, H, bold, normal, negro, grisOsc);

  let y = H - 120;
  const LM = 36, RM = 559, INNER = RM - LM;

  const drawSec = titulo => {
    page.drawRectangle({ x: LM, y: y - 5, width: INNER, height: 16, color: grisBg });
    page.drawText(titulo, { x: LM + 4, y, size: 8.5, font: bold, color: azul });
    y -= 19;
  };
  const drawFila = (label, valor, lw) => {
    const lw_ = lw || 140;
    page.drawText(label + ':', { x: LM + 4, y, size: 7.5, font: bold, color: grisOsc, maxWidth: lw_ });
    const v = _pdfSafe(String(valor || ''));
    if (v) page.drawText(v, { x: LM + lw_ + 6, y, size: 8, font: normal, color: negro, maxWidth: INNER - lw_ - 8 });
    y -= 14;
  };
  const drawWrap = (txt, x, maxW, size) => {
    const words = _pdfSafe(txt || '').trim().split(' '); if (!words[0]) return;
    let lin = '';
    for (const w of words) {
      const t = lin ? lin + ' ' + w : w;
      if (normal.widthOfTextAtSize(t, size) > maxW && lin) {
        page.drawText(lin, { x, y, size, font: normal, color: negro }); y -= size + 3; lin = w;
      } else lin = t;
    }
    if (lin) page.drawText(lin, { x, y, size, font: normal, color: negro });
    y -= size + 3;
  };

  // ── DATOS DEL PACIENTE ──────────────────────────────────────────────────────
  drawSec('DATOS DEL PACIENTE');
  const nomPac = _pdfSafe(`${p.apellidos||''} ${p.nombre||''}`.trim() || gV('rec-paciente'));
  page.drawText('Nombre:', { x: LM+4, y, size:7.5, font:bold, color:grisOsc });
  page.drawText(nomPac, { x: LM+55, y, size:8, font:normal, color:negro, maxWidth:195 });
  page.drawText('N° Atencion:', { x: LM+270, y, size:7.5, font:bold, color:grisOsc });
  page.drawText(gV('rec-atencion'), { x: LM+345, y, size:8, font:normal, color:negro, maxWidth:170 });
  y -= 13;
  page.drawText('Cedula:', { x: LM+4, y, size:7.5, font:bold, color:grisOsc });
  page.drawText(gV('rec-cedula'), { x: LM+50, y, size:8, font:normal, color:negro, maxWidth:90 });
  page.drawText('Edad:', { x: LM+165, y, size:7.5, font:bold, color:grisOsc });
  page.drawText(gV('rec-edad'), { x: LM+196, y, size:8, font:normal, color:negro, maxWidth:60 });
  page.drawText('Sexo:', { x: LM+270, y, size:7.5, font:bold, color:grisOsc });
  page.drawText(gV('rec-sexo'), { x: LM+298, y, size:8, font:normal, color:negro, maxWidth:60 });
  page.drawText('Hoja:', { x: LM+380, y, size:7.5, font:bold, color:grisOsc });
  page.drawText(gV('rec-hoja') || '1', { x: LM+408, y, size:8, font:normal, color:negro, maxWidth:50 });
  y -= 16;

  // ── DIAGNÓSTICO Y ALERGIAS ──────────────────────────────────────────────────
  drawSec('DIAGNOSTICO Y ALERGIAS');
  const diagStr = _pdfSafe([gV('rec-diagnostico'), gV('rec-cie10') ? '(' + gV('rec-cie10') + ')' : ''].filter(Boolean).join(' '));
  page.drawText('Diagnostico:', { x: LM+4, y, size:7.5, font:bold, color:grisOsc });
  page.drawText(diagStr, { x: LM+78, y, size:8, font:normal, color:negro, maxWidth:INNER-80 });
  y -= 13;
  const aval = gR('rec-alergias') || 'NO';
  page.drawText('Alergias:', { x: LM+4, y, size:7.5, font:bold, color:grisOsc });
  page.drawRectangle({ x: LM+56, y: y-1, width:8, height:8, color:blanco, borderColor:grisOsc, borderWidth:0.5 });
  if (aval === 'SI') page.drawText('X', { x: LM+57, y, size:7, font:bold, color:negro });
  page.drawText('SI', { x: LM+67, y, size:7.5, font:normal, color:negro });
  page.drawRectangle({ x: LM+84, y: y-1, width:8, height:8, color:blanco, borderColor:grisOsc, borderWidth:0.5 });
  if (aval === 'NO') page.drawText('X', { x: LM+85, y, size:7, font:bold, color:negro });
  page.drawText('NO', { x: LM+95, y, size:7.5, font:normal, color:negro });
  const alerEsp = gV('rec-alergias-especificar');
  if (alerEsp) { page.drawText('Detalle:', { x: LM+120, y, size:7.5, font:bold, color:grisOsc }); page.drawText(alerEsp, { x: LM+158, y, size:7.5, font:normal, color:negro, maxWidth:130 }); }
  const peso = gV('rec-peso'), talla = gV('rec-talla');
  if (peso)  { page.drawText('Peso:',  { x: LM+308, y, size:7.5, font:bold, color:grisOsc }); page.drawText(peso  +' kg', { x: LM+334, y, size:7.5, font:normal, color:negro, maxWidth:55 }); }
  if (talla) { page.drawText('Talla:', { x: LM+400, y, size:7.5, font:bold, color:grisOsc }); page.drawText(talla +' cm', { x: LM+428, y, size:7.5, font:normal, color:negro, maxWidth:55 }); }
  y -= 16;

  // ── MEDICAMENTOS | INDICACIONES (2 columnas) ────────────────────────────────
  const MEDW = Math.floor(INNER * 0.57), INDX = LM + MEDW + 10, INDW = INNER - MEDW - 10;
  page.drawRectangle({ x: LM,   y: y-5, width: MEDW, height: 16, color: grisBg });
  page.drawText('MEDICAMENTOS', { x: LM+4, y, size:8.5, font:bold, color:azul });
  page.drawRectangle({ x: INDX, y: y-5, width: INDW, height: 16, color: grisBg });
  page.drawText('INDICACIONES', { x: INDX+4, y, size:8.5, font:bold, color:azul });
  y -= 19;

  const meds = [...document.querySelectorAll('#rec-meds-body tr')].map(tr => {
    const nombre = tr.querySelector('.med-nombre')?.value.trim();
    if (!nombre) return null;
    const frecSel = tr.querySelector('.med-frecuencia');
    return {
      nombre: _pdfSafe(nombre),
      dosis:  _pdfSafe(tr.querySelector('.med-dosis')?.value.trim() || ''),
      frec:   _pdfSafe(frecSel?.value ? (frecSel.selectedOptions[0]?.textContent || '') : ''),
      dias:   _pdfSafe(tr.querySelector('.med-dias')?.value.trim() || '')
    };
  }).filter(Boolean);

  let medY = y;
  for (let i = 0; i < Math.min(meds.length, 6); i++) {
    const m = meds[i];
    page.drawText(`${i+1}. ${m.nombre}${m.dosis ? ' ' + m.dosis : ''}`, { x: LM+4, y: medY, size:8, font:bold, color:negro, maxWidth: MEDW-8 });
    medY -= 11;
    if (m.frec || m.dias) {
      page.drawText([m.frec, m.dias ? m.dias + ' dia(s)' : ''].filter(Boolean).join(' - '), { x: LM+14, y: medY, size:7, font:normal, color:grisOsc, maxWidth: MEDW-18 });
      medY -= 10;
    }
  }

  let indY = y;
  const indicTxt = gV('rec-indicaciones');
  if (indicTxt) {
    for (const lin of indicTxt.split(/[\r\n]+/).filter(l => l.trim()).slice(0, 14)) {
      const words2 = _pdfSafe(lin).split(' '); let lin2 = '';
      for (const w of words2) {
        const t = lin2 ? lin2 + ' ' + w : w;
        if (normal.widthOfTextAtSize(t, 7.5) > INDW - 8 && lin2) {
          page.drawText(lin2, { x: INDX+4, y: indY, size:7.5, font:normal, color:negro }); indY -= 11; lin2 = w;
        } else lin2 = t;
      }
      if (lin2) page.drawText(lin2, { x: INDX+4, y: indY, size:7.5, font:normal, color:negro });
      indY -= 11;
    }
  }

  y = Math.min(medY, indY) - 6;

  // ── MEDIDAS NO FARMACOLÓGICAS ───────────────────────────────────────────────
  const mfTxt = gV('rec-medidas-no-farmacologicas');
  if (mfTxt) {
    y -= 4;
    drawSec('MEDIDAS NO FARMACOLOGICAS');
    drawWrap(mfTxt, LM + 4, INNER - 8, 7.5);
    y -= 4;
  }

  // ── FIRMA ──────────────────────────────────────────────────────────────────
  y -= 20;
  page.drawLine({ start:{x:248, y}, end:{x:480, y}, thickness:0.5, color:rgb(0.5,0.5,0.5) });
  if (medNom) page.drawText(medNom, { x:252, y:y-13, size:8,   font:bold,   color:negro,   maxWidth:224 });
  if (medReg) page.drawText(medReg, { x:252, y:y-25, size:7.5, font:normal, color:grisOsc, maxWidth:224 });
  if (medEsp) page.drawText(medEsp, { x:252, y:y-37, size:7.5, font:normal, color:grisOsc, maxWidth:224 });

  await dibujarFirmaElectronicaPDF(doc, page, { font: normal, color: grisOsc, tipoDocumento: 'Receta medica', posY: y - 40 });
  return await guardarPDFConFirma(doc, 'Receta medica');
}

// ===== HISTORIA CLÍNICA PDF =====
async function generarHistoriaClinicaPDF() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const doc  = await PDFDocument.create();
  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negro   = rgb(0.05, 0.05, 0.05);
  const grisOsc = rgb(0.3, 0.3, 0.3);
  const azul    = rgb(0.09, 0.27, 0.55);
  const grisBg  = rgb(0.93, 0.94, 0.96);
  const blanco  = rgb(1, 1, 1);
  const H = 842, LM = 36, RM = 559, INNER = RM - LM;

  const gV  = id => { const el = document.getElementById(id); return _pdfSafe((el ? (el.value || el.textContent || '') : '').trim()); };
  const gR  = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || '');
  const gCB = id => document.getElementById(id)?.checked || false;

  const u = currentUser || {};
  const docNom = _pdfSafe(`${u.nombre||''} ${u.apellidos||''}`.trim());
  const docReg = _pdfSafe(u.numero_registro ? 'Reg. MSP: ' + u.numero_registro : '');
  const docEsp = _pdfSafe(u.especialidad || 'MEDICINA GENERAL');

  const logoImg = await _embedLogo(doc);

  const mkPage = subtitulo => {
    const pg = doc.addPage([595, H]);
    _drawHeader(pg, logoImg, 'HISTORIA CLINICA', subtitulo, H, bold, normal, negro, grisOsc);
    return pg;
  };

  // Helpers que operan sobre una página y un objeto de estado {y}
  const mk = (pg, state) => ({
    sec: titulo => {
      pg.drawRectangle({ x: LM, y: state.y - 5, width: INNER, height: 16, color: grisBg });
      pg.drawText(titulo, { x: LM + 4, y: state.y, size: 8.5, font: bold, color: azul });
      state.y -= 19;
    },
    fila: (label, valor, lw) => {
      const lw_ = lw || 150;
      pg.drawText(label + ':', { x: LM+4, y: state.y, size:7.5, font:bold, color:grisOsc, maxWidth: lw_ });
      const v = _pdfSafe(String(valor || ''));
      if (v) pg.drawText(v, { x: LM+lw_+6, y: state.y, size:8, font:normal, color:negro, maxWidth: INNER-lw_-8 });
      pg.drawLine({ start:{x:LM, y:state.y-5}, end:{x:RM, y:state.y-5}, thickness:0.3, color:rgb(0.89,0.89,0.89) });
      state.y -= 14;
    },
    wrap: (txt, x, maxW, size) => {
      const words = _pdfSafe(txt || '').trim().split(' '); if (!words[0]) return;
      let lin = '';
      for (const w of words) {
        const t = lin ? lin + ' ' + w : w;
        if (normal.widthOfTextAtSize(t, size) > maxW && lin) {
          pg.drawText(lin, { x, y: state.y, size, font:normal, color:negro }); state.y -= size+3; lin = w;
        } else lin = t;
      }
      if (lin) pg.drawText(lin, { x, y: state.y, size, font:normal, color:negro });
      state.y -= size + 3;
    },
    cb: (x, checked) => {
      pg.drawRectangle({ x, y: state.y-1, width:8, height:8, color:blanco, borderColor:grisOsc, borderWidth:0.5 });
      if (checked) pg.drawText('X', { x: x+1, y: state.y, size:7, font:bold, color:negro });
    },
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // PÁGINA 1 — Identificación + Antecedentes
  // ══════════════════════════════════════════════════════════════════════════════
  const p1 = mkPage('Pag. 1 — Identificacion y Antecedentes');
  const s1 = { y: H - 120 };
  const h1 = mk(p1, s1);

  h1.sec('FICHA DE IDENTIFICACION');
  h1.fila('Nombre Completo',  [gV('hc-apellidos'), gV('hc-nombres')].filter(Boolean).join(' '));
  h1.fila('N° Historial',     gV('hc-historial'));
  h1.fila('N° Cedula',        gV('hc-cedula'));
  h1.fila('Edad',             gV('hc-edad'));
  h1.fila('Fecha Nacimiento', gV('hc-fecha-nac'));
  h1.fila('Sexo',             gR('hc-sexo'));
  h1.fila('Lugar Nacimiento', gV('hc-lugar-nac'));
  h1.fila('Estado Civil',     gR('hc-estado-civil'));
  h1.fila('Domicilio',        gV('hc-domicilio'));
  h1.fila('Ocupacion',        gV('hc-ocupacion'));
  h1.fila('Telefono',         gV('hc-telefono'));
  s1.y -= 4;

  h1.sec('MOTIVO DE LA CONSULTA');
  const motivoTxt = gV('hc-motivo');
  const motivoYstart = s1.y;
  h1.wrap(motivoTxt, LM+4, INNER-8, 7.5);
  if (s1.y > motivoYstart - 48) {
    p1.drawRectangle({ x: LM, y: motivoYstart - 52, width: INNER, height: 52, color: blanco, borderColor: rgb(0.85,0.85,0.85), borderWidth: 0.4 });
    s1.y = motivoYstart - 56;
  }
  s1.y -= 4;

  h1.sec('ANTECEDENTES PERSONALES');
  const ants = gV('hc-ant-personales');
  const antsYstart = s1.y;
  h1.wrap(ants, LM+4, INNER-8, 7.5);
  if (s1.y > antsYstart - 48) {
    p1.drawRectangle({ x: LM, y: antsYstart - 52, width: INNER, height: 52, color: blanco, borderColor: rgb(0.85,0.85,0.85), borderWidth: 0.4 });
    s1.y = antsYstart - 56;
  }
  s1.y -= 4;

  h1.sec('ANTECEDENTES FAMILIARES');
  const afItems = [
    ['hcaf-cardiopatia','Cardiopatia'],['hcaf-diabetes','Diabetes'],['hcaf-enf-cardiovascular','Enf. Cardiovascular'],
    ['hcaf-hipertension','Hipertension'],['hcaf-cancer','Cancer'],
    ['hcaf-tuberculosis','Tuberculosis'],['hcaf-enf-mental','Enf. Mental'],['hcaf-enf-infecciosa','Enf. Infecciosa'],
    ['hcaf-mal-formacion','Mal Formacion'],['hcaf-otro','Otro'],
  ];
  const COL_AF = Math.floor(INNER / 5);
  [0, 1].forEach(row => {
    afItems.slice(row * 5, row * 5 + 5).forEach(([id, label], col) => {
      const xAF = LM + 4 + col * COL_AF;
      h1.cb(xAF, gCB(id));
      p1.drawText(label, { x: xAF+11, y: s1.y, size:7, font:normal, color:negro });
    });
    s1.y -= 13;
  });
  h1.wrap(gV('hc-ant-familiares-notas'), LM+4, INNER-8, 7.5);
  s1.y -= 4;

  h1.sec('ENFERMEDAD O PROBLEMA ACTUAL');
  const enfYstart = s1.y;
  h1.wrap(gV('hc-enfermedad'), LM+4, INNER-8, 7.5);
  if (s1.y > enfYstart - 60) {
    p1.drawRectangle({ x: LM, y: enfYstart - 64, width: INNER, height: 64, color: blanco, borderColor: rgb(0.85,0.85,0.85), borderWidth: 0.4 });
    s1.y = enfYstart - 68;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PÁGINA 2 — Órganos / Signos Vitales / Diagnóstico / Tratamiento
  // ══════════════════════════════════════════════════════════════════════════════
  const p2 = mkPage('Pag. 2 — Examen y Diagnostico');
  const s2 = { y: H - 120 };
  const h2 = mk(p2, s2);
  const cpColor = rgb(0.75, 0.1, 0.1), spColor = rgb(0.1, 0.5, 0.18);

  const grisLine = rgb(0.78, 0.78, 0.78);
  const CELL_H = 30;

  // Dibuja una celda de tabla con label arriba y valor abajo
  const drawCell = (pg, x, y, w, label, val, color) => {
    pg.drawRectangle({ x, y: y - CELL_H + 2, width: w, height: CELL_H, color: blanco, borderColor: grisLine, borderWidth: 0.4 });
    pg.drawText(label, { x: x+4, y: y - 6,  size: 6.5, font: bold,   color: grisOsc, maxWidth: w - 6 });
    pg.drawText(val || '—', { x: x+4, y: y - 19, size: 8.5, font: bold,   color: color || grisOsc, maxWidth: w - 6 });
  };

  h2.sec('REVISION DE ORGANOS Y SISTEMAS');
  const organos = [
    ['hco-card','Cardiologia'],['hco-resp','Respiratorio'],['hco-cardv','Cardiovascular'],['hco-dig','Digestivo'],['hco-gen','Genital'],
    ['hco-uri','Urinario'],['hco-musc','Musculo Esquel.'],['hco-end','Endocrino'],['hco-hem','Hemo Linfatico'],['hco-nerv','Nervioso'],
  ];
  const COL_ORG = INNER / 5;
  [0, 1].forEach(row => {
    organos.slice(row*5, row*5+5).forEach(([radio, label], col) => {
      const val = gR(radio);
      drawCell(p2, LM + col * COL_ORG, s2.y, COL_ORG, label, val, val==='CP'?cpColor:(val==='SP'?spColor:null));
    });
    s2.y -= CELL_H + 2;
  });
  h2.wrap(gV('hc-organos-notas'), LM+4, INNER-8, 7.5);
  s2.y -= 4;

  h2.sec('EXAMEN FISICO REGIONAL');
  const regiones = [
    ['hce-cab','Cabeza'],['hce-cue','Cuello'],['hce-tor','Torax'],
    ['hce-abd','Abdomen'],['hce-pel','Pelvis'],['hce-ext','Extremidades'],
  ];
  const COL_REG = INNER / 6;
  regiones.forEach(([radio, label], col) => {
    const val = gR(radio);
    drawCell(p2, LM + col * COL_REG, s2.y, COL_REG, label, val, val==='CP'?cpColor:(val==='SP'?spColor:null));
  });
  s2.y -= CELL_H + 2;
  h2.wrap(gV('hc-examen-notas'), LM+4, INNER-8, 7.5);
  s2.y -= 4;

  h2.sec('SIGNOS VITALES');
  const svItems1 = [
    ['Peso',        gV('hc-peso')  ? gV('hc-peso')  + ' kg' : ''],
    ['Talla',       gV('hc-talla') ? gV('hc-talla') + ' cm' : ''],
    ['Temperatura', gV('hc-temperatura')],
    ['Pulso',       gV('hc-pulso')],
    ['Respiracion', gV('hc-respiracion')],
  ];
  svItems1.forEach(([lbl, val], i) => drawCell(p2, LM + i * (INNER/5), s2.y, INNER/5, lbl, val, negro));
  s2.y -= CELL_H + 2;
  const svItems2 = [
    ['T/A (mmHg)',   gV('hc-tension-arterial')],
    ['Oximetria (%)', gV('hc-oximetria')],
  ];
  svItems2.forEach(([lbl, val], i) => drawCell(p2, LM + i * (INNER/2), s2.y, INNER/2, lbl, val, negro));
  s2.y -= CELL_H + 6;

  h2.sec('DIAGNOSTICO');
  for (let i = 1; i <= 4; i++) {
    const dx = gV(`hc-dx-${i}`); if (!dx) continue;
    const tipo = gR(`hc-dx-tipo-${i}`), cie = gV(`hc-dx-cie-${i}`);
    p2.drawText(`${i}. ${dx}${cie ? ' (' + cie + ')' : ''}${tipo ? ' [' + tipo + ']' : ''}`, { x: LM+4, y: s2.y, size:8, font:normal, color:negro, maxWidth: INNER-8 });
    s2.y -= 13;
  }
  s2.y -= 4;

  h2.sec('TRATAMIENTO');
  h2.wrap(gV('hc-tratamiento'), LM+4, INNER-8, 7.5);

  // ══════════════════════════════════════════════════════════════════════════════
  // PÁGINA 3 — Evolución + Firma
  // ══════════════════════════════════════════════════════════════════════════════
  const p3 = mkPage('Pag. 3 — Evolucion y Prescripcion');
  const s3 = { y: H - 120 };
  const h3 = mk(p3, s3);

  h3.sec('EVOLUCION Y PRESCRIPCION');

  const COL_FEC = 80, COL_EVO = 260, COL_PRE = INNER - COL_FEC - COL_EVO - 10;
  p3.drawRectangle({ x: LM, y: s3.y-5, width: INNER, height: 14, color: rgb(0.85,0.87,0.90) });
  p3.drawText('Fecha',       { x: LM+4,                  y: s3.y, size:7.5, font:bold, color:azul });
  p3.drawText('Evolucion',   { x: LM+COL_FEC+4,           y: s3.y, size:7.5, font:bold, color:azul });
  p3.drawText('Prescripcion',{ x: LM+COL_FEC+COL_EVO+8,  y: s3.y, size:7.5, font:bold, color:azul });
  s3.y -= 18;

  const evoluciones = [...document.querySelectorAll('#hc-evolucion-body tr')].map(tr => {
    const inputs = tr.querySelectorAll('input');
    if (inputs.length < 3) return null;
    const fecha = inputs[0].value.trim(), evolucion = inputs[1].value.trim(), prescripcion = inputs[2].value.trim();
    return (fecha || evolucion || prescripcion) ? { fecha, evolucion, prescripcion } : null;
  }).filter(Boolean);

  evoluciones.slice(0, 12).forEach(e => {
    if (e.fecha)        p3.drawText(_pdfSafe(e.fecha),        { x: LM+4,                y: s3.y, size:7.5, font:bold,   color:negro, maxWidth: COL_FEC-6 });
    if (e.evolucion)    p3.drawText(_pdfSafe(e.evolucion),    { x: LM+COL_FEC+4,         y: s3.y, size:7.5, font:normal, color:negro, maxWidth: COL_EVO-6 });
    if (e.prescripcion) p3.drawText(_pdfSafe(e.prescripcion), { x: LM+COL_FEC+COL_EVO+8, y: s3.y, size:7.5, font:normal, color:negro, maxWidth: COL_PRE-4 });
    p3.drawLine({ start:{x:LM, y:s3.y-5}, end:{x:RM, y:s3.y-5}, thickness:0.3, color:rgb(0.85,0.85,0.85) });
    s3.y -= 18;
  });

  // Firma siempre anclada al tercio inferior de la página
  const firmaY = Math.min(s3.y - 20, 200);
  p3.drawLine({ start:{x:248, y:firmaY}, end:{x:480, y:firmaY}, thickness:0.5, color:rgb(0.5,0.5,0.5) });
  if (docNom) p3.drawText(docNom, { x:252, y:firmaY-13, size:8,   font:bold,   color:negro,   maxWidth:224 });
  if (docReg) p3.drawText(docReg, { x:252, y:firmaY-25, size:7.5, font:normal, color:grisOsc, maxWidth:224 });
  if (docEsp) p3.drawText(docEsp, { x:252, y:firmaY-37, size:7.5, font:normal, color:grisOsc, maxWidth:224 });

  await dibujarFirmaElectronicaPDF(doc, p3, { font: normal, color: grisOsc, tipoDocumento: 'Historia clinica', posY: firmaY - 40 });
  return await guardarPDFConFirma(doc, 'Historia clinica');
}

// ===== INTERCONSULTA PDF =====
async function generarInterconsultaPDF() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const doc  = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const H = 842;

  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negro   = rgb(0.05, 0.05, 0.05);
  const grisOsc = rgb(0.3, 0.3, 0.3);
  const azul    = rgb(0.09, 0.27, 0.55);
  const grisBg  = rgb(0.93, 0.94, 0.96);
  const blanco  = rgb(1, 1, 1);

  const gV = id => { const el = document.getElementById(id); return _pdfSafe((el ? (el.value || el.textContent || '') : '').trim()); };
  const gR = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || '');

  const u = currentUser || {};
  const logoImg = await _embedLogo(doc);
  _drawHeader(page, logoImg, 'INTERCONSULTA', null, H, bold, normal, negro, grisOsc);

  let y = H - 120;
  const LM = 36, RM = 559, INNER = RM - LM;

  const drawSec = titulo => {
    page.drawRectangle({ x: LM, y: y-5, width: INNER, height: 16, color: grisBg });
    page.drawText(titulo, { x: LM+4, y, size:8.5, font:bold, color:azul });
    y -= 19;
  };
  const drawFila = (label, valor, lw) => {
    const lw_ = lw || 150;
    page.drawText(label + ':', { x: LM+4, y, size:7.5, font:bold, color:grisOsc, maxWidth: lw_ });
    const v = _pdfSafe(String(valor || ''));
    if (v) page.drawText(v, { x: LM+lw_+6, y, size:8, font:normal, color:negro, maxWidth: INNER-lw_-8 });
    y -= 14;
  };
  const drawWrap = (txt, x, maxW, size) => {
    const words = _pdfSafe(txt || '').trim().split(' '); if (!words[0]) return;
    let lin = '';
    for (const w of words) {
      const t = lin ? lin + ' ' + w : w;
      if (normal.widthOfTextAtSize(t, size) > maxW && lin) {
        page.drawText(lin, { x, y, size, font:normal, color:negro }); y -= size+3; lin = w;
      } else lin = t;
    }
    if (lin) page.drawText(lin, { x, y, size, font:normal, color:negro });
    y -= size + 3;
  };

  // ── IDENTIFICACIÓN DEL PACIENTE ─────────────────────────────────────────────
  drawSec('IDENTIFICACION DEL PACIENTE');
  drawFila('Nombre Completo', gV('inter-nombre'));
  drawFila('N° Historial',    gV('inter-historial'));
  drawFila('N° Cedula',       gV('inter-cedula'));
  drawFila('Edad',            gV('inter-edad'));
  drawFila('Fecha Nacimiento',gV('inter-fecha-nac'));
  drawFila('Sexo',            gR('inter-sexo'));
  drawFila('Estado Civil',    gR('inter-estado-civil'));
  drawFila('Domicilio',       gV('inter-domicilio'));
  drawFila('Ocupacion',       gV('inter-ocupacion'));
  drawFila('Telefono',        gV('inter-telefono'));
  y -= 4;

  // ── INTERCONSULTA ───────────────────────────────────────────────────────────
  drawSec('INTERCONSULTA');
  drawFila('Enviado del Servicio de', gV('inter-de-servicio'));
  drawFila('Al Servicio de',          gV('inter-al-servicio'));

  page.drawText('Diagnostico:', { x: LM+4, y, size:7.5, font:bold, color:grisOsc });
  page.drawText(_pdfSafe(gV('inter-diagnostico')), { x: LM+80, y, size:8, font:normal, color:negro, maxWidth:265 });
  page.drawText('CIE-10:', { x: LM+360, y, size:7.5, font:bold, color:grisOsc });
  page.drawText(gV('inter-cie10-val'), { x: LM+400, y, size:8, font:normal, color:negro, maxWidth:55 });
  const dxT = gR('inter-dx-tipo');
  page.drawRectangle({ x: LM+460, y: y-1, width:8, height:8, color:blanco, borderColor:grisOsc, borderWidth:0.5 });
  if (dxT === 'PRE') page.drawText('X', { x: LM+461, y, size:7, font:bold, color:negro });
  page.drawText('PRE', { x: LM+471, y, size:7, font:normal, color:negro });
  page.drawRectangle({ x: LM+492, y: y-1, width:8, height:8, color:blanco, borderColor:grisOsc, borderWidth:0.5 });
  if (dxT === 'DEF') page.drawText('X', { x: LM+493, y, size:7, font:bold, color:negro });
  page.drawText('DEF', { x: LM+503, y, size:7, font:normal, color:negro });
  y -= 16;
  y -= 4;

  // ── JUSTIFICACIÓN ───────────────────────────────────────────────────────────
  drawSec('JUSTIFICACION CLINICA');
  drawWrap(gV('inter-justificacion'), LM+4, INNER-8, 7.5);
  y -= 10;

  // ── FECHA Y FIRMA ───────────────────────────────────────────────────────────
  const fechaSol = gV('inter-fecha') || new Date().toLocaleDateString('es-EC');
  page.drawText('Fecha de solicitud: ' + fechaSol, { x: LM+4, y, size:8, font:normal, color:negro });
  y -= 26;

  const medNom = _pdfSafe(`Dr. ${u.nombre||''} ${u.apellidos||''}`.trim());
  const medReg = _pdfSafe(u.numero_registro ? 'Reg. MSP: ' + u.numero_registro : '');
  const medEsp = _pdfSafe(u.especialidad || 'MEDICINA GENERAL');

  page.drawLine({ start:{x:248, y}, end:{x:480, y}, thickness:0.5, color:rgb(0.5,0.5,0.5) });
  if (medNom) page.drawText(medNom, { x:252, y:y-13, size:8,   font:bold,   color:negro,   maxWidth:224 });
  if (medReg) page.drawText(medReg, { x:252, y:y-25, size:7.5, font:normal, color:grisOsc, maxWidth:224 });
  if (medEsp) page.drawText(medEsp, { x:252, y:y-37, size:7.5, font:normal, color:grisOsc, maxWidth:224 });

  await dibujarFirmaElectronicaPDF(doc, page, { font: normal, color: grisOsc, tipoDocumento: 'Interconsulta medica', posY: y - 40 });
  return await guardarPDFConFirma(doc, 'Interconsulta medica');
}

async function generarCertificadoPDF() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const doc  = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const H = 842;

  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const negro   = rgb(0.05, 0.05, 0.05);
  const grisOsc = rgb(0.3, 0.3, 0.3);
  const azul    = rgb(0.09, 0.27, 0.55);
  const grisBg  = rgb(0.93, 0.94, 0.96);
  const blanco  = rgb(1, 1, 1);

  const gV  = id => { const el = document.getElementById(id); return _pdfSafe((el ? (el.value || el.textContent || '') : '').trim()); };
  const gR  = name => _pdfSafe(document.querySelector(`input[name="${name}"]:checked`)?.value || '');
  const gCB = id => document.getElementById(id)?.checked || false;

  const logoImg = await _embedLogo(doc);
  _drawHeader(page, logoImg, 'CERTIFICADO MEDICO', null, H, bold, normal, negro, grisOsc);

  let y = H - 120;
  const LM = 36, RM = 559, LW = 166, INNER = RM - LM;

  function seccion(titulo) {
    page.drawRectangle({ x: LM, y: y - 5, width: INNER, height: 16, color: grisBg });
    page.drawText(titulo, { x: LM + 4, y, size: 8.5, font: bold, color: azul });
    y -= 19;
  }

  function fila(label, valor) {
    page.drawText(label + ':', { x: LM + 4, y, size: 7.5, font: bold, color: grisOsc, maxWidth: LW });
    const v = _pdfSafe(String(valor || ''));
    if (v) page.drawText(v, { x: LM + LW + 6, y, size: 8, font: normal, color: negro, maxWidth: INNER - LW - 8 });
    y -= 14;
  }

  function cb(x, checked) {
    page.drawRectangle({ x, y: y - 1, width: 8, height: 8, color: blanco, borderColor: grisOsc, borderWidth: 0.5 });
    if (checked) page.drawText('X', { x: x + 1, y: y, size: 7, font: bold, color: negro });
  }

  // ── SECCIÓN A ──────────────────────────────────────────────────────────────
  seccion('A)  DATOS DEL ESTABLECIMIENTO DE SALUD');
  fila('Nombre del establecimiento',    gV('cert-establecimiento'));
  fila('Correo electronico del medico', gV('cert-correo-medico'));
  fila('Telefono del emisor',           gV('cert-tel-emisor'));
  fila('Direccion del establecimiento', gV('cert-direccion-establecimiento'));
  fila('Lugar y fecha de emision',      gV('cert-lugar-fecha-emision'));
  y -= 4;

  // ── SECCIÓN B ──────────────────────────────────────────────────────────────
  seccion('B)  DATOS DEL PACIENTE');
  fila('Apellidos y nombres',              gV('cert-paciente'));
  fila('Direccion domiciliaria',           gV('cert-direccion'));
  fila('Numero de telefono',               gV('cert-telefono'));
  fila('Institucion / empresa de trabajo', gV('cert-empresa'));
  fila('Puesto de trabajo del paciente',   gV('cert-puesto-trabajo'));
  fila('Numero de identificacion',         gV('cert-cedula'));
  fila('Numero de historia clinica',       gV('cert-hc'));
  y -= 4;

  // ── SECCIÓN C ──────────────────────────────────────────────────────────────
  seccion('C)  MOTIVO DE AISLAMIENTO/ENFERMEDAD');
  fila('Diagnostico',          gV('cert-diagnostico'));
  fila('Codigo CIE 10',        gV('cert-cie10'));
  fila('Tipo de Contingencia', gV('cert-tipo-contingencia'));

  // Presenta síntomas
  page.drawText('Presenta Sintomas:', { x: LM + 4, y, size: 7.5, font: bold, color: grisOsc });
  const sval = gR('cert-sintomas');
  const CX = LM + LW + 8;
  cb(CX,      sval === 'SI'); page.drawText('SI', { x: CX + 11,      y, size: 7.5, font: normal, color: negro });
  cb(CX + 32, sval === 'NO'); page.drawText('NO', { x: CX + 43,      y, size: 7.5, font: normal, color: negro });
  y -= 14;

  // Tipo enfermedad / aislamiento
  page.drawText('Tipo de enfermedad:', { x: LM + 4, y, size: 7.5, font: bold, color: grisOsc });
  cb(CX,      gCB('cert-tipo-enfermedad'));  page.drawText('Enfermedad',             { x: CX + 11,  y, size: 7.5, font: normal, color: negro });
  cb(CX + 84, gCB('cert-tipo-aislamiento')); page.drawText('Aislamiento/teletrabajo', { x: CX + 95, y, size: 7.5, font: normal, color: negro });
  y -= 16;

  // Descripción
  page.drawText('Descripcion de la enfermedad:', { x: LM + 4, y, size: 7.5, font: bold, color: grisOsc });
  y -= 9;
  const descBoxH = 52;
  page.drawRectangle({ x: LM, y: y - descBoxH, width: INNER, height: descBoxH, color: blanco, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
  const descWords = _pdfSafe(gV('cert-descripcion') || '').split(' ');
  let dLinea = '', dY = y - 10;
  for (const w of descWords) {
    if (dY < y - descBoxH + 6) break;
    const test = dLinea ? dLinea + ' ' + w : w;
    if (normal.widthOfTextAtSize(test, 7.5) > INNER - 12 && dLinea) {
      page.drawText(dLinea, { x: LM + 6, y: dY, size: 7.5, font: normal, color: negro }); dY -= 11; dLinea = w;
    } else dLinea = test;
  }
  if (dLinea && dY >= y - descBoxH + 6) page.drawText(dLinea, { x: LM + 6, y: dY, size: 7.5, font: normal, color: negro });
  y -= (descBoxH + 10);

  // Reposo + días + fechas
  page.drawText('Tipo de reposo: REPOSO ' + (gR('cert-reposo-tipo') || 'ABSOLUTO'), { x: LM + 4, y, size: 8, font: bold, color: negro });
  y -= 14;
  const diasNum   = gV('cert-dias-num');
  const diasLetra = gV('cert-dias-letra');
  fila('Total de dias concedidos', [diasNum ? diasNum + ' dias' : '', diasLetra ? '(' + diasLetra + ')' : ''].filter(Boolean).join(' '));
  fila('Desde', [gV('cert-desde'), gV('cert-desde-letra')].filter(Boolean).join('   '));
  fila('Hasta', [gV('cert-hasta'), gV('cert-hasta-letra')].filter(Boolean).join('   '));

  // ── FIRMA ──────────────────────────────────────────────────────────────────
  y -= 18;
  const docNom = _pdfSafe(gV('cert-nombre-medico') || (currentUser ? `Dr. ${currentUser.nombre||''} ${currentUser.apellidos||''}`.trim() : ''));
  const docReg = _pdfSafe(gV('cert-reg-medico') || (currentUser?.numero_registro ? 'Reg. MSP: ' + currentUser.numero_registro : ''));
  const docEsp = _pdfSafe(currentUser?.especialidad || 'MEDICINA GENERAL');

  page.drawLine({ start:{x: 248, y}, end:{x: 480, y}, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
  if (docNom) page.drawText(docNom, { x: 252, y: y - 13, size: 8,   font: bold,   color: negro,   maxWidth: 224 });
  if (docReg) page.drawText(docReg, { x: 252, y: y - 25, size: 7.5, font: normal, color: grisOsc, maxWidth: 224 });
  if (docEsp) page.drawText(docEsp, { x: 252, y: y - 37, size: 7.5, font: normal, color: grisOsc, maxWidth: 224 });

  await dibujarFirmaElectronicaPDF(doc, page, { font: normal, color: grisOsc, tipoDocumento: 'Certificado medico', posY: y - 40 });
  return await guardarPDFConFirma(doc, 'Certificado medico');
}

async function generarPedidoPDF() {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const doc  = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const H = 842;
  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const negro   = rgb(0.05, 0.05, 0.05);
  const grisOsc = rgb(0.3, 0.3, 0.3);
  const azul    = rgb(0.09, 0.27, 0.55);
  const grisBg  = rgb(0.93, 0.94, 0.96);

  const gV = id => { const el = document.getElementById(id); return _pdfSafe(el ? (el.value || el.textContent || '').trim() : ''); };

  const logoImg = await _embedLogo(doc);
  const labFecha = gV('lab-fecha') || new Date().toLocaleDateString('es-EC');
  _drawHeader(page, logoImg, 'PEDIDO DE LABORATORIO', 'Fecha: ' + labFecha, H, bold, normal, negro, grisOsc);

  let y = H - 120;
  const LM = 36, RM = 559, INNER = RM - LM;

  function seccion(titulo) {
    page.drawRectangle({ x: LM, y: y - 5, width: INNER, height: 16, color: grisBg });
    page.drawText(titulo, { x: LM + 4, y, size: 8.5, font: bold, color: azul });
    y -= 19;
  }

  function campo(label, valor) {
    page.drawText(label + ':', { x: LM + 4, y, size: 7.5, font: bold, color: grisOsc });
    page.drawText(String(valor || ''), { x: LM + 144, y, size: 8, font: normal, color: negro, maxWidth: INNER - 148 });
    y -= 14;
  }

  function wrap(texto) {
    const words = _pdfSafe(texto || '').trim().split(' '); if (!words[0]) return;
    let lin = '';
    for (const w of words) {
      const t = lin ? lin + ' ' + w : w;
      if (normal.widthOfTextAtSize(t, 7.5) > INNER - 8 && lin) {
        page.drawText(lin, { x: LM + 4, y, size: 7.5, font: normal, color: negro }); y -= 10; lin = w;
      } else lin = t;
    }
    if (lin) { page.drawText(lin, { x: LM + 4, y, size: 7.5, font: normal, color: negro }); y -= 10; }
  }

  seccion('DATOS DEL PACIENTE');
  campo('Nombre', gV('lab-paciente'));
  campo('Cedula', gV('lab-cedula'));
  campo('Edad', gV('lab-edad'));
  y -= 6;

  seccion('DIAGNOSTICO / INDICACION');
  campo('Diagnostico', gV('lab-diagnostico'));
  y -= 6;

  seccion('EXAMENES SOLICITADOS');
  const categorias = [...document.querySelectorAll('#docLaboratorio .lab-col')].map(col => ({
    titulo: col.querySelector('.lab-col-title')?.textContent.trim() || '',
    items: [...col.querySelectorAll('.lab-item')]
      .filter(item => item.querySelector('.lab-check')?.checked)
      .map(item => item.textContent.trim())
  })).filter(c => c.items.length);
  const otrosExamenes = gV('lab-otros-examenes');

  if (!categorias.length && !otrosExamenes) {
    page.drawText('—', { x: LM + 4, y, size: 7.5, font: normal, color: negro }); y -= 14;
  } else {
    categorias.forEach(c => {
      page.drawText(c.titulo, { x: LM + 4, y, size: 7.5, font: bold, color: negro }); y -= 12;
      c.items.forEach(it => { page.drawText('• ' + it, { x: LM + 14, y, size: 7.5, font: normal, color: negro }); y -= 12; });
      y -= 4;
    });
    if (otrosExamenes) {
      page.drawText('Otros examenes', { x: LM + 4, y, size: 7.5, font: bold, color: negro }); y -= 12;
      wrap(otrosExamenes);
      y -= 4;
    }
  }
  y -= 6;

  const instrucciones = gV('lab-instrucciones');
  if (instrucciones) {
    seccion('INSTRUCCIONES / PREPARACION');
    wrap(instrucciones);
    y -= 6;
  }

  y -= 30;
  const nombreMedico2 = gV('lab-nombre-medico') || (currentUser ? `Dr. ${currentUser.nombre || ''} ${currentUser.apellidos || ''}`.trim() : '');
  const _p12Lab = typeof getP12Activo === 'function' ? getP12Activo() : null;
  if (!_p12Lab) {
    page.drawLine({ start:{x:248, y}, end:{x:480, y}, thickness:0.5, color:rgb(0.5,0.5,0.5) });
    if (nombreMedico2) page.drawText(nombreMedico2, { x:252, y:y-13, size:8,   font:bold,   color:negro,   maxWidth:224 });
    const regMedico = gV('lab-reg-medico');
    if (regMedico)    page.drawText(regMedico,    { x:252, y:y-25, size:7.5, font:normal, color:grisOsc, maxWidth:224 });
    const espMedico = gV('lab-esp-medico') || (currentUser?.especialidad || 'MEDICINA GENERAL');
    page.drawText(espMedico, { x:252, y:y-37, size:7.5, font:normal, color:grisOsc, maxWidth:224 });
  }
  page.drawLine({ start:{x:LM, y:55}, end:{x:RM, y:55}, thickness:0.4, color:rgb(0.82,0.82,0.82) });
  page.drawText('Documento generado por MediLyft · VitalClub · Confidencial · LOPDP Ecuador', { x:LM, y:42, size:7, font:normal, color:grisOsc });
  await dibujarFirmaElectronicaPDF(doc, page, { font: normal, color: grisOsc, tipoDocumento: 'Pedido de laboratorio', posY: y - 40 });

  return await guardarPDFConFirma(doc, 'Pedido de laboratorio');
}
