-- La tabla usuarios no tiene columnas 'cedula' ni 'telefono', pero el
-- formulario de alta/edición de usuarios (público y panel admin) las envía
-- y las guarda. Esto hace que crear/editar usuarios falle con:
--   "Could not find the 'cedula' column of 'usuarios' in the schema cache"
--   "Could not find the 'telefono' column of 'usuarios' in the schema cache"
-- Ejecutar manualmente en Supabase (SQL editor) antes de desplegar.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS cedula VARCHAR(20),
  ADD COLUMN IF NOT EXISTS telefono VARCHAR(20);
