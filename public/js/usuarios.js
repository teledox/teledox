async function loadUsuarios() {
  const users = await supa('GET', 'usuarios', null, '?order=created_at.desc') || [];
  document.getElementById('usuariosBody').innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.nombre} ${u.apellidos}</strong></td>
      <td>${u.correo}</td>
      <td>${u.rol === 'admin' ? '<span class="rol-badge rol-admin">Admin</span>' : u.rol === 'medico' ? '<span class="rol-badge rol-medico">Médico</span>' : '<span class="rol-badge rol-operador">Operador</span>'}</td>
      <td>${u.especialidad || '—'}</td>
      <td>${u.numero_registro || '—'}</td>
      <td>${u.firma_digital ? '<span class="badge badge-green">✓</span>' : '<span class="badge badge-gray">—</span>'}</td>
      <td>${u.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-red">Inactivo</span>'}</td>
      <td><button class="btn btn-sm ${u.activo ? 'btn-danger' : ''}" onclick="toggleUser('${u.id}',${u.activo})">${u.activo ? 'Desactivar' : 'Activar'}</button></td>
    </tr>
  `).join('');
}

async function saveUser() {
  const data = {
    nombre: document.getElementById('newNombre').value,
    apellidos: document.getElementById('newApellidos').value,
    correo: document.getElementById('newCorreo').value,
    password_hash: document.getElementById('newPass').value,
    rol: document.getElementById('newRol').value,
    especialidad: document.getElementById('newEsp').value || null,
    numero_registro: document.getElementById('newReg').value || null
  };
  if (!data.nombre || !data.correo || !data.password_hash) { alert('Complete los campos obligatorios'); return; }
  await supa('POST', 'usuarios', data);
  document.getElementById('addUserForm').style.display = 'none';
  loadUsuarios();
  showToast('✓ Usuario creado');
}

async function toggleUser(id, activo) {
  await supa('PATCH', 'usuarios', { activo: !activo }, `?id=eq.${id}`);
  loadUsuarios();
}
