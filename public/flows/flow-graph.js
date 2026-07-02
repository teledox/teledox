// ════════════════════════════════════════════════════════════════════════════
// MANIFIESTO DE FLUJOS DEL BOT — fuente de verdad del explorador visual (/flows).
//
// Cada flujo describe sus nodos (estados) de inicio a fin y las bifurcaciones.
// Lo consume:
//   • el navegador  → public/flows/index.html (tabs "Explorador" y "Mapa")
//   • el navegador  → public/flows/flow-map.js (deriva el mapa flujo→flujo)
//   • Node          → scripts/test-bot/validate-flow-graph.js (test de sincronía)
//
// ⚠️ SINCRONÍA: para los flujos con `validar: true`, un test cruza estos nodos
// contra los `paso === 'x'` reales del archivo fuente. Si agregas/renombras un
// estado en el código y no aquí (o viceversa), el test FALLA. Mantén ambos al día.
//
// `panel`: 'normal' (panel médico principal) | 'tracking' (servicio de tracking).
// `origen`: cómo se entra a este flujo cuando NO es por una rama de otro flujo
//   del manifiesto — 'chat' (paciente escribe "hola"), 'cron' (api/cron.js),
//   'medico' (acción del médico/agente en el panel), 'boton' (botón puntual de
//   WhatsApp no modelado como rama). Lo usa flow-map.js para no dejar flujos
//   "huérfanos" en el diagrama aunque nadie les apunte con una rama.
// `grupo`: agrupación para la pestaña "Mapa" — 'consulta' (captación/intake:
//   identificar paciente, tomar síntomas, triage) | 'seguimiento' (todo lo que
//   pasa después de que la consulta existe: pagos, recordatorios, tracking
//   diario). Las aristas que cruzan de un grupo al otro se muestran como chips
//   de conexión en vez de dibujarse dentro del mismo panel.
// Destinos sintéticos: _fin, _emergencia, _antecedentes, _laboratorio, _fuera_horario.
// `rama.salta_a`: fuerza el flujo destino de una rama para flow-map.js cuando el
//   `destino` es ambiguo (el mismo id de nodo existe en 2+ flujos, ej. "sintomas"
//   en consulta y b2c) o cuando el destino real no es un nodo del manifiesto
//   (ej. pregunta_consulta reinicia el flujo consulta en vez de solo terminar).
// ════════════════════════════════════════════════════════════════════════════

