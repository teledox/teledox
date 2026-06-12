// Banner de "consultas sin médico". Se monta en DOS lugares:
//  - #servicioAlertasBannerDash : dentro del dashboard (posición original)
//  - #servicioAlertasBanner     : global y sticky, para el resto de páginas
// Para no duplicarlo, en el dashboard se muestra solo el de adentro y en las
// demás páginas solo el global (ver actualizarVisibilidadBanner).
let _bannerHtml = '';

function _bannerHtmlDesde(sinMedico) {
  return `
    <div class="alerta-servicio">
      <div class="alerta-titulo">🔴 ${sinMedico.length} consulta${sinMedico.length > 1 ? 's' : ''} sin médico asignado — ¡Se requiere atención!</div>
      ${sinMedico.slice(0, 4).map(c => {
        const p = c.pacientes || {};
        const nivel = c.nivel_sintomas === 3 ? '🔴 Grave' : c.nivel_sintomas === 2 ? '🟡 Medio' : '🟢 Leve';
        return `<div class="alerta-item">
          <div class="alerta-item-info">
            <div class="alerta-item-nombre">${p.nombre || '—'} ${p.apellidos || ''}</div>
            <div class="alerta-item-meta">${nivel} · ${p.clientes_b2b?.nombre_empresa || 'B2C'}</div>
            <span class="alerta-timer" data-created="${c.inicio_atencion || c.created_at}" style="font-size:13px;font-weight:700">⏱ ${formatElapsedTime(c.inicio_atencion || c.created_at)}</span>
          </div>
          <button class="btn-atender-banner" onclick="atenderConsulta('${c.id}',this)">🩺 Atender</button>
        </div>`;
      }).join('')}
      ${sinMedico.length > 4 ? `<div style="text-align:center;padding-top:10px;font-size:12px;opacity:0.9">+ ${sinMedico.length - 4} más — <a href="#" onclick="showPage('alertas');return false;" style="color:white;font-weight:700;text-decoration:underline">Ver todas las alertas</a></div>` : ''}
    </div>`;
}

// Decide cuál de los dos contenedores se ve, según la página activa (evita duplicado)
function actualizarVisibilidadBanner() {
  const onDash = document.getElementById('page-dashboard')?.classList.contains('active');
  const dashEl = document.getElementById('servicioAlertasBannerDash');
  const globalEl = document.getElementById('servicioAlertasBanner');
  if (dashEl)   dashEl.style.display   = (_bannerHtml && onDash)  ? 'block' : 'none';
  if (globalEl) globalEl.style.display = (_bannerHtml && !onDash) ? 'block' : 'none';
}

// Si no se le pasa la lista ya filtrada, la consulta él mismo.
async function renderAlertasBanner(sinMedicoPre) {
  const esStaff = currentUser?.rol === 'medico' || currentUser?.rol === 'admin';
  let sinMedico = esStaff ? sinMedicoPre : [];
  if (esStaff && !sinMedico) {
    const consultas = await supa('GET', 'consultas', null,
      '?medico_id=is.null&estado=neq.completada&select=*,pacientes(nombre,apellidos,clientes_b2b(nombre_empresa))&order=created_at.desc');
    sinMedico = (consultas || []).filter(c => !window._atendiendo?.has(c.id));
  }
  _bannerHtml = (sinMedico && sinMedico.length) ? _bannerHtmlDesde(sinMedico) : '';
  ['servicioAlertasBannerDash', 'servicioAlertasBanner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = _bannerHtml;
  });
  actualizarVisibilidadBanner();
}

