# Guía Operativa de Validación Médica: MediLyft

> **Propósito**: Documento de trabajo para revisión con la Directora Médica.
> Cada sección contiene las reglas exactas implementadas en código, para validar, corregir o complementar.

---

## 1. Mapa General de Flujos Clínicos

| # | Flujo | Entrada del Paciente | Regla / Algoritmo Actual | Acción Automática | Requiere Validación Médica |
|---|-------|----------------------|--------------------------|-------------------|---------------------------|
| 1 | **Triaje por Síntomas** | Texto libre WhatsApp | `clasificarSintomas()` busca palabras clave en 3 niveles | Clasifica Leve/Moderado/Grave, envía alerta Telegram si Grave | **Sí: Definir palabras clave y niveles** |
| 2 | **Detección de Crisis** | Texto libre WhatsApp | `detectarCrisis()` busca keywords de autolesión/suicidio | Interrumpe flujo, mensaje empático, alerta inmediata al médico | **Sí: Validar protocolo de crisis** |
| 3 | **Scoring Biométrico** | Valores numéricos (PA, glucosa, colesterol, peso, talla) | `calcularScore()` con umbrales fijos, escala 0-100 pts | Asigna etiqueta: controlado / en_riesgo / alerta | **Sí: Validar todos los umbrales** |
| 4 | **Scoring de Adherencia** | Respuestas del paciente en seguimiento | `calcularScoreAdherencia()` con 4 dimensiones, ventana 30 días | Asigna etiqueta: controlado / en_riesgo / alerta | **Sí: Validar pesos y ventana temporal** |
| 5 | **Monitoreo Crónicas** | Valores biométricos específicos por enfermedad | `ENFERMEDADES[tipo].evaluar()` con umbrales por patología | Nivel 1 (normal), Nivel 2 (alerta), Nivel 3 (emergencia/911) | **Sí: Validar cada umbral por patología** |
| 6 | **Seguimiento Post-Consulta** | Paciente reporta evolución | Clasifica: exitoso / parcial / sin_mejoria | Si parcial o sin_mejoria, genera nueva notificación al médico | **Sí: Definir criterios de re-consulta** |
| 7 | **Bienestar Periódico** | Escala Likert 1-5 vía WhatsApp | `evaluar(bienestar)` en flujo-tracking | 4-5 genera alerta de seguimiento | **Sí: Validar escala y acciones** |
| 8 | **Triaje IA (Demo)** | Texto libre simulado | `simularTriajeIA()` via Gemini, asigna Health Score arbitrario | Genera respuesta IA y puntuación 35-90 | **Sí: NO APTO para producción sin validación** |
| 9 | **Auditoría TPA** | Caso completado por médico | Auditor TPA revisa manualmente | Dictamen: aprobado / observado / rechazado | No (manual) |
| 10 | **Generación de Documentos** | Médico completa formulario | `pdf-lib` genera PDF (receta, certificado, laboratorio, interconsulta) | PDF enviado al WhatsApp del paciente | **Sí: Validar plantillas clínicas** |

---

## 2. Detalle por Módulo

---

### Módulo 1: Triaje Automático por Síntomas

**Archivo**: [validaciones.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/utils/validaciones.js)
**Función**: `clasificarSintomas(texto)`

#### Clasificación Actual

| Nivel | Etiqueta | Criterio en Código | Acción Automática |
|-------|----------|-------------------|-------------------|
| 3 | **Grave** | Palabras clave: dolor intenso, dificultad para respirar, sangrado, pérdida de conciencia | 🚨 Alerta Telegram + Notificación Panel prioridad ALTA |
| 2 | **Moderado** | Palabras clave: fiebre persistente, dolor moderado, mareo | ⚠️ Alerta Telegram + Ruta a teleconsulta prioritaria ($8 USD) |
| 1 | **Leve** | Todo lo que no cae en Nivel 2 o 3 | Ruta estándar de atención |

#### Puntos a Validar con la Doctora
- [ ] ¿Las palabras clave de cada nivel son correctas y completas?
- [ ] ¿Falta agregar síntomas de alarma específicos (dolor torácico, cefalea súbita, déficit neurológico)?
- [ ] ¿El Nivel 3 debería bloquear teleconsulta y derivar directo a emergencias?
- [ ] ¿Se requiere combinación de síntomas (ej. fiebre + dificultad respiratoria = Grave)?

