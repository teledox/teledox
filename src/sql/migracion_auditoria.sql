-- Extraído de src/sql/tablas.sql (líneas 134-193) como migración independiente,
-- para no tener que correr tablas.sql completo (que recrearía/chocaría con las
-- 33+ tablas que ya existen en producción).
--
-- ── Auditoría de datos sensibles (LOPDP) ──────────────────────────────────
-- Registra automáticamente quién (auth.uid()) y cuándo crea/edita/elimina
-- registros en tablas con datos de pacientes. usuario_id queda NULL cuando
-- el cambio lo hace el bot (service role), lo cual permite distinguir
-- cambios del panel (usuarios autenticados) de cambios automáticos del bot.
CREATE TABLE IF NOT EXISTS auditoria (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id       UUID,
  accion           VARCHAR(10) NOT NULL,  -- INSERT | UPDATE | DELETE
  tabla            VARCHAR(50) NOT NULL,
  registro_id      UUID,
  datos_anteriores JSONB,
  datos_nuevos     JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_tabla_registro ON auditoria(tabla, registro_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria(created_at);

CREATE OR REPLACE FUNCTION fn_auditoria() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO auditoria (usuario_id, accion, tabla, registro_id, datos_anteriores, datos_nuevos)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auditoria_pacientes ON pacientes;
CREATE TRIGGER trg_auditoria_pacientes
  AFTER INSERT OR UPDATE OR DELETE ON pacientes
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_consultas ON consultas;
CREATE TRIGGER trg_auditoria_consultas
  AFTER INSERT OR UPDATE OR DELETE ON consultas
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_antecedentes ON antecedentes;
CREATE TRIGGER trg_auditoria_antecedentes
  AFTER INSERT OR UPDATE OR DELETE ON antecedentes
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_documentos_datos ON documentos_datos;
CREATE TRIGGER trg_auditoria_documentos_datos
  AFTER INSERT OR UPDATE OR DELETE ON documentos_datos
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_documentos ON documentos;
CREATE TRIGGER trg_auditoria_documentos
  AFTER INSERT OR UPDATE OR DELETE ON documentos
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
