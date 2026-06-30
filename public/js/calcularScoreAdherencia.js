// Copia frontend de src/utils/calcularScoreAdherencia.js — mismo cálculo,
// duplicado porque el panel no tiene bundler/require() para compartir módulos
// con el backend. Mantener ambos archivos en sync si cambia la fórmula.

function calcularScoreAdherencia({ adherenciaTratamientoPct, bienestarProm, controlesPreventivosPct, participacionActivaPct }) {
  const componentes = [];

  if (adherenciaTratamientoPct != null) {
    const pts = Math.round((adherenciaTratamientoPct / 100) * 25);
    componentes.push({ obtenido: pts, maximo: 25 });
  }

  if (bienestarProm != null) {
    const pts = Math.round(((5 - bienestarProm) / 4) * 25);
    componentes.push({ obtenido: Math.max(0, pts), maximo: 25 });
  }

  if (controlesPreventivosPct != null) {
    const pts = Math.round((controlesPreventivosPct / 100) * 25);
    componentes.push({ obtenido: pts, maximo: 25 });
  }

  if (participacionActivaPct != null) {
    const pts = Math.round((participacionActivaPct / 100) * 25);
    componentes.push({ obtenido: pts, maximo: 25 });
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
