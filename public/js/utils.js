// ===== CRONÓMETRO DE ESPERA =====
function formatElapsedTime(createdAt) {
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2,'0')}s`;
  return `${s}s`;
}

function getTimerColor(createdAt) {
  const min = (Date.now() - new Date(createdAt).getTime()) / 60000;
  if (min < 3)  return '#16a34a';
  if (min < 10) return '#ca8a04';
  if (min < 20) return '#ea580c';
  return '#dc2626';
}

let _timerRunning = false;
let _timerLastTick = 0;

function _tickTimers(now) {
  if (now - _timerLastTick >= 1000) {
    _timerLastTick = now;
    document.querySelectorAll('.alerta-timer[data-created]').forEach(el => {
      const created = el.dataset.created;
      if (!created || created === 'undefined' || created === 'null') return;
      el.textContent = '⏱ ' + formatElapsedTime(created);
      el.style.color = getTimerColor(created);
      el.style.fontWeight = '700';
    });
  }
  requestAnimationFrame(_tickTimers);
}

function startTimerUpdater() {
  // Actualización inmediata al llamar
  document.querySelectorAll('.alerta-timer[data-created]').forEach(el => {
    const created = el.dataset.created;
    if (!created || created === 'undefined' || created === 'null') return;
    el.textContent = '⏱ ' + formatElapsedTime(created);
    el.style.color = getTimerColor(created);
    el.style.fontWeight = '700';
  });
  // Iniciar el loop de rAF solo una vez
  if (!_timerRunning) {
    _timerRunning = true;
    requestAnimationFrame(_tickTimers);
  }
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
