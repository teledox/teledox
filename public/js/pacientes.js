async function loadPacientes() {
  const data = await supa('GET', 'pacientes', null, '?select=*,clientes_b2b(nombre_empresa,nombre_seguro)&order=created_at.desc');
  pacientesData = data || [];
  document.getElementById('pacCount').textContent = pacientesData.length;
  renderPacientes(pacientesData);
}

function renderPacientes(list) {
  const esAdmin = currentUser?.rol === 'admin';
  const total = list.length;
  document.getElementById('pacBody').innerHTML = list.map((p, i) => `
    <tr>
      <td style="text-align:center;font-size:12px;font-weight:700;color:#aaa;min-width:36px">${total - i}</td>
      <td><strong>${escapeHtml(p.nombre) || '—'} ${escapeHtml(p.apellidos)}</strong></td>
      <td>${escapeHtml(p.cedula) || '—'}</td>
      <td>${escapeHtml(p.clientes_b2b?.nombre_empresa) || '—'}</td>
      <td>${escapeHtml(p.telefono) || '—'}</td>
      <td>${escapeHtml(p.lugar_residencia) || '—'}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.correo) || '—'}</td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="showPacienteDetalle('${p.id}')">Ver</button>
        ${esAdmin ? `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca" onclick="eliminarPaciente('${p.id}')">🗑 Eliminar</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:2rem">Sin pacientes</td></tr>';
}

function filterPacientes() {
  const q = document.getElementById('searchPac').value.toLowerCase();
  renderPacientes(pacientesData.filter(p => (p.nombre || '').toLowerCase().includes(q) || (p.apellidos || '').toLowerCase().includes(q) || (p.cedula || '').includes(q)));
}

async function showPacienteDetalle(id) {
  currentPacienteId = id;
  const pac = pacientesData.find(x => x.id === id) || (await supa('GET', 'pacientes', null, `?id=eq.${id}&select=*,clientes_b2b(*)`) || [])[0];
  if (!pac) return;
  const init = ((pac.nombre || '?')[0] + (pac.apellidos || '?')[0]).toUpperCase();
  const esAdmin = currentUser?.rol === 'admin';
  document.getElementById('patientHeader').innerHTML = `
    <div class="patient-avatar-lg">${escapeHtml(init)}</div>
    <div style="flex:1"><div class="patient-name">${escapeHtml(pac.nombre)} ${escapeHtml(pac.apellidos)}</div>
    <div class="patient-meta">Cédula: ${escapeHtml(pac.cedula) || '—'} · ${escapeHtml(pac.clientes_b2b?.nombre_empresa) || '—'}</div></div>
    <button class="btn btn-sm" style="margin-left:auto" onclick="mostrarEditorPaciente('${pac.id}')">✏️ Editar datos</button>
    ${esAdmin ? `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca" onclick="eliminarPaciente('${pac.id}')">🗑 Eliminar paciente</button>` : ''}
  `;
  document.getElementById('detailGrid').innerHTML = [
    ['Edad', pac.edad || '—'], ['Sexo', pac.sexo === 'M' ? 'Masculino' : pac.sexo === 'F' ? 'Femenino' : '—'],
    ['Nacimiento', pac.fecha_nacimiento || '—'], ['Correo', pac.correo || '—'],
    ['Teléfono', pac.telefono || '—'], ['Residencia', pac.lugar_residencia || '—'], ['Empresa', pac.clientes_b2b?.nombre_empresa || '—']
  ].map(([l, v]) => `<div class="detail-item"><div class="detail-label">${escapeHtml(l)}</div><div class="detail-value">${escapeHtml(v)}</div></div>`).join('');

  const consultas = await supa('GET', 'consultas', null, `?paciente_id=eq.${id}&order=created_at.desc`) || [];
  const totalC = consultas.length;

  document.getElementById('patConsultas').innerHTML = consultas.length ? `
    <table class="table"><thead><tr><th style="text-align:center;width:40px">#</th><th>Fecha</th><th>Síntomas</th><th>Diagnóstico</th><th>Nivel</th><th>Estado</th><th>Acciones</th>${esAdmin ? '<th></th>' : ''}</tr></thead>
    <tbody>${consultas.map((c, i) => `<tr>
      <td style="text-align:center;font-size:12px;font-weight:700;color:#aaa">${totalC - i}</td>
      <td>${new Date(c.created_at).toLocaleDateString('es-EC')}</td>
      <td>${escapeHtml(c.sintomas_descripcion) || '—'}</td>
      <td>${escapeHtml(c.diagnostico) || '—'}</td>
      <td>${c.nivel_sintomas === 3 ? '<span class="badge badge-red">Grave</span>' : c.nivel_sintomas === 2 ? '<span class="badge badge-yellow">Medio</span>' : '<span class="badge badge-green">Leve</span>'}</td>
      <td><span class="badge badge-gray">${c.estado}</span></td>
      <td><button class="btn btn-sm" onclick="openReceta('${c.id}','${id}')">➡️ Ir a consulta</button></td>
      ${esAdmin ? `<td><button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca" onclick="eliminarConsultaDesdeDetalle('${c.id}','${id}')">🗑</button></td>` : ''}
    </tr>`).join('')}</tbody></table>`
    : '<div class="empty-state">Sin consultas</div>';

  const [seguimientos, labSeguimientos, cronicas, ultimoBienestar, healthScores] = await Promise.all([
    supa('GET', 'recordatorios', null, `?paciente_id=eq.${id}&order=tipo.asc,activo.desc,created_at.desc`).then(r => r || []),
    supa('GET', 'seguimiento_laboratorio', null, `?paciente_id=eq.${id}&order=created_at.desc&limit=5&select=*,consultas(created_at,diagnostico)`).then(r => r || []),
    supa('GET', 'enfermedades_cronicas', null, `?paciente_id=eq.${id}&order=activo.desc,created_at.desc`).then(r => r || []),
    supa('GET', 'seguimiento_respuestas', null, `?paciente_id=eq.${id}&tipo=eq.bienestar&respuesta=not.is.null&order=created_at.desc&limit=5`).then(r => r || []),
    supa('GET', 'paciente_health_score', null, `?paciente_id=eq.${id}&order=created_at.desc&limit=1`).then(r => r || [])
  ]);

  const fmtCada = s => s.frecuencia_horas < 1 ? `cada ${Math.round(s.frecuencia_horas * 60)} min` : `cada ${s.frecuencia_horas}h`;
  const _BW_COL = ['','#16a34a','#84cc16','#f59e0b','#ea580c','#dc2626'];
  const _BW_LBL = ['','Excelente','Bien','Regular','Mal','Muy mal'];
  const _btnDes = (recId) => `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca;white-space:nowrap" onclick="desactivarRecordatorio('${recId}','${id}')">🔕 Desactivar</button>`;
  const _btnRea = (recId) => `<button class="btn btn-sm" style="white-space:nowrap" onclick="reactivarRecordatorio('${recId}','${id}')">🔔 Reactivar</button>`;

  // ── Sección Health Score ─────────────────────────────────────────────────
  const _HS_COL = { controlado: '#16a34a', en_riesgo: '#f59e0b', alerta: '#dc2626' };
  const _HS_LBL = { controlado: 'Controlado', en_riesgo: 'En riesgo', alerta: 'Alerta' };
  const hs = healthScores[0];
  let htmlHealthScore = `<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px">📊 Health Score</div>`;
  htmlHealthScore += hs ? `
    <div class="detail-item" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div>
          <div class="detail-label">Últimos ${new Date(hs.periodo_desde).toLocaleDateString('es-EC')} – ${new Date(hs.periodo_hasta).toLocaleDateString('es-EC')}</div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-top:4px">
            <span style="font-size:24px;font-weight:700;color:${_HS_COL[hs.etiqueta]}">${hs.score_calculado}</span>
            <span class="badge" style="background:${_HS_COL[hs.etiqueta]}22;color:${_HS_COL[hs.etiqueta]}">${_HS_LBL[hs.etiqueta]}</span>
          </div>
          <div style="font-size:11px;color:#888;margin-top:6px;display:flex;flex-wrap:wrap;gap:10px">
            ${hs.adherencia_tratamiento_pct != null ? `<span>💊 Adherencia: ${hs.adherencia_tratamiento_pct}%</span>` : ''}
            ${hs.bienestar_promedio != null ? `<span>💙 Bienestar prom: ${hs.bienestar_promedio}</span>` : ''}
            ${hs.controles_preventivos_pct != null ? `<span>🧪 Controles: ${hs.controles_preventivos_pct}%</span>` : ''}
            ${hs.participacion_activa_pct != null ? `<span>📱 Participación: ${hs.participacion_activa_pct}%</span>` : ''}
          </div>
        </div>
      </div>
    </div>` : `<div class="empty-state" style="padding:6px 0;font-size:12px">Sin Health Score calculado aún — se genera automáticamente con la actividad de seguimiento del paciente.</div>`;

  // ── Sección Bienestar ────────────────────────────────────────────────────
  const recBienestar = seguimientos.filter(s => s.tipo === 'bienestar');
  const dotsBienestar = ultimoBienestar.length
    ? `<div style="display:flex;gap:4px;margin-top:6px;align-items:center;flex-wrap:wrap">
        ${[...ultimoBienestar].reverse().map(r => {
          const n = r.nivel_bienestar || 0;
          return `<div title="${_BW_LBL[n]} · ${new Date(r.created_at).toLocaleDateString('es-EC')}" style="width:14px;height:14px;border-radius:50%;background:${_BW_COL[n]||'#d1d5db'}"></div>`;
        }).join('')}
        ${ultimoBienestar[0]?.nivel_bienestar
          ? `<span style="font-size:11px;color:#555;margin-left:3px">Último: <strong style="color:${_BW_COL[ultimoBienestar[0].nivel_bienestar]}">${_BW_LBL[ultimoBienestar[0].nivel_bienestar]}</strong></span>`
          : ''}
      </div>` : '';

  let htmlBienestar = `<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px">💙 Bienestar</div>`;
  htmlBienestar += recBienestar.length
    ? recBienestar.map(b => `
        <div class="detail-item" style="margin-bottom:8px;${b.activo ? '' : 'opacity:.55'}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div>
              <div class="detail-label">Check-in diario ${b.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-gray">Desactivado</span>'}</div>
              <div style="font-size:12px;color:#888;margin-top:2px">${fmtCada(b)} · Hasta: ${new Date(b.fecha_fin).toLocaleDateString('es-EC')}</div>
              ${dotsBienestar}
            </div>
            ${b.activo ? _btnDes(b.id) : _btnRea(b.id)}
          </div>
        </div>`).join('')
    : `<div class="empty-state" style="padding:6px 0;font-size:12px">Sin check-in de bienestar — actívalo desde la consulta.</div>`;

  // ── Sección Medicamentos ─────────────────────────────────────────────────
  const recMeds = seguimientos.filter(s => s.tipo === 'medicamento' || s.tipo === 'fin_tratamiento');
  const medsActivos = recMeds.filter(m => m.activo).length;
  let htmlMeds = `<div style="font-size:13px;font-weight:600;color:#374151;margin-top:16px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
    <span>💊 Medicamentos</span>
    ${medsActivos > 1 ? `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca" onclick="desactivarTodosSeguimientos('${id}')">🔕 Todos (${medsActivos})</button>` : ''}
  </div>`;
  htmlMeds += recMeds.length
    ? recMeds.map(s => `
        <div class="detail-item" style="margin-bottom:8px;${s.activo ? '' : 'opacity:.55'}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div style="flex:1;min-width:0">
              <div class="detail-label">${s.tipo === 'fin_tratamiento' ? 'Cierre de tratamiento' : 'Medicamento'} ${s.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-gray">Desactivado</span>'}</div>
              <div class="detail-value">${s.medicamento || '—'}</div>
              <div style="font-size:12px;color:#888;margin-top:4px">${fmtCada(s)} · Hasta: ${new Date(s.fecha_fin).toLocaleDateString('es-EC')}</div>
              ${s.tipo === 'medicamento' && typeof renderMedGrid === 'function' ? renderMedGrid(s.frecuencia_horas) : ''}
            </div>
            ${s.activo ? _btnDes(s.id) : _btnRea(s.id)}
          </div>
        </div>`).join('')
    : `<div class="empty-state" style="padding:6px 0;font-size:12px">Sin seguimiento de medicamentos.</div>`;

  // ── Sección Laboratorio ──────────────────────────────────────────────────
  const _LAB = {
    pendiente:  { cls: 'badge-yellow', label: '⏳ Pendiente' },
    confirmado: { cls: 'badge-green',  label: '✅ Realizado' },
    sin_examen: { cls: 'badge-red',    label: '🔴 Sin respuesta' }
  };
  let htmlLab = `<div style="font-size:13px;font-weight:600;color:#374151;margin-top:16px;margin-bottom:8px">🧪 Laboratorio</div>`;
  htmlLab += labSeguimientos.length
    ? labSeguimientos.map(l => {
        const est = _LAB[l.estado] || { cls: 'badge-gray', label: l.estado };
        const fechaCons = l.consultas?.created_at ? new Date(l.consultas.created_at).toLocaleDateString('es-EC') : '—';
        const diag = (l.consultas?.diagnostico || '').slice(0, 40) || '—';
        return `<div class="detail-item" style="margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div>
              <div class="detail-label">${fechaCons} — ${diag}</div>
              <div style="margin-top:3px"><span class="badge ${est.cls}">${est.label}</span></div>
            </div>
            <button class="btn btn-sm" onclick="openReceta('${l.consulta_id}','${id}')">➡️ Ver</button>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty-state" style="padding:6px 0;font-size:12px">Sin seguimiento de exámenes de laboratorio.</div>`;

  // ── Sección Crónicas ─────────────────────────────────────────────────────
  let htmlCronicas = `<div style="font-size:13px;font-weight:600;color:#374151;margin-top:16px;margin-bottom:8px">🏥 Enfermedades crónicas</div>`;
  htmlCronicas += cronicas.length
    ? cronicas.map(c => `
        <div class="detail-item" style="margin-bottom:6px;${c.activo ? '' : 'opacity:.55'}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <div>
              <div class="detail-label">${(typeof NOMBRES_ENFERMEDAD !== 'undefined' && NOMBRES_ENFERMEDAD[c.enfermedad]) || c.enfermedad} ${c.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-gray">Inactivo</span>'}</div>
              <div style="font-size:12px;color:#888;margin-top:2px">Cada ${c.frecuencia_horas || 24}h${c.proximo_seguimiento ? ' · Próx: ' + new Date(c.proximo_seguimiento).toLocaleDateString('es-EC') : ''}</div>
            </div>
          </div>
        </div>`).join('')
    : `<div class="empty-state" style="padding:6px 0;font-size:12px">Sin enfermedades crónicas registradas.</div>`;

  document.getElementById('seguimientoList').innerHTML = htmlHealthScore + htmlBienestar + htmlMeds + htmlLab + htmlCronicas;

  showPage('paciente-detalle');
  document.querySelectorAll('#page-paciente-detalle .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#page-paciente-detalle .tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('#page-paciente-detalle .tab-bar .tab').classList.add('active');
  document.getElementById('tab-datos').classList.add('active');
}

// ── Activar / desactivar recordatorios de seguimiento del bot ──────────────
async function desactivarRecordatorio(recId, pacienteId) {
  await supa('PATCH', 'recordatorios', { activo: false }, `?id=eq.${recId}`);
  showToast('🔕 Seguimiento desactivado');
  showPacienteDetalle(pacienteId);
}

async function reactivarRecordatorio(recId, pacienteId) {
  const ahora = new Date();
  const rec = (await supa('GET', 'recordatorios', null, `?id=eq.${recId}&limit=1`) || [])[0];
  if (!rec) return;
  const freq = rec.frecuencia_horas || 24;
  const finFuturo = new Date(rec.fecha_fin) > ahora;
  await supa('PATCH', 'recordatorios', {
    activo: true,
    fecha_proximo: new Date(ahora.getTime() + freq * 3600000).toISOString(),
    fecha_fin: finFuturo ? rec.fecha_fin : new Date(ahora.getTime() + 86400000).toISOString()
  }, `?id=eq.${recId}`);
  showToast('🔔 Seguimiento reactivado');
  showPacienteDetalle(pacienteId);
}

async function desactivarTodosSeguimientos(pacienteId) {
  if (!confirm('¿Desactivar todos los seguimientos activos de este paciente?')) return;
  await supa('PATCH', 'recordatorios', { activo: false }, `?paciente_id=eq.${pacienteId}&activo=eq.true`);
  showToast('🔕 Seguimientos desactivados');
  showPacienteDetalle(pacienteId);
}

// ── Editar datos personales del paciente (ej. corregir teléfono mal registrado) ──
function mostrarEditorPaciente(id) {
  const pac = pacientesData.find(x => x.id === id);
  if (!pac) return;
  const esc = v => (v ?? '').toString().replace(/"/g, '&quot;');
  const campo = (label, key, tipo = 'text') =>
    `<div class="detail-item"><div class="detail-label">${label}</div><input class="form-control" id="edit-pac-${key}" type="${tipo}" value="${esc(pac[key])}" /></div>`;
  document.getElementById('detailGrid').innerHTML = `
    ${campo('Nombre', 'nombre')}
    ${campo('Apellidos', 'apellidos')}
    ${campo('Cédula', 'cedula')}
    ${campo('Edad', 'edad', 'number')}
    <div class="detail-item"><div class="detail-label">Sexo</div>
      <select class="form-control" id="edit-pac-sexo">
        <option value="" ${!pac.sexo ? 'selected' : ''}>—</option>
        <option value="M" ${pac.sexo === 'M' ? 'selected' : ''}>Masculino</option>
        <option value="F" ${pac.sexo === 'F' ? 'selected' : ''}>Femenino</option>
      </select>
    </div>
    ${campo('Nacimiento', 'fecha_nacimiento', 'date')}
    ${campo('Correo', 'correo', 'email')}
    ${campo('Teléfono (con código de país, ej: 593987654321)', 'telefono', 'tel')}
    ${campo('Residencia (ciudad/barrio)', 'lugar_residencia')}
    ${campo('Dirección domicilio (calle, número)', 'domicilio_completo')}
    ${campo('Ocupación', 'ocupacion')}
    ${campo('Lugar de trabajo', 'lugar_trabajo')}
    <div style="grid-column:1/-1;display:flex;gap:8px;margin-top:4px">
      <button class="btn btn-sm btn-primary" onclick="guardarDatosPaciente('${id}')">💾 Guardar cambios</button>
      <button class="btn btn-sm" onclick="showPacienteDetalle('${id}')">Cancelar</button>
    </div>`;
}

async function guardarDatosPaciente(id) {
  const val = key => document.getElementById(`edit-pac-${key}`).value.trim();
  const nombre = val('nombre');
  if (!nombre) { alert('El nombre es obligatorio'); return; }
  const payload = {
    nombre,
    apellidos: val('apellidos') || null,
    cedula: val('cedula') || null,
    edad: val('edad') ? parseInt(val('edad')) : null,
    sexo: val('sexo') || null,
    fecha_nacimiento: val('fecha_nacimiento') || null,
    correo: val('correo') || null,
    telefono: val('telefono').replace(/[^\d+]/g, '') || null,
    lugar_residencia:  val('lugar_residencia')  || null,
    ocupacion:         val('ocupacion')         || null,
    lugar_trabajo:     val('lugar_trabajo')     || null,
    domicilio_completo: val('domicilio_completo') || null,
  };
  showToast('⏳ Guardando datos del paciente...');
  try {
    const result = await supa('PATCH', 'pacientes', payload, `?id=eq.${id}`);
    if (result && (result.message || result.code)) throw new Error(result.message || result.code);
    showToast('✓ Datos del paciente actualizados');
    await loadPacientes();
    await showPacienteDetalle(id);
  } catch (e) {
    console.error('Error actualizando paciente:', e);
    showToast('❌ Error al guardar los datos');
  }
}

// ── Helper central: llama al backend con service_role (bypass RLS total) ──
async function adminDelete(tipo, id) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const token = session?.access_token;
  const res = await fetch('/api/admin-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, id, token }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
  return result;
}

async function eliminarPaciente(id) {
  if (currentUser?.rol !== 'admin') return;
  const pac = pacientesData.find(x => x.id === id);
  const nombre = pac ? `${pac.nombre || ''} ${pac.apellidos || ''}`.trim() : 'este paciente';
  if (!confirm(`¿Eliminar permanentemente a ${nombre}?\n\n⚠️ No se puede deshacer.`)) return;
  showToast('⏳ Eliminando...');
  try {
    await adminDelete('paciente', id);
    showToast('✓ Paciente eliminado correctamente');
    showPage('pacientes');
    loadPacientes();
  } catch (e) {
    console.error('Error eliminando paciente:', e);
    alert(`No se pudo eliminar:\n\n${e.message}`);
    showToast('❌ Error al eliminar');
  }
}

async function eliminarConsultaDesdeDetalle(consultaId, pacienteId) {
  if (currentUser?.rol !== 'admin') return;
  if (!confirm('¿Eliminar esta consulta?\n⚠️ No se puede deshacer.')) return;
  const ok = await _eliminarConsulta(consultaId);
  if (ok) showPacienteDetalle(pacienteId);
}

async function _eliminarConsulta(consultaId) {
  try {
    await adminDelete('consulta', consultaId);
    showToast('✓ Consulta eliminada');
    return true;
  } catch (e) {
    console.error('Error eliminando consulta:', e);
    alert(`No se pudo eliminar:\n\n${e.message}`);
    showToast('❌ Error al eliminar');
    return false;
  }
}
