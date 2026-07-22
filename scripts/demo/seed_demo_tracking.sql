-- ============================================================
-- SEED DEMO TRACKING — datos de presentación para ventas
-- Tablas: tracking_empresas, tracking_casos, tracking_registros,
--         tracking_biometricos, tracking_psicosocial
-- Para eliminar todo: ejecutar cleanup_demo_tracking.sql
-- Marcador: tracking_empresas.nombre LIKE 'DEMO_%'
-- ============================================================

-- ── 1. EMPRESAS DE TRACKING ──────────────────────────────────────────────

INSERT INTO tracking_empresas (nombre, contacto_email, activo)
VALUES
  ('DEMO_Clínica Santa Lucía',         'admin@clinicasantalucia.com',   true),
  ('DEMO_Hospital Metropolitano',       'seguimiento@hospitalmetro.ec',  true),
  ('DEMO_Centro Médico Quito Norte',    'tracking@cmquitonorte.com',     true)
ON CONFLICT DO NOTHING;

-- ── 2. CASOS DE SEGUIMIENTO ──────────────────────────────────────────────

DO $$
DECLARE
  e1 UUID; e2 UUID; e3 UUID;
  c_ids UUID[] := ARRAY[]::UUID[];
  c_id  UUID;
BEGIN
  SELECT id INTO e1 FROM tracking_empresas WHERE nombre = 'DEMO_Clínica Santa Lucía'       LIMIT 1;
  SELECT id INTO e2 FROM tracking_empresas WHERE nombre = 'DEMO_Hospital Metropolitano'     LIMIT 1;
  SELECT id INTO e3 FROM tracking_empresas WHERE nombre = 'DEMO_Centro Médico Quito Norte'  LIMIT 1;

  -- ── Empresa 1: Clínica Santa Lucía (5 casos) ───────────────────────────

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e1, 'Carlos Espinoza Ramos', 'whatsapp:+593991234003',
     'Hipertensión arterial estadio II + Diabetes tipo 2',
     'Control diario de presión y glucosa. Dieta baja en sodio y azúcares.',
     '[{"nombre":"Losartán","dosis":"50mg c/12h"},{"nombre":"Metformina","dosis":"850mg c/8h"}]',
     24, 90, true, true, 'activo',
     NOW() + INTERVAL '2 hours', NOW() - INTERVAL '45 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e1, 'Patricia Flores Herrera', 'whatsapp:+593991234006',
     'Post-colecistectomía — control de recuperación',
     'Reposo relativo, dieta blanda, herida limpia y seca.',
     '[{"nombre":"Ibuprofeno","dosis":"400mg c/8h"},{"nombre":"Omeprazol","dosis":"20mg/día"}]',
     48, 30, true, false, 'alta',
     NOW() + INTERVAL '1 day', NOW() - INTERVAL '32 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e1, 'Roberto Cárdenas Mora', 'whatsapp:+593991234005',
     'EPOC estadio II + Hipertensión',
     'Broncodilatador de larga acción, control semanal de saturación.',
     '[{"nombre":"Formoterol","dosis":"12mcg c/12h"},{"nombre":"Enalapril","dosis":"10mg/día"}]',
     24, NULL, true, true, 'alerta',
     NOW() - INTERVAL '3 hours', NOW() - INTERVAL '60 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e1, 'Ana Lucía Muñoz Paredes', 'whatsapp:+593991234010',
     'Trastorno de ansiedad generalizada',
     'Psicoterapia cognitivo-conductual + medicación.',
     '[{"nombre":"Escitalopram","dosis":"10mg/día"}]',
     24, 60, true, false, 'activo',
     NOW() + INTERVAL '4 hours', NOW() - INTERVAL '20 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e1, 'Hernán Delgado Pozo', 'whatsapp:+593991234015',
     'Diabetes tipo 2 descompensada + IRC leve',
     'Insulina basal, control estricto de glucosa, dieta renal.',
     '[{"nombre":"Insulina Glargina","dosis":"20 UI nocturnas"},{"nombre":"Furosemida","dosis":"20mg/día"}]',
     12, NULL, true, true, 'alerta',
     NOW() - INTERVAL '1 hour', NOW() - INTERVAL '55 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  -- ── Empresa 2: Hospital Metropolitano (5 casos) ────────────────────────

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e2, 'Eduardo Montoya Lara', 'whatsapp:+593992345001',
     'Faringitis bacteriana recurrente',
     'Antibioticoterapia completa 7 días. Reposo e hidratación.',
     '[{"nombre":"Amoxicilina","dosis":"500mg c/8h"}]',
     24, 7, true, false, 'alta',
     NOW() + INTERVAL '6 hours', NOW() - INTERVAL '8 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e2, 'Rodrigo Holguín Torres', 'whatsapp:+593992345003',
     'Artritis reumatoide — brote activo',
     'Metotrexato semanal + prednisona de mantenimiento.',
     '[{"nombre":"Metotrexato","dosis":"15mg semanal"},{"nombre":"Prednisona","dosis":"5mg/día"}]',
     24, NULL, true, true, 'activo',
     NOW() + INTERVAL '3 hours', NOW() - INTERVAL '40 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e2, 'Fernanda Cevallos Abad', 'whatsapp:+593992345002',
     'Migraña crónica — prevención',
     'Topiramato preventivo diario + Sumatriptán en crisis.',
     '[{"nombre":"Topiramato","dosis":"50mg/día"},{"nombre":"Sumatriptán","dosis":"50mg s/n"}]',
     48, 90, true, false, 'activo',
     NOW() + INTERVAL '12 hours', NOW() - INTERVAL '25 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e2, 'Gonzalo Bravo Solano', 'whatsapp:+593992345005',
     'Gota crónica + Hipertensión',
     'Alopurinol para reducción de ácido úrico, dieta baja en purinas.',
     '[{"nombre":"Alopurinol","dosis":"300mg/día"},{"nombre":"Losartán","dosis":"50mg/día"}]',
     24, NULL, true, true, 'derivado',
     NOW() + INTERVAL '8 hours', NOW() - INTERVAL '35 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e2, 'Natalia Intriago Vélez', 'whatsapp:+593992345006',
     'Depresión moderada + Hipotiroidismo',
     'Antidepresivo + levotiroxina. Control mensual de TSH.',
     '[{"nombre":"Sertralina","dosis":"50mg/día"},{"nombre":"Levotiroxina","dosis":"75mcg/día"}]',
     24, 120, true, false, 'activo',
     NOW() + INTERVAL '5 hours', NOW() - INTERVAL '15 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  -- ── Empresa 3: Centro Médico Quito Norte (3 casos) ─────────────────────

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e3, 'Tomás Herrera Ayala', 'whatsapp:+593998001001',
     'Gastroenteritis aguda — seguimiento hidratación',
     'Suero oral c/2h, dieta blanda progresiva.',
     '[{"nombre":"Sales de rehidratación","dosis":"c/2h"}]',
     12, 5, true, false, 'activo',
     NOW() + INTERVAL '1 hour', NOW() - INTERVAL '2 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e3, 'Mariana Salinas Bermeo', 'whatsapp:+593998001004',
     'Diabetes tipo 1 — control glucémico',
     'Insulina basal-bolo. Automonitoreo c/8h.',
     '[{"nombre":"Insulina Aspart","dosis":"según glucemia"},{"nombre":"Insulina Glargina","dosis":"18 UI nocturnas"}]',
     8, NULL, true, true, 'activo',
     NOW() + INTERVAL '2 hours', NOW() - INTERVAL '50 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

  INSERT INTO tracking_casos (empresa_id, paciente_nombre, telefono, diagnostico, tratamiento,
    medicamentos, frecuencia_horas, duracion_dias, activado, biometricos_activos,
    estado, proximo_seguimiento, created_at)
  VALUES
    (e3, 'Jorge Aguirre Pazmiño', 'whatsapp:+593998001005',
     'Taquicardia supraventricular + Ansiedad',
     'Bisoprolol para control de FC. Manejo de ansiedad.',
     '[{"nombre":"Bisoprolol","dosis":"2.5mg/día"}]',
     24, 30, true, false, 'inactivo',
     NOW() + INTERVAL '24 hours', NOW() - INTERVAL '30 days')
  RETURNING id INTO c_id; c_ids := c_ids || c_id;

