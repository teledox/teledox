async function loadDocumentos(pacienteId) {
  if (!pacienteId) return;
  const [docs, consultas] = await Promise.all([
    supa('GET', 'documentos', null, `?paciente_id=eq.${pacienteId}&order=created_at.desc`),
    supa('GET', 'consultas', null, `?paciente_id=eq.${pacienteId}&order=created_at.asc`)
  ]);
  const docsData = docs || [];
  const consultasData = consultas || [];

  const tipoLabel = {
    historia_clinica: 'Historia clínica', receta: 'Receta médica',
    examen: 'Examen solicitado', certificado: 'Certificado médico',
    pedido_laboratorio: 'Pedido de laboratorio', otro: 'Otro'
  };

  function filaDoc(d) {
    const acciones = d.storage_path
      ? `<button class="btn btn-sm" onclick="verDocumento('${d.storage_path}')">👁 Ver</button>`
      : `<span style="font-size:11px;color:#aaa">Pendiente de subir</span>`;
    return `<tr>
      <td><strong>${tipoLabel[d.tipo] || d.tipo}</strong></td>
      <td>${new Date(d.created_at).toLocaleDateString('es-EC')}</td>
      <td>${d.enviado_paciente ? '<span class="badge badge-green">Sí</span>' : '<span class="badge badge-gray">No</span>'}</td>
      <td style="display:flex;gap:6px;align-items:center">${acciones}
        <button class="btn btn-sm btn-danger" onclick="eliminarDocumento('${d.id}')">✕</button>
      </td>
    </tr>`;
  }

  function tablaDocumentos(lista) {
    if (!lista.length) return '<div style="color:#aaa;font-size:13px;padding:6px 0">Sin documentos</div>';
    return `<table class="table" style="margin-bottom:0">
      <thead><tr><th>Tipo</th><th>Fecha</th><th>Enviado</th><th></th></tr></thead>
      <tbody>${lista.map(filaDoc).join('')}</tbody>
    </table>`;
  }

  const generales = docsData.filter(d => !d.consulta_id);
  const porConsulta = consultasData.map((c, i) => ({
    consulta: c,
    numero: i + 1,
    docs: docsData.filter(d => d.consulta_id === c.id)
  })).filter(g => g.docs.length > 0);

  if (!generales.length && !porConsulta.length) {
    document.getElementById('docsList').innerHTML = '<div class="empty-state">Sin documentos registrados.</div>';
    return;
  }

  let html = '';

  html += `<div style="margin-bottom:1.5rem">
    <div style="font-size:13px;font-weight:700;color:#374151;padding:6px 10px;background:#f3f4f6;border-radius:6px;margin-bottom:8px">📁 Generales</div>
    ${tablaDocumentos(generales)}
  </div>`;

  porConsulta.forEach(({ consulta, numero, docs: docsConsulta }) => {
    const fecha = new Date(consulta.created_at).toLocaleDateString('es-EC');
    const nivelBadge = consulta.nivel_sintomas === 3
      ? '<span class="badge badge-red">Grave</span>'
      : consulta.nivel_sintomas === 2 ? '<span class="badge badge-yellow">Medio</span>'
      : '<span class="badge badge-green">Leve</span>';
    const diagnostico = consulta.diagnostico
      ? `<span style="font-size:11px;font-weight:400;color:#6b7280"> · ${consulta.diagnostico}</span>` : '';
    html += `<div style="margin-bottom:1.5rem">
      <div style="font-size:13px;font-weight:700;color:#374151;padding:6px 10px;background:#f3f4f6;border-radius:6px;margin-bottom:8px;display:flex;align-items:center;gap:8px">
        📋 Consulta #${numero} — ${fecha} ${nivelBadge}${diagnostico}
      </div>
      ${tablaDocumentos(docsConsulta)}
    </div>`;
  });

  document.getElementById('docsList').innerHTML = html;
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

async function upsertDocumentoStorage(pacienteId, consultaId, tipo, pdfBytes) {
  const path = `${pacienteId}/${tipo}_${consultaId}.pdf`;

  const uploadRes = await fetch(`${SUPA_URL}/storage/v1/object/documentos-pacientes/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/pdf', 'x-upsert': 'true'
    },
    body: pdfBytes
  });
  if (!uploadRes.ok) throw new Error('Error subiendo PDF a Storage');

  const existing = await supa('GET', 'documentos', null,
    `?paciente_id=eq.${pacienteId}&consulta_id=eq.${consultaId}&tipo=eq.${tipo}`);
  if (existing?.length > 0) {
    await supa('PATCH', 'documentos', { storage_path: path }, `?id=eq.${existing[0].id}`);
  } else {
    await supa('POST', 'documentos', { paciente_id: pacienteId, consulta_id: consultaId, tipo, storage_path: path, enviado_paciente: false });
  }
}
