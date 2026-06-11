// Toggle del selector de empresa: solo tiene sentido cuando se filtra por B2B
function onFilterOrigenChange() {
  const origen = document.getElementById('filterOrigen')?.value || '';
  const selEmpresa = document.getElementById('filterEmpresa');
  if (selEmpresa) {
    selEmpresa.style.display = origen === 'b2b' ? '' : 'none';
    if (origen !== 'b2b') selEmpresa.value = '';
  }
  loadConsultas();
}

async function loadConsultas() {
  const estado   = document.getElementById('filterEstado')?.value || '';
  const origen   = document.getElementById('filterOrigen')?.value || '';
  const empresa  = document.getElementById('filterEmpresa')?.value || '';
  const etiquetaFiltro = document.getElementById('filterEtiqueta')?.value || '';

  const q = estado
    ? `?select=*,pacientes(nombre,apellidos,cedula,clientes_b2b(id,nombre_empresa)),medico:usuarios!consultas_medico_id_fkey(nombre,apellidos)&order=created_at.desc&estado=eq.${estado}`
    : '?select=*,pacientes(nombre,apellidos,cedula,clientes_b2b(id,nombre_empresa)),medico:usuarios!consultas_medico_id_fkey(nombre,apellidos)&order=created_at.desc';
  let consultas = await supa('GET', 'consultas', null, q) || [];

  // Etiquetas (PAGO / PAGO SEGURO / AFILIADO / EMPLEADO CON CÓDIGO / SEGUIMIENTO / CRÓNICO) por consulta
  let etiquetas = {};
  const ids = consultas.map(c => c.id);
  if (ids.length) {
    const notifs = await supa('GET', 'notificaciones', null,
      `?consulta_id=in.(${ids.join(',')})&select=consulta_id,etiqueta&order=created_at.desc`) || [];
    notifs.forEach(n => { if (n.etiqueta && !etiquetas[n.consulta_id]) etiquetas[n.consulta_id] = n.etiqueta; });
  }

  // Poblar el filtro de empresas con las empresas B2B presentes en los resultados
  const selEmpresa = document.getElementById('filterEmpresa');
  if (selEmpresa) {
    const empresasMap = {};
    consultas.forEach(c => {
      const cb = c.pacientes?.clientes_b2b;
      if (cb?.id) empresasMap[cb.id] = cb.nombre_empresa;
    });
    const valorActual = selEmpresa.value;
    selEmpresa.innerHTML = '<option value="">Todas las empresas</option>' +
      Object.entries(empresasMap)
        .sort((a, b) => (a[1] || '').localeCompare(b[1] || ''))
        .map(([id, nombre]) => `<option value="${id}">${nombre || '—'}</option>`).join('');
    if ([...selEmpresa.options].some(o => o.value === valorActual)) selEmpresa.value = valorActual;
  }

  // Aplicar filtros de origen / empresa / etiqueta
  consultas = consultas.filter(c => {
    const cb = c.pacientes?.clientes_b2b;
    if (origen === 'b2b' && !cb) return false;
    if (origen === 'b2c' && cb) return false;
    if (origen === 'b2b' && empresa && cb?.id !== empresa) return false;
    if (etiquetaFiltro === '__sin_etiqueta' && etiquetas[c.id]) return false;
    if (etiquetaFiltro && etiquetaFiltro !== '__sin_etiqueta' && etiquetas[c.id] !== etiquetaFiltro) return false;
    return true;
  });

  const totalCons = consultas.length;
  document.getElementById('consultasBody').innerHTML = consultas.map((c, i) => {
    const p = c.pacientes || {};
    const med = c.medico;
    const sinMedico = !c.medico_id;
    const puedeAtender = sinMedico && (currentUser.rol === 'medico' || currentUser.rol === 'admin');
    const empresaB2B = p.clientes_b2b?.nombre_empresa;
    const origenHtml = empresaB2B
      ? `<span class="alerta-tag" style="background:#eff6ff;color:#2563eb">🏢 ${empresaB2B}</span>`
      : `<span class="alerta-tag" style="background:#f3f4f6;color:#6b7280">👤 B2C</span>`;
    const etiquetaHtml = etiquetas[c.id] ? `<br><span class="alerta-tag">${etiquetas[c.id]}</span>` : '';

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
        <td style="white-space:nowrap">${origenHtml}${etiquetaHtml}</td>
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
          <button class="btn btn-sm btn-success" onclick="openReceta('${c.id}','${c.paciente_id}')">ℹ️ Abrir info</button>
          <label class="chk-completar" title="Marcar/desmarcar como completada">
            <input type="checkbox" ${c.estado === 'completada' ? 'checked' : ''}
              onchange="toggleCompletada('${c.id}', this, ${c.medico_id ? `'${c.medico_id}'` : 'null'})">
            Completada
          </label>
          ${currentUser.rol === 'admin' ? `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca" onclick="eliminarConsulta('${c.id}')">🗑</button>` : ''}
        </td>
      </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:2rem">Sin consultas</td></tr>';

  // Iniciar de inmediato los cronómetros recién renderizados (el intervalo global los sigue actualizando)
  if (typeof startTimerUpdater === 'function') startTimerUpdater();
}

// IDs de consultas en proceso de ser atendidas — bloqueadas del render
window._atendiendo = window._atendiendo || new Set();

async function atenderConsulta(consultaId, btnEl) {
  if (window._atendiendo.has(consultaId)) return;
  window._atendiendo.add(consultaId);

  // Ocultar tarjeta inmediatamente
  const card = (btnEl || document.querySelector(`[onclick*="${consultaId}"]`))?.closest('.alerta-item, tr, .alerta-card, [style*="border:2px solid #fee2e2"]');
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

async function toggleCompletada(consultaId, checkboxEl, medicoId) {
  const marcar = checkboxEl.checked;
  const nuevoEstado = marcar ? 'completada' : (medicoId ? 'en_atencion' : 'pendiente');
  abrirConfirmAccion(
    marcar ? '✓ Marcar como completada' : '↩️ Desmarcar como completada',
    marcar
      ? '¿Confirmas que esta consulta fue completada?'
      : '¿Confirmas que deseas desmarcar esta consulta como completada? Volverá a aparecer como pendiente de atención.',
    async () => {
      await supa('PATCH', 'consultas', { estado: nuevoEstado }, `?id=eq.${consultaId}`);
      showToast(marcar ? '✓ Consulta marcada como completada' : '↩️ Consulta desmarcada');
      loadConsultas();
    },
    () => { checkboxEl.checked = !marcar; }
  );
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
