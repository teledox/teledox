-- La tabla usuarios no tiene columna 'cedula', pero el formulario de
-- alta/edición de usuarios (público y panel admin) la envía y la guarda.
-- Esto hace que crear/editar usuarios falle con:
--   "Could not find the 'cedula' column of 'usuarios' in the schema cache"
-- Ejecutar manualmente en Supabase (SQL editor) antes de desplegar.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS cedula VARCHAR(20);