END $$;

-- ── 3. REGISTROS DE CHECK-IN (historial) ─────────────────────────────────
-- Generamos ~20 registros por caso activo/alerta, menos para alta/inactivo

DO $$
DECLARE
  caso RECORD;
  i    INTEGER;
  dias_atras INTEGER;
  nivel INTEGER;
  bw_val TEXT;
  med_val TEXT;
  resp JSONB;
BEGIN
  FOR caso IN
    SELECT tc.id, tc.estado, tc.frecuencia_horas,
           EXTRACT(EPOCH FROM (NOW() - tc.created_at))/86400 AS antiguedad_dias
    FROM tracking_casos tc
    JOIN tracking_empresas te ON te.id = tc.empresa_id
    WHERE te.nombre LIKE 'DEMO_%'
  LOOP
    -- Número de registros según estado
    DECLARE
      n_registros INTEGER := CASE caso.estado
        WHEN 'activo'   THEN 20
        WHEN 'alerta'   THEN 18
        WHEN 'alta'     THEN 8
        WHEN 'derivado' THEN 12
        ELSE 5
      END;
    BEGIN
      FOR i IN 1..n_registros LOOP
        dias_atras := n_registros - i;

        -- nivel_alerta: casos 'alerta' tienen más nivel 2-3 al inicio, mejoran
        nivel := CASE
          WHEN caso.estado = 'alerta' AND i <= 5 THEN
            CASE WHEN random() < 0.6 THEN 3 ELSE 2 END
          WHEN caso.estado = 'alerta' AND i > 5 THEN
            CASE WHEN random() < 0.4 THEN 2 ELSE 1 END
          WHEN caso.estado = 'derivado' THEN
            CASE WHEN random() < 0.3 THEN 2 ELSE 1 END
          ELSE
            CASE WHEN random() < 0.15 THEN 2
                 WHEN random() < 0.05 THEN 3
                 ELSE 1 END
        END;

        bw_val := CASE nivel
          WHEN 3 THEN CASE WHEN random() < 0.5 THEN '1' ELSE '2' END
          WHEN 2 THEN CASE WHEN random() < 0.5 THEN '2' ELSE '3' END
          ELSE        CASE WHEN random() < 0.5 THEN '4' ELSE '5' END
        END;

        med_val := CASE WHEN random() < 0.85 THEN '1' ELSE '2' END;

        resp := jsonb_build_object('bienestar', bw_val, 'medicacion', med_val);

        INSERT INTO tracking_registros (caso_id, respuestas, nivel_alerta, created_at)
        VALUES (
          caso.id,
          resp,
          nivel,
          NOW() - (dias_atras || ' days')::INTERVAL - (random() * INTERVAL '4 hours')
        );
      END LOOP;
    END;
  END LOOP;
