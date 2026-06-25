'use strict';
// Valida que el manifiesto (public/flows/flow-graph.js) esté sincronizado con el
// código real de los flujos. Para cada flujo con `validar: true`:
//   • extrae los estados que el código usa (paso === 'x' / paso: 'x')
//   • exige que coincidan exactamente con los nodos del manifiesto
// Además verifica que todo `rama.destino` apunte a un nodo real o a un sintético.
//
// Uso directo:  node scripts/test-bot/validate-flow-graph.js
// También lo invoca run.js antes de correr los escenarios.

const fs   = require('fs');
const path = require('path');
const GRAPH = require('../../public/flows/flow-graph.js');

const SINTETICOS = new Set(['_fin', '_emergencia', '_laboratorio']);
const RAIZ = path.resolve(__dirname, '../..');

function estadosEnCodigo(archivo) {
  const full = path.join(RAIZ, archivo);
  const src = fs.readFileSync(full, 'utf8');
  const set = new Set();
  for (const re of [/paso\s*===\s*'([^']+)'/g, /paso:\s*'([^']+)'/g]) {
    let m;
    while ((m = re.exec(src)) !== null) set.add(m[1]);
  }
  return set;
}

function validar() {
  const problemas = [];

  // Conjunto global de nodos válidos (para chequear destinos cruzados entre flujos)
  const todosLosNodos = new Set();
  for (const f of Object.values(GRAPH)) for (const n of f.nodos) todosLosNodos.add(n.id);

  for (const [id, flujo] of Object.entries(GRAPH)) {
    const nodos = new Set(flujo.nodos.map(n => n.id));

    // 1. destinos de ramas → nodo real o sintético
    for (const n of flujo.nodos) {
      for (const r of (n.ramas || [])) {
        if (!SINTETICOS.has(r.destino) && !todosLosNodos.has(r.destino)) {
          problemas.push(`[${id}] nodo "${n.id}" → destino desconocido "${r.destino}"`);
        }
      }
    }

    if (!flujo.validar) continue;

    // 2. sincronía manifiesto ↔ código
    let codigo;
    try {
      codigo = estadosEnCodigo(flujo.archivo);
    } catch (e) {
      problemas.push(`[${id}] no se pudo leer ${flujo.archivo}: ${e.message}`);
      continue;
    }
    for (const c of codigo) {
      if (!nodos.has(c)) problemas.push(`[${id}] estado "${c}" está en el código pero NO en el manifiesto`);
    }
    for (const n of nodos) {
      if (!codigo.has(n)) problemas.push(`[${id}] nodo "${n}" está en el manifiesto pero NO en el código (${flujo.archivo})`);
    }
  }

  return problemas;
}

module.exports = { validar };

// CLI
if (require.main === module) {
  const problemas = validar();
  if (problemas.length === 0) {
    console.log('\x1b[32m✓ Manifiesto de flujos sincronizado con el código\x1b[0m');
    process.exit(0);
  }
  console.log('\x1b[31m✗ Manifiesto desincronizado:\x1b[0m');
  for (const p of problemas) console.log('  • ' + p);
  process.exit(1);
}
