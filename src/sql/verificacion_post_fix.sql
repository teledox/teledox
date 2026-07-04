-- Confirma que las 3 tablas existen, tienen RLS habilitado y tienen política.
SELECT
  c.relname                    AS tabla,
  c.relrowsecurity             AS rls_habilitado,
  COUNT(p.policyname)          AS num_politicas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relname IN ('mensajes_consulta','enlaces_teleconsulta','auditoria')
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

-- Confirma que los triggers de auditoría existen y apuntan a fn_auditoria()
SELECT tgname, tgrelid::regclass AS tabla, tgenabled
FROM pg_trigger
WHERE tgname LIKE 'trg_auditoria_%';
