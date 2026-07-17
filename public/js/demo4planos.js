/**
 * public/js/demo4planos.js
 * Lógica de sincronización interactiva y guiada para la Demo de 4 Planos (Mawdy TPA).
 * Estructura: WhatsApp Fijo (Izq) + Plataforma 3 Pestañas (Der).
 */

let currentStep = 1;
let activeRightTab = 2; // Default: Consola Médica
let autoPlayInterval = null;
let isPlaying = false;

const NARRATIVES = {
  1: "Paso 1 (Plano 1 - Paciente): Verónica (42 años) envía sus síntomas por WhatsApp. El bot realiza el triaje, detecta HTA y Alergia a Ibuprofeno, y genera una alerta en la Consola Médica.",
  2: "Paso 2 (Plano 2 - Médico & Plano 3 - Health Score): La Consola Médica recibe la alerta. En el Backend, el Health Score de Verónica cae a 61 pts (Alerta Amarilla de Evento Agudo).",
  3: "Paso 3 (Plano 2 - Atención): El Dr. Patricio Navarrete inicia la videollamada HD y emite una receta con Paracetamol + Enalapril (Ibuprofeno bloqueado por seguridad). Verónica recibe el PDF en WhatsApp.",
  4: "Paso 4 (Plano 4 - Consola TPA Mawdy): El caso pasa a la Consola TPA. El auditor verifica la pertinencia clínica de la consulta de urgencia evitada y consulta a Gemini RAG.",
  5: "Paso 5 (Plano 1 & 3 - Seguimiento 24h): MediLyft consulta por WhatsApp la toma de medicamentos. Al confirmar, el Health Score se recupera a 88/100 (Excelente Adherencia)."
};

const STEP_RIGHT_TABS = {
  1: 2, // Pestaña 2 (Médico) al enviar síntomas
  2: 3, // Pestaña 3 (Health Score) para ver la caída a 61 y alerta
  3: 2, // Pestaña 2 (Médico) para firmar receta
  4: 4, // Pestaña 4 (Consola TPA) para auditoría e IA RAG
  5: 3  // Pestaña 3 (Health Score) para ver la recuperación a 88 pts
};

// ── NAVEGACIÓN DE PESTAÑAS DERECHAS ─────────────────────────────────────────
function switchRightTab(tabNum) {
  activeRightTab = tabNum;
  document.querySelectorAll('.right-tab').forEach((el, idx) => {
    // tabNum is 2, 3, or 4
    const idNum = idx + 2;
    el.classList.toggle('active', idNum === tabNum);
  });
  document.querySelectorAll('.right-content').forEach((el) => {
    const tabId = el.getAttribute('id');
    el.classList.toggle('active', tabId === ('tab' + tabNum));
  });
}

// ── NAVEGACIÓN Y AUTO-PLAY DE PASOS DEMO ────────────────────────────────────
function setStep(stepNum) {
  currentStep = Math.max(1, Math.min(5, stepNum));

  // Actualizar chips en la barra de control
  document.querySelectorAll('.demo-step-chip').forEach((chip, idx) => {
    const s = idx + 1;
    chip.classList.toggle('active', s === currentStep);
    chip.classList.toggle('completed', s < currentStep);
  });

  // Actualizar texto del guión
  const narrativeEl = document.getElementById('narrativeText');
  if (narrativeEl) {
    narrativeEl.textContent = NARRATIVES[currentStep] || '';
  }

  // Cambiar a la pestaña derecha correspondiente
  if (STEP_RIGHT_TABS[currentStep]) {
    switchRightTab(STEP_RIGHT_TABS[currentStep]);
  }

  // Ejecutar acciones del paso
  ejecutarAccionPaso(currentStep);
}

function nextStep() {
  if (currentStep < 5) {
    setStep(currentStep + 1);
  } else {
    stopAutoPlay();
  }
}

function prevStep() {
  setStep(currentStep - 1);
}

function jumpToStep(stepNum) {
  stopAutoPlay();
  setStep(stepNum);
}

function toggleAutoPlay() {
  if (isPlaying) {
    stopAutoPlay();
  } else {
    startAutoPlay();
  }
}