(function (root) {
  const FLOW_GRAPH = {

    // ══════════════════════ PANEL NORMAL ══════════════════════

    consulta: {
      panel: 'normal',
      nombre: 'Consulta principal',
      descripcion: 'Flujo central: identifica al paciente (B2B/empleado/particular), toma síntomas y agenda la teleconsulta.',
      archivo: 'src/flows/flujo-consulta.js',
      trigger: '"hola" (paciente sin caso de tracking)',
      origen: 'chat',
      grupo: 'consulta',
      validar: true,
      nodos: [
        { id: 'inicio', tipo: 'sistema', titulo: 'Bienvenida', mensaje: 'Saludo inicial; pide cédula o código de empresa.',
          ramas: [{ cond: 'siempre', destino: 'cedula' }] },
        { id: 'cedula', tipo: 'entrada', titulo: 'Cédula o código', mensaje: 'Ingrese su cédula (10 dígitos) o código de acceso de empresa.',
          ramas: [
            { cond: 'código de empresa', destino: 'cc_inicio', nota: 'redirige a call center' },
            { cond: 'cédula inválida', destino: 'cedula', nota: 're-pide' },
            { cond: 'paciente/empleado B2B', destino: 'consentimiento' },
            { cond: 'no registrado (particular)', destino: 'modalidad', nota: 'pasa a flujo B2C' },
          ] },
        { id: 'consentimiento', tipo: 'botones', titulo: 'Consentimiento de datos', mensaje: '¿Acepta el uso y tratamiento de sus datos personales con fines médicos?',
          ramas: [
            { cond: 'sí autorizo', destino: 'sintomas' },
            { cond: 'no autorizo', destino: '_fin' },
          ] },
        { id: 'sintomas', tipo: 'entrada', titulo: 'Síntomas', mensaje: '¿Cuál es el motivo de su consulta? Describa sus síntomas.',
          ramas: [
            { cond: 'nivel 3 (grave)', destino: '_emergencia' },
            { cond: 'nivel 2 B2C', destino: 'pago' },
            { cond: 'nivel 2 B2B', destino: '_fin', nota: 'atención prioritaria, notifica' },
            { cond: 'nivel 1 B2C', destino: 'pago' },
            { cond: 'nivel 1 B2B con datos completos', destino: 'confirmar_datos' },
            { cond: 'nivel 1 B2B sin datos', destino: 'nombre' },
          ] },
        { id: 'confirmar_datos', tipo: 'botones', titulo: '¿Usar mis datos?', mensaje: 'Tenemos sus datos registrados. ¿Usarlos o actualizarlos?',
          ramas: [
            { cond: 'usar', destino: 'prioridad' },
            { cond: 'actualizar', destino: 'nombre' },
          ] },
        { id: 'nombre', tipo: 'entrada', titulo: 'Nombre completo', mensaje: 'Nombre y apellidos completos (2 nombres y 2 apellidos).',
          ramas: [
            { cond: 'trae apellidos', destino: 'edad' },
            { cond: 'falta apellidos', destino: 'apellidos' },
          ] },
        { id: 'apellidos', tipo: 'entrada', titulo: 'Apellidos', mensaje: 'Indique sus dos apellidos (paterno y materno).',
          ramas: [{ cond: 'siempre', destino: 'edad' }] },
        { id: 'edad', tipo: 'entrada', titulo: 'Edad', mensaje: 'Edad.',
          ramas: [{ cond: 'siempre', destino: 'sexo' }] },
        { id: 'sexo', tipo: 'botones', titulo: 'Sexo biológico', mensaje: 'Sexo biológico (masculino / femenino).',
          ramas: [{ cond: 'siempre', destino: 'fecha_nacimiento' }] },
        { id: 'fecha_nacimiento', tipo: 'entrada', titulo: 'Fecha de nacimiento', mensaje: 'Fecha de nacimiento (DD/MM/AAAA).',
          ramas: [{ cond: 'siempre', destino: 'correo' }] },
        { id: 'correo', tipo: 'entrada', titulo: 'Correo', mensaje: 'Correo electrónico.',
          ramas: [{ cond: 'siempre', destino: 'confirmar_telefono' }] },
        { id: 'confirmar_telefono', tipo: 'botones', titulo: '¿Qué teléfono?', mensaje: '¿Usar este número o indicar otro?',
          ramas: [
            { cond: 'usar este', destino: 'residencia' },
            { cond: 'otro', destino: 'otro_telefono' },
          ] },
        { id: 'otro_telefono', tipo: 'entrada', titulo: 'Otro teléfono', mensaje: 'Número de teléfono a registrar.',
          ramas: [{ cond: 'siempre', destino: 'residencia' }] },
        { id: 'residencia', tipo: 'entrada', titulo: 'Residencia', mensaje: 'Lugar de residencia (ciudad y barrio).',
          ramas: [{ cond: 'siempre', destino: 'prioridad' }] },
        { id: 'prioridad', tipo: 'botones', titulo: 'Prioridad', mensaje: '¿Cuándo necesita la atención? (pronto / puedo esperar)',
          ramas: [
            { cond: 'B2C', destino: 'pago' },
            { cond: 'B2B fuera de horario', destino: '_fuera_horario' },
            { cond: 'B2B en horario', destino: 'finalizar', nota: 'crea consulta + notifica' },
          ] },
        { id: 'finalizar', tipo: 'botones', titulo: 'Fin / otra consulta', mensaje: '¡Consulta registrada! ¿Otra consulta o finalizar?',
          ramas: [
            { cond: 'otra consulta', destino: 'inicio' },
            { cond: 'finalizar (sin antecedentes)', destino: '_antecedentes' },
            { cond: 'finalizar (ya registrados)', destino: '_fin' },
          ] },
      ],
    },

    b2c: {
      panel: 'normal',
      nombre: 'Pago particular (B2C)',
      descripcion: 'Paciente no afiliado: elige seguro/pago directo, completa datos, paga $8 y sube comprobante.',
      archivo: 'src/flows/flujo-b2c.js',
      trigger: 'desde consulta cuando la cédula no está registrada',
      origen: 'salto',
      grupo: 'consulta',
      validar: true,
      nodos: [
        { id: 'inicio_b2c', tipo: 'lista', titulo: '¿Seguro o pago directo?', mensaje: 'No encontramos su cédula. ¿Cómo desea continuar?',
          ramas: [{ cond: 'siempre', destino: 'modalidad' }] },
        { id: 'modalidad', tipo: 'lista', titulo: 'Modalidad', mensaje: 'Seguro afiliado / pago directo $8.',
          ramas: [
            { cond: 'seguro', destino: 'nombre_seguro' },
            { cond: 'pago directo', destino: 'nombre' },
            { cond: 'inválido', destino: 'modalidad', nota: 're-muestra lista' },
          ] },
        { id: 'nombre_seguro', tipo: 'entrada', titulo: 'Nombre del seguro', mensaje: 'Nombre de su seguro médico o empresa.',
          ramas: [
            { cond: 'seguro aliado', destino: 'nombre', nota: 'modalidad b2b_externo' },
            { cond: 'no aliado', destino: 'confirmar_b2c' },
          ] },
        { id: 'confirmar_b2c', tipo: 'botones', titulo: '¿Pago directo?', mensaje: 'Su seguro no es aliado. ¿Continuar con pago directo ($8)?',
          ramas: [
            { cond: 'sí', destino: 'nombre' },
            { cond: 'no', destino: '_fin' },
          ] },
        { id: 'nombre', tipo: 'entrada', titulo: 'Nombre completo', mensaje: 'Nombre y apellidos completos.',
          ramas: [{ cond: 'siempre', destino: 'edad' }] },
        { id: 'edad', tipo: 'entrada', titulo: 'Edad', mensaje: 'Edad.',
          ramas: [{ cond: 'siempre', destino: 'sexo' }] },
        { id: 'sexo', tipo: 'botones', titulo: 'Sexo biológico', mensaje: 'Sexo biológico (masculino / femenino).',
          ramas: [{ cond: 'siempre', destino: 'correo' }] },
        { id: 'correo', tipo: 'entrada', titulo: 'Correo', mensaje: 'Correo electrónico.',
          ramas: [{ cond: 'siempre', destino: 'confirmar_telefono' }] },
        { id: 'confirmar_telefono', tipo: 'botones', titulo: '¿Qué teléfono?', mensaje: '¿Usar este número o indicar otro?',
          ramas: [
            { cond: 'usar este', destino: 'residencia' },
            { cond: 'otro', destino: 'otro_telefono' },
          ] },
        { id: 'otro_telefono', tipo: 'entrada', titulo: 'Otro teléfono', mensaje: 'Número de teléfono a registrar.',
          ramas: [{ cond: 'siempre', destino: 'residencia' }] },
        { id: 'residencia', tipo: 'entrada', titulo: 'Residencia', mensaje: 'Lugar de residencia.',
          ramas: [{ cond: 'siempre', destino: 'sintomas' }] },
        { id: 'sintomas', tipo: 'entrada', titulo: 'Síntomas', mensaje: 'Motivo de la consulta / síntomas.',
          ramas: [
            { cond: 'nivel 3 (grave)', destino: '_emergencia' },
            { cond: 'fuera de horario', destino: '_fuera_horario' },
            { cond: 'nivel 1-2', destino: 'pago' },
          ] },
        { id: 'pago', tipo: 'botones', titulo: 'Forma de pago ($8)', mensaje: '¿Transferencia o tarjeta?',
          ramas: [
            { cond: 'transferencia', destino: 'comprobante' },
            { cond: 'tarjeta', destino: 'comprobante' },
            { cond: 'texto libre', destino: 'pago', nota: 're-pide' },
          ] },
        { id: 'comprobante', tipo: 'media', titulo: 'Comprobante', mensaje: 'Envíe la captura completa del comprobante (validado por IA: monto, banco, referencia).',
          ramas: [
            { cond: 'comprobante válido', destino: 'finalizar', nota: 'crea consulta + factura' },
            { cond: 'inválido / duplicado', destino: 'comprobante', nota: 're-pide' },
          ] },
        { id: 'finalizar', tipo: 'botones', titulo: 'Fin / otra consulta', mensaje: '¡Pago confirmado! ¿Otra consulta o finalizar?',
          ramas: [
            { cond: 'otra consulta', destino: '_fin', nota: 'reinicia bienvenida' },
            { cond: 'finalizar (sin antecedentes)', destino: '_antecedentes' },
            { cond: 'finalizar (ya registrados)', destino: '_fin' },
          ] },
      ],
    },

    callcenter: {
      panel: 'normal',
      nombre: 'Call Center B2B',
      descripcion: 'Un agente registra consultas para múltiples pacientes de una empresa con código de acceso.',
      archivo: 'src/flows/flujo-callcenter.js',
      trigger: 'código de acceso de empresa en el flujo consulta',
      origen: 'salto',
      grupo: 'consulta',
      validar: true,
      nodos: [
        { id: 'cc_inicio', tipo: 'sistema', titulo: 'Bienvenida agente', mensaje: 'Modo call center; pide cédula del paciente.',
          ramas: [{ cond: 'siempre', destino: 'cc_cedula' }] },
        { id: 'cc_cedula', tipo: 'entrada', titulo: 'Cédula paciente', mensaje: 'Cédula de identidad del paciente.',
          ramas: [
            { cond: 'inválida', destino: 'cc_cedula', nota: 're-pide' },
            { cond: 'paciente existente', destino: 'cc_confirmar' },
            { cond: 'paciente nuevo', destino: 'cc_nombre' },
          ] },
        { id: 'cc_confirmar', tipo: 'botones', titulo: '¿Datos correctos?', mensaje: 'Paciente encontrado. ¿Los datos son correctos?',
          ramas: [
            { cond: 'sí', destino: 'cc_sintomas' },
            { cond: 'no', destino: 'cc_nombre' },
          ] },
        { id: 'cc_nombre', tipo: 'entrada', titulo: 'Nombre', mensaje: 'Nombre completo del paciente.',
          ramas: [{ cond: 'siempre', destino: 'cc_edad' }] },
        { id: 'cc_edad', tipo: 'entrada', titulo: 'Edad', mensaje: 'Edad del paciente.',
          ramas: [{ cond: 'siempre', destino: 'cc_nacimiento' }] },
        { id: 'cc_nacimiento', tipo: 'entrada', titulo: 'Fecha nacimiento', mensaje: 'Fecha de nacimiento (DD/MM/AAAA).',
          ramas: [{ cond: 'siempre', destino: 'cc_sexo' }] },
        { id: 'cc_sexo', tipo: 'botones', titulo: 'Sexo biológico', mensaje: 'Sexo biológico del paciente.',
          ramas: [{ cond: 'siempre', destino: 'cc_telefono' }] },
        { id: 'cc_telefono', tipo: 'entrada', titulo: 'Teléfono', mensaje: 'Teléfono del paciente (mín. 7 dígitos).',
          ramas: [
            { cond: 'inválido', destino: 'cc_telefono', nota: 're-pide' },
            { cond: 'válido', destino: 'cc_correo' },
          ] },
        { id: 'cc_correo', tipo: 'entrada', titulo: 'Correo', mensaje: 'Correo del paciente (o "no").',
          ramas: [{ cond: 'siempre', destino: 'cc_residencia' }] },
        { id: 'cc_residencia', tipo: 'entrada', titulo: 'Residencia', mensaje: 'Lugar de residencia del paciente.',
          ramas: [{ cond: 'siempre', destino: 'cc_sintomas' }] },
        { id: 'cc_sintomas', tipo: 'entrada', titulo: 'Síntomas', mensaje: 'Síntomas del paciente.',
          ramas: [
            { cond: 'nivel 3 (grave)', destino: 'cc_siguiente', nota: 'emergencia + ofrece otro paciente' },
            { cond: 'nivel 1-2', destino: 'cc_revisar' },
          ] },
        { id: 'cc_revisar', tipo: 'botones', titulo: 'Resumen', mensaje: 'Resumen de la consulta. ¿Confirmar o corregir?',
          ramas: [
            { cond: 'confirmar (en horario)', destino: 'cc_siguiente', nota: 'crea consulta + planillaje B2B' },
            { cond: 'confirmar (fuera horario)', destino: '_fuera_horario' },
            { cond: 'corregir', destino: 'cc_cedula' },
          ] },
        { id: 'cc_siguiente', tipo: 'botones', titulo: '¿Otro paciente?', mensaje: '¿Registrar otro paciente o finalizar sesión?',
          ramas: [
            { cond: 'otro paciente', destino: 'cc_cedula' },
            { cond: 'finalizar', destino: '_fin' },
          ] },
      ],
    },

    antecedentes: {
      panel: 'normal',
      nombre: 'Antecedentes / historia clínica',
      descripcion: 'Tras registrar la consulta, recoge antecedentes y genera el PDF de historia clínica.',
      archivo: 'src/flows/flujo-antecedentes.js',
      trigger: 'al finalizar consulta o B2C (paciente sin antecedentes)',
      origen: 'salto',
      grupo: 'consulta',
      validar: false,
      nota: 'Estados numéricos (13–17) no migrados a nombres.',
      nodos: [
        { id: 'alergias', tipo: 'entrada', titulo: 'Alergias', mensaje: '¿Tiene alergias conocidas? (No o descríbalas)',
          ramas: [{ cond: 'siempre', destino: 'hipertension' }] },
        { id: 'hipertension', tipo: 'entrada', titulo: 'Hipertensión', mensaje: '¿Tiene o ha tenido hipertensión arterial?',
          ramas: [{ cond: 'siempre', destino: 'diabetes' }] },
        { id: 'diabetes', tipo: 'entrada', titulo: 'Diabetes', mensaje: '¿Tiene o ha tenido diabetes?',
          ramas: [{ cond: 'siempre', destino: 'cirugias' }] },
        { id: 'cirugias', tipo: 'entrada', titulo: 'Cirugías', mensaje: '¿Ha tenido cirugías previas?',
          ramas: [{ cond: 'siempre', destino: 'otros' }] },
        { id: 'otros', tipo: 'entrada', titulo: 'Otros antecedentes', mensaje: '¿Otros antecedentes / medicación habitual?',
          ramas: [{ cond: 'siempre', destino: '_fin', nota: 'guarda + genera PDF' }] },
      ],
    },

    cronicas: {
      panel: 'normal',
      nombre: 'Seguimiento de crónicos',
      descripcion: 'Cuestionario diario por enfermedad (hipertensión, diabetes, EPOC, etc.) con evaluación de riesgo.',
      archivo: 'src/flows/flujo-cronicas.js',
      trigger: 'api/cron.js para pacientes con enfermedad crónica',
      origen: 'cron',
      grupo: 'seguimiento',
      validar: false,
      nota: 'Un solo estado `cronico`; las sub-preguntas viven en datos.paso_cronico (varían por enfermedad).',
      nodos: [
        { id: 'cronico', tipo: 'entrada', titulo: 'Cuestionario crónico', mensaje: 'Preguntas según la enfermedad (presión, glucosa, síntomas…).',
          ramas: [
            { cond: 'faltan preguntas', destino: 'cronico', nota: 'siguiente pregunta' },
            { cond: 'inválido', destino: 'cronico', nota: 're-pide' },
            { cond: 'nivel 1-2 al terminar', destino: '_fin', nota: 'registra; nivel 2 notifica' },
            { cond: 'nivel 3 al terminar', destino: '_emergencia' },
          ] },
      ],
    },

    seguimiento_pago: {
      panel: 'normal',
      nombre: 'Seguimiento aprobado (pago)',
      descripcion: 'El médico aprueba una consulta de seguimiento; el paciente agenda y, si no es B2B, paga $8.',
      archivo: 'src/flows/flujo-seguimiento-pago.js',
      trigger: 'api/seguimiento-decision.js cuando el médico aprueba',
      origen: 'medico',
      grupo: 'seguimiento',
      validar: true,
      nodos: [
        { id: 'sp_confirmar', tipo: 'botones', titulo: '¿Desea agendar?', mensaje: '¿Desea agendar la consulta de control?',
          ramas: [
            { cond: 'sí', destino: 'sp_sintomas' },
            { cond: 'no', destino: '_fin' },
          ] },
        { id: 'sp_sintomas', tipo: 'entrada', titulo: 'Síntomas actuales', mensaje: '¿Cómo se siente? ¿Persisten los síntomas?',
          ramas: [
            { cond: 'nivel 3 (grave)', destino: '_emergencia' },
            { cond: 'falta correo', destino: 'sp_correo' },
            { cond: 'falta teléfono', destino: 'sp_telefono' },
            { cond: 'falta residencia', destino: 'sp_residencia' },
            { cond: 'completo + B2B', destino: '_fin', nota: 'sin costo' },
            { cond: 'completo + B2C', destino: 'sp_pago' },
          ] },
        { id: 'sp_correo', tipo: 'entrada', titulo: 'Correo', mensaje: 'Correo electrónico.',
          ramas: [{ cond: 'falta teléfono', destino: 'sp_telefono' }, { cond: 'completo', destino: 'sp_pago' }] },
        { id: 'sp_telefono', tipo: 'entrada', titulo: 'Teléfono', mensaje: 'Teléfono de contacto.',
          ramas: [{ cond: 'falta residencia', destino: 'sp_residencia' }, { cond: 'completo', destino: 'sp_pago' }] },
        { id: 'sp_residencia', tipo: 'entrada', titulo: 'Residencia', mensaje: 'Lugar de residencia.',
          ramas: [{ cond: 'completo', destino: 'sp_pago' }] },
        { id: 'sp_pago', tipo: 'botones', titulo: 'Forma de pago ($8)', mensaje: '¿Transferencia o tarjeta?',
          ramas: [
            { cond: 'transferencia/tarjeta', destino: 'sp_comprobante' },
            { cond: 'texto libre', destino: 'sp_pago', nota: 're-pide' },
          ] },
        { id: 'sp_comprobante', tipo: 'media', titulo: 'Comprobante', mensaje: 'Envíe el comprobante (o "listo").',
          ramas: [{ cond: 'recibido', destino: '_fin', nota: 'crea consulta + factura' }] },
      ],
    },

    seg_med: {
      panel: 'normal',
      nombre: 'Recordatorio de medicamento',
      descripcion: 'Pregunta puntual si tomó un medicamento.',
      archivo: 'api/webhook.js (case seg_med)',
      trigger: 'api/cron.js (recordatorio de medicamento)',
      origen: 'cron',
      grupo: 'seguimiento',
      validar: false,
      nodos: [
        { id: 'seg_med', tipo: 'botones', titulo: '¿Ya lo tomó?', mensaje: '¿Ya tomó su medicamento (X)?',
          ramas: [
            { cond: 'sí', destino: '_fin', nota: 'registra tomo=true' },
            { cond: 'no', destino: '_fin', nota: 'registra + alerta incumplimiento' },
            { cond: 'otro', destino: 'seg_med', nota: 're-envía botones' },
          ] },
      ],
    },

    seg_fin_trat: {
      panel: 'normal',
      nombre: 'Fin de tratamiento',
      descripcion: 'Al terminar el tratamiento, evalúa el resultado.',
      archivo: 'api/webhook.js (case seg_fin_trat)',
      trigger: 'api/cron.js (fin de tratamiento)',
      origen: 'cron',
      grupo: 'seguimiento',
      validar: false,
      nodos: [
        { id: 'seg_fin_trat', tipo: 'botones', titulo: '¿Cómo se siente?', mensaje: '¿Cómo se siente después del tratamiento?',
          ramas: [
            { cond: 'mejor', destino: '_fin', nota: 'curado + alerta éxito' },
            { cond: 'sigo con síntomas', destino: '_fin', nota: 'notificación medio' },
            { cond: 'no mejoré', destino: '_fin', nota: 'notificación grave + alerta' },
            { cond: 'otro', destino: 'seg_fin_trat', nota: 're-envía botones' },
          ] },
      ],
    },

    seg_bienestar: {
      panel: 'normal',
      nombre: 'Bienestar (seguimiento)',
      descripcion: 'Check-in de bienestar 1-5 dentro del seguimiento de una consulta.',
      archivo: 'api/webhook.js (case seg_bienestar)',
      trigger: 'api/cron.js (bienestar de seguimiento)',
      origen: 'cron',
      grupo: 'seguimiento',
      validar: false,
      nodos: [
        { id: 'seg_bienestar', tipo: 'lista', titulo: 'Bienestar (1-5)', mensaje: '¿Cómo te sientes hoy? 1 Excelente … 5 Muy mal',
          ramas: [
            { cond: 'inválido', destino: 'seg_bienestar', nota: 're-muestra lista' },
            { cond: 'nivel 1-3', destino: '_fin' },
            { cond: 'nivel 4', destino: '_fin', nota: 'notificación medio' },
            { cond: 'nivel 5', destino: '_fin', nota: 'notificación grave + alerta' },
          ] },
      ],
    },

    seg_lab: {
      panel: 'normal',
      nombre: 'Recordatorio de laboratorio',
      descripcion: 'Pregunta si ya se hizo el examen; si sí, pasa a recibir el resultado.',
      archivo: 'api/webhook.js (case seg_lab)',
      trigger: 'api/cron.js (seguimiento de laboratorio)',
      origen: 'cron',
      grupo: 'seguimiento',
      validar: false,
      nodos: [
        { id: 'seg_lab', tipo: 'botones', titulo: '¿Ya se hizo el examen?', mensaje: '¿Ya se realizó el examen de laboratorio?',
          ramas: [
            { cond: 'sí lo hice', destino: '_laboratorio' },
            { cond: 'aún no', destino: '_fin' },
            { cond: 'otro', destino: 'seg_lab', nota: 're-envía botones' },
          ] },
      ],
    },

    laboratorio: {
      panel: 'normal',
      nombre: 'Subir resultado de laboratorio',
      descripcion: 'Recibe la foto/PDF del resultado de examen y lo registra en el expediente.',
      archivo: 'src/flows/flujo-seguimiento-laboratorio.js',
      trigger: 'tras confirmar el examen en seg_lab',
      origen: 'salto',
      grupo: 'seguimiento',
      validar: false,
      nota: 'Estado numérico (150) no migrado a nombre.',
      nodos: [
        { id: 'subir_examen', tipo: 'media', titulo: 'Resultado', mensaje: 'Envíe la foto o el PDF del resultado de laboratorio.',
          ramas: [
            { cond: 'archivo recibido', destino: '_fin', nota: 'registra documento "examen"' },
            { cond: 'no es archivo', destino: 'subir_examen', nota: 're-pide' },
          ] },
      ],
    },

    reagendar: {
      panel: 'normal',
      nombre: 'Reagendar consulta',
      descripcion: 'Ofrece agendar una consulta de control; si acepta, salta al flujo consulta en síntomas.',
      archivo: 'src/flows/flujo-reagendar.js',
      trigger: 'propuesta de reagendamiento (seguimiento)',
      origen: 'medico',
      grupo: 'seguimiento',
      validar: false,
      nota: 'Sin estados propios; al aceptar guarda `sintomas` en el flujo consulta.',
      nodos: [
        { id: 'reagendar', tipo: 'botones', titulo: '¿Agendar control?', mensaje: '¿Desea agendar una consulta de control?',
          ramas: [
            { cond: 'sí', destino: 'sintomas', salta_a: 'consulta', nota: 'reconstruye datos → flujo consulta (id "sintomas" también existe en b2c, desambiguado)' },
            { cond: 'no', destino: '_fin' },
          ] },
      ],
    },

    pregunta_consulta: {
      panel: 'normal',
      nombre: 'Pregunta o nueva consulta',
      descripcion: 'Menú para pacientes con consulta activa: enviar una pregunta al médico o iniciar una nueva consulta.',
      archivo: 'src/flows/flujo-pregunta-consulta.js',
      trigger: 'mensaje del paciente con consulta en curso',
      origen: 'chat',
      grupo: 'seguimiento',
      validar: true,
      nodos: [
        { id: 'pq_inicio', tipo: 'botones', titulo: '¿Pregunta o consulta?', mensaje: '¿Tiene una pregunta o desea una nueva consulta?',
          ramas: [
            { cond: 'pregunta', destino: 'pq_texto' },
            { cond: 'nueva consulta', destino: '_fin', salta_a: 'consulta', nota: 'termina esta sesión y relanza el flujo consulta desde cero' },
            { cond: 'inválido', destino: 'pq_inicio', nota: 're-envía botones' },
          ] },
        { id: 'pq_texto', tipo: 'entrada', titulo: 'Texto de la pregunta', mensaje: 'Escriba su pregunta para el médico.',
          ramas: [{ cond: 'siempre', destino: '_fin', nota: 'envía pregunta al médico' }] },
      ],
    },

    emergencia: {
      panel: 'normal',
      nombre: 'Emergencia',
      descripcion: 'Síntomas de riesgo vital: ofrece llamar al 911 o iniciar una consulta urgente con pago.',
      archivo: 'api/webhook.js (case emergencia)',
      trigger: 'síntomas nivel 3 en cualquier flujo',
      origen: 'salto',
      grupo: 'consulta',
      validar: false,
      nodos: [
        { id: 'emergencia', tipo: 'botones', titulo: 'Riesgo vital', mensaje: 'Sus síntomas indican riesgo vital. ¿Llamar al 911 o consulta urgente?',
          ramas: [
            { cond: 'llamar 911', destino: '_fin' },
            { cond: 'consulta urgente', destino: 'em_cedula' },
          ] },
        { id: 'em_cedula', tipo: 'entrada', titulo: 'Cédula urgente', mensaje: 'Ingrese su cédula para la consulta urgente.',
          ramas: [{ cond: 'válida', destino: 'pago', nota: 'pasa a pago $8' }] },
      ],
    },

    // ══════════════════════ PANEL TRACKING ══════════════════════

    tracking: {
      panel: 'tracking',
      nombre: 'Tracking diario (bienestar / medicación)',
      descripcion: 'Check-in diario. El comportamiento depende de datos.tipo (no de paso).',
      archivo: 'src/flows/flujo-tracking.js',
      trigger: 'api/cron.js o "hola" con caso de tracking activo',
      origen: 'cron',
      grupo: 'seguimiento',
      validar: false,
      nota: 'Ramifica por datos.tipo y el valor del mensaje, no por `paso`.',
      nodos: [
        { id: 'bienestar', tipo: 'lista', titulo: 'Bienestar (1-5)', mensaje: '¿Cómo te sientes hoy? 1 Muy bien … 5 Muy mal',
          ramas: [
            { cond: 'inválido', destino: 'bienestar', nota: 're-muestra lista' },
            { cond: 'nivel 1-2', destino: '_fin' },
            { cond: 'nivel 3', destino: '_fin', nota: 'nivel alerta 2' },
            { cond: 'nivel 4-5', destino: '_fin', nota: 'caso → alerta' },
            { cond: 'biométricos activos', destino: 'bio_altura', nota: 'encadena registro biométrico' },
          ] },
        { id: 'med_reminder', tipo: 'botones', titulo: 'Medicación', mensaje: '¿Ya tomó su medicación?',
          ramas: [
            { cond: 'no reconocido', destino: 'med_reminder', nota: 're-envía botones' },
            { cond: 'sí tomó', destino: '_fin' },
            { cond: 'no tomó', destino: '_fin' },
          ] },
      ],
    },

    tracking_biometrico: {
      panel: 'tracking',
      nombre: 'Registro biométrico',
      descripcion: 'Encadenado tras el check-in de bienestar cuando el caso tiene biométricos activos.',
      archivo: 'src/flows/flujo-biometricos.js',
      trigger: 'webhook tras tracking si biometricos_activos',
      origen: 'salto',
      grupo: 'seguimiento',
      validar: true,
      nodos: [
        { id: 'bio_altura', tipo: 'entrada', titulo: 'Altura (1 vez)', mensaje: 'Altura en cm (solo se pregunta una vez).',
          ramas: [
            { cond: 'fuera de 100-220', destino: 'bio_altura', nota: 're-pide' },
            { cond: 'válida', destino: 'bio_presion' },
          ] },
        { id: 'bio_presion', tipo: 'entrada', titulo: 'Presión', mensaje: 'Presión 120/80 (o "no medí").',
          ramas: [
            { cond: 'formato inválido', destino: 'bio_presion', nota: 're-pide' },
            { cond: 'válida o "no medí"', destino: 'bio_glucosa' },
          ] },
        { id: 'bio_glucosa', tipo: 'entrada', titulo: 'Glucosa', mensaje: 'Glucosa mg/dL (o "no medí").',
          ramas: [
            { cond: 'fuera de 40-600', destino: 'bio_glucosa', nota: 're-pide' },
            { cond: 'válida o "no medí"', destino: 'bio_peso' },
          ] },
        { id: 'bio_peso', tipo: 'entrada', titulo: 'Peso', mensaje: 'Peso kg (o "no medí").',
          ramas: [
            { cond: 'fuera de 20-350', destino: 'bio_peso', nota: 're-pide' },
            { cond: 'válido o "no medí"', destino: 'bio_colesterol' },
          ] },
        { id: 'bio_colesterol', tipo: 'entrada', titulo: 'Colesterol', mensaje: 'Colesterol total mg/dL (o "no sé").',
          ramas: [
            { cond: 'fuera de 100-500', destino: 'bio_colesterol', nota: 're-pide' },
            { cond: 'válido o "no sé"', destino: '_fin', nota: 'calcula score y cierra' },
          ] },
      ],
    },

    psicosocial: {
      panel: 'tracking',
      nombre: 'Evaluación psicosocial',
      descripcion: 'Cuestionario anónimo de bienestar laboral (15 preguntas, 5 dimensiones MRL Ecuador).',
      archivo: 'src/flows/flujo-psicosocial.js',
      trigger: 'api/cron.js (evaluación psicosocial programada)',
      origen: 'cron',
      grupo: 'seguimiento',
      validar: false,
      nota: 'Estado numérico incremental (1→15).',
      nodos: [
        { id: 'cuestionario', tipo: 'lista', titulo: 'Pregunta N de 15', mensaje: 'Cada pregunta se responde con frecuencia 1 (Nunca) … 5 (Siempre).',
          ramas: [
            { cond: 'inválido', destino: 'cuestionario', nota: 're-pide' },
            { cond: 'quedan preguntas', destino: 'cuestionario', nota: 'siguiente (paso+1)' },
            { cond: 'última pregunta', destino: '_fin', nota: 'calcula score por dimensión y cierra' },
          ] },
      ],
    },

    tracking_migracion: {
      panel: 'tracking',
      nombre: 'Migración tracking → consulta',
      descripcion: 'Un paciente de tracking acepta migrar a una consulta MediLyft.',
      archivo: 'src/flows/flujo-tracking-consulta.js',
      trigger: 'el paciente pulsa "Consulta médica" en tracking',
      origen: 'boton',
      grupo: 'seguimiento',
      validar: true,
      nodos: [
        { id: 'tm_inicio', tipo: 'botones', titulo: '¿Tienes cédula?', mensaje: '¿Tienes número de cédula ecuatoriana?',
          ramas: [
            { cond: 'sí la tengo', destino: 'tm_cedula' },
            { cond: 'no / extranjero', destino: '_fin', nota: 'instrucciones flujo B2C' },
            { cond: 'inesperada', destino: 'tm_inicio', nota: 're-envía botones' },
          ] },
        { id: 'tm_cedula', tipo: 'entrada', titulo: 'Cédula', mensaje: 'Ingresa tu cédula (10 dígitos).',
          ramas: [
            { cond: 'inválida', destino: 'tm_cedula', nota: 're-pide' },
            { cond: 'paciente existente + fuera horario', destino: '_fuera_horario' },
            { cond: 'paciente existente + en horario', destino: '_fin', nota: 'crea consulta, caso → derivado' },
            { cond: 'paciente nuevo', destino: 'tm_sexo' },
          ] },
        { id: 'tm_sexo', tipo: 'botones', titulo: 'Sexo biológico', mensaje: 'Sexo biológico (masculino / femenino).',
          ramas: [
            { cond: 'fuera horario', destino: '_fuera_horario' },
            { cond: 'en horario', destino: '_fin', nota: 'crea paciente + consulta, caso → derivado' },
          ] },
      ],
    },

  };

  if (typeof module !== 'undefined' && module.exports) module.exports = FLOW_GRAPH;
  else root.FLOW_GRAPH = FLOW_GRAPH;
})(typeof self !== 'undefined' ? self : this);
