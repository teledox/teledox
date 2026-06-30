// Calcula el Health Score de adherencia/engagement (0-100) a partir de comportamiento
// ya registrado por el bot — no requiere que el paciente reporte signos vitales.
// Cualquier componente sin datos suficientes se excluye y el máximo se escala proporcionalmente.
// Retorna { score: number|null, etiqueta: 'controlado'|'en_riesgo'|'alerta'|null }

function calcularScoreAdherencia({ adherenciaTratamientoPct, bienestarProm, controlesPreventivosPct, participacionActivaPct }) {
  const componentes = [];

  // Adherencia al tratamiento — 25 pts (% de "sí tomé" sobre recordatorios de medicamento respondidos)
  if (adherenciaTratamientoPct != null) {
    const pts = Math.round((adherenciaTratamientoPct / 100) * 25);
    componentes.push({ obtenido: pts, maximo: 25 });
  }

  // Hábitos de bienestar — 25 pts (promedio de check-ins 1=Excelente … 5=Muy mal, invertido)
  if (bienestarProm != null) {
    const pts = Math.round(((5 - bienestarProm) / 4) * 25);
    componentes.push({ obtenido: Math.max(0, pts), maximo: 25 });
  }

  // Controles preventivos — 25 pts (% de exámenes de laboratorio confirmados sobre solicitados)
  if (controlesPreventivosPct != null) {
    const pts = Math.round((controlesPreventivosPct / 100) * 25);
    componentes.push({ obtenido: pts, maximo: 25 });
  }

  // Participación activa — 25 pts (% de recordatorios respondidos sobre enviados)
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

module.exports = { calcularScoreAdherencia };
