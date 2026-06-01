async function loadPerfil() {
  if (!currentUser) return;
  document.getElementById('perfilContent').innerHTML = `<div class="detail-grid">${[
    ['Nombre', currentUser.nombre + ' ' + currentUser.apellidos],
    ['Correo', currentUser.correo],
    ['Rol', currentUser.rol],
    ['Especialidad', currentUser.especialidad || '—'],
    ['Reg. MSP', currentUser.numero_registro || '—']
  ].map(([l, v]) => `<div class="detail-item"><div class="detail-label">${l}</div><div class="detail-value">${v}</div></div>`).join('')}</div>`;
  if (currentUser.firma_digital) document.getElementById('firmaPreview').innerHTML = `<img src="${currentUser.firma_digital}" style="max-height:80px;max-width:100%" />`;
  if (currentUser.sello) document.getElementById('selloPreview').innerHTML = `<img src="${currentUser.sello}" style="max-height:80px;max-width:100%" />`;
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
