async function loadDashboard() {
  const [consultas, pacientes, notifs] = await Promise.all([
    supa('GET', 'consultas', null, '?select=*,pacientes(nombre,apellidos,clientes_b2b(nombre_empresa))&order=created_at.desc'),
    supa('GET', 'pacientes', null, '?select=count'),
    supa('GET', 'notificaciones', null, '?leida=eq.false&order=created_at.desc&limit=5')
  ]);
  const pendientes = (consultas || []).filter(c => c.estado === 'pendiente');
  const hoy = new Date().toDateString();
  const hoyCount = (consultas || []).filter(c => new Date(c.created_at).toDateString() === hoy).length;
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card stat-warning"><div class="stat-label">Consultas pendientes</div><div class="stat-value">${pendientes.length}</div><div class="stat-sub">Por atender</div></div>
    <div class="stat-card"><div class="stat-label">Total pacientes</div><div class="stat-value">${pacientes?.[0]?.count || 0}</div></div>
    <div class="stat-card"><div class="stat-label">Consultas hoy</div><div class="stat-value">${hoyCount}</div></div>
    <div class="stat-card stat-danger"><div class="stat-label">Alertas sin leer</div><div class="stat-value">${(notifs || []).length}</div></div>
  `;
  document.getElementById('pendCount').textContent = pendientes.length;
  document.getElementById('pendBody').innerHTML = pendientes.slice(0, 5).map(c => {
    const p = c.pacientes || {}; const n = c.nivel_sintomas;
    return `<tr><td><strong>${p.nombre || '—'} ${p.apellidos || ''}</strong><br><span style="font-size:11px;color:#aaa">${p.clientes_b2b?.nombre_empresa || ''}</span></td><td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.sintomas_descripcion || '—'}</td><td>${n === 3 ? '<span class="badge badge-red">Grave</span>' : n === 2 ? '<span class="badge badge-yellow">Medio</span>' : '<span class="badge badge-green">Leve</span>'}</td><td><button class="btn btn-sm btn-primary" onclick="openAgendar('${c.id}','${c.paciente_id}')">Agendar</button></td></tr>`;
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:1.5rem">Sin consultas pendientes</td></tr>';
  document.getElementById('recentNotifs').innerHTML = (notifs || []).map(n => `
    <div style="padding:10px 0;border-bottom:1px solid #f5f5f5">
      <div style="font-size:12px;font-weight:600;color:${n.tipo === 'urgente' ? '#dc2626' : '#2563eb'}">${n.tipo === 'urgente' ? '⚠️ Urgente' : '📅 Nueva consulta'}</div>
      <div style="font-size:13px;color:#333;margin-top:2px">${n.titulo}</div>
      <div style="font-size:12px;color:#888">${n.mensaje}</div>
    </div>
  `).join('') || '<div class="empty-state" style="padding:1.5rem">Sin alertas</div>';
}
