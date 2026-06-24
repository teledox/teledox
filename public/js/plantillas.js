// Normaliza fecha a YYYY-MM-DD para <input type="date">
// Acepta DD/MM/AAAA (WhatsApp) o AAAA-MM-DD (web)
function _toISODate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m}-${d}`;
  }
  return s;
}

// ── Card "Datos por completar" compartida por todos los documentos ────────────
const _INFO_DOC_CAMPOS = [
  { key: 'ocupacion',          label: 'Ocupación',           placeholder: 'Ej: Docente, Ingeniero...' },
  { key: 'lugar_trabajo',      label: 'Lugar de trabajo',    placeholder: 'Empresa o institución' },
  { key: 'domicilio_completo', label: 'Dirección domicilio', placeholder: 'Calle, número, sector...' },
];

function _renderInfoCard() {
  const card = document.getElementById('doc-info-card');
  if (!card) return;
  const p = currentPacienteData || {};
  const faltantes = _INFO_DOC_CAMPOS.filter(c => !p[c.key]);
  if (faltantes.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  card.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px">⚠️ Información del paciente por completar</div>
    ${faltantes.map(c => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <label style="font-size:12px;color:#555;width:150px;flex-shrink:0">${c.label}</label>
        <input id="doc-info-${c.key}" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;font-size:12px" placeholder="${c.placeholder}" value="${p[c.key] || ''}" />
      </div>
    `).join('')}
    <button onclick="_guardarInfoDoc()" style="margin-top:6px;background:#2563eb;color:#fff;border:none;border-radius:6px;padding:5px 14px;font-size:12px;cursor:pointer;font-weight:600">💾 Guardar en perfil del paciente</button>`;
}

async function _guardarInfoDoc() {
  if (!recetaPacienteId) { showToast('⚠️ No hay paciente activo'); return; }
  const payload = {};
  _INFO_DOC_CAMPOS.forEach(({ key }) => {
    const el = document.getElementById(`doc-info-${key}`);
    if (el) payload[key] = el.value.trim() || null;
  });
  showToast('⏳ Guardando...');
  try {
    await supa('PATCH', 'pacientes', payload, `?id=eq.${recetaPacienteId}`);
    Object.assign(currentPacienteData, payload);
    showToast('✓ Datos guardados en el perfil del paciente');
    _renderInfoCard();
  } catch(e) {
    showToast('❌ Error al guardar: ' + e.message);
  }
}

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
  const selloEl = document.getElementById(`${prefijo}-sello-container`);
  // Si hay un certificado .p12 activo en esta sesión, prioriza la firma
  // electrónica (PAdES) sobre las imágenes de firma/sello escaneadas.
  const p12Activo = typeof getP12Activo === 'function' ? getP12Activo() : null;
  if (p12Activo) {
    const titular = p12Activo.info?.titular || 'certificado activo';
    const badge = `<div style="font-size:10px;color:#16a34a;font-weight:700;text-align:center;line-height:1.4">🔐 Firma electrónica<br><span style="font-weight:400;color:#555">${titular}</span></div>`;
    if (firmaEl) firmaEl.innerHTML = badge;
    if (selloEl) selloEl.innerHTML = '';
  } else {
    if (firmaEl) firmaEl.innerHTML = m.firma_digital ? `<img src="${m.firma_digital}" style="height:56px;max-width:160px;object-fit:contain" />` : '<span style="color:#ccc;font-size:11px">Sin firma</span>';
    if (selloEl) selloEl.innerHTML = m.sello ? `<img src="${m.sello}" style="height:56px;max-width:80px;object-fit:contain" />` : '<span style="color:#ccc;font-size:11px">Sin sello</span>';
  }
  if (prefijo === 'cert') { const ce = document.getElementById('cert-correo-medico'); if (ce) ce.textContent = m.correo || ''; }
}

// ── Medicamentos: opciones de frecuencia + helpers compartidos ──────────────
// Usados por la tabla del PDF de receta (#rec-meds-body) y por el card de
// seguimiento del bot (#seg-meds-body). La frecuencia va en horas (el cron la
// multiplica por 3600000). Las opciones "(prueba)" son para testear el bot.
const FREQ_MED_OPCIONES = [
  [1 / 60, 'Cada 1 min (prueba)'],
  [0.25,   'Cada 15 min (prueba)'],
  [4, 'Cada 4h'], [6, 'Cada 6h'], [8, 'Cada 8h'], [12, 'Cada 12h'], [24, 'Una vez al día']
];

// Estilos vienen de .receta-med-table input/select en styles.css
// conSeguimiento=true agrega la columna del checkbox de notificaciones (solo en el card de seguimiento)
function _medRowsHTML(meds, minFilas, conSeguimiento) {
  const txt = (v, ph, cls, extra = '') => `<input class="${cls}" value="${v ?? ''}" placeholder="${ph}" ${extra} />`;
  const freq = (v) => `<select class="med-frecuencia"><option value="">Frecuencia...</option>${FREQ_MED_OPCIONES.map(([h, l]) => `<option value="${h}" ${v == h ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const filas = Math.max((meds || []).length, minFilas || 3);
  return Array.from({ length: filas }, (_, i) => {
    const m = (meds || [])[i] || {};
    const segCell = conSeguimiento
      ? `<td style="text-align:center"><input type="checkbox" class="med-seguimiento" title="Notificar seguimiento de este medicamento" ${m.seguimiento === false ? '' : 'checked'} /></td>`
      : '';
    return `<tr>
      <td>${txt(m.nombre, 'Medicamento...', 'med-nombre', 'list="meds-comunes"')}</td>
      <td>${txt(m.dosis, 'Dosis...', 'med-dosis')}</td>
      <td>${freq(m.frecuencia_horas)}</td>
      <td>${txt(m.dias, 'días', 'med-dias', 'type="number" min="1"')}</td>
      ${segCell}
    </tr>`;
  }).join('');
}

function _leerMedRows(tbodyId) {
  return [...document.querySelectorAll(`#${tbodyId} tr`)].map(tr => {
    const nombre = tr.querySelector('.med-nombre')?.value.trim();
    if (!nombre) return null;
    const segEl = tr.querySelector('.med-seguimiento');
    return {
      id: Date.now() + Math.random(),
      nombre,
      dosis: tr.querySelector('.med-dosis')?.value.trim() || '',
      frecuencia_horas: parseFloat(tr.querySelector('.med-frecuencia')?.value) || 8,
      dias: parseInt(tr.querySelector('.med-dias')?.value) || 1,
      // seguimiento: solo lo define el checkbox del card de seguimiento; si la fila no lo
      // tiene (tabla del PDF), queda undefined para no pisar el valor elegido en el card.
      seguimiento: segEl ? segEl.checked : undefined
    };
  }).filter(Boolean);
}