function startAutoPlay() {
  isPlaying = true;
  const btn = document.getElementById('btnPlay');
  if (btn) btn.textContent = '⏸ Pausar Demo';

  if (currentStep >= 5) resetDemoToZero();

  autoPlayInterval = setInterval(() => {
    if (currentStep < 5) {
      nextStep();
    } else {
      stopAutoPlay();
    }
  }, 7000); // 7 segundos por paso
}

function stopAutoPlay() {
  isPlaying = false;
  if (autoPlayInterval) clearInterval(autoPlayInterval);
  const btn = document.getElementById('btnPlay');
  if (btn) btn.textContent = '▶ Auto-Play Demo';
}

// ── REINICIALIZAR DESDE CERO (ESTADO 0) ─────────────────────────────────────
function resetDemoToZero() {
  stopAutoPlay();
  currentStep = 1;

  // Reset chips
  document.querySelectorAll('.demo-step-chip').forEach((chip, idx) => {
    chip.classList.toggle('active', idx === 0);
    chip.classList.remove('completed');
  });

  const narrativeEl = document.getElementById('narrativeText');
  if (narrativeEl) {
    narrativeEl.textContent = 'Paso 0: Sistema MediLyft listo. Escriba un síntoma en el WhatsApp a la izquierda para iniciar el caso...';
  }

  // Reset WhatsApp Chat
  const waBox = document.getElementById('waChatBox');
  if (waBox) {
    waBox.innerHTML = `
      <div class="wa-msg in">
        ¡Hola Verónica! 👋 bienvenido a *MediLyft*. Por favor cuéntenos cuáles son sus síntomas principales hoy.
        <div class="wa-time">09:15</div>
      </div>
    `;
  }

  // Reset Consola Médica
  const emptyState = document.getElementById('docEmptyState');
  const activeCard = document.getElementById('docActiveCard');
  const allergyBanner = document.getElementById('allergyBanner');
  const recipeCard = document.getElementById('recipeCard');
  const docBadge = document.getElementById('doctorTabBadge');

  if (emptyState) emptyState.style.display = 'block';
  if (activeCard) activeCard.style.display = 'none';
  if (allergyBanner) allergyBanner.style.display = 'none';
  if (recipeCard) {
    recipeCard.style.opacity = '0.6';
    recipeCard.style.pointerEvents = 'none';
  }
  if (docBadge) docBadge.textContent = '0 Alertas';

  // Reset Health Score
  updateHealthScoreUI(76, 'Nivel Estándar (76/100)', 'badge-green', '-0 pts', '76 / 100');

  // Reset TPA
  const tpaEmpty = document.getElementById('tpaEmptyState');
  const tpaTable = document.getElementById('tpaTable');
  const auditBadge = document.getElementById('auditStatusBadge');
  const tpaTabBadge = document.getElementById('tpaTabBadge');

  if (tpaEmpty) tpaEmpty.style.display = 'block';
  if (tpaTable) tpaTable.style.display = 'none';
  if (auditBadge) {
    auditBadge.className = 'badge badge-yellow';
    auditBadge.textContent = 'Pendiente';
  }
  if (tpaTabBadge) tpaTabBadge.textContent = '0 Pendientes';

  switchRightTab(2);
}

// ── ACTUALIZACIÓN DINÁMICA DEL HEALTH SCORE EN EL BACKEND ──────────────────
function updateHealthScoreUI(score, statusText, badgeClass, penalty, totalText) {
  const numVal = document.getElementById('scoreNumVal');
  const badge = document.getElementById('scoreStatusBadge');
  const penaltyVal = document.getElementById('scorePenaltyVal');
  const totalVal = document.getElementById('scoreTotalVal');
  const dialBg = document.getElementById('scoreDialBg');
  const alertTitle = document.getElementById('hsAlertTitle');
  const alertDesc = document.getElementById('hsAlertDesc');
  const hsTabBadge = document.getElementById('hsTabBadge');

  if (numVal) numVal.textContent = score;
  if (hsTabBadge) hsTabBadge.textContent = score + ' pts';

  if (badge) {
    badge.className = 'badge ' + badgeClass;
    badge.textContent = statusText;
  }
  if (penaltyVal) penaltyVal.textContent = penalty;
  if (totalVal) totalVal.textContent = totalText;

  if (alertTitle) {
    alertTitle.textContent = `Health Score en ${score} pts — ${statusText}`;
  }
  if (alertDesc) {
    if (score < 65) {
      alertDesc.textContent = '🚨 Alerta de Salud en Vivo: Caída repentina de score debido a Síndrome Febril. Notificado a médico y TPA.';
    } else if (score >= 85) {
      alertDesc.textContent = '✅ Nivel Óptimo: El paciente ha recuperado su estabilidad clínica tras confirmar adherencia farmacológica.';
    } else {
      alertDesc.textContent = '🔵 Estado Controlado: El médico tratante emitió la prescripción segura ajustando los antecedentes.';
    }
  }

  if (dialBg) {
    let color = '#16a34a';
    if (score < 70) color = '#f59e0b';
    if (score < 50) color = '#ef4444';
    if (score >= 80) color = '#2563eb';
    dialBg.style.background = `conic-gradient(${color} 0% ${score}%, #e2e8f0 ${score}% 100%)`;
  }
}