---

### Módulo 2: Detección Global de Crisis

**Archivo**: [webhook.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/handlers/webhook.js)
**Función**: `detectarCrisis(texto)`

#### Flujo Actual
1. Se ejecuta **ANTES** de cualquier otro flujo
2. Busca keywords relacionados con autolesión o ideación suicida
3. Si detecta coincidencia:
   - Interrumpe toda automatización
   - Envía mensaje empático predefinido al paciente
   - Alerta inmediata al médico vía Telegram
   - Crea notificación de máxima prioridad en el panel

#### Puntos a Validar con la Doctora
- [ ] ¿Las palabras clave de detección son adecuadas y suficientes?
- [ ] ¿El mensaje empático cumple con protocolos de salud mental vigentes?
- [ ] ¿Se debe incluir número de línea de emergencia psicológica local?
- [ ] ¿Se requiere escalamiento a un especialista en salud mental?

---

### Módulo 3: Health Score Biométrico

**Archivo**: [calcularScore.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/utils/calcularScore.js)
**Función**: `calcularScore(args)`
**Escala**: 0 a 100 puntos

#### Componentes y Umbrales Actuales

##### Presión Arterial (30 pts máximo)

| Rango Sistólica | Rango Diastólica | Puntos | Etiqueta Asignada |
|-----------------|------------------|--------|-------------------|
| ≥ 140 | ≥ 90 | 0 pts | HTA Grado 2 |
| ≥ 130 | ≥ 80 | 10 pts | HTA Grado 1 |
| ≥ 121 | — | 20 pts | Elevada |
| < 121 | < 80 | 30 pts | Normal |

##### Glucosa en Ayunas (25 pts máximo)

| Rango (mg/dL) | Puntos | Etiqueta Asignada |
|----------------|--------|-------------------|
| ≥ 126 | 0 pts | Diabetes |
| ≥ 100 | 12 pts | Prediabetes |
| < 100 | 25 pts | Normal |

##### Colesterol Total (20 pts máximo)

| Rango (mg/dL) | Puntos | Etiqueta Asignada |
|----------------|--------|-------------------|
| ≥ 240 | 0 pts | Alto |
| ≥ 200 | 10 pts | Límite |
| < 200 | 20 pts | Normal |

##### IMC (15 pts máximo)

| Rango IMC | Puntos | Etiqueta Asignada |
|-----------|--------|-------------------|
| < 18.5 o ≥ 30 | 3 pts | Bajo Peso / Obesidad |
| ≥ 25 | 8 pts | Sobrepeso |
| 18.5 - 24.9 | 15 pts | Normal |

##### Bienestar Auto-reportado (10 pts máximo, escala invertida)

| Likert | Puntos |
|--------|--------|
| 1 (Excelente) | 10 pts |
| 2 (Bien) | 8 pts |
| 3 (Regular) | 5 pts |
| 4 (Mal) | 2 pts |
| 5 (Muy mal) | 0 pts |

#### 📊 Distribución Activa del Score (Base 100 Puntos Fijos)

El score suma **exactamente 100 puntos en base directa**, asignando el peso correspondiente a cada marcador según su relevancia cardiovascular y metabólica:

| Componente | Máximo Puntos | Justificación Médica |
|------------|---------------|----------------------|
| **Presión Arterial** | **30 pts** | Principal indicador de riesgo cardiovascular agudo/crónico |
| **Glucosa en Ayunas** | **25 pts** | Marcador clave metabólico y de diabetes |
| **Colesterol Total** | **20 pts** | Indicador de dislipidemia y riesgo aterogénico |
| **IMC (Peso / Talla)** | **15 pts** | Indicador de composición antropométrica (sobrepeso/obesidad) |
| **Bienestar Subjetivo** | **10 pts** | Acompañamiento del estado percibido (1=10p, 2=8p, 3=5p, 4=2p, 5=0p) |
| **TOTAL POOL** | **100 pts** | **Base fija de 100 puntos sin escalamiento** |

##### Etiquetas Finales del Score

