# 🤖 Flujos del bot de WhatsApp — MediLyft

> **Cómo ver esto como diagramas:** los bloques ` ```mermaid ` se renderizan solos en
> GitHub y en VS Code (extensión *Markdown Preview Mermaid Support*). Para editar visual,
> pegá un bloque en **https://mermaid.live**. Para modificar un flujo: editá el texto del
> diagrama (las flechas `-->` y los nodos) y listo.
>
> Este documento es la **fuente de verdad legible** de los flujos. Si cambiás el código,
> actualizá acá; si querés proponer un cambio, editá acá y lo implementamos.

---

## 🗺️ Mapa de ruteo (cómo el webhook decide qué flujo corre)

El bot guarda en cada sesión un número de **`paso`**. `api/webhook.js` mira ese número y
deriva al flujo correspondiente **por rangos**:

| Rango de `paso` | Flujo | Archivo |
|---|---|---|
| `0`–`12`, `39`, `41` | Consulta principal (registro paciente) | `flujo-consulta.js` |
| `13`–`17` | Antecedentes médicos | `flujo-antecedentes.js` |
| `50`–`62` | B2C (pago directo / seguro externo) | `flujo-b2c.js` |
| `90`–`97` | Seguimiento aprobado por médico (pago) | `flujo-seguimiento-pago.js` |
| `98` | Reagendar | `flujo-reagendar.js` |
| `99` | "Ya registrado" (mensaje fijo) | `webhook.js` |
| `200`+ | Enfermedades crónicas (cuestionarios) | `flujo-cronicas.js` |
| `300`+ | Call center B2B (agente registra pacientes) | `flujo-callcenter.js` |
| (sin paso) | Respuesta a recordatorio de seguimiento | `flujo-seguimiento.js` |

> ℹ️ **Detalle de ruteo:** `webhook.js` despacha directo los rangos `13-17`, `98`, `99`,
> `200+` y `300+`. Todo lo demás (`0-12`, `39`, `41`, `50-97`) cae en
> `procesarPaso()` de `flujo-consulta.js`, que a su vez delega internamente:
> `50-89` → `flujo-b2c.js` (en la práctica solo usa `50-62`) y `90-97` →
> `flujo-seguimiento-pago.js`.

> ⚠️ **Esta numeración por rangos es la parte frágil del sistema** — ver la sección
> *"Deuda técnica"* al final. Ya causó varios bugs (pasos que caían en el rango de otro
> flujo). Al agregar un paso nuevo, mantenelo **dentro del rango de su flujo**.

---

## 1) 🏥 Flujo de consulta principal

Es la puerta de entrada. El paciente escribe **hola** y registra una teleconsulta.

```mermaid
flowchart TD
  H([Escribe: hola]) --> P0["Paso 0\nPide cédula o código de acceso"]
  P0 --> P1{"Paso 1\n¿Qué ingresó?"}

  P1 -->|"Tiene letras + empresa válida"| CC["➡️ Call Center (paso 300)"]
  P1 -->|"Tiene letras, sin empresa"| P1err["❌ Código no reconocido\n(vuelve a paso 1)"]
  P1 -->|"10 dígitos (cédula)"| BUSCA{"Busca paciente\ny empleado B2B"}

  BUSCA -->|"Paciente ya registrado"| P2["Paso 2\nConsentimiento de datos"]
  BUSCA -->|"Cédula en empresa B2B"| CREA["Crea paciente sin pago"] --> P2
  BUSCA -->|"No encontrado"| B2C["➡️ B2C (paso 50)"]

  P2 -->|"No autoriza"| FIN1([Fin])
  P2 -->|"Autoriza"| P3["Paso 3\nDescribe síntomas"]

  P3 --> NIV{"Clasifica síntomas"}
  NIV -->|"Nivel 3 (grave)"| EMER([🚨 Emergencia → 911\nalerta Telegram · Fin])
  NIV -->|"Nivel 2 (medio)"| URG([⚠️ Atención urgente\ncrea consulta · Fin])
  NIV -->|"Nivel 1 — datos ya completos"| P39{"Paso 39\n¿Usar o actualizar datos?"}
  NIV -->|"Nivel 1 — faltan datos"| P4["Paso 4: Nombre"]

  P39 -->|"Usar mis datos"| P11["Paso 11: Horario"]
  P39 -->|"Actualizar"| P4

  P4 --> P5P6{"¿Tiene apellidos?"}
  P5P6 -->|"No"| P5["Paso 5: Apellidos"] --> P6["Paso 6: Edad"]
  P5P6 -->|"Sí"| P6
  P6 --> P7["Paso 7: Nacimiento"] --> P8["Paso 8: Correo"]
  P8 --> P41{"Paso 41\n¿Usar este número o indicar otro?"}
  P41 -->|"Usar este"| P10["Paso 10: Residencia"]
  P41 -->|"Indicar otro"| P9["Paso 9: Teléfono"] --> P10
  P10 --> P11
  P11 --> P12{"Paso 12\nConfirmar datos"}
  P12 -->|"Corregir"| P4
  P12 -->|"Confirmar"| REG["Crea consulta + alerta médico"] --> ANT["➡️ Antecedentes (paso 13)"]
