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
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm" style="background:#fff0f0;color:#FF5A5F;border-color:#FF5A5F" onclick="abrirEditarUsuario('${u.id}')">✏️ Editar</button>
        <button class="btn btn-sm ${u.activo ? 'btn-danger' : ''}" onclick="toggleUser('${u.id}',${u.activo})">${u.activo ? 'Desactivar' : 'Activar'}</button>
        ${u.id !== currentUser?.id ? `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca" onclick="eliminarUsuario('${u.id}','${u.nombre} ${u.apellidos}')">🗑 Eliminar</button>` : ''}
      </td>
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
  const cedula = document.getElementById('newCedula').value.trim() || null;
  const telefono = document.getElementById('newTelefono').value.trim() || null;

  if (!nombre || !correo || !pass) { alert('Complete los campos obligatorios'); return; }

  const { data, error } = await supabaseClient.auth.signUp({ email: correo, password: pass });
  if (error) { alert('Error al crear cuenta: ' + error.message); return; }

  await supa('POST', 'usuarios', {
    id: data.user.id,
    nombre, apellidos, correo, rol, especialidad, numero_registro, cedula, telefono, activo: true
  });

  document.getElementById('addUserForm').style.display = 'none';
  loadUsuarios();
  showToast('✓ Usuario creado');
}

async function abrirEditarUsuario(id) {
  const users = await supa('GET', 'usuarios', null, `?id=eq.${id}`) || [];
  const u = users[0]; if (!u) return;

  document.getElementById('editUserId').value      = u.id;
  document.getElementById('editNombre').value       = u.nombre || '';
  document.getElementById('editApellidos').value    = u.apellidos || '';
  document.getElementById('editCorreo').value       = u.correo || '';
  document.getElementById('editRol').value          = u.rol || 'medico';
  document.getElementById('editEsp').value          = u.especialidad || '';
  document.getElementById('editRegMSP').value       = u.numero_registro || '';
  document.getElementById('editCedulaUser').value   = u.cedula || '';
  document.getElementById('editTelefonoUser').value = u.telefono || '';

  // Cerrar el form de agregar si está abierto y mostrar el de editar
  document.getElementById('addUserForm').style.display = 'none';
  const form = document.getElementById('editUserForm');
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function updateUser() {
  const id           = document.getElementById('editUserId').value;
  const nombre       = document.getElementById('editNombre').value.trim();
  const apellidos    = document.getElementById('editApellidos').value.trim();
  const rol          = document.getElementById('editRol').value;
  const especialidad = document.getElementById('editEsp').value.trim() || null;
  const numero_registro = document.getElementById('editRegMSP').value.trim() || null;
  const cedula       = document.getElementById('editCedulaUser').value.trim() || null;
  const telefono     = document.getElementById('editTelefonoUser').value.trim() || null;

  if (!nombre || !apellidos) { alert('Nombre y apellidos son obligatorios'); return; }

  await supa('PATCH', 'usuarios', { nombre, apellidos, rol, especialidad, numero_registro, cedula, telefono }, `?id=eq.${id}`);

  // Si el usuario editado soy yo, actualizo la sesión local
  if (id === currentUser?.id) {
    currentUser = { ...currentUser, nombre, apellidos, rol, especialidad, numero_registro, cedula, telefono };
    if (typeof saveSession === 'function') saveSession(currentUser);
  }

  document.getElementById('editUserForm').style.display = 'none';
  loadUsuarios();
  showToast('✓ Usuario actualizado correctamente');
}

async function toggleUser(id, activo) {
  await supa('PATCH', 'usuarios', { activo: !activo }, `?id=eq.${id}`);
  loadUsuarios();
}

async function eliminarUsuario(id, nombre) {
  if (!confirm(`¿Eliminar permanentemente a ${nombre}?\n\nEsta acción no se puede deshacer.`)) return;
  // Eliminar de la tabla usuarios
  await supa('DELETE', 'usuarios', null, `?id=eq.${id}`);
  // Eliminar de Supabase Auth
  try {
    await fetch(`${SUPA_URL}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
  } catch (e) { /* Auth delete puede fallar sin service_role key, ignorar */ }
  loadUsuarios();
  showToast('✓ Usuario eliminado permanentemente');
}
