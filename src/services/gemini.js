const { GEMINI_API_KEY } = require('../config');

const MODEL = 'gemini-2.0-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function construirPrompt() {
  const ahora = new Date().toISOString();
  return `Analiza esta imagen de un posible comprobante de pago o transferencia bancaria (Ecuador).
La fecha y hora actual es: ${ahora} (UTC).

Responde ÚNICAMENTE con un JSON (sin texto adicional, sin markdown) con estos campos exactos:
{
  "es_comprobante": boolean — true solo si la imagen es claramente un comprobante/recibo de pago, transferencia o depósito bancario (no una foto sin relación, captura de chat, documento de otro tipo, etc.),
  "captura_completa": boolean — true solo si la imagen es una captura de pantalla completa de la app/web del banco (se ve el encabezado/logo, el cuerpo y no parece recortada o cortada),
  "banco": string o null — nombre del banco o entidad financiera emisora,
  "logo_banco_valido": boolean — true solo si la imagen muestra el logo, membrete o diseño oficial de una app/banco real, de forma consistente y sin señales de edición, recorte o manipulación,
  "monto": number o null — monto de la transacción (solo el número, sin símbolo de moneda ni comas),
  "fecha": string o null — fecha y hora de la transacción tal como aparece en la imagen,
  "fecha_reciente": boolean — true solo si la fecha/hora de la transacción está dentro de las últimas 48 horas respecto a la fecha/hora actual indicada arriba,
  "referencia": string o null — número de referencia, comprobante o transacción,
  "beneficiario": string o null — nombre del beneficiario/destinatario de la transferencia,
  "observaciones": string o null — cualquier señal de edición, inconsistencia o manipulación que detectes en la imagen
}`;
}

// Analiza una imagen de comprobante con Gemini Vision y devuelve el JSON estructurado.
async function analizarComprobante(buffer, mimeType) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');

  const res = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: construirPrompt() },
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: buffer.toString('base64') } }
        ]
      }],
      generationConfig: { response_mime_type: 'application/json' }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${err}`);
  }

  const data = await res.json();
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error('Gemini no devolvió contenido');

  return JSON.parse(texto);
}

module.exports = { analizarComprobante };
