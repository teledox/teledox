-- ════════════════════════════════════════════════════════════════════════════
-- RLS BÁSICO — cierra el acceso anónimo directo a la API REST de Supabase.
--
-- PROBLEMA QUE RESUELVE:
-- Las 3 pantallas de navegador (panel principal, /flows, /tracking) llaman a
-- la API REST de Supabase directo desde el JS del cliente, usando la
-- "publishable key" (public/js/config.js, public/flows/index.html,
-- public/tracking/index.html). Esa key es pública por diseño — cualquiera
-- puede verla con "Ver código fuente" del sitio en vivo, sin necesidad de
-- acceso al repo. Ninguna tabla de abajo tiene RLS activado hoy, así que esa
-- key puede leer y escribir CUALQUIER fila de CUALQUIER tabla listada acá,
-- sin pasar por el login — el login de los paneles es solo una puerta de UI,
-- la API de atrás no la respeta.
--
-- QUÉ HACE ESTA MIGRACIÓN (Tier 1 — mínimo viable, bajo riesgo):
-- Activa RLS en cada tabla y agrega UNA política: "cualquier usuario que
-- inició sesión con Supabase Auth (médico/admin/operador) puede hacer
-- cualquier operación". Esto NO distingue todavía entre roles (ej. un
-- 'operador' sigue viendo lo mismo que un 'admin') ni aísla datos entre
-- empresas B2B — eso es el Tier 2, y necesita que confirmes las reglas de
-- negocio exactas antes de escribirlo (quién debe ver qué).
--
-- Lo que SÍ logra el Tier 1, que es lo urgente: un desconocido de internet
-- con la publishable key, SIN loguearse, deja de poder leer o escribir nada.
--
-- LISTA DE TABLAS: verificada el 2026-07-03 directo contra el proyecto real
-- de Supabase (kcoopkkvbkgrnkpksiuh.supabase.co) — no es una lista inferida
-- del repo. 33 tablas en el schema `public`.
--
-- ⚠️ REQUISITO PREVIO — YA HECHO (2026-07-03): el backend (bot de WhatsApp,
-- cron.js, y todos los api/*.js) usaba la MISMA llave publishable que el
-- navegador para SUPABASE_KEY — no una llave secreta/service_role de verdad.
-- Se reemplazó el valor de SUPABASE_KEY en Vercel por la llave secreta real
-- y se re-desplegó. Esto es indispensable: la llave secreta es la única que
-- ignora RLS sin necesidad de sesión — el backend nunca inicia sesión con
-- auth.signInWithPassword(), así que sin esa llave especial, la política
-- "solo authenticated" de abajo también habría bloqueado al bot y a los
-- cron jobs. NO corras el resto de este archivo si ese swap no se hizo o no
-- se confirmó que el backend sigue funcionando después del redeploy.
--
-- POR QUÉ ES SEGURO APLICAR ESTO (verificado en el código, no supuesto):
--   1. Con el swap de arriba ya hecho, el backend usa service_role, que
--      SIEMPRE bypassea RLS. Nada del backend se ve afectado.
--   2. Las 3 pantallas de navegador (index.html, flows/index.html,
--      tracking/index.html) exigen login con supabaseClient.auth antes de
--      mostrar nada — nunca deberían estar llamando a estas tablas sin una
--      sesión activa.
--   3. La única página realmente pública (verificar.html, el QR de firma
--      electrónica) NO toca Supabase directo — llama a /api/firma-electronica,
--      que corre en el backend con service_role. No depende de estas políticas.
--
-- CÓMO APLICARLA:
--   1. Confirmar que el backend sigue funcionando con la llave secreta nueva
--      (mandar "hola" al bot de WhatsApp y ver que responda; revisar que un
--      cron reciente en los logs de Vercel no haya fallado).
--   2. Correr esto en el SQL Editor de Supabase, idealmente fuera de horario
--      pico. Si algo se rompe, el rollback está al final del archivo.
--   3. Después de correrlo, abrir los 3 paneles logueado y clickear un poco
--      (ver pacientes, crear una consulta de prueba, etc.) para confirmar que
--      todo sigue funcionando igual que antes.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tabla TEXT;
  tablas TEXT[] := ARRAY[
    'bot_mensajes_procesados','bot_eventos','clientes_b2b','seguimientos',
    'cumplimiento_tratamiento','sesiones_bot','pacientes','usuarios',
    'metricas','recetas','recordatorios','documentos',
    'seguimiento_respuestas','antecedentes','consultas',
    'enfermedades_cronicas','registros_cronicos','facturacion_b2c',
    'planillaje_b2b','cierres_casos','empleados_b2b','documentos_datos',
    'notificaciones','seguimiento_laboratorio',
    'seguimiento_laboratorio_respuestas','verificaciones_comprobante',
    'documentos_firmados','paciente_health_score','tracking_psicosocial',
    'tracking_empresas','tracking_casos','tracking_registros',
    'tracking_biometricos'
  ];
BEGIN
  FOREACH tabla IN ARRAY tablas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tabla);
    -- Política Tier 1: "cualquier usuario logueado puede todo". El rol
    -- `authenticated` lo asigna Supabase automáticamente a cualquier request
    -- que traiga un JWT válido de auth.getSession() — exactamente lo que
    -- mandan los 3 paneles después de hacer login. `anon` (sin sesión) no
    -- matchea ninguna política → cero filas, cero escrituras.
    EXECUTE format(
      'CREATE POLICY "staff_autenticado_acceso_total" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      tabla
    );
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — si algo se rompe después de aplicar esto, correr lo siguiente
-- para volver al estado anterior (RLS desactivado) mientras se investiga:
-- ════════════════════════════════════════════════════════════════════════════
--
-- DO $$
-- DECLARE
--   tabla TEXT;
--   tablas TEXT[] := ARRAY[
--     'bot_mensajes_procesados','bot_eventos','clientes_b2b','seguimientos',
--     'cumplimiento_tratamiento','sesiones_bot','pacientes','usuarios',
--     'metricas','recetas','recordatorios','documentos',
--     'seguimiento_respuestas','antecedentes','consultas',
--     'enfermedades_cronicas','registros_cronicos','facturacion_b2c',
--     'planillaje_b2b','cierres_casos','empleados_b2b','documentos_datos',
--     'notificaciones','seguimiento_laboratorio',
--     'seguimiento_laboratorio_respuestas','verificaciones_comprobante',
--     'documentos_firmados','paciente_health_score','tracking_psicosocial',
--     'tracking_empresas','tracking_casos','tracking_registros',
--     'tracking_biometricos'
--   ];
-- BEGIN
--   FOREACH tabla IN ARRAY tablas LOOP
--     EXECUTE format('DROP POLICY IF EXISTS "staff_autenticado_acceso_total" ON %I;', tabla);
--     EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY;', tabla);
--   END LOOP;
-- END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- TIER 2 (pendiente, necesita definir reglas de negocio antes de escribirlo):
--   • Aislar datos por empresa B2B (que un admin de la Empresa A no vea
--     pacientes/consultas de la Empresa B) usando clientes_b2b.id.
--   • Restringir por rol: ¿un 'operador' debería ver diagnósticos clínicos
--     completos, o solo agendar? ¿Un 'medico' ve todos los pacientes o solo
--     los de sus propias consultas?
--   • Políticas específicas de INSERT/UPDATE/DELETE por tabla en vez de un
--     FOR ALL genérico (ej. que 'operador' no pueda borrar consultas).
-- ════════════════════════════════════════════════════════════════════════════
