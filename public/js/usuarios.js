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
  const nombre = document.getElementById('newNombre').value.trim();
  const apellidos = document.getElementById('newApellidos').value.trim();
  const correo = document.getElementById('newCorreo').value.trim();
  const pass = document.getElementById('newPass').value.trim();
  const rol = document.getElementById('newRol').value;
  const especialidad = document.getElementById('newEsp').value.trim() || null;
  const numero_registro = document.getElementById('newReg').value.trim() || null;

  if (!nombre || !correo || !pass) { alert('Complete los campos obligatorios'); return; }

  const { data, error } = await supabaseClient.auth.signUp({ email: correo, password: pass });
  if (error) { alert('Error al crear cuenta: ' + error.message); return; }

  await supa('POST', 'usuarios', {
    id: data.user.id,
    nombre, apellidos, correo, rol, especialidad, numero_registro, activo: true
  });

  document.getElementById('addUserForm').style.display = 'none';
  loadUsuarios();
  showToast('✓ Usuario creado');
}

async function toggleUser(id, activo) {
  await supa('PATCH', 'usuarios', { activo: !activo }, `?id=eq.${id}`);
  loadUsuarios();
}