// Card de medicamentos de SEGUIMIENTO (en la página de receta, aparte del PDF).
// Comparte medicamentosData con la receta, pero se llena/edita sin abrir el PDF.
function renderSeguimientoMeds() {
  const body = document.getElementById('seg-meds-body');
  if (!body) return;
  body.innerHTML = _medRowsHTML(medicamentosData, 3, true);
  body.oninput  = sincronizarMedSeguimiento;   // texto/selects
  body.onchange = sincronizarMedSeguimiento;   // checkbox de notificaciones
}

function sincronizarMedSeguimiento() {
  if (!document.getElementById('seg-meds-body')) return;
  medicamentosData = _leerMedRows('seg-meds-body');
}

function addFilaSeguimiento() {
  sincronizarMedSeguimiento();
  const body = document.getElementById('seg-meds-body');
  if (body) body.innerHTML = _medRowsHTML(medicamentosData, medicamentosData.length + 1, true);
}

// ── Persistencia de datos de documentos (por consulta + tipo) ──────────────
// Captura los campos editables de cada plantilla y los guarda en documentos_datos,
// para que al reabrir un documento ya generado aparezca todo lo llenado y solo
// haya que ajustar lo que falte (en vez de volver a llenarlo desde cero).
let documentosGuardados = {};   // { tipo: datos }

