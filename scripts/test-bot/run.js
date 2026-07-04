'use strict';
// Runner automatizado de escenarios del bot WhatsApp.
//
// Uso:
//   node --env-file=.env.local scripts/test-bot/run.js
//   node --env-file=.env.local scripts/test-bot/run.js --filter consulta
//   node --env-file=.env.local scripts/test-bot/run.js --only callcenter
//
// Cada escenario usa su propio número de teléfono dedicado para no colisionar
// con el REPL interactivo ni entre sí. WhatsApp mockeado, Supabase real.

const { server, mock, PORT, ready, firmarPayload } = require('./server');
const scenarios = require('./scenarios');

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', D = '\x1b[2m', Z = '\x1b[0m', BOLD = '\x1b[1m';

// ── Construcción de payloads ────────────────────────────────────────────────

function buildPayload(phone, msg) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
      contacts: [{ profile: { name: 'Test Runner' } }],
      messages: [{ from: phone, ...msg }],
    } }] }],
  };
}

function toMsg(step) {
  if ('text'  in step) return { type: 'text', text: { body: step.text } };
  if ('btn'   in step) return { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: step.btn,  title: step.btn  } } };
  if ('list'  in step) return { type: 'interactive', interactive: { type: 'list_reply',   list_reply:   { id: step.list, title: step.list } } };
  if (step.media)      return { type: 'image', image: { id: '__TEST__' } };
  throw new Error('Step sin tipo reconocido: ' + JSON.stringify(step));
}

// ── Extrae todo el texto del batch de mensajes recibidos ────────────────────

function extractContent(messages) {
  const parts = [];
  for (const m of messages) {
    if (m.texto) parts.push(m.texto);
    if (m.botones)   m.botones.forEach(b => parts.push(b.id + ' ' + b.titulo));
    if (m.secciones) m.secciones.forEach(s => s.filas?.forEach(f => parts.push(f.id + ' ' + f.titulo)));
  }
  return parts.join('\n').toLowerCase();
}

// ── Envío de un step ────────────────────────────────────────────────────────

