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
      <td><strong>${n.titulo}</strong><br><span style="font-size:12px;color:#888">${n.mensaje}</span></td>
      <td style="white-space:nowrap;font-size:12px;color:#888">${new Date(n.created_at).toLocaleString('es-EC')}</td>
      <td>${n.leida ? '<span class="badge badge-gray">Leída</span>' : '<span class="badge badge-blue">Nueva</span>'}</td>
      <td style="display:flex;gap:4px">
        ${n.consulta_id && !n.leida ? `<button class="btn btn-sm btn-primary" onclick="openAgendar('${n.consulta_id}','${n.paciente_id}')">Agendar</button>` : ''}
        ${!n.leida ? `<button class="btn btn-sm" onclick="marcarLeida('${n.id}')">✓</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:2rem">Sin notificaciones</td></tr>';
  document.getElementById('notifList').innerHTML = notifs.slice(0, 8).map(n => `
    <div class="notif-item ${n.leida ? '' : 'unread'}" onclick="marcarLeida('${n.id}')">
      <div class="notif-tipo ${n.tipo === 'urgente' ? 'notif-urgente' : 'notif-nueva'}">${n.tipo === 'urgente' ? '⚠️ URGENTE' : '📅 NUEVA'}</div>
      <div class="notif-titulo">${n.titulo}</div>
      <div class="notif-msg">${n.mensaje}</div>
      <div class="notif-time">${new Date(n.created_at).toLocaleString('es-EC')}</div>
    </div>
  `).join('') || '<div style="padding:1rem;color:#aaa;text-align:center;font-size:13px">Sin notificaciones</div>';
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

function startNotifPolling() {
  notifInterval = setInterval(async () => {
    const notifs = await supa('GET', 'notificaciones', null, '?leida=eq.false');
    const count = (notifs || []).length;
    updateNotifBadge(count);
    if (count > lastNotifCount && lastNotifCount >= 0) {
      const latest = (notifs || [])[0];
      if (latest) showToast(`🔔 ${latest.titulo}`);
    }
    lastNotifCount = count;
  }, 10000);
}
