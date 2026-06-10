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
