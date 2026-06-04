async function generarRecetaPDF({ paciente, medico, diagnostico, cie10, medicamentos, indicaciones }) {
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

  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: azul });
  page.drawText('MEDILYFT', { x: 40, y: height - 45, size: 22, font: bold, color: blanco });
  page.drawText('Receta Médica', { x: 40, y: height - 65, size: 11, font: normal, color: blanco });
  page.drawText(`Fecha: ${new Date().toLocaleDateString('es-EC')}`, { x: width - 185, y: height - 55, size: 9, font: normal, color: blanco });

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

  function textoWrapped(texto, startX, maxWidth, lineHeight) {
    const palabras = (texto || '').split(' ');
    let linea = '';
    for (const p of palabras) {
      const test = linea ? `${linea} ${p}` : p;
      if (normal.widthOfTextAtSize(test, 9) > maxWidth && linea) {
        page.drawText(linea, { x: startX, y, size: 9, font: normal, color: negro });
        y -= lineHeight;
        linea = p;
      } else {
        linea = test;
      }
    }
    if (linea) { page.drawText(linea, { x: startX, y, size: 9, font: normal, color: negro }); y -= lineHeight; }
  }

  const nombreMedico = medico ? `Dr. ${medico.nombre || ''} ${medico.apellidos || ''}`.trim() : '—';

  seccion('MÉDICO TRATANTE');
  campo('Nombre', nombreMedico);
  campo('Especialidad', medico?.especialidad || '—');
  y -= 6;

  seccion('DATOS DEL PACIENTE');
  campo('Nombre', `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim());
  campo('Cédula', paciente.cedula);
  campo('Edad', paciente.edad ? `${paciente.edad} años` : '—');
  y -= 6;

  seccion('DIAGNÓSTICO');
  campo('Diagnóstico', diagnostico);
  if (cie10?.length) campo('CIE-10', cie10.map(x => `${x.c} — ${x.n}`).join(' | '));
  y -= 6;

  seccion('MEDICAMENTOS PRESCRITOS');
  medicamentos.forEach((m, i) => {
    page.drawText(`${i + 1}. ${m.nombre || ''}`, { x: 44, y, size: 9, font: bold, color: negro });
    y -= 14;
    const detalle = [m.dosis, `cada ${m.frecuencia_horas}h`, `por ${m.dias} día(s)`].filter(Boolean).join(' · ');
    page.drawText(detalle, { x: 54, y, size: 9, font: normal, color: gris });
    y -= 18;
  });
  y -= 6;

  if (indicaciones) {
    seccion('INDICACIONES GENERALES');
    textoWrapped(indicaciones, 44, width - 90, 14);
    y -= 6;
  }

  y -= 40;
  page.drawLine({ start: { x: width - 210, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
  page.drawText(nombreMedico, { x: width - 205, y: y - 14, size: 8, font: normal, color: gris });

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

  const gV = id => { const el = document.getElementById(id); return el ? (el.value || el.textContent || '').trim() : ''; };
  const gR = name => document.querySelector(`input[name="${name}"]:checked`)?.value || '—';
  const gCB = ids => ids.filter(id => { const el = document.getElementById(id); return el && el.checked; }).map(id => id.replace(/^hcaf-/,'').replace(/-/g,' ')).join(', ') || '—';

  function buildPage() {
    const page = doc.addPage([595, 842]);
    const { width, height } = page;
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
  y -= 20;

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
  const { width, height } = page;
  const gV = id => { const el = document.getElementById(id); return el ? (el.value || el.textContent || '').trim() : ''; };
  const gR = name => document.querySelector(`input[name="${name}"]:checked`)?.value || '—';

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

async function generarCertificadoPDF({ paciente, medico, diagnostico, diasReposo, observaciones }) {
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

  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: azul });
  page.drawText('MEDILYFT', { x: 40, y: height - 45, size: 22, font: bold, color: blanco });
  page.drawText('Certificado Médico', { x: 40, y: height - 65, size: 11, font: normal, color: blanco });
  page.drawText(`Fecha: ${new Date().toLocaleDateString('es-EC')}`, { x: width - 185, y: height - 55, size: 9, font: normal, color: blanco });

  let y = height - 130;

  page.drawText('CERTIFICADO MÉDICO', { x: width / 2 - 72, y, size: 16, font: bold, color: azul });
  y -= 50;

  const nombreMedico = medico ? `Dr. ${medico.nombre || ''} ${medico.apellidos || ''}`.trim() : 'el médico tratante';
  const nombrePaciente = `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim();

  function drawWrapped(texto, startX, maxWidth, size, font, color) {
    const palabras = (texto || '').split(' ');
    let linea = '';
    for (const p of palabras) {
      const test = linea ? `${linea} ${p}` : p;
      if (font.widthOfTextAtSize(test, size) > maxWidth && linea) {
        page.drawText(linea, { x: startX, y, size, font, color });
        y -= size + 5;
        linea = p;
      } else {
        linea = test;
      }
    }
    if (linea) { page.drawText(linea, { x: startX, y, size, font, color }); y -= size + 5; }
  }

  const cuerpo = `Quien suscribe, ${nombreMedico}, certifica que el/la paciente ${nombrePaciente}, portador/a de cédula ${paciente.cedula || '—'}, ha sido atendido/a mediante teleconsulta médica con el siguiente diagnóstico: ${diagnostico}.`;
  drawWrapped(cuerpo, 60, width - 120, 11, normal, negro);
  y -= 15;

  if (diasReposo > 0) {
    drawWrapped(`Se recomienda reposo por ${diasReposo} día(s) a partir de la presente fecha.`, 60, width - 120, 11, normal, negro);
    y -= 15;
  }

  if (observaciones) {
    page.drawText('Observaciones:', { x: 60, y, size: 11, font: bold, color: negro });
    y -= 18;
    drawWrapped(observaciones, 60, width - 120, 11, normal, negro);
    y -= 15;
  }

  y -= 50;
  page.drawLine({ start: { x: width - 220, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
  page.drawText(nombreMedico, { x: width - 215, y: y - 14, size: 9, font: normal, color: gris });
  page.drawText('Médico Tratante · MediLyft', { x: width - 215, y: y - 26, size: 8, font: normal, color: gris });

  page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: 40, y: 40, size: 7, font: normal, color: gris });

  return await doc.save();
}

async function generarPedidoPDF({ paciente, medico, diagnostico, examenes, observaciones }) {
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

  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: azul });
  page.drawText('MEDILYFT', { x: 40, y: height - 45, size: 22, font: bold, color: blanco });
  page.drawText('Pedido de Laboratorio', { x: 40, y: height - 65, size: 11, font: normal, color: blanco });
  page.drawText(`Fecha: ${new Date().toLocaleDateString('es-EC')}`, { x: width - 185, y: height - 55, size: 9, font: normal, color: blanco });

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

  const nombreMedico2 = medico ? `Dr. ${medico.nombre || ''} ${medico.apellidos || ''}`.trim() : '—';

  seccion('MÉDICO SOLICITANTE');
  campo('Nombre', nombreMedico2);
  campo('Especialidad', medico?.especialidad || '—');
  y -= 6;

  seccion('DATOS DEL PACIENTE');
  campo('Nombre', `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim());
  campo('Cédula', paciente.cedula);
  campo('Edad', paciente.edad ? `${paciente.edad} años` : '—');
  y -= 6;

  if (diagnostico) {
    seccion('DIAGNÓSTICO / INDICACIÓN');
    campo('Diagnóstico', diagnostico);
    y -= 6;
  }

  seccion('EXÁMENES SOLICITADOS');
  const lineas = (examenes || '').split('\n').filter(l => l.trim());
  if (!lineas.length) {
    page.drawText('—', { x: 44, y, size: 9, font: normal, color: negro }); y -= 16;
  } else {
    lineas.forEach(linea => {
      page.drawText(`• ${linea.trim()}`, { x: 44, y, size: 9, font: normal, color: negro });
      y -= 16;
    });
  }
  y -= 6;

  if (observaciones) {
    seccion('INSTRUCCIONES / PREPARACIÓN');
    const palabras = observaciones.split(' ');
    let linea = '';
    for (const p of palabras) {
      const test = linea ? `${linea} ${p}` : p;
      if (normal.widthOfTextAtSize(test, 9) > width - 90 && linea) {
        page.drawText(linea, { x: 44, y, size: 9, font: normal, color: negro }); y -= 14; linea = p;
      } else { linea = test; }
    }
    if (linea) { page.drawText(linea, { x: 44, y, size: 9, font: normal, color: negro }); y -= 14; }
    y -= 6;
  }

  y -= 30;
  page.drawLine({ start: { x: width - 210, y }, end: { x: width - 40, y }, thickness: 0.5, color: gris });
  page.drawText(nombreMedico2, { x: width - 205, y: y - 14, size: 8, font: normal, color: gris });

  page.drawLine({ start: { x: 40, y: 55 }, end: { x: width - 40, y: 55 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado por MediLyft · Confidencial · LOPDP Ecuador', { x: 40, y: 40, size: 7, font: normal, color: gris });

  return await doc.save();
}
