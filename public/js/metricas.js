// Datos globales para exportación
let _kpiData = {};

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

  try {
    // Queries separadas para aislar errores — si una falla, las demás continúan
    const [consultasRaw, pacientesRaw, recetasRaw, respuestasRaw, medicosRaw, historicasRaw] = await Promise.all([
      supa('GET', 'consultas', null,
        `?select=id,nivel_sintomas,estado,created_at,atendido_at,medico_id,pacientes(clientes_b2b(nombre_empresa))&created_at=gte.${desde}`),
      supa('GET', 'pacientes', null, '?select=count'),
      supa('GET', 'recetas',   null, '?select=id,seguimiento_activo'),
      supa('GET', 'seguimiento_respuestas', null, '?select=se_siente_mejor').catch(() => []),
      supa('GET', 'usuarios',  null, '?select=id,nombre,apellidos,especialidad&activo=eq.true&rol=in.(medico,admin)'),
      supa('GET', 'consultas', null, '?select=paciente_id,created_at,pacientes(cliente_b2b_id,clientes_b2b(nombre_empresa))').catch(() => [])
    ]);

    // Normalizar — si algo devolvió error JSON en vez de array, usar []
    const all        = Array.isArray(consultasRaw) ? consultasRaw : [];
    const recetas    = Array.isArray(recetasRaw)   ? recetasRaw   : [];
    const respuestas = Array.isArray(respuestasRaw)? respuestasRaw: [];
    const medicos    = Array.isArray(medicosRaw)   ? medicosRaw   : [];

    const total      = all.length;
    const graves     = all.filter(c => c.nivel_sintomas === 3).length;
    const medios     = all.filter(c => c.nivel_sintomas === 2).length;
    const leves      = all.filter(c => c.nivel_sintomas === 1).length;
    const completadas= all.filter(c => c.estado === 'completada').length;
    const enAtencion = all.filter(c => c.estado === 'en_atencion').length;
    const pendientes = all.filter(c => c.estado === 'pendiente').length;
    const exitosos   = respuestas.filter(r => r.se_siente_mejor === true).length;
    const tasa       = total > 0 ? Math.round(completadas / total * 100) : 0;
    const periodoLabel = { dia: 'hoy', semana: 'esta semana', mes: 'este mes' }[periodo];

    // ── Stats principales ──────────────────────────────────────────────────
    document.getElementById('metricStats').innerHTML = `
      <div class="stat-card"><div class="stat-label">Total consultas (${periodoLabel})</div><div class="stat-value">${total}</div></div>
      <div class="stat-card stat-success"><div class="stat-label">Completadas</div><div class="stat-value">${completadas}</div><div class="stat-sub">Tasa: ${tasa}%</div></div>
      <div class="stat-card"><div class="stat-label">Total pacientes</div><div class="stat-value">${pacientesRaw?.[0]?.count || 0}</div></div>
      <div class="stat-card stat-danger"><div class="stat-label">Emergencias</div><div class="stat-value">${graves}</div></div>
    `;

    // ── Distribución por nivel ─────────────────────────────────────────────
    const barH = 80;
    document.getElementById('nivelChart').innerHTML = `
      <div style="display:flex;gap:1rem;align-items:flex-end;height:${barH+60}px;padding:0 1rem">
        ${[['Leves',leves,'#16a34a'],['Medios',medios,'#ca8a04'],['Graves',graves,'#dc2626'],['En atención',enAtencion,'#2563eb'],['Pendientes',pendientes,'#f97316']].map(([l,v,c]) => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
            <span style="font-size:13px;font-weight:600;color:${c}">${v}</span>
            <div style="width:100%;height:${total>0?Math.max(4,Math.round(v/total*barH)):4}px;background:${c};border-radius:4px 4px 0 0"></div>
            <span style="font-size:11px;color:#888;text-align:center">${l}</span>
            <span style="font-size:11px;color:#aaa">${total>0?Math.round(v/total*100):0}%</span>
          </div>`).join('')}
      </div>`;

    // ── KPIs principales ───────────────────────────────────────────────────
    document.getElementById('kpiContent').innerHTML = [
      ['Tasa de resolución',       `${tasa}%`,                              tasa >= 70 ? '#16a34a' : '#ca8a04'],
      ['Consultas completadas',    completadas,                              '#16a34a'],
      ['En atención ahora',        enAtencion,                              '#2563eb'],
      ['Pendientes sin atender',   pendientes,                              pendientes > 0 ? '#dc2626' : '#aaa'],
      ['Recetas con seguimiento',  recetas.filter(r => r.seguimiento_activo).length, '#2563eb'],
      ['Seguimientos exitosos',    exitosos,                                '#16a34a'],
      ['Total emergencias (graves)', graves,                                '#dc2626'],
    ].map(([l,v,c]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f5f5f5">
        <span style="font-size:13px;color:#555">${l}</span>
        <span style="font-size:16px;font-weight:700;color:${c}">${v}</span>
      </div>`).join('');

    // ── Seguimientos de tratamiento ────────────────────────────────────────
    const sinMejora = respuestas.filter(r => r.se_siente_mejor === false).length;
    document.getElementById('seguimientoStats').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0.5rem 0">
        ${[['Seguimientos exitosos',exitosos,'#16a34a'],['Sin mejoría',sinMejora,'#dc2626'],['Recetas activas',recetas.length,'#2563eb']]
          .map(([l,v,c]) => `
            <div style="text-align:center;padding:1rem;background:#f9f9f9;border-radius:8px">
              <div style="font-size:28px;font-weight:700;color:${c}">${v}</div>
              <div style="font-size:12px;color:#888;margin-top:4px">${l}</div>
            </div>`).join('')}
      </div>`;

    // ── Tiempo de respuesta (desde creación hasta que médico hizo clic en Atender) ─────
    function formatMinutes(min) {
      if (min === null || min === undefined || isNaN(min)) return '—';
      if (min < 1)  return `${Math.round(min * 60)}s`;
      if (min < 60) return `${Math.round(min)} min`;
      return `${Math.floor(min/60)}h ${Math.round(min%60)}m`;
    }

    // Solo consultas que tienen atendido_at registrado (cuando médico presionó Atender)
    const atendidas = all.filter(c => c.atendido_at && c.created_at);
    const tiempos   = atendidas
      .map(c => (new Date(c.atendido_at) - new Date(c.created_at)) / 60000)
      .filter(t => t >= 0 && t < 1440); // descartar negativos y >24h (datos corruptos)

    const avgGeneral = tiempos.length ? tiempos.reduce((a,b) => a+b,0) / tiempos.length : null;
    const minResp    = tiempos.length ? Math.min(...tiempos) : null;
    const maxResp    = tiempos.length ? Math.max(...tiempos) : null;
    const sorted     = [...tiempos].sort((a,b) => a-b);
    const mediana    = sorted.length
      ? (sorted.length % 2 === 0
          ? (sorted[sorted.length/2-1] + sorted[sorted.length/2]) / 2
          : sorted[Math.floor(sorted.length/2)])
      : null;

    // Distribución de tiempos en rangos
    const rangos = [
      { label: '< 5 min',   count: tiempos.filter(t => t < 5).length,            color: '#16a34a' },
      { label: '5–15 min',  count: tiempos.filter(t => t >= 5  && t < 15).length, color: '#ca8a04' },
      { label: '15–30 min', count: tiempos.filter(t => t >= 15 && t < 30).length, color: '#ea580c' },
      { label: '> 30 min',  count: tiempos.filter(t => t >= 30).length,           color: '#dc2626' },
    ];

    const trEl = document.getElementById('tiempoRespuestaStats');
    if (trEl) {
      const color = avgGeneral === null ? '#aaa' : avgGeneral < 5 ? '#16a34a' : avgGeneral < 15 ? '#ca8a04' : '#dc2626';
      trEl.innerHTML = tiempos.length ? `
        <div style="text-align:center;padding:1rem 0;margin-bottom:1rem">
          <div style="font-size:44px;font-weight:700;color:${color}">${formatMinutes(avgGeneral)}</div>
          <div style="font-size:12px;color:#888;margin-top:4px">Tiempo promedio de espera del paciente</div>
          <div style="font-size:11px;color:#aaa;margin-top:2px">Desde que solicita hasta que un médico atiende · ${tiempos.length} consulta${tiempos.length!==1?'s':''}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:1rem">
          ${[['Mínimo',minResp,'#16a34a'],['Mediana',mediana,'#2563eb'],['Máximo',maxResp,'#dc2626']].map(([l,v,c]) => `
            <div style="background:#f9f9f9;border-radius:8px;padding:10px;text-align:center">
              <div style="font-size:18px;font-weight:700;color:${c}">${formatMinutes(v)}</div>
              <div style="font-size:11px;color:#888;margin-top:2px">${l}</div>
            </div>`).join('')}
        </div>
        <div style="font-size:12px;color:#555;font-weight:600;margin-bottom:6px">Distribución por rango</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
          ${rangos.map(r => `
            <div style="text-align:center;padding:8px 4px;background:#f9f9f9;border-radius:8px;border-top:3px solid ${r.color}">
              <div style="font-size:20px;font-weight:700;color:${r.color}">${r.count}</div>
              <div style="font-size:10px;color:#888;margin-top:2px">${r.label}</div>
            </div>`).join('')}
        </div>`
        : `<div style="text-align:center;color:#aaa;padding:2rem;font-size:13px">
            ⏱ Sin datos de tiempo de espera en este período.<br>
            <span style="font-size:12px">Se registra automáticamente cuando un médico hace clic en <strong>Atender</strong>.</span>
           </div>`;
    }

    // ── Respuesta por empresa B2B ──────────────────────────────────────────
    const porEmpresa = {};
    all.forEach(c => {
      const empresa = c.pacientes?.clientes_b2b?.nombre_empresa || 'B2C / Sin empresa';
      if (!porEmpresa[empresa]) porEmpresa[empresa] = { total: 0, completadas: 0, graves: 0 };
      porEmpresa[empresa].total++;
      if (c.estado === 'completada') porEmpresa[empresa].completadas++;
      if (c.nivel_sintomas === 3)    porEmpresa[empresa].graves++;
    });

    const b2bEl = document.getElementById('tiempoRespuestaB2B');
    if (b2bEl) {
      const empresas = Object.entries(porEmpresa).sort((a,b) => b[1].total - a[1].total);
      b2bEl.innerHTML = empresas.length ? `
        <table class="table">
          <thead><tr><th>Empresa</th><th style="text-align:center">Consultas</th><th style="text-align:center">Completadas</th><th style="text-align:center">Emergencias</th><th style="text-align:center">Resolución</th></tr></thead>
          <tbody>${empresas.map(([emp, data]) => {
            const tasa = data.total > 0 ? Math.round(data.completadas / data.total * 100) : 0;
            const color = tasa >= 70 ? '#16a34a' : tasa >= 40 ? '#ca8a04' : '#dc2626';
            return `<tr>
              <td><strong>${emp}</strong></td>
              <td style="text-align:center;font-weight:700">${data.total}</td>
              <td style="text-align:center;color:#16a34a;font-weight:600">${data.completadas}</td>
              <td style="text-align:center;color:#dc2626;font-weight:600">${data.graves}</td>
              <td style="text-align:center;font-weight:700;color:${color}">${tasa}%</td>
            </tr>`;
          }).join('')}</tbody>
        </table>`
        : '<div style="text-align:center;color:#aaa;padding:2rem;font-size:13px">Sin datos de empresas en el período.</div>';
    }

    // ── Tasa de retención de pacientes ────────────────────────────────────
    const historicas = Array.isArray(historicasRaw) ? historicasRaw : [];

    // Agrupar todas las consultas históricas por paciente_id
    const porPaciente = {};
    historicas.forEach(c => {
      const pid = c.paciente_id;
      if (!pid) return;
      if (!porPaciente[pid]) {
        porPaciente[pid] = {
          total: 0,
          empresa: c.pacientes?.clientes_b2b?.nombre_empresa || null,
          cliente_b2b_id: c.pacientes?.cliente_b2b_id || null
        };
      }
      porPaciente[pid].total++;
    });

    const totalPacientesHistorico = Object.keys(porPaciente).length;
    const recurrentes = Object.values(porPaciente).filter(p => p.total > 1).length;
    const nuevos      = totalPacientesHistorico - recurrentes;
    const tasaRetencion = totalPacientesHistorico > 0
      ? Math.round(recurrentes / totalPacientesHistorico * 100) : 0;

    // Segmentación por empresa
    const retencionPorEmpresa = {};
    Object.values(porPaciente).forEach(p => {
      const seg = p.empresa || 'B2C / Sin empresa';
      if (!retencionPorEmpresa[seg]) retencionPorEmpresa[seg] = { total: 0, recurrentes: 0 };
      retencionPorEmpresa[seg].total++;
      if (p.total > 1) retencionPorEmpresa[seg].recurrentes++;
    });

    const retEl = document.getElementById('retencionStats');
    if (retEl) {
      const colorGlobal = tasaRetencion >= 40 ? '#16a34a' : tasaRetencion >= 20 ? '#ca8a04' : '#dc2626';
      const segmentos = Object.entries(retencionPorEmpresa).sort((a,b) => b[1].total - a[1].total);
      retEl.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0.5rem 0;margin-bottom:1rem">
          <div style="text-align:center;padding:1rem;background:#f9f9f9;border-radius:8px">
            <div style="font-size:36px;font-weight:700;color:${colorGlobal}">${tasaRetencion}%</div>
            <div style="font-size:12px;color:#888;margin-top:4px">Tasa de retención global</div>
          </div>
          <div style="text-align:center;padding:1rem;background:#f9f9f9;border-radius:8px">
            <div style="font-size:28px;font-weight:700;color:#2563eb">${recurrentes}</div>
            <div style="font-size:12px;color:#888;margin-top:4px">Pacientes recurrentes</div>
            <div style="font-size:11px;color:#aaa">(más de 1 consulta)</div>
          </div>
          <div style="text-align:center;padding:1rem;background:#f9f9f9;border-radius:8px">
            <div style="font-size:28px;font-weight:700;color:#ca8a04">${nuevos}</div>
            <div style="font-size:12px;color:#888;margin-top:4px">Pacientes nuevos</div>
            <div style="font-size:11px;color:#aaa">(primera consulta)</div>
          </div>
        </div>
        <div style="font-size:12px;color:#555;font-weight:600;margin-bottom:8px">Desglose por segmento</div>
        <table class="table">
          <thead><tr>
            <th>Segmento</th>
            <th style="text-align:center">Total pacientes</th>
            <th style="text-align:center">Recurrentes</th>
            <th style="text-align:center">Nuevos</th>
            <th style="text-align:center">Tasa retención</th>
          </tr></thead>
          <tbody>${segmentos.map(([seg, d]) => {
            const t = d.total > 0 ? Math.round(d.recurrentes / d.total * 100) : 0;
            const c = t >= 40 ? '#16a34a' : t >= 20 ? '#ca8a04' : '#dc2626';
            const esB2C = seg === 'B2C / Sin empresa';
            return `<tr>
              <td><strong>${esB2C ? '👤 ' : '🏢 '}${seg}</strong></td>
              <td style="text-align:center;font-weight:700">${d.total}</td>
              <td style="text-align:center;color:#2563eb;font-weight:600">${d.recurrentes}</td>
              <td style="text-align:center;color:#ca8a04;font-weight:600">${d.total - d.recurrentes}</td>
              <td style="text-align:center">
                <div style="display:flex;align-items:center;gap:6px;justify-content:center">
                  <div style="background:#eee;border-radius:10px;overflow:hidden;height:8px;width:60px">
                    <div style="width:${t}%;background:${c};height:100%;border-radius:10px"></div>
                  </div>
                  <span style="font-weight:700;color:${c}">${t}%</span>
                </div>
              </td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        <div style="font-size:11px;color:#aaa;margin-top:8px;text-align:right">
          📊 Datos históricos acumulados · ${totalPacientesHistorico} pacientes en total
        </div>`;
    }

    // ── Ranking por médico ─────────────────────────────────────────────────
    // Guardar datos globalmente para exportación
    // _kpiData se completa después de calcular tiempos (más abajo)

    const porMedico = medicos.map(m => ({
      nombre: `Dr. ${m.nombre} ${m.apellidos}`,
      esp: m.especialidad || 'Medicina General',
      total:       all.filter(c => c.medico_id === m.id).length,
      completadas: all.filter(c => c.medico_id === m.id && c.estado === 'completada').length,
      graves:      all.filter(c => c.medico_id === m.id && c.nivel_sintomas === 3).length
    })).filter(m => m.total > 0).sort((a,b) => b.total - a.total);

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

    _kpiData = { periodo, periodoLabel, total, graves, medios, leves, completadas, enAtencion, pendientes,
      exitosos, sinMejora: respuestas.filter(r => r.se_siente_mejor === false).length,
      tasa, recetasActivas: recetas.filter(r => r.seguimiento_activo).length,
      totalRecetas: recetas.length, porEmpresa, tiempos, avgGeneral, minResp, maxResp, mediana,
      retencion: { tasaRetencion, recurrentes, nuevos, totalPacientesHistorico, retencionPorEmpresa } };
    _kpiData.porMedico = porMedico;
    const medicoTablaEl = document.getElementById('medicoTabla');
    if (medicoTablaEl) {
      medicoTablaEl.innerHTML = porMedico.length
        ? porMedico.map(m => `
            <tr>
              <td><strong>${m.nombre}</strong><br><span style="font-size:11px;color:#aaa">${m.esp}</span></td>
              <td style="text-align:center;font-size:17px;font-weight:700;color:#FF5A5F">${m.total}</td>
              <td style="text-align:center;color:#16a34a;font-weight:600">${m.completadas}</td>
              <td style="text-align:center;color:#dc2626;font-weight:600">${m.graves}</td>
              <td style="text-align:center">
                ${m.total > 0
                  ? `<div style="background:#eee;border-radius:10px;overflow:hidden;height:8px;width:80px;margin:0 auto">
                       <div style="width:${Math.round(m.completadas/m.total*100)}%;background:#FF5A5F;height:100%;border-radius:10px"></div>
                     </div>
                     <span style="font-size:11px;color:#888">${Math.round(m.completadas/m.total*100)}%</span>`
                  : '—'}
              </td>
            </tr>`)
          .join('')
        : '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:1.5rem">Sin datos en el período</td></tr>';
    }

  } catch (e) {
    console.error('[loadMetricas] Error:', e.message);
    // Mostrar error visible en lugar de quedarse en "Cargando..."
    ['metricStats','nivelChart','kpiContent','seguimientoStats','tiempoRespuestaStats','tiempoRespuestaB2B','retencionStats','medicoRanking']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div style="color:#dc2626;padding:1rem;font-size:13px">⚠️ Error al cargar: ${e.message}</div>`;
      });
    const mt = document.getElementById('medicoTabla');
    if (mt) mt.innerHTML = `<tr><td colspan="5" style="color:#dc2626;padding:1rem">⚠️ Error al cargar datos</td></tr>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTACIÓN A EXCEL
// ═══════════════════════════════════════════════════════════════════════════

function _descargarExcel(wb, nombre) {
  const periodo = _kpiData.periodo || 'mes';
  const fecha   = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `MediLyft_${nombre}_${periodo}_${fecha}.xlsx`);
}

function _sheetDesde(filas, cabeceras) {
  const ws = XLSX.utils.aoa_to_sheet([cabeceras, ...filas]);
  // Ancho automático
  const anchos = cabeceras.map((h, i) => ({
    wch: Math.max(h.length, ...filas.map(f => String(f[i] ?? '').length)) + 2
  }));
  ws['!cols'] = anchos;
  return ws;
}

// ── Exportar sección individual ───────────────────────────────────────────
function exportarSeccion(seccion) {
  if (!_kpiData.periodo) { showToast('⚠️ Carga primero las métricas'); return; }
  const d  = _kpiData;
  const wb = XLSX.utils.book_new();

  if (seccion === 'kpi-distribucion') {
    const ws = _sheetDesde([
      ['Leves',    d.leves,    d.total > 0 ? Math.round(d.leves/d.total*100)+'%' : '0%'],
      ['Medios',   d.medios,   d.total > 0 ? Math.round(d.medios/d.total*100)+'%' : '0%'],
      ['Graves',   d.graves,   d.total > 0 ? Math.round(d.graves/d.total*100)+'%' : '0%'],
      ['En atención', d.enAtencion, d.total > 0 ? Math.round(d.enAtencion/d.total*100)+'%' : '0%'],
      ['Pendientes',  d.pendientes, d.total > 0 ? Math.round(d.pendientes/d.total*100)+'%' : '0%'],
      ['Total',    d.total,    '100%'],
    ], ['Nivel', 'Consultas', 'Porcentaje']);
    XLSX.utils.book_append_sheet(wb, ws, 'Distribución');
  }

  else if (seccion === 'kpi-principales') {
    const ws = _sheetDesde([
      ['Total consultas ('+(d.periodoLabel||'')+')',   d.total],
      ['Completadas',                                   d.completadas],
      ['En atención',                                   d.enAtencion],
      ['Pendientes sin atender',                        d.pendientes],
      ['Tasa de resolución',                            d.tasa+'%'],
      ['Recetas con seguimiento activo',                d.recetasActivas],
      ['Total recetas',                                 d.totalRecetas],
      ['Seguimientos exitosos',                         d.exitosos],
      ['Sin mejoría',                                   d.sinMejora],
      ['Emergencias (graves)',                          d.graves],
    ], ['KPI', 'Valor']);
    XLSX.utils.book_append_sheet(wb, ws, 'KPIs principales');
  }

  else if (seccion === 'kpi-seguimiento') {
    const ws = _sheetDesde([
      ['Seguimientos exitosos', d.exitosos],
      ['Sin mejoría',           d.sinMejora],
      ['Recetas activas',       d.totalRecetas],
      ['Con seguimiento activo', d.recetasActivas],
    ], ['Indicador', 'Valor']);
    XLSX.utils.book_append_sheet(wb, ws, 'Seguimiento');
  }

  else if (seccion === 'kpi-medicos') {
    const filas = (d.porMedico || []).map((m, i) => [
      i+1, m.nombre, m.esp, m.total, m.completadas, m.graves,
      m.total > 0 ? Math.round(m.completadas/m.total*100)+'%' : '0%'
    ]);
    const ws = _sheetDesde(filas, ['#', 'Médico', 'Especialidad', 'Total', 'Completadas', 'Graves', 'Resolución']);
    XLSX.utils.book_append_sheet(wb, ws, 'Médicos');
  }

  else if (seccion === 'kpi-tiempos') {
    function fmtMin(min) {
      if (min === null || min === undefined || isNaN(min)) return '—';
      if (min < 1) return Math.round(min*60)+'s';
      if (min < 60) return Math.round(min)+' min';
      return Math.floor(min/60)+'h '+Math.round(min%60)+'m';
    }
    const ws = _sheetDesde([
      ['Promedio general',  fmtMin(d.avgGeneral)],
      ['Tiempo mínimo',     fmtMin(d.minResp)],
      ['Mediana',           fmtMin(d.mediana)],
      ['Tiempo máximo',     fmtMin(d.maxResp)],
      ['Consultas medidas', (d.tiempos||[]).length],
    ], ['Métrica', 'Valor']);
    XLSX.utils.book_append_sheet(wb, ws, 'Tiempo de respuesta');
  }

  else if (seccion === 'kpi-empresas') {
    const filas = Object.entries(d.porEmpresa || {}).map(([emp, data]) => {
      const tasa = data.total > 0 ? Math.round(data.completadas/data.total*100) : 0;
      return [emp, data.total, data.completadas, data.graves, tasa+'%'];
    }).sort((a,b) => b[1] - a[1]);
    const ws = _sheetDesde(filas, ['Empresa', 'Total consultas', 'Completadas', 'Emergencias', 'Tasa resolución']);
    XLSX.utils.book_append_sheet(wb, ws, 'Por empresa');
  }

  else if (seccion === 'kpi-retencion') {
    const r = d.retencion || {};
    const resumen = _sheetDesde([
      ['Tasa de retención global',  (r.tasaRetencion||0)+'%'],
      ['Pacientes recurrentes',     r.recurrentes||0],
      ['Pacientes nuevos',          r.nuevos||0],
      ['Total pacientes histórico', r.totalPacientesHistorico||0],
    ], ['Indicador', 'Valor']);
    XLSX.utils.book_append_sheet(wb, resumen, 'Retención resumen');

    const filasSeg = Object.entries(r.retencionPorEmpresa || {}).map(([seg, data]) => {
      const t = data.total > 0 ? Math.round(data.recurrentes/data.total*100) : 0;
      return [seg, data.total, data.recurrentes, data.total - data.recurrentes, t+'%'];
    }).sort((a,b) => b[1] - a[1]);
    const detalle = _sheetDesde(filasSeg, ['Segmento', 'Total pacientes', 'Recurrentes', 'Nuevos', 'Tasa retención']);
    XLSX.utils.book_append_sheet(wb, detalle, 'Retención por segmento');
  }

  _descargarExcel(wb, seccion.replace('kpi-', ''));
  showToast('✓ Excel exportado');
}

// ── Exportar TODAS las secciones en un solo archivo ───────────────────────
function exportarTodoKPI() {
  if (!_kpiData.periodo) { showToast('⚠️ Carga primero las métricas'); return; }
  const d  = _kpiData;
  const wb = XLSX.utils.book_new();

  function fmtMin(min) {
    if (min === null || min === undefined || isNaN(min)) return '—';
    if (min < 1) return Math.round(min*60)+'s';
    if (min < 60) return Math.round(min)+' min';
    return Math.floor(min/60)+'h '+Math.round(min%60)+'m';
  }

  // Hoja 1: Resumen general
  XLSX.utils.book_append_sheet(wb, _sheetDesde([
    ['Total consultas ('+d.periodoLabel+')',  d.total],
    ['Completadas',                            d.completadas],
    ['En atención',                            d.enAtencion],
    ['Pendientes',                             d.pendientes],
    ['Tasa de resolución',                     d.tasa+'%'],
    ['Leves',                                  d.leves],
    ['Medios',                                 d.medios],
    ['Graves',                                 d.graves],
    ['Seguimientos exitosos',                  d.exitosos],
    ['Sin mejoría en seguimiento',             d.sinMejora],
    ['Recetas con seguimiento activo',         d.recetasActivas],
    ['Total recetas',                          d.totalRecetas],
    ['Tiempo respuesta promedio',              fmtMin(d.avgGeneral)],
    ['Tiempo respuesta mínimo',                fmtMin(d.minResp)],
    ['Tiempo respuesta mediana',               fmtMin(d.mediana)],
    ['Tiempo respuesta máximo',                fmtMin(d.maxResp)],
  ], ['KPI', 'Valor']), 'Resumen general');

  // Hoja 2: Por médico
  const filasMed = (d.porMedico || []).map((m, i) => [
    i+1, m.nombre, m.esp, m.total, m.completadas, m.graves,
    m.total > 0 ? Math.round(m.completadas/m.total*100)+'%' : '0%'
  ]);
  XLSX.utils.book_append_sheet(wb, _sheetDesde(filasMed,
    ['#', 'Médico', 'Especialidad', 'Total', 'Completadas', 'Graves', 'Resolución']), 'Por médico');

  // Hoja 3: Por empresa B2B
  const filasEmp = Object.entries(d.porEmpresa || {}).map(([emp, data]) => {
    const tasa = data.total > 0 ? Math.round(data.completadas/data.total*100) : 0;
    return [emp, data.total, data.completadas, data.graves, tasa+'%'];
  }).sort((a,b) => b[1] - a[1]);
  XLSX.utils.book_append_sheet(wb, _sheetDesde(filasEmp,
    ['Empresa', 'Total consultas', 'Completadas', 'Emergencias', 'Tasa resolución']), 'Por empresa');

  // Hoja 4: Retención de pacientes
  const ret = d.retencion || {};
  XLSX.utils.book_append_sheet(wb, _sheetDesde([
    ['Tasa de retención global',  (ret.tasaRetencion||0)+'%'],
    ['Pacientes recurrentes',     ret.recurrentes||0],
    ['Pacientes nuevos',          ret.nuevos||0],
    ['Total pacientes histórico', ret.totalPacientesHistorico||0],
    ...Object.entries(ret.retencionPorEmpresa||{}).map(([seg,data]) => {
      const t = data.total > 0 ? Math.round(data.recurrentes/data.total*100) : 0;
      return [seg, data.total, data.recurrentes, data.total-data.recurrentes, t+'%'];
    })
  ], ['Indicador/Segmento', 'Total', 'Recurrentes', 'Nuevos', 'Tasa']), 'Retención');

  // Hoja 5: Distribución por nivel
  XLSX.utils.book_append_sheet(wb, _sheetDesde([
    ['Leves',       d.leves,       d.total > 0 ? Math.round(d.leves/d.total*100)+'%'       : '0%'],
    ['Medios',      d.medios,      d.total > 0 ? Math.round(d.medios/d.total*100)+'%'      : '0%'],
    ['Graves',      d.graves,      d.total > 0 ? Math.round(d.graves/d.total*100)+'%'      : '0%'],
    ['En atención', d.enAtencion,  d.total > 0 ? Math.round(d.enAtencion/d.total*100)+'%' : '0%'],
    ['Pendientes',  d.pendientes,  d.total > 0 ? Math.round(d.pendientes/d.total*100)+'%' : '0%'],
  ], ['Nivel', 'Consultas', 'Porcentaje']), 'Distribución por nivel');

  _descargarExcel(wb, 'KPIs_completo');
  showToast('✓ Reporte completo exportado a Excel');
}
