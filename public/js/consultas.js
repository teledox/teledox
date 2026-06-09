async function loadConsultas() {
  const estado = document.getElementById('filterEstado')?.value || '';
  const q = estado
    ? `?select=*,pacientes(nombre,apellidos,cedula),medico:usuarios!consultas_medico_id_fkey(nombre,apellidos)&order=created_at.desc&estado=eq.${estado}`
    : '?select=*,pacientes(nombre,apellidos,cedula),medico:usuarios!consultas_medico_id_fkey(nombre,apellidos)&order=created_at.desc';
  const consultas = await supa('GET', 'consultas', null, q) || [];

  const totalCons = consultas.length;
  document.getElementById('consultasBody').innerHTML = consultas.map((c, i) => {
    const p = c.pacientes || {};
    const med = c.medico;
    const sinMedico = !c.medico_id;
    const puedeAtender = sinMedico && (currentUser.rol === 'medico' || currentUser.rol === 'admin');

    const nivelBadge = c.nivel_sintomas === 3
      ? '<span class="badge badge-red">🔴 Grave</span>'
      : c.nivel_sintomas === 2
        ? '<span class="badge badge-yellow">🟡 Medio</span>'
        : '<span class="badge badge-green">🟢 Leve</span>';

    const estadoBadge = {
      completada:  '<span class="badge badge-green">✓ Completada</span>',
      en_atencion: '<span class="badge badge-blue">🩺 En atención</span>',
      confirmada:  '<span class="badge badge-blue">📅 Confirmada</span>',
      pendiente:   '<span class="badge badge-yellow">⏳ Pendiente</span>'
    }[c.estado] || `<span class="badge badge-gray">${c.estado}</span>`;

    // Timer en vivo: cuánto lleva la consulta sin agendar (solo mientras está pendiente)
    const timerEspera = c.estado === 'pendiente'
      ? `<div style="margin-top:5px"><span class="alerta-timer" data-created="${c.created_at}" style="font-size:12px;font-weight:700">⏱ ${formatElapsedTime(c.created_at)}</span><div style="font-size:9px;color:#aaa">sin agendar</div></div>`
      : '';

    const medicoInfo = med
      ? `<div style="font-size:11px;color:#16a34a;margin-top:3px">🩺 Dr. ${med.nombre || ''} ${med.apellidos || ''}</div>`
      : `<div style="font-size:11px;color:#FF5A5F;margin-top:3px">⚠️ Sin médico asignado</div>`;

    return `
      <tr ${sinMedico && c.estado !== 'completada' ? 'style="background:#fff8f8"' : ''}>
        <td style="text-align:center;font-size:12px;font-weight:700;color:#aaa;min-width:36px">${totalCons - i}</td>
        <td>
          <strong>${p.nombre || '—'} ${p.apellidos || ''}</strong>
          <br><span style="font-size:11px;color:#aaa">${p.cedula || ''}</span>
          ${medicoInfo}
        </td>
        <td style="white-space:nowrap">
          ${new Date(c.created_at).toLocaleDateString('es-EC',{day:'2-digit',month:'short',year:'numeric'})}
          <br><span style="font-size:11px;color:#aaa">${new Date(c.created_at).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</span>
        </td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(c.sintomas_descripcion||'').replace(/"/g,"&quot;")}">${c.sintomas_descripcion || '—'}</td>
        <td>${nivelBadge}</td>
        <td>${estadoBadge}${timerEspera}</td>
        <td style="display:flex;gap:4px;flex-wrap:wrap;min-width:170px">
          ${puedeAtender ? `<button class="btn btn-sm btn-atender" onclick="atenderConsulta('${c.id}',this)">🩺 Atender</button>` : ''}
          ${c.estado === 'pendiente' && (currentUser.rol === 'operador' || currentUser.rol === 'admin') ? `<button class="btn btn-sm btn-primary" onclick="openAgendar('${c.id}','${c.paciente_id}')">📅 Agendar</button>` : ''}
          <button class="btn btn-sm" style="background:#eff6ff;color:#2563eb;border-color:#bfdbfe" title="Enviar link de teleconsulta al paciente" onclick="abrirPopupLink('${c.paciente_id}','${(p.nombre||'').replace(/'/g,"\\'")} ${(p.apellidos||'').replace(/'/g,"\\'")}')">🔗 Link</button>
          <button class="btn btn-sm btn-success" onclick="openReceta('${c.id}','${c.paciente_id}')">📋 Docs</button>
          ${c.estado !== 'completada' ? `<button class="btn btn-sm" onclick="marcarCompletada('${c.id}')" title="Marcar completada">✓</button>` : ''}
          ${currentUser.rol === 'admin' ? `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca" onclick="eliminarConsulta('${c.id}')">🗑</button>` : ''}
        </td>
      </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:2rem">Sin consultas</td></tr>';

  // Iniciar de inmediato los cronómetros recién renderizados (el intervalo global los sigue actualizando)
  if (typeof startTimerUpdater === 'function') startTimerUpdater();
}

// IDs de consultas en proceso de ser atendidas — bloqueadas del render
window._atendiendo = window._atendiendo || new Set();

async function atenderConsulta(consultaId, btnEl) {
  if (window._atendiendo.has(consultaId)) return;
  window._atendiendo.add(consultaId);

  // Ocultar tarjeta inmediatamente
  const card = (btnEl || document.querySelector(`[onclick*="${consultaId}"]`))?.closest('.alerta-item, tr, [style*="border:2px solid #fee2e2"]');
  if (card) card.style.display = 'none';

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;

    const res = await fetch('/api/atender-consulta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, consulta_id: consultaId })
    });
    const result = await res.json();

    if (res.status === 409 || result.error === 'ya_tomada') {
      showToast('⚠️ Esta consulta ya fue tomada por otro médico');
      if (card) card.style.display = '';
      window._atendiendo.delete(consultaId);
      loadConsultas();
      if (typeof loadDashboard === 'function') loadDashboard();
      return;
    }

    if (!res.ok) {
      showToast('❌ Error al asignar consulta: ' + (result.error || res.status));
      if (card) card.style.display = '';
      window._atendiendo.delete(consultaId);
      return;
    }

    showToast('✓ Consulta asignada — eres el médico tratante');
    loadConsultas();
    if (typeof loadDashboard === 'function') loadDashboard();
    if (typeof loadAlertasServicio === 'function') loadAlertasServicio();
    setTimeout(() => window._atendiendo.delete(consultaId), 3000);

  } catch (e) {
    showToast('❌ Error de conexión al atender consulta');
    if (card) card.style.display = '';
    window._atendiendo.delete(consultaId);
  }
}

