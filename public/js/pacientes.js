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
      <td><strong>${p.nombre || '—'} ${p.apellidos || ''}</strong></td>
      <td>${p.cedula || '—'}</td>
      <td>${p.clientes_b2b?.nombre_empresa || '—'}</td>
      <td>${p.telefono || '—'}</td>
      <td>${p.lugar_residencia || '—'}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.correo || '—'}</td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="showPacienteDetalle('${p.id}')">Ver</button>
        ${esAdmin ? `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca" onclick="eliminarPaciente('${p.id}','${(p.nombre+' '+(p.apellidos||'')).trim().replace(/'/g,"\\'")}')">🗑 Eliminar</button>` : ''}
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
    <div class="patient-avatar-lg">${init}</div>
    <div style="flex:1"><div class="patient-name">${pac.nombre || ''} ${pac.apellidos || ''}</div>
    <div class="patient-meta">Cédula: ${pac.cedula || '—'} · ${pac.clientes_b2b?.nombre_empresa || '—'}</div></div>
    ${esAdmin ? `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca;margin-left:auto" onclick="eliminarPaciente('${pac.id}','${(pac.nombre+' '+(pac.apellidos||'')).trim().replace(/'/g,"\\'")}')">🗑 Eliminar paciente</button>` : ''}
  `;
  document.getElementById('detailGrid').innerHTML = [
    ['Edad', pac.edad || '—'], ['Nacimiento', pac.fecha_nacimiento || '—'], ['Correo', pac.correo || '—'],
    ['Teléfono', pac.telefono || '—'], ['Residencia', pac.lugar_residencia || '—'], ['Empresa', pac.clientes_b2b?.nombre_empresa || '—']
  ].map(([l, v]) => `<div class="detail-item"><div class="detail-label">${l}</div><div class="detail-value">${v}</div></div>`).join('');

  const consultas = await supa('GET', 'consultas', null, `?paciente_id=eq.${id}&order=created_at.desc`) || [];
  const totalC = consultas.length;
  document.getElementById('patConsultas').innerHTML = consultas.length ? `
    <table class="table"><thead><tr><th style="text-align:center;width:40px">#</th><th>Fecha</th><th>Síntomas</th><th>Diagnóstico</th><th>Nivel</th><th>Estado</th>${esAdmin ? '<th></th>' : ''}</tr></thead>
    <tbody>${consultas.map((c, i) => `<tr>
      <td style="text-align:center;font-size:12px;font-weight:700;color:#aaa">${totalC - i}</td>
      <td>${new Date(c.created_at).toLocaleDateString('es-EC')}</td>
      <td>${c.sintomas_descripcion || '—'}</td>
      <td>${c.diagnostico || '—'}</td>
      <td>${c.nivel_sintomas === 3 ? '<span class="badge badge-red">Grave</span>' : c.nivel_sintomas === 2 ? '<span class="badge badge-yellow">Medio</span>' : '<span class="badge badge-green">Leve</span>'}</td>
      <td><span class="badge badge-gray">${c.estado}</span></td>
      ${esAdmin ? `<td><button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca" onclick="eliminarConsultaDesdeDetalle('${c.id}','${id}')">🗑</button></td>` : ''}
    </tr>`).join('')}</tbody></table>`
    : '<div class="empty-state">Sin consultas</div>';

  const seguimientos = await supa('GET', 'recordatorios', null, `?paciente_id=eq.${id}&activo=eq.true`) || [];
  document.getElementById('seguimientoList').innerHTML = seguimientos.length
    ? seguimientos.map(s => `<div class="detail-item" style="margin-bottom:8px"><div class="detail-label">Medicamento</div><div class="detail-value">${s.medicamento || '—'}</div><div style="font-size:12px;color:#888;margin-top:4px">Cada ${s.frecuencia_horas}h · Hasta: ${new Date(s.fecha_fin).toLocaleDateString('es-EC')}</div></div>`).join('')
    : '<div class="empty-state">Sin seguimientos activos</div>';

  showPage('paciente-detalle');
  document.querySelectorAll('#page-paciente-detalle .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#page-paciente-detalle .tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('#page-paciente-detalle .tab-bar .tab').classList.add('active');
  document.getElementById('tab-datos').classList.add('active');
}

// Eliminar silenciosamente (ignora errores de FK en tablas opcionales)
async function _del(tabla, query) {
  try { await supa('DELETE', tabla, null, query); } catch (_) {}
}

async function eliminarPaciente(id, nombre) {
  if (currentUser?.rol !== 'admin') return;
  if (!confirm(`¿Eliminar permanentemente a ${nombre}?\n⚠️ No se puede deshacer.`)) return;

  showToast('⏳ Eliminando...');
  try {
    // Ola 1: registros hoja (sin dependencias entre sí) — EN PARALELO
    await Promise.all([
      _del('recordatorios',         `?paciente_id=eq.${id}`),
      _del('documentos',            `?paciente_id=eq.${id}`),
      _del('antecedentes',          `?paciente_id=eq.${id}`),
      _del('paciente_cronicas',     `?paciente_id=eq.${id}`),
      _del('notificaciones',        `?paciente_id=eq.${id}`),
      _del('seguimiento_respuestas',`?paciente_id=eq.${id}`),
    ]);
    // Ola 2: recetas (después de recordatorios)
    await _del('recetas',   `?paciente_id=eq.${id}`);
    // Ola 3: consultas (después de docs y recetas)
    await _del('consultas', `?paciente_id=eq.${id}`);
    // Ola 4: paciente
    await supa('DELETE', 'pacientes', null, `?id=eq.${id}`);

    showToast('✓ Paciente eliminado');
    showPage('pacientes');
    loadPacientes();
  } catch (e) {
    console.error('Error eliminando paciente:', e);
    showToast('Error al eliminar — revisa permisos en Supabase');
  }
}

async function eliminarConsultaDesdeDetalle(consultaId, pacienteId) {
  if (currentUser?.rol !== 'admin') return;
  if (!confirm('¿Eliminar esta consulta?\n⚠️ No se puede deshacer.')) return;
  await _eliminarConsulta(consultaId);
  showPacienteDetalle(pacienteId);
}

async function _eliminarConsulta(consultaId) {
  // Paralelo: docs + recordatorios (por receta_id)
  const recetas = await supa('GET', 'recetas', null, `?consulta_id=eq.${consultaId}&select=id`) || [];
  const rIds = recetas.map(r => r.id);
  await Promise.all([
    _del('documentos', `?consulta_id=eq.${consultaId}`),
    rIds.length ? _del('recordatorios', `?receta_id=in.(${rIds.join(',')})`) : Promise.resolve(),
  ]);
  await _del('recetas',   `?consulta_id=eq.${consultaId}`);
  await supa('DELETE', 'consultas', null, `?id=eq.${consultaId}`);
}
