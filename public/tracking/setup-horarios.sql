-- MediLyft — horarios de operación: columna para activación diferida de consultas
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y Run

-- Almacena la fecha/hora en que la consulta debe pasar de 'pendiente_apertura' → 'pendiente'
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS activada_at TIMESTAMPTZ;
