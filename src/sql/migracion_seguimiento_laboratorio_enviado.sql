-- Agrega columna para registrar si el envío del recordatorio de laboratorio
-- fue exitoso o falló (usado en la tablita de estado del seguimiento).
-- Ejecutar manualmente en Supabase (SQL editor) antes de desplegar.

ALTER TABLE seguimiento_laboratorio_respuestas
  ADD COLUMN enviado BOOLEAN DEFAULT true;
