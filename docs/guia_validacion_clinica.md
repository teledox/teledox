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
   - Envía el **mensaje empático automático** al paciente
   - Alerta inmediata al médico vía Telegram
   - Crea notificación de máxima prioridad en el panel

#### 💬 Mensaje Empático Enviado por WhatsApp:
> 🆘 Gracias por contarnos cómo te sientes. Eso toma mucho valor.
> 
> Si estás pensando en hacerte daño, por favor llama al **911** ahora o ve a la sala de emergencias más cercana.
> 
> Tu equipo médico fue notificado y se comunicará contigo muy pronto. No estás solo/a. 💙

#### Puntos a Validar con la Doctora
- [ ] ¿Las palabras clave de detección son adecuadas y suficientes?
- [ ] ¿El mensaje empático cumple con protocolos de salud mental vigentes?
- [ ] ¿Se debe incluir número de línea de emergencia psicológica local (ej. 171 Opción 6)?
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

#### 🛡️ Filtro de Seguridad: Rangos de Ingreso en WhatsApp ([flujo-biometricos.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/flows/flujo-biometricos.js))

Antes de ingresar los datos al cálculo del score, el bot intercepta los mensajes para prevenir errores de tipeo en el teclado del celular:

| Parámetro Biométrico | Mínimo Aceptado | Máximo Aceptado | Unidad | Acción del Bot si el número está fuera de rango |
|----------------------|-----------------|-----------------|--------|------------------------------------------------|
| **Altura** | 100 | 220 | cm | Rechaza el dato y solicita re-ingreso |
| **Peso** | 20 | 350 | kg | Rechaza el dato y solicita re-ingreso |
| **Glucosa** | 40 | 600 | mg/dL | Rechaza el dato y solicita re-ingreso |
| **Colesterol** | 100 | 500 | mg/dL | Rechaza el dato y solicita re-ingreso |
| **PA Sistólica / Diastólica** | *(Propuesta: 60)* | *(Propuesta: 300)* | mmHg | Acepta número tipeado *(Pendiente definir max/min)* |

#### Puntos a Validar con la Doctora
- [ ] ¿Los pesos activos (30 PA / 25 Glucosa / 20 Colesterol / 15 IMC / 10 Bienestar) son adecuados?
- [ ] ¿Los umbrales de PA siguen guías AHA/ESC actualizadas?
- [ ] ¿Glucosa: se mide en ayunas? ¿Se debe diferenciar glucosa casual vs. ayunas?
- [ ] ¿El IMC es suficiente o se necesita circunferencia de cintura?
- [ ] ¿Los cortes 70/40 para etiquetas finales son adecuados?
- [ ] ¿Se necesitan ajustes por edad, sexo o antecedentes?



---

### Módulo 4: Health Score de Adherencia (Behavioral Engagement)

**Archivo**: [calcularScoreAdherencia.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/utils/calcularScoreAdherencia.js) y [healthScoreAdherencia.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/services/healthScoreAdherencia.js)
**Ventana de evaluación**: Últimos 30 días (`VENTANA_DIAS = 30`)
**Escala**: 0 a 100 puntos

A diferencia del Score Biométrico (signos físicos), este score mide la **adherencia farmacológica y el comportamiento del paciente en el canal de WhatsApp**.

#### 📌 Los 4 Pilares de Evaluación (25 pts cada uno)

##### 1. Adherencia al Tratamiento (25 pts)
* **¿Qué evalúa?**: % de tomas confirmadas sobre los recordatorios de medicamentos enviados.
* **Mensaje enviado por WhatsApp**:
  > *"Hola [Nombre]. ¿Te tomaste tu medicamento **[Nombre del Fármaco]** indicado por el médico?"*
* **Opciones de respuesta**: Botones `[ Sí, lo tomé ]` / `[ No ]`.
* **Fórmula**: $(\text{Respuestas "Sí"} / \text{Total recordatorios de medicina respondidos}) \times 25\text{ pts}$.

##### 2. Bienestar Promedio y Alertas Inmediatas (25 pts)
* **¿Qué evalúa?**: El nivel promedio de bienestar o mejoría percibida reportado en WhatsApp.
* **Mensaje enviado por WhatsApp**:
  > *"🩺 **Seguimiento MediLyft**\n\nHora de tu reporte diario. ¿Cómo te sientes hoy?"*
