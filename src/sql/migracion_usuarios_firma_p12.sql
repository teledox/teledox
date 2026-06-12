-- La tabla usuarios no tiene columnas 'firma_p12' ni 'firma_p12_info', pero
-- el panel (perfil.js → validarYGuardarP12) y api/guardar-p12.js las envían
-- y las guardan. Esto hace que guardar el certificado falle silenciosamente con:
--   "Could not find the 'firma_p12' column of 'usuarios' in the schema cache"
-- Ejecutar manualmente en Supabase (SQL editor) antes de desplegar.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS firma_p12      TEXT,
  ADD COLUMN IF NOT EXISTS firma_p12_info JSONB;