| Score Total | Etiqueta | Color |
|-------------|----------|-------|
| ≥ 70 | `controlado` | 🟢 Verde |
| ≥ 40 | `en_riesgo` | 🟡 Amarillo |
| < 40 | `alerta` | 🔴 Rojo |

#### Puntos a Validar con la Doctora
- [ ] ¿Los pesos activos (30 PA / 25 Glucosa / 20 Colesterol / 15 IMC / 10 Bienestar) son adecuados?
- [ ] ¿Los umbrales de PA siguen guías AHA/ESC actualizadas?
- [ ] ¿Glucosa: se mide en ayunas? ¿Se debe diferenciar glucosa casual vs. ayunas?
- [ ] ¿El IMC es suficiente o se necesita circunferencia de cintura?
- [ ] ¿Los cortes 70/40 para etiquetas finales son adecuados?
- [ ] ¿Se necesitan ajustes por edad, sexo o antecedentes?


---

### Módulo 4: Health Score de Adherencia

**Archivo**: [calcularScoreAdherencia.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/utils/calcularScoreAdherencia.js)
**Función**: `calcularScoreAdherencia(args)`
**Ventana de evaluación**: 30 días (`VENTANA_DIAS = 30`)
**Escala**: 0 a 100 puntos

#### Componentes (25 pts cada uno)

| Dimensión | Fuente de Datos | Cálculo |
|-----------|----------------|---------|
| Adherencia al Tratamiento | % de tomas confirmadas vía WhatsApp | Proporcional hasta 25 pts |
| Bienestar Promedio | Respuestas Likert 1-5 en seguimientos | Proporcional hasta 25 pts |
| Controles Preventivos | Asistencia a controles agendados | Proporcional hasta 25 pts |
| Participación Activa | Respuestas a mensajes de seguimiento | Proporcional hasta 25 pts |

##### Etiquetas Finales

| Score | Etiqueta |
|-------|----------|
| ≥ 70 | `controlado` |
| ≥ 40 | `en_riesgo` |
| < 40 | `alerta` |

#### Puntos a Validar con la Doctora
- [ ] ¿La ventana de 30 días es apropiada para todas las patologías?
- [ ] ¿Los 4 componentes deben tener el mismo peso (25% cada uno)?
- [ ] ¿Qué acción clínica se toma cuando un paciente cae a `alerta`?
- [ ] ¿Se requiere ajustar la ventana según tipo de enfermedad crónica?

---

### Módulo 5: Monitoreo de Enfermedades Crónicas

**Archivo**: [flujo-cronicas.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/flows/flujo-cronicas.js)
**17 patologías con funciones `evaluar()` independientes**

#### 5.1 Hipertensión Arterial (`hipertension`)

| Parámetro | Nivel 3 (Emergencia 🚨) | Nivel 2 (Atención ⚠️) | Nivel 1 (Normal ✅) |
|-----------|------------------------|----------------------|---------------------|
| PA Sistólica | ≥ 180 | ≥ 160 | < 130 |
| PA Diastólica | ≥ 110 | ≥ 100 | < 85 |
| Síntomas | = '3' (visión borrosa / cefalea intensa) | = '2' (cefalea / mareos leves) | = '1' (sin síntomas) |
| PA Sistólica baja | < 90 (Hipotensión 🚨) | — | — |
| PA Diastólica baja | < 60 (Hipotensión 🚨) | — | — |

**Acción Nivel 3**: Mensaje "Acuda a urgencias inmediatamente" + alerta Telegram
**Acción Nivel 2**: Mensaje "Contacte a su médico hoy" + alerta al panel

#### 5.2 Diabetes Tipo 1 (`diabetes_tipo1`)

| Parámetro | Nivel 3 (Emergencia 🚨) | Nivel 2 (Atención ⚠️) | Nivel 1 (Normal ✅) |
|-----------|------------------------|----------------------|---------------------|
| Glucosa (mg/dL) | < 54 (Hipoglucemia severa) | < 70 (Hipoglucemia) | 70 - 180 |
| Glucosa (mg/dL) | > 400 (Crisis hiperglucémica) | > 300 | — |
| Glucosa (mg/dL) | — | > 180 (Elevada) | — |
| Síntomas | = '3' (confusión / pérdida conocimiento) | = '2' (temblor / sudoración) | = '1' (sin síntomas) |

