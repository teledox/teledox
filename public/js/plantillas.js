function togglePlantilla(tipo) {
  plantillaSeleccionada = (plantillaSeleccionada === tipo) ? null : tipo;
  document.querySelectorAll('.plantilla-card').forEach(c => c.classList.remove('selected'));
  if (plantillaSeleccionada) {
    document.getElementById('pc-' + plantillaSeleccionada).classList.add('selected');
    document.getElementById('btnAbrirPlantilla').style.display = 'inline-flex';
  } else {
    document.getElementById('btnAbrirPlantilla').style.display = 'none';
  }
}

function abrirPlantillaSeleccionada() {
  if (!plantillaSeleccionada) return;
  if (plantillaSeleccionada === 'receta') abrirPlantillaReceta();
  else if (plantillaSeleccionada === 'certificado') abrirPlantillaCertificado();
  else if (plantillaSeleccionada === 'laboratorio') abrirPlantillaLaboratorio();
  else if (plantillaSeleccionada === 'historia') abrirPlantillaHistoriaClinica();
  else if (plantillaSeleccionada === 'interconsulta') abrirPlantillaInterconsulta();
}

function poblarDatosMedico(prefijo) {
  const m = currentUser || {};
  const nombre = `${m.nombre || ''} ${m.apellidos || ''}`.toUpperCase().trim();
  const reg = m.numero_registro || '';
  const esp = m.especialidad || 'MEDICINA GENERAL';
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl(`${prefijo}-nombre-medico`, nombre || 'NOMBRE DEL MÉDICO');
  setEl(`${prefijo}-reg-medico`, reg ? `Reg. MSP: ${reg}` : '');
  setEl(`${prefijo}-esp-medico`, esp);
  const firmaEl = document.getElementById(`${prefijo}-firma-container`);
  if (firmaEl) firmaEl.innerHTML = m.firma_digital ? `<img src="${m.firma_digital}" style="height:56px;max-width:160px;object-fit:contain" />` : '<span style="color:#ccc;font-size:11px">Sin firma</span>';
  const selloEl = document.getElementById(`${prefijo}-sello-container`);
  if (selloEl) selloEl.innerHTML = m.sello ? `<img src="${m.sello}" style="height:56px;max-width:80px;object-fit:contain" />` : '<span style="color:#ccc;font-size:11px">Sin sello</span>';
  if (prefijo === 'cert') { const ce = document.getElementById('cert-correo-medico'); if (ce) ce.textContent = m.correo || ''; }
}

