// ════════════════════════════════════════════════════════════════════════════
// MANIFIESTO DE FLUJOS DEL BOT — fuente de verdad del explorador visual (/flows).
//
// Cada flujo describe sus nodos (estados) de inicio a fin y las bifurcaciones.
// Lo consume:
//   • el navegador  → public/flows/index.html (tab "Explorador")
//   • Node          → scripts/test-bot/validate-flow-graph.js (test de sincronía)
//
// ⚠️ SINCRONÍA: para los flujos con `validar: true`, un test cruza estos nodos
// contra los `paso === 'x'` reales del archivo fuente. Si agregas/renombras un
// estado en el código y no aquí (o viceversa), el test FALLA. Mantén ambos al día.
//
// Alcance actual: flujos de seguimiento + tracking. (b2c, callcenter, consulta,
// antecedentes, cronicas, reagendar → pendientes de mapear.)
// ════════════════════════════════════════════════════════════════════════════

(function (root) {
  const FLOW_GRAPH = {

    seguimiento_pago: {
      nombre: 'Seguimiento aprobado (pago)',
      descripcion: 'El médico aprueba una consulta de seguimiento; el paciente decide agendar y, si no es B2B, paga $8.',
      archivo: 'src/flows/flujo-seguimiento-pago.js',
      trigger: 'api/seguimiento-decision.js cuando el médico aprueba la notificación',
      validar: true,
      nodos: [
        { id: 'sp_confirmar', tipo: 'botones', titulo: '¿Desea agendar?',
          mensaje: 'El Dr./Dra. revisó su evolución y propone una consulta de control. ¿Desea agendarla?',
          ramas: [
            { cond: 'sí', destino: 'sp_sintomas' },
            { cond: 'no', destino: '_fin', nota: 'elimina sesión y despide' },
          ] },
        { id: 'sp_sintomas', tipo: 'entrada', titulo: 'Síntomas actuales',
          mensaje: '¿Cómo se siente actualmente? ¿Persisten los síntomas o han cambiado?',
          ramas: [
            { cond: 'nivel 3 (grave)', destino: '_emergencia', nota: 'pasa a flujo emergencia (911 / consulta urgente)' },
            { cond: 'falta correo', destino: 'sp_correo' },
            { cond: 'falta teléfono', destino: 'sp_telefono' },
            { cond: 'falta residencia', destino: 'sp_residencia' },
            { cond: 'datos completos + B2B', destino: '_fin', nota: 'consulta sin costo, cubierta por empresa' },
            { cond: 'datos completos + B2C', destino: 'sp_pago' },
          ] },
        { id: 'sp_correo', tipo: 'entrada', titulo: 'Correo',
          mensaje: 'Correo electrónico:',
          ramas: [{ cond: 'sigue faltando dato', destino: 'sp_telefono' }, { cond: 'completo', destino: 'sp_pago' }] },
        { id: 'sp_telefono', tipo: 'entrada', titulo: 'Teléfono',
          mensaje: 'Indíquenos un número de teléfono de contacto:',
          ramas: [{ cond: 'falta residencia', destino: 'sp_residencia' }, { cond: 'completo', destino: 'sp_pago' }] },
        { id: 'sp_residencia', tipo: 'entrada', titulo: 'Residencia',
          mensaje: 'Indíquenos su lugar de residencia (ciudad y barrio):',
          ramas: [{ cond: 'completo', destino: 'sp_pago' }] },
        { id: 'sp_pago', tipo: 'botones', titulo: 'Forma de pago ($8)',
          mensaje: 'Para su consulta de seguimiento, el costo es $8.00. ¿Cómo desea pagar?',
          ramas: [
            { cond: 'transferencia', destino: 'sp_comprobante' },
            { cond: 'tarjeta', destino: 'sp_comprobante' },
            { cond: 'texto libre', destino: 'sp_pago', nota: 'repite el prompt' },
          ] },
        { id: 'sp_comprobante', tipo: 'media', titulo: 'Comprobante',
          mensaje: 'Envíe la foto/captura del comprobante (o escriba "listo").',
          ramas: [{ cond: 'comprobante recibido', destino: '_fin', nota: 'crea consulta + facturación + alerta' }] },
      ],
    },

    tracking_biometrico: {
      nombre: 'Registro biométrico',
      descripcion: 'Encadenado tras el check-in de bienestar cuando el caso tiene biométricos activos.',
      archivo: 'src/flows/flujo-biometricos.js',
      trigger: 'webhook.js tras procesarTracking si datos.biometricos_activos',
      validar: true,
      nodos: [
        { id: 'bio_altura', tipo: 'entrada', titulo: 'Altura (1 sola vez)',
          mensaje: '¿Cuánto mides? Escribe el número en cm (ej: 170). Solo se pregunta una vez.',
          ramas: [
            { cond: 'fuera de 100-220', destino: 'bio_altura', nota: 're-pide' },
            { cond: 'válida', destino: 'bio_presion' },
          ] },
        { id: 'bio_presion', tipo: 'entrada', titulo: 'Presión arterial',
          mensaje: '¿Pudiste medir tu presión hoy? Escríbela 120/80. Si no, "no medí".',
          ramas: [
            { cond: 'formato inválido', destino: 'bio_presion', nota: 're-pide' },
            { cond: 'válida o "no medí"', destino: 'bio_glucosa' },
          ] },
        { id: 'bio_glucosa', tipo: 'entrada', titulo: 'Glucosa',
          mensaje: '¿Mediste tu glucosa hoy? Valor en mg/dL (ej: 98). Si no, "no medí".',
          ramas: [
            { cond: 'fuera de 40-600', destino: 'bio_glucosa', nota: 're-pide' },
            { cond: 'válida o "no medí"', destino: 'bio_peso' },
          ] },
        { id: 'bio_peso', tipo: 'entrada', titulo: 'Peso',
          mensaje: '¿Cuánto pesaste hoy? Valor en kg (ej: 72.5). Si no, "no medí".',
          ramas: [
            { cond: 'fuera de 20-350', destino: 'bio_peso', nota: 're-pide' },
            { cond: 'válido o "no medí"', destino: 'bio_colesterol' },
          ] },
        { id: 'bio_colesterol', tipo: 'entrada', titulo: 'Colesterol',
          mensaje: '¿Resultado reciente de colesterol total? mg/dL (ej: 185). Si no, "no sé".',
          ramas: [
            { cond: 'fuera de 100-500', destino: 'bio_colesterol', nota: 're-pide' },
            { cond: 'válido o "no sé"', destino: '_fin', nota: 'calcula score y cierra (alerta si corresponde)' },
          ] },
      ],
    },

    tracking_migracion: {
      nombre: 'Migración tracking → consulta',
      descripcion: 'Un paciente de tracking acepta migrar a una consulta MediLyft.',
      archivo: 'src/flows/flujo-tracking-consulta.js',
      trigger: 'webhook.js cuando el paciente pulsa "Consulta médica" (tracking_consulta)',
      validar: true,
      nodos: [
        { id: 'tm_inicio', tipo: 'botones', titulo: '¿Tienes cédula?',
          mensaje: '¿Tienes número de cédula ecuatoriana?',
          ramas: [
            { cond: 'sí la tengo', destino: 'tm_cedula' },
            { cond: 'no / extranjero', destino: '_fin', nota: 'instrucciones flujo B2C normal' },
            { cond: 'respuesta inesperada', destino: 'tm_inicio', nota: 're-envía botones' },
          ] },
        { id: 'tm_cedula', tipo: 'entrada', titulo: 'Cédula',
          mensaje: 'Ingresa tu número de cédula (10 dígitos):',
          ramas: [
            { cond: 'inválida', destino: 'tm_cedula', nota: 're-pide' },
            { cond: 'válida + fuera de horario', destino: '_fin', nota: 'agenda para próxima apertura' },
            { cond: 'válida + en horario', destino: '_fin', nota: 'crea consulta, caso → derivado' },
          ] },
      ],
    },

    tracking: {
      nombre: 'Tracking diario (bienestar / medicación)',
      descripcion: 'Check-in diario. El comportamiento depende de datos.tipo (no de paso).',
      archivo: 'src/flows/flujo-tracking.js',
      trigger: 'api/cron.js (recordatorio programado) o "hola" con caso de tracking activo',
      validar: false,
      nota: 'Ramifica por datos.tipo y por el valor del mensaje, no por `paso`.',
      nodos: [
        { id: 'bienestar', tipo: 'lista', titulo: 'Bienestar (1-5)',
          mensaje: '¿Cómo te sientes hoy? 1 Muy bien · 2 Bien · 3 Regular · 4 Mal · 5 Muy mal',
          ramas: [
            { cond: 'inválido', destino: 'bienestar', nota: 're-muestra lista' },
            { cond: 'nivel 1-2', destino: '_fin', nota: 'registro OK' },
            { cond: 'nivel 3 (regular)', destino: '_fin', nota: 'nivel alerta 2, seguimiento' },
            { cond: 'nivel 4-5 (mal)', destino: '_fin', nota: 'caso → alerta + alerta Telegram' },
            { cond: 'biométricos activos', destino: 'bio_altura', nota: 'encadena tracking_biometrico' },
          ] },
        { id: 'med_reminder', tipo: 'botones', titulo: 'Medicación',
          mensaje: '¿Ya tomó su medicación?',
          ramas: [
            { cond: 'no reconocido', destino: 'med_reminder', nota: 're-envía botones' },
            { cond: 'sí tomó', destino: '_fin', nota: 'registro nivel 1' },
            { cond: 'no tomó', destino: '_fin', nota: 'registro nivel 2' },
          ] },
      ],
    },

    seg_med: {
      nombre: 'Recordatorio de medicamento',
      descripcion: 'Pregunta puntual si tomó un medicamento.',
      archivo: 'api/webhook.js (case seg_med)',
      trigger: 'api/cron.js (recordatorio de medicamento)',
      validar: false,
      nodos: [
        { id: 'seg_med', tipo: 'botones', titulo: '¿Ya lo tomó?',
          mensaje: '¿Ya tomó su medicamento (X)?',
          ramas: [
            { cond: 'sí', destino: '_fin', nota: 'registra tomo=true' },
            { cond: 'no', destino: '_fin', nota: 'registra tomo=false + alerta incumplimiento' },
            { cond: 'otro', destino: 'seg_med', nota: 're-envía botones' },
          ] },
      ],
    },

    seg_fin_trat: {
      nombre: 'Fin de tratamiento',
      descripcion: 'Al terminar el tratamiento, evalúa el resultado.',
      archivo: 'api/webhook.js (case seg_fin_trat)',
      trigger: 'api/cron.js (fin de tratamiento)',
      validar: false,
      nodos: [
        { id: 'seg_fin_trat', tipo: 'botones', titulo: '¿Cómo se siente?',
          mensaje: '¿Cómo se siente después del tratamiento con X?',
          ramas: [
            { cond: 'me siento mejor', destino: '_fin', nota: 'curado + alerta éxito' },
            { cond: 'sigo con síntomas', destino: '_fin', nota: 'notificación medio (revisar)' },
            { cond: 'no mejoré', destino: '_fin', nota: 'notificación grave + alerta' },
            { cond: 'otro', destino: 'seg_fin_trat', nota: 're-envía botones' },
          ] },
      ],
    },

    seg_bienestar: {
      nombre: 'Bienestar (seguimiento)',
      descripcion: 'Check-in de bienestar 1-5 dentro del seguimiento de consulta.',
      archivo: 'api/webhook.js (case seg_bienestar)',
      trigger: 'api/cron.js (bienestar de seguimiento)',
      validar: false,
      nodos: [
        { id: 'seg_bienestar', tipo: 'lista', titulo: 'Bienestar (1-5)',
          mensaje: '¿Cómo te sientes hoy? 1 Excelente … 5 Muy mal',
          ramas: [
            { cond: 'inválido', destino: 'seg_bienestar', nota: 're-muestra lista' },
            { cond: 'nivel 1-3', destino: '_fin', nota: 'registro OK' },
            { cond: 'nivel 4 (mal)', destino: '_fin', nota: 'notificación medio' },
            { cond: 'nivel 5 (muy mal)', destino: '_fin', nota: 'notificación grave + alerta' },
          ] },
      ],
    },

    seg_lab: {
      nombre: 'Recordatorio de laboratorio',
      descripcion: 'Pregunta si ya se hizo el examen; si sí, recibe el resultado.',
      archivo: 'api/webhook.js (case seg_lab)',
      trigger: 'api/cron.js (seguimiento de laboratorio)',
      validar: false,
      nodos: [
        { id: 'seg_lab', tipo: 'botones', titulo: '¿Ya se hizo el examen?',
          mensaje: '¿Ya se realizó el examen de laboratorio?',
          ramas: [
            { cond: 'sí lo hice', destino: '_laboratorio', nota: 'pasa a flujo laboratorio (subir resultado)' },
            { cond: 'aún no', destino: '_fin', nota: 'se vuelve a preguntar después' },
            { cond: 'otro', destino: 'seg_lab', nota: 're-envía botones' },
          ] },
      ],
    },

  };

  if (typeof module !== 'undefined' && module.exports) module.exports = FLOW_GRAPH;
  else root.FLOW_GRAPH = FLOW_GRAPH;
})(typeof self !== 'undefined' ? self : this);
