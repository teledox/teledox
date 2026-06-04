async function loadPerfil() {
  if (!currentUser) return;

  // Datos de solo lectura
  document.getElementById('perfilContent').innerHTML = `
    <div class="detail-grid">
      ${[
        ['Nombre',      currentUser.nombre + ' ' + currentUser.apellidos],
        ['Correo',      currentUser.correo],
        ['Rol',         currentUser.rol],
        ['Especialidad',currentUser.especialidad || '—'],
        ['Reg. MSP',    currentUser.numero_registro || '—'],
        ['Cédula',      currentUser.cedula || '—'],
        ['Teléfono',    currentUser.telefono || '—']
      ].map(([l, v]) => `<div class="detail-item"><div class="detail-label">${l}</div><div class="detail-value">${v}</div></div>`).join('')}
    </div>
    <hr style="border:none;border-top:1px solid #eee;margin:1.25rem 0">
    <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:1rem">Editar datos personales</div>
    <div class="two-col" style="margin-bottom:1rem">
      <div class="form-group">
        <label class="form-label">Número de cédula</label>
        <input type="text" class="form-control" id="editCedula" value="${currentUser.cedula || ''}" placeholder="Ej: 1712345678" />
      </div>
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input type="text" class="form-control" id="editTelefono" value="${currentUser.telefono || ''}" placeholder="Ej: 0991234567" />
      </div>
      <div class="form-group">
        <label class="form-label">Especialidad</label>
        <input type="text" class="form-control" id="editEspecialidad" value="${currentUser.especialidad || ''}" placeholder="Ej: Medicina General" />
      </div>
      <div class="form-group">
        <label class="form-label">N° Registro MSP</label>
        <input type="text" class="form-control" id="editRegistro" value="${currentUser.numero_registro || ''}" />
      </div>
    </div>
    <button class="btn btn-primary" style="background:#FF5A5F;border-color:#FF5A5F" onclick="saveDatosPersonales()">Guardar datos personales</button>`;

  if (currentUser.firma_digital) document.getElementById('firmaPreview').innerHTML = `<img src="${currentUser.firma_digital}" style="max-height:80px;max-width:100%" />`;
  if (currentUser.sello) document.getElementById('selloPreview').innerHTML = `<img src="${currentUser.sello}" style="max-height:80px;max-width:100%" />`;
}

async function saveDatosPersonales() {
  const cedula       = document.getElementById('editCedula')?.value.trim() || null;
  const telefono     = document.getElementById('editTelefono')?.value.trim() || null;
  const especialidad = document.getElementById('editEspecialidad')?.value.trim() || null;
  const numero_registro = document.getElementById('editRegistro')?.value.trim() || null;

  await supa('PATCH', 'usuarios', { cedula, telefono, especialidad, numero_registro }, `?id=eq.${currentUser.id}`);
  currentUser = { ...currentUser, cedula, telefono, especialidad, numero_registro };
  saveSession(currentUser);
  loadPerfil();
  showToast('✓ Datos personales actualizados');
}

function previewFirma(input, previewId, type) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => { firmaData[type] = e.target.result; document.getElementById(previewId).innerHTML = `<img src="${e.target.result}" style="max-height:80px;max-width:100%" />`; };
  reader.readAsDataURL(file);
}

async function saveFirma() {
  const update = {};
  if (firmaData.firma) update.firma_digital = firmaData.firma;
  if (firmaData.sello) update.sello = firmaData.sello;
  if (Object.keys(update).length === 0) { alert('Suba al menos una imagen'); return; }
  await supa('PATCH', 'usuarios', update, `?id=eq.${currentUser.id}`);
  currentUser = { ...currentUser, ...update };
  saveSession(currentUser);
  showToast('✓ Firma y sello guardados');
}

async function changePassword() {
  const np = document.getElementById('newPassChange').value;
  const cp = document.getElementById('confirmPassChange').value;
  if (!np || np !== cp) { alert('Las contraseñas no coinciden'); return; }
  await supa('PATCH', 'usuarios', { password_hash: np }, `?id=eq.${currentUser.id}`);
  currentUser.password_hash = np;
  saveSession(currentUser);
  document.getElementById('newPassChange').value = '';
  document.getElementById('confirmPassChange').value = '';
  showToast('✓ Contraseña actualizada');
}
