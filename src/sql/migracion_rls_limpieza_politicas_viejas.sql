-- ════════════════════════════════════════════════════════════════════════════
-- LIMPIEZA DE POLÍTICAS VIEJAS — corregir por qué el acceso anónimo seguía
-- funcionando después de migracion_rls_basico.sql.
--
-- QUÉ PASÓ: migracion_rls_basico.sql sí activó RLS y creó la política
-- "staff_autenticado_acceso_total" (TO authenticated) en las 33 tablas, tal
-- como se esperaba — confirmado en Supabase → Database → Policies. Pero 14
-- de esas tablas YA TENÍAN políticas previas, creadas antes de esta sesión,
-- que permiten acceso a `public`/`anon` (ej. "allow_all", "portal_select_*").
--
-- Las políticas de Postgres son ADITIVAS: si CUALQUIER política permisiva
-- coincide, el acceso se permite — no importa que además exista una política
-- más restrictiva. Por eso la llave anónima seguía leyendo datos reales en
-- pacientes/consultas/usuarios/etc. después de correr la primera migración:
-- la política vieja "allow_all TO public" seguía activa en paralelo.
--
-- Verificado en el dashboard de Supabase (Database → Policies) el 2026-07-03:
-- ninguna de estas políticas viejas tiene relación con una función activa del
-- código (se buscó "portal" en todo el repo — el único resultado es
-- cronicas-portal.js, que exige login, sin relación con `documentos`). Todo
-- indica que son restos de pruebas o de una versión anterior del proyecto.
--
-- Esta limpieza SOLO elimina las políticas viejas. No toca la política nueva
-- ni desactiva RLS en ninguna tabla.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "allow_all" ON clientes_b2b;
DROP POLICY IF EXISTS "allow_all" ON consultas;
DROP POLICY IF EXISTS "allow_all" ON enfermedades_cronicas;
DROP POLICY IF EXISTS "allow_all" ON metricas;
DROP POLICY IF EXISTS "allow_all" ON notificaciones;
DROP POLICY IF EXISTS "allow_all" ON pacientes;
DROP POLICY IF EXISTS "allow_all" ON recetas;
DROP POLICY IF EXISTS "allow_all" ON recordatorios;
DROP POLICY IF EXISTS "allow_all" ON registros_cronicos;
DROP POLICY IF EXISTS "allow_all" ON seguimiento_respuestas;
DROP POLICY IF EXISTS "allow_all" ON sesiones_bot;
DROP POLICY IF EXISTS "allow_all" ON usuarios;

-- documentos: 3 políticas separadas por operación, todas para `anon`
DROP POLICY IF EXISTS "portal_insert_documentos" ON documentos;
DROP POLICY IF EXISTS "portal_select_documentos" ON documentos;
DROP POLICY IF EXISTS "portal_update_documentos" ON documentos;

-- empleados_b2b: 3 políticas separadas por operación, todas para `public`
DROP POLICY IF EXISTS "allow_delete" ON empleados_b2b;
DROP POLICY IF EXISTS "allow_insert" ON empleados_b2b;
DROP POLICY IF EXISTS "allow_select" ON empleados_b2b;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — si alguna de estas tablas deja de funcionar para algo que SÍ
-- necesitaba acceso anónimo (no debería, pero por si acaso), recrear la
-- política puntual con:
--   CREATE POLICY "allow_all" ON <tabla> FOR ALL TO public USING (true) WITH CHECK (true);
-- (para documentos/empleados_b2b, usar el nombre y comando exactos de arriba)
-- ════════════════════════════════════════════════════════════════════════════