#### 5.3 Diabetes Tipo 2 (`diabetes_tipo2`)

| Parámetro | Nivel 3 (Emergencia 🚨) | Nivel 2 (Atención ⚠️) | Nivel 1 (Normal ✅) |
|-----------|------------------------|----------------------|---------------------|
| Glucosa (mg/dL) | < 54 (Hipoglucemia) | < 70 (Hipoglucemia) | 70 - 180 |
| Glucosa (mg/dL) | > 400 (Crisis hiperglucémica) | > 300 | — |
| Glucosa (mg/dL) | — | > 180 | — |
| Medicación | — | = '2' (no tomó) | = '1' (sí tomó) |

#### 5.4 EPOC (`epoc`)

| Parámetro | Nivel 3 🚨 | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|-----------|
| SpO2 (%) | < 85% | < 88% | ≥ 91% |
| SpO2 (%) | — | < 91% | — |
| Disnea | = '3' (muy difícil / agitada) | = '2' (un poco más difícil) | = '1' (normal) |

#### 5.5 Asma (`asma`)

| Parámetro | Nivel 3 🚨 | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|-----------|
| SpO2 (%) | < 90% | < 94% | ≥ 94% |
| Rescatador + SpO2 | = '3' (≥3 veces) AND SpO2 < 94% | = '3' (≥3 veces) | = '1' o '2' |

#### 5.6 Insuficiencia Cardíaca (`insuficiencia_cardiaca`)

| Parámetro | Nivel 3 🚨 | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|-----------|
| Aumento de peso | ≥ 3 kg vs peso anterior | ≥ 2 kg | < 1 kg |
| Disnea | = '3' (en reposo / acostado) | — | = '1' o '2' |
| Edema | — | = '3' o = '2' (tobillos/piernas) | = '1' (sin edema) |
| Aumento de peso | — | ≥ 1 kg | — |

#### 5.7 Enfermedad Renal Crónica (`enfermedad_renal`)

| Parámetro | Nivel 3 🚨 | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|-----------|
| PA Sistólica | ≥ 180 | ≥ 160 | < 160 |
| Síntomas | = '3' (orina espumosa / confusión) | = '2' (hinchazón leve cara/pies) | = '1' (sin síntomas) |

#### 5.8 Trastorno Tiroideo (`tiroides`)

| Parámetro | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|
| Síntomas Hipo/Hiper | = '3' (palpitaciones/sudoración) o = '2' (fatiga/frío) | = '1' (sin síntomas nuevos) |
| Medicación | — | = '1' (tomó) / '2' (recordar tomar) |

#### 5.9 Artritis Reumatoide (`artritis_reumatoide`)

| Parámetro | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|
| Dolor (escala 0-10) | ≥ 8 (brote severo) o ≥ 5 | < 5 |
| Rigidez matutina | > 60 min (alta prioridad) o > 30 min | ≤ 30 min |

#### 5.10 Lupus Eritematoso Sistémico (`lupus`)

| Parámetro | Nivel 3 🚨 | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|-----------|
| Fiebre (°C) | = '3' (>38°C) | = '2' (37.3–38°C) | = '1' (normal) |
| Síntomas | = '3' (empeoramiento súbito) | = '2' (erupciones, dolor articular) | = '1' (sin síntomas) |

#### 5.11 Epilepsia (`epilepsia`)

| Parámetro | Nivel 3 🚨 | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|-----------|
| Crisis convulsivas | = '3' (severa o múltiples) | = '2' (una crisis leve) | = '1' (sin crisis) |
| Medicación | — | = '3' (no tomó antiepiléptico) | = '1' o '2' |

#### 5.12 Post ACV (`post_acv`)

| Parámetro | Nivel 3 🚨 | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|-----------|
| Síntomas neurológicos | = '3' (parálisis facial / confusión) o = '2' (debilidad brazo/habla) | — | = '1' (sin síntomas) |
| PA Sistólica | ≥ 180 mmHg | ≥ 160 mmHg | < 160 mmHg |

#### 5.13 Fibrilación Auricular (`fibrilacion_auricular`)

