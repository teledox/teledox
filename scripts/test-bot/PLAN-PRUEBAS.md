# Plan de pruebas — Flujos del bot WhatsApp (MediLyft)

> Runner automatizado: `node --env-file=.env.local scripts/test-bot/run.js`
> WhatsApp mockeado, Supabase real. Semilla y teardown automáticos.
>
> Estado actual: **40 escenarios / 105 assertions + validación de manifiesto — todo verde** (2026-06-25)
>
> El runner también corre `validate-flow-graph.js`: verifica que el manifiesto
> [public/flows/flow-graph.js](../../public/flows/flow-graph.js) esté sincronizado
> con los `paso === 'x'` del código (flujos con `validar: true`).

## Convenciones
- ✅ cubierto por escenario automatizado en `scenarios.js`
- ⚠️ probado manualmente con observación (ver Hallazgos)
- ⬜ pendiente de automatizar
- ❌ falla confirmada

---

## Flujo 1 — Consulta principal (B2B / B2C)

| # | Estado del bot | Escenario | Notas |
|---|---|:---:|---|
| 1 | `0` → "hola" → pide cédula | ✅ E1, E9 | |
| 2 | `cedula` → ingresa cédula B2B | ✅ E1, E9 | Verifica empleado → autorización |
| 3 | `cedula` → ingresa cédula B2C (no registrada) | ✅ E19 | → lista "¿seguro o pago directo?" |
| 4 | `autorizacion` → consentimiento datos | ✅ E1 | Botones `si`/`no` |
| 5 | `autorizacion` → rechaza → fin | ✅ E9 | |
| 6 | `sintomas` → describe síntomas nivel 1 | ✅ E1 | → `datosCompletos` → confirma |
| 7 | `confirmar` → `confirmar` → crea consulta | ✅ E1 | |
| 8 | `finalizar` → `otra_consulta` → reinicia | ✅ E10 | |
| 9 | `finalizar` → `finalizar` → antecedentes | ✅ E1 | |
| 10 | Teléfono alterno `otro` | ⬜ | No automatizado |
| 11 | `confirmar` → `corregir` → reingresa datos | ⬜ | No automatizado |

## Flujo 2 — Antecedentes médicos

| # | Estado del bot | Escenario | Notas |
|---|---|:---:|---|
| 1 | `alergias` → no | ✅ E1, E2 | |
| 2 | `hipertension` → no | ✅ E1 | |
| 3 | `diabetes` → no | ✅ E1 | |
| 4 | `cirugia` → no | ✅ E1 | |
| 5 | `medicamentos` → no → guarda, genera PDF, fin | ✅ E1 | |
| 6 | Antecedentes ya existen → no repregunta | ✅ E20 | |

## Flujo 3 — B2C (pago directo / seguro externo)

| # | Estado del bot | Escenario | Notas |
|---|---|:---:|---|
| 1 | `modalidad` → lista pago directo | ✅ E2 | |
| 2 | `modalidad` → lista seguro aliado (BUPA) | ✅ E21 | → `modalidad: b2b_externo`, pide nombre directamente |
| 3 | `modalidad` → lista seguro no aliado | ⬜ | Pendiente |
| 4 | `nombre` → nombre completo | ✅ E2 | |
| 5 | `edad` → edad | ✅ E2 | |
| 6 | `sexo` → botón sexo biológico | ✅ E2 | Nuevo campo |
| 7 | `correo` → correo | ✅ E2 | |
| 8 | `telefono` → ¿usar este número? | ✅ E2 | |
| 9 | `residencia` → residencia | ✅ E2 | |
| 10 | `sintomas` → síntomas nivel 1 | ✅ E2 | → pago |
| 11 | `sintomas` → síntomas nivel 2 | ✅ E22 | Alerta pero continúa a pago |
| 12 | `sintomas` → síntomas nivel 3 | ⬜ | Pendiente (emergencia, corta flujo) |
| 13 | `pago` → transferencia | ✅ E2 | |
| 14 | `pago` → tarjeta | ✅ E11 | |
| 15 | `pago` → texto libre → repite prompt | ✅ E23 | Sin feedback explícito, funcional |
| 16 | `comprobante` → imagen real | ✅ E2 | |
| 17 | `comprobante` → texto en lugar de foto | ✅ E12 | |
| 18 | `cedula` → paciente ya registrado con B2C → requiere pago | ✅ E19 | No bypass de pago |