async function loadDashboard() {
  const [consultas, pacientes, notifs] = await Promise.all([
    supa('GET', 'consultas', null, '?select=*,pacientes(nombre,apellidos,clientes_b2b(nombre_empresa))&order=created_at.desc'),
    supa('GET', 'pacientes', null, '?select=count'),
    supa('GET', 'notificaciones', null, '?leida=eq.false&order=created_at.desc&limit=5')
  ]);
  const all = consultas || [];
  const pendientes = all.filter(c => c.estado === 'pendiente' && !window._atendiendo?.has(c.id));
  const sinMedico = all.filter(c => !c.medico_id && c.estado !== 'completada' && !window._atendiendo?.has(c.id));
  const hoy = new Date().toDateString();
  const hoyCount = all.filter(c => new Date(c.created_at).toDateString() === hoy).length;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card stat-warning"><div class="stat-label">Consultas pendientes</div><div class="stat-value">${pendientes.length}</div><div class="stat-sub">Por atender</div></div>
    <div class="stat-card"><div class="stat-label">Total pacientes</div><div class="stat-value">${pacientes?.[0]?.count || 0}</div></div>
    <div class="stat-card"><div class="stat-label">Consultas hoy</div><div class="stat-value">${hoyCount}</div></div>
    <div class="stat-card stat-danger"><div class="stat-label">Alertas sin leer</div><div class="stat-value">${(notifs || []).length}</div></div>
  `;

  // === Banner global de consultas sin médico (se renderiza aparte para
  //     que también funcione en realtime sin importar la página activa) ===
  renderAlertasBanner(sinMedico);

  document.getElementById('pendCount').textContent = pendientes.length;
  document.getElementById('pendBody').innerHTML = pendientes.slice(0, 5).map(c => {
    const p = c.pacientes || {}; const n = c.nivel_sintomas;
    return `<tr>
      <td><strong>${p.nombre || '—'} ${p.apellidos || ''}</strong><br><span style="font-size:11px;color:#aaa">${p.clientes_b2b?.nombre_empresa || ''}</span></td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.sintomas_descripcion || '—'}</td>
      <td>${n===3?'<span class="badge badge-red">Grave</span>':n===2?'<span class="badge badge-yellow">Medio</span>':'<span class="badge badge-green">Leve</span>'}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        ${!c.medico_id && (currentUser.rol === 'medico' || currentUser.rol === 'admin') ? `<button class="btn btn-sm btn-atender" onclick="atenderConsulta('${c.id}',this)">🩺 Atender</button>` : ''}
        ${(currentUser.rol === 'operador' || currentUser.rol === 'admin') ? `<button class="btn btn-sm btn-primary" onclick="openAgendar('${c.id}','${c.paciente_id}')">Agendar</button>` : ''}
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:1.5rem">Sin consultas pendientes</td></tr>';

  document.getElementById('recentNotifs').innerHTML = (notifs || []).map(n => `
    <div style="padding:10px 0;border-bottom:1px solid #f5f5f5">
      <div style="font-size:12px;font-weight:600;color:${n.tipo === 'urgente' ? '#dc2626' : '#2563eb'}">${n.tipo === 'urgente' ? '⚠️ Urgente' : '📅 Nueva consulta'}</div>
      <div style="font-size:13px;color:#333;margin-top:2px">${n.titulo}</div>
      <div style="font-size:12px;color:#888">${n.mensaje}</div>
    </div>
  `).join('') || '<div class="empty-state" style="padding:1.5rem">Sin alertas</div>';
}

