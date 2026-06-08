async function loadDashboard() {
  const [consultas, pacientes, notifs] = await Promise.all([
    supa('GET', 'consultas', null, '?select=*,pacientes(nombre,apellidos,clientes_b2b(nombre_empresa))&order=created_at.desc'),
    supa('GET', 'pacientes', null, '?select=count'),
    supa('GET', 'notificaciones', null, '?leida=eq.false&order=created_at.desc&limit=5')
  ]);
  const all = consultas || [];
  const pendientes = all.filter(c => c.estado === 'pendiente');
  const sinMedico = all.filter(c => !c.medico_id && c.estado !== 'completada');
  const hoy = new Date().toDateString();
  const hoyCount = all.filter(c => new Date(c.created_at).toDateString() === hoy).length;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card stat-warning"><div class="stat-label">Consultas pendientes</div><div class="stat-value">${pendientes.length}</div><div class="stat-sub">Por atender</div></div>
    <div class="stat-card"><div class="stat-label">Total pacientes</div><div class="stat-value">${pacientes?.[0]?.count || 0}</div></div>
    <div class="stat-card"><div class="stat-label">Consultas hoy</div><div class="stat-value">${hoyCount}</div></div>
    <div class="stat-card stat-danger"><div class="stat-label">Alertas sin leer</div><div class="stat-value">${(notifs || []).length}</div></div>
  `;

  // === Alertas de servicio para médicos/admins ===
  const banner = document.getElementById('servicioAlertasBanner');
  if (banner) {
    if ((currentUser.rol === 'medico' || currentUser.rol === 'admin') && sinMedico.length > 0) {
      banner.style.display = 'block';
      banner.innerHTML = `
        <div class="alerta-servicio">
          <div class="alerta-titulo">🔴 ${sinMedico.length} consulta${sinMedico.length > 1 ? 's' : ''} sin médico asignado — ¡Se requiere atención!</div>
          ${sinMedico.slice(0, 4).map(c => {
            const p = c.pacientes || {};
            const nivel = c.nivel_sintomas === 3 ? '🔴 Grave' : c.nivel_sintomas === 2 ? '🟡 Medio' : '🟢 Leve';
            return `<div class="alerta-item">
              <div class="alerta-item-info">
                <div class="alerta-item-nombre">${p.nombre || '—'} ${p.apellidos || ''}</div>
                <div class="alerta-item-meta">${nivel} · ${p.clientes_b2b?.nombre_empresa || 'B2C'}</div>
                <span class="alerta-timer" data-created="${c.created_at}" style="font-size:13px;font-weight:700">⏱ ${formatElapsedTime(c.created_at)}</span>
              </div>
              <button class="btn-atender-banner" onclick="atenderConsulta('${c.id}',this)">🩺 Atender</button>
            </div>`;
          }).join('')}
          ${sinMedico.length > 4 ? `<div style="text-align:center;padding-top:10px;font-size:12px;opacity:0.9">+ ${sinMedico.length - 4} más — <a href="#" onclick="showPage('alertas');return false;" style="color:white;font-weight:700;text-decoration:underline">Ver todas las alertas</a></div>` : ''}
        </div>`;
    } else {
      banner.style.display = 'none';
    }
  }

  document.getElementById('pendCount').textContent = pendientes.length;
  document.getElementById('pendBody').innerHTML = pendientes.slice(0, 5).map(c => {
    const p = c.pacientes || {}; const n = c.nivel_sintomas;
    return `<tr>
      <td><strong>${p.nombre || '—'} ${p.apellidos || ''}</strong><br><span style="font-size:11px;color:#aaa">${p.clientes_b2b?.nombre_empresa || ''}</span></td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.sintomas_descripcion || '—'}</td>
      <td>${n===3?'<span class="badge badge-red">Grave</span>':n===2?'<span class="badge badge-yellow">Medio</span>':'<span class="badge badge-green">Leve</span>'}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        ${!c.medico_id && (currentUser.rol === 'medico' || currentUser.rol === 'admin') ? `<button class="btn btn-sm btn-atender" onclick="atenderConsulta('${c.id}',this)">🩺 Atender</button>` : ''}
        ${(currentUser.rol === 'operador' || currentUser.rol === 'admin') ? `<button class="btn btn-sm btn-primary" onclick="openAgendar('${c.id}','${c.paciente_id}')">Agendar</button>` : ''}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:1.5rem">Sin consultas pendientes</td></tr>';

  document.getElementById('recentNotifs').innerHTML = (notifs || []).map(n => `
    <div style="padding:10px 0;border-bottom:1px solid #f5f5f5">
      <div style="font-size:12px;font-weight:600;color:${n.tipo === 'urgente' ? '#dc2626' : '#2563eb'}">${n.tipo === 'urgente' ? '⚠️ Urgente' : '📅 Nueva consulta'}</div>
      <div style="font-size:13px;color:#333;margin-top:2px">${n.titulo}</div>
      <div style="font-size:12px;color:#888">${n.mensaje}</div>
    </div>
  `).join('') || '<div class="empty-state" style="padding:1.5rem">Sin alertas</div>';
}

async function loadAlertasServicio() {
  const consultas = await supa('GET', 'consultas', null,
    '?select=*,pacientes(nombre,apellidos,cedula,clientes_b2b(nombre_empresa))&medico_id=is.null&estado=neq.completada&order=nivel_sintomas.desc,created_at.asc') || [];
  const el = document.getElementById('alertasServicioList');
  if (!el) return;

  // Update badge
  const badge = document.getElementById('alertasBadge');
  if (badge) {
    badge.textContent = consultas.length;
    badge.style.display = consultas.length > 0 ? 'inline-flex' : 'none';
  }

  if (!consultas.length) {
    el.innerHTML = '<div class="empty-state" style="padding:3rem">✅ No hay consultas pendientes de atención en este momento.<br><span style="font-size:13px">Las nuevas consultas aparecerán aquí automáticamente.</span></div>';
    return;
  }

  el.innerHTML = consultas.map(c => {
    const p = c.pacientes || {};
    const nivel = c.nivel_sintomas === 3
      ? '<span class="badge badge-red">🔴 Grave</span>'
      : c.nivel_sintomas === 2
        ? '<span class="badge badge-yellow">🟡 Medio</span>'
        : '<span class="badge badge-green">🟢 Leve</span>';
    return `
      <div style="background:white;border-radius:12px;border:2px solid #fee2e2;padding:1rem 1.25rem;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:16px">
        <div style="flex:1">
          <div style="font-size:15px;font-weight:700;color:#1a1a1a">${p.nombre || '—'} ${p.apellidos || ''}</div>
          <div style="font-size:12px;color:#888;margin-top:2px">Cédula: ${p.cedula || '—'} · ${p.clientes_b2b?.nombre_empresa || 'Paciente B2C'}</div>
          <div style="font-size:12px;color:#888;margin-top:2px;max-width:500px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.sintomas_descripcion || '—'}</div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
            ${nivel}
            <span class="alerta-timer" data-created="${c.created_at}" style="font-size:13px;font-weight:700">${formatElapsedTime(c.created_at)}</span>
          </div>
        </div>
        <button class="btn btn-sm btn-atender" style="font-size:13px;padding:10px 20px" onclick="atenderConsulta('${c.id}',this)">🩺 Atender</button>
      </div>`;
  }).join('');
}