async function sendStep(phone, step) {
  const payload = buildPayload(phone, toMsg(step));
  const rawBody = JSON.stringify(payload);
  await fetch(`http://localhost:${PORT}/api/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': firmarPayload(rawBody) },
    body: rawBody,
  });
  return mock.popLog();
}

// ── Ejecución de un escenario ───────────────────────────────────────────────

async function runScenario(s) {
  const { id, name, phone } = s;
  console.log(`\n${BOLD}${name}${Z} ${D}(${phone})${Z}`);

  // Limpiar sesión previa para idempotencia
  try {
    const { eliminar } = require('../../src/services/sesiones');
    await eliminar(phone);
  } catch {}

  // Hook de seed (flujos que no arrancan con "hola")
  if (s.before) {
    try {
      await s.before(phone);
      console.log(`  ${D}→ seed OK${Z}`);
    } catch (err) {
      console.log(`  ${Y}⬜ SKIP${Z}  ${err.message}`);
      return { passed: 0, failed: 0, skipped: 1 };
    }
  }

  let passed = 0, failed = 0;

  for (let i = 0; i < s.steps.length; i++) {
    const step  = s.steps[i];
    const label = step.label ?? step.text ?? step.btn ?? step.list ?? 'media';

    let msgs;
    try {
      msgs = await sendStep(phone, step);
    } catch (err) {
      console.log(`  ${R}✗${Z} Step ${i + 1} (${label}): error HTTP — ${err.message}`);
      failed++;
      continue;
    }

    const content = extractContent(msgs);
    let ok = true;

    for (const pat of (step.expect ?? [])) {
      if (!content.includes(pat.toLowerCase())) {
        console.log(`  ${R}✗${Z} Step ${i + 1} (${label}): falta "${pat}"`);
        console.log(`    ${D}Got: ${content.slice(0, 250).replace(/\n/g, ' | ')}${Z}`);
        ok = false;
        failed++;
      }
    }
    for (const pat of (step.expectNot ?? [])) {
      if (content.includes(pat.toLowerCase())) {
        console.log(`  ${R}✗${Z} Step ${i + 1} (${label}): no debería contener "${pat}"`);
        console.log(`    ${D}Got: ${content.slice(0, 250).replace(/\n/g, ' | ')}${Z}`);
        ok = false;
        failed++;
      }
    }

    if (ok && (step.expect?.length ?? 0) > 0) {
      console.log(`  ${G}✓${Z}  Step ${i + 1} (${label})`);
      passed++;
    } else if (!(step.expect?.length)) {
      console.log(`  ${D}·  Step ${i + 1} (${label}) — sin assertions${Z}`);
    }
  }

  return { passed, failed, skipped: 0 };
}

// ── Setup global ────────────────────────────────────────────────────────────

async function globalSetup() {
  const { query } = require('../../src/services/supabase');

  // 1. Empresa TEST QA
  await query('POST', 'clientes_b2b',
    { codigo_acceso: 'QATEST01', nombre_empresa: 'TEST QA', nombre_seguro: 'Seguro Test', activo: true },
    '?on_conflict=codigo_acceso'
  ).catch(() => {});
  const empresas = await query('GET', 'clientes_b2b', null, '?codigo_acceso=eq.QATEST01&limit=1');
  const empresaId = empresas?.[0]?.id;
  if (!empresaId) throw new Error('globalSetup: no se pudo crear/obtener QATEST01');

  // 2. Empleado B2B
  await query('POST', 'empleados_b2b',
    { cedula: '1701234567', empresa_id: empresaId },
    '?on_conflict=empresa_id,cedula'
  ).catch(() => {});

  // 3. Paciente B2B completo (upsert por cédula)
  await query('POST', 'pacientes', {
    cedula: '1701234567', nombre: 'Test', apellidos: 'QA Automation', edad: 30, sexo: 'M',
    correo: 'test@medilyft.com', telefono: '0900000001', lugar_residencia: 'Quito Norte',
    cliente_b2b_id: empresaId,
  }, '?on_conflict=cedula').catch(() => {});

  // 4. Paciente crónicas
  await query('POST', 'pacientes', {
    cedula: '1705550000', nombre: 'Test', apellidos: 'Crónicas QA', edad: 55, sexo: 'M',
    correo: 'cronicas@medilyft.com', telefono: '0900000002', lugar_residencia: 'Guayaquil',
  }, '?on_conflict=cedula').catch(() => {});
  const pacs = await query('GET', 'pacientes', null, '?cedula=eq.1705550000&limit=1');
  const pacCronicasId = pacs?.[0]?.id;

  // 5. Enfermedad crónica — insertar solo si no existe
  if (pacCronicasId) {
    const enfs = await query('GET', 'enfermedades_cronicas', null,
      `?paciente_id=eq.${pacCronicasId}&enfermedad=eq.hipertension&limit=1`).catch(() => []);
    if (!enfs?.length) {
      await query('POST', 'enfermedades_cronicas',
        { paciente_id: pacCronicasId, enfermedad: 'hipertension', activo: true }
      ).catch(() => {});
    }
  }

  // 6. Paciente B2C registrado (sin empresa) — para escenario 19
  await query('POST', 'pacientes', {
    cedula: '1709999997', nombre: 'Test', apellidos: 'B2C Registrado', edad: 25, sexo: 'M',
    correo: 'b2ctest@medilyft.com', telefono: '0900000099', lugar_residencia: 'Quito Sur',
  }, '?on_conflict=cedula').catch(() => {});

  // 7. Resetear tracking_casos que quedaron en 'alerta' o 'derivado' por runs anteriores
  await query('PATCH', 'tracking_casos', { estado: 'activo' }, `?estado=in.(alerta,derivado)&telefono=eq.593990000200`).catch(() => {});
  // También resetear cualquier otro caso en alerta para no interferir con escenarios existentes
  await query('PATCH', 'tracking_casos', { estado: 'activo' }, `?estado=eq.alerta&telefono=neq.593990000200`).catch(() => {});

  // 8. Tracking caso de prueba (crear si no existe, o resetear si quedó en estado distinto)
  {
    const existentes = await query('GET', 'tracking_casos', null,
      '?telefono=eq.593990000200&limit=1').catch(() => []);
    if (existentes?.length) {
      await query('PATCH', 'tracking_casos',
        { estado: 'activo', activado: true, bienestar_alto: false },
        `?id=eq.${existentes[0].id}`).catch(() => {});
    } else {
      await query('POST', 'tracking_casos', {
        telefono:    '593990000200',
        diagnostico: 'Test QA — Hipertensión',
        tratamiento: 'Losartán 50mg',
        estado:      'activo',
        activado:    true,
      }, '').catch(() => {});
    }
  }

  // 9. Limpiar paciente del callcenter de runs anteriores para garantizar estado nuevo
  const ccPacs = await query('GET', 'pacientes', null, '?cedula=eq.1700000001&select=id').catch(() => []);
  for (const p of (ccPacs || [])) {
    await query('DELETE', 'planillaje_b2b',    null, `?paciente_id=eq.${p.id}`).catch(() => {});
    await query('DELETE', 'consultas',         null, `?paciente_id=eq.${p.id}`).catch(() => {});
    await query('DELETE', 'pacientes',         null, `?id=eq.${p.id}`).catch(() => {});
  }
}

// ── Teardown global ─────────────────────────────────────────────────────────

async function teardown() {
  const { query } = require('../../src/services/supabase');
  const CEDULAS = '1701234567,1705550000,1700000001,1709999997';
  try {
    const pacs = await query('GET', 'pacientes', null,
      `?cedula=in.(${CEDULAS})&select=id`).catch(() => []);
    const ids = (pacs || []).map(p => p.id);

    for (const id of ids) {
      // registros_cronicos referencia enfermedades_cronicas → borrar primero
      const enfs = await query('GET', 'enfermedades_cronicas', null,
        `?paciente_id=eq.${id}&select=id`).catch(() => []);
      for (const e of (enfs || [])) {
        await query('DELETE', 'registros_cronicos', null, `?enfermedad_id=eq.${e.id}`).catch(() => {});
      }

      await query('DELETE', 'planillaje_b2b',              null, `?paciente_id=eq.${id}`).catch(() => {});
      await query('DELETE', 'documentos_datos',           null, `?paciente_id=eq.${id}`).catch(() => {});
      await query('DELETE', 'documentos',                  null, `?paciente_id=eq.${id}`).catch(() => {});
      await query('DELETE', 'verificaciones_comprobante', null, `?paciente_id=eq.${id}`).catch(() => {});
      await query('DELETE', 'antecedentes',               null, `?paciente_id=eq.${id}`).catch(() => {});
      await query('DELETE', 'consultas',                  null, `?paciente_id=eq.${id}`).catch(() => {});
      await query('DELETE', 'enfermedades_cronicas',      null, `?paciente_id=eq.${id}`).catch(() => {});
    }

    // pacientes antes de clientes_b2b (FK constraint)
    if (ids.length) {
      await query('DELETE', 'pacientes', null, `?cedula=in.(${CEDULAS})`).catch(() => {});
    }
    await query('DELETE', 'empleados_b2b', null, `?cedula=eq.1701234567`).catch(() => {});
    await query('DELETE', 'clientes_b2b', null, `?codigo_acceso=eq.QATEST01`).catch(() => {});

    await query('DELETE', 'sesiones_bot', null,
      `?telefono=in.(593990000101,593990000102,593990000103,593990000104,593990000105,593990000106,593990000107,593990000108,593990000109,593990000110,593990000111,593990000112,593990000113,593990000114,593990000115,593990000116,593990000117,593990000118,593990000119,593990000120,593990000121,593990000122,593990000123,593990000124,593990000125,593990000126,593990000127,593990000128,593990000129,593990000130,593990000131,593990000132,593990000133,593990000134,593990000135,593990000136,593990000137,593990000138,593990000139,593990000140)`
    ).catch(() => {});

    // Tracking: eliminar registros y caso de prueba
    const trackCasos = await query('GET', 'tracking_casos', null,
      '?telefono=eq.593990000200&select=id').catch(() => []);
    for (const c of (trackCasos || [])) {
      await query('DELETE', 'tracking_registros',   null, `?caso_id=eq.${c.id}`).catch(() => {});
      await query('DELETE', 'tracking_biometricos', null, `?caso_id=eq.${c.id}`).catch(() => {});
      await query('DELETE', 'tracking_casos',       null, `?id=eq.${c.id}`).catch(() => {});
    }

    console.log(`${D}  → teardown OK${Z}`);
  } catch (e) {
    console.log(`${Y}  ⚠ teardown parcial: ${e.message}${Z}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args      = process.argv.slice(2);
  const filterIdx = args.indexOf('--filter');
  const onlyIdx   = args.indexOf('--only');
  const filter    = filterIdx >= 0 ? args[filterIdx + 1] : null;
  const only      = onlyIdx   >= 0 ? args[onlyIdx   + 1] : null;

  await ready;

  // Validación de sincronía del manifiesto de flujos (público) ↔ código
  const { validar } = require('./validate-flow-graph');
  const driftFlujos = validar();
  if (driftFlujos.length) {
    console.log(`${R}✗ Manifiesto de flujos desincronizado:${Z}`);
    for (const p of driftFlujos) console.log(`  ${R}•${Z} ${p}`);
  } else {
    console.log(`${G}✓${Z} Manifiesto de flujos sincronizado`);
  }

  process.stdout.write(`${D}Setting up test data…${Z} `);
  await globalSetup();
  process.stdout.write(`${G}OK${Z}\n`);

  let toRun = scenarios;
  if (only)        toRun = scenarios.filter(s => s.id === only);
  else if (filter) toRun = scenarios.filter(s => s.id.includes(filter) || s.name.toLowerCase().includes(filter));

  console.log(`\n🤖 ${BOLD}Automated bot test runner${Z} — ${toRun.length} escenario(s)`);

  const results = [];
  for (const s of toRun) {
    const r = await runScenario(s);
    results.push({ id: s.id, name: s.name, ...r });
  }

  // Resumen
  const totalP = results.reduce((a, r) => a + r.passed,  0);
  const totalF = results.reduce((a, r) => a + r.failed,  0);
  const totalS = results.reduce((a, r) => a + r.skipped, 0);

  console.log(`\n${D}${'─'.repeat(58)}${Z}`);
  for (const r of results) {
    const icon   = r.skipped ? `${Y}⬜${Z}` : r.failed ? `${R}✗${Z}` : `${G}✓${Z}`;
    const detail = r.skipped ? 'SKIP' : `${r.passed}/${r.passed + r.failed} steps`;
    console.log(`  ${icon}  ${r.name} ${D}${detail}${Z}`);
  }
  console.log();

  if (totalF === 0 && totalS < toRun.length) {
    console.log(`${G}${BOLD}✓ Todo OK${Z} — ${totalP} assertions pasadas`);
  } else if (totalF > 0) {
    console.log(`${R}${BOLD}✗ ${totalF} assertion(s) fallidas${Z} · ${totalP} pasadas · ${totalS} skip`);
  } else {
    console.log(`${Y}${BOLD}⬜ ${totalS} escenario(s) skipped${Z} (prerequisitos faltantes)`);
  }

  await teardown();
  const fallo = totalF > 0 || driftFlujos.length > 0;
  server.close(() => process.exit(fallo ? 1 : 0));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