END $$;

-- ── 4. REGISTROS BIOMÉTRICOS ──────────────────────────────────────────────
-- Solo para los casos con biometricos_activos = true

DO $$
DECLARE
  caso RECORD;
  i    INTEGER;
  n_bio INTEGER;
  sis INTEGER; dia INTEGER; glu INTEGER; col INTEGER;
  pes DECIMAL; sc INTEGER; et TEXT;
BEGIN
  FOR caso IN
    SELECT tc.id, tc.estado, tc.diagnostico
    FROM tracking_casos tc
    JOIN tracking_empresas te ON te.id = tc.empresa_id
    WHERE te.nombre LIKE 'DEMO_%' AND tc.biometricos_activos = true
  LOOP
    n_bio := CASE caso.estado WHEN 'alta' THEN 3 ELSE 7 END;

    FOR i IN 1..n_bio LOOP
      -- Valores según diagnóstico para que sean realistas
      sis := CASE
        WHEN caso.diagnostico ILIKE '%hipertensión%' OR caso.diagnostico ILIKE '%HTA%' OR caso.diagnostico ILIKE '%EPOC%' THEN
          CASE caso.estado WHEN 'alerta' THEN 155 + (random()*30)::INT
                           ELSE 130 + (random()*20)::INT END
        ELSE 110 + (random()*20)::INT
      END;
      dia := CASE WHEN sis > 140 THEN 90 + (random()*15)::INT
                  WHEN sis > 130 THEN 80 + (random()*12)::INT
                  ELSE 65 + (random()*15)::INT END;

      glu := CASE
        WHEN caso.diagnostico ILIKE '%diabetes%' THEN
          CASE caso.estado WHEN 'alerta' THEN 220 + (random()*80)::INT
                           ELSE 130 + (random()*60)::INT END
        ELSE 80 + (random()*30)::INT
      END;

      col := CASE
        WHEN caso.diagnostico ILIKE '%artritis%' OR caso.diagnostico ILIKE '%gota%' THEN 210 + (random()*50)::INT
        ELSE 160 + (random()*40)::INT
      END;

      pes := CASE
        WHEN caso.diagnostico ILIKE '%diabetes%' THEN (75 + random()*20)::DECIMAL(5,2)
        ELSE (60 + random()*25)::DECIMAL(5,2)
      END;

      -- Score: 100 - penalizaciones
      sc := GREATEST(20, 100
        - CASE WHEN sis > 150 THEN 25 WHEN sis > 140 THEN 15 WHEN sis > 130 THEN 5 ELSE 0 END
        - CASE WHEN glu > 250 THEN 30 WHEN glu > 180 THEN 20 WHEN glu > 130 THEN 10 ELSE 0 END
        - CASE WHEN col > 240 THEN 15 WHEN col > 200 THEN 5 ELSE 0 END
        - (random()*10)::INT
      );

      et := CASE WHEN sc >= 70 THEN 'controlado' WHEN sc >= 45 THEN 'en_riesgo' ELSE 'alerta' END;

      INSERT INTO tracking_biometricos
        (caso_id, presion_sistolica, presion_diastolica, glucosa, colesterol, peso, score_calculado, etiqueta, created_at)
      VALUES (
        caso.id, sis, dia, glu, col, pes, sc, et,
        NOW() - ((n_bio - i) || ' days')::INTERVAL - (random() * INTERVAL '3 hours')
      );
    END LOOP;
  END LOOP;