* **Menú de opciones (Escala Likert 1-5)**:
  1. `Muy bien` (😊) $\rightarrow$ 1.0
  2. `Bien` (🙂) $\rightarrow$ 2.0
  3. `Regular` (😐) $\rightarrow$ 3.0 *(Dispara notificación media al médico)*
  4. `Mal` (😞) $\rightarrow$ 4.0 *(Dispara alerta alta al médico)*
  5. `Muy mal` (😢) $\rightarrow$ 5.0 *(Dispara alerta alta al médico)*
* **Fórmula**: $((5 - \text{Promedio Likert}) / 4) \times 25\text{ pts}$.

##### 3. Controles Preventivos / Laboratorio (25 pts)
* **¿Qué evalúa?**: Cumplimiento y carga de exámenes clínicos u órdenes de laboratorio indicados por el médico.
* **Mensaje enviado por WhatsApp**:
  > *"📋 ¿Ya te realizaste el examen de **[Tipo de Examen]** indicado en tu consulta?"*
* **Opciones de respuesta**: Botones `[ Sí ]` / `[ No ]`. Si responde "Sí", el bot solicita la foto/PDF del resultado.
* **Fórmula**: $(\text{Exámenes con resultado subido y confirmado} / \text{Total órdenes emitidas}) \times 25\text{ pts}$.

##### 4. Participación Activa / Engagement (25 pts)
* **¿Qué evalúa?**: La tasa de respuesta del paciente a todas las notificaciones interactivas enviadas por el bot.
* **Fórmula**: $(\text{Mensajes respondidos por el paciente} / \text{Total mensajes de seguimiento enviados por el bot}) \times 25\text{ pts}$.

> [!NOTE]
> **Diferencia entre Pilar 1 y Pilar 4**:
> * **Pilar 1 (Adherencia Farmacológica)**: Evalúa el **CONTENIDO** de la respuesta. Solo da puntos si el paciente seleccionó *"Sí, me tomé la medicina"*.
> * **Pilar 4 (Participación Activa)**: Evalúa el **COMPROMISO CON EL CANAL**. Suma puntos simplemente por responder al WhatsApp, sin importar si dijo *"Sí"* o *"No"*.

#### ⚖️ Regla de Reescalado Proporcional (Módulos Omitidos)
Si un paciente no tiene órdenes de laboratorio asignadas en los últimos 30 días (`controlesPreventivosPct == null`), el sistema excluye ese componente y el total máximo pasa de 100 a **75 pts**. La nota final se reescala dividiendo `(totalObtenido / 75) * 100`, haciendo que **cada uno de los 3 pilares restantes valga automáticamente el 33.33% de la nota final (33.33 pts)**.

##### Etiquetas Finales

| Score | Etiqueta | Significado Clínico |
|-------|----------|---------------------|
| ≥ 70 | `controlado` 🟢 | Paciente constante, cumple tratamiento y responde al canal |
| ≥ 40 | `en_riesgo` 🟡 | Adherencia irregular u omisión de dosis |
| < 40 | `alerta` 🔴 | Abandono potencial de tratamiento o nula respuesta en WhatsApp |

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

### Módulo 6: Seguimiento Post-Consulta (Fin de Tratamiento)