```

---

## 2) 📋 Antecedentes médicos (pasos 13–17)

Después de confirmar la consulta, el bot completa la historia clínica.

```mermaid
flowchart TD
  P13["Paso 13: ¿Alergias?"] --> P14["Paso 14: ¿Hipertensión arterial?"]
  P14 --> P15["Paso 15: ¿Diabetes?"]
  P15 --> P16["Paso 16: ¿Cirugías previas?"]
  P16 --> P17["Paso 17: Otros antecedentes /\nmedicación habitual"]
  P17 --> FIN([Guarda antecedentes,\ngenera PDF de historia clínica,\nelimina sesión · Fin])
```

> ⚠️ **"Paso 99" es código muerto en este camino.** `flujo-antecedentes.js` llama
> `eliminar(telefono)` y devuelve `terminar:true` — la sesión se borra por completo,
> no queda guardada en `paso: 99`. Cualquier mensaje posterior (incluido "hola")
> cae a `procesarPaso(0, ...)` y muestra de nuevo el saludo inicial. La rama
> "paso 99 → ya registrado" de `webhook.js` no se alcanza desde aquí — habría que
> confirmar si algún otro flujo deja la sesión en `paso: 99`, o eliminar esa rama.

---

## 3) 💳 Flujo B2C — pago directo / seguro externo (pasos 50–62)

Cuando la cédula **no** está en ninguna empresa afiliada.

```mermaid
flowchart TD
  P50["Paso 50\n¿Seguro afiliado o pago directo?"] --> P51{"Paso 51: elección"}
  P51 -->|"Mi seguro es afiliado"| P52{"Paso 52: nombre del seguro"}
  P51 -->|"Pago directo $8"| P53["Paso 53: Nombre completo"]

  P52 -->|"Seguro aliado"| P53
  P52 -->|"No aliado"| P61{"Paso 61\n¿Continuar con pago directo?"}
  P61 -->|"Sí"| P53
  P61 -->|"No"| FINB([Fin])

  P53 --> P54["Paso 54: Edad"] --> P55["Paso 55: Correo"]
  P55 --> P62{"Paso 62\n¿Usar este número u otro?"}
  P62 -->|"Usar este"| P57["Paso 57: Residencia"]
  P62 -->|"Indicar otro"| P56["Paso 56: Teléfono"] --> P57
  P57 --> P58["Paso 58: Síntomas"]

  P58 --> NIVb{"Clasifica síntomas"}
  NIVb -->|"Nivel 3 (grave)"| EMERb([🚨 Emergencia → 911\nalerta Telegram · Fin])
  NIVb -->|"Nivel 1 o 2\n(nivel 2 también alerta)"| P59["Paso 59\n¿Forma de pago?\n(Transferencia / Tarjeta)"]
  P59 --> P60["Paso 60\nEsperando comprobante de pago"]
  P60 --> FINB2([Registra consulta + facturación · Fin])
