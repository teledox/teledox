function setPeriodoActivo(periodo) {
  document.querySelectorAll('.periodo-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.periodo === periodo);
  });
  loadMetricas(periodo);
}

async function loadMetricas(periodo) {
  if (!periodo) periodo = document.querySelector('.periodo-btn.active')?.dataset.periodo || 'mes';

  const now = new Date();
  let desde;
  if (periodo === 'dia') {
    desde = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  } else if (periodo === 'semana') {
    const d = new Date(now); d.setDate(d.getDate() - 7); desde = d.toISOString();
  } else {
    const d = new Date(now); d.setDate(1); d.setHours(0, 0, 0, 0); desde = d.toISOString();
  }

  const [consultas, pacientes, recetas, respuestas, medicos] = await Promise.all([
    supa('GET', 'consultas', null, `?select=id,nivel_sintomas,estado,created_at,atendido_at,medico_id,pacientes(clientes_b2b(nombre_empresa))&created_at=gte.${desde}`),
    supa('GET', 'pacientes', null, '?select=count'),
    supa('GET', 'recetas', null, '?select=id,seguimiento_activo'),
    supa('GET', 'seguimiento_respuestas', null, '?select=se_siente_mejor,respuesta'),
    supa('GET', 'usuarios', null, '?select=id,nombre,apellidos,especialidad&activo=eq.true&rol=in.(medico,admin)')
  ]);

  const all = consultas || [];
  const total = all.length;
  const graves = all.filter(c => c.nivel_sintomas === 3).length;
  const medios = all.filter(c => c.nivel_sintomas === 2).length;
  const leves = all.filter(c => c.nivel_sintomas === 1).length;
  const completadas = all.filter(c => c.estado === 'completada').length;
  const exitosos = (respuestas || []).filter(r => r.se_siente_mejor === true).length;
  const tasa = total > 0 ? Math.round(completadas / total * 100) : 0;
  const periodoLabel = { dia: 'hoy', semana: 'esta semana', mes: 'este mes' }[periodo];

  document.getElementById('metricStats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total consultas (${periodoLabel})</div><div class="stat-value">${total}</div></div>
    <div class="stat-card stat-success"><div class="stat-label">Casos exitosos</div><div class="stat-value">${exitosos}</div><div class="stat-sub">Pacientes curados</div></div>
    <div class="stat-card"><div class="stat-label">Total pacientes</div><div class="stat-value">${pacientes?.[0]?.count || 0}</div></div>
    <div class="stat-card stat-danger"><div class="stat-label">Emergencias</div><div class="stat-value">${graves}</div></div>
  `;

  const barH = 80;
  document.getElementById('nivelChart').innerHTML = `<div style="display:flex;gap:1rem;align-items:flex-end;height:${barH+40}px;padding:0 1rem">${[['Leves',leves,'#16a34a'],['Medios',medios,'#ca8a04'],['Graves',graves,'#dc2626']].map(([l,v,c]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><span style="font-size:13px;font-weight:600;color:${c}">${v}</span><div style="width:100%;height:${total>0?Math.round(v/total*barH):2}px;background:${c};border-radius:4px 4px 0 0;min-height:2px"></div><span style="font-size:12px;color:#888">${l}</span><span style="font-size:11px;color:#aaa">${total>0?Math.round(v/total*100):0}%</span></div>`).join('')}</div>`;

  document.getElementById('kpiContent').innerHTML = [
    ['Tasa de resolución', `${tasa}%`, tasa >= 70 ? '#16a34a' : '#ca8a04'],
    ['Tratamientos exitosos', exitosos, '#16a34a'],
    ['Recetas con seguimiento', (recetas || []).filter(r => r.seguimiento_activo).length, '#2563eb'],
    ['Total emergencias', graves, '#dc2626']
  ].map(([l, v, c]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f5f5f5"><span style="font-size:13px;color:#555">${l}</span><span style="font-size:16px;font-weight:600;color:${c}">${v}</span></div>`).join('');

  const sinMejora = (respuestas || []).filter(r => r.se_siente_mejor === false).length;
  document.getElementById('seguimientoStats').innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0.5rem 0">${[['Seguimientos exitosos',exitosos,'#16a34a'],['Sin mejoría',sinMejora,'#dc2626'],['Recetas activas',(recetas||[]).length,'#2563eb']].map(([l,v,c]) => `<div style="text-align:center;padding:1rem;background:#f9f9f9;border-radius:8px"><div style="font-size:24px;font-weight:600;color:${c}">${v}</div><div style="font-size:12px;color:#888;margin-top:4px">${l}</div></div>`).join('')}</div>`;

  // === Tiempo de respuesta ===
  function formatMinutes(min) {
    if (min === null || isNaN(min)) return '—';
    if (min < 1) return `${Math.round(min * 60)}s`;
    if (min < 60) return `${Math.round(min)} min`;
    return `${Math.floor(min/60)}h ${Math.round(min%60)}m`;
  }

  const atendidas = all.filter(c => c.atendido_at);
  const tiempos = atendidas.map(c => (new Date(c.atendido_at) - new Date(c.created_at)) / 60000);
  const avgGeneral = tiempos.length ? tiempos.reduce((a,b) => a+b, 0) / tiempos.length : null;
  const minResp = tiempos.length ? Math.min(...tiempos) : null;
  const maxResp = tiempos.length ? Math.max(...tiempos) : null;
  const sorted = [...tiempos].sort((a,b) => a-b);
  const mediana = sorted.length ? (sorted.length % 2 === 0 ? (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2 : sorted[Math.floor(sorted.length/2)]) : null;

  const trEl = document.getElementById('tiempoRespuestaStats');
  if (trEl) {
    const color = avgGeneral === null ? '#aaa' : avgGeneral < 5 ? '#16a34a' : avgGeneral < 15 ? '#ca8a04' : '#dc2626';
    trEl.innerHTML = atendidas.length ? `
      <div style="text-align:center;padding:1rem 0;margin-bottom:1rem">
        <div style="font-size:42px;font-weight:700;color:${color}">${formatMinutes(avgGeneral)}</div>
        <div style="font-size:12px;color:#888;margin-top:4px">Promedio general de respuesta</div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">Basado en ${atendidas.length} consulta${atendidas.length!==1?'s':''} atendida${atendidas.length!==1?'s':''}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        ${[['Mínimo',minResp,'#16a34a'],['Mediana',mediana,'#2563eb'],['Máximo',maxResp,'#dc2626']].map(([l,v,c]) => `
        <div style="background:#f9f9f9;border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:17px;font-weight:700;color:${c}">${formatMinutes(v)}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">${l}</div>
        </div>`).join('')}
      </div>` : '<div style="text-align:center;color:#aaa;padding:2rem;font-size:13px">Sin datos de tiempo de respuesta aún.<br><span style="font-size:12px">Se registra cuando un médico hace clic en Atender.</span></div>';
  }

  // Por empresa B2B
  const porEmpresa = {};
  atendidas.forEach(c => {
    const empresa = c.pacientes?.clientes_b2b?.nombre_empresa || 'B2C / Sin empresa';
    if (!porEmpresa[empresa]) porEmpresa[empresa] = [];
    porEmpresa[empresa].push((new Date(c.atendido_at) - new Date(c.created_at)) / 60000);
  });
  const b2bEl = document.getElementById('tiempoRespuestaB2B');
  if (b2bEl) {
    const empresas = Object.entries(porEmpresa).map(([emp, mins]) => ({
      emp,
      count: mins.length,
      avg: mins.reduce((a,b) => a+b, 0) / mins.length,
      min: Math.min(...mins),
      max: Math.max(...mins)
    })).sort((a,b) => a.avg - b.avg);

    b2bEl.innerHTML = empresas.length ? `
      <table class="table">
        <thead><tr><th>Empresa</th><th style="text-align:center">Consultas</th><th style="text-align:center">Promedio</th><th style="text-align:center">Mejor</th><th style="text-align:center">Peor</th></tr></thead>
        <tbody>${empresas.map(e => {
          const c = e.avg < 5 ? '#16a34a' : e.avg < 15 ? '#ca8a04' : '#dc2626';
          return `<tr>
            <td><strong>${e.emp}</strong></td>
            <td style="text-align:center">${e.count}</td>
            <td style="text-align:center;font-weight:700;color:${c}">${formatMinutes(e.avg)}</td>
            <td style="text-align:center;color:#16a34a">${formatMinutes(e.min)}</td>
            <td style="text-align:center;color:#dc2626">${formatMinutes(e.max)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<div style="text-align:center;color:#aaa;padding:2rem;font-size:13px">Sin datos de empresas en el período.</div>';
  }

  // === Ranking por médico ===
  const medicosData = medicos || [];
  const porMedico = medicosData.map(m => ({
    nombre: `Dr. ${m.nombre} ${m.apellidos}`,
    esp: m.especialidad || 'Medicina General',
    total: all.filter(c => c.medico_id === m.id).length,
    completadas: all.filter(c => c.medico_id === m.id && c.estado === 'completada').length,
    graves: all.filter(c => c.medico_id === m.id && c.nivel_sintomas === 3).length
  })).filter(m => m.total > 0).sort((a, b) => b.total - a.total);

  const maxTotal = porMedico[0]?.total || 1;
  const medicoRankingEl = document.getElementById('medicoRanking');
  if (medicoRankingEl) {
    medicoRankingEl.innerHTML = porMedico.length
      ? porMedico.map((m, i) => `
          <div class="medico-rank">
            <div class="medico-rank-pos">${i + 1}</div>
            <div class="medico-rank-bar-wrap">
              <div class="medico-rank-name">${m.nombre} <span style="font-size:11px;color:#aaa;font-weight:400">· ${m.esp}</span></div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                <div class="medico-rank-bar" style="flex:1"><div class="medico-rank-bar-fill" style="width:${Math.round(m.total/maxTotal*100)}%"></div></div>
                <span style="font-size:11px;color:#16a34a;font-weight:600">${m.completadas} compl.</span>
                ${m.graves > 0 ? `<span style="font-size:11px;color:#dc2626;font-weight:600">${m.graves} grav.</span>` : ''}
              </div>
            </div>
            <div class="medico-rank-count">${m.total}</div>
          </div>`)
        .join('')
      : '<div style="text-align:center;color:#aaa;padding:1.5rem;font-size:13px">Sin consultas atendidas en el período seleccionado</div>';
  }

  // Tabla detallada
  const medicoTablaEl = document.getElementById('medicoTabla');
  if (medicoTablaEl) {
    medicoTablaEl.innerHTML = porMedico.length
      ? porMedico.map(m => `
          <tr>
            <td><strong>${m.nombre}</strong><br><span style="font-size:11px;color:#aaa">${m.esp}</span></td>
            <td style="text-align:center;font-size:17px;font-weight:700;color:#FF5A5F">${m.total}</td>
            <td style="text-align:center"><span style="color:#16a34a;font-weight:600">${m.completadas}</span></td>
            <td style="text-align:center"><span style="color:#dc2626;font-weight:600">${m.graves}</span></td>
            <td style="text-align:center">
              ${m.total > 0 ? `<div style="background:#eee;border-radius:10px;overflow:hidden;height:8px;width:80px;margin:0 auto"><div style="width:${Math.round(m.completadas/m.total*100)}%;background:#FF5A5F;height:100%;border-radius:10px"></div></div><span style="font-size:11px;color:#888">${Math.round(m.completadas/m.total*100)}%</span>` : '—'}
            </td>
          </tr>`)
        .join('')
      : '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:1.5rem">Sin datos en el período</td></tr>';
  }
}