END $$;

-- ── 5. EVALUACIONES PSICOSOCIALES ────────────────────────────────────────

DO $$
DECLARE
  emp RECORD;
  i   INTEGER;
  carga INT; auto INT; apoyo INT; rel INT; dp INT; global INT;
BEGIN
  FOR emp IN
    SELECT id FROM tracking_empresas WHERE nombre LIKE 'DEMO_%'
  LOOP
    -- 15–20 evaluaciones distribuidas en los últimos 3 meses
    FOR i IN 1..18 LOOP
      carga  := 20 + (random()*70)::INT;
      auto   := 30 + (random()*60)::INT;
      apoyo  := 25 + (random()*65)::INT;
      rel    := 20 + (random()*70)::INT;
      dp     := 30 + (random()*60)::INT;
      global := ((carga + auto + apoyo + rel + dp) / 5.0)::INT;

      INSERT INTO tracking_psicosocial
        (empresa_id, dim_carga, dim_autonomia, dim_apoyo, dim_relaciones, dim_doble_pres, score_global, created_at)
      VALUES (
        emp.id, carga, auto, apoyo, rel, dp, global,
        NOW() - ((90 - i * 4) || ' days')::INTERVAL - (random() * INTERVAL '5 days')
      );
    END LOOP;
  END LOOP;
END $$;

-- ── 4b. BIOMÉTRICOS DE SHOWCASE (datos precisos para el gráfico) ─────────
-- Estos registros son los MÁS RECIENTES de cada paciente (últimos 7 días)
-- y reemplazan el azar en el chart. created_at en orden ascendente = el
-- chart muestra la curva exacta de izquierda (día 7) a derecha (hoy).
--
-- Carlos Espinoza: RECUPERACIÓN — entra en crisis, el tratamiento responde
-- Hernán Delgado:  DETERIORO ACTIVO — justifica intervención urgente