const DOC_SHEETS = {
  receta:        'docReceta',
  certificado:   'docCertificado',
  laboratorio:   'docLaboratorio',
  historia:      'docHistoriaClinica',
  interconsulta: 'docInterconsulta'
};

function capturarDatosDoc(tipo) {
  const sheet = document.getElementById(DOC_SHEETS[tipo]);
  if (!sheet) return null;
  const datos = { campos: {}, radios: {}, checks: {} };
  // inputs de texto/número/fecha, textareas y selects (por id o name)
  sheet.querySelectorAll('input:not([type=radio]):not([type=checkbox]), textarea, select').forEach(el => {
    const key = el.id || el.name;
    if (key) datos.campos[key] = el.value;
  });
  // radios marcados (por name)
  sheet.querySelectorAll('input[type=radio]:checked').forEach(el => {
    if (el.name) datos.radios[el.name] = el.value;
  });
  // checkboxes (por id, o por índice si no tienen id — ej. los del laboratorio)
  [...sheet.querySelectorAll('input[type=checkbox]')].forEach((el, i) => {
    datos.checks[el.id || ('cb' + i)] = el.checked;
  });
  return datos;
}

function restaurarDatosDoc(tipo) {
  const datos = documentosGuardados[tipo];
  const sheet = document.getElementById(DOC_SHEETS[tipo]);
  if (!datos || !sheet) return;
  Object.entries(datos.campos || {}).forEach(([k, v]) => {
    let el = null;
    try { el = sheet.querySelector('#' + CSS.escape(k)); } catch (_) {}
    if (!el) el = sheet.querySelector(`[name="${k}"]`);
    if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  Object.entries(datos.radios || {}).forEach(([name, v]) => {
    sheet.querySelectorAll(`input[type=radio][name="${name}"]`).forEach(r => { r.checked = (r.value === v); });
    const sel = sheet.querySelector(`input[type=radio][name="${name}"]:checked`);
    if (sel) sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const cbs = [...sheet.querySelectorAll('input[type=checkbox]')];
  Object.entries(datos.checks || {}).forEach(([k, v]) => {
    let el = null;
    if (k.startsWith('cb')) el = cbs[parseInt(k.slice(2), 10)];
    else { try { el = sheet.querySelector('#' + CSS.escape(k)); } catch (_) {} }
    if (el) el.checked = !!v;
  });
}

async function guardarDatosDoc(tipo) {
  const datos = capturarDatosDoc(tipo);
  if (!datos || !recetaConsultaId) return;
  documentosGuardados[tipo] = datos;
  try {
    const payload = {
      consulta_id: recetaConsultaId, paciente_id: recetaPacienteId,
      medico_id: currentUser?.id, tipo, datos, updated_at: new Date().toISOString()
    };
    const existing = await supa('GET', 'documentos_datos', null, `?consulta_id=eq.${recetaConsultaId}&tipo=eq.${tipo}&limit=1`);
    if (existing?.length) await supa('PATCH', 'documentos_datos', payload, `?id=eq.${existing[0].id}`);
    else await supa('POST', 'documentos_datos', payload);
  } catch (e) {
    console.error('Error guardando datos del documento', tipo, e);
  }
}

// ── Mini-preview inline de cada documento (card que queda en el apartado) ───
const ABRIR_PLANTILLA = {
  receta:        () => abrirPlantillaReceta,
  certificado:   () => abrirPlantillaCertificado,
  laboratorio:   () => abrirPlantillaLaboratorio,
  historia:      () => abrirPlantillaHistoriaClinica,
  interconsulta: () => abrirPlantillaInterconsulta
};

// Clona el doc-sheet "horneando" los valores actuales (cloneNode no copia los .value)
function _snapshotSheet(sheet) {
  const clone = sheet.cloneNode(true);
  const live = sheet.querySelectorAll('input, textarea, select');
  const cl = clone.querySelectorAll('input, textarea, select');
  live.forEach((el, i) => {
    const c = cl[i]; if (!c) return;
    if (el.tagName === 'SELECT') { [...c.options].forEach(o => o.selected = (o.value === el.value)); c.value = el.value; }
    else if (el.type === 'checkbox' || el.type === 'radio') { c.checked = el.checked; if (el.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked'); }
    else if (el.tagName === 'TEXTAREA') { c.textContent = el.value; }
    else { c.setAttribute('value', el.value ?? ''); }
  });
  return clone;
}

function renderPreviewDoc(_tipo) { /* preview eliminado — botón Editar siempre visible en el card */ }

// Re-pinta los previews de los documentos que ya tienen datos guardados (al abrir la consulta)
function renderPreviewsGuardados() {
  Object.keys(DOC_SHEETS).forEach(tipo => {
    const slot = document.getElementById('preview-' + tipo);
    if (slot) slot.innerHTML = '';
  });
  Object.keys(documentosGuardados || {}).forEach(tipo => {
    if (DOC_SHEETS[tipo]) renderPreviewDoc(tipo);
  });
}

function abrirPlantillaReceta(soloPreview) {
  const p = currentPacienteData || {}, c = currentConsultaData || {};
  document.getElementById('rec-numero').textContent = Date.now().toString().slice(-6);
  document.getElementById('rec-fecha-header').textContent = new Date().toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('rec-paciente').textContent = `${(p.apellidos || '').toUpperCase()} ${(p.nombre || '').toUpperCase()}`.trim() || '—';
  document.getElementById('rec-cedula').textContent = p.cedula || '—';
  document.getElementById('rec-edad').textContent = p.edad ? `${p.edad} años` : '—';
  document.getElementById('rec-sexo').value = p.sexo ? p.sexo[0].toUpperCase() : '';
  document.getElementById('rec-hoja').value = '1';
  document.getElementById('rec-atencion').textContent = recetaConsultaId ? recetaConsultaId.slice(-8).toUpperCase() : '—';
  const diag = (document.getElementById('recetaDiagnostico').value || c.diagnostico || '—').toUpperCase();
  document.getElementById('rec-diagnostico').textContent = diag;
  document.getElementById('rec-cie10').value = cie10Seleccionados.map(x => x.c).join(', ');
  const noRadio = document.querySelector('input[name="rec-alergias"][value="NO"]');
  if (noRadio) noRadio.checked = true;
  document.getElementById('rec-alergias-especificar').value = '';
  document.getElementById('rec-peso').value = '';
  document.getElementById('rec-talla').value = '';
  document.getElementById('rec-medidas-no-farmacologicas').value = '';
  // Tabla de medicamentos del PDF (comparte medicamentosData con el card de seguimiento)
  document.getElementById('rec-meds-body').innerHTML = _medRowsHTML(medicamentosData, 5);
  document.getElementById('rec-indicaciones').value = document.getElementById('recetaIndicaciones').value || '';
  poblarDatosMedico('rec');
  restaurarDatosDoc('receta');
  _renderCronicasStrip('rec-cronicas-lista');
  if (!soloPreview) document.getElementById('modalReceta').classList.add('open');
}

function abrirPlantillaCertificado(soloPreview) {
  const p = currentPacienteData || {}, c = currentConsultaData || {}, m = currentUser || {}, hoy = new Date();
  const fechaTexto = hoy.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('cert-lugar-fecha').textContent = `MediLyft; ${hoy.toLocaleDateString('es-EC')}`;
  document.getElementById('cert-tel-emisor').value = m.telefono || '';
  document.getElementById('cert-direccion-establecimiento').value = '';
  document.getElementById('cert-lugar-fecha-emision').textContent = `Quito, ${fechaTexto}`;
  document.getElementById('cert-paciente').textContent = `${(p.apellidos || '').toUpperCase()} ${(p.nombre || '').toUpperCase()}`.trim() || '—';
  document.getElementById('cert-direccion').value = (p.domicilio_completo || p.lugar_residencia || '').toUpperCase();
  document.getElementById('cert-telefono').textContent = p.telefono || '—';
  document.getElementById('cert-puesto-trabajo').value = p.ocupacion || '';
  document.getElementById('cert-empresa').textContent = (p.lugar_trabajo || p.clientes_b2b?.nombre_empresa || '—').toUpperCase();
  document.getElementById('cert-cedula').textContent = p.cedula || '—';
  document.getElementById('cert-hc').textContent = p.cedula || '—';
  const _certDiag = cie10Seleccionados.length
    ? cie10Seleccionados.map(x => x.n).join(', ')
    : (document.getElementById('recetaDiagnostico')?.value || c.diagnostico || '');
  document.getElementById('cert-diagnostico').value = _certDiag.toUpperCase();
  document.getElementById('cert-cie10').value = cie10Seleccionados.map(x => x.c).join(', ');
  const absRadio = document.querySelector('input[name="cert-reposo-tipo"][value="ABSOLUTO"]');
  if (absRadio) absRadio.checked = true;
  const siRadio = document.querySelector('input[name="cert-sintomas"][value="SI"]');
  if (siRadio) siRadio.checked = true;
  const cbEnf = document.getElementById('cert-tipo-enfermedad');
  if (cbEnf) cbEnf.checked = true;
  const cbAis = document.getElementById('cert-tipo-aislamiento');
  if (cbAis) cbAis.checked = false;
  const selCont = document.getElementById('cert-tipo-contingencia');
  if (selCont) selCont.value = 'ENFERMEDAD GENERAL';
  document.getElementById('cert-descripcion').value = c.sintomas_descripcion || '';
  const fechaHoy = hoy.toISOString().split('T')[0];
  document.getElementById('cert-desde').value = fechaHoy;
  document.getElementById('cert-hasta').value = fechaHoy;
  actualizarDiasLetra(); actualizarHastaFecha();
  poblarDatosMedico('cert');
  restaurarDatosDoc('certificado');
  _renderCronicasStrip('cert-cronicas-lista');
  if (!soloPreview) document.getElementById('modalCertificado').classList.add('open');
}

function abrirPlantillaLaboratorio(soloPreview) {
  const p = currentPacienteData || {}, c = currentConsultaData || {};
  document.getElementById('lab-paciente').textContent = `${(p.apellidos || '').toUpperCase()} ${(p.nombre || '').toUpperCase()}`.trim() || '—';
  document.getElementById('lab-edad').textContent = p.edad ? `${p.edad} años` : '—';
  document.getElementById('lab-cedula').textContent = p.cedula || '—';
  const _labDiag = cie10Seleccionados.length
    ? cie10Seleccionados.map(x => x.n).join(', ')
    : (document.getElementById('recetaDiagnostico')?.value || c.diagnostico || '');
  document.getElementById('lab-diagnostico').value = _labDiag.toUpperCase();
  document.getElementById('lab-fecha').textContent = new Date().toLocaleDateString('es-EC');
  document.querySelectorAll('#docLaboratorio .lab-check').forEach(cb => cb.checked = false);
  document.getElementById('lab-otros-examenes').value = '';
  document.getElementById('lab-instrucciones').value = '';
  poblarDatosMedico('lab');
  restaurarDatosDoc('laboratorio');
  _renderCronicasStrip('lab-cronicas-lista');
  if (!soloPreview) document.getElementById('modalLaboratorio').classList.add('open');
}

async function generarDocumentoDesdeModalLaboratorio() {
  if (!confirmarPeseAVacios('modalLaboratorio')) return;
  try {
    showToast('⏳ Generando Pedido de Laboratorio...');
    const pdfBytes = await generarPedidoPDF();
    pdfGenerados.pedido = pdfBytes;
    await guardarDatosDoc('laboratorio');
    actualizarEstadoDocs();
    cerrarModal('modalLaboratorio');
    renderPreviewDoc('laboratorio');
    showToast('✓ Pedido de Laboratorio generado — listo para enviar al paciente');
  } catch (e) {
    console.error('Error Pedido de Laboratorio:', e);
    showToast('Error al generar el Pedido de Laboratorio');
  }
}

// Escanea un modal de documento y devuelve los nombres de los campos editables que están vacíos
// (esos espacios saldrán como "—" en el PDF). Sirve para avisar al médico antes de generar/enviar.
function camposVaciosEnModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return [];
  const campos = [...modal.querySelectorAll('.doc-val-edit, .doc-textarea, .hc-input, .hc-textarea, .form-control')];
  const vistos = new Set();
  const vacios = [];
  for (const el of campos) {
    if (el.readOnly || el.value.trim()) continue;
    if (el.offsetParent === null) continue; // skip hidden fields
    const fila = el.closest('.doc-row, .hc-field, .cert-dias-row') || el.parentElement;
    const lbl = fila?.querySelector('.doc-lbl, .hc-label, .form-label');
    const nombre = (lbl?.textContent || el.placeholder || el.id || '').replace(/[:*]+$/, '').trim();
    if (nombre && !vistos.has(nombre)) { vistos.add(nombre); vacios.push(nombre); }
  }
  return vacios;
}

// Antes de generar, avisa qué campos quedarán vacíos ("—") y deja confirmar o volver a llenarlos
function confirmarPeseAVacios(modalId) {
  const vacios = camposVaciosEnModal(modalId);
  if (!vacios.length) return true;
  return confirm(`Estos campos están vacíos y se mostrarán como "—" en el documento:\n\n• ${vacios.join('\n• ')}\n\n¿Generar de todos modos?`);
}

function cerrarModal(id) { document.getElementById(id).classList.remove('open'); }

async function imprimirPlantilla(tipo) {
  const generadores = {
    receta:        generarRecetaPDF,
    certificado:   generarCertificadoPDF,
    laboratorio:   generarPedidoPDF,
    historiaclinica: generarHistoriaClinicaPDF,
    interconsulta: generarInterconsultaPDF,
  };
  const fn = generadores[tipo];
  if (!fn) return;
  try {
    showToast('⏳ Generando PDF con firma...');
    const pdfBytes = await fn();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showToast('✓ PDF listo — usa Ctrl+P en la pestaña para imprimir');
  } catch (e) {
    console.error('[imprimirPlantilla]', e);
    showToast('Error al generar el PDF para imprimir');
  }
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

function abrirPlantillaHistoriaClinica(soloPreview) {
  const p = currentPacienteData || {};
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = val;
    else el.textContent = val;
  };
  set('hc-nombres',   (p.nombre    || '').toUpperCase());
  set('hc-apellidos', (p.apellidos || '').toUpperCase());
  set('hc-cedula', p.cedula || '');
  set('hc-edad', p.edad || '');
  set('hc-fecha-nac', _toISODate(p.fecha_nacimiento));
  set('hc-historial', p.cedula || '');
  set('hc-lugar-nac', p.lugar_residencia || '');
  set('hc-domicilio', p.domicilio_completo || p.lugar_residencia || '');
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
  // Pre-llenar tabla de diagnóstico (CIE-10) con los códigos seleccionados
  (cie10Seleccionados || []).slice(0, 4).forEach((x, i) => {
    set(`hc-dx-${i + 1}`, x.n);
    set(`hc-dx-cie-${i + 1}`, x.c);
  });
  const evoInput = (placeholder, extra = '') => `<input placeholder="${placeholder}" style="width:100%;border:none;outline:none;font-size:10px;background:transparent" ${extra}/>`;
  document.getElementById('hc-evolucion-body').innerHTML = Array.from({ length: 4 }, () =>
    `<tr><td>${evoInput('dd/mm/aaaa')}</td><td>${evoInput('Evolución del paciente...')}</td><td>${evoInput('Prescripción / indicaciones...')}</td></tr>`
  ).join('');
  // Mostrar campo "Responsable" solo si el paciente es menor de edad
  const campoResp = document.getElementById('hc-responsable-campo');
  if (campoResp) {
    let esMenor = false;
    if (p.fecha_nacimiento) {
      // Acepta DD/MM/AAAA o AAAA-MM-DD
      const raw = String(p.fecha_nacimiento);
      const fn = raw.includes('/') ? (() => { const [d,m,a] = raw.split('/'); return new Date(+a, +m-1, +d); })() : new Date(raw);
      if (!isNaN(fn)) {
        const hoy = new Date();
        let edad = hoy.getFullYear() - fn.getFullYear();
        if (hoy.getMonth() < fn.getMonth() || (hoy.getMonth() === fn.getMonth() && hoy.getDate() < fn.getDate())) edad--;
        esMenor = edad < 18;
      }
    }
    if (!esMenor) {
      const edadNum = parseInt(p.edad);
      if (!isNaN(edadNum)) esMenor = edadNum < 18;
    }
    campoResp.style.display = esMenor ? '' : 'none';
    if (!esMenor) document.getElementById('hc-responsable').value = '';
  }

  poblarDatosMedico('hc');
  restaurarDatosDoc('historia');
  document.getElementById('hc-cronicas-nueva').value = '';
  renderCronicasHC();
  if (!soloPreview) document.getElementById('modalHistoriaClinica').classList.add('open');
}

function abrirPlantillaInterconsulta(soloPreview) {
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
  set('inter-historial', p.cedula || '');
  set('inter-cedula', p.cedula || '');
  set('inter-edad', p.edad || '');
  set('inter-fecha-nac', _toISODate(p.fecha_nacimiento));
  set('inter-lugar-nac', p.lugar_residencia || '');
  set('inter-domicilio', p.domicilio_completo || p.lugar_residencia || '');
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
  restaurarDatosDoc('interconsulta');
  _renderCronicasStrip('inter-cronicas-lista');
  if (!soloPreview) document.getElementById('modalInterconsulta').classList.add('open');
}

async function generarDocumentoDesdeModalReceta() {
  if (!confirmarPeseAVacios('modalReceta')) return;
  try {
    showToast('⏳ Generando Receta Médica...');
    sincronizarMedicamentosDesdeModal();
    const pdfBytes = await generarRecetaPDF();
    pdfGenerados.receta = pdfBytes;
    await guardarDatosDoc('receta');
    await guardarRecetaBD();
    actualizarEstadoDocs();
    cerrarModal('modalReceta');
    renderPreviewDoc('receta');
    showToast('✓ Receta Médica generada — lista para enviar al paciente');
  } catch (e) {
    console.error('Error Receta:', e);
    showToast('Error al generar la Receta Médica');
  }
}

async function generarDocumentoDesdeModalCertificado() {
  if (!confirmarPeseAVacios('modalCertificado')) return;
  try {
    showToast('⏳ Generando Certificado Médico...');
    const pdfBytes = await generarCertificadoPDF();
    pdfGenerados.certificado = pdfBytes;
    await guardarDatosDoc('certificado');
    actualizarEstadoDocs();
    cerrarModal('modalCertificado');
    renderPreviewDoc('certificado');
    showToast('✓ Certificado Médico generado — listo para enviar al paciente');
  } catch (e) {
    console.error('Error Certificado:', e);
    showToast('Error al generar el Certificado Médico');
  }
}

async function generarDocumentoDesdeModalHC() {
  if (!confirmarPeseAVacios('modalHistoriaClinica')) return;
  try {
    showToast('⏳ Generando Historia Clínica...');
    const pdfBytes = await generarHistoriaClinicaPDF();
    pdfGenerados.historia = pdfBytes;
    await guardarDatosDoc('historia');
    actualizarEstadoDocs();
    cerrarModal('modalHistoriaClinica');
    renderPreviewDoc('historia');
    showToast('✓ Historia Clínica generada — lista para enviar al paciente');
  } catch (e) {
    console.error('Error HC:', e);
    showToast('Error al generar la Historia Clínica');
  }
}

async function generarDocumentoDesdeModalInterconsulta() {
  if (!confirmarPeseAVacios('modalInterconsulta')) return;
  try {
    showToast('⏳ Generando Interconsulta...');
    const pdfBytes = await generarInterconsultaPDF();
    pdfGenerados.interconsulta = pdfBytes;
    await guardarDatosDoc('interconsulta');
    actualizarEstadoDocs();
    cerrarModal('modalInterconsulta');
    renderPreviewDoc('interconsulta');
    showToast('✓ Interconsulta generada — lista para enviar al paciente');
  } catch (e) {
    console.error('Error Interconsulta:', e);
    showToast('Error al generar la Interconsulta');
  }
}

// Inicializar listeners de modales después de que el DOM cargue
// ── Enfermedades crónicas en tira informativa (receta / cert / lab) ──────────
async function _renderCronicasStrip(spanId) {
  const el = document.getElementById(spanId);
  if (!el || !recetaPacienteId) return;
  const cronicas = await supa('GET', 'enfermedades_cronicas', null,
    `?paciente_id=eq.${recetaPacienteId}&activo=eq.true&order=created_at.asc`) || [];
  el.style.fontStyle = cronicas.length ? 'normal' : 'italic';
  el.textContent = cronicas.length
    ? cronicas.map(c => NOMBRES_ENFERMEDAD[c.enfermedad] || c.enfermedad).join(' · ')
    : 'Sin enfermedades crónicas registradas';
}

// ── Enfermedades crónicas en Historia Clínica (con gestión) ──────────────────
async function renderCronicasHC() {
  const tags = document.getElementById('hc-cronicas-tags');
  const hidden = document.getElementById('hc-cronicas-texto');
  if (!tags || !recetaPacienteId) return;
  const cronicas = await supa('GET', 'enfermedades_cronicas', null,
    `?paciente_id=eq.${recetaPacienteId}&activo=eq.true&order=created_at.asc`) || [];
  if (!cronicas.length) {
    tags.innerHTML = '<span style="font-size:11px;color:#bbb;font-style:italic">Sin enfermedades crónicas registradas</span>';
    if (hidden) hidden.value = '';
    return;
  }
  tags.innerHTML = cronicas.map(c => {
    const n = NOMBRES_ENFERMEDAD[c.enfermedad] || c.enfermedad;
    const cie = c.codigo_cie10 ? ` · ${c.codigo_cie10}` : '';
    return `<span style="background:#fff0f0;border:1px solid #ffc5c7;color:#c0392b;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${n}${cie}</span>`;
  }).join('');
  if (hidden) hidden.value = cronicas.map(c =>
    (NOMBRES_ENFERMEDAD[c.enfermedad] || c.enfermedad) + (c.codigo_cie10 ? ` (${c.codigo_cie10})` : '')
  ).join(', ');
}

async function agregarCronicaDesdeHC() {
  const sel = document.getElementById('hc-cronicas-nueva');
  const enfermedad = sel?.value;
  if (!enfermedad || !recetaPacienteId) return;
  const existing = await supa('GET', 'enfermedades_cronicas', null,
    `?paciente_id=eq.${recetaPacienteId}&enfermedad=eq.${enfermedad}&limit=1`) || [];
  if (existing.length) {
    if (!existing[0].activo) await supa('PATCH', 'enfermedades_cronicas', { activo: true }, `?id=eq.${existing[0].id}`);
    else { showToast('Ya está registrada como activa'); sel.value = ''; return; }
  } else {
    await supa('POST', 'enfermedades_cronicas', {
      paciente_id: recetaPacienteId,
      enfermedad,
      activo: true,
      frecuencia_horas: FRECUENCIAS_DEFAULT[enfermedad] || 24
    });
  }
  sel.value = '';
  await renderCronicasHC();
  showToast(`✓ ${NOMBRES_ENFERMEDAD[enfermedad] || enfermedad} registrada`);
}

window.addEventListener('load', () => {
  ['modalReceta', 'modalCertificado', 'modalLaboratorio', 'modalHistoriaClinica', 'modalInterconsulta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', function (e) { if (e.target === this) this.classList.remove('open'); });
  });
  const hastaEl = document.getElementById('cert-hasta');
  if (hastaEl) hastaEl.addEventListener('input', function () { document.getElementById('cert-hasta-letra').value = fechaALetra(this.value); });
});