| Parámetro | Nivel 3 🚨 | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|-----------|
| Frecuencia Cardíaca | > 150 bpm o < 40 bpm (Bradicardia) | > 110 bpm | 40 - 110 bpm |
| Síntomas | = '3' (palpitaciones intensas / síncope / dolor pecho) | = '2' (palpitaciones leves) | = '1' (sin síntomas) |

#### 5.14 Depresión Crónica (`depresion`)

| Parámetro | Nivel 3 🚨 | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|-----------|
| Estado de Ánimo | = '3' (muy mal / en crisis) | = '2' (triste / sin energía) | = '1' (bien o regular) |
| Protocolo Salud Mental | Mensaje empático + Alerta médica prioritaria | Notificación a equipo médico | Registro normal |

#### 5.15 Obesidad / Sobrepeso (`obesidad`)

| Parámetro | Nivel 1 ✅ |
|-----------|-----------|
| Peso (kg) | Registro continuo en expediente |
| Actividad Física | 1 = 3+ días, 2 = 1-2 días, 3 = No realizó (mensaje motivacional) |

#### 5.16 Osteoporosis (`osteoporosis`)

| Parámetro | Nivel 3 🚨 | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|-----------|
| Caídas / Golpes | = '3' (caída con dolor intenso / fractura) | = '2' (caída leve sin lesión) | = '1' (sin caídas) |
| Suplementación | — | — | = '1' (tomó calcio/vit D) |

#### 5.17 VIH / SIDA (`vih`)

| Parámetro | Nivel 3 🚨 | Nivel 2 ⚠️ | Nivel 1 ✅ |
|-----------|-----------|-----------|-----------|
| Síntomas | = '3' (síntomas severos / sospecha infección oportunista) | = '2' (fiebre, fatiga, baja de peso) | = '1' (sin síntomas) |
| Antirretrovirales (ARV) | — | = '3' (no tomó ARV hoy) | = '1' o '2' |

#### Acciones Automáticas por Nivel (todas las patologías)

| Nivel | Mensaje al Paciente | Alerta al Equipo | Acción en Sistema |
|-------|--------------------|--------------------|-------------------|
| 3 (Emergencia) | "🚨 Acuda a urgencias o llame al 911 inmediatamente" | Telegram urgente + notificación panel prioridad ALTA | Estado: `alerta` |
| 2 (Atención) | "⚠️ Contacte a su médico hoy" | Telegram medio + notificación panel | Ruta a teleconsulta ($8 USD si B2C) |
| 1 (Normal) | "✅ Sus valores están dentro del rango" | Ninguna | Registro normal |

#### Puntos a Validar con la Doctora
- [ ] ¿Cada umbral por patología está alineado con guías clínicas vigentes (AHA, ADA, GOLD, etc.)?
- [ ] ¿Se requiere agregar Nivel 3 para Artritis (artritis séptica)?
- [ ] ¿Los mensajes de Nivel 3 deben incluir instrucciones específicas por patología?
- [ ] ¿Los umbrales deben ajustarse por edad del paciente?
- [ ] ¿Se necesita distinguir entre diabetes gestacional y tipo 1/2?


---

### Módulo 6: Seguimiento Post-Consulta

**Archivo**: [flujo-seguimiento.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/flows/flujo-seguimiento.js)

#### Clasificación de Evolución

| Respuesta del Paciente | Categoría | Acción Automática |
|------------------------|-----------|-------------------|
| "Me curé" / "Estoy bien" | `exitoso` | Cierra caso, mensaje de cierre positivo |
| "Sigo con síntomas" / "Regular" | `parcial` | Notificación al médico para revisión |
| "No mejoré" / "Estoy mal" | `sin_mejoria` | Notificación al médico + alerta de seguimiento |

#### Puntos a Validar con la Doctora
- [ ] ¿Cuántas horas/días después de la consulta se envía el seguimiento?
- [ ] ¿`sin_mejoria` debería generar teleconsulta inmediata o solo notificación?
- [ ] ¿Se requiere un segundo seguimiento si la respuesta fue `parcial`?

---

### Módulo 7: Seguimiento de Bienestar Periódico

**Archivo**: [flujo-tracking.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/flows/flujo-tracking.js)

#### Escala Likert y Niveles

