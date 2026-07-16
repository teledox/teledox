/**
 * public/js/auditoria.js
 * Lógica del panel de Auditoría Médica TPA y Chatbot RAG de KPIs con IA.
 */

let auditoriaConsultasCache = [];

async function loadAuditoriaTPA() {
  const container = document.getElementById('auditoriaTPAContainer');
  if (!container) return;

  container.innerHTML = '<div class="empty-state" style="padding:2rem">Cargando expediente de auditoría TPA...</div>';

  try {
    const token = localStorage.getItem('token');
    const estadoAuditoria = document.getElementById('filterAuditoriaEstado')?.value || '';
    const empresaId = document.getElementById('filterAuditoriaEmpresa')?.value || '';

    const res = await fetch('/api/b2b-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        action: 'auditoria_listar',
        empresa_id: empresaId || null,
        estado_auditoria: estadoAuditoria || null
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error cargando datos de auditoría');

    auditoriaConsultasCache = data.consultas || [];
    renderAuditoriaTPA(auditoriaConsultasCache);

  } catch (err) {
    console.error('[auditoria-tpa]', err);
    container.innerHTML = `<div class="empty-state" style="color:#ef4444;padding:2rem">Error: ${err.message}</div>`;
  }
}

function renderAuditoriaTPA(consultas) {
  const container = document.getElementById('auditoriaTPAContainer');
  const countBadge = document.getElementById('auditoriaCountBadge');
  if (!container) return;

  if (countBadge) countBadge.textContent = consultas.length;

  if (!consultas.length) {
    container.innerHTML = '<div class="empty-state" style="padding:3rem">No hay consultas registradas para auditoría médica con los filtros seleccionados.</div>';
    return;
  }

  let html = `
    <table class="table" style="font-size:13px">
      <thead>
        <tr>
          <th>#</th>
          <th>Paciente</th>
          <th>Cédula</th>
          <th>Empresa / TPA</th>
          <th>Síntomas & Triaje</th>
          <th>Diagnóstico CIE-10 & Receta</th>
          <th>Médico Tratante</th>
          <th>Estado Auditoría</th>
          <th style="text-align:right">Dictamen</th>
        </tr>
      </thead>
      <tbody>
  `;

  consultas.forEach((c, index) => {
    const paciente = c.pacientes || {};
    const medico = c.usuarios || {};
    const empresa = c.clientes_b2b || {};
    const docs = c.documentos_clinicos || {};
    const receta = docs.receta || {};

    const estado = c.estado_auditoria || 'pendiente';
    let badgeClass = 'badge-yellow';
    let estadoLabel = 'Pendiente';

    if (estado === 'aprobado') { badgeClass = 'badge-green'; estadoLabel = '✓ Pertinente'; }
    if (estado === 'observado') { badgeClass = 'badge-blue'; estadoLabel = '👁 Observado'; }
    if (estado === 'rechazado') { badgeClass = 'badge-red'; estadoLabel = '✕ No pertinente'; }

    const cie10 = receta.cie10 ? receta.cie10.map(item => typeof item === 'object' ? `${item.codigo} - ${item.nombre}` : item).join(', ') : 'No registrado';
    const meds = receta.medicamentos || 'Sin medicamentos';

    html += `
      <tr>
        <td style="font-weight:700;color:#888">${index + 1}</td>
        <td>
          <strong>${paciente.nombre || ''} ${paciente.apellidos || ''}</strong><br>
          <span style="font-size:11px;color:#888">📞 ${paciente.telefono || '—'}</span>
        </td>
        <td>${paciente.cedula || '—'}</td>
        <td><span class="badge badge-blue">${empresa.nombre || 'B2B General'}</span></td>
        <td>
          <div style="max-width:220px;line-height:1.3">
            <div>${c.sintomas || '—'}</div>
            <span class="badge badge-subtle" style="font-size:10px;margin-top:4px">Prioridad: ${c.nivel_prioridad || 'Normal'}</span>
          </div>
        </td>
        <td>
          <div style="max-width:240px;font-size:12px;line-height:1.3">
            <div style="color:#1e40af;font-weight:600">🩺 ${cie10}</div>
            <div style="color:#555;font-size:11px;margin-top:2px">💊 ${meds}</div>
          </div>
        </td>
        <td>
          <div style="font-size:12px">
            <strong>${medico.nombre || ''} ${medico.apellidos || ''}</strong><br>
            <span style="font-size:11px;color:#888">${medico.especialidad || 'Medicina General'}</span>
          </div>
        </td>
        <td><span class="badge ${badgeClass}">${estadoLabel}</span></td>
        <td style="text-align:right">
          <div style="display:flex;gap:4px;justify-content:flex-end">
            <button class="btn btn-sm btn-success" style="font-size:11px;padding:3px 8px" onclick="abrirModalDictamen('${c.id}', 'aprobado')" title="Aprobar Pertinencia">✅ Aprobar</button>
            <button class="btn btn-sm" style="font-size:11px;padding:3px 8px;background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe" onclick="abrirModalDictamen('${c.id}', 'observado')" title="Observar">👁 Observar</button>
            <button class="btn btn-sm btn-danger" style="font-size:11px;padding:3px 8px" onclick="abrirModalDictamen('${c.id}', 'rechazado')" title="Rechazar">✕ Rechazar</button>
          </div>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

async function abrirModalDictamen(consultaId, estado) {
  const notas = prompt(`Ingrese observaciones para dictaminar la consulta como '${estado.toUpperCase()}':`, '');
  if (notas === null) return; // cancelado

  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/b2b-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        action: 'auditoria_dictamen',
        consulta_id: consultaId,
        estado_auditoria: estado,
        notas_auditoria: notas
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error registrando dictamen');

    alert(`Dictamen guardado como ${estado.toUpperCase()}`);
    loadAuditoriaTPA();

  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ── Chatbot RAG de KPIs con IA (Gemini 2.5 Flash) ─────────────────────────

async function enviarConsultaRAG(preguntaFija = null) {
  const inputEl = document.getElementById('inputPreguntaRAG');
  const chatBox = document.getElementById('chatBoxRAG');
  if (!chatBox) return;

  const pregunta = preguntaFija || (inputEl ? inputEl.value.trim() : '');
  if (!pregunta) return;

  if (inputEl) inputEl.value = '';

  // Mensaje usuario
  chatBox.innerHTML += `
    <div style="align-self:flex-end;background:#2563eb;color:#fff;border-radius:12px;border-bottom-right-radius:2px;padding:10px 14px;max-width:85%;font-size:13px;margin-bottom:8px">
      ${pregunta}
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  // Typing indicator
  const typingId = 'typingRAG_' + Date.now();
  chatBox.innerHTML += `
    <div id="${typingId}" style="align-self:flex-start;background:#f1f5f9;color:#64748b;border-radius:12px;border-bottom-left-radius:2px;padding:10px 14px;max-width:85%;font-size:12px;margin-bottom:8px">
      🤖 Consultando IA Gemini en vivo sobre la BD de MediLyft...
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/b2b-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        action: 'rag_kpi',
        pregunta
      })
    });

    const data = await res.json();
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    if (!res.ok) throw new Error(data.error || 'Error procesando consulta RAG');

    // Parse Markdown simple to HTML
    const textoHtml = data.respuesta
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    chatBox.innerHTML += `
      <div style="align-self:flex-start;background:#ffffff;border:1px solid #e2e8f0;color:#0f172a;border-radius:12px;border-bottom-left-radius:2px;padding:12px 16px;max-width:90%;font-size:13px;line-height:1.55;margin-bottom:12px;box-shadow:0 2px 4px rgba(0,0,0,0.04)">
        <div style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;margin-bottom:6px">💡 Respuesta RAG (Gemini 2.5 Flash)</div>
        ${textoHtml}
      </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;

  } catch (err) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    chatBox.innerHTML += `
      <div style="align-self:flex-start;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:12px;padding:10px 14px;font-size:12px;margin-bottom:8px">
        ⚠️ Error: ${err.message}
      </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}
