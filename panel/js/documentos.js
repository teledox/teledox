async function loadDocumentos(pacienteId) {
  if (!pacienteId) return;
  const docs = await supa('GET', 'documentos', null, `?paciente_id=eq.${pacienteId}&order=created_at.desc`) || [];
  const tipoLabel = { historia_clinica: 'Historia clínica', receta: 'Receta médica', examen: 'Examen', certificado: 'Certificado médico', otro: 'Otro' };
  document.getElementById('docsList').innerHTML = docs.length ? `
    <table class="table">
      <thead><tr><th>Tipo</th><th>Fecha</th><th>Enviado al paciente</th><th></th></tr></thead>
      <tbody>${docs.map(d => `
        <tr>
          <td><strong>${tipoLabel[d.tipo] || d.tipo}</strong></td>
          <td>${new Date(d.created_at).toLocaleDateString('es-EC')}</td>
          <td>${d.enviado_paciente ? '<span class="badge badge-green">Sí</span>' : '<span class="badge badge-gray">No</span>'}</td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-sm" onclick="verDocumento('${d.storage_path}')">👁 Ver</button>
            <button class="btn btn-sm btn-danger" onclick="eliminarDocumento('${d.id}')">✕</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<div class="empty-state">Sin documentos registrados.</div>';
}

async function verDocumento(path) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/sign/documentos-pacientes/${path}`, {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 300 })
  });
  const data = await res.json();
  if (data.signedURL) window.open(`${SUPA_URL}/storage/v1${data.signedURL}`, '_blank');
  else showToast('Error al obtener el documento');
}

async function subirDocumento() {
  const fileInput = document.getElementById('docFile');
  const file = fileInput.files[0];
  const tipo = document.getElementById('docTipo').value;
  if (!file) { alert('Seleccione un archivo PDF'); return; }
  if (!currentPacienteId) return;

  const MAX_MB = 7;
  if (file.size > MAX_MB * 1024 * 1024) {
    alert(`El archivo pesa más de ${MAX_MB}MB. Por favor reduzca su tamaño antes de subir.`);
    return;
  }

  showToast('⏳ Procesando documento...');

  let pdfBlob = file;

  if (file.size > 5 * 1024 * 1024) {
    try {
      const compressRes = await fetch('/api/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: file
      });
      if (compressRes.status === 413) { const err = await compressRes.json(); alert(err.error); return; }
      if (!compressRes.ok) { alert('No se pudo comprimir el archivo. Intente con un PDF más pequeño.'); return; }
      pdfBlob = await compressRes.blob();
      const orig = (file.size / 1024 / 1024).toFixed(1);
      const comp = (pdfBlob.size / 1024 / 1024).toFixed(1);
      showToast(`✓ Comprimido de ${orig}MB a ${comp}MB`);
    } catch (e) {
      alert('Error al comprimir el PDF. Verifique su conexión.');
      return;
    }
  }

  const fecha = new Date().toISOString().split('T')[0];
  const path = `${currentPacienteId}/${tipo}_${fecha}_${Date.now()}.pdf`;

  const uploadRes = await fetch(`${SUPA_URL}/storage/v1/object/documentos-pacientes/${path}`, {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: pdfBlob
  });

  if (!uploadRes.ok) { showToast('Error al subir el archivo'); return; }

  await supa('POST', 'documentos', { paciente_id: currentPacienteId, tipo, storage_path: path, enviado_paciente: false });
  document.getElementById('uploadDocForm').style.display = 'none';
  fileInput.value = '';
  showToast('✓ Documento subido correctamente');
  loadDocumentos(currentPacienteId);
}

async function eliminarDocumento(id) {
  if (!confirm('¿Eliminar este documento?')) return;
  await supa('DELETE', 'documentos', null, `?id=eq.${id}`);
  showToast('✓ Documento eliminado');
  loadDocumentos(currentPacienteId);
}
