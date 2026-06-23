const { SUPABASE_URL, SUPABASE_KEY } = require('../src/config');
const { query }           = require('../src/services/supabase');
const { enviarLista }     = require('../src/services/whatsapp');
const { obtener, guardar } = require('../src/services/sesiones');

// Valida el JWT de la sesión del panel contra Supabase auth
async function validarJWT(jwt) {
  if (!jwt || jwt === SUPABASE_KEY) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${jwt}` }
  });
  return r.ok;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const jwt = (req.headers.authorization || '').replace('Bearer ', '');
  if (!await validarJWT(jwt)) {
    return res.status(401).json({ error: 'Sesión inválida — inicia sesión en el panel' });
  }

  const { caso_id } = req.body || {};
  if (!caso_id) return res.status(400).json({ error: 'caso_id requerido' });

  const casos = await query('GET', 'tracking_casos', null, `?id=eq.${caso_id}`);
  const c = Array.isArray(casos) && casos[0];
  if (!c)              return res.status(404).json({ error: 'Caso no encontrado' });
  if (!c.activado)     return res.status(400).json({ error: 'El caso no está activado aún' });
  if (c.estado !== 'activo') return res.status(400).json({ error: `El caso está ${c.estado}, no activo` });
  if (!c.telefono)     return res.status(400).json({ error: 'El caso no tiene teléfono registrado' });

  // No interrumpir conversación activa
  const sesion = await obtener(c.telefono);
  if (sesion && sesion.paso !== 0) {
    return res.status(409).json({ error: 'El paciente tiene una conversación activa — termínala antes de probar' });
  }

  const ahora = new Date();
  const saludo = c.paciente_nombre ? `Hola ${c.paciente_nombre}!` : '¡Hola!';

  // Enviar check-in de bienestar inmediatamente
  await enviarLista(
    c.telefono,
    `🩺 *Seguimiento MediLyft*\n\n${saludo} Hora de tu reporte diario.\n\n📋 Diagnóstico: ${c.diagnostico || '—'}\n\n¿Cómo te sientes hoy?`,
    [{ titulo: 'Bienestar de hoy', filas: [
      { id: '1', titulo: 'Muy mal',  descripcion: '😢 Me siento muy mal' },
      { id: '2', titulo: 'Mal',      descripcion: '😞 Me siento mal' },
      { id: '3', titulo: 'Regular',  descripcion: '😐 Más o menos' },
      { id: '4', titulo: 'Bien',     descripcion: '🙂 Me siento bien' },
      { id: '5', titulo: 'Muy bien', descripcion: '😊 Excelente!' },
    ]}],
    'Seleccionar'
  );

  await guardar(c.telefono, 400, {
    tipo:               'bienestar',
    caso_id:            c.id,
    empresa_id:         c.empresa_id,
    paciente_nombre:    c.paciente_nombre,
    diagnostico:        c.diagnostico,
    biometricos_activos: c.biometricos_activos || false,
    altura:             c.altura_cm || null
  }, 'tracking');

  // Segundo envío automático en 2 horas (vía cron)
  const proximo = new Date(ahora.getTime() + 2 * 3600000);
  await query('PATCH', 'tracking_casos', {
    proximo_seguimiento:  proximo.toISOString(),
    meds_recordatorios:   {}           // limpiar dedup para que meds también se reenvíen
  }, `?id=eq.${c.id}`);

  return res.status(200).json({
    ok: true,
    mensaje: `Check-in enviado. Próximo envío automático en ~2h (${proximo.toLocaleString('es-EC')}).`
  });
};
