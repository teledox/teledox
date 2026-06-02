const NAV_ICONS = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  'user-check': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>',
  'bar-chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  'file-text': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'
};

function buildNav() {
  const rol = currentUser.rol;
  const menus = {
    admin: [
      {
        label: 'Principal',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
          { id: 'pacientes', label: 'Pacientes', icon: 'users' },
          { id: 'consultas', label: 'Consultas', icon: 'activity' }
        ]
      },
      {
        label: 'Operación',
        items: [
          { id: 'operador', label: 'Centro de alertas', icon: 'bell' },
          { id: 'empresas', label: 'Empresas B2B', icon: 'briefcase' },
          { id: 'facturacion-b2c', label: 'Facturación B2C', icon: 'dollar' },
          { id: 'planillaje-b2b', label: 'Planillaje B2B', icon: 'file-text' }
        ]
      },
      {
        label: 'Admin',
        items: [
          { id: 'usuarios', label: 'Usuarios', icon: 'user-check' },
          { id: 'metricas', label: 'Métricas KPI', icon: 'bar-chart' },
          { id: 'perfil', label: 'Mi perfil', icon: 'user' }
        ]
      }
    ],
    medico: [
      {
        label: 'Clínico',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
          { id: 'pacientes', label: 'Pacientes', icon: 'users' },
          { id: 'consultas', label: 'Consultas', icon: 'activity' },
          { id: 'perfil', label: 'Mi perfil', icon: 'user' }
        ]
      }
    ],
    operador: [
      {
        label: 'Operación',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
          { id: 'operador', label: 'Centro de alertas', icon: 'bell' },
          { id: 'pacientes', label: 'Pacientes', icon: 'users' },
          { id: 'facturacion-b2c', label: 'Facturación B2C', icon: 'dollar' },
          { id: 'planillaje-b2b', label: 'Planillaje B2B', icon: 'file-text' }
        ]
      }
    ]
  };

  let html = '';
  (menus[rol] || menus.operador).forEach(s => {
    html += `<div class="nav-section">${s.label}</div>`;
    s.items.forEach(i => {
      html += `<div class="nav-item" onclick="showPage('${i.id}',this)" data-page="${i.id}">${NAV_ICONS[i.icon] || ''}${i.label}</div>`;
    });
  });
  document.getElementById('navMenu').innerHTML = html;
}

function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');
  if (el) el.classList.add('active');
  else { const ni = document.querySelector(`[data-page="${id}"]`); if (ni) ni.classList.add('active'); }

  const titles = {
    dashboard: 'Dashboard',
    pacientes: 'Pacientes',
    consultas: 'Consultas',
    operador: 'Centro de alertas',
    usuarios: 'Usuarios',
    metricas: 'Métricas KPI',
    empresas: 'Empresas B2B',
    'paciente-detalle': 'Detalle del paciente',
    perfil: 'Mi perfil',
    receta: 'Emitir receta',
    'facturacion-b2c': 'Facturación B2C — Pago directo',
    'planillaje-b2b': 'Planillaje B2B — Por empresa'
  };
  document.getElementById('pageTitle').textContent = titles[id] || id;

  if (id === 'pacientes') loadPacientes();
  if (id === 'consultas') loadConsultas();
  if (id === 'operador') loadNotificaciones();
  if (id === 'usuarios') loadUsuarios();
  if (id === 'metricas') loadMetricas();
  if (id === 'empresas') loadEmpresas();
  if (id === 'perfil') loadPerfil();
  if (id === 'facturacion-b2c') { initFiltrosB2C(); loadFacturacionB2C(); }
  if (id === 'planillaje-b2b') { initFiltrosB2B(); loadPlanillajeB2B(); }
}
