async function loadEmpresas() {
  const [empresas, pacientes, empleados] = await Promise.all([
    supa('GET', 'clientes_b2b',  null, '?select=*&order=nombre_empresa.asc'),
    supa('GET', 'pacientes',     null, '?select=cliente_b2b_id'),
    supa('GET', 'empleados_b2b', null, '?select=empresa_id')
  ]);
  const countsPac = {};
  (pacientes || []).forEach(p => {
    if (p.cliente_b2b_id) countsPac[p.cliente_b2b_id] = (countsPac[p.cliente_b2b_id] || 0) + 1;
  });
  const countsEmp = {};
  (empleados || []).forEach(e => {
    if (e.empresa_id) countsEmp[e.empresa_id] = (countsEmp[e.empresa_id] || 0) + 1;
  });

  document.getElementById('empresasBody').innerHTML = (empresas || []).map(e => `
    <tr>
      <td><strong>${e.nombre_empresa}</strong></td>
      <td style="text-align:center">${countsPac[e.id] || 0}</td>
      <td style="text-align:center">${countsEmp[e.id] || 0}</td>
      <td>${e.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-red">Inactivo</span>'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm" style="background:#f0f6ff;color:#4f8ef7;border-color:#4f8ef7"
          onclick="abrirCedulasPanel('${e.id}','${e.nombre_empresa.replace(/'/g,"\\'")}')">📋 Cédulas</button>
        <button class="btn btn-sm" style="background:#fff0f0;color:#FF5A5F;border-color:#FF5A5F"
          onclick="abrirEditarEmpresa('${e.id}','${e.nombre_empresa.replace(/'/g,"\\'")}')">✏️ Editar</button>
        <button class="btn btn-sm btn-danger"
          onclick="eliminarEmpresa('${e.id}','${e.nombre_empresa.replace(/'/g,"\\'")}')">🗑 Eliminar</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:2rem">Sin empresas</td></tr>';
}

async function saveEmpresa() {
  const nombre = document.getElementById('empNombre').value.trim();
  if (!nombre) { alert('Ingrese el nombre de la empresa'); return; }
  await supa('POST', 'clientes_b2b', { nombre_empresa: nombre, activo: true });
  document.getElementById('addEmpresaForm').style.display = 'none';
  document.getElementById('empNombre').value = '';
  loadEmpresas();
  showToast('✓ Empresa agregada');
}

function abrirEditarEmpresa(id, nombre) {
  document.getElementById('editEmpresaId').value     = id;
  document.getElementById('editEmpresaNombre').value = nombre;
  document.getElementById('addEmpresaForm').style.display = 'none';
  cerrarCedulasPanel();
  const form = document.getElementById('editEmpresaForm');
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function updateEmpresa() {
  const id     = document.getElementById('editEmpresaId').value;
  const nombre = document.getElementById('editEmpresaNombre').value.trim();
  if (!nombre) { alert('El nombre no puede estar vacío'); return; }
  await supa('PATCH', 'clientes_b2b', { nombre_empresa: nombre }, `?id=eq.${id}`);
  document.getElementById('editEmpresaForm').style.display = 'none';
  loadEmpresas();
  showToast('✓ Empresa actualizada');
}

async function eliminarEmpresa(id, nombre) {
  if (!confirm(`¿Eliminar la empresa "${nombre}"?\n\nLos pacientes vinculados quedarán sin empresa asignada.\n⚠️ No se puede deshacer.`)) return;
  await supa('PATCH', 'pacientes',     { cliente_b2b_id: null }, `?cliente_b2b_id=eq.${id}`);
  await supa('DELETE', 'clientes_b2b', null,                     `?id=eq.${id}`);
  cerrarCedulasPanel();
  loadEmpresas();
  showToast('✓ Empresa eliminada');
}

// ─── Panel de cédulas ───────────────────────────────────────────────────────

async function abrirCedulasPanel(empresaId, empresaNombre) {
  document.getElementById('addEmpresaForm').style.display  = 'none';
  document.getElementById('editEmpresaForm').style.display = 'none';
  document.getElementById('cedulasEmpresaId').value        = empresaId;
  document.getElementById('cedulasEmpresaNombre').textContent = empresaNombre;
  document.getElementById('excelCedulas').value            = '';
  document.getElementById('excelPreview').textContent      = '';
  const panel = document.getElementById('cedulasPanel');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await renderCedulas(empresaId);
}

function cerrarCedulasPanel() {
  document.getElementById('cedulasPanel').style.display = 'none';
  document.getElementById('excelCedulas').value         = '';
  document.getElementById('excelPreview').textContent   = '';
}

async function renderCedulas(empresaId) {
  const rows = await supa('GET', 'empleados_b2b', null,
    `?empresa_id=eq.${empresaId}&select=id,cedula&order=cedula.asc`);
  const list = rows || [];
  document.getElementById('cedulasCount').textContent =
    `${list.length} cédula${list.length !== 1 ? 's' : ''} registrada${list.length !== 1 ? 's' : ''}`;
  document.getElementById('cedulasBody').innerHTML = list.map((r, i) => `
    <tr>
      <td style="color:#aaa">${i + 1}</td>
      <td>${r.cedula}</td>
      <td style="text-align:right">
        <button class="btn btn-sm btn-danger" style="padding:2px 8px"
          onclick="eliminarCedula('${r.id}','${r.cedula}')">✕</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="text-align:center;color:#aaa;padding:1rem">Sin cédulas cargadas</td></tr>';
}

// Parsea el Excel y muestra preview antes de subir
function previewExcel() {
  const file = document.getElementById('excelCedulas').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const cedulas = extraerCedulas(data);
      document.getElementById('excelPreview').textContent =
        `${cedulas.length} cédula${cedulas.length !== 1 ? 's' : ''} detectada${cedulas.length !== 1 ? 's' : ''} — listas para cargar`;
    } catch {
      document.getElementById('excelPreview').textContent = 'Error al leer el archivo.';
    }
  };
  reader.readAsArrayBuffer(file);
}

