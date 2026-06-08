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
        <td>${estadoBadge}</td>
        <td style="display:flex;gap:4px;flex-wrap:wrap;min-width:170px">
          ${puedeAtender ? `<button class="btn btn-sm btn-atender" onclick="atenderConsulta('${c.id}',this)">🩺 Atender</button>` : ''}
          ${c.estado === 'pendiente' && (currentUser.rol === 'operador' || currentUser.rol === 'admin') ? `<button class="btn btn-sm btn-primary" onclick="openAgendar('${c.id}','${c.paciente_id}')">📅 Agendar</button>` : ''}
          <button class="btn btn-sm btn-success" onclick="openReceta('${c.id}','${c.paciente_id}')">📋 Docs</button>
          ${c.estado !== 'completada' ? `<button class="btn btn-sm" onclick="marcarCompletada('${c.id}')" title="Marcar completada">✓</button>` : ''}
          ${currentUser.rol === 'admin' ? `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca" onclick="eliminarConsulta('${c.id}')">🗑</button>` : ''}
        </td>
      </tr>`;
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:2rem">Sin consultas</td></tr>';
}

async function atenderConsulta(consultaId, btnEl) {
  // Ocultar la tarjeta/fila de forma inmediata sin esperar red
  const card = (btnEl || document.querySelector(`[onclick*="${consultaId}"]`))?.closest('.alerta-item, tr, [style*="border:2px solid #fee2e2"]');
  if (card) card.style.display = 'none';

  const existing = await supa('GET', 'consultas', null, `?id=eq.${consultaId}&select=medico_id`);
  if (existing?.[0]?.medico_id) {
    showToast('⚠️ Esta consulta ya fue tomada por otro médico');
    if (card) card.style.display = '';
    loadConsultas();
    if (typeof loadDashboard === 'function') loadDashboard();
    return;
  }
  await supa('PATCH', 'consultas', { medico_id: currentUser.id, estado: 'en_atencion', atendido_at: new Date().toISOString() }, `?id=eq.${consultaId}`);
  showToast('✓ Consulta asignada — eres el médico tratante');
  loadConsultas();
  if (typeof loadDashboard === 'function') loadDashboard();
  if (typeof loadAlertasServicio === 'function') loadAlertasServicio();
}

async function marcarCompletada(id) {
  await supa('PATCH', 'consultas', { estado: 'completada' }, `?id=eq.${id}`);
  loadConsultas();
  showToast('✓ Consulta completada');
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
