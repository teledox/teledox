// ═══════════════════════════════════════════════════════
//  Supabase Realtime + Polling de respaldo
//  Actualización en tiempo real de todas las vistas
// ═══════════════════════════════════════════════════════

let _rtChannels      = [];
let _rtPollingTimer  = null;
let _rtReconnTimer   = null;
let _rtConectado     = false;

function _pageActive(id) {
  return document.getElementById(`page-${id}`)?.classList.contains('active');
}

// ── Refrescar la página activa en este momento ────────────────────────────
function _refreshActivePage() {
  if (_pageActive('dashboard'))         loadDashboard();
  if (_pageActive('consultas'))         loadConsultas();
  if (_pageActive('alertas'))           loadAlertasServicio();
  if (_pageActive('operador'))          loadNotificaciones();
  if (_pageActive('pacientes'))         loadPacientes();
  if (_pageActive('metricas'))          loadMetricas();
  if (_pageActive('facturacion-b2c'))   loadFacturacionB2C();
  if (_pageActive('planillaje-b2b'))    loadPlanillajeB2B();
  if (_pageActive('empresas'))          loadEmpresas();
  if (_pageActive('paciente-detalle') && currentPacienteId) {
    showPacienteDetalle(currentPacienteId);
  }
}

// ── Polling de respaldo — refresca la página activa cada 6s ─────────────
function _startPolling() {
  if (_rtPollingTimer) clearInterval(_rtPollingTimer);
  _rtPollingTimer = setInterval(() => {
    _refreshActivePage();
    _actualizarBadgeNotifs();
  }, 6000);
}

// ── Actualizar badge de notificaciones sin rerenderizar la página ─────────
async function _actualizarBadgeNotifs() {
  try {
    const notifs = await supa('GET', 'notificaciones', null, '?leida=eq.false&select=id');
    const count  = (notifs || []).length;
    if (typeof updateNotifBadge === 'function') updateNotifBadge(count);
    lastNotifCount = count;

    // Actualizar badge de alertas (consultas sin médico)
    const sinMedico = await supa('GET', 'consultas', null,
      '?medico_id=is.null&estado=neq.completada&select=id');
    const badge = document.getElementById('alertasBadge');
    if (badge) {
      const n = (sinMedico || []).length;
      badge.textContent    = n;
      badge.style.display  = n > 0 ? 'inline-flex' : 'none';
    }
  } catch (_) {}
}

// ── Canales Realtime ─────────────────────────────────────────────────────
function startRealtime() {
  // Limpiar canales anteriores
  _rtChannels.forEach(ch => { try { supabaseClient.removeChannel(ch); } catch (_) {} });
  _rtChannels = [];
  if (_rtReconnTimer) clearTimeout(_rtReconnTimer);

  // Render inicial del banner
  if (typeof renderAlertasBanner === 'function') renderAlertasBanner();

  // ── consultas ───────────────────────────────────────────────────────────
  const chConsultas = supabaseClient
    .channel('rt-consultas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas' }, () => {
      if (_pageActive('dashboard'))  loadDashboard();
      if (_pageActive('consultas'))  loadConsultas();
      if (_pageActive('alertas'))    loadAlertasServicio();
      if (_pageActive('metricas'))   loadMetricas();
      if (typeof renderAlertasBanner === 'function') renderAlertasBanner();
      _actualizarBadgeNotifs();
    })
    .subscribe(s => {
      if (s === 'SUBSCRIBED') { console.log('RT consultas ✅'); _rtConectado = true; }
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') _scheduleReconnect();
    });
  _rtChannels.push(chConsultas);

  // ── pacientes ───────────────────────────────────────────────────────────
  const chPacientes = supabaseClient
    .channel('rt-pacientes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pacientes' }, () => {
      if (_pageActive('pacientes'))  loadPacientes();
      if (_pageActive('consultas'))  loadConsultas();
      if (_pageActive('dashboard'))  loadDashboard();
      if (_pageActive('paciente-detalle') && currentPacienteId) showPacienteDetalle(currentPacienteId);
    })
    .subscribe(s => {
      if (s === 'SUBSCRIBED') console.log('RT pacientes ✅');
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') _scheduleReconnect();
    });
  _rtChannels.push(chPacientes);

  // ── notificaciones ──────────────────────────────────────────────────────
  const chNotifs = supabaseClient
    .channel('rt-notificaciones')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones' }, (payload) => {
      // Solo sonido/toast en nuevas notificaciones
      if (payload.eventType === 'INSERT') {
        if (typeof playAlertSound === 'function') playAlertSound();
        if (typeof showToast === 'function') showToast(`🔔 ${payload.new?.titulo || 'Nueva notificación'}`);
      }
      _actualizarBadgeNotifs();
      if (document.getElementById('notifPanel')?.classList.contains('open')) loadNotificaciones();
      if (_pageActive('operador')) loadNotificaciones();
    })
    .subscribe(s => {
      if (s === 'SUBSCRIBED') console.log('RT notificaciones ✅');
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') _scheduleReconnect();
    });
  _rtChannels.push(chNotifs);

  // ── usuarios ────────────────────────────────────────────────────────────
  const chUsuarios = supabaseClient
    .channel('rt-usuarios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, () => {
      if (_pageActive('usuarios')) loadUsuarios();
    })
    .subscribe(s => s === 'SUBSCRIBED' && console.log('RT usuarios ✅'));
  _rtChannels.push(chUsuarios);

  // ── recordatorios ───────────────────────────────────────────────────────
  const chRec = supabaseClient
    .channel('rt-recordatorios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recordatorios' }, () => {
      if (_pageActive('paciente-detalle') && currentPacienteId) showPacienteDetalle(currentPacienteId);
    })
    .subscribe();
  _rtChannels.push(chRec);

  // ── clientes_b2b ────────────────────────────────────────────────────────
  const chEmpresas = supabaseClient
    .channel('rt-empresas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes_b2b' }, () => {
      if (_pageActive('empresas')) loadEmpresas();
    })
    .subscribe();
  _rtChannels.push(chEmpresas);

  // Iniciar polling de respaldo
  _startPolling();
}

// ── Reconexión automática si un canal falla ───────────────────────────────
function _scheduleReconnect() {
  if (_rtReconnTimer) return; // ya programado
  console.warn('RT canal caído — reconectando en 5s...');
  _rtReconnTimer = setTimeout(() => {
    _rtReconnTimer = null;
    startRealtime();
  }, 5000);
}

function stopRealtime() {
  _rtChannels.forEach(ch => { try { supabaseClient.removeChannel(ch); } catch (_) {} });
  _rtChannels = [];
  if (_rtPollingTimer) clearInterval(_rtPollingTimer);
  if (_rtReconnTimer)  clearTimeout(_rtReconnTimer);
  console.log('RT desconectado');
}

// ── Sincronización cruzada (usada en otros sitios) ────────────────────────
function syncVistas()              { _refreshActivePage(); }
function syncPacientesConsultas()  {
  if (_pageActive('consultas'))  loadConsultas();
  if (_pageActive('pacientes'))  loadPacientes();
  if (_pageActive('dashboard'))  loadDashboard();
  if (_pageActive('paciente-detalle') && currentPacienteId) showPacienteDetalle(currentPacienteId);
}
