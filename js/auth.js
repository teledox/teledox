function saveSession(user) { localStorage.setItem('medilyft_user', JSON.stringify(user)); }
function getSession() { try { return JSON.parse(localStorage.getItem('medilyft_user')); } catch { return null; } }
function clearSession() { localStorage.removeItem('medilyft_user'); }

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value.trim();
  const btn = document.getElementById('loginBtn');
  if (!email || !pass) return;
  btn.disabled = true; btn.textContent = 'Verificando...';
  document.getElementById('loginError').style.display = 'none';
  const users = await supa('GET', 'usuarios', null, `?correo=eq.${encodeURIComponent(email)}&password_hash=eq.${encodeURIComponent(pass)}&activo=eq.true`);
  btn.disabled = false; btn.textContent = 'Ingresar';
  if (!users || users.length === 0) { document.getElementById('loginError').style.display = 'block'; return; }
  currentUser = users[0];
  saveSession(currentUser);
  initApp();
}

function doLogout() {
  currentUser = null; clearSession();
  if (notifInterval) clearInterval(notifInterval);
  document.getElementById('loginWrap').style.display = 'flex';
  document.getElementById('appWrap').style.display = 'none';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPass').value = '';
}

function initApp() {
  document.getElementById('loginWrap').style.display = 'none';
  document.getElementById('appWrap').style.display = 'flex';
  document.getElementById('sidebarRole').textContent = currentUser.rol.charAt(0).toUpperCase() + currentUser.rol.slice(1);
  document.getElementById('topAvatar').textContent = ((currentUser.nombre || '?')[0] + (currentUser.apellidos || '?')[0]).toUpperCase();
  document.getElementById('userInfo').textContent = currentUser.nombre + ' ' + currentUser.apellidos;
  buildNav(); loadDashboard(); startNotifPolling();
}
