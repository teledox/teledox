# Plan de pruebas — Flujos del bot WhatsApp (MediLyft)

> Generado con el harness local (`npm run test:bot`, envío de WhatsApp mockeado, Supabase real).
> Referencia: [docs/flujos-bot.md](../../docs/flujos-bot.md)

## Datos de prueba creados en Supabase
- `clientes_b2b`: "TEST QA" (`id d68794f3-9f3e-4009-a466-0adbc405a8fb`), `codigo_acceso: "QATEST01"`
- `empleados_b2b`: cédula `1701234567` → empresa "TEST QA"
- Cédula `1709876542`: válida, no registrada, no B2B → fuerza rama B2C
- `enfermedades_cronicas`: 1 fila para cédula `1705550000` (hipertensión, `id e7dcfef5-d82c-4526-aa11-40d86ef4960d`)
- `recordatorios` + `seguimiento_respuestas`: filas de prueba (medicamento y fin_tratamiento) para cédula `1701234567`
- `pacientes` adicional: cédula `1700000004` (creado vía Flujo 4 — Call Center, "Test CallCenter Paciente")
- `sesiones_bot`: usadas para forzar entrada directa a pasos 90, 98, 200 (no alcanzables desde "hola")

## Convenciones
- ✅ paso probado y responde como lo documentado
- ⚠️ paso probado con observación (ver Notas)
- ❌ paso falla / no coincide con lo documentado
- ⬜ pendiente

---

## Flujo 1 — Consulta principal

| # | Paso (bot) | Variante B2B (cédula `1701234567`, tel `593900000001`) | Variante B2C (cédula `1709876542`, tel `593900000002`) | Notas |
|---|---|:---:|:---:|---|
| 1 | P0 — "hola" → pide cédula/código | ✅ | ✅ | |
| 2 | P1 — ingresa cédula | ✅ | ✅ | B2B → crea paciente sin pago → P2. B2C → "no encontramos su cédula" + lista P50 (✅ ok) |
| 3 | P2 — consentimiento de datos | ✅ | — | Solo variante B2B (B2C no pasa por P2). Botones `si`/`no` ok |
| 4 | P3 — describe síntomas | ✅ | — | |
| 5 | Clasificación síntomas → nivel 1, faltan datos → P4 | ✅ | — | "Me duele un poco la cabeza desde ayer" → nivel 1 ok |
| 6 | P4 — nombre completo | ✅ | — | |
| 7 | P5 — apellidos (si nombre no trae apellidos) | ✅ | — | Con "Juan Carlos Perez Mendoza" (4 palabras) salta P5 directo a P6 — correcto |
| 8 | P6 — edad | ✅ | — | |
| 9 | P7 — fecha de nacimiento | ✅ | — | |
| 10 | P8 — correo | ✅ | — | |
| 11 | P41 — ¿usar este número o indicar otro? | ✅ | — | Botones `actual`/`otro` |
| 12 | P9 — teléfono alterno (si "indicar otro") | ⬜ | — | No probado en esta corrida (se eligió "usar este número") |
| 13 | P10 — residencia | ✅ | — | |
| 14 | P11 — horario preferido | ✅ | — | |
| 15 | P12 — confirmar datos | ✅ | — | Resumen con todos los campos correcto, botones `confirmar`/`corregir` |
| 16 | Crea consulta + alerta médico → entra a Antecedentes (paso 13) | ✅ | — | Botón `confirmar` → mensaje de éxito + arranca P13 (alergias) |

## Flujo 2 — Antecedentes médicos (pasos 13–17)

| # | Paso (bot) | B2B | B2C | Notas |
|---|---|:---:|:---:|---|
| 1 | P13 — ¿alergias? | ✅ | — | |
| 2 | P14 — ¿hipertensión? | ✅ | — | ⚠️ Doc dice "antecedentes patológicos" genérico; el código pregunta puntualmente por hipertensión |
| 3 | P15 — ¿diabetes? | ✅ | — | ⚠️ Doc dice "antecedentes quirúrgicos"; el código pregunta por diabetes |
| 4 | P16 — ¿cirugías previas? | ✅ | — | ⚠️ Doc dice "antecedentes familiares"; el código pregunta por cirugías |
| 5 | P17 — otros antecedentes/medicación → guarda, genera PDF historia clínica, `eliminar(telefono)`, fin | ✅ | — | Mensaje final correcto. Internamente hace POST/PATCH a `antecedentes` + genera y sube PDF |
| 6 | Mensaje siguiente tras antecedentes | ⚠️ | — | La sesión se **elimina** (no queda en paso 99) → cualquier texto siguiente cae a `procesarPaso(0,...)` y muestra el saludo P0 de nuevo, ignorando el contenido del mensaje. La rama "paso 99 → ya registrado" de `webhook.js:164-167` parece código muerto para este camino — ver Hallazgos |