async function loadAlertasServicio() {
  const el = document.getElementById('alertasServicioList');
  if (!el) return;

  let consultas = await supa('GET', 'consultas', null,
    '?select=*,pacientes(nombre,apellidos,cedula,telefono,correo,lugar_residencia,clientes_b2b(nombre_empresa))&medico_id=is.null&estado=neq.completada&order=nivel_sintomas.desc,created_at.asc') || [];
  consultas = consultas.filter(c => !window._atendiendo?.has(c.id));

  // Etiquetas (PAGO / PAGO SEGURO / AFILIADO / EMPLEADO CON CÓDIGO) por consulta
  let etiquetas = {};
  const ids = consultas.map(c => c.id);
  if (ids.length) {
    const notifs = await supa('GET', 'notificaciones', null,
      `?consulta_id=in.(${ids.join(',')})&select=consulta_id,etiqueta&order=created_at.desc`) || [];
    notifs.forEach(n => { if (n.etiqueta && !etiquetas[n.consulta_id]) etiquetas[n.consulta_id] = n.etiqueta; });
  }

  const consultasB2B = consultas.filter(c => c.pacientes?.clientes_b2b);
  const consultasB2C = consultas.filter(c => !c.pacientes?.clientes_b2b);

  let seguimientos = await supa('GET', 'notificaciones', null,
    '?origen=eq.seguimiento&estado_validacion=eq.pendiente&select=*,pacientes(nombre,apellidos,cedula,telefono,correo,lugar_residencia)&order=created_at.asc') || [];
  const rango = { grave: 0, medio: 1, leve: 2 };
  seguimientos.sort((a, b) => (rango[a.categoria] ?? 3) - (rango[b.categoria] ?? 3));

  // Update badge
  const badge = document.getElementById('alertasBadge');
  const total = consultasB2B.length + consultasB2C.length + seguimientos.length;
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
  }

  const nivelBadge = n => n === 3
    ? '<span class="badge badge-red">🔴 Grave</span>'
    : n === 2 ? '<span class="badge badge-yellow">🟡 Medio</span>'
              : '<span class="badge badge-green">🟢 Leve</span>';

  const catBadge = c => c === 'grave'
    ? '<span class="badge badge-red">🔴 Grave</span>'
    : c === 'medio' ? '<span class="badge badge-yellow">🟡 Medio</span>'
                     : '<span class="badge badge-green">🟢 Leve</span>';

  const tag = etiqueta => etiqueta ? `<span class="alerta-tag">${etiqueta}</span>` : '';

  const datosContacto = p => `
    <div class="alerta-datos">
      📱 ${p.telefono || '—'} &nbsp;·&nbsp; ✉️ ${p.correo || '—'} &nbsp;·&nbsp; 📍 ${p.lugar_residencia || '—'}
    </div>`;

  const cardConsulta = c => {
    const p = c.pacientes || {};
    return `
      <div class="alerta-card">
        <div class="alerta-card-head">
          <div>
            <div class="alerta-nombre">${p.nombre || '—'} ${p.apellidos || ''}</div>
            <div class="alerta-sub">Cédula: ${p.cedula || '—'} ${p.clientes_b2b?.nombre_empresa ? `· ${p.clientes_b2b.nombre_empresa}` : ''}</div>
          </div>
          ${tag(etiquetas[c.id])}
        </div>
        <div class="alerta-sintoma">${c.sintomas_descripcion || '—'}</div>
        ${datosContacto(p)}
        <div class="alerta-card-foot">
          <div style="display:flex;align-items:center;gap:10px">
            ${nivelBadge(c.nivel_sintomas)}
            <span class="alerta-timer" data-created="${c.inicio_atencion || c.created_at}" style="font-size:12px;font-weight:700">${formatElapsedTime(c.inicio_atencion || c.created_at)}</span>
          </div>
          <button class="btn btn-sm btn-atender" onclick="atenderConsulta('${c.id}',this)">🩺 Atender</button>
        </div>
      </div>`;
  };

  const cardSeguimiento = n => {
    const p = n.pacientes || {};
    return `
      <div class="alerta-card">
        <div class="alerta-card-head">
          <div>
            <div class="alerta-nombre">${p.nombre || '—'} ${p.apellidos || ''}</div>
            <div class="alerta-sub">Cédula: ${p.cedula || '—'}</div>
          </div>
          ${tag(n.etiqueta)}
        </div>
        <div class="alerta-sintoma">${n.mensaje || '—'}</div>
        ${datosContacto(p)}
        <div class="alerta-card-foot">
          ${catBadge(n.categoria)}
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm btn-success" onclick="decidirSeguimiento('${n.id}','aprobada',this)">✅ Aprobar</button>
            <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border-color:#fecaca" onclick="decidirSeguimiento('${n.id}','rechazada',this)">❌ Rechazar</button>
          </div>
        </div>
      </div>`;
  };

  const seccion = (titulo, items, renderFn, emptyMsg) => `
    <div class="alertas-section">
      <h3 class="alertas-section-title">${titulo} <span class="alertas-count">${items.length}</span></h3>
      <div class="alertas-list">
        ${items.length ? items.map(renderFn).join('') : `<div class="empty-state">${emptyMsg}</div>`}
      </div>
    </div>`;

  el.innerHTML = `
    <div class="alertas-grid">
      <div class="alertas-col">
        ${seccion('🏢 Consultas B2B', consultasB2B, cardConsulta, '✅ Sin pendientes')}
        ${seccion('👤 Consultas B2C', consultasB2C, cardConsulta, '✅ Sin pendientes')}
      </div>
      <div class="alertas-col">
        ${seccion('🔁 Consultas de seguimiento', seguimientos, cardSeguimiento, '✅ Sin seguimientos pendientes')}
      </div>
    </div>`;

  if (typeof startTimerUpdater === 'function') startTimerUpdater();
}

// Médico aprueba/rechaza una solicitud de seguimiento
async function decidirSeguimiento(notificacionId, decision, btnEl) {
  const card = btnEl?.closest('.alerta-card');
  if (card) card.style.opacity = '0.5';

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const token = session?.access_token;

    const res = await fetch('/api/seguimiento-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, notificacion_id: notificacionId, decision })
    });
    const result = await res.json();

    if (!res.ok) {
      showToast('❌ ' + (result.error || 'Error al procesar'));
      if (card) card.style.opacity = '';
      return;
    }

    showToast(decision === 'aprobada' ? '✅ Solicitud enviada al paciente por WhatsApp' : '🚫 Marcado como rechazado');
    if (card) card.remove();
    loadAlertasServicio();

  } catch (e) {
    showToast('❌ Error de conexión');
    if (card) card.style.opacity = '';
  }
}