```

> ℹ️ El flujo B2C **no tiene paso de horario de preferencia** (a diferencia de la
> consulta principal/B2B, que sí lo pide en el paso 11). De síntomas (P58) se pasa
> directo a forma de pago (P59).

---

## 4) 🏢 Call Center B2B (pasos 300+)

Un agente autenticado con el **código de empresa** registra varios pacientes seguidos.

```mermaid
flowchart TD
  P300["Paso 300\nBienvenida agente (empresa detectada)"] --> P301["Paso 301: Cédula del paciente"]
  P301 --> EX{"¿Paciente existe?"}
  EX -->|"Sí"| P302{"Paso 302\n¿Datos correctos?"}
  EX -->|"No"| P303["Paso 303: Nombre"]
  P302 -->|"Sí"| P306["Paso 306: Síntomas"]
  P302 -->|"Ingresar datos"| P303
  P303 --> P308["Paso 308: Edad"] --> P310["Paso 310: Nacimiento"] --> P304["Paso 304: Teléfono"]
  P304 --> P305["Paso 305: Correo"] --> P311["Paso 311: Residencia"] --> P306
  P306 --> NIVc{"Clasifica"}
  NIVc -->|"Nivel 3"| EMERc([🚨 Emergencia → 911]) --> P309
  NIVc -->|"Nivel 1-2"| P307{"Paso 307\n¿Confirmar registro?"}
  P307 -->|"Corregir"| P301
  P307 -->|"Confirmar"| REGc["Crea/actualiza paciente + consulta + alerta"] --> P309
  P309{"Paso 309\n¿Otro paciente?"}
  P309 -->|"Sí"| P301
  P309 -->|"Finalizar"| FINc([Fin de sesión])
```

---

## 5) 🩺 Enfermedades crónicas (pasos 200+)

El cron diario (`api/cron.js`) inicia el cuestionario; el paciente responde por número.

```mermaid
flowchart TD
  CRON([Cron diario detecta\nseguimiento crónico vencido]) --> P200["Paso 200\nEnvía 1ª pregunta del cuestionario"]
  P200 --> LOOP["Paso por cada pregunta\n(según enfermedad: HTA, diabetes, etc.)"]
  LOOP --> EVAL{"Evalúa respuestas"}
  EVAL -->|"Valores de riesgo"| ALERTA([⚠️ Alerta al médico])
  EVAL -->|"Normal"| OKc([✅ Registrado · Fin])
```

---

## 6) 🔔 Respuestas a recordatorios de seguimiento

No usa `paso`: cuando hay un recordatorio pendiente (medicamento o fin de tratamiento),
la respuesta del paciente se procesa aparte (`flujo-seguimiento.js`), antes de llegar
al ruteo por `paso`.

```mermaid
flowchart TD
  REM([Cron envía recordatorio]) --> TIPO{"Tipo de recordatorio"}
  TIPO -->|"Medicamento: ¿ya tomó?"| MED{"Sí / No"}
  MED -->|"Sí"| OKm([✅ Registrado · Fin])
  MED -->|"No"| ALm([⚠️ Alerta Telegram\nincumplimiento · Fin])

  TIPO -->|"Fin de tratamiento: ¿cómo se siente?"| FT{"1 / 2 / 3"}
  FT -->|"1 Mejor"| EXITO([🎉 Caso exitoso\nalerta Telegram · Fin])
  FT -->|"2 Mejoró pero\naún con síntomas"| NOTIF2["Crea notificación\n(categoría media,\nestado pendiente)"]
  FT -->|"3 No mejoró\no empeoró"| NOTIF3["⚠️ Alerta Telegram +\nnotificación\n(categoría grave,\nestado pendiente)"]

  NOTIF2 --> REVISA(["Médico revisa la notificación\nen el panel"])
  NOTIF3 --> REVISA
  REVISA -->|"Aprueba"| P90["➡️ Seguimiento aprobado\n(paso 90, ver sección 8)"]
  REVISA -->|"Rechaza"| FINr2([Fin — no se notifica\nal paciente])
```

> ⚠️ **Las respuestas "2" y "3" NO redirigen automáticamente a "Reagendar" (paso 98).**
> Solo crean una notificación/alerta para que un médico la revise manualmente desde el
> panel. Si el médico la aprueba, recién ahí `api/seguimiento-decision.js` arranca una
> sesión nueva en `paso: 90` (sección 8) — distinto del paso 98 de "Reagendar".

---

## 7) 📅 Reagendar (paso 98)

```mermaid
flowchart TD
  P98{"Paso 98\n¿Desea agendar consulta?"} -->|"Sí"| SINT["Paso 3: pide síntomas\n(reentra al flujo de consulta)"]
  P98 -->|"No"| FINr([Fin])