| Valor Likert | Interpretación | Nivel Asignado | Acción |
|--------------|----------------|----------------|--------|
| 1 (Excelente) | Óptimo | Nivel 1 | Ninguna |
| 2 (Bien) | Aceptable | Nivel 1 | Ninguna |
| 3 (Regular) | Atención | Nivel 2 | Alerta media al médico |
| 4 (Mal) | Preocupante | Nivel 3 | Alerta alta al médico |
| 5 (Muy mal) | Crítico | Nivel 3 | Alerta alta al médico |

#### Puntos a Validar con la Doctora
- [ ] ¿La escala 1-5 es suficiente o se necesitan dimensiones adicionales (dolor, sueño, ánimo)?
- [ ] ¿Con qué frecuencia se envía la encuesta de bienestar?
- [ ] ¿Likert 3 (Regular) justifica alerta médica o solo registro?

---

### Módulo 8: Validación de Rangos Biométricos (Ingreso de Datos)

**Archivo**: [flujo-biometricos.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/flows/flujo-biometricos.js)

#### Rangos de Aceptación Actual

| Parámetro | Mínimo Aceptado | Máximo Aceptado | Unidad |
|-----------|-----------------|-----------------|--------|
| Altura | 100 | 220 | cm |
| Peso | 20 | 350 | kg |
| Glucosa | 40 | 600 | mg/dL |
| Colesterol | 100 | 500 | mg/dL |
| PA Sistólica | (no validado) | (no validado) | mmHg |
| PA Diastólica | (no validado) | (no validado) | mmHg |

> [!CAUTION]
> La presión arterial NO tiene validación de rango de ingreso. Un paciente podría reportar valores imposibles (ej. "PA 500/300") sin que el sistema los rechace.

#### Puntos a Validar con la Doctora
- [ ] ¿Los rangos de aceptación son correctos?
- [ ] ¿Se deben agregar rangos para PA? Propuesta: Sistólica 60-300, Diastólica 30-200
- [ ] ¿Se necesitan validaciones para SpO2 (0-100%), FC (20-250 bpm)?

---

### Módulo 9: Triaje por IA Generativa (Solo Demo)

**Archivo**: [geminiRAG.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/services/geminiRAG.js)
**Función**: `simularTriajeIA(mensajeUsuario)`

#### Estado Actual

| Aspecto | Implementación |
|---------|---------------|
| Motor | Gemini 2.0 Flash |
| Prompt | Instruye a la IA asignar Health Score entre 35 y 90 (ej. "61 si reporta fiebre") |
| Validación clínica | ❌ Ninguna |
| Uso actual | Solo demos y presentaciones |
| Base de datos | No escribe en BD de producción |

> [!CAUTION]
> **NO APTO PARA PRODUCCIÓN.** El LLM asigna scores clínicos sin reglas validadas. Si se activa en producción, representa un riesgo regulatorio y clínico grave. Requiere un protocolo de validación completo antes de cualquier uso real.

---

### Módulo 10: Auditoría TPA

**Archivo**: [auditoriaTPA.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/services/auditoriaTPA.js)

#### Flujo Actual
1. Cada consulta completada genera un registro pendiente de auditoría
2. El auditor TPA revisa manualmente en el panel
3. Dictamen posible: `aprobado` | `observado` | `rechazado`
4. Asistente RAG (Gemini) disponible para consultas de KPIs en lenguaje natural

> [!NOTE]
> La columna de auditoría TPA no existe aún en el schema real de BD. Actualmente se simula como "todo pendiente" para demos.

---

### Módulo 11: Documentos Clínicos Generados

**Archivo**: [flujo-antecedentes.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/flows/flujo-antecedentes.js)
**Librería**: `pdf-lib`

#### Tipos de Documento

| Documento | Generación | Envío | Firma Digital |
|-----------|-----------|-------|---------------|
| Historia Clínica | Automática desde antecedentes | WhatsApp del paciente | No implementada |
| Receta Médica | Médico completa formulario en panel | WhatsApp del paciente | No implementada |
| Certificado Médico | Médico completa formulario en panel | WhatsApp del paciente | No implementada |
| Pedido de Laboratorio | Médico completa formulario en panel | WhatsApp del paciente | No implementada |
| Interconsulta | Médico completa formulario en panel | WhatsApp del paciente | No implementada |

