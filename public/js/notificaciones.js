async function loadNotificaciones() {
  const notifs = await supa('GET', 'notificaciones', null, '?order=created_at.desc&limit=100') || [];
  const sinLeer = notifs.filter(n => !n.leida);
  const urgentes = notifs.filter(n => n.tipo === 'urgente' && !n.leida);
  const hoy = new Date().toDateString();
  const atendidas = notifs.filter(n => n.leida && new Date(n.created_at).toDateString() === hoy);
  document.getElementById('op-pending').textContent = sinLeer.length;
  document.getElementById('op-urgent').textContent = urgentes.length;
  document.getElementById('op-done').textContent = atendidas.length;
  document.getElementById('op-total').textContent = notifs.length;
  updateNotifBadge(sinLeer.length);
  document.getElementById('notifBody').innerHTML = notifs.map(n => `
    <tr style="${n.leida ? '' : 'background:#fffbeb'}">
      <td><span style="font-size:12px;font-weight:600;color:${n.tipo === 'urgente' ? '#dc2626' : '#2563eb'}">${n.tipo === 'urgente' ? '⚠️ Urgente' : '📅 Nueva'}</span></td>
      <td><strong>${escapeHtml(n.titulo)}</strong><br><span style="font-size:12px;color:#888">${escapeHtml(n.mensaje)}</span></td>
      <td style="white-space:nowrap;font-size:12px">
        ${n.leida ? '' : `<span class="alerta-timer" data-created="${n.created_at}" style="font-weight:700;color:${getTimerColor(n.created_at)}">⏱ ${formatElapsedTime(n.created_at)}</span><br>`}
        <span style="color:#aaa;font-size:11px">${new Date(n.created_at).toLocaleString('es-EC')}</span>
      </td>
      <td>${n.leida ? '<span class="badge badge-gray">Leída</span>' : '<span class="badge badge-blue">Nueva</span>'}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        ${n.consulta_id && !n.leida && (currentUser?.rol === 'medico' || currentUser?.rol === 'admin') ? `<button class="btn btn-sm btn-atender" onclick="atenderConsulta('${n.consulta_id}');marcarLeida('${n.id}')">🩺 Atender</button>` : ''}
        ${n.consulta_id && !n.leida && (currentUser?.rol === 'operador' || currentUser?.rol === 'admin') ? `<button class="btn btn-sm btn-primary" onclick="openAgendar('${n.consulta_id}','${n.paciente_id}')">Agendar</button>` : ''}
        ${!n.leida ? `<button class="btn btn-sm" onclick="marcarLeida('${n.id}')">✓</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:2rem">Sin notificaciones</td></tr>';
  document.getElementById('notifList').innerHTML = notifs.slice(0, 8).map(n => `
    <div class="notif-item ${n.leida ? '' : 'unread'}" onclick="marcarLeida('${n.id}')">
      <div class="notif-tipo ${n.tipo === 'urgente' ? 'notif-urgente' : 'notif-nueva'}">${n.tipo === 'urgente' ? '⚠️ URGENTE' : '📅 NUEVA'}</div>
      <div class="notif-titulo">${escapeHtml(n.titulo)}</div>
      <div class="notif-msg">${escapeHtml(n.mensaje)}</div>
      <div class="notif-time">
        ${n.leida ? '' : `<span class="alerta-timer" data-created="${n.created_at}" style="font-weight:700;color:${getTimerColor(n.created_at)}">⏱ ${formatElapsedTime(n.created_at)}</span>`}
      </div>
    </div>
  `).join('') || '<div style="padding:1rem;color:#aaa;text-align:center;font-size:13px">Sin notificaciones</div>';

  // Reiniciar el cronómetro para que actualice los nuevos elementos renderizados
  if (typeof startTimerUpdater === 'function') startTimerUpdater();
}

async function marcarLeida(id) { await supa('PATCH', 'notificaciones', { leida: true }, `?id=eq.${id}`); loadNotificaciones(); }
async function marcarTodasLeidas() { await supa('PATCH', 'notificaciones', { leida: true }, '?leida=eq.false'); loadNotificaciones(); showToast('✓ Todas marcadas como leídas'); }

function updateNotifBadge(count) {
  const badge = document.getElementById('notifCount');
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function toggleNotif() {
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) loadNotificaciones();
}

let _lastUnclaimedCount = -1;

function startNotifPolling() {
  // Polling ligero cada 8s solo para detectar nuevas notificaciones/alertas
  // (el polling de 6s en realtime.js ya refresca las vistas activas)
  notifInterval = setInterval(async () => {
    // --- 1. Notificaciones generales ---
    const notifs = await supa('GET', 'notificaciones', null, '?leida=eq.false&select=id,titulo&order=created_at.desc');
    const count  = (notifs || []).length;
    updateNotifBadge(count);

    if (count > lastNotifCount && lastNotifCount >= 0) {
      playAlertSound();
      const latest = (notifs || [])[0];
      if (latest) showToast(`🔔 ${latest.titulo}`);
    }
    lastNotifCount = count;

    // --- 2. Consultas sin médico ---
    if (currentUser && (currentUser.rol === 'medico' || currentUser.rol === 'admin')) {
      const sinMedico = await supa('GET', 'consultas', null,
        '?medico_id=is.null&estado=neq.completada&select=id');
      const unclaimedCount = (sinMedico || []).length;

      if (unclaimedCount > _lastUnclaimedCount && _lastUnclaimedCount >= 0) {
        playAlertSound();
        showToast(`🔴 Nueva consulta sin médico — ${unclaimedCount} esperando`);
      }

      const badge = document.getElementById('alertasBadge');
      if (badge) {
        badge.textContent   = unclaimedCount;
        badge.style.display = unclaimedCount > 0 ? 'inline-flex' : 'none';
      }
      _lastUnclaimedCount = unclaimedCount;
    }
  }, 8000);
}
