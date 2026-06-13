-- Registro de documentos firmados electrónicamente, usado por la página de
-- verificación pública (public/verificar.html) a la que apunta el QR impreso
-- en cada PDF firmado con .p12 (ver firma-electronica.js → dibujarFirmaElectronicaPDF).
-- Ejecutar manualmente en Supabase (SQL editor) antes de desplegar.

-- No se guarda cédula/RUC: esta página es pública y sin autenticación, y
-- ese dato no debe quedar expuesto a quien escanee el QR.
CREATE TABLE IF NOT EXISTS documentos_firmados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID REFERENCES usuarios(id),
  titular         TEXT,
  tipo_documento  TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mismo criterio que el resto de tablas nuevas: el backend (api/registrar-firma,
-- api/verificar-firma) accede con la clave de servicio (sin políticas RLS),
-- así que se desactiva aquí también para evitar
-- "new row violates row-level security policy".
ALTER TABLE documentos_firmados DISABLE ROW LEVEL SECURITY;
