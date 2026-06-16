-- Extiende documentos_firmados con metadatos de verificación avanzada.
-- Ejecutar manualmente en Supabase (SQL editor) antes de desplegar.

ALTER TABLE documentos_firmados
  ADD COLUMN IF NOT EXISTS cert_emisor    TEXT,         -- CN del emisor del certificado .p12
  ADD COLUMN IF NOT EXISTS eci_acreditada BOOLEAN DEFAULT false, -- true si el emisor es una ECI acreditada por ARCOTEL
  ADD COLUMN IF NOT EXISTS tsa_token      TEXT,         -- TimeStampResp base64 (RFC 3161, freetsa.org)
  ADD COLUMN IF NOT EXISTS tsa_ts         TIMESTAMPTZ;  -- timestamp del TSA (hora confiable de firma)
