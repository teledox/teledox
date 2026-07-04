-- Corre esto primero en el SQL Editor de Supabase para confirmar cuáles de
-- las 3 tablas del fix de RLS realmente existen en esta base de datos.
SELECT
  t.tabla,
  to_regclass('public.' || t.tabla) IS NOT NULL AS existe
FROM unnest(ARRAY['mensajes_consulta','enlaces_teleconsulta','auditoria']) AS t(tabla);
