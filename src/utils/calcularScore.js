// Calcula score de salud 0-100 a partir de biométricos.
// Cualquier componente null se excluye y el máximo se escala proporcionalmente.
// Retorna { score: number|null, etiqueta: 'controlado'|'en_riesgo'|'alerta'|null }

function calcularScore({ bienestar, sistolica, diastolica, glucosa, colesterol, peso, altura }) {
  const componentes = [];

  // Presión arterial — 30 pts
  if (sistolica != null && diastolica != null) {
    const s = parseInt(sistolica);
    const d = parseInt(diastolica);
    let pts;
    if (s >= 140 || d >= 90)      pts = 0;   // HTA 2
    else if (s >= 130 || d >= 80) pts = 10;  // HTA 1
    else if (s >= 121)             pts = 20;  // Elevada
    else                           pts = 30;  // Óptima
    componentes.push({ obtenido: pts, maximo: 30 });
  }

  // Glucosa en ayunas — 25 pts
  if (glucosa != null) {
    const g = parseInt(glucosa);
    let pts;
    if (g >= 126)      pts = 0;   // Diabetes
    else if (g >= 100) pts = 12;  // Prediabetes
    else               pts = 25;  // Normal
    componentes.push({ obtenido: pts, maximo: 25 });
  }

  // Colesterol total (mg/dL) — 20 pts
  if (colesterol != null) {
    const col = parseInt(colesterol);
    let pts;
    if (col >= 240)      pts = 0;   // Alto
    else if (col >= 200) pts = 10;  // Límite
    else                 pts = 20;  // Óptimo
    componentes.push({ obtenido: pts, maximo: 20 });
  }

  // IMC — 20 pts (requiere peso y altura)
  if (peso != null && altura != null) {
    const imc = parseFloat(peso) / (parseFloat(altura) / 100) ** 2;
    let pts;
    if (imc < 18.5 || imc >= 30) pts = 5;   // Bajo/Obeso
    else if (imc >= 25)           pts = 12;  // Sobrepeso
    else                          pts = 20;  // Normal
    componentes.push({ obtenido: pts, maximo: 20 });
  }

  // Bienestar subjetivo — 25 pts (escala 1=Muy bien … 5=Muy mal)
  if (bienestar != null) {
    const b = parseInt(bienestar);
    const ptsMap = { 1: 25, 2: 18, 3: 10, 4: 5, 5: 0 };
    const pts = ptsMap[b];
    if (pts != null) componentes.push({ obtenido: pts, maximo: 25 });
  }

  if (!componentes.length) return { score: null, etiqueta: null };

  const totalObtenido = componentes.reduce((s, c) => s + c.obtenido, 0);
  const totalMaximo   = componentes.reduce((s, c) => s + c.maximo,   0);
  const score         = Math.round((totalObtenido / totalMaximo) * 100);

  let etiqueta;
  if      (score >= 70) etiqueta = 'controlado';
  else if (score >= 40) etiqueta = 'en_riesgo';
  else                  etiqueta = 'alerta';

  return { score, etiqueta };
}

module.exports = { calcularScore };