// ── LÓGICA DE ACCIONES POR PASO ─────────────────────────────────────────────
function ejecutarAccionPaso(step) {
  if (step >= 1) {
    const emptyState = document.getElementById('docEmptyState');
    const activeCard = document.getElementById('docActiveCard');
    const docBadge = document.getElementById('doctorTabBadge');
    if (emptyState) emptyState.style.display = 'none';
    if (activeCard) activeCard.style.display = 'grid';
    if (docBadge) docBadge.textContent = '1 Alerta';

    const tpaEmpty = document.getElementById('tpaEmptyState');
    const tpaTable = document.getElementById('tpaTable');
    const tpaTabBadge = document.getElementById('tpaTabBadge');
    if (tpaEmpty) tpaEmpty.style.display = 'none';
    if (tpaTable) tpaTable.style.display = 'table';
    if (tpaTabBadge) tpaTabBadge.textContent = '1 Pendiente';
  }

  if (step >= 2) {
    const allergyBanner = document.getElementById('allergyBanner');
    if (allergyBanner) allergyBanner.style.display = 'flex';
    updateHealthScoreUI(61, '🚨 ALERTA CRÍTICA: Evento Agudo (61/100)', 'badge-yellow', '-15 pts (Febril)', '61 / 100');
  }

  if (step >= 3) {
    const recipeCard = document.getElementById('recipeCard');
    if (recipeCard) {
      recipeCard.style.opacity = '1';
      recipeCard.style.pointerEvents = 'auto';
    }
    updateHealthScoreUI(72, '🔵 Tratamiento Asignado (72/100)', 'badge-blue', '-8 pts (Recuperación)', '72 / 100');
  }

  if (step === 4) {
    updateHealthScoreUI(76, '✓ Pertinencia Verificada (76/100)', 'badge-green', '-0 pts', '76 / 100');
  }

  if (step === 5) {
    updateHealthScoreUI(88, '✅ Adherencia Excelente (88/100)', 'badge-green', '+12 pts (Bono Adherencia 24h)', '88 / 100');

    const waBox = document.getElementById('waChatBox');
    if (waBox && !document.getElementById('msgAdherence')) {
      waBox.innerHTML += `
        <div class="wa-msg in" id="msgAdherence" style="margin-top:12px;border:1px solid #16a34a">
          💊 <strong>Recordatorio 24 horas MediLyft:</strong> Hola Verónica, ¿ya tomó su medicación (Paracetamol 500mg)?
          <div class="wa-time">hace 1 min</div>
        </div>
        <div class="wa-msg out">
          Sí, excelente. Ya no me duele la cabeza. Gracias. ✓
          <div class="wa-time">ahora</div>
        </div>
        <div class="wa-msg in" style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0">
          📈 <strong>Health Score Recuperado: 88/100</strong><br>
          Se ha registrado excelente adherencia. Su historial médico en Mawdy TPA ha sido actualizado.
          <div class="wa-time">ahora</div>
        </div>
      `;
      waBox.scrollTop = waBox.scrollHeight;
    }
  }
}