DO $$
DECLARE
  c_carlos UUID;
  c_hernan UUID;
BEGIN
  SELECT tc.id INTO c_carlos
  FROM tracking_casos tc
  JOIN tracking_empresas te ON te.id = tc.empresa_id
  WHERE te.nombre = 'DEMO_Clínica Santa Lucía'
    AND tc.paciente_nombre = 'Carlos Espinoza Ramos'
  LIMIT 1;

  SELECT tc.id INTO c_hernan
  FROM tracking_casos tc
  JOIN tracking_empresas te ON te.id = tc.empresa_id
  WHERE te.nombre = 'DEMO_Clínica Santa Lucía'
    AND tc.paciente_nombre = 'Hernán Delgado Pozo'
  LIMIT 1;

  -- ── Carlos: de alerta → controlado (recuperación en 7 días) ─────────────
  --   día 7   día 6   día 5   día 4   día 3   día 2   hoy
  --    35      42      51      60      68      75      84     (score)
  --   ROJO   AMARI  AMARI   AMARI   AMARI   VERDE   VERDE

  IF c_carlos IS NOT NULL THEN
    INSERT INTO tracking_biometricos
      (caso_id, presion_sistolica, presion_diastolica, glucosa, colesterol, peso, score_calculado, etiqueta, created_at)
    VALUES
      (c_carlos, 178, 112, 285, 230, 87.5,  35, 'alerta',     NOW() - INTERVAL '7 days'),
      (c_carlos, 168, 106, 258, 228, 87.2,  42, 'en_riesgo',  NOW() - INTERVAL '6 days'),
      (c_carlos, 158, 100, 232, 225, 86.8,  51, 'en_riesgo',  NOW() - INTERVAL '5 days'),
      (c_carlos, 150,  96, 210, 222, 86.5,  60, 'en_riesgo',  NOW() - INTERVAL '4 days'),
      (c_carlos, 144,  92, 188, 218, 86.1,  68, 'en_riesgo',  NOW() - INTERVAL '3 days'),
      (c_carlos, 136,  87, 162, 215, 85.8,  75, 'controlado', NOW() - INTERVAL '2 days'),
      (c_carlos, 128,  82, 138, 212, 85.4,  84, 'controlado', NOW() - INTERVAL '6 hours');
  END IF;

  -- ── Hernán: de controlado → alerta (deterioro — requiere intervención) ───
  --   día 7   día 6   día 5   día 4   día 3   día 2   hoy
  --    79      73      65      57      48      39      31     (score)
  --   VERDE   VERDE  AMARI   AMARI   AMARI   ALERTA  ALERTA

  IF c_hernan IS NOT NULL THEN
    INSERT INTO tracking_biometricos
      (caso_id, presion_sistolica, presion_diastolica, glucosa, colesterol, peso, score_calculado, etiqueta, created_at)
    VALUES
      (c_hernan, 128,  80, 145, 195, 79.2,  79, 'controlado', NOW() - INTERVAL '7 days'),
      (c_hernan, 135,  85, 168, 198, 79.6,  73, 'controlado', NOW() - INTERVAL '6 days'),
      (c_hernan, 142,  90, 205, 202, 80.1,  65, 'en_riesgo',  NOW() - INTERVAL '5 days'),
      (c_hernan, 150,  95, 248, 206, 80.5,  57, 'en_riesgo',  NOW() - INTERVAL '4 days'),
      (c_hernan, 158, 100, 290, 210, 81.0,  48, 'en_riesgo',  NOW() - INTERVAL '3 days'),
      (c_hernan, 165, 106, 332, 214, 81.4,  39, 'alerta',     NOW() - INTERVAL '2 days'),
      (c_hernan, 172, 112, 368, 218, 81.8,  31, 'alerta',     NOW() - INTERVAL '4 hours');
  END IF;

END $$;

-- ── FIN ───────────────────────────────────────────────────────────────────
-- Total aprox: 3 empresas, 13 casos, ~200 registros check-in,
-- ~60 biométricos + 14 showcase, ~54 evaluaciones psicosociales
-- Para limpiar: ejecutar scripts/demo/cleanup_demo_tracking.sql
