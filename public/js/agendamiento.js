async function openAgendar(consultaId, pacienteId) {
  currentConsultaId = consultaId; currentPacienteId = pacienteId;
  const [pac, medicos] = await Promise.all([
    supa('GET', 'pacientes', null, `?id=eq.${pacienteId}&select=*,clientes_b2b(*)`),
    supa('GET', 'usuarios', null, '?rol=eq.medico&activo=eq.true')
  ]);
  const p = (pac || [])[0] || {};
  document.getElementById('popupPacienteInfo').innerHTML = `<strong>${p.nombre || ''} ${p.apellidos || ''}</strong> · Cédula: ${p.cedula || '—'}<br>Empresa: ${p.clientes_b2b?.nombre_empresa || '—'} · Tel: ${p.telefono || '—'}`;
  document.getElementById('medicoAsignado').innerHTML = (medicos || []).map(m => `<option value="${m.id}">${m.nombre} ${m.apellidos} — ${m.especialidad || 'Medicina General'}</option>`).join('') || '<option>Sin médicos</option>';
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('fechaConfirmada').value = now.toISOString().slice(0, 16);
  document.getElementById('popupAgendar').classList.add('open');
}

async function confirmarAgendamiento() {
  const medicoId = document.getElementById('medicoAsignado').value;
  const fecha = document.getElementById('fechaConfirmada').value;
  const notas = document.getElementById('notasOperador').value;
  if (!fecha) { alert('Seleccione fecha y hora'); return; }
  await supa('PATCH', 'consultas', { estado: 'confirmada', medico_id: medicoId, updated_at: new Date().toISOString() }, `?id=eq.${currentConsultaId}`);
  await supa('POST', 'notificaciones', { tipo: 'confirmacion', titulo: '✅ Consulta confirmada', mensaje: `Su teleconsulta fue confirmada para ${new Date(fecha).toLocaleString('es-EC')}. ${notas || ''}`, paciente_id: currentPacienteId, consulta_id: currentConsultaId });
  closePopup();

  const medicoNombre = document.getElementById('medicoAsignado').selectedOptions[0]?.text.split(' — ')[0] || '';
  try {
    const res = await fetch('/api/notificar-agendamiento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paciente_id: currentPacienteId, fecha, medico_nombre: medicoNombre, notas })
    });
    const data = await res.json();
    if (!res.ok) showToast('✓ Consulta agendada — ⚠️ no se pudo avisar al paciente por WhatsApp');
    else showToast(`✓ Consulta agendada y avisada al paciente (${data.numero})`);
  } catch (e) {
    showToast('✓ Consulta agendada — ⚠️ no se pudo avisar al paciente por WhatsApp');
  }

  loadDashboard();
}