#### Puntos a Validar con la Doctora
- [ ] ¿Se requiere firma electrónica avanzada para recetas?
- [ ] ¿Las plantillas PDF cumplen con requisitos regulatorios locales?
- [ ] ¿La Historia Clínica autogenerada incluye todos los campos requeridos?

---

## 3. Esquema de Base de Datos Clínica

### Tablas con Datos Clínicos

| Tabla | Datos que Almacena | Campos Clave |
|-------|--------------------|-------------|
| `antecedentes` | Historial clínico del paciente | `alergias`, `hipertension`, `diabetes`, `cirugias`, `otros` (todos TEXT libre) |
| `paciente_health_score` | Score calculado y etiqueta | `score_calculado`, `etiqueta` (controlado/en_riesgo/alerta), `adherencia_tratamiento_pct`, `bienestar_promedio` |
| `tracking_biometricos` | Valores vitales reportados | `presion_sistolica`, `presion_diastolica`, `glucosa`, `colesterol`, `peso`, `score_calculado`, `etiqueta` |
| `tracking_psicosocial` | Evaluación psicosocial MRL | `dim_carga`, `dim_autonomia`, `dim_apoyo`, `dim_relaciones`, `dim_doble_pres` (escalas 0-100) |
| `documentos_datos` | JSON de documentos generados | Payload completo del documento (receta, certificado, etc.) |

> [!WARNING]
> **Alergias y antecedentes son campos de texto libre.** No hay catálogo estandarizado. Esto impide la verificación automática de interacciones fármaco-alergia. Se necesita un catálogo estructurado para automatizar bloqueos de seguridad farmacéutica.

---

## 4. Lo que NO Existe Aún (Brechas Identificadas)

| Funcionalidad | Estado | Impacto |
|---------------|--------|---------|
| Health Score en producción real | Solo existe en demo (`simularTriajeIA`) | No se calcula Health Score real de síntomas agudos |

| Perfilamiento de riesgo del paciente | ❌ No implementado | No hay scoring predictivo basado en historial completo |
| Interacción fármaco-alergia automática | ❌ No implementado | Alergias son texto libre, no se cruzan con medicamentos |
| Firma electrónica en documentos | ❌ No implementado | PDFs se generan sin firma digital validada |
| CIE-10 validado contra servidor | ❌ Solo búsqueda local en frontend | Sin validación contra terminología estándar |
| Auditoría TPA en BD real | ❌ Columna no existe en schema | Se simula todo como "pendiente" |
| Ajuste de umbrales por edad/sexo | ❌ No implementado | Umbrales fijos para toda la población |
| Estándares HL7/FHIR | ❌ No implementado | Sin interoperabilidad con sistemas de salud externos |
| Validación de rango de PA al ingreso | ❌ No implementado | Paciente puede ingresar valores imposibles |

---

## 5. Cuestionario de Validación Clínica para la Reunión

### A. Triaje y Clasificación de Gravedad
1. ¿Las palabras clave actuales para clasificar síntomas en Leve/Moderado/Grave son correctas? ¿Cuáles faltan?
2. ¿La clasificación por texto libre es suficiente o se necesita un cuestionario estructurado con preguntas específicas?
3. ¿El sistema debería preguntar duración de síntomas para ajustar la gravedad?
4. ¿Qué síntomas de alarma deben forzar derivación a emergencias presenciales sin opción de teleconsulta?
5. ¿Se requiere un cuestionario diferente según la edad del paciente (pediátrico vs. adulto vs. geriátrico)?

### B. Health Score Biométrico
6. ¿Los umbrales de presión arterial (130/80 para HTA1, 140/90 para HTA2) siguen las guías que usted recomienda? ¿AHA 2017 o ESC 2018?
7. ¿La glucosa debe medirse siempre en ayunas? ¿O aceptamos glucosa casual con umbrales diferentes (ej. casual ≥200 mg/dL = diabetes)?
8. ¿El colesterol total es suficiente o necesitamos LDL, HDL y triglicéridos por separado?
9. ¿El IMC es el indicador adecuado o se prefiere incluir circunferencia de cintura?
10. ¿Los pesos relativos (PA: 30%, Glucosa: 25%, Colesterol: 20%, IMC: 20%, Bienestar: 5%) reflejan la importancia clínica real?
11. ¿Los cortes de 70 (controlado), 40 (en_riesgo) y <40 (alerta) son apropiados para tomar decisiones clínicas?
12. ¿Se requieren umbrales diferentes según sexo biológico? (ej. IMC en embarazo, PA en mujeres jóvenes)
13. ¿Se requieren umbrales diferentes según edad? (ej. PA en mayores de 65 años)

