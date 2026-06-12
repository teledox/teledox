-- Antecedentes médicos del paciente (1 fila por paciente)
CREATE TABLE antecedentes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id   UUID REFERENCES pacientes(id) UNIQUE,
  alergias      TEXT,
  hipertension  TEXT,
  diabetes      TEXT,
  cirugias      TEXT,
  otros         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Documentos generados (historia clínica, recetas subidas por médico, etc.)
CREATE TABLE documentos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id      UUID REFERENCES pacientes(id),
  consulta_id      UUID REFERENCES consultas(id),
  tipo             VARCHAR(100), -- 'historia_clinica', 'receta', 'examen', etc.
  storage_path     VARCHAR(500), -- ruta en Supabase Storage
  enviado_paciente BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Índices útiles
CREATE INDEX idx_documentos_paciente ON documentos(paciente_id);
CREATE INDEX idx_antecedentes_paciente ON antecedentes(paciente_id);

-- Cédulas autorizadas por empresa B2B (empleados con acceso sin pago)
CREATE TABLE empleados_b2b (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID REFERENCES clientes_b2b(id) ON DELETE CASCADE,
  cedula      VARCHAR(20) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, cedula)
);

CREATE INDEX idx_empleados_b2b_cedula ON empleados_b2b(cedula);
CREATE INDEX idx_empleados_b2b_empresa ON empleados_b2b(empresa_id);

-- Codigo de acceso call center por empresa (agregar a tabla existente)
-- ALTER TABLE clientes_b2b ADD COLUMN IF NOT EXISTS codigo_acceso VARCHAR(20) UNIQUE;

-- Datos editables de cada documento por consulta (para que al reabrir una plantilla
-- ya generada aparezca todo lo llenado y solo haya que ajustar/actualizar lo que falte).
-- 'datos' guarda { campos:{id->valor}, radios:{name->valor}, checks:{id|cb#->bool} }.
CREATE TABLE documentos_datos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id UUID NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  paciente_id UUID REFERENCES pacientes(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL, -- receta | certificado | laboratorio | historia | interconsulta
  datos       JSONB NOT NULL DEFAULT '{}'::jsonb,
  medico_id   UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (consulta_id, tipo)
);

CREATE INDEX idx_documentos_datos_consulta ON documentos_datos(consulta_id);

-- Sexo del paciente (M/F) — se infiere del nombre al registrar y es editable en el panel
-- ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sexo VARCHAR(1);

-- ── Clasificación y workflow del panel "Alertas de servicio" ──────────────
-- origen:    'b2b' | 'b2c' | 'seguimiento'   -> columna del panel donde aparece
-- categoria: 'leve' | 'medio' | 'grave'       -> severidad (color/orden)
-- etiqueta:  texto del chip — PAGO, PAGO SEGURO, AFILIADO, EMPLEADO CON CÓDIGO,
--            CRÓNICO, SEGUIMIENTO
-- estado_validacion: solo aplica a origen='seguimiento'
--   NULL/'pendiente' -> tarjeta visible y accionable (Aprobar/Rechazar)
--   'aprobada'  -> médico aprobó, WhatsApp enviado al paciente
--   'rechazada' -> médico rechazó, sin mensaje al paciente
-- ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS origen VARCHAR(20);
-- ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS categoria VARCHAR(20);
-- ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS etiqueta VARCHAR(30);
-- ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS estado_validacion VARCHAR(20);
-- ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS medico_validador_id UUID REFERENCES usuarios(id);
-- CREATE INDEX IF NOT EXISTS idx_notificaciones_seguimiento
--   ON notificaciones(origen, estado_validacion);

-- Trazabilidad: la consulta de seguimiento aprobada queda enlazada a la original
-- y marcada con origen='seguimiento_aprobado' (consultas normales: origen NULL)
-- ALTER TABLE consultas ADD COLUMN IF NOT EXISTS origen VARCHAR(30);
-- ALTER TABLE consultas ADD COLUMN IF NOT EXISTS consulta_seguimiento_de UUID REFERENCES consultas(id);

-- ── Timeline de seguimiento dentro de la ficha de cada consulta ───────────
-- Hoy recordatorios/seguimiento_respuestas no saben a qué consulta pertenecen
-- (recordatorio?.consulta_id siempre era null). Esto los enlaza:
--   recordatorios.consulta_id          -> se llena al crear el recordatorio (receta.js)
--   seguimiento_respuestas.consulta_id -> se copia del recordatorio al enviar el check-in (cron.js)
--   notificaciones.seguimiento_respuesta_id -> enlaza la alerta con el mensaje que la disparó
-- Solo aplica hacia adelante: recordatorios/respuestas viejos quedan en NULL y
-- simplemente no aparecen en el timeline de su consulta (no rompe nada).
-- ALTER TABLE recordatorios ADD COLUMN IF NOT EXISTS consulta_id UUID REFERENCES consultas(id);
-- ALTER TABLE seguimiento_respuestas ADD COLUMN IF NOT EXISTS consulta_id UUID REFERENCES consultas(id);
-- ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS seguimiento_respuesta_id UUID REFERENCES seguimiento_respuestas(id);
-- CREATE INDEX IF NOT EXISTS idx_seguimiento_respuestas_consulta ON seguimiento_respuestas(consulta_id);

-- ── Timestamp real de "Atender" (KPI tiempo de espera) ────────────────────
-- atender-consulta.js intenta guardar atendido_at al asignar médico, pero la
-- columna nunca se creó en consultas -> error "Could not find the 'atendido_at'
-- column of 'consultas' in the schema cache" al presionar Atender.
-- ALTER TABLE consultas ADD COLUMN IF NOT EXISTS atendido_at TIMESTAMP;

-- Horario de atención (Lunes-Viernes 8am-5pm, Sábado-Domingo 9am-12pm, hora Ecuador).
-- Si la consulta se confirma fuera de este horario, inicio_atencion queda en la
-- próxima apertura del consultorio y el cronómetro del panel/alertas no corre hasta
-- entonces (ver src/utils/horarios.js y public/js/utils.js).
-- ALTER TABLE consultas ADD COLUMN IF NOT EXISTS inicio_atencion TIMESTAMP DEFAULT NOW();
-- ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS inicio_atencion TIMESTAMP DEFAULT NOW();

-- Verificación automática de comprobantes de pago (B2C) vía Gemini Vision.
-- Se registra un intento por cada foto enviada, aprobada o no (auditoría).
-- paciente_id/consulta_id solo se llenan si el comprobante fue aprobado.
CREATE TABLE IF NOT EXISTS verificaciones_comprobante (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id       UUID REFERENCES pacientes(id),
  consulta_id       UUID REFERENCES consultas(id),
  telefono          VARCHAR(50),
  storage_path      VARCHAR(500),
  es_comprobante    BOOLEAN,
  captura_completa  BOOLEAN,
  logo_banco_valido BOOLEAN,
  banco             VARCHAR(150),
  monto             NUMERIC,
  monto_esperado    NUMERIC,
  coincide_monto    BOOLEAN,
  fecha_reciente    BOOLEAN,
  score_secundarios NUMERIC,
  aprobado          BOOLEAN,
  fecha_comprobante VARCHAR(100),
  referencia        VARCHAR(150),
  beneficiario      VARCHAR(255),
  observaciones     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verificaciones_paciente ON verificaciones_comprobante(paciente_id);
CREATE INDEX IF NOT EXISTS idx_verificaciones_telefono ON verificaciones_comprobante(telefono);

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
