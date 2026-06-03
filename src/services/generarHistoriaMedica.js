const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function generarHistoriaMedica({ paciente, antecedentes, consulta }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const fontBold   = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontNormal = await doc.embedFont(StandardFonts.Helvetica);

  const azul     = rgb(0.12, 0.29, 0.49);
  const gris     = rgb(0.4, 0.4, 0.4);
  const negro    = rgb(0, 0, 0);
  const blanco   = rgb(1, 1, 1);

  let y = height - 40;

  // Header
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: azul });
  page.drawText('MEDILYFT', { x: 40, y: height - 45, size: 22, font: fontBold, color: blanco });
  page.drawText('Historia Clínica', { x: 40, y: height - 65, size: 11, font: fontNormal, color: blanco });
  page.drawText(`Generado: ${new Date().toLocaleDateString('es-EC')}`, {
    x: width - 180, y: height - 55, size: 9, font: fontNormal, color: blanco
  });

  y = height - 110;

  function seccion(titulo) {
    page.drawRectangle({ x: 40, y: y - 4, width: width - 80, height: 20, color: rgb(0.9, 0.93, 0.97) });
    page.drawText(titulo, { x: 44, y: y, size: 10, font: fontBold, color: azul });
    y -= 28;
  }

  function campo(label, valor) {
    page.drawText(`${label}:`, { x: 44, y, size: 9, font: fontBold, color: gris });
    page.drawText(valor || '—', { x: 180, y, size: 9, font: fontNormal, color: negro });
    y -= 16;
  }

  // Datos del paciente
  seccion('DATOS DEL PACIENTE');
  campo('Nombre completo', `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim());
  campo('Cédula', paciente.cedula);
  campo('Fecha de nacimiento', paciente.fecha_nacimiento);
  campo('Edad', paciente.edad ? `${paciente.edad} años` : null);
  campo('Correo electrónico', paciente.correo);
  campo('Teléfono', paciente.telefono);
  campo('Lugar de residencia', paciente.lugar_residencia);
  campo('Empresa / Seguro', `${paciente.empresa || '—'} / ${paciente.seguro || '—'}`);

  y -= 8;

  // Motivo de consulta
  seccion('MOTIVO DE CONSULTA');
  campo('Síntomas referidos', consulta.sintomas_descripcion);
  campo('Nivel de urgencia', consulta.nivel_sintomas === 1 ? 'Leve' : consulta.nivel_sintomas === 2 ? 'Medio' : 'Grave');
  campo('Horario solicitado', consulta.horario_preferencia);

  y -= 8;

  // Antecedentes
  seccion('ANTECEDENTES MÉDICOS');
  campo('Alergias', antecedentes.alergias);
  campo('Hipertensión', antecedentes.hipertension);
  campo('Diabetes', antecedentes.diabetes);
  campo('Cirugías previas', antecedentes.cirugias);
  campo('Otros antecedentes', antecedentes.otros);

  y -= 8;

  // Espacio para médico
  seccion('USO MÉDICO');
  campo('Diagnóstico', '');
  y -= 8;
  campo('Tratamiento', '');
  y -= 8;
  campo('Observaciones', '');

  // Footer
  page.drawLine({ start: { x: 40, y: 60 }, end: { x: width - 40, y: 60 }, thickness: 0.5, color: gris });
  page.drawText('Documento generado automáticamente por MediLyft · Confidencial', {
    x: 40, y: 45, size: 7, font: fontNormal, color: gris
  });
  page.drawText('Este documento es de uso médico exclusivo y está protegido bajo la LOPDP (Ecuador)', {
    x: 40, y: 34, size: 7, font: fontNormal, color: gris
  });

  return await doc.save();
}

module.exports = { generarHistoriaMedica };