function extraerCedulas(data) {
  return data
    .flat()
    .map(v => String(v ?? '').trim().replace(/\D/g, ''))
    .filter(v => v.length >= 6 && v.length <= 13);
}

async function subirCedulas() {
  const file      = document.getElementById('excelCedulas').files[0];
  const empresaId = document.getElementById('cedulasEmpresaId').value;
  if (!file) { showToast('Seleccione un archivo Excel'); return; }

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb      = XLSX.read(e.target.result, { type: 'array' });
      const ws      = wb.Sheets[wb.SheetNames[0]];
      const data    = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const cedulas = extraerCedulas(data);

      if (!cedulas.length) { showToast('No se encontraron cédulas válidas'); return; }

      // Upsert en lotes de 200
      const LOTE = 200;
      for (let i = 0; i < cedulas.length; i += LOTE) {
        const lote = cedulas.slice(i, i + LOTE).map(c => ({ empresa_id: empresaId, cedula: c }));
        await supa('POST', 'empleados_b2b', lote,
          '?on_conflict=empresa_id%2Ccedula&ignore_duplicates=true');
      }

      document.getElementById('excelCedulas').value       = '';
      document.getElementById('excelPreview').textContent = '';
      await renderCedulas(empresaId);
      loadEmpresas();
      showToast(`✓ ${cedulas.length} cédulas cargadas`);
    } catch (err) {
      console.error(err);
      showToast('Error al procesar el archivo');
    }
  };
  reader.readAsArrayBuffer(file);
}

async function eliminarCedula(id, cedula) {
  if (!confirm(`¿Eliminar la cédula ${cedula}?`)) return;
  const empresaId = document.getElementById('cedulasEmpresaId').value;
  await supa('DELETE', 'empleados_b2b', null, `?id=eq.${id}`);
  await renderCedulas(empresaId);
  loadEmpresas();
  showToast('✓ Cédula eliminada');
}

async function limpiarCedulasEmpresa() {
  const empresaId   = document.getElementById('cedulasEmpresaId').value;
  const empresaNombre = document.getElementById('cedulasEmpresaNombre').textContent;
  if (!confirm(`¿Eliminar TODAS las cédulas de "${empresaNombre}"?\n\n⚠️ No se puede deshacer.`)) return;
  await supa('DELETE', 'empleados_b2b', null, `?empresa_id=eq.${empresaId}`);
  await renderCedulas(empresaId);
  loadEmpresas();
  showToast('✓ Cédulas eliminadas');
}
