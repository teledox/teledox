async function loadEmpresas() {
  const [empresas, pacientes] = await Promise.all([
    supa('GET', 'clientes_b2b', null, '?select=*&order=nombre_empresa.asc'),
    supa('GET', 'pacientes',    null, '?select=cliente_b2b_id')
  ]);
  const counts = {};
  (pacientes || []).forEach(p => {
    if (p.cliente_b2b_id) counts[p.cliente_b2b_id] = (counts[p.cliente_b2b_id] || 0) + 1;
  });

  document.getElementById('empresasBody').innerHTML = (empresas || []).map(e => `
    <tr>
      <td><strong>${e.nombre_empresa}</strong></td>
      <td style="text-align:center">${counts[e.id] || 0}</td>
      <td>${e.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-red">Inactivo</span>'}</td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-sm" style="background:#fff0f0;color:#FF5A5F;border-color:#FF5A5F"
          onclick="abrirEditarEmpresa('${e.id}','${e.nombre_empresa.replace(/'/g,"\\'")}')">✏️ Editar</button>
        <button class="btn btn-sm btn-danger"
          onclick="eliminarEmpresa('${e.id}','${e.nombre_empresa.replace(/'/g,"\\'")}')">🗑 Eliminar</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:2rem">Sin empresas</td></tr>';
}

async function saveEmpresa() {
  const nombre = document.getElementById('empNombre').value.trim();
  if (!nombre) { alert('Ingrese el nombre de la empresa'); return; }
  await supa('POST', 'clientes_b2b', { nombre_empresa: nombre, activo: true });
  document.getElementById('addEmpresaForm').style.display = 'none';
  document.getElementById('empNombre').value = '';
  loadEmpresas();
  showToast('✓ Empresa agregada');
}

function abrirEditarEmpresa(id, nombre) {
  document.getElementById('editEmpresaId').value    = id;
  document.getElementById('editEmpresaNombre').value = nombre;
  document.getElementById('addEmpresaForm').style.display  = 'none';
  const form = document.getElementById('editEmpresaForm');
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function updateEmpresa() {
  const id     = document.getElementById('editEmpresaId').value;
  const nombre = document.getElementById('editEmpresaNombre').value.trim();
  if (!nombre) { alert('El nombre no puede estar vacío'); return; }
  await supa('PATCH', 'clientes_b2b', { nombre_empresa: nombre }, `?id=eq.${id}`);
  document.getElementById('editEmpresaForm').style.display = 'none';
  loadEmpresas();
  showToast('✓ Empresa actualizada');
}

async function eliminarEmpresa(id, nombre) {
  if (!confirm(`¿Eliminar la empresa "${nombre}"?\n\nLos pacientes vinculados quedarán sin empresa asignada.\n⚠️ No se puede deshacer.`)) return;
  await supa('PATCH', 'pacientes', { cliente_b2b_id: null }, `?cliente_b2b_id=eq.${id}`);
  await supa('DELETE', 'clientes_b2b', null, `?id=eq.${id}`);
  loadEmpresas();
  showToast('✓ Empresa eliminada');
}
