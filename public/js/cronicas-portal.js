const FRECUENCIAS_DEFAULT = {
  'hipertension': 12, 'diabetes_tipo1': 8, 'diabetes_tipo2': 12, 'epoc': 24,
  'asma': 48, 'insuficiencia_cardiaca': 24, 'enfermedad_renal': 48, 'tiroides': 72,
  'artritis_reumatoide': 48, 'lupus': 48, 'epilepsia': 12, 'post_acv': 24,
  'fibrilacion_auricular': 24, 'depresion': 48, 'obesidad': 168, 'osteoporosis': 48, 'vih': 24
};

const NOMBRES_ENFERMEDAD = {
  'hipertension': 'Hipertensión Arterial', 'diabetes_tipo1': 'Diabetes Tipo 1',
  'diabetes_tipo2': 'Diabetes Tipo 2', 'epoc': 'EPOC', 'asma': 'Asma',
  'insuficiencia_cardiaca': 'Insuficiencia Cardíaca', 'enfermedad_renal': 'Enfermedad Renal Crónica',
  'tiroides': 'Trastorno Tiroideo', 'artritis_reumatoide': 'Artritis Reumatoide',
  'lupus': 'Lupus Eritematoso Sistémico', 'epilepsia': 'Epilepsia', 'post_acv': 'Post ACV',
  'fibrilacion_auricular': 'Fibrilación Auricular', 'depresion': 'Depresión Crónica',
  'obesidad': 'Obesidad/Sobrepeso', 'osteoporosis': 'Osteoporosis', 'vih': 'VIH/SIDA'
};

function mostrarFormCronica() {
  document.getElementById('formCronica').style.display = 'block';
  document.getElementById('cronicaFecha').value = new Date().toISOString().split('T')[0];
}

function actualizarFrecuenciaCronica() {
  const enf = document.getElementById('cronicaEnfermedad').value;
  document.getElementById('cronicaFrecuencia').value = FRECUENCIAS_DEFAULT[enf] || 24;
}

async function cargarCronicas(pacienteId) {
  const data = await supa('GET', 'enfermedades_cronicas', null, `?paciente_id=eq.${pacienteId}&order=created_at.desc`) || [];
  if (data.length === 0) {
    document.getElementById('cronicasList').innerHTML = '<div class="empty-state">Sin enfermedades crónicas registradas.</div>';
    return;
  }
  document.getElementById('cronicasList').innerHTML = data.map(ec => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid #f5f5f5">
      <div>
        <div style="font-size:14px;font-weight:600;color:#1a1a1a">${NOMBRES_ENFERMEDAD[ec.enfermedad] || ec.enfermedad}</div>
        <div style="font-size:12px;color:#888;margin-top:2px">${ec.codigo_cie10 ? `CIE-10: ${ec.codigo_cie10} · ` : ''}Seguimiento cada ${ec.frecuencia_horas}h · Desde: ${ec.fecha_inicio || '—'}</div>
        ${ec.notas ? `<div style="font-size:12px;color:#555;margin-top:4px">${ec.notas}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="badge ${ec.activo ? 'badge-green' : 'badge-gray'}">${ec.activo ? 'Activo' : 'Inactivo'}</span>
        <button class="btn btn-sm" onclick="verRegistrosCronicos('${ec.id}','${NOMBRES_ENFERMEDAD[ec.enfermedad] || ec.enfermedad}')">Ver registros</button>
        <button class="btn btn-sm ${ec.activo ? 'btn-danger' : ''}" onclick="toggleCronica('${ec.id}',${ec.activo})">${ec.activo ? 'Pausar' : 'Activar'}</button>
      </div>
    </div>`).join('');
}

async function guardarCronica() {
  const enf = document.getElementById('cronicaEnfermedad').value;
  if (!enf) { alert('Seleccione una enfermedad'); return; }
  await supa('POST', 'enfermedades_cronicas', {
    paciente_id: currentPacienteId,
    enfermedad: enf,
    codigo_cie10: document.getElementById('cronicaCIE10').value || null,
    frecuencia_horas: parseInt(document.getElementById('cronicaFrecuencia').value),
    fecha_inicio: document.getElementById('cronicaFecha').value || null,
    notas: document.getElementById('cronicaNotas').value || null,
    medico_id: currentUser.id,
    activo: true,
    proximo_seguimiento: new Date().toISOString()
  });
  document.getElementById('formCronica').style.display = 'none';
  document.getElementById('cronicaEnfermedad').value = '';
  document.getElementById('cronicaNotas').value = '';
  await cargarCronicas(currentPacienteId);
  showToast('✓ Enfermedad crónica registrada. Seguimiento automático activado.');
}

async function toggleCronica(id, activo) {
  await supa('PATCH', 'enfermedades_cronicas', { activo: !activo }, `?id=eq.${id}`);
  await cargarCronicas(currentPacienteId);
  showToast(activo ? '⏸ Seguimiento pausado' : '▶ Seguimiento activado');
}

async function verRegistrosCronicos(enfermedadId, nombre) {
  const registros = await supa('GET', 'registros_cronicos', null, `?enfermedad_id=eq.${enfermedadId}&order=created_at.desc&limit=20`) || [];
  if (registros.length === 0) { alert('Sin registros todavía.'); return; }
  const html = registros.map(r => {
    const vals = r.valores || {};
    const icon = r.nivel_alerta === 3 ? '🚨' : r.nivel_alerta === 2 ? '⚠️' : '✅';
    return `<div style="padding:10px;border-bottom:1px solid #f5f5f5;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:12px;color:#888">${new Date(r.created_at).toLocaleString('es-EC')}</div>
        <div style="font-size:13px;margin-top:4px">${Object.entries(vals).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join(' · ')}</div>
      </div>
      <span style="font-size:18px">${icon}</span>
    </div>`;
  }).join('');
  const popup = document.createElement('div');
  popup.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:300;display:flex;align-items:center;justify-content:center';
  popup.innerHTML = `<div style="background:white;border-radius:16px;padding:1.5rem;width:560px;max-height:80vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <h3 style="font-size:16px;font-weight:600">Registros: ${nombre}</h3>
      <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
    </div>${html}</div>`;
  document.body.appendChild(popup);
}
