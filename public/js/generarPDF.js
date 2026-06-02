async function generarRecetaPDF({ paciente, medico, diagnostico, cie10, medicamentos, indicaciones }) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const azul   = rgb(0.12, 0.29, 0.49);
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

async function generarCertificadoPDF({ paciente, medico, diagnostico, diasReposo, observaciones }) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const bold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const normal = await doc.embedFont(StandardFonts.Helvetica);

  const azul   = rgb(0.12, 0.29, 0.49);
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

  const azul   = rgb(0.12, 0.29, 0.49);
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