## Flujo 4 — Call Center B2B

| # | Estado del bot | Escenario | Notas |
|---|---|:---:|---|
| 1 | `0` → "hola" → detecta código empresa | ✅ E3 | `codigo_acceso: QATEST01` |
| 2 | `cc_inicio` → bienvenida agente | ✅ E3 | |
| 3 | `cc_cedula` → cédula paciente nuevo | ✅ E3 | |
| 4 | `cc_cedula` → cédula inválida (< 10 dígitos) | ✅ E26 | Repide, no avanza |
| 5 | `cc_cedula` → cédula inválida (dígito verificador) | ✅ E26 | |
| 6 | `cc_cedula` → paciente existente → `cc_confirmar` | ✅ E13 | Muestra datos existentes |
| 7 | `cc_confirmar` → `si` → `cc_sintomas` | ✅ E13 | |
| 8 | `cc_confirmar` → `no` → `cc_nombre` | ⬜ | Pendiente |
| 9 | `cc_nombre` → nombre | ✅ E3 | |
| 10 | `cc_edad` → edad | ✅ E3 | |
| 11 | `cc_nacimiento` → fecha de nacimiento | ✅ E3 | |
| 12 | `cc_sexo` → sexo biológico | ✅ E3 | Nuevo campo |
| 13 | `cc_telefono` → teléfono | ✅ E3 | |
| 14 | `cc_correo` → correo | ✅ E3 | |
| 15 | `cc_residencia` → residencia | ✅ E3 | |
| 16 | `cc_sintomas` → síntomas nivel 1 → resumen | ✅ E3 | |
| 17 | `cc_sintomas` → síntomas nivel 3 → emergencia, sin resumen | ⬜ | Pendiente |
| 18 | `cc_revisar` → `confirmar` → crea consulta → `cc_siguiente` | ✅ E3 | |
| 19 | `cc_revisar` → `corregir` → vuelve a `cc_cedula` | ✅ E24 | |
| 20 | `cc_siguiente` → `si` → pide cédula siguiente | ✅ E25 | |
| 21 | `cc_siguiente` → `no` → fin | ✅ E3 | |

## Flujo 5 — Enfermedades crónicas

> Setup: paciente `1705550000` con `enfermedades_cronicas` (hipertensión). Sesión seeded en `cronico`.

| # | Estado del bot | Escenario | Notas |
|---|---|:---:|---|
| 1 | `cronico` → presión sistólica | ✅ E4, E5, E14 | |
| 2 | `cronico` → presión diastólica | ✅ E4, E5, E14 | |
| 3 | `cronico` → síntomas (1/2/3) | ✅ E4, E5, E14 | |
| 4 | Nivel 1 → normal, fin | ✅ E4 | |
| 5 | Nivel 2 → advertencia, crea consulta | ✅ E14 | |
| 6 | Nivel 3 → emergencia, alerta | ✅ E5 | |
| 7 | Input inválido (texto) → repide número | ✅ E15 | |
| 8 | Sesión interrumpida a medias | ⬜ | Complejo, pendiente |

## Flujo 6 — Recordatorios de seguimiento

> No usa paso. Interceptado por `buscarRespuestaPendiente` antes del enrutamiento principal.

| # | Caso | Estado | Notas |
|---|---|:---:|---|
| 1 | Medicamento — "Sí" tomó | ⚠️ | Probado manualmente (sesión previa) |
| 2 | Medicamento — "No" tomó | ⚠️ | Probado manualmente |
| 3 | Fin de tratamiento — "1" (mejor) | ⚠️ | Probado manualmente |
| 4 | Fin de tratamiento — "2" (mejoró, aún síntomas) | ⚠️ | Crea notificación, no redirige a reagendar |
| 5 | Fin de tratamiento — "3" (no mejoró) | ⚠️ | Crea notificación, alerta |
| 6 | Respuesta inválida → repite menú | ⬜ | Pendiente |
| 7 | Recordatorio con `created_at` > 48h → no intercepta | ⬜ | Pendiente |
| 8 | Paciente con sesión activa (`enFlujoConsulta=true`) | ⬜ | Pendiente |