// ── ACCIONES INTERACTIVAS DEL USUARIO ──────────────────────────────────────
function simularMensajeUsuario(texto) {
  const waBox = document.getElementById('waChatBox');
  if (!waBox) return;

  waBox.innerHTML += `
    <div class="wa-msg out">
      ${texto}
      <div class="wa-time">09:16</div>
    </div>
  `;
  waBox.scrollTop = waBox.scrollHeight;

  setTimeout(() => {
    waBox.innerHTML += `
      <div class="wa-msg in">
        ⚡ <strong>Caso Clasificado: Prioridad Moderada.</strong><br>
        📊 <strong>Health Score Actualizado: 61/100 (Alerta Amarilla)</strong>.<br>
        Antecedentes consultados: HTA · <strong style="color:#ef4444">Alergia a Ibuprofeno</strong>.<br>
        Le conectamos de inmediato con un médico general de guardia.
        <div class="wa-time">09:16</div>
      </div>
    `;
    waBox.scrollTop = waBox.scrollHeight;
    setStep(2);
  }, 1000);
}

function iniciarVideollamadaDemo() {
  alert('📞 Videoconsulta HD Iniciada con la paciente Verónica Ruiz. Conectado al audio y video seguro.');
  const recipeCard = document.getElementById('recipeCard');
  if (recipeCard) {
    recipeCard.style.opacity = '1';
    recipeCard.style.pointerEvents = 'auto';
  }
  setStep(3);
}

function firmarRecetaDemo() {
  alert('✍️ Receta emitida con éxito (Paracetamol + Enalapril). Se ha generado el PDF con firma digital.');
  const waBox = document.getElementById('waChatBox');
  if (waBox) {
    waBox.innerHTML += `
      <div class="wa-msg in" style="border-left:4px solid #2563eb">
        📄 <strong>Receta Digital Emitida:</strong><br>
        Dr. Patricio Navarrete ha emitido su receta digital (PDF).<br>
        <span style="color:#2563eb;text-decoration:underline">Ver_Receta_Verónica_Ruiz.pdf</span>
        <div class="wa-time">09:25</div>
      </div>
    `;
    waBox.scrollTop = waBox.scrollHeight;
  }
  setStep(4);
}

function dictaminarDemo(estado) {
  const auditBadge = document.getElementById('auditStatusBadge');
  const tpaTabBadge = document.getElementById('tpaTabBadge');
  if (auditBadge) {
    if (estado === 'aprobado') {
      auditBadge.className = 'badge badge-green';
      auditBadge.textContent = '✓ Pertinente';
    }
  }
  if (tpaTabBadge) tpaTabBadge.textContent = '0 Pendientes';
  alert(`Dictamen guardado como ${estado.toUpperCase()}. Expediente marcado para planillaje B2B.`);
  setStep(5);
}

// ── CHATBOT IA RAG GEMINI 2.5 FLASH ─────────────────────────────────────────
async function preguntarRAGDemo() {
  const inputEl = document.getElementById('inputRAGDemo');
  const chatBox = document.getElementById('chatBoxRAGDemo');
  if (!inputEl || !chatBox) return;

  const pregunta = inputEl.value.trim();
  if (!pregunta) return;

  inputEl.value = '';

  chatBox.innerHTML += `
    <div style="text-align:right;margin-bottom:8px">
      <span style="background:#2563eb;color:#fff;padding:8px 12px;border-radius:10px;display:inline-block;max-width:85%">
        ${pregunta}
      </span>
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  const typingId = 'typing_' + Date.now();
  chatBox.innerHTML += `
    <div id="${typingId}" style="color:#64748b;font-style:italic;margin-bottom:8px">
      🤖 Gemini 2.5 Flash consultando la base de datos de MediLyft...
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const res = await fetch('/api/b2b-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'rag_kpi',
        pregunta
      })
    });

    const data = await res.json();
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    if (!res.ok) throw new Error(data.error || 'Error procesando RAG');

    const respuestaHtml = (data.respuesta || '')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    chatBox.innerHTML += `
      <div style="background:#ffffff;border:1px solid #cbd5e1;padding:10px 14px;border-radius:8px;margin-bottom:8px;line-height:1.5">
        <div style="font-size:10px;font-weight:800;color:#2563eb;text-transform:uppercase;margin-bottom:4px">💡 Respuesta RAG en Vivo:</div>
        ${respuestaHtml}
      </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;

  } catch (err) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    chatBox.innerHTML += `
      <div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px 12px;border-radius:8px;margin-bottom:8px">
        ⚠️ Error: ${err.message}
      </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

// Inicializar estado 0 al cargar
document.addEventListener('DOMContentLoaded', () => {
  resetDemoToZero();
});
