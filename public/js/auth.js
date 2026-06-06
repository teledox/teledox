function showAuthView(view) {
  document.getElementById('loginView').style.display = view === 'login' ? 'block' : 'none';
  document.getElementById('registerView').style.display = view === 'register' ? 'block' : 'none';
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('registerError').style.display = 'none';
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value.trim();
  const btn = document.getElementById('loginBtn');
  if (!email || !pass) return;
  btn.disabled = true; btn.textContent = 'Verificando...';
  document.getElementById('loginError').style.display = 'none';

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Ingresar';
  if (error) { document.getElementById('loginError').style.display = 'block'; return; }

  const users = await supa('GET', 'usuarios', null, `?correo=eq.${encodeURIComponent(email)}&activo=eq.true`);
  if (!users || users.length === 0) {
    document.getElementById('loginError').textContent = 'Usuario inactivo o sin perfil configurado.';
    document.getElementById('loginError').style.display = 'block';
    await supabaseClient.auth.signOut();
    return;
  }
  currentUser = users[0];
  initApp();
}

async function doRegister() {
  const nombre = document.getElementById('regNombre').value.trim();
  const apellidos = document.getElementById('regApellidos').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass = document.getElementById('regPass').value.trim();
  const esp = document.getElementById('regEsp').value.trim();
  const reg = document.getElementById('regNumero').value.trim();
  const btn = document.getElementById('registerBtn');

  if (!nombre || !apellidos || !email || !pass) {
    document.getElementById('registerError').textContent = 'Complete todos los campos obligatorios.';
    document.getElementById('registerError').style.display = 'block';
    return;
  }
  if (pass.length < 6) {
    document.getElementById('registerError').textContent = 'La contraseña debe tener al menos 6 caracteres.';
    document.getElementById('registerError').style.display = 'block';
    return;
  }

  btn.disabled = true; btn.textContent = 'Creando cuenta...';
  document.getElementById('registerError').style.display = 'none';

  const { data, error } = await supabaseClient.auth.signUp({ email, password: pass });
  if (error) {
    btn.disabled = false; btn.textContent = 'Crear cuenta';
    document.getElementById('registerError').textContent = error.message === 'User already registered' ? 'Este correo ya tiene una cuenta.' : error.message;
    document.getElementById('registerError').style.display = 'block';
    return;
  }

  const perfil = await supa('POST', 'usuarios', {
    id: data.user.id,
    nombre, apellidos, correo: email,
    rol: 'medico',
    especialidad: esp || null,
    numero_registro: reg || null,
    activo: true
  });

  btn.disabled = false; btn.textContent = 'Crear cuenta';
  if (!perfil || perfil.error) {
    document.getElementById('registerError').textContent = 'Cuenta creada pero error al guardar perfil. Contacte al administrador.';
    document.getElementById('registerError').style.display = 'block';
    return;
  }

  currentUser = perfil[0] || perfil;
  initApp();
}

async function doLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  if (notifInterval) clearInterval(notifInterval);
  document.getElementById('loginWrap').style.display = 'flex';
  document.getElementById('appWrap').style.display = 'none';
  showAuthView('login');
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPass').value = '';
}

function initApp() {
  document.getElementById('loginWrap').style.display = 'none';
  document.getElementById('appWrap').style.display = 'flex';
  document.getElementById('sidebarRole').textContent = currentUser.rol.charAt(0).toUpperCase() + currentUser.rol.slice(1);
  document.getElementById('topAvatar').textContent = ((currentUser.nombre || '?')[0] + (currentUser.apellidos || '?')[0]).toUpperCase();
  document.getElementById('userInfo').textContent = currentUser.nombre + ' ' + currentUser.apellidos;
  buildNav(); loadDashboard(); startNotifPolling(); startTimerUpdater();
  // Inicializar AudioContext en primer gesto del usuario (política del navegador)
  document.addEventListener('click', initAudio, { once: true });
}
