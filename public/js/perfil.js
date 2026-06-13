// ── Datos en memoria para la sesión ──────────────────────────────────────────
// firmaData ya está declarada como global en config.js
let _p12Buffer  = null; // ArrayBuffer del archivo .p12 seleccionado

// ── Cargar perfil ─────────────────────────────────────────────────────────────
async function loadPerfil() {
  if (!currentUser) return;

  document.getElementById('perfilContent').innerHTML = `
    <div class="detail-grid">
      ${[
        ['Nombre',       currentUser.nombre + ' ' + currentUser.apellidos],
        ['Correo',       currentUser.correo],
        ['Rol',          currentUser.rol],
        ['Especialidad', currentUser.especialidad || '—'],
        ['Reg. MSP',     currentUser.numero_registro || '—'],
        ['Cédula',       currentUser.cedula || '—'],
        ['Teléfono',     currentUser.telefono || '—']
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

  // Firma imagen
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

  // Estado de la firma .p12
  _renderP12Status();
}

// ── Datos personales ──────────────────────────────────────────────────────────
async function saveDatosPersonales() {
  const cedula          = document.getElementById('editCedula')?.value.trim() || null;
  const telefono        = document.getElementById('editTelefono')?.value.trim() || null;
  const especialidad    = document.getElementById('editEspecialidad')?.value.trim() || null;
  const numero_registro = document.getElementById('editRegistro')?.value.trim() || null;

  await supa('PATCH', 'usuarios', { cedula, telefono, especialidad, numero_registro }, `?id=eq.${currentUser.id}`);
  currentUser = { ...currentUser, cedula, telefono, especialidad, numero_registro };
  loadPerfil();
  showToast('✓ Datos personales actualizados');
}

// ── Firma imagen / sello ──────────────────────────────────────────────────────
function previewFirma(input, previewId, type) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    firmaData[type] = e.target.result;
    document.getElementById(previewId).innerHTML = `<img src="${e.target.result}" style="max-height:80px;max-width:100%" />`;
  };
  reader.readAsDataURL(file);
}

async function saveFirma() {
  const update = {};
  if (firmaData.firma) update.firma_digital = firmaData.firma;
  if (firmaData.sello) update.sello = firmaData.sello;
  if (Object.keys(update).length === 0) { alert('Suba al menos una imagen'); return; }
  await supa('PATCH', 'usuarios', update, `?id=eq.${currentUser.id}`);
  currentUser = { ...currentUser, ...update };
  loadPerfil();
  showToast('✓ Firma y sello guardados');
}

async function eliminarFirmaOSello(tipo) {
  const campo     = tipo === 'firma' ? 'firma_digital' : 'sello';
  const nombre    = tipo === 'firma' ? 'firma digital' : 'sello médico';
  const previewId = tipo === 'firma' ? 'firmaPreview'  : 'selloPreview';
  const btnId     = tipo === 'firma' ? 'btnEliminarFirma' : 'btnEliminarSello';

  if (!confirm(`¿Eliminar la ${nombre}?\n\nDeberás subir una nueva para usarla en documentos.`)) return;

  await supa('PATCH', 'usuarios', { [campo]: null }, `?id=eq.${currentUser.id}`);
  currentUser = { ...currentUser, [campo]: null };
  if (tipo === 'firma') firmaData.firma = null;
  else firmaData.sello = null;

  const preview = document.getElementById(previewId);
  if (preview) preview.innerHTML = tipo === 'firma' ? '📝 Clic para subir firma digital' : '🔵 Clic para subir sello médico';
  const btn = document.getElementById(btnId);
  if (btn) btn.style.display = 'none';

  showToast(`✓ ${nombre.charAt(0).toUpperCase() + nombre.slice(1)} eliminada`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FIRMA ELECTRÓNICA .P12
// ═══════════════════════════════════════════════════════════════════════════════

// Convierte ArrayBuffer → string binario que entiende node-forge
function _bufferToBinary(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

// Convierte ArrayBuffer → base64
function _bufferToBase64(buf) {
  return btoa(_bufferToBinary(buf));
}

// Parsea el .p12 con node-forge y devuelve info del certificado
function _parsearP12(arrayBuffer, password) {
  if (typeof forge === 'undefined') throw new Error('Librería de certificados no disponible. Recarga la página.');

  const binary  = _bufferToBinary(arrayBuffer);
  const asn1    = forge.asn1.fromDer(binary);
  const p12     = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  // Extraer certificado del titular (no de la cadena)
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const bags     = certBags[forge.pki.oids.certBag] || [];
  if (bags.length === 0) throw new Error('El archivo no contiene ningún certificado.');

  // El primer certificado suele ser el del titular
  const cert = bags[0].cert;

  const getField = (attrs, name) =>
    (attrs.find(a => a.name === name || a.shortName === name) || {}).value || '';

  const subj   = cert.subject.attributes;
  const iss    = cert.issuer.attributes;
  const now    = new Date();
  const desde  = cert.validity.notBefore;
  const hasta  = cert.validity.notAfter;
  const vigente = now >= desde && now <= hasta;

  return {
    titular:      getField(subj, 'commonName'),
    cedula:       getField(subj, 'serialNumber') || getField(subj, 'organizationalUnitName'),
    organizacion: getField(subj, 'organizationName'),
    pais:         getField(subj, 'countryName'),
    emisor:       getField(iss,  'commonName') || getField(iss, 'organizationName'),
    validoDesde:  desde.toLocaleDateString('es-EC'),
    validoHasta:  hasta.toLocaleDateString('es-EC'),
    diasRestantes: vigente ? Math.ceil((hasta - now) / 86400000) : 0,
    vigente
  };
}

// Callback cuando el usuario elige un archivo .p12
let _p12Cargando = false;
function onP12FileSelected(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('p12Preview').style.display = 'none';
  _p12Buffer = null;
  _p12Cargando = true;

  const reader = new FileReader();
  reader.onload  = e => { _p12Buffer = e.target.result; _p12Cargando = false; };
  reader.onerror = () => {
    _p12Cargando = false;
    alert('❌ No se pudo leer el archivo seleccionado.\n\n' + (reader.error?.message || reader.error || 'Error desconocido'));
  };
  reader.readAsArrayBuffer(file);
}

// Validar + mostrar preview antes de guardar
function _mostrarPreviewCert(info) {
  const el = document.getElementById('p12Preview');
  if (!el) return;
  const color = info.vigente
    ? (info.diasRestantes > 30 ? '#16a34a' : '#ca8a04')
    : '#dc2626';
  const badge = info.vigente
    ? (info.diasRestantes > 30 ? `✅ Vigente · ${info.diasRestantes} días restantes` : `⚠️ Vence en ${info.diasRestantes} días`)
    : '❌ Certificado vencido';

  el.style.display = 'block';
  el.innerHTML = `
    <div style="font-weight:700;color:${color};margin-bottom:6px;font-size:13px">${badge}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      ${[
        ['Titular',      info.titular],
        ['Cédula / RUC', info.cedula],
        ['Organización', info.organizacion],
        ['Emisor',       info.emisor],
        ['Válido desde', info.validoDesde],
        ['Válido hasta', info.validoHasta],
      ].filter(([,v]) => v).map(([l,v]) => `
        <tr>
          <td style="color:#888;padding:2px 8px 2px 0;white-space:nowrap">${l}</td>
          <td style="font-weight:600;color:#1a1a1a">${v}</td>
        </tr>`).join('')}
    </table>`;
}

// Render del estado del certificado guardado en DB
function _renderP12Status() {
  const statusEl     = document.getElementById('p12Status');
  const badge        = document.getElementById('p12Badge');
  const btnElim      = document.getElementById('btnEliminarP12');
  const activarEl    = document.getElementById('p12ActivarSesion');
  const info         = currentUser.firma_p12_info;
  const tieneP12     = !!currentUser.firma_p12;
  const sesionActiva = !!sessionStorage.getItem(`p12pass_${currentUser.id}`);

  if (!tieneP12) {
    if (statusEl) statusEl.innerHTML = '<p style="font-size:13px;color:#aaa;margin:0">Sin certificado .p12 registrado.</p>';
    if (badge)    { badge.style.display = 'none'; }
    if (btnElim)  btnElim.style.display = 'none';
    if (activarEl) activarEl.style.display = 'none';
    return;
  }

  if (btnElim) btnElim.style.display = 'inline-flex';

  // Badge de estado
  if (badge && info) {
    const vigente = info.vigente;
    const dias    = info.diasRestantes || 0;
    badge.style.display  = 'inline-block';
    badge.style.background = vigente && dias > 30 ? '#dcfce7' : vigente ? '#fef9c3' : '#fee2e2';
    badge.style.color      = vigente && dias > 30 ? '#16a34a' : vigente ? '#92400e' : '#dc2626';
    badge.textContent      = vigente ? (dias > 30 ? `✅ Vigente · ${dias} días` : `⚠️ Vence en ${dias} días`) : '❌ Vencido';
  }

  // Panel de estado del certificado
  if (statusEl && info) {
    statusEl.innerHTML = `
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:1rem;font-size:13px">
        <div style="font-weight:700;margin-bottom:6px;color:#0369a1">🔐 Certificado registrado</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:12px">
          <div><span style="color:#888">Titular: </span><strong>${info.titular || '—'}</strong></div>
          <div><span style="color:#888">Emisor: </span><strong>${info.emisor || '—'}</strong></div>
          <div><span style="color:#888">Válido desde: </span><strong>${info.validoDesde || '—'}</strong></div>
          <div><span style="color:#888">Válido hasta: </span><strong>${info.validoHasta || '—'}</strong></div>
        </div>
        ${sesionActiva
          ? '<div style="margin-top:8px;color:#16a34a;font-size:12px;font-weight:600">🟢 Sesión activa — certificado disponible para firmar documentos</div>'
          : '<div style="margin-top:8px;color:#ca8a04;font-size:12px">🔑 Ingrese su contraseña para activar el certificado en esta sesión</div>'}
      </div>`;
  }

  // Panel de activación de sesión
  if (activarEl) activarEl.style.display = sesionActiva ? 'none' : 'block';
}

// Validar y guardar el .p12 en la BD
async function validarYGuardarP12() {
  try {
    if (typeof forge === 'undefined') {
      alert('❌ La librería de certificados (forge) no cargó.\n\nVerifique su conexión a internet y recargue la página.');
      return;
    }
    if (_p12Cargando) { showToast('⏳ Espere, todavía se está leyendo el archivo...'); return; }
    if (!_p12Buffer) { showToast('⚠️ Seleccione un archivo .p12 primero'); return; }

    const pass = document.getElementById('p12PasswordInput')?.value || '';
    if (!pass) { showToast('⚠️ Ingrese la contraseña del certificado'); return; }

    let info;
    try {
      info = _parsearP12(_p12Buffer, pass);
    } catch (e) {
      alert('❌ No se pudo leer el certificado.\n\n' + e.message + '\n\nVerifique que la contraseña sea correcta y que el archivo sea un .p12 válido.');
      return;
    }

    // Mostrar preview antes de guardar
    _mostrarPreviewCert(info);

    if (!confirm(`¿Guardar este certificado?\n\nTitular: ${info.titular}\nVigente: ${info.vigente ? 'Sí' : 'NO (vencido)'}`)) return;

    // Guardar base64 del p12 + metadata en BD
    const p12b64 = _bufferToBase64(_p12Buffer);

    try {
      const r = await fetch(`/api/firma-electronica`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: currentUser.id, firma_p12: p12b64, firma_p12_info: info })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    } catch (e) {
      alert('❌ No se pudo guardar el certificado en la base de datos.\n\n' + e.message);
      return;
    }

    // Guardar contraseña en sessionStorage (nunca en BD)
    sessionStorage.setItem(`p12pass_${currentUser.id}`, pass);

    currentUser = { ...currentUser, firma_p12: p12b64, firma_p12_info: info };

    document.getElementById('p12PasswordInput').value = '';
    document.getElementById('p12FileInput').value = '';
    _p12Buffer = null;

    showToast('✓ Certificado .p12 guardado correctamente');
    _renderP12Status();
  } catch (e) {
    console.error('[validarYGuardarP12]', e);
    alert('❌ Error inesperado al procesar el certificado.\n\n' + (e.message || e));
  }
}

// Activar certificado en la sesión actual (cuando ya está en BD pero la sesión fue nueva)
function activarP12Sesion() {
  const pass = document.getElementById('p12SesionPass')?.value;
  if (!pass) { showToast('⚠️ Ingrese la contraseña'); return; }

  if (!currentUser.firma_p12) { showToast('⚠️ No hay certificado registrado'); return; }

  // Verificar que la contraseña sea correcta intentando parsear
  try {
    const buf = Uint8Array.from(atob(currentUser.firma_p12), c => c.charCodeAt(0)).buffer;
    _parsearP12(buf, pass);
  } catch (e) {
    alert('❌ Contraseña incorrecta o certificado inválido.\n\n' + e.message);
    return;
  }

  sessionStorage.setItem(`p12pass_${currentUser.id}`, pass);
  document.getElementById('p12SesionPass').value = '';
  showToast('✅ Certificado activado para esta sesión');
  _renderP12Status();
}

// Eliminar certificado .p12 de la BD
async function eliminarP12() {
  if (!confirm('¿Eliminar el certificado .p12?\n\nYa no podrá usarse para firma electrónica hasta que suba uno nuevo.')) return;

  await supa('PATCH', 'usuarios', { firma_p12: null, firma_p12_info: null }, `?id=eq.${currentUser.id}`);
  sessionStorage.removeItem(`p12pass_${currentUser.id}`);
  currentUser = { ...currentUser, firma_p12: null, firma_p12_info: null };

  showToast('✓ Certificado eliminado');
  _renderP12Status();
}

// Utilitario público: obtiene el p12 activo de la sesión (para módulos de PDF)
function getP12Activo() {
  if (!currentUser?.firma_p12) return null;
  const pass = sessionStorage.getItem(`p12pass_${currentUser.id}`);
  if (!pass) return null;
  return { p12b64: currentUser.firma_p12, pass, info: currentUser.firma_p12_info };
}