async function marcarCompletada(id) {
  await supa('PATCH', 'consultas', { estado: 'completada' }, `?id=eq.${id}`);
  loadConsultas();
  showToast('✓ Consulta completada');
}

// ── Link de teleconsulta ─────────────────────────────────────────────────
function abrirPopupLink(pacienteId, pacienteNombre) {
  document.getElementById('linkPacienteId').value    = pacienteId;
  document.getElementById('linkPacienteInfo').textContent = `👤 ${pacienteNombre.trim() || 'Paciente'}`;
  document.getElementById('linkInput').value         = '';
  document.getElementById('popupLink').style.display = 'flex';
  setTimeout(() => document.getElementById('linkInput').focus(), 100);
}

function cerrarPopupLink() {
  document.getElementById('popupLink').style.display = 'none';
  document.getElementById('linkInput').value = '';
}

async function enviarLinkTeleconsulta() {
  const pacienteId = document.getElementById('linkPacienteId').value;
  const link       = document.getElementById('linkInput').value.trim();

  if (!link) { showToast('⚠️ Pega el link de la reunión'); return; }
  if (!link.startsWith('http')) { showToast('⚠️ El link debe comenzar con http'); return; }

  const btn = document.querySelector('#popupLink .btn-primary');
  btn.disabled     = true;
  btn.textContent  = '⏳ Enviando...';

  try {
    const medicoNombre = `${currentUser?.nombre || ''} ${currentUser?.apellidos || ''}`.trim();
    const res = await fetch('/api/enviar-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paciente_id: pacienteId, link, medico_nombre: medicoNombre })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast('❌ ' + (data.error || 'Error al enviar'));
    } else {
      cerrarPopupLink();
      showToast(`✓ Link enviado a ${data.paciente} (${data.numero})`);
    }
  } catch (e) {
    showToast('❌ Error de conexión: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = '📲 Enviar link al paciente';
  }
}

async function eliminarConsulta(consultaId) {
  if (currentUser?.rol !== 'admin') return;
  if (!confirm('¿Eliminar esta consulta?\n\n⚠️ No se puede deshacer.')) return;
  showToast('⏳ Eliminando...');
  try {
    await adminDelete('consulta', consultaId);
    showToast('✓ Consulta eliminada');
    loadConsultas();
  } catch (e) {
    console.error('Error eliminando consulta:', e);
    alert(`No se pudo eliminar:\n\n${e.message}`);
    showToast('❌ Error al eliminar');
  }
}