function abrirPlantillaReceta() {
  const p = currentPacienteData || {}, c = currentConsultaData || {};
  document.getElementById('rec-numero').textContent = Date.now().toString().slice(-6);
  document.getElementById('rec-fecha-header').textContent = new Date().toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('rec-paciente').textContent = `${(p.apellidos || '').toUpperCase()} ${(p.nombre || '').toUpperCase()}`.trim() || '—';
  document.getElementById('rec-cedula').textContent = p.cedula || '—';
  document.getElementById('rec-edad').textContent = p.edad ? `${p.edad} años` : '—';
  document.getElementById('rec-hc').textContent = p.cedula || '—';
  document.getElementById('rec-atencion').textContent = recetaConsultaId ? recetaConsultaId.slice(-8).toUpperCase() : '—';
  const diag = (document.getElementById('recetaDiagnostico').value || c.diagnostico || '—').toUpperCase();
  document.getElementById('rec-diagnostico').textContent = diag;
  document.getElementById('rec-cie10').textContent = cie10Seleccionados.map(x => x.c).join(', ') || '—';
  const freqLabel = { 4: 'Cada 4h', 6: 'Cada 6h', 8: 'Cada 8h', 12: 'Cada 12h', 24: 'Una vez al día' };
  document.getElementById('rec-meds-body').innerHTML = medicamentosData.length > 0
    ? medicamentosData.map(m => `<tr><td><input value="${m.nombre || ''}" placeholder="Medicamento..." style="width:100%;border:none;outline:none;font-size:10px;background:transparent" /></td><td><input value="${m.dosis || ''}" placeholder="Dosis..." style="width:100%;border:none;outline:none;font-size:10px;background:transparent" /></td><td><input value="${freqLabel[m.frecuencia_horas] || ''}" placeholder="Frecuencia..." style="width:100%;border:none;outline:none;font-size:10px;background:transparent" /></td><td><input value="${m.dias || ''}" placeholder="días" style="width:100%;border:none;outline:none;font-size:10px;background:transparent" /></td></tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:8px;font-style:italic">Sin medicamentos</td></tr>';
  document.getElementById('rec-indicaciones').value = document.getElementById('recetaIndicaciones').value || '';
  poblarDatosMedico('rec');
  document.getElementById('modalReceta').classList.add('open');
}

function abrirPlantillaCertificado() {
  const p = currentPacienteData || {}, c = currentConsultaData || {}, hoy = new Date();
  document.getElementById('cert-lugar-fecha').textContent = `MediLyft; ${hoy.toLocaleDateString('es-EC')}`;
  document.getElementById('cert-paciente').textContent = `${(p.apellidos || '').toUpperCase()} ${(p.nombre || '').toUpperCase()}`.trim() || '—';
  document.getElementById('cert-direccion').textContent = (p.lugar_residencia || '—').toUpperCase();
  document.getElementById('cert-telefono').textContent = p.telefono || '—';
  document.getElementById('cert-empresa').textContent = (p.clientes_b2b?.nombre_empresa || '—').toUpperCase();
  document.getElementById('cert-cedula').textContent = p.cedula || '—';
  document.getElementById('cert-hc').textContent = p.cedula || '—';
  document.getElementById('cert-diagnostico').textContent = (document.getElementById('recetaDiagnostico').value || c.diagnostico || '—').toUpperCase();
  document.getElementById('cert-cie10').textContent = cie10Seleccionados.map(x => x.c).join(', ') || '—';
  document.getElementById('cert-descripcion').value = c.sintomas_descripcion || '';
  const fechaHoy = hoy.toISOString().split('T')[0];
  document.getElementById('cert-desde').value = fechaHoy;
  document.getElementById('cert-hasta').value = fechaHoy;
  actualizarDiasLetra(); actualizarHastaFecha();
  poblarDatosMedico('cert');
  document.getElementById('modalCertificado').classList.add('open');
}

function abrirPlantillaLaboratorio() {
  const p = currentPacienteData || {}, c = currentConsultaData || {};
  document.getElementById('lab-paciente').textContent = `${(p.apellidos || '').toUpperCase()} ${(p.nombre || '').toUpperCase()}`.trim() || '—';
  document.getElementById('lab-edad').textContent = p.edad ? `${p.edad} años` : '—';
  document.getElementById('lab-cedula').textContent = p.cedula || '—';
  document.getElementById('lab-diagnostico').textContent = (document.getElementById('recetaDiagnostico').value || c.diagnostico || '—').toUpperCase();
  document.getElementById('lab-fecha').textContent = new Date().toLocaleDateString('es-EC');
  document.querySelectorAll('#docLaboratorio .lab-check').forEach(cb => cb.checked = false);
  poblarDatosMedico('lab');
  document.getElementById('modalLaboratorio').classList.add('open');
}

function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }

function imprimirPlantilla(tipo) {
  const docIds = { receta: 'docReceta', certificado: 'docCertificado', laboratorio: 'docLaboratorio', historiaclinica: 'docHistoriaClinica', interconsulta: 'docInterconsulta' };
  const docEl = document.getElementById(docIds[tipo]); if (!docEl) return;
  const printRoot = document.getElementById('printRoot'); printRoot.innerHTML = '';
  const clone = docEl.cloneNode(true); clone.style.padding = '0'; printRoot.appendChild(clone);
  window.print();
  setTimeout(() => { printRoot.innerHTML = ''; }, 1000);
}

// Utilidades certificado
const NUMEROS_LETRA = ['CERO','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE','VEINTE','VEINTIUNO','VEINTIDÓS','VEINTITRÉS','VEINTICUATRO','VEINTICINCO','VEINTISÉIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE','TREINTA'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function numALetra(n) {
  if (n >= 0 && n <= 30) return NUMEROS_LETRA[n];
  if (n < 100) {
    const dec = ['','','VEINTI','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
    const uni = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE'];
    const d = Math.floor(n / 10), u = n % 10;
    return u === 0 ? dec[d] : `${dec[d]} Y ${uni[u]}`;
  }
  return n.toString();
}

function fechaALetra(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return `${numALetra(d).toLowerCase()} de ${MESES[m - 1]} de dos mil ${numALetra(y - 2000).toLowerCase()}`;
}

function actualizarDiasLetra() {
  const n = parseInt(document.getElementById('cert-dias-num').value) || 1;
  document.getElementById('cert-dias-letra').value = numALetra(n);
  actualizarHastaFecha();
}

function actualizarHastaFecha() {
  const desde = document.getElementById('cert-desde').value;
  const dias = parseInt(document.getElementById('cert-dias-num').value) || 1;
  document.getElementById('cert-desde-letra').value = fechaALetra(desde);
  if (desde) {
    const d = new Date(desde + 'T12:00:00');
    d.setDate(d.getDate() + dias - 1);
    const hasta = d.toISOString().split('T')[0];
    document.getElementById('cert-hasta').value = hasta;
    document.getElementById('cert-hasta-letra').value = fechaALetra(hasta);
  }
}

function abrirPlantillaHistoriaClinica() {
  const p = currentPacienteData || {};
  const apellidos = (p.apellidos || '').split(' ');
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = val;
    else el.textContent = val;
  };
  set('hc-nombre', `${(p.apellidos||'').toUpperCase()} ${(p.nombre||'').toUpperCase()}`.trim());
  set('hc-primer-ap', (apellidos[0] || '').toUpperCase());
  set('hc-segundo-ap', (apellidos[1] || '').toUpperCase());
  set('hc-cedula', p.cedula || '');
  set('hc-edad', p.edad || '');
  set('hc-fecha-nac', p.fecha_nacimiento || '');
  set('hc-lugar-nac', p.lugar_residencia || '');
  set('hc-domicilio', p.lugar_residencia || '');
  set('hc-ocupacion', p.ocupacion || '');
  set('hc-telefono', p.telefono || '');
  set('hc-fecha-doc', new Date().toLocaleDateString('es-EC'));
  if (p.sexo) {
    const radio = document.querySelector(`input[name="hc-sexo"][value="${p.sexo}"]`);
    if (radio) radio.checked = true;
  }
  // Pre-llenar antecedentes si existen
  const diag = document.getElementById('recetaDiagnostico')?.value || '';
  if (diag) set('hc-enfermedad', diag);
  poblarDatosMedico('hc');
  document.getElementById('modalHistoriaClinica').classList.add('open');
}

function abrirPlantillaInterconsulta() {
  const p = currentPacienteData || {};
  const c = currentConsultaData || {};
  const apellidos = (p.apellidos || '').split(' ');
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = val;
    else el.textContent = val;
  };
  set('inter-nombre', `${(p.apellidos||'').toUpperCase()} ${(p.nombre||'').toUpperCase()}`.trim());
  set('inter-primer-ap', (apellidos[0] || '').toUpperCase());
  set('inter-segundo-ap', (apellidos[1] || '').toUpperCase());
  set('inter-cedula', p.cedula || '');
  set('inter-edad', p.edad || '');
  set('inter-fecha-nac', p.fecha_nacimiento || '');
  set('inter-lugar-nac', p.lugar_residencia || '');
  set('inter-domicilio', p.lugar_residencia || '');
  set('inter-ocupacion', p.ocupacion || '');
  set('inter-telefono', p.telefono || '');
  const hoy = new Date().toLocaleDateString('es-EC');
  set('inter-fecha', hoy);
  set('inter-fecha-header', hoy);
  set('inter-diagnostico', document.getElementById('recetaDiagnostico')?.value || c.diagnostico || '');
  set('inter-cie10-val', cie10Seleccionados.map(x => x.c).join(', ') || '');
  const medNomInt = `Dr. ${currentUser?.nombre || ''} ${currentUser?.apellidos || ''}`.trim();
  set('inter-prof-nombre', medNomInt);
  if (p.sexo) {
    const radio = document.querySelector(`input[name="inter-sexo"][value="${p.sexo}"]`);
    if (radio) radio.checked = true;
  }
  poblarDatosMedico('inter');
  document.getElementById('modalInterconsulta').classList.add('open');
}

async function generarDocumentoDesdeModalHC() {
  try {
    showToast('⏳ Generando Historia Clínica...');
    const pdfBytes = await generarHistoriaClinicaPDF();
    pdfGenerados.historia = pdfBytes;
    actualizarCheckboxDocs();
    cerrarModal('modalHistoriaClinica');
    showToast('✓ Historia Clínica generada — lista para enviar al paciente');
  } catch (e) {
    console.error('Error HC:', e);
    showToast('Error al generar la Historia Clínica');
  }
}

async function generarDocumentoDesdeModalInterconsulta() {
  try {
    showToast('⏳ Generando Interconsulta...');
    const pdfBytes = await generarInterconsultaPDF();
    pdfGenerados.interconsulta = pdfBytes;
    actualizarCheckboxDocs();
    cerrarModal('modalInterconsulta');
    showToast('✓ Interconsulta generada — lista para enviar al paciente');
  } catch (e) {
    console.error('Error Interconsulta:', e);
    showToast('Error al generar la Interconsulta');
  }
}

// Inicializar listeners de modales después de que el DOM cargue
window.addEventListener('load', () => {
  ['modalReceta', 'modalCertificado', 'modalLaboratorio', 'modalHistoriaClinica', 'modalInterconsulta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', function (e) { if (e.target === this) this.classList.remove('open'); });
  });
  const hastaEl = document.getElementById('cert-hasta');
  if (hastaEl) hastaEl.addEventListener('input', function () { document.getElementById('cert-hasta-letra').value = fechaALetra(this.value); });
});
