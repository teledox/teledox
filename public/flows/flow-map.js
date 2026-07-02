// ════════════════════════════════════════════════════════════════════════════
// MAPA FLUJO→FLUJO — deriva del manifiesto (flow-graph.js) las conexiones entre
// flujos completos (no entre nodos individuales) para el diagrama de la pestaña
// "Mapa" en public/flows/index.html.
//
// Regla de resolución para cada rama de cada nodo de cada flujo:
//   1. si la rama tiene `salta_a` → usa ese flujo (máxima prioridad; ver el
//      comentario sobre `salta_a` en flow-graph.js).
//   2. si el destino es sintético (_emergencia/_antecedentes/_laboratorio) →
//      el flujo real que ese sintético representa.
//   3. si el destino es '_fin' → no genera arista (fin normal, no interesa
//      para el mapa macro).
//   4. si el destino es '_fuera_horario' → arista especial hacia el nodo
//      terminal compartido "fuera de horario" (no es un flujo real).
//   5. si el destino es un nodo del propio flujo → interno, se ignora.
//   6. si el destino es un nodo de OTRO flujo:
//        - si pertenece a un único flujo → arista a ese flujo.
//        - si pertenece a 2+ flujos (id de nodo ambiguo, ej. "sintomas" existe
//          en consulta y b2c) y no hay `salta_a` → no se puede resolver; se
//          reporta en `ambiguas` para que el manifiesto lo corrija con `salta_a`.
//
// Las aristas repetidas entre el mismo par de flujos se combinan en una sola,
// concatenando las condiciones que la disparan.
// ════════════════════════════════════════════════════════════════════════════

(function (root) {
  const SINTETICOS_FLUJO = { _emergencia: 'emergencia', _antecedentes: 'antecedentes', _laboratorio: 'laboratorio' };

  function derivarMapa(GRAPH) {
    const nodeOwners = {}; // nodeId -> [flowId,...]
    for (const [fid, f] of Object.entries(GRAPH)) {
      for (const n of f.nodos) (nodeOwners[n.id] ??= []).push(fid);
    }

    const edgeMap = {};     // "from|to" -> { from, to, conds:[] }
    const fueraHorario = {}; // flowId -> true (flujos que pueden quedar pendientes de horario)
    const ambiguas = [];

    for (const [fid, flujo] of Object.entries(GRAPH)) {
      const propios = new Set(flujo.nodos.map(n => n.id));
      for (const nodo of flujo.nodos) {
        for (const r of (nodo.ramas || [])) {
          let destinoFlujo = null;

          if (r.salta_a) {
            destinoFlujo = r.salta_a;
          } else if (r.destino === '_fuera_horario') {
            fueraHorario[fid] = true;
            continue;
          } else if (r.destino === '_fin') {
            continue;
          } else if (SINTETICOS_FLUJO[r.destino]) {
            destinoFlujo = SINTETICOS_FLUJO[r.destino];
          } else if (propios.has(r.destino)) {
            continue; // interno
          } else {
            const owners = nodeOwners[r.destino] || [];
            if (owners.length === 1) destinoFlujo = owners[0];
            else if (owners.length > 1) {
              ambiguas.push({ flujo: fid, nodo: nodo.id, cond: r.cond, destino: r.destino, owners });
              continue;
            } else {
              continue; // destino roto — ya lo reporta validate-flow-graph.js
            }
          }

          if (destinoFlujo === fid) continue; // auto-referencia (ej. salta_a al mismo flujo)
          const key = fid + '|' + destinoFlujo;
          (edgeMap[key] ??= { from: fid, to: destinoFlujo, conds: [] }).conds.push(r.cond);
        }
      }
    }

    const edges = Object.values(edgeMap).map(e => ({
      from: e.from, to: e.to, label: e.conds.join(' · ')
    }));

    return { edges, fueraHorario, ambiguas };
  }

  const api = { derivarMapa, SINTETICOS_FLUJO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FLOW_MAP = api;
})(typeof self !== 'undefined' ? self : this);
