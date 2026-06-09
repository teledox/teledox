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

  // Firma
  const btnElimFirma = document.getElementById('btnEliminarFirma');
  if (currentUser.firma_digital) {
    document.getElementById('firmaPreview').innerHTML = `<img src="${currentUser.firma_digital}" style="max-height:80px;max-width:100%" />`;
    if (btnElimFirma) btnElimFirma.style.display = 'inline-flex';
  } else {
    if (btnElimFirma) btnElimFirma.style.display = 'none';
  }
  // Sello
  const btnElimSello = document.getElementById('btnEliminarSello');
  if (currentUser.sello) {
    document.getElementById('selloPreview').innerHTML = `<img src="${currentUser.sello}" style="max-height:80px;max-width:100%" />`;
    if (btnElimSello) btnElimSello.style.display = 'inline-flex';
  } else {
    if (btnElimSello) btnElimSello.style.display = 'none';
  }
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
  loadPerfil();
  showToast('✓ Firma y sello guardados');
}

async function eliminarFirmaOSello(tipo) {
  const campo    = tipo === 'firma' ? 'firma_digital' : 'sello';
  const nombre   = tipo === 'firma' ? 'firma digital' : 'sello médico';
  const previewId = tipo === 'firma' ? 'firmaPreview' : 'selloPreview';
  const btnId     = tipo === 'firma' ? 'btnEliminarFirma' : 'btnEliminarSello';

  if (!confirm(`¿Eliminar la ${nombre}?\n\nDeberás subir una nueva para usarla en documentos.`)) return;

  await supa('PATCH', 'usuarios', { [campo]: null }, `?id=eq.${currentUser.id}`);
  currentUser = { ...currentUser, [campo]: null };
  if (tipo === 'firma') firmaData.firma = null;
  else firmaData.sello = null;
  saveSession(currentUser);

  const preview = document.getElementById(previewId);
  if (preview) preview.innerHTML = tipo === 'firma' ? '📝 Clic para subir firma digital' : '🔵 Clic para subir sello médico';
  const btn = document.getElementById(btnId);
  if (btn) btn.style.display = 'none';

  showToast(`✓ ${nombre.charAt(0).toUpperCase() + nombre.slice(1)} eliminada`);
}