## Flujo Tracking — Recordatorio de medicación (`med_reminder`)

> Seeded directamente con `_flujo:'tracking', tipo:'med_reminder'`. Requiere `tracking_caso`
> activo en DB (`telefono: '593990000200'`, creado en globalSetup).

| # | Estado / botón | Escenario | Notas |
|---|---|:---:|---|
| 1 | Botón "1" (Sí, ya tomé) → registra + mensaje éxito | ✅ E31 | `nivel_alerta: 1` |
| 2 | Botón "2" (No todavía) → registra + recordatorio | ✅ E32 | `nivel_alerta: 2` |
| 3 | Texto libre → no reconocido → repide botones | ✅ E33 | |
| 4 | Texto libre luego botón válido | ✅ E33 | |

## Flujo Tracking — Bienestar con biométrico encadenado

> Cuando `datos.biometricos_activos: true`, después del check-in el webhook
> envía automáticamente el mensaje de registro biométrico (sin input del usuario).

| # | Caso | Escenario | Notas |
|---|---|:---:|---|
| 1 | Bienestar + bio activo → encadena mensaje de altura | ✅ E34 | Captura ambos mensajes en el mismo `popLog` |
| 2 | Bienestar + bio activo + altura ya guardada → pide presión | ⬜ | Pendiente |

## Flujo Tracking — Registro biométrico (`bio_altura` → … → `bio_colesterol`)

> Seeded con `_flujo:'tracking_biometrico'` + estado nombrado. Requiere
> `tracking_caso` activo (`telefono: '593990000200'`).

| # | Estado | Escenario | Notas |
|---|---|:---:|---|
| 1 | `bio_altura` → presión → glucosa → peso → colesterol → score | ✅ E39 | Cadena completa |
| 2 | `bio_presion` → "no medí" salta el valor | ✅ E40 | |

## Flujo Tracking — Migración tracking → consulta MediLyft

> Seeded con estado nombrado `tm_inicio` / `tm_cedula` (migrado desde 410/411).

| # | Estado | Caso | Escenario | Notas |
|---|---|---|:---:|---|
| 1 | `tm_inicio` | `propuesta_cedula_si` → pide cédula | ✅ E35 | |
| 2 | `tm_inicio` | `propuesta_cedula_no` → instrucciones B2C | ✅ E36 | |
| 3 | `tm_inicio` | Respuesta inesperada → repide botones | ✅ E37 | |
| 4 | `tm_cedula` | Cédula inválida (< 10 dígitos) → repide | ✅ E38 | |
| 5 | `tm_cedula` | Cédula válida, paciente existente → crea consulta, estado `derivado` | ✅ E38 | |
| 6 | `tm_cedula` | Cédula válida, paciente nuevo → crea paciente + consulta | ⬜ | Pendiente (necesita cédula inexistente) |

## Flujo 7 — Reagendar

> No llega desde "hola". Seeded con `_flujo: 'reagendar'` + `paciente_id`.

| # | Estado del bot | Escenario | Notas |
|---|---|:---:|---|
| 1 | `reagendar` → "sí" → pide síntomas | ✅ E27 | Reconstruye datos del paciente |
| 2 | `reagendar` → "no" → despedida | ✅ E28 | |

## Flujo 8 — Seguimiento aprobado por médico

> Seeded desde `api/seguimiento-decision.js` en `sp_confirmar`.

