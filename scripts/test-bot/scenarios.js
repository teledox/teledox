'use strict';
// Escenarios de prueba automatizados — todos los flujos del bot MediLyft.
//
// Prerequisitos en Supabase (ver PLAN-PRUEBAS.md para IDs exactos):
//   clientes_b2b:      TEST QA con codigo_acceso='QATEST01'
//   empleados_b2b:     cedula='1701234567' → empresa TEST QA
//   pacientes:         cedula='1701234567' con todos los campos (requiere haber
//                      corrido la consulta B2B completa al menos una vez)
//   enfermedades_cronicas: cedula='1705550000' (hipertensión)
//   tracking_casos:    al menos 1 fila con estado='activo' (para escenarios 7-8)
//
// Cédulas de prueba usadas internamente (no deben existir en producción real):
//   1799999999 — B2C pago directo
//   1799999998 — Call Center paciente nuevo

const { guardar } = require('../../src/services/sesiones');

module.exports = [

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Consulta B2B + Antecedentes (flujo completo desde "hola")
  //    Requiere: cédula 1701234567 en empleados_b2b + paciente con datos completos.
  //    Si el paciente no tiene todos los datos, el step 5 (btn 'usar') fallará —
  //    en ese caso correr la consulta manualmente con /test:bot para completarlos.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'consulta-b2b',
    name:  '1. Consulta B2B + Antecedentes',
    phone: '593990000101',
    before: async () => {
      const { query } = require('../../src/services/supabase');
      const emps = await query('GET', 'empleados_b2b', null, '?cedula=eq.1701234567&limit=1');
      if (!emps?.length) throw new Error('Empleado cédula 1701234567 faltante en empleados_b2b — ver PLAN-PRUEBAS.md');
      const pacs = await query('GET', 'pacientes', null, '?cedula=eq.1701234567&limit=1');
      if (!pacs?.length) throw new Error('Paciente cédula 1701234567 faltante — correr flujo B2B manualmente al menos una vez');
      // Borrar antecedentes previos para que el cuestionario siempre corra en este escenario
      await query('DELETE', 'antecedentes', null, `?paciente_id=eq.${pacs[0].id}`).catch(() => {});
    },
    steps: [
      { text: 'hola',
        expect: ['cédula', 'código'] },

      { text: '1701234567',
        expect: ['autoriz', 'datos personales'] },

      { btn: 'si',
        expect: ['síntomas'] },

      // nivel 1 B2B → 'confirmar_datos'; NO debe pedir pago
      { text: 'Dolor de cabeza leve desde ayer',
        expect: ['teleconsulta', 'usar mis datos'],
        expectNot: ['$8', 'pago', 'transferencia'] },

      // 'confirmar_datos' → usar datos ya registrados → 'prioridad'
      { btn: 'usar',
        expect: ['cuándo', 'atención'] },

      // 'prioridad' → registra consulta → 'finalizar' (¿otra consulta?)
      { text: 'mañana en la tarde',
        expect: ['registrada', 'otra_consulta'] },

      // 'finalizar' → antecedentes paso 13
      { btn: 'finalizar',
        expect: ['alergias'] },

      { text: 'no', expect: ['hipertensión'] },
      { text: 'no', expect: ['diabetes'] },
      { text: 'no', expect: ['cirugías'] },
      { text: 'no', expect: ['otros antecedentes'] },
      { text: 'no', expect: ['antecedentes', 'hasta pronto'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 2. B2C pago directo (seeded en 'modalidad' para idempotencia)
  //    La pregunta de modalidad ya fue enviada; la sesión espera selección de lista.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'b2c-pago-directo',
    name:  '2. B2C pago directo',
    phone: '593990000102',
    before: async (phone) => {
      await guardar(phone, 'modalidad', { cedula: '1799999999' }, 'b2c');
    },
    steps: [
      // 'modalidad': selecciona "pago directo" → 'nombre'
      { list: 'directo',
        expect: ['nombre'] },

      // 'nombre' → 'edad'
      { text: 'Test Automation Ortiz',
        expect: ['edad'] },

      // 'edad' → 'sexo'
      { text: '28',
        expect: ['sexo'] },

      // 'sexo' → 'correo'
      { btn: 'masculino',
        expect: ['correo'] },

      // 'correo' → 'confirmar_telefono'
      { text: 'bot@test.com',
        expect: ['teléfono', 'usar este'] },

      // 'confirmar_telefono' usar este número → 'residencia'
      { btn: 'actual',
        expect: ['residencia'] },

      // 'residencia' → 'sintomas'
      { text: 'Quito Norte',
        expect: ['síntomas'] },

      // 'sintomas' nivel 1 → 'pago'
      { text: 'Dolor leve de cabeza desde ayer',
        expect: ['pago', 'transferencia'] },

      // 'pago' transferencia → 'comprobante'
      { btn: 'transferencia',
        expect: ['captura', 'banco'] },

      // 'comprobante' recibe imagen → 'finalizar'
      { media: true,
        expect: ['registrada', 'otra_consulta'] },

      // 'finalizar' → antecedentes paso 13
      { btn: 'finalizar',
        expect: ['alergias'] },

      { text: 'no', expect: ['hipertensión'] },
      { text: 'no', expect: ['diabetes'] },
      { text: 'no', expect: ['cirugías'] },
      { text: 'no', expect: ['otros antecedentes'] },
      { text: 'no', expect: ['antecedentes', 'hasta pronto'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Call Center B2B (desde "hola" con código de empresa)
  //    Requiere: clientes_b2b con codigo_acceso='QATEST01'.
  //    Paciente 1799999998 debe NO existir en pacientes para ir por 'cc_nombre'.
  //    Si ya existe (de un run previo), aparecerá 'cc_confirmar' en lugar de 'cc_nombre'.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'callcenter',
    name:  '3. Call Center B2B',
    phone: '593990000103',
    before: async () => {
      const { query } = require('../../src/services/supabase');
      const empresas = await query('GET', 'clientes_b2b', null, '?codigo_acceso=eq.QATEST01&limit=1');
      if (!empresas?.length) throw new Error('Empresa TEST QA (codigo_acceso=QATEST01) faltante — crear en Supabase o ver PLAN-PRUEBAS.md');
    },
    steps: [
      { text: 'hola',
        expect: ['cédula', 'código'] },

      // 'cedula': código de empresa → _redirect a 'cc_inicio'
      { text: 'QATEST01',
        expect: ['bienvenido', 'cédula'] },

      // 'cc_cedula': cédula de paciente nuevo → 'cc_nombre'
      { text: '1700000001',
        expect: ['nombre'] },

      // 'cc_nombre' → 'cc_edad'
      { text: 'Test CC Automation Ruiz',
        expect: ['edad'] },

      // 'cc_edad' → 'cc_nacimiento'
      { text: '45',
        expect: ['nacimiento'] },

      // 'cc_nacimiento' → 'cc_sexo'
      { text: '15/03/1979',
        expect: ['sexo'] },

      // 'cc_sexo' → 'cc_telefono'
      { btn: 'masculino',
        expect: ['teléfono'] },

      // 'cc_telefono' → 'cc_correo'
      { text: '0912345678',
        expect: ['correo'] },

      // 'cc_correo' con "no" (sin correo) → 'cc_residencia'
      { text: 'no',
        expect: ['residencia'] },

      // 'cc_residencia' → 'cc_sintomas'
      { text: 'Guayaquil Centro',
        expect: ['síntomas'] },

      // 'cc_sintomas' nivel 1 → 'cc_revisar' (resumen + confirmar)
      { text: 'Tos seca leve desde hace 3 días',
        expect: ['confirmar', 'corregir'] },

      // 'cc_revisar' confirmar → 'cc_siguiente' (¿otro paciente?)
      { btn: 'confirmar',
        expect: ['registrada', 'otro paciente'] },

      // 'cc_siguiente' no → fin de sesión
      { btn: 'no',
        expect: ['finalizada', 'hasta pronto'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Crónicas — hipertensión nivel 1 (normal)
  //    Seed: sesión en 'cronico' con datos de la fila de enfermedades_cronicas
  //    para cédula 1705550000 (hipertensión).
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'cronicas-normal',
    name:  '4. Crónicas — hipertensión nivel 1 (normal)',
    phone: '593990000104',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const pacs = await query('GET', 'pacientes', null, '?cedula=eq.1705550000&limit=1');
      if (!pacs?.length) throw new Error('Paciente cédula 1705550000 faltante — ver PLAN-PRUEBAS.md');
      const enfs = await query('GET', 'enfermedades_cronicas', null, `?paciente_id=eq.${pacs[0].id}&limit=1`);
      if (!enfs?.length) throw new Error(`Fila enfermedades_cronicas faltante para paciente ${pacs[0].id} — ver PLAN-PRUEBAS.md`);
      await guardar(phone, 'cronico', {
        enfermedad_key: enfs[0].enfermedad,
        enfermedad_id:  enfs[0].id,
        paciente_id:    pacs[0].id,
        paso_cronico:   1,
      }, 'cronicas');
    },
    steps: [
      // Respuesta a pregunta 1 (sistólica) → pregunta 2 (diastólica)
      { text: '120', expect: ['diastólica'] },
      // Respuesta a pregunta 2 (diastólica) → pregunta 3 (síntomas)
      { text: '80',  expect: ['síntomas', 'sin síntomas'] },
      // Nivel 1 → evaluación normal
      { text: '1',
        expect: ['normal', '✅'],
        expectNot: ['emergencia', '911'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Crónicas — hipertensión nivel 3 (emergencia)
  //    Mismos prerequisitos que el escenario 4.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'cronicas-emergencia',
    name:  '5. Crónicas — hipertensión nivel 3 (emergencia)',
    phone: '593990000105',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const pacs = await query('GET', 'pacientes', null, '?cedula=eq.1705550000&limit=1');
      if (!pacs?.length) throw new Error('Paciente cédula 1705550000 faltante — ver PLAN-PRUEBAS.md');
      const enfs = await query('GET', 'enfermedades_cronicas', null, `?paciente_id=eq.${pacs[0].id}&limit=1`);
      if (!enfs?.length) throw new Error(`Fila enfermedades_cronicas faltante para paciente ${pacs[0].id} — ver PLAN-PRUEBAS.md`);
      await guardar(phone, 'cronico', {
        enfermedad_key: enfs[0].enfermedad,
        enfermedad_id:  enfs[0].id,
        paciente_id:    pacs[0].id,
        paso_cronico:   1,
      }, 'cronicas');
    },
    steps: [
      { text: '200', expect: ['diastólica'] },
      { text: '120', expect: ['síntomas', 'sin síntomas'] },
      // Valores críticos → crisis hipertensiva
      { text: '3',
        expect: ['emergencia', '911'],
        expectNot: ['normal', '✅'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Seguimiento aprobado por médico — B2B (sin costo)
  //    Seed: sesión en 'sp_confirmar' con datos del paciente 1701234567 y empresa TEST QA.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'seguimiento-pago-b2b',
    name:  '6. Seguimiento aprobado — B2B sin costo',
    phone: '593990000106',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const empresas = await query('GET', 'clientes_b2b', null, '?codigo_acceso=eq.QATEST01&limit=1');
      if (!empresas?.length) throw new Error('Empresa TEST QA (QATEST01) faltante — ver PLAN-PRUEBAS.md');
      const pacs = await query('GET', 'pacientes', null, '?cedula=eq.1701234567&limit=1');
      const pac  = pacs?.[0] || {};
      await guardar(phone, 'sp_confirmar', {
        cedula:           '1701234567',
        paciente_id:      pac.id,
        nombreCompleto:   pac.nombre ? `${pac.nombre} ${pac.apellidos || ''}`.trim() : 'Test B2B',
        correo:           pac.correo           || 'test@medilyft.com',
        telefonoContacto: pac.telefono         || '0900000001',
        lugar_residencia: pac.lugar_residencia || 'Quito Norte',
        cliente_b2b_id:   empresas[0].id,
      }, 'seguimiento_pago');
    },
    steps: [
      // 'sp_confirmar': ¿desea agendar? → sí → 'sp_sintomas'
      { btn: 'si',
        expect: ['siente', 'síntomas'] },

      // 'sp_sintomas' nivel 1 + datos completos → irAPago B2B → sin costo → fin
      { text: 'Persiste un poco la molestia pero en general me siento mejor',
        expect: ['sin costo', 'empresa'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Tracking externo — bienestar respuesta válida (nivel 1)
  //    Requiere: al menos 1 tracking_caso con estado='activo'.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'tracking-bienestar',
    name:  '7. Tracking bienestar — nivel 1 (bien)',
    phone: '593990000107',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const casos = await query('GET', 'tracking_casos', null, '?estado=eq.activo&limit=1');
      if (!casos?.length) throw new Error('Sin tracking_casos activos — crear uno en el panel primero');
      const c = casos[0];
      await guardar(phone, 'tracking', {
        tipo:            'bienestar',
        caso_id:         c.id,
        empresa_id:      c.empresa_id,
        paciente_nombre: c.paciente_nombre,
        diagnostico:     c.diagnostico,
      }, 'tracking');
    },
    steps: [
      // Respuesta '2' (Bien) → nivel 1 → "Gracias por su reporte (*Bien*)"
      { text: '2', expect: ['gracias', 'reporte', 'bien'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Tracking — respuesta inválida + corrección
  //    Verifica que el bot pide reintentar y luego procesa correctamente.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'tracking-invalido',
    name:  '8. Tracking — respuesta inválida luego válida',
    phone: '593990000108',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const casos = await query('GET', 'tracking_casos', null, '?estado=eq.activo&limit=1');
      if (!casos?.length) throw new Error('Sin tracking_casos activos — crear uno en el panel primero');
      const c = casos[0];
      await guardar(phone, 'tracking', {
        tipo:            'bienestar',
        caso_id:         c.id,
        empresa_id:      c.empresa_id,
        paciente_nombre: c.paciente_nombre,
        diagnostico:     c.diagnostico,
      }, 'tracking');
    },
    steps: [
      // Respuesta inválida → re-pide selección, NO termina sesión
      { text: 'bien gracias',
        expect: ['selecciona', 'sientes'],
        expectNot: ['gracias por su reporte'] },

      // Respuesta válida '1' (Muy bien) → nivel 1 → "Gracias (*Muy bien*)"
      { text: '1', expect: ['gracias', 'muy bien'] },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // BORDER CASES
  // ══════════════════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────────────────────────────────
  // 9. B2B — rechaza autorización de datos personales
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'b2b-no-autoriza',
    name:  '9. B2B — rechaza autorización',
    phone: '593990000109',
    steps: [
      { text: 'hola',
        expect: ['cédula', 'código'] },

      { text: '1701234567',
        expect: ['autoriz', 'datos personales'] },

      { btn: 'no',
        expect: ['sin su autorización', 'hola'],
        expectNot: ['síntomas'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 10. B2B — "otra consulta" después de confirmar ('finalizar')
  //     Seeded en 'finalizar'; debe reiniciar con mensajeBienvenida.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'b2b-otra-consulta',
    name:  '10. B2B — otra consulta tras confirmar',
    phone: '593990000110',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const [empresa] = await query('GET', 'clientes_b2b', null, '?codigo_acceso=eq.QATEST01&limit=1') || [];
      const [pac]     = await query('GET', 'pacientes',     null, '?cedula=eq.1701234567&limit=1')    || [];
      if (!empresa || !pac) throw new Error('Data B2B faltante — correr seed primero');
      await guardar(phone, 'finalizar', {
        _flujo: 'consulta',
        cedula: '1701234567', paciente_id: pac.id,
        nombreCompleto: 'Test QA Automation', empresa: 'TEST QA', empresa_id: empresa.id,
        correo: 'test@medilyft.com', telefono: '0900000001', lugar_residencia: 'Quito Norte',
      }, 'consulta');
    },
    steps: [
      { btn: 'otra_consulta',
        expect: ['cédula', 'código'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 11. B2C — pago con tarjeta (PagoPlux) en lugar de transferencia
  //     Seeded en 'pago' (selección de forma de pago).
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'b2c-tarjeta',
    name:  '11. B2C — pago con tarjeta',
    phone: '593990000111',
    before: async (phone) => {
      await guardar(phone, 'pago', {
        _flujo: 'b2c', cedula: '1799999997',
        nombreCompleto: 'Test Tarjeta', correo: 'tarjeta@test.com',
        sintomas: 'Dolor leve de cabeza', nivel: 1,
      }, 'b2c');
    },
    steps: [
      { list: 'tarjeta',
        expect: ['pagoplux', 'captura'],
        expectNot: ['banco internacional'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 12. B2C — envía texto en 'comprobante' en lugar de foto
  //     El bot re-pide la imagen sin avanzar de estado.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'b2c-texto-en-foto',
    name:  '12. B2C — texto en lugar de foto (comprobante)',
    phone: '593990000112',
    before: async (phone) => {
      await guardar(phone, 'comprobante', {
        _flujo: 'b2c', cedula: '1799999997',
        nombreCompleto: 'Test Tarjeta', correo: 'tarjeta@test.com',
        sintomas: 'Dolor leve de cabeza', nivel: 1, forma_pago: 'transferencia',
      }, 'b2c');
    },
    steps: [
      { text: 'ya pagué',
        expect: ['foto', 'captura'],
        expectNot: ['registrada', 'pago confirmado'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 13. Call Center — cédula ya registrada en pacientes ('cc_confirmar')
  //     Seeded en 'cc_cedula' con empresa. Cédula 1701234567 existe (globalSetup).
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'callcenter-existente',
    name:  '13. Call Center — paciente ya registrado',
    phone: '593990000113',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const [empresa] = await query('GET', 'clientes_b2b', null, '?codigo_acceso=eq.QATEST01&limit=1') || [];
      if (!empresa) throw new Error('QATEST01 faltante — correr seed primero');
      await guardar(phone, 'cc_cedula', { _flujo: 'callcenter', cc_empresa_id: empresa.id, cc_empresa: 'TEST QA' }, 'callcenter');
    },
    steps: [
      // Cédula existente → 'cc_confirmar' "paciente encontrado"
      { text: '1701234567',
        expect: ['encontrado', 'correcto'],
        expectNot: ['nombre completo'] },

      // Confirmar → 'cc_sintomas'
      { btn: 'si',
        expect: ['síntomas'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 14. Crónicas — hipertensión nivel 2 (150/95 mmHg → advertencia)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'cronicas-nivel2',
    name:  '14. Crónicas — hipertensión nivel 2 (advertencia)',
    phone: '593990000114',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const [pac] = await query('GET', 'pacientes', null, '?cedula=eq.1705550000&limit=1') || [];
      if (!pac) throw new Error('Paciente 1705550000 faltante');
      const [enf] = await query('GET', 'enfermedades_cronicas', null, `?paciente_id=eq.${pac.id}&limit=1`) || [];
      if (!enf) throw new Error('enfermedades_cronicas faltante');
      await guardar(phone, 'cronico', {
        enfermedad_key: enf.enfermedad, enfermedad_id: enf.id,
        paciente_id: pac.id, paso_cronico: 1,
      }, 'cronicas');
    },
    steps: [
      { text: '150', expect: ['diastólica'] },
      { text: '95',  expect: ['síntomas', 'sin síntomas'] },
      { text: '1',
        expect: ['elevada', 'monitoree'],
        expectNot: ['emergencia', 'crisis', '✅'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 15. Crónicas — input no numérico (validación)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'cronicas-invalido-num',
    name:  '15. Crónicas — input inválido re-pide número',
    phone: '593990000115',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const [pac] = await query('GET', 'pacientes', null, '?cedula=eq.1705550000&limit=1') || [];
      if (!pac) throw new Error('Paciente 1705550000 faltante');
      const [enf] = await query('GET', 'enfermedades_cronicas', null, `?paciente_id=eq.${pac.id}&limit=1`) || [];
      if (!enf) throw new Error('enfermedades_cronicas faltante');
      await guardar(phone, 'cronico', {
        enfermedad_key: enf.enfermedad, enfermedad_id: enf.id,
        paciente_id: pac.id, paso_cronico: 1,
      }, 'cronicas');
    },
    steps: [
      // Texto en lugar de número → re-pide sin avanzar
      { text: 'abc',
        expect: ['número', 'ej'],
        expectNot: ['diastólica'] },

      // Número válido → sí avanza
      { text: '120', expect: ['diastólica'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 16. Seguimiento — paciente decide NO agendar
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'seguimiento-no-agenda',
    name:  '16. Seguimiento — no quiere agendar',
    phone: '593990000116',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const [empresa] = await query('GET', 'clientes_b2b', null, '?codigo_acceso=eq.QATEST01&limit=1') || [];
      const [pac]     = await query('GET', 'pacientes',     null, '?cedula=eq.1701234567&limit=1')    || [];
      if (!empresa) throw new Error('QATEST01 faltante');
      await guardar(phone, 'sp_confirmar', {
        cedula: '1701234567', paciente_id: pac?.id,
        nombreCompleto: pac ? `${pac.nombre} ${pac.apellidos || ''}`.trim() : 'Test B2B',
        correo: pac?.correo || 'test@medilyft.com',
        telefonoContacto: pac?.telefono || '0900000001',
        lugar_residencia: pac?.lugar_residencia || 'Quito Norte',
        cliente_b2b_id: empresa.id,
      }, 'seguimiento_pago');
    },
    steps: [
      { btn: 'no',
        expect: ['no agendaremos', 'hola'],
        expectNot: ['síntomas', 'correo'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 17. Tracking — bienestar "Muy mal" (nivel 3, alerta máxima + 911)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'tracking-nivel-bajo',
    name:  '17. Tracking — Muy mal (nivel 3, alerta)',
    phone: '593990000117',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const [c] = await query('GET', 'tracking_casos', null, '?estado=eq.activo&limit=1') || [];
      if (!c) throw new Error('Sin tracking_casos activos');
      await guardar(phone, 'tracking', {
        tipo: 'bienestar', caso_id: c.id,
        empresa_id: c.empresa_id, paciente_nombre: c.paciente_nombre, diagnostico: c.diagnostico,
      }, 'tracking');
    },
    steps: [
      { text: '5',
        expect: ['muy mal', '911'],
        expectNot: ['todo se ve bien', 'equipo de seguimiento'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 18. Tracking — bienestar "Regular" (nivel 2, aviso sin 911)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'tracking-nivel-medio',
    name:  '18. Tracking — Regular (nivel 2, seguimiento)',
    phone: '593990000118',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const [c] = await query('GET', 'tracking_casos', null, '?limit=1') || [];
      if (!c) throw new Error('Sin tracking_casos — crear uno en el panel primero');
      await guardar(phone, 'tracking', {
        tipo: 'bienestar', caso_id: c.id,
        empresa_id: c.empresa_id, paciente_nombre: c.paciente_nombre, diagnostico: c.diagnostico,
      }, 'tracking');
    },
    steps: [
      { text: '3',
        expect: ['regular', 'pendiente'],
        expectNot: ['notificado', 'todo se ve bien'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 19. B2C registrado — paciente existe en BD pero sin empresa (pago requerido)
  //     Verifica que un paciente particular registrado NO puede saltar el pago.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'b2c-registrado-pago',
    name:  '19. B2C registrado — pago requerido (no bypass)',
    phone: '593990000119',
    before: async () => {
      const { query } = require('../../src/services/supabase');
      const pacs = await query('GET', 'pacientes', null, '?cedula=eq.1709999997&limit=1');
      if (!pacs?.length) throw new Error('Paciente B2C 1709999997 faltante — globalSetup debería crearlo');
    },
    steps: [
      { text: 'hola',
        expect: ['cédula', 'código'] },

      // Cédula encontrada en BD → 'consentimiento' (autorización)
      { text: '1709999997',
        expect: ['autoriz', 'datos personales'] },

      { btn: 'si',
        expect: ['síntomas'] },

      // Nivel 1 B2C registrado → DEBE mostrar pago, NO "usar mis datos"
      { text: 'Dolor de cabeza leve',
        expect: ['$8', 'pago', 'transferencia'],
        expectNot: ['usar mis datos', 'horario'] },

      // Selecciona transferencia → instrucciones bancarias
      { btn: 'transferencia',
        expect: ['captura', 'banco'] },

      // Envía comprobante (mock) → pago confirmado
      { media: true,
        expect: ['registrada', 'otra_consulta'] },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 20. B2B — antecedentes ya registrados → despide sin re-preguntar
  //     Verifica que 'finalizar' detecta antecedentes existentes y salta el cuestionario.
  // ──────────────────────────────────────────────────────────────────────────
  {
    id:    'b2b-antecedentes-existentes',
    name:  '20. B2B — antecedentes ya registrados → despide',
    phone: '593990000120',
    before: async (phone) => {
      const { query } = require('../../src/services/supabase');
      const [empresa] = await query('GET', 'clientes_b2b', null, '?codigo_acceso=eq.QATEST01&limit=1') || [];
      const [pac]     = await query('GET', 'pacientes',     null, '?cedula=eq.1701234567&limit=1')    || [];
      if (!empresa || !pac) throw new Error('Data B2B faltante — correr seed primero');
      // Crear antecedentes si no existen
      const existentes = await query('GET', 'antecedentes', null, `?paciente_id=eq.${pac.id}&limit=1`).catch(() => []);
      if (!existentes?.length) {
        await query('POST', 'antecedentes', {
          paciente_id:  pac.id,
          alergias:     'ninguna',
          hipertension: 'no',
          diabetes:     'no',
          cirugias:     'ninguna',
          otros:        'ninguno',
          updated_at:   new Date().toISOString(),
        }).catch(() => {});
      }
      await guardar(phone, 'finalizar', {
        _flujo: 'consulta',
        cedula: '1701234567', paciente_id: pac.id,
        nombreCompleto: 'Test QA Automation', empresa: 'TEST QA', empresa_id: empresa.id,
        correo: 'test@medilyft.com', telefono: '0900000001', lugar_residencia: 'Quito Norte',
      }, 'consulta');
    },
    steps: [
      // finalizar → antecedentes ya existen → despide directamente, NO pregunta alergias
      { btn: 'finalizar',
        expect: ['historia clínica', 'registrada', 'hasta pronto'],
        expectNot: ['alergias', 'hipertensión'] },
    ],
  },

];
