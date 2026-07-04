const { SUPABASE_URL, SUPABASE_KEY } = require('../config');

// Verifica el JWT contra el endpoint real de Supabase Auth (que valida la firma),
// en vez de solo decodificar el payload en base64 sin comprobar nada — un JWT
// fabricado a mano con un email arbitrario no pasa este chequeo.
async function verificarUsuario(token, rolesPermitidos) {
  if (!token) throw new Error('Sin token de autenticación');

  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!authRes.ok) throw new Error('Sesión inválida — vuelve a iniciar sesión');

  const authUser = await authRes.json().catch(() => ({}));
  const email = authUser?.email;
  if (!email) throw new Error('Token sin email — vuelve a iniciar sesión');

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/usuarios?correo=eq.${encodeURIComponent(email)}&activo=eq.true&select=id,rol,nombre,apellidos`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = await res.json().catch(() => []);
  const u = Array.isArray(rows) ? rows[0] : null;

  if (!u) throw new Error(`Usuario no encontrado: ${email}`);
  if (rolesPermitidos && !rolesPermitidos.includes(u.rol)) {
    throw new Error(`Sin permisos (rol: ${u.rol})`);
  }
  return u;
}

module.exports = { verificarUsuario };
