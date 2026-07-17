// pdf-lib se carga lazy — evita crashear el cold start de Vercel (includeFiles solo aplica a api/index.js)
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

module.exports = async function handler(req, res) {
  const { PDFDocument } = require('pdf-lib');
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    // req.body es el buffer del PDF (Content-Type: application/pdf)
    const inputBuffer = req.body;
    if (!inputBuffer || !inputBuffer.length) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    if (inputBuffer.length <= MAX_BYTES) {
      // Ya está dentro del límite — devolver tal cual
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Compressed', 'false');
      return res.status(200).send(inputBuffer);
    }

    // Cargar y re-guardar con pdf-lib (elimina metadata y optimiza estructura)
    const pdfDoc = await PDFDocument.load(inputBuffer, { ignoreEncryption: true });

    // Eliminar metadata innecesaria
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('MediLyft');
    pdfDoc.setCreator('MediLyft');

    const outputBytes = await pdfDoc.save({ useObjectStreams: true });

    if (outputBytes.length > MAX_BYTES) {
      return res.status(413).json({
        error: `El PDF pesa ${(outputBytes.length / 1024 / 1024).toFixed(1)}MB después de comprimir. Máximo permitido: 5MB. Por favor reduzca la resolución de las imágenes antes de subir.`,
        size_mb: (outputBytes.length / 1024 / 1024).toFixed(2)
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Compressed', 'true');
    res.setHeader('X-Original-Size', inputBuffer.length);
    res.setHeader('X-Compressed-Size', outputBytes.length);
    return res.status(200).send(Buffer.from(outputBytes));

  } catch (e) {
    console.error('Error comprimiendo PDF:', e.message);
    return res.status(500).json({ error: 'No se pudo procesar el PDF: ' + e.message });
  }
};