### C. Monitoreo de Enfermedades Crónicas
14. **Hipertensión**: ¿PA ≥ 180/110 para emergencia y ≥ 160/100 para atención son los cortes correctos?
15. **Diabetes**: ¿Glucosa < 54 mg/dL para hipoglucemia severa es correcto? ¿El corte de > 400 para crisis hiperglucémica es adecuado?
16. **EPOC**: ¿SpO2 < 85% para emergencia es correcto? ¿Debería ser < 88% según guías GOLD?
17. **Asma**: ¿SpO2 < 90% + uso de rescatador como criterio de emergencia es suficiente? ¿Se necesita Peak Flow?
18. **Insuficiencia Cardíaca**: ¿Ganancia de ≥ 3 kg como emergencia es correcto? ¿En cuántos días?
19. **Fibrilación Auricular**: ¿FC > 150 para emergencia y < 40 para bradicardia son correctos?
20. **Artritis**: ¿Se necesita un Nivel 3 de emergencia? (ej. articulación caliente + fiebre = sospecha de artritis séptica)
21. ¿Faltan patologías crónicas prioritarias? (Hipotiroidismo, Epilepsia, VIH, Enfermedad Hepática, etc.)
22. ¿Los umbrales deben ser configurables por médico tratante según cada paciente individual?

### D. Seguimiento y Adherencia
23. ¿A las cuántas horas después de la consulta se debe enviar el primer seguimiento?
24. ¿La ventana de 30 días para calcular adherencia es correcta para todas las patologías?
25. ¿Cuántas dosis omitidas consecutivas deben generar alerta al médico? (Actualmente: cada omisión individual)
26. ¿Si el paciente reporta "no mejoré", se debe generar teleconsulta automática o solo notificación?
27. ¿Se requiere un protocolo diferenciado de seguimiento para enfermedades crónicas vs. agudas?

### E. Seguridad Farmacéutica
28. ¿Se requiere implementar un catálogo de alergias estandarizado para poder verificar interacciones fármaco-alergia automáticamente?
29. ¿Qué familias de fármacos necesitan bloqueo cruzado obligatorio? (ej. AINEs con alergia a aspirina)
30. ¿Las recetas digitales deben incluir firma electrónica avanzada según regulación local vigente?

### F. Perfilamiento y Scoring Predictivo
31. ¿Se requiere implementar un perfil de riesgo del paciente que combine: antecedentes + biométricos + adherencia + edad?
32. ¿Qué variables deben alimentar un score predictivo de riesgo? ¿Con qué peso relativo?
33. ¿El Health Score biométrico y el Score de Adherencia deben combinarse en un score único o mantenerse separados?

### G. Alta Médica y Cierre de Caso
34. ¿A partir de qué score mínimo el sistema puede habilitar el botón de "Firmar Alta Médica" al doctor?
35. ¿El alta debe requerir que todos los parámetros biométricos estén en Nivel 1, o basta con el score global?
36. ¿Se requiere un período mínimo de observación antes de poder otorgar el alta?

### H. Detección de Crisis
37. ¿El protocolo actual de detección de ideación suicida es adecuado según guías de salud mental vigentes?
38. ¿Se debe incluir un número de línea de crisis psicológica local en el mensaje automático?
39. ¿Se requiere escalamiento automático a un especialista en salud mental además de notificar al médico general?

### I. Gobernanza y Regulación
40. ¿Todos los documentos PDF generados cumplen con los requisitos regulatorios del Ministerio de Salud local?
41. ¿Se requiere implementar estándares de interoperabilidad (HL7/FHIR) para intercambio con otros sistemas de salud?
42. ¿La IA generativa (Gemini) puede usarse en producción para sugerencias clínicas si se agrega una capa de validación humana obligatoria?
