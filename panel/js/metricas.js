async function loadMetricas() {
  const [consultas, pacientes, recetas, respuestas] = await Promise.all([
    supa('GET', 'consultas', null, '?select=id,nivel_sintomas,estado,created_at'),
    supa('GET', 'pacientes', null, '?select=count'),
    supa('GET', 'recetas', null, '?select=id,seguimiento_activo'),
    supa('GET', 'seguimiento_respuestas', null, '?select=se_siente_mejor,respuesta')
  ]);
  const all = consultas || [];
  const total = all.length;
  const graves = all.filter(c => c.nivel_sintomas === 3).length;
  const medios = all.filter(c => c.nivel_sintomas === 2).length;
  const leves = all.filter(c => c.nivel_sintomas === 1).length;
  const completadas = all.filter(c => c.estado === 'completada').length;
  const exitosos = (respuestas || []).filter(r => r.se_siente_mejor === true).length;
  const tasa = total > 0 ? Math.round(completadas / total * 100) : 0;
  document.getElementById('metricStats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total consultas</div><div class="stat-value">${total}</div></div>
    <div class="stat-card stat-success"><div class="stat-label">Casos exitosos</div><div class="stat-value">${exitosos}</div><div class="stat-sub">Pacientes curados</div></div>
    <div class="stat-card"><div class="stat-label">Total pacientes</div><div class="stat-value">${pacientes?.[0]?.count || 0}</div></div>
    <div class="stat-card stat-danger"><div class="stat-label">Emergencias</div><div class="stat-value">${graves}</div></div>
  `;
  const barH = 80;
  document.getElementById('nivelChart').innerHTML = `<div style="display:flex;gap:1rem;align-items:flex-end;height:${barH + 40}px;padding:0 1rem">${[['Leves', leves, '#16a34a'], ['Medios', medios, '#ca8a04'], ['Graves', graves, '#dc2626']].map(([l, v, c]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><span style="font-size:13px;font-weight:600;color:${c}">${v}</span><div style="width:100%;height:${total > 0 ? Math.round(v / total * barH) : 2}px;background:${c};border-radius:4px 4px 0 0;min-height:2px"></div><span style="font-size:12px;color:#888">${l}</span><span style="font-size:11px;color:#aaa">${total > 0 ? Math.round(v / total * 100) : 0}%</span></div>`).join('')}</div>`;
  document.getElementById('kpiContent').innerHTML = [
    ['Tasa de resolución', `${tasa}%`, tasa >= 70 ? '#16a34a' : '#ca8a04'],
    ['Tratamientos exitosos', exitosos, '#16a34a'],
    ['Recetas con seguimiento', (recetas || []).filter(r => r.seguimiento_activo).length, '#2563eb'],
    ['Total emergencias', graves, '#dc2626']
  ].map(([l, v, c]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f5f5f5"><span style="font-size:13px;color:#555">${l}</span><span style="font-size:16px;font-weight:600;color:${c}">${v}</span></div>`).join('');
  const sinMejora = (respuestas || []).filter(r => r.se_siente_mejor === false).length;
  document.getElementById('seguimientoStats').innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0.5rem 0">${[['Seguimientos exitosos', exitosos, '#16a34a'], ['Sin mejoría', sinMejora, '#dc2626'], ['Recetas activas', (recetas || []).length, '#2563eb']].map(([l, v, c]) => `<div style="text-align:center;padding:1rem;background:#f9f9f9;border-radius:8px"><div style="font-size:24px;font-weight:600;color:${c}">${v}</div><div style="font-size:12px;color:#888;margin-top:4px">${l}</div></div>`).join('')}</div>`;
}
