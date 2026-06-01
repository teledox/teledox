async function loadConsultas() {
  const estado = document.getElementById('filterEstado')?.value || '';
  const q = estado
    ? `?select=*,pacientes(nombre,apellidos,cedula)&order=created_at.desc&estado=eq.${estado}`
    : '?select=*,pacientes(nombre,apellidos,cedula)&order=created_at.desc';
  const consultas = await supa('GET', 'consultas', null, q) || [];
  document.getElementById('consultasBody').innerHTML = consultas.map(c => `
    <tr>
      <td><strong>${c.pacientes?.nombre || '—'} ${c.pacientes?.apellidos || ''}</strong><br><span style="font-size:11px;color:#aaa">${c.pacientes?.cedula || ''}</span></td>
      <td>${new Date(c.created_at).toLocaleDateString('es-EC')}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.sintomas_descripcion || '—'}</td>
      <td>${c.nivel_sintomas === 3 ? '<span class="badge badge-red">Grave</span>' : c.nivel_sintomas === 2 ? '<span class="badge badge-yellow">Medio</span>' : '<span class="badge badge-green">Leve</span>'}</td>
      <td><span class="badge badge-gray">${c.estado}</span></td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        ${c.estado === 'pendiente' ? `<button class="btn btn-sm btn-primary" onclick="openAgendar('${c.id}','${c.paciente_id}')">Agendar</button>` : ''}
        <button class="btn btn-sm btn-success" onclick="openReceta('${c.id}','${c.paciente_id}')">💊 Receta</button>
        ${c.estado !== 'completada' ? `<button class="btn btn-sm" onclick="marcarCompletada('${c.id}')">✓</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:2rem">Sin consultas</td></tr>';
}

async function marcarCompletada(id) {
  await supa('PATCH', 'consultas', { estado: 'completada' }, `?id=eq.${id}`);
  loadConsultas();
  showToast('✓ Consulta completada');
}