| # | Estado del bot | Escenario | Notas |
|---|---|:---:|---|
| 1 | `sp_confirmar` → `si` | ✅ E6 | |
| 2 | `sp_confirmar` → `no` → fin | ✅ E16 | |
| 3 | `sp_sintomas` → síntomas nivel 1 | ✅ E6 | |
| 4 | `sp_sintomas` → síntomas nivel 3 → emergencia/911 | ✅ E29 | |
| 5 | Datos completos (correo/tel/residencia) → salta `sp_correo/telefono/residencia` | ✅ E6 | |
| 6 | Datos incompletos → pide correo (`sp_correo`) | ✅ E30 | |
| 7 | Datos incompletos → pide teléfono (`sp_telefono`) | ⬜ | Pendiente |
| 8 | Datos incompletos → pide residencia (`sp_residencia`) | ⬜ | Pendiente |
| 9 | B2B (con `cliente_b2b_id`) → consulta sin costo | ✅ E6 | |
| 10 | B2C → `sp_pago` → transferencia | ✅ E19 | |
| 11 | B2C → `sp_pago` → tarjeta | ⬜ | Solo se probó transferencia |
| 12 | `sp_comprobante` → imagen → crea consulta + facturación | ⬜ | Cubierto indirectamente en E2 |

---

## Hallazgos / bugs

1. **Pre-existente:** `invalid input syntax for type uuid: "undefined"` al generar PDF de
   historia clínica en escenario B2C (E2). El `paciente_id` es `undefined` en el path
   B2C durante antecedentes. El test pasa (el error se captura internamente), pero el PDF
   no se genera. Pendiente investigar el origen en `flujo-antecedentes.js`.

2. **`sp_confirmar`/`no` → código muerto potencial:** `webhook.js` rama `paso 99`
   no es alcanzable desde ningún flujo actual — todos terminan con `eliminar(telefono)`
   o `terminar: true`. Pendiente decidir si limpiar o reutilizar.

3. **Flujo 3 `pago` con texto libre** (E23): el bot repite el prompt sin explicar el error.
   UX menor, no bloqueante.

4. **Flujo 7 (`reagendar`):** tras aceptar, el bot pide síntomas nuevamente aunque el
   paciente ya tenga todos sus datos en `pacientes`. Esto es redundante pero funcional.
   `nuevosDatos` en `flujo-reagendar.js:9-26` no incluye `nombreCompleto`/`correo`/etc.
   del paciente, así que `datosCompletos` es `false` y arranca el cuestionario desde cero.

5. **✅ CORREGIDO — flujo biométrico roto.** El webhook guardaba la sesión en
   `'bio_altura'`/`'bio_presion'` (nombres) pero `flujo-biometricos.js` chequeaba
   `419`/`420` (números). Al responder el paciente caía en *"algo salió mal"*.
   Migrado a estados nombrados (`bio_altura`, `bio_presion`, `bio_glucosa`,
   `bio_peso`, `bio_colesterol`). Cubierto por E39/E40.

6. **✅ CORREGIDO — `tracking_migracion` roto.** Mismo patrón: el webhook guardaba
   `'tm_inicio'` pero el flujo chequeaba `410`. Migrado a `tm_inicio`/`tm_cedula`.

7. **✅ CORREGIDO — `reagendar` roto.** Guardaba `paso: 3` bajo el flujo `consulta`,
   pero consulta usa estados nombrados → `3` no está en `ESTADOS_VALIDOS` y reseteaba
   a pedir cédula. Migrado a `paso: 'sintomas'`.

8. **✅ CORREGIDO — `pregunta_consulta` roto.** El webhook guardaba `'pq_inicio'` pero
   el flujo chequeaba `500`/`501`. Migrado a `pq_inicio`/`pq_texto`.

   Los cuatro bugs (5–8) venían de la migración a estados nombrados y los habría
   cazado el validador del manifiesto (ahora en el suite).

9. **Tests deterministas por horario.** El server de pruebas fuerza
   `estaEnHorario → true` ([server.js](server.js)); sin esto, correr de noche
   ruteaba consulta/b2c/callcenter a "fuera de horario" y rompía ~30 aserciones.

---

## Pendientes de mayor prioridad

| Flujo | Pendiente |
|---|---|
| F3 | Seguro no aliado → rechaza → pago directo |
| F3 | Síntomas nivel 3 en B2C → emergencia |
| F4 | `cc_confirmar` → `no` → reinicia datos manualmente |
| F4 | `cc_sintomas` nivel 3 → emergencia sin resumen |
| F6 | Respuesta inválida a recordatorio → repite menú |
| F8 | `sp_telefono` y `sp_residencia` cuando faltan |
| F8 | `sp_pago` → tarjeta |