**Archivo**: [flujo-seguimiento.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/flows/flujo-seguimiento.js) y [cron.js](file:///Users/francoortiz/Desktop/MEDILYFT/teledox/src/handlers/cron.js)

#### ⏱️ Momento de Disparo
Se dispara automáticamente **2 horas después de concluida la última dosis del tratamiento prescrito** (al vencer la `fecha_fin` calculada a partir de los días de receta indicados por el médico).

#### 💬 Mensaje Enviado por WhatsApp:
> 🏥 **Seguimiento MediLyft**
> 
> ¡Hola **[Nombre del Paciente]**! Su tratamiento con **[Medicamento Prescrito]** ha finalizado.
> 
> ¿Cómo se siente ahora?

#### 🔘 Clasificación de Respuestas y Acciones Automáticas

| Botón Seleccionado | Categoría | Respuesta Automatizada del Bot | Acción en el Sistema |
|---------------------|-----------|--------------------------------|----------------------|
| `[ 😊 Me siento mejor ]` | `exitoso` | *"🎉 ¡Nos alegra mucho que se sienta mejor! Su caso fue registrado como exitoso..."* | Cierra el caso en BD (`cierres_casos`) y notifica resolución positiva al médico vía Telegram. |
| `[ 😐 Sigo con síntomas ]` | `parcial` | *"👨‍⚕️ Gracias por contarnos. Hemos registrado que aún presenta síntomas. Un médico revisará su caso..."* | Registra resultado parcial y genera **Notificación de Prioridad Media** en la bandeja del panel médico. |
| `[ 😟 No mejoré ]` | `sin_mejoria` | *"😟 Lamentamos que no se sienta mejor. Hemos alertado a un médico para revisar su caso con prioridad..."* | Dispara **Alerta Roja de Telegram** urgente al médico de guardia y **Notificación de Alta Prioridad** en panel. |

#### Puntos a Validar con la Doctora
- [ ] ¿El retraso de 2 horas tras la última dosis es adecuado para todas las familias de medicamentos?
- [ ] ¿La categoría `sin_mejoria` debe incluir un enlace directo para reagendar teleconsulta sin costo adicional?
- [ ] ¿Se requiere un segundo control a las 48 horas si la respuesta fue `parcial`?


---

### Módulo 7: Perfilamiento y Scoring Predictivo de Riesgo Clínico (Propuesta de Protocolo)

**Concepto**: Integración de antecedentes, biométricos y comportamiento para estratificar a los pacientes en 4 niveles de riesgo clínico y activar planes preventivos automatizados.

#### 🧮 Matriz de Puntuación de Riesgo Unificado (0 a 100 Puntos de Riesgo)

La puntuación global de riesgo combina 3 dimensiones ponderadas:

| Dimensión | Variables de Entrada | Puntos de Riesgo Asignados | Peso Relativo |
|-----------|----------------------|----------------------------|---------------|
| **1. Carga Morbosa y Edad** | • Edad ≥ 65 años<br>• Comorbilidad HTA + Diabetes<br>• ≥ 2 Enfermedades crónicas | • +10 pts si Edad ≥ 65 años<br>• +10 pts si HTA + Diabetes<br>• +10 pts si ≥2 crónicas | **30%** (máx 30 pts) |
| **2. Control Biométrico Reciente** | • Health Score Biométrico (Módulo 3) | • **Alerta (< 40 pts)**: +40 pts riesgo<br>• **En Riesgo (40-69 pts)**: +20 pts riesgo<br>• **Controlado (≥ 70 pts)**: 0 pts riesgo | **40%** (máx 40 pts) |
| **3. Adherencia y Engagement** | • Health Score Adherencia (Módulo 4) | • **Alerta (< 40 pts)**: +30 pts riesgo<br>• **En Riesgo (40-69 pts)**: +15 pts riesgo<br>• **Controlado (≥ 70 pts)**: 0 pts riesgo | **30%** (máx 30 pts) |

#### 🚦 Clasificación del Nivel de Riesgo Global y Acciones Automáticas

| Puntuación de Riesgo | Nivel de Riesgo | Color | Protocolo de Atención en Sistema |
|----------------------|-----------------|-------|----------------------------------|
| **0 - 24 pts** | **Riesgo Bajo** | 🟢 Verde | Monitoreo estándar por WhatsApp (check-in de rutina semanal/mensual). |
| **25 - 49 pts** | **Riesgo Medio** | 🟡 Amarillo | Recordatorios intensificados + sugerencia automática de agendar consulta de control trimestral. |
| **50 - 74 pts** | **Riesgo Alto** | 🔴 Rojo | Notificación prioritaria en el panel del médico tratante + llamada/gestión de enfermería B2B. |
| **≥ 75 pts** | **Riesgo Crítico** | 🚨 Alerta | Alerta roja en Telegram + agendamiento de teleconsulta prioritaria sin costo / derivación presencial. |

#### Puntos a Validar con la Doctora
- [ ] ¿Los pesos relativos (30% Antecedentes/Edad, 40% Biométricos, 30% Adherencia) reflejan la vulnerabilidad médica real?
- [ ] ¿La coexistencia de Diabetes e Hipertensión debe forzar directamente el pase a Riesgo Alto (🔴)?
- [ ] ¿Cada cuánto tiempo se debe recalcular el Riesgo Global del paciente (semanal / mensual / tras cada consulta)?
- [ ] ¿Qué protocolo de intervención rápida debe seguir el gestor de salud ante un paciente en Riesgo Crítico (🚨)?








