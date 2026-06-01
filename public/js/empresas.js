async function loadEmpresas() {
  const [empresas, pacientes] = await Promise.all([
    supa('GET', 'clientes_b2b', null, '?select=*'),
    supa('GET', 'pacientes', null, '?select=cliente_b2b_id')
  ]);
  const counts = {};
  (pacientes || []).forEach(p => { if (p.cliente_b2b_id) counts[p.cliente_b2b_id] = (counts[p.cliente_b2b_id] || 0) + 1; });
  document.getElementById('empresasBody').innerHTML = (empresas || []).map(e => `
    <tr>
      <td><strong>${e.nombre_empresa}</strong></td>
      <td>${e.nombre_seguro || '—'}</td>
      <td>${counts[e.id] || 0}</td>
      <td>${e.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-red">Inactivo</span>'}</td>
      <td><button class="btn btn-sm">Editar</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:2rem">Sin empresas</td></tr>';
}

async function saveEmpresa() {
  const data = {
    nombre_empresa: document.getElementById('empNombre').value,
    nombre_seguro: document.getElementById('empSeguro').value || null
  };
  if (!data.nombre_empresa) { alert('Ingrese el nombre'); return; }
  await supa('POST', 'clientes_b2b', data);
  document.getElementById('addEmpresaForm').style.display = 'none';
  document.getElementById('empNombre').value = '';
  document.getElementById('empSeguro').value = '';
  loadEmpresas();
  showToast('✓ Empresa agregada');
}
