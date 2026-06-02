// ============================================================
// MÓDULO FACTURACIÓN B2C Y PLANILLAJE B2B — MediLyft
// archivo: public/js/facturacion.js
// ============================================================

// ---- FACTURACIÓN B2C ----------------------------------------

async function loadFacturacionB2C() {
  const mes = document.getElementById('filtroMesB2C')?.value || new Date().getMonth() + 1;
  const anio = document.getElementById('filtroAnioB2C')?.value || new Date().getFullYear();

  const data = await supa('GET', 'facturacion_b2c', null,
    `?mes=eq.${mes}&anio=eq.${anio}&order=fecha_consulta.desc`);
  const registros = data || [];

  // Totales
  const total = registros.length;
  const monto = registros.reduce((s, r) => s + parseFloat(r.monto || 0), 0);
  const pendientes = registros.filter(r => r.estado_factura === 'pendiente').length;
  const facturados = registros.filter(r => r.estado_factura === 'facturado').length;

  document.getElementById('b2c-total-consultas').textContent = total;
  document.getElementById('b2c-monto-total').textContent = `$${monto.toFixed(2)}`;
  document.getElementById('b2c-pendientes').textContent = pendientes;
  document.getElementById('b2c-facturados').textContent = facturados;

  const tbody = document.getElementById('b2cBody');
  if (!registros.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#aaa;padding:2rem">Sin registros para este período</td></tr>`;
    return;
  }

  tbody.innerHTML = registros.map(r => `
    <tr>
      <td><strong>${r.nombre_completo || '—'}</strong></td>
      <td>${r.cedula || '—'}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.correo || '—'}</td>
      <td>${r.direccion || '—'}</td>
      <td>${r.fecha_consulta ? new Date(r.fecha_consulta).toLocaleDateString('es-EC') : '—'}</td>
      <td><strong>$${parseFloat(r.monto || 0).toFixed(2)}</strong></td>
      <td>${r.forma_pago === 'transferencia' ? '🏦 Transferencia' : r.forma_pago === 'tarjeta' ? '💳 Tarjeta' : r.forma_pago || '—'}</td>
      <td>
        <button class="btn btn-sm ${r.estado_factura === 'facturado' ? 'btn-success' : 'btn-danger'}"
          onclick="toggleEstadoB2C('${r.id}','${r.estado_factura}')"
          style="min-width:90px">
          ${r.estado_factura === 'facturado' ? '✅ Facturado' : '🔴 Pendiente'}
        </button>
      </td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#888">${r.sintomas || '—'}</td>
    </tr>
  `).join('');
}

async function toggleEstadoB2C(id, estadoActual) {
  const nuevoEstado = estadoActual === 'facturado' ? 'pendiente' : 'facturado';
  await supa('PATCH', 'facturacion_b2c', { estado_factura: nuevoEstado }, `?id=eq.${id}`);
  showToast(nuevoEstado === 'facturado' ? '✅ Marcado como facturado' : '🔴 Marcado como pendiente');
  loadFacturacionB2C();
}

function initFiltrosB2C() {
  const hoy = new Date();
  const mesEl = document.getElementById('filtroMesB2C');
  const anioEl = document.getElementById('filtroAnioB2C');
  if (mesEl) mesEl.value = hoy.getMonth() + 1;
  if (anioEl) anioEl.value = hoy.getFullYear();
}

// ---- PLANILLAJE B2B ----------------------------------------

async function loadPlanillajeB2B() {
  const mes = document.getElementById('filtroMesB2B')?.value || new Date().getMonth() + 1;
  const anio = document.getElementById('filtroAnioB2B')?.value || new Date().getFullYear();
  const empresaId = document.getElementById('filtroEmpresaB2B')?.value || '';

  let query = `?mes=eq.${mes}&anio=eq.${anio}&order=fecha_consulta.desc`;
  if (empresaId) query += `&empresa_id=eq.${empresaId}`;

  const data = await supa('GET', 'planillaje_b2b', null, query);
  const registros = data || [];

  // Totales
  const total = registros.length;
  const pendientes = registros.filter(r => r.estado_planillaje === 'pendiente').length;
  const planillados = registros.filter(r => r.estado_planillaje === 'planillado').length;

  document.getElementById('b2b-total-consultas').textContent = total;
  document.getElementById('b2b-pendientes').textContent = pendientes;
  document.getElementById('b2b-planillados').textContent = planillados;

  const tbody = document.getElementById('b2bBody');
  if (!registros.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#aaa;padding:2rem">Sin registros para este período</td></tr>`;
    return;
  }

  tbody.innerHTML = registros.map(r => `
    <tr>
      <td><strong>${r.nombre_paciente || '—'}</strong></td>
      <td>${r.cedula_paciente || '—'}</td>
      <td>${r.fecha_consulta ? new Date(r.fecha_consulta).toLocaleDateString('es-EC') : '—'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.sintomas || '—'}</td>
      <td>${r.nivel_sintomas === 3 ? '<span class="badge badge-red">Grave</span>' : r.nivel_sintomas === 2 ? '<span class="badge badge-yellow">Medio</span>' : '<span class="badge badge-green">Leve</span>'}</td>
      <td>
        <button class="btn btn-sm ${r.estado_planillaje === 'planillado' ? 'btn-success' : 'btn-danger'}"
          onclick="toggleEstadoB2B('${r.id}','${r.estado_planillaje}')"
          style="min-width:100px">
          ${r.estado_planillaje === 'planillado' ? '✅ Planillado' : '🔴 Pendiente'}
        </button>
      </td>
      <td style="font-size:12px;color:#888">${r.empresa_id || '—'}</td>
    </tr>
  `).join('');
}

async function toggleEstadoB2B(id, estadoActual) {
  const nuevoEstado = estadoActual === 'planillado' ? 'pendiente' : 'planillado';
  await supa('PATCH', 'planillaje_b2b', { estado_planillaje: nuevoEstado }, `?id=eq.${id}`);
  showToast(nuevoEstado === 'planillado' ? '✅ Marcado como planillado' : '🔴 Marcado como pendiente');
  loadPlanillajeB2B();
}

async function cargarEmpresasSelect() {
  const empresas = await supa('GET', 'clientes_b2b', null, '?activo=eq.true&order=nombre_empresa') || [];
  const sel = document.getElementById('filtroEmpresaB2B');
  if (!sel) return;
  sel.innerHTML = `<option value="">Todas las empresas</option>` +
    empresas.map(e => `<option value="${e.id}">${e.nombre_empresa}</option>`).join('');
}

function initFiltrosB2B() {
  const hoy = new Date();
  const mesEl = document.getElementById('filtroMesB2B');
  const anioEl = document.getElementById('filtroAnioB2B');
  if (mesEl) mesEl.value = hoy.getMonth() + 1;
  if (anioEl) anioEl.value = hoy.getFullYear();
  cargarEmpresasSelect();
}
