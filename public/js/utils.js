// ===== CRONÓMETRO DE ESPERA =====
// Postgres devuelve los timestamps SIN zona horaria (ej. "2026-06-08T23:22:10").
// El navegador los interpretaría como hora local; como en realidad son UTC, hay que
// agregar 'Z' para que el tiempo transcurrido no salga negativo (y el timer quede en 0).
function _parseUTC(ts) {
  if (!ts) return NaN;
  let s = String(ts);
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
  return new Date(s).getTime();
}

function formatElapsedTime(createdAt) {
  const elapsed = Math.max(0, Math.floor((Date.now() - _parseUTC(createdAt)) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2,'0')}s`;
  return `${s}s`;
}

function getTimerColor(createdAt) {
  const min = (Date.now() - _parseUTC(createdAt)) / 60000;
  if (min < 3)  return '#16a34a';
  if (min < 10) return '#ca8a04';
  if (min < 20) return '#ea580c';
  return '#dc2626';
}

function _updateTimers() {
  var now = Date.now();
  document.querySelectorAll('.alerta-timer[data-created]').forEach(function(el) {
    var created = el.getAttribute('data-created');
    if (!created || created === 'undefined' || created === 'null') return;
    var ms = _parseUTC(created);
    if (isNaN(ms)) return;
    var elapsed = Math.max(0, Math.floor((now - ms) / 1000));
    var h = Math.floor(elapsed / 3600);
    var m = Math.floor((elapsed % 3600) / 60);
    var s = elapsed % 60;
    var t = h > 0
      ? h + 'h ' + String(m).padStart(2,'0') + 'm ' + String(s).padStart(2,'0') + 's'
      : m > 0 ? m + 'm ' + String(s).padStart(2,'0') + 's'
      : s + 's';
    var min = (now - ms) / 60000;
    var color = min < 3 ? '#16a34a' : min < 10 ? '#ca8a04' : min < 20 ? '#ea580c' : '#dc2626';
    var icon = min < 3 ? '🟢' : min < 10 ? '🟡' : min < 20 ? '🟠' : '🔴';
    el.textContent = icon + ' ' + t;
    el.style.color = color;
    el.style.fontWeight = '700';
  });
}

// Intervalo global — se crea UNA sola vez y nunca se borra
if (!window._globalTimerInterval) {
  window._globalTimerInterval = setInterval(_updateTimers, 1000);
}

function startTimerUpdater() {
  _updateTimers(); // actualización inmediata
}

// ===== SONIDO DE ALERTA =====
let _audioCtx = null;
function initAudio() {
  if (_audioCtx) return;
  try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}
function playAlertSound() {
  try {
    initAudio();
    if (!_audioCtx) return;
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    // Chime ascendente: Do-Mi-Sol-Do (C mayor)
    const freqs = [523, 659, 784, 1047];
    freqs.forEach((freq, i) => {
      const osc  = _audioCtx.createOscillator();
      const gain = _audioCtx.createGain();
      osc.connect(gain); gain.connect(_audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = _audioCtx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.22, t0 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.11);
      osc.start(t0); osc.stop(t0 + 0.13);
    });
  } catch(e) { /* audio no disponible */ }
}

function showToast(msg) {
  const t = document.getElementById('toastAlert');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

function switchTab(el, tabId) {
  el.closest('.tab-bar').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  el.closest('.page').querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
}

function closePopup() {
  document.getElementById('popupAgendar').classList.remove('open');
}

// ===== MODAL DE CONFIRMACIÓN GENÉRICO =====
let _confirmAccionOnOk = null;
let _confirmAccionOnCancel = null;

function abrirConfirmAccion(titulo, mensaje, onOk, onCancel) {
  document.getElementById('confirmAccionTitulo').textContent = titulo;
  document.getElementById('confirmAccionMensaje').textContent = mensaje;
  _confirmAccionOnOk = onOk;
  _confirmAccionOnCancel = onCancel || null;
  document.getElementById('popupConfirmAccion').classList.add('open');
}

function cerrarConfirmAccion(confirmado) {
  document.getElementById('popupConfirmAccion').classList.remove('open');
  const ok = _confirmAccionOnOk, cancel = _confirmAccionOnCancel;
  _confirmAccionOnOk = null; _confirmAccionOnCancel = null;
  if (confirmado && ok) ok();
  if (!confirmado && cancel) cancel();
}

// ===== COPIAR INFO DE CONSULTA =====

function buildCopyText(consulta, paciente, extras) {
  const f = v => (v && String(v).trim()) ? String(v).trim() : '[POR LLENAR]';
  const nivelMap = { 1: 'Leve', 2: 'Medio', 3: 'Grave' };
  const nombre = [paciente.nombre, paciente.apellidos].filter(Boolean).join(' ').trim();
  const ts = consulta.created_at;
  const fecha = ts
    ? new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts) ? ts : ts + 'Z')
        .toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '[POR LLENAR]';
  const nivel = consulta.nivel_sintomas ? (nivelMap[consulta.nivel_sintomas] || String(consulta.nivel_sintomas)) : '';

  return [
    '=== INFORMACIÓN DE CONSULTA ===',
    '',
    '── PACIENTE ──',
    `Nombre:           ${f(nombre)}`,
    `Cédula:           ${f(paciente.cedula)}`,
    `Teléfono:         ${f(paciente.telefono)}`,
    `Fecha nacimiento: ${f(paciente.fecha_nacimiento)}`,
    `Sexo:             ${f(paciente.sexo)}`,
    `Empresa:          ${f(paciente.clientes_b2b?.nombre_empresa)}`,
    '',
    '── CONSULTA ──',
    `Fecha:            ${fecha}`,
    `Estado:           ${f(consulta.estado)}`,
    `Nivel síntomas:   ${f(nivel)}`,
    `Síntomas:         ${f(consulta.sintomas_descripcion)}`,
    `Diagnóstico:      ${f(extras.diagnostico)}`,
    `Notas clínicas:   ${f(extras.notas)}`,
    `Indicaciones:     ${f(extras.indicaciones)}`,
  ].join('\n');
}

function copiarInfoConsulta() {
  const consulta = window.currentConsultaData || {};
  const paciente = window.currentPacienteData || {};
  const extras = {
    diagnostico: document.getElementById('recetaDiagnostico')?.value?.trim() || '',
    notas: document.getElementById('recetaNotas')?.value?.trim() || '',
    indicaciones: document.getElementById('recetaIndicaciones')?.value?.trim() || '',
  };

  const nombre = [paciente.nombre, paciente.apellidos].filter(Boolean).join(' ').trim();
  const emptyFields = [];
  if (!nombre) emptyFields.push({ key: 'nombre', label: 'Nombre completo' });
  if (!(paciente.cedula || '').trim()) emptyFields.push({ key: 'cedula', label: 'Cédula' });
  if (!(paciente.telefono || '').trim()) emptyFields.push({ key: 'telefono', label: 'Teléfono' });
  if (!(consulta.sintomas_descripcion || '').trim()) emptyFields.push({ key: 'sintomas', label: 'Síntomas' });

  if (emptyFields.length > 0) {
    _showCopyForm(emptyFields, consulta, paciente, extras);
  } else {
    _doCopy(consulta, paciente, extras);
  }
}

function _showCopyForm(emptyFields, consulta, paciente, extras) {
  const panel = document.getElementById('copyInfoPanel');
  if (!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="font-size:12px;font-weight:600;color:#1d4ed8;margin-bottom:8px">
      ${emptyFields.length} campo(s) vacío(s) — complétalos o ignóralos:
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:10px">
      ${emptyFields.map(f => `
        <div>
          <label style="font-size:11px;color:#555;font-weight:600">${f.label}</label>
          <input type="text" id="copyField_${f.key}" class="form-control"
            style="margin-top:2px;font-size:13px;padding:5px 8px" placeholder="${f.label}..." />
        </div>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="_copyFromForm()">📋 Copiar ahora</button>
      <button class="btn btn-sm" onclick="_skipCopyForm()">Omitir vacíos</button>
    </div>
  `;
  window._copyInfoCtx = { emptyFields, consulta, paciente, extras };
}

function _copyFromForm() {
  const ctx = window._copyInfoCtx || {};
  const paciente = { ...(ctx.paciente || {}) };
  const consulta = { ...(ctx.consulta || {}) };
  (ctx.emptyFields || []).forEach(f => {
    const val = (document.getElementById('copyField_' + f.key)?.value || '').trim();
    if (!val) return;
    if (f.key === 'nombre') {
      const parts = val.split(/\s+/);
      paciente.nombre = parts[0] || paciente.nombre;
      paciente.apellidos = parts.slice(1).join(' ') || paciente.apellidos;
    } else if (f.key === 'cedula') {
      paciente.cedula = val;
    } else if (f.key === 'telefono') {
      paciente.telefono = val;
    } else if (f.key === 'sintomas') {
      consulta.sintomas_descripcion = val;
    }
  });
  _doCopy(consulta, paciente, ctx.extras || {});
}

function _skipCopyForm() {
  const ctx = window._copyInfoCtx || {};
  _doCopy(ctx.consulta || {}, ctx.paciente || {}, ctx.extras || {});
}

async function _doCopy(consulta, paciente, extras) {
  const panel = document.getElementById('copyInfoPanel');
  if (panel) panel.style.display = 'none';
  window._copyInfoCtx = null;

  const text = buildCopyText(consulta, paciente, extras);
  try {
    await navigator.clipboard.writeText(text);
    _showCopiado();
  } catch {
    showToast('❌ No se pudo acceder al portapapeles');
  }
}

function _showCopiado() {
  const btn = document.getElementById('btnCopiarInfo');
  if (!btn) return;
  const prev = btn.innerHTML;
  btn.innerHTML = '✓ ¡Copiado!';
  btn.style.cssText += ';background:#dcfce7;color:#16a34a;border-color:#bbf7d0';
  setTimeout(() => {
    btn.innerHTML = prev;
    btn.style.background = '';
    btn.style.color = '';
    btn.style.borderColor = '';
  }, 2000);
}
