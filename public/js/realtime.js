// ═══════════════════════════════════════════════════════
//  Supabase Realtime — actualizaciones instantáneas
//  + sincronización cruzada Pacientes ↔ Consultas
// ═══════════════════════════════════════════════════════

let _rtChannels = [];

function _pageActive(id) {
  return document.getElementById(`page-${id}`)?.classList.contains('active');
}

// ── Sincronización cruzada: refresca las secciones abiertas ──────────────
function syncVistas() {
  if (_pageActive('consultas'))         loadConsultas();
  if (_pageActive('pacientes'))         loadPacientes();
  if (_pageActive('dashboard'))         loadDashboard();
  if (_pageActive('alertas'))           loadAlertasServicio();
  if (_pageActive('metricas'))          loadMetricas();
  if (_pageActive('facturacion-b2c'))   loadFacturacionB2C();
  if (_pageActive('planillaje-b2b'))    loadPlanillajeB2B();
  if (_pageActive('operador'))          loadNotificaciones();

  // Si hay un detalle de paciente abierto, refrescarlo también
  if (_pageActive('paciente-detalle') && currentPacienteId) {
    showPacienteDetalle(currentPacienteId);
  }
}

// ── Sincronización específica: pacientes ↔ consultas ─────────────────────
function syncPacientesConsultas() {
  // Refrescar AMBAS secciones simultáneamente aunque solo una esté visible
  if (_pageActive('consultas'))          loadConsultas();
  if (_pageActive('pacientes'))          loadPacientes();
  if (_pageActive('paciente-detalle') && currentPacienteId) {
    showPacienteDetalle(currentPacienteId);
  }
  // Dashboard siempre se actualiza porque muestra resumen de ambas
  if (_pageActive('dashboard'))          loadDashboard();
}

function startRealtime() {
  _rtChannels.forEach(ch => { try { supabaseClient.removeChannel(ch); } catch (_) {} });
  _rtChannels = [];

  // Mostrar el banner global de inmediato al iniciar sesión (sin esperar a abrir el dashboard)
  renderAlertasBanner();

  // ── Consultas → sincroniza con Pacientes automáticamente ───────────────
  const chConsultas = supabaseClient
    .channel('rt-consultas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas' }, () => {
      syncPacientesConsultas();
      renderAlertasBanner();                       // banner global, en cualquier página
      if (_pageActive('alertas'))  loadAlertasServicio();
      if (_pageActive('metricas')) loadMetricas();
    })
    .subscribe(s => s === 'SUBSCRIBED' && console.log('RT consultas ✅'));
  _rtChannels.push(chConsultas);

  // ── Pacientes → sincroniza con Consultas automáticamente ───────────────
  const chPacientes = supabaseClient
    .channel('rt-pacientes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pacientes' }, () => {
      syncPacientesConsultas();
    })
    .subscribe(s => s === 'SUBSCRIBED' && console.log('RT pacientes ✅'));
  _rtChannels.push(chPacientes);

  // ── Notificaciones ─────────────────────────────────────────────────────
  const chNotifs = supabaseClient
    .channel('rt-notificaciones')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, (payload) => {
      playAlertSound();
      showToast(`🔔 ${payload.new?.titulo || 'Nueva notificación'}`);
      updateNotifBadge((parseInt(document.getElementById('notifCount')?.textContent || '0') + 1));
      if (document.getElementById('notifPanel')?.classList.contains('open')) loadNotificaciones();
      if (_pageActive('operador')) loadNotificaciones();
    })
    .subscribe(s => s === 'SUBSCRIBED' && console.log('RT notificaciones ✅'));
  _rtChannels.push(chNotifs);

  // ── Usuarios ───────────────────────────────────────────────────────────
  const chUsuarios = supabaseClient
    .channel('rt-usuarios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, () => {
      if (_pageActive('usuarios')) loadUsuarios();
    })
    .subscribe(s => s === 'SUBSCRIBED' && console.log('RT usuarios ✅'));
  _rtChannels.push(chUsuarios);

  // ── Recordatorios ──────────────────────────────────────────────────────
  const chRec = supabaseClient
    .channel('rt-recordatorios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recordatorios' }, () => {
      if (_pageActive('paciente-detalle') && currentPacienteId) {
        supa('GET', 'recordatorios', null, `?paciente_id=eq.${currentPacienteId}&activo=eq.true`).then(seg => {
          const el = document.getElementById('seguimientoList');
          if (!el) return;
          el.innerHTML = (seg || []).length
            ? (seg || []).map(s => `<div class="detail-item" style="margin-bottom:8px"><div class="detail-label">Medicamento</div><div class="detail-value">${s.medicamento || '—'}</div><div style="font-size:12px;color:#888;margin-top:4px">Cada ${s.frecuencia_horas}h · Hasta: ${new Date(s.fecha_fin).toLocaleDateString('es-EC')}</div></div>`).join('')
            : '<div class="empty-state">Sin seguimientos activos</div>';
        });
      }
    })
    .subscribe();
  _rtChannels.push(chRec);
}

function stopRealtime() {
  _rtChannels.forEach(ch => { try { supabaseClient.removeChannel(ch); } catch (_) {} });
  _rtChannels = [];
  console.log('RT desconectado');
}