## Flujo 3 — B2C (pago directo / seguro externo, pasos 50–62)

| # | Paso (bot) | Variante "pago directo $8" | Variante "seguro no aliado" | Notas |
|---|---|:---:|:---:|---|
| 1 | P50 — ¿seguro afiliado o pago directo? | ✅ | ✅ | Es una **lista** (`/lista directo` / `/lista seguro`), no botones |
| 2 | P51 — elección | ✅ | ✅ | |
| 3 | P52 — nombre del seguro (si "afiliado") | — | ✅ | "Aseguradora del Pacifico" → no está en `SEGUROS_ALIADOS` → P61 |
| 4 | P61 — ¿continuar con pago directo? (si seguro no aliado) | — | ✅ | Botón `si` → continúa con modalidad `b2c` |
| 5 | P53 — nombre completo | ✅ | ✅ | |
| 6 | P54 — edad | ✅ | ✅ | |
| 7 | P55 — correo | ✅ | ✅ | |
| 8 | P62 — ¿usar este número u otro? | ✅ | ✅ | Pago directo probó "otro"; seguro probó "actual" |
| 9 | P56 — teléfono alterno (si "otro") | ✅ | — | |
| 10 | P57 — residencia | ✅ | ✅ | |
| 11 | P58 — síntomas | ✅ | ✅ | |
| 12 | P59 — forma de pago (transferencia/tarjeta) | ✅ | ✅ | ⚠️ Doc dice "P59: Horario" pero el código **no tiene paso de horario** en B2C — P58 (síntomas) pasa directo a "forma de pago" con botones `transferencia`/`tarjeta`. Si se responde texto libre en vez de tocar un botón, el bot repite el mismo prompt (no hay manejo de error explícito). Probado transferencia y tarjeta — ambos mensajes correctos |
| 13 | P60 — esperando comprobante de pago (`/media`) | ✅ | ✅ | `/media` (mensaje `__media__`, len>3) dispara la confirmación igual que un comprobante real |
| 14 | Registra consulta · fin | ✅ | ✅ | Crea/reutiliza paciente, crea `consultas`, `crearNotificacion`, `registrarFacturacionB2C`, `alertar` (Telegram falla silenciosamente sin credenciales), `eliminar(telefono)` → sesión limpia. Variante seguro queda con `modalidad: 'b2c'` (no `b2b_externo`) — correcto, ya que el seguro fue rechazado |

### Pendiente dentro de Flujo 3
- ⬜ Variante "seguro **sí** aliado" (ej. responder "BUPA" en P52 → `modalidad: 'b2b_externo'`, debería etiquetar la notificación como "PAGO SEGURO")
- ⬜ Síntomas nivel 2/3 en P58 (alerta Telegram + corte a emergencia)
- ⬜ P59 con texto libre (no botón) — confirmar que repite el prompt sin romperse
- ⬜ P51/P50 con respuesta inválida (lista no reconocida)

## Flujo 4 — Call Center B2B (pasos 300+)

> Setup: se asignó `codigo_acceso = "QATEST01"` a "TEST QA". Sesión de prueba: tel `593900000010`.

