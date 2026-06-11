async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value.trim();
  const btn   = document.getElementById('loginBtn');
  if (!email || !pass) return;
  btn.disabled = true; btn.textContent = 'Ingresando...';
  document.getElementById('loginError').style.display = 'none';

  // Auth + perfil en paralelo para máxima velocidad
  const [authResult] = await Promise.all([
    supabaseClient.auth.signInWithPassword({ email, password: pass }),
  ]);

  if (authResult.error) {
    btn.disabled = false; btn.textContent = 'Ingresar';
    document.getElementById('loginError').style.display = 'block';
    return;
  }

  // Mostrar la app de inmediato con skeleton mientras carga el perfil
  btn.textContent = 'Cargando perfil...';

  const users = await supa('GET', 'usuarios', null,
    `?correo=eq.${encodeURIComponent(email)}&activo=eq.true`);

  btn.disabled = false; btn.textContent = 'Ingresar';

  if (!users || users.length === 0) {
    document.getElementById('loginError').textContent = 'Usuario inactivo o sin perfil configurado.';
    document.getElementById('loginError').style.display = 'block';
    await supabaseClient.auth.signOut();
    return;
  }
  currentUser = users[0];
  initApp();
}

async function doLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  if (notifInterval) clearInterval(notifInterval);
  stopRealtime();
  document.getElementById('loginWrap').style.display = 'flex';
  document.getElementById('appWrap').style.display = 'none';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPass').value = '';
}

function initApp() {
  // Mostrar la app INMEDIATAMENTE (cero espera)
  document.getElementById('loginWrap').style.display = 'none';
  document.getElementById('appWrap').style.display   = 'flex';
  document.getElementById('sidebarRole').textContent =
    currentUser.rol.charAt(0).toUpperCase() + currentUser.rol.slice(1);
  document.getElementById('topAvatar').textContent =
    ((currentUser.nombre || '?')[0] + (currentUser.apellidos || '?')[0]).toUpperCase();
  document.getElementById('userInfo').textContent =
    currentUser.nombre + ' ' + currentUser.apellidos;

  buildNav();

  // Cargar datos en background — no bloquea la render inicial
  requestAnimationFrame(() => {
    loadDashboard();
    startNotifPolling();
    startTimerUpdater();
    startRealtime();
    document.addEventListener('click', initAudio, { once: true });
  });
}