```

---

## 8) 🔁 Consulta de seguimiento aprobada por el médico (pasos 90–97)

No se llega aquí escribiendo "hola". Cuando un médico **aprueba** una notificación de
seguimiento (sección 6) desde el panel, `api/seguimiento-decision.js`:

1. Marca la notificación como `aprobada`.
2. Pre-carga `datos` con la info ya conocida del paciente (nombre, cédula, correo,
   teléfono, lugar de residencia, `cliente_b2b_id` si aplica, `consulta_origen_id`).
3. Crea una sesión en **`paso: 90`** y le envía al paciente botones preguntando si
   desea agendar la consulta de control.

```mermaid
flowchart TD
  APROB(["Médico aprueba seguimiento\nen el panel (api/seguimiento-decision.js)"]) --> SETUP["Crea sesión en paso 90\ncon correo / teléfono / residencia\nprecargados desde el paciente"]
  SETUP --> P90{"Paso 90\n¿Desea agendar consulta de control?"}
  P90 -->|"No"| FIN90([Elimina sesión · Fin])
  P90 -->|"Sí"| P91["Paso 91\n¿Cómo se siente?\n(describe síntomas)"]

  P91 --> NIVs{"Clasifica síntomas"}
  NIVs -->|"Nivel 3 (grave)"| EMERs([🚨 Emergencia → 911\nalerta Telegram · Fin])
  NIVs -->|"Nivel 1 o 2"| DATOS{"¿Falta correo,\nteléfono o residencia?"}

  DATOS -->|"Falta correo"| P92["Paso 92: Correo"] --> DATOS
  DATOS -->|"Falta teléfono"| P93["Paso 93: Teléfono de contacto"] --> DATOS
  DATOS -->|"Falta residencia"| P94["Paso 94: Lugar de residencia"] --> DATOS
  DATOS -->|"Completos"| PAGO{"¿Tiene cliente_b2b_id\n(empresa cubre)?"}

  PAGO -->|"Sí — sin costo"| REGB2B([Crea consulta de seguimiento\nsin costo · alerta · Fin])
  PAGO -->|"No — $8.00"| P95["Paso 95\n¿Forma de pago?\n(Transferencia / Tarjeta)"]
  P95 --> P96["Paso 96\nEsperando comprobante de pago"]
  P96 --> REGPAGO([Crea consulta + facturación\n(facturacion_b2c) · Fin])
```

> ℹ️ En la práctica, `seguimiento-decision.js` ya pre-carga correo, teléfono y lugar
> de residencia desde el registro del paciente, así que P92-94 normalmente se saltan
> (solo se preguntan si esos campos están vacíos en `pacientes`).
>
> Para probarlo manualmente sin pasar por el panel: crear una sesión con
> `paso: 90` y `datos` con al menos `paciente_id`, `cedula`, `nombreCompleto`,
> `correo`, `telefonoContacto`, `lugar_residencia` (y opcionalmente `cliente_b2b_id`,
> `consulta_origen_id`).

---

## 🧱 Deuda técnica — sobre la numeración por pasos

La numeración por **rangos numéricos** (`paso 50–89 = B2C`, `200+ = crónicas`, etc.) es
el punto más frágil del bot. Ya generó varios bugs reales: pasos que "caían" en el rango
de otro flujo y eran interceptados por el flujo equivocado (ej. el paso de confirmar
teléfono colisionaba con B2C; pasos `529`/`551` los robaba el flujo de crónicas).

**Por qué es frágil:** el ruteo está hardcodeado por rangos repartidos en `webhook.js`,
no hay una definición central de estados, y agregar un paso en el número equivocado
**rompe en silencio**.

**Propuesta de mejora (a futuro):** reemplazar el número por un estado con **nombre**:
guardar en la sesión `{ flujo: 'consulta', paso: 'telefono' }` en vez de `paso: 41`. El
webhook derivaría por **`flujo`** (nombre), no por rango numérico — eliminando las
colisiones de raíz. Es un refactor grande (toca todos los flujos), así que conviene
hacerlo por etapas y con este documento como guía.