| # | Paso (bot) | Resultado | Notas |
|---|---|:---:|---|
| 1 | "hola" → P0 pide cédula/código | ✅ | |
| 2 | P1 — código "QATEST01" → detecta empresa → redirige a P300 | ✅ | `_redirect` de `flujo-consulta.js` a `procesarCallCenter(300,...)` funciona |
| 3 | P300 — bienvenida agente | ✅ | |
| 4 | P301 — cédula del paciente (nuevo, `1700000004`) | ✅ | No valida checksum, solo longitud 10 |
| 5 | P303 — nombre completo | ✅ | |
| 6 | P308 — edad | ✅ | |
| 7 | P310 — fecha de nacimiento | ✅ | |
| 8 | P304 — teléfono | ✅ | |
| 9 | P305 — correo (`no`) | ✅ | |
| 10 | P311 — residencia | ✅ | |
| 11 | P306 — síntomas (nivel 1) → P307 resumen | ✅ | Resumen muestra todos los campos + empresa |
| 12 | P307 — `confirmar` → crea paciente + consulta + notificación + alerta → P309 | ✅ | `etiqueta: 'EMPLEADO CON CÓDIGO'`, `cliente_b2b_id` de TEST QA |
| 13 | P309 — `no` → fin de sesión | ✅ | |

### Pendiente dentro de Flujo 4
- ⬜ P301 con paciente **existente** (cédula ya registrada) → rama P302 "¿datos correctos?"
- ⬜ P302 → "no"/`corregir` → reingreso de datos
- ⬜ P306 con síntomas nivel 3 (emergencia) → P309 sin pasar por confirmación
- ⬜ P307 → `corregir` → reinicio de datos del paciente
- ⬜ P309 → `si` (registrar otro paciente) → vuelve a P301
- ⬜ P301 con cédula de longitud inválida (≠10 dígitos)

## Flujo 5 — Enfermedades crónicas (pasos 200+)

> No se llega desde "hola". Setup: fila en `enfermedades_cronicas` (cédula `1705550000`,
> hipertensión) + sesión forzada en `paso: 200` con `datos.enfermedad_key`,
> `datos.enfermedad_id`, `datos.paciente_id`, `datos.paso_cronico: 1` (tel `593900000003`).
> No se ejecutó `api/cron.js` (para no tocar recordatorios reales) — se simuló
> directamente el resultado de su seeding.

| # | Paso (bot) | Nivel 1 (normal) | Nivel 3 (emergencia) | Notas |
|---|---|:---:|:---:|---|
| 1 | Pregunta 1 — presión sistólica | ✅ (120) | ✅ (190) | |
| 2 | Pregunta 2 — presión diastólica → guarda `paso_cronico:2`, repregunta | ✅ (80) | ✅ (120) | |
| 3 | Pregunta 3 — síntomas (1/2/3) | ✅ (1) | ✅ (3) | |
| 4 | Evalúa, crea `registros_cronicos`, responde y termina sesión | ✅ "Presión 120/80 — Normal" | ✅ "🚨 EMERGENCIA: Presión 190/120 — CRISIS HIPERTENSIVA" + `tel:911` | Nivel 1 no genera notificación ni alerta; nivel 3 sí dispara `alertar` (Telegram, falla silenciosamente) |

### Pendiente dentro de Flujo 5
- ⬜ Nivel 2 (valores de atención, ej. 165/95) → crea `consultas` + `crearNotificacion` (categoría media, etiqueta `CRÓNICO`)
- ⬜ Otra enfermedad con `evaluar(vals, anterior)` que compara con registro previo (ej. `insuficiencia_cardiaca`, peso)
- ⬜ Sesión interrumpida a medias (paciente no termina el cuestionario)

## Flujo 6 — Recordatorios de seguimiento

> No usa `paso`. Setup: filas en `recordatorios` (`tipo: medicamento` y `tipo: fin_tratamiento`)
> + filas en `seguimiento_respuestas` con `respuesta: null` para cédula `1701234567`
> (tel `593900000001`, sesión inactiva → `enFlujoConsulta = false`).

| # | Caso | Resultado | Notas |
|---|---|:---:|---|
| 1 | Medicamento — "Sí" tomó | ✅ | `tomo_medicamento: true`, mensaje de refuerzo del tratamiento |
| 2 | Medicamento — "No" tomó | ✅ | `tomo_medicamento: false` + alerta Telegram "Incumplimiento de tratamiento" |
| 3 | Fin de tratamiento — "1" (mejor) | ✅ | `se_siente_mejor: true`, `respuesta: 'curado'` + alerta Telegram "Tratamiento exitoso" |
| 4 | Fin de tratamiento — "2" (mejoró, aún con síntomas) | ✅ | Crea `notificaciones` (categoría `medio`, etiqueta `SEGUIMIENTO`, `estado_validacion: pendiente`). **No** redirige a paso 98 |
| 5 | Fin de tratamiento — "3" (no mejoró/peor) | ✅ | Alerta Telegram "Sin mejoría" + `notificaciones` (categoría `grave`, etiqueta `SEGUIMIENTO`, pendiente). **No** redirige a paso 98 |

### Pendiente dentro de Flujo 6
- ⬜ Fin de tratamiento con respuesta inválida (ni 1/2/3) → repite el menú
- ⬜ Recordatorio con `created_at` > 48h → `buscarRespuestaPendiente` no debe interceptar
- ⬜ Paciente con sesión activa de consulta (`enFlujoConsulta=true`) y mensaje ambiguo → no debe ser robado por seguimiento salvo que sea `esRespuestaSeguimiento`

## Flujo 7 — Reagendar (paso 98)

> No se llega desde "hola" en este momento (ver Hallazgo 3 sobre las respuestas 2/3 de
> Flujo 6). Setup: sesión forzada en `paso: 98` con `datos.paciente_id` (B2B tel
> `593900000001`, B2C tel `593900000002`).

| # | Paso (bot) | Variante "Sí" (B2B) | Variante "No" (B2C) | Notas |
|---|---|:---:|:---:|---|
| 1 | P98 — ¿desea agendar consulta de control? | ✅ | ✅ | |
| 2 | "Sí" → reconstruye `datos` desde `pacientes` + `clientes_b2b`, guarda `paso:3`, pide síntomas | ✅ | — | |
| 3 | Reentra a P3 (síntomas) → nivel 1 sin `datosCompletos` → pide P4 (nombre) | ⚠️ | — | `nuevosDatos` de reagendar **no** trae `nombreCompleto`/`correo`/`telefono`/`lugar_residencia` (sí trae `cedula`, `empresa`, `seguro`), así que `datosCompletos` es `false` y se vuelve a pedir **todo** desde P4, aunque el paciente ya tenga esos datos en `pacientes`. Funciona, pero es redundante para el usuario — ver Hallazgos |
| 4 | "No" → elimina sesión, mensaje de despedida, fin | — | ✅ | |

## Flujo 8 — Seguimiento aprobado por el médico (pasos 90–97)

> No se llega desde "hola" — lo dispara `api/seguimiento-decision.js` cuando un médico
> aprueba una notificación de seguimiento. Setup: sesión forzada en `paso: 90` con
> `datos` pre-cargados como lo haría el panel (incluye `correo`, `telefonoContacto`,
> `lugar_residencia` ya completos, así que P92-94 se saltan). Variante B2B con
> `cliente_b2b_id` (tel `593900000001`), variante B2C sin `cliente_b2b_id` (tel
> `593900000002`), y variante "no" (tel `593900000003`).

| # | Paso (bot) | Variante B2B (sin costo) | Variante B2C ($8) | Variante "No" |
|---|---|:---:|:---:|:---:|
| 1 | P90 — ¿desea agendar consulta de control? | ✅ (`/boton si`) | ✅ (`/boton si`) | ✅ (`/boton no`) |
| 2 | "No" → elimina sesión, fin | — | — | ✅ |
| 3 | P91 — ¿cómo se siente? (síntomas, nivel 1-2) | ✅ | ✅ | — |
| 4 | `faltaDato` → correo/teléfono/residencia ya completos → salta P92-94 | ✅ | ✅ | — |
| 5 | `irAPago` — con `cliente_b2b_id` → crea consulta `seguimiento_aprobado` sin costo, notifica, alerta, fin | ✅ | — | — |
| 6 | `irAPago` — sin `cliente_b2b_id` → P95 forma de pago | — | ✅ (`transferencia`) | — |
| 7 | P96 — comprobante (`/media`) → crea consulta + `facturacion_b2c` + notificación + alerta, fin | — | ✅ | — |

### Pendiente dentro de Flujo 8
- ⬜ P91 con síntomas nivel 3 → emergencia/911, sin pasar por pago
- ⬜ Variante con `correo`/`telefonoContacto`/`lugar_residencia` faltantes → P92/P93/P94
- ⬜ P95 con "tarjeta" (solo se probó "transferencia")
- ⬜ `consulta_origen_id` ≠ null → verificar `consulta_seguimiento_de` en la consulta creada

---

## Hallazgos / bugs encontrados

1. ✅ **(Corregido en docs)** `docs/flujos-bot.md` tenía Antecedentes (P14-P17)
   desactualizado — decía "patológicos / quirúrgicos / familiares / medicamentos
   habituales". Ahora refleja lo real: P14 hipertensión, P15 diabetes, P16 cirugías
   previas, P17 otros antecedentes/medicación.

2. ✅ **(Corregido en docs)** `docs/flujos-bot.md` mostraba un inexistente
   "Paso 59: Horario" en B2C. Ahora muestra correctamente P58 (síntomas) → P59
   (forma de pago: Transferencia/Tarjeta) → P60 (comprobante). El flujo B2C no
   pregunta horario de preferencia (sí lo hace consulta principal/B2B, P11).

3. ⚠️ **Posible código muerto: `webhook.js:164-167` (paso 99 "ya registrado").**
   Tras completar antecedentes (fin del Flujo B2B), `flujo-antecedentes.js` llama
   `eliminar(telefono)` y devuelve `terminar:true` — la sesión se borra, no queda
   en `paso 99`. El siguiente mensaje (sea "hola" o cualquier texto) cae a
   `procesarPaso(0,...)`, que **siempre** muestra el saludo de bienvenida P0 sin
   importar el contenido del mensaje. Revisé el resto de flujos (reagendar,
   seguimiento, seguimiento-pago, crónicas, call center) y **ninguno deja la
   sesión guardada en `paso: 99`** — la rama de `webhook.js` parece código muerto.
   Documentado en `docs/flujos-bot.md` sección 2. Pendiente decidir: limpiar la
   rama, o hacer que `flujo-antecedentes.js` deje la sesión en `paso: 99` en vez
   de eliminarla.

4. **P59 (B2C, forma de pago) con texto libre repite el prompt sin feedback.**
   Si el usuario escribe texto en vez de tocar "Transferencia"/"Tarjeta", el bot
   responde de nuevo "Por favor selecciona la forma de pago:" con los mismos
   botones — funcionalmente correcto (no rompe la sesión) pero sin explicar por
   qué se repite. UX menor, no bloqueante.

5. ✅ **(Documentado)** `docs/flujos-bot.md` no documentaba los pasos 90-97
   (`flujo-seguimiento-pago.js`), que se disparan desde `api/seguimiento-decision.js`
   cuando un médico aprueba una notificación de seguimiento — no desde "hola".
   Agregado como sección 8. También se corrigió la sección 6 (recordatorios): las
   respuestas "2"/"3" a "fin de tratamiento" **no** redirigen a "Reagendar" (paso 98)
   automáticamente — solo crean una notificación que el médico revisa manualmente.

## Datos de prueba a limpiar al terminar
- `clientes_b2b` "TEST QA" (`d68794f3-9f3e-4009-a466-0adbc405a8fb`) + su fila en `empleados_b2b` (cédula `1701234567`)
  - incluye revertir/eliminar el `codigo_acceso: "QATEST01"` agregado para el Flujo 4
- `pacientes`/`consultas`/`antecedentes`/`documentos`/`facturacion_b2c`/`planillaje_b2b` generados con cédulas `1701234567`, `1709876542`, `1705550000`, `1700000004` y teléfonos `593900000001-3`, `593900000010`
- `enfermedades_cronicas` fila `e7dcfef5-d82c-4526-aa11-40d86ef4960d` (hipertensión, cédula `1705550000`) + su(s) fila(s) en `registros_cronicos`
- `recordatorios` y `seguimiento_respuestas` de prueba para cédula `1701234567` (medicamento + fin_tratamiento), incluyendo la fila `e7c9bbd1-663f-47e5-9577-d1bfc7a87a8e`
- `notificaciones` generadas durante las pruebas: alertas de Flujo 4 (registro call center), Flujo 5 (emergencia nivel 3), Flujo 6 (categoría `medio`/`grave`, etiqueta `SEGUIMIENTO`, incluida `3403ba79-...`) y Flujo 8 (registro de seguimiento aprobado, B2B y B2C)
- `sesiones_bot`: verificar que no queden filas residuales para `593900000001-3` y `593900000010` (las pruebas de pasos 90/98/200 se sembraron y debieran haberse autoeliminado al `terminar:true`, pero conviene confirmar)
