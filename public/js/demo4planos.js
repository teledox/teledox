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

let autoPlayTimeouts = [];

function clearAutoPlayTimeouts() {
  autoPlayTimeouts.forEach(t => clearTimeout(t));
  autoPlayTimeouts = [];
}

function moverCursorYClick(targetSelector, callback, delayAfterClick = 400) {
  const cursor = document.getElementById('virtualCursor');
  let targetEl = null;

  if (typeof targetSelector === 'string') {
    targetEl = document.querySelector(targetSelector) || document.getElementById(targetSelector);
  } else {
    targetEl = targetSelector;
  }

  if (!cursor || !targetEl || !isPlaying) {
    if (callback && isPlaying) callback();
    return;
  }

  // Auto-scroll para traer el elemento a la vista suavemente antes del movimiento del cursor
  try {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  } catch (e) {}

  // Esperar 300ms a que el scroll se posicione
  const t0 = setTimeout(() => {
    if (!isPlaying) return;

    const rect = targetEl.getBoundingClientRect();
    const clickX = rect.left + rect.width / 2;
    const clickY = rect.top + rect.height / 2;

    // 1. Mostrar cursor y deslizarlo suavemente
    cursor.style.opacity = '1';
    cursor.style.left = clickX + 'px';
    cursor.style.top = clickY + 'px';

    // 2. Esperar desplazamiento de cursor (0.75s) y luego hacer pulsación visual
    const t1 = setTimeout(() => {
      if (!isPlaying) return;
      cursor.classList.add('clicking');

      // Onda expansiva de click
      const ripple = document.createElement('div');
      ripple.className = 'virtual-click-ripple';
      ripple.style.left = clickX + 'px';
      ripple.style.top = clickY + 'px';
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);

      // 3. Liberar pulsación y ejecutar acción
      const t2 = setTimeout(() => {
        cursor.classList.remove('clicking');
        if (callback && isPlaying) callback();
      }, delayAfterClick);

      autoPlayTimeouts.push(t2);
    }, 750);

    autoPlayTimeouts.push(t1);
  }, 300);

  autoPlayTimeouts.push(t0);
}

function ocultarCursorVirtual() {
  const cursor = document.getElementById('virtualCursor');
  if (cursor) cursor.style.opacity = '0';
}

function toggleAutoPlay() {
  if (isPlaying) {
    stopAutoPlay();
  } else {
    startAutoPlay();
  }
}

function startAutoPlay() {
  clearAutoPlayTimeouts();
  resetDemoToZeroQuiet();

  isPlaying = true;
  const btn = document.getElementById('btnPlay');
  if (btn) btn.textContent = '⏸ Pausar Demo';

  // Paso 1: Mover cursor a chip de WhatsApp y hacer click (t = 1.2s)
  autoPlayTimeouts.push(setTimeout(() => {
    if (!isPlaying) return;
    setStep(1);
    moverCursorYClick('.wa-chip-btn', () => {
      simularMensajeUsuario('Tengo dolor de cabeza severo desde hace 2 días y fiebre de 38.2°C');
    });
  }, 1200));

  // Paso 2: Ir a Consola Médica tab y hacer click en Emitir Receta (t = 8.5s)
  autoPlayTimeouts.push(setTimeout(() => {
    if (!isPlaying) return;
    moverCursorYClick('#tabHead2', () => {
      switchRightTab(2);
      autoPlayTimeouts.push(setTimeout(() => {
        if (!isPlaying) return;
        moverCursorYClick('#btnSignRecipe', () => {
          firmarRecetaDemo();
        });
      }, 1500));
    });
  }, 8500));

  // Paso 3: Ir a Consola TPA Mawdy tab y hacer click en Aprobar (t = 16.5s)
  autoPlayTimeouts.push(setTimeout(() => {
    if (!isPlaying) return;
    moverCursorYClick('#tabHead4', () => {
      switchRightTab(4);
      autoPlayTimeouts.push(setTimeout(() => {
        if (!isPlaying) return;
        moverCursorYClick('#tpaTableBody .btn-success', () => {
          dictaminarDemo('aprobado');
        });
      }, 1500));
    });
  }, 16500));

  // Paso 4: Mover a botón de confirmación de adherencia en WhatsApp (t = 24.5s)
  autoPlayTimeouts.push(setTimeout(() => {
    if (!isPlaying) return;
    moverCursorYClick('[onclick*="confirmarAdherenciaDemo(true"]', () => {
      confirmarAdherenciaDemo(true, 'Paracetamol 500mg');
    });
  }, 24500));

  // Paso 5: Mover a pestaña Health Score y mostrar Alta Médica (>80 pts) (t = 31.5s)
  autoPlayTimeouts.push(setTimeout(() => {
    if (!isPlaying) return;
    moverCursorYClick('#tabHead3', () => {
      switchRightTab(3);
      ocultarCursorVirtual();
      stopAutoPlay();
      mostrarNotificacion('🏆 Demo completada: Alta médica otorgada a Verónica (>80 pts)', '#16a34a');
    });
  }, 31500));
}


function stopAutoPlay() {
  isPlaying = false;
  ocultarCursorVirtual();
  clearAutoPlayTimeouts();
  if (autoPlayInterval) clearInterval(autoPlayInterval);
  const btn = document.getElementById('btnPlay');
  if (btn) btn.textContent = '▶ Auto-Play Demo';
}


function resetDemoToZeroQuiet() {
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
    waBox.scrollTop = waBox.scrollHeight;
  }

  // Restablecer score inicial
  updateHealthScoreUI(76, 'Estado Inicial Base (76/100)', 'badge-green', '-0 pts', '76 / 100', 'Póliza Mawdy · Tratamiento HTA al día');

  // Restablecer estados de consolas
  const emptyState = document.getElementById('docEmptyState');
  const activeCard = document.getElementById('docActiveCard');
  if (emptyState) emptyState.style.display = 'block';
  if (activeCard) activeCard.style.display = 'none';

  const tpaEmpty = document.getElementById('tpaEmptyState');
  const tpaTable = document.getElementById('tpaTable');
  if (tpaEmpty) tpaEmpty.style.display = 'block';
  if (tpaTable) tpaTable.style.display = 'none';

  switchRightTab(2);
}

function resetDemoToZeroQuiet() {
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
    waBox.scrollTop = waBox.scrollHeight;
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

// ── REINICIALIZAR DESDE CERO (ESTADO 0) ─────────────────────────────────────
function resetDemoToZero() {
  stopAutoPlay();
  resetDemoToZeroQuiet();
}


// ── ACTUALIZACIÓN DINÁMICA DEL HEALTH SCORE EN EL BACKEND ──────────────────
function updateHealthScoreUI(score, statusText, badgeClass, penalty, totalText, sintomaLabel) {
  const numVal     = document.getElementById('scoreNumVal');
  const badge      = document.getElementById('scoreStatusBadge');
  const penaltyVal = document.getElementById('scorePenaltyVal');
  const totalVal   = document.getElementById('scoreTotalVal');
  const dialBg     = document.getElementById('scoreDialBg');
  const alertTitle = document.getElementById('hsAlertTitle');
  const alertDesc  = document.getElementById('hsAlertDesc');
  const alertBox   = document.getElementById('hsAlertBox');
  const hsTabBadge = document.getElementById('hsTabBadge');
  const penaltyRow = document.getElementById('scorePenaltyRow');
  const timelineBox= document.getElementById('hsTimelineBox');

  // ── Número central del dial ──
  if (numVal) {
    numVal.textContent = score;
    numVal.style.color = score < 50 ? '#ef4444' : score < 70 ? '#f59e0b' : score >= 85 ? '#2563eb' : '#16a34a';
  }
  if (hsTabBadge) hsTabBadge.textContent = score + ' pts';

  // ── Badge de estado ──
  if (badge) {
    badge.className = 'badge ' + badgeClass;
    badge.textContent = statusText;
  }

  // ── Badge de Alta Médica (Threshold 80 pts) ──
  const altaBadge = document.getElementById('altaStatusBadge');
  if (altaBadge) {
    if (score >= 80) {
      altaBadge.innerHTML = '<span class="badge badge-green" style="font-size:11px;padding:5px 10px;animation:fadeIn 0.3s">🎉 ALTA MÉDICA OTORGADA (&gt;80 pts)</span>';
    } else {
      altaBadge.innerHTML = '<span class="badge badge-yellow" style="font-size:10px;padding:4px 8px">En Tratamiento (&lt;80 pts)</span>';
    }
  }

  // ── Penalización dinámica (fila síntomas agudos) ──
  const penaltyNum = parseInt((penalty || '0').replace(/[^0-9\-]/g, '')) || 0;
  const ptsBase    = 62; // HTA + adherencia base
  const htaPts     = 30;
  const adherPts   = ptsBase - htaPts;

  // Calcular ajuste por síntoma para que la suma cuadre con el score total
  const sintomaImpacto = score - htaPts - adherPts;
  const sintomaLabel2  = sintomaLabel || 'Síntomas Agudos';
  const sintomaSign    = sintomaImpacto >= 0 ? `+${sintomaImpacto}` : `${sintomaImpacto}`;
  const sintomaColor   = sintomaImpacto >= 0 ? '#16a34a' : '#ef4444';

  if (penaltyRow) {
    penaltyRow.innerHTML = `
      <span>- Impacto Síntomas Agudos (${sintomaLabel2})</span>
      <strong style="color:${sintomaColor}" id="scorePenaltyVal">${sintomaSign} pts</strong>
    `;
  }
  if (totalVal) totalVal.textContent = `${score} / 100`;

  // ── Dial cónico ──
  if (dialBg) {
    let color = '#16a34a';
    if (score < 70)  color = '#f59e0b';
    if (score < 50)  color = '#ef4444';
    if (score >= 85) color = '#2563eb';
    dialBg.style.background = `conic-gradient(${color} 0% ${score}%, #e2e8f0 ${score}% 100%)`;
  }

  // ── Caja de alerta preventiva ──
  if (alertTitle) alertTitle.textContent = `Health Score en ${score} pts — ${statusText}`;
  if (alertDesc) {
    if (score < 50) {
      alertDesc.textContent = '🚨 Alerta Crítica: Caída severa del score. Caso derivado urgente al médico de guardia y TPA notificado.';
    } else if (score < 65) {
      alertDesc.textContent = '⚠️ Alerta Activa: Síntoma agudo detectado. Prioridad elevada en cola de atención médica.';
    } else if (score >= 85) {
      alertDesc.textContent = '✅ Nivel Óptimo: Paciente con excelente adherencia farmacológica y estabilidad clínica.';
    } else {
      alertDesc.textContent = '🔵 Estado Controlado: Monitorización activa. El médico tratante está revisando el caso.';
    }
  }
  if (alertBox) {
    const borderColor = score < 50 ? '#ef4444' : score < 65 ? '#f59e0b' : score >= 85 ? '#2563eb' : '#16a34a';
    const bgColor     = score < 50 ? '#fef2f2' : score < 65 ? '#fffbeb' : score >= 85 ? '#eff6ff' : '#f0fdf4';
    alertBox.style.borderLeftColor = borderColor;
    alertBox.style.background      = bgColor;
  }

  // ── Entrada en trazabilidad ──
  if (timelineBox) {
    const now = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    const badgeColorClass = score < 50 ? 'badge-red' : score < 65 ? 'badge-yellow' : score >= 85 ? 'badge-blue' : 'badge-green';
    const entryId = 'timeline_' + Date.now();
    const entryHTML = `
      <div id="${entryId}" style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;animation:fadeIn 0.4s ease">
        <div>
          <strong style="color:#0f172a">${now} — ${statusText}</strong><br>
          <span style="color:#64748b;font-size:11px">${sintomaLabel2} · Póliza Mawdy TPA</span>
        </div>
        <span class="badge ${badgeColorClass}" style="font-size:11px">${score} pts</span>
      </div>
    `;
    timelineBox.insertAdjacentHTML('afterbegin', entryHTML);

    // Limitar a 5 entradas en timeline
    const entries = timelineBox.querySelectorAll('[id^="timeline_"]');
    if (entries.length > 5) entries[entries.length - 1].remove();
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
    updateHealthScoreUI(61, 'ALERTA: Evento Agudo (61/100)', 'badge-yellow', '-15 pts (Febril)', '61 / 100', 'Síntoma agudo reportado');
  }

  if (step >= 3) {
    const recipeCard = document.getElementById('recipeCard');
    if (recipeCard) {
      recipeCard.style.opacity = '1';
      recipeCard.style.pointerEvents = 'auto';
    }
    updateHealthScoreUI(72, 'Tratamiento Asignado (72/100)', 'badge-blue', '-8 pts (Recuperación)', '72 / 100', 'Receta emitida por médico');
  }

  if (step === 4) {
    updateHealthScoreUI(76, 'Pertinencia Verificada (76/100)', 'badge-green', '-0 pts', '76 / 100', 'Dictamen TPA aprobado');
  }

  if (step === 5) {
    // Si aún no se ha enviado la tarjeta de seguimiento interactiva, enviarla automáticamente al WhatsApp
    if (!document.querySelector('[id^="seg_"]')) {
      enviarSeguimientoMedicamentosDemo('Doc');
    }
  }

}

// ── MOTOR DE INTELIGENCIA DE SÍNTOMAS (Frontend) ────────────────────────────
// alertaAlergia = true solo si el tratamiento habitual implica un AINE (Ibuprofeno)
function analizarSintoma(texto) {
  const t = texto.toLowerCase();
  if (/dolor.*pecho|pecho|infarto|corazón|coronar|cardio/.test(t))
    return { cie10:'I20 - Angina Pectoris', meds:'Aspirina 100mg + Nitroglicerina SL', prioridadLabel:'URGENTE', color:'#ef4444', badge:'badge-red', emoji:'🚨', alertaAlergia: false };
  if (/dificultad.*respi|falta.*aire|asma|bronq|disnea/.test(t))
    return { cie10:'J45 - Asma Bronquial', meds:'Salbutamol Inhalador + Prednisolona 20mg', prioridadLabel:'URGENTE', color:'#ef4444', badge:'badge-red', emoji:'🚨', alertaAlergia: false };
  if (/fiebre|febr|temperatura|38|39|40/.test(t))
    return { cie10:'R50.9 - Fiebre sin especificar', meds:'Paracetamol 500mg c/8h · Ibuprofeno BLOQUEADO (alergia)', prioridadLabel:'Moderada', color:'#f59e0b', badge:'badge-yellow', emoji:'⚠️', alertaAlergia: true };
  if (/cabeza|cefalea|migraña|jaqueca/.test(t))
    return { cie10:'G43 - Migraña / Cefalea Tensional', meds:'Paracetamol 1g + Metoclopramida 10mg · Ibuprofeno BLOQUEADO', prioridadLabel:'Moderada', color:'#f59e0b', badge:'badge-yellow', emoji:'⚠️', alertaAlergia: true };
  if (/náusea|vómito|estómago|gastri|colitis|diarrea|intestin/.test(t))
    return { cie10:'K29 - Gastritis / Colitis Aguda', meds:'Omeprazol 20mg + Metoclopramida 10mg + Suero oral', prioridadLabel:'Leve', color:'#2563eb', badge:'badge-blue', emoji:'💊', alertaAlergia: false };
  if (/presión|hipertens|hta|mareo/.test(t))
    return { cie10:'I10 - Hipertensión Esencial', meds:'Enalapril 10mg · Continuar tratamiento base', prioridadLabel:'Moderada', color:'#f59e0b', badge:'badge-yellow', emoji:'⚠️', alertaAlergia: false };
  if (/pie|rodilla|cadera|articulación|artritis|dolor.*hueso|espalda|lumbar/.test(t))
    return { cie10:'M54.5 - Lumbago / Dolor Musculoesquelético', meds:'Paracetamol 500mg + Reposo · Ibuprofeno BLOQUEADO (alergia)', prioridadLabel:'Leve', color:'#16a34a', badge:'badge-green', emoji:'🟢', alertaAlergia: true };
  if (/alergi|sarpullido|urticaria|picazón|ronchas/.test(t))
    return { cie10:'L50 - Urticaria Alérgica', meds:'Loratadina 10mg · Evitar AINEs (alergia documentada)', prioridadLabel:'Leve', color:'#16a34a', badge:'badge-green', emoji:'💊', alertaAlergia: true };
  if (/ansiedad|estrés|nervioso|angustia|pánico/.test(t))
    return { cie10:'F41.1 - Trastorno de Ansiedad Generalizada', meds:'Técnicas de respiración + Alprazolam 0.25mg SOS', prioridadLabel:'Leve', color:'#2563eb', badge:'badge-blue', emoji:'🧠', alertaAlergia: false };
  if (/gripe|resfri|congestión|moco|tos|garganta/.test(t))
    return { cie10:'J06.9 - Infección Respiratoria Alta', meds:'Paracetamol 500mg + Loratadina + Suero fisiológico nasal', prioridadLabel:'Leve', color:'#16a34a', badge:'badge-green', emoji:'🟢', alertaAlergia: false };
  // Default
  return { cie10:'R68.8 - Síntoma General sin especificar', meds:'Evaluación médica en curso — esperando resultado del triaje', prioridadLabel:'Moderada', color:'#f59e0b', badge:'badge-yellow', emoji:'⚠️', alertaAlergia: false };
}

// ── ANIMACIÓN DE CONTADOR NUMÉRICO ─────────────────────────────────────────
function animarContador(el, desde, hasta, durMs = 800) {
  if (!el) return;
  const pasos = 30;
  const diff  = hasta - desde;
  const delay = durMs / pasos;
  let i = 0;
  const iv = setInterval(() => {
    i++;
    el.textContent = Math.round(desde + (diff * i / pasos));
    if (i >= pasos) { el.textContent = hasta; clearInterval(iv); }
  }, delay);
}

// ── FLASH / PULSE DE TABS ──────────────────────────────────────────────────
function pulsarTab(tabNum) {
  const head = document.getElementById('tabHead' + tabNum);
  if (!head) return;
  head.style.transition = 'background 0.2s';
  head.style.background = '#2563eb22';
  setTimeout(() => { head.style.background = ''; }, 600);
}

// ── ACTUALIZAR CONSOLA MÉDICA DINÁMICAMENTE ─────────────────────────────────
function actualizarConsolaMedica(texto, sintomaData, score) {
  const emptyState    = document.getElementById('docEmptyState');
  const activeCard    = document.getElementById('docActiveCard');
  const allergyBanner = document.getElementById('allergyBanner');
  const docBadge      = document.getElementById('doctorTabBadge');

  if (emptyState) emptyState.style.display = 'none';
  if (activeCard) activeCard.style.display = 'grid';

  // Mostrar alerta de alergia SOLO si el síntoma implica un AINE/Ibuprofeno
  if (allergyBanner) {
    allergyBanner.style.display = sintomaData.alertaAlergia ? 'flex' : 'none';
  }

  // Badge del tab con pulso
  if (docBadge) {
    docBadge.textContent = '1 Alerta Activa';
    docBadge.style.background = '#ef4444';
    setTimeout(() => { docBadge.style.background = ''; }, 3000);
  }
  pulsarTab(2);

  // Actualizar ficha paciente con síntoma real
  const trSintomas = document.getElementById('trSintomas');
  if (trSintomas) trSintomas.innerHTML = `<strong style="color:${sintomaData.color}">${sintomaData.emoji} ${texto}</strong>`;

  const trTriaje = document.getElementById('trTriaje');
  if (trTriaje) trTriaje.innerHTML = `<span class="badge ${sintomaData.badge}">Prioridad ${sintomaData.prioridadLabel}</span>`;

  // Actualizar prescripción (CIE-10 y meds)
  const inputCie10 = document.getElementById('inputCie10');
  const textaMeds  = document.getElementById('textaMeds');
  if (inputCie10) { inputCie10.value = sintomaData.cie10; inputCie10.style.borderColor = sintomaData.color; }
  if (textaMeds)  { textaMeds.value  = sintomaData.meds; }

  // Notificación flotante
  mostrarNotificacion(`${sintomaData.emoji} Nueva consulta: ${texto.substring(0,40)}...`, sintomaData.color);
}

// ── ACTUALIZAR CONSOLA TPA DINÁMICAMENTE ─────────────────────────────────────
function actualizarConsolaTPA(texto, sintomaData, score) {
  const tpaEmpty  = document.getElementById('tpaEmptyState');
  const tpaTable  = document.getElementById('tpaTable');
  const auditBadge = document.getElementById('auditStatusBadge');
  const tpaTabBadge = document.getElementById('tpaTabBadge');
  const tpaBody   = document.getElementById('tpaTableBody');

  if (tpaEmpty) tpaEmpty.style.display = 'none';
  if (tpaTable) tpaTable.style.display = 'table';

  if (tpaTabBadge) {
    tpaTabBadge.textContent = '1 Pendiente';
    tpaTabBadge.style.background = '#ef4444';
    setTimeout(() => { tpaTabBadge.style.background = ''; }, 3000);
  }
  pulsarTab(4);

  if (auditBadge) {
    auditBadge.className = 'badge badge-yellow';
    auditBadge.textContent = 'Pendiente';
  }

  // Actualizar fila dinámica de la tabla TPA (5 columnas exactas)
  if (tpaBody) {
    const now = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    tpaBody.innerHTML = `
      <tr>
        <td>
          <strong>Verónica Ruiz</strong><br>
          <span style="color:#64748b;font-size:11px">Cédula: 1701234567</span>
        </td>
        <td>
          <div style="color:#1e40af;font-weight:700;font-size:12px">${sintomaData.cie10}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">💊 ${sintomaData.meds.split('+')[0].trim()}</div>
        </td>
        <td style="color:#475569;font-weight:600;font-size:11px">Hoy, ${now}</td>
        <td><span class="badge badge-yellow" id="auditStatusBadge">⏳ Pendiente Auditoría</span></td>
        <td>
          <button class="btn btn-sm btn-success" id="btnAuditApprove" style="font-size:11px;padding:4px 10px" onclick="dictaminarDemo('aprobado')">✓ Aprobar Cobertura</button>
        </td>
      </tr>
    `;
  }


  // Preguntas sugeridas en el RAG según síntoma
  const ragSuggestions = document.getElementById('ragSuggestions');
  if (ragSuggestions) {
    const pregunta1 = `¿Cuántos casos de "${texto.split(' ').slice(0,3).join(' ')}" se han atendido este mes?`;
    const pregunta2 = `¿Cuál es el costo promedio de una consulta urgente en Mawdy TPA?`;
    ragSuggestions.innerHTML = `
      <button class="wa-chip-btn" style="font-size:11px;padding:4px 8px;border-radius:8px;margin:2px" onclick="simularRAGPregunta('${pregunta1}')">${pregunta1.substring(0,50)}...</button>
      <button class="wa-chip-btn" style="font-size:11px;padding:4px 8px;border-radius:8px;margin:2px" onclick="simularRAGPregunta('${pregunta2}')">${pregunta2.substring(0,50)}...</button>
    `;
  }
}

// ── NOTIFICACIÓN FLOTANTE ──────────────────────────────────────────────────
function mostrarNotificacion(texto, color = '#2563eb') {
  const id = 'notif_' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = `
    position:fixed; top:80px; right:24px; z-index:9999;
    background:#ffffff; border-left:4px solid ${color};
    box-shadow:0 8px 24px rgba(0,0,0,0.15); border-radius:10px;
    padding:12px 16px; font-size:12px; max-width:280px;
    animation:slideInRight 0.4s ease; font-family:inherit;
  `;
  div.innerHTML = `<strong style="color:${color}">🔔 MediLyft Alerta</strong><br>${texto}`;
  document.body.appendChild(div);
  setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity 0.5s'; setTimeout(() => div.remove(), 500); }, 4000);
}

// ── ACTUALIZAR NARRATIVA ──────────────────────────────────────────────────
function actualizarNarrativa(texto, sintomaData) {
  const el = document.getElementById('narrativeText');
  if (el) el.textContent = `🔴 EN VIVO: "${texto.substring(0,50)}${texto.length>50?'…':''}" — Triaje: ${sintomaData.prioridadLabel} · CIE-10: ${sintomaData.cie10.split(' ')[0]} · Score calculado por IA en tiempo real`;
}

// ── SIMULADOR DE PREGUNTA RAG ──────────────────────────────────────────────
function simularRAGPregunta(pregunta) {
  const inputEl = document.getElementById('inputRAGDemo');
  if (inputEl) { inputEl.value = pregunta; preguntarRAGDemo(); }
  switchRightTab(4);
}

// ── ACCIONES INTERACTIVAS DEL USUARIO ──────────────────────────────────────
async function enviarMensajeLibreWA() {
  const inputEl = document.getElementById('waInputText');
  const waBox   = document.getElementById('waChatBox');
  if (!inputEl || !waBox) return;

  const texto = inputEl.value.trim();
  if (!texto) return;
  inputEl.value = '';

  const timeStr = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const sintomaData = analizarSintoma(texto);

  // 1. Mensaje del usuario en el chat
  waBox.innerHTML += `
    <div class="wa-msg out" style="animation:fadeIn 0.3s ease">
      ${texto}
      <div class="wa-time">${timeStr}</div>
    </div>
  `;
  waBox.scrollTop = waBox.scrollHeight;

  // 2. "Verónica está escribiendo..." typing indicator
  const typingId = 'wa_typing_' + Date.now();
  waBox.innerHTML += `
    <div class="wa-msg in" id="${typingId}" style="color:#25d366;font-style:italic;background:#202c33">
      <span style="display:inline-flex;gap:4px;align-items:center">
        <span style="width:6px;height:6px;background:#25d366;border-radius:50%;animation:typingDot 1s infinite 0s"></span>
        <span style="width:6px;height:6px;background:#25d366;border-radius:50%;animation:typingDot 1s infinite 0.2s"></span>
        <span style="width:6px;height:6px;background:#25d366;border-radius:50%;animation:typingDot 1s infinite 0.4s"></span>
        &nbsp;MediLyft procesando triaje IA...
      </span>
    </div>
  `;
  waBox.scrollTop = waBox.scrollHeight;

  // 3. Reaccionar en los otros paneles INMEDIATAMENTE (sin esperar al API)
  actualizarConsolaMedica(texto, sintomaData, 70);
  actualizarConsolaTPA(texto, sintomaData, 70);
  actualizarNarrativa(texto, sintomaData);
  pulsarTab(3);

  // Auto-switch al panel relevante según gravedad
  if (sintomaData.badge === 'badge-red') {
    switchRightTab(2); // Emergencia → Consola Médica
  } else {
    switchRightTab(3); // Normal → Health Score
  }

  try {
    const res = await fetch('/api/b2b-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'simular_webhook', mensaje: texto, telefono: '593999999999' })
    });

    const data = await res.json();
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    if (!res.ok) throw new Error(data.error || 'Error procesando webhook');

    // 4. Respuesta del bot en WhatsApp
    const respuestaBot = (data.respuesta || '').replace(/\*(.*?)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    waBox.innerHTML += `
      <div class="wa-msg in" style="animation:fadeIn 0.3s ease">
        ${respuestaBot}
        <div class="wa-time">${timeStr}</div>
      </div>
    `;
    waBox.scrollTop = waBox.scrollHeight;

    const score = data.healthScore || 61;

    // 5. Actualizar Health Score con animación de contador
    const scoreNumEl = document.getElementById('scoreNumVal');
    const scoreActual = parseInt(scoreNumEl?.textContent || '76');
    animarContador(scoreNumEl, scoreActual, score, 900);

    updateHealthScoreUI(
      score,
      `Prioridad ${data.prioridad || sintomaData.prioridadLabel} (${score}/100)`,
      data.healthScore < 50 ? 'badge-red' : data.healthScore < 70 ? 'badge-yellow' : 'badge-green',
      data.penalizacionText || '-0 pts',
      `${score} / 100`,
      texto
    );

    // 6. Actualizar consola médica con score real
    actualizarConsolaMedica(texto, sintomaData, score);

    setStep(2);

  } catch (err) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    waBox.innerHTML += `
      <div class="wa-msg in" style="border:1px solid #ef4444;color:#ef4444;animation:fadeIn 0.3s ease">
        ⚠️ ${err.message}
      </div>
    `;
    waBox.scrollTop = waBox.scrollHeight;
  }
}

function simularMensajeUsuario(texto) {
  const inputEl = document.getElementById('waInputText');
  if (inputEl) inputEl.value = texto;
  enviarMensajeLibreWA();
}

function iniciarVideollamadaDemo() {
  mostrarNotificacion('📞 Videoconsulta HD iniciada — Dr. Navarrete conectado', '#2563eb');
  const recipeCard = document.getElementById('recipeCard');
  if (recipeCard) { recipeCard.style.opacity = '1'; recipeCard.style.pointerEvents = 'auto'; }
  const waBox = document.getElementById('waChatBox');
  if (waBox) {
    const timeStr = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    waBox.innerHTML += `
      <div class="wa-msg in" style="border-left:4px solid #2563eb;animation:fadeIn 0.3s ease">
        📞 <strong>Videoconsulta iniciada</strong><br>El Dr. Patricio Navarrete le está atendiendo ahora. La llamada es segura y cifrada.
        <div class="wa-time">${timeStr}</div>
      </div>
    `;
    waBox.scrollTop = waBox.scrollHeight;
  }
  switchRightTab(2);
  setStep(3);
}

function firmarRecetaDemo() {
  const waBox = document.getElementById('waChatBox');
  const timeStr = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  if (waBox) {
    waBox.innerHTML += `
      <div class="wa-msg in" style="border-left:4px solid #2563eb;animation:fadeIn 0.3s ease">
        📄 <strong>Receta Digital Emitida:</strong><br>
        Dr. Patricio Navarrete ha emitido su receta digital (PDF firmado electrónicamente).<br>
        <span style="color:#2563eb;text-decoration:underline;cursor:pointer">Ver_Receta_Verónica_Ruiz.pdf</span>
        <div class="wa-time">${timeStr}</div>
      </div>
    `;
    waBox.scrollTop = waBox.scrollHeight;
  }
  mostrarNotificacion('✍️ Receta digital emitida y enviada al paciente', '#16a34a');
  updateHealthScoreUI(72, 'Tratamiento Asignado (72/100)', 'badge-blue', '-8 pts (Recuperación)', '72 / 100', 'Receta emitida por médico');
  if (!isPlaying) {
    switchRightTab(4);
    setStep(4);
  }
}

function dictaminarDemo(estado) {
  const auditBadge   = document.getElementById('auditStatusBadge');
  const tpaTabBadge  = document.getElementById('tpaTabBadge');
  const auditApprove = document.getElementById('btnAuditApprove');
  const countPending = document.getElementById('tpaCountPending');

  if (auditBadge) {
    auditBadge.className = estado === 'aprobado' ? 'badge badge-green' : 'badge badge-red';
    auditBadge.textContent = estado === 'aprobado' ? '✓ Pertinente (Aprobado)' : '✕ No Pertinente';
  }

  if (auditApprove) {
    auditApprove.disabled = true;
    auditApprove.style.opacity = '0.65';
    auditApprove.innerHTML = '✓ Dictaminado';
  }

  if (tpaTabBadge) tpaTabBadge.textContent = '0 Pendientes';
  if (countPending) {
    countPending.className = 'badge badge-green';
    countPending.textContent = '0 Pendientes';
  }

  mostrarNotificacion(`Dictamen registrado: ${estado.toUpperCase()} ✅`, estado === 'aprobado' ? '#16a34a' : '#ef4444');
  updateHealthScoreUI(76, 'Pertinencia Verificada (76/100)', 'badge-green', '-0 pts', '76 / 100', 'Dictamen TPA aprobado');
  if (!isPlaying) setStep(5);
}


// ── SEGUIMIENTO DE MEDICAMENTOS & ADHERENCIA 24H ───────────────────────────
function enviarSeguimientoMedicamentosDemo(origen = 'Doc') {
  const selectEl = document.getElementById(origen === 'HS' ? 'selectSeguimientoMedHS' : 'selectSeguimientoMedDoc');
  const medSelected = selectEl ? selectEl.value : 'Paracetamol 500mg';

  const waBox = document.getElementById('waChatBox');
  const now = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });

  if (waBox) {
    const msgId = 'seg_' + Date.now();
    waBox.innerHTML += `
      <div class="wa-msg in" id="${msgId}" style="border-left:4px solid #a855f7;background:#231b2e;color:#e9edef;animation:fadeIn 0.3s ease">
        💊 <strong style="color:#d8b4fe">Seguimiento de Adherencia MediLyft (24h):</strong><br>
        Hola Verónica, ¿ha tomado su medicamento <strong>${medSelected}</strong> prescrito por el Dr. Navarrete?<br>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          <button class="wa-chip-btn" style="font-size:11px;padding:6px 10px;background:#16a34a;color:#ffffff;border:none;border-radius:6px;cursor:pointer;font-weight:700" onclick="confirmarAdherenciaDemo(true, '${medSelected}')">✅ Sí, medicación tomada</button>
          <button class="wa-chip-btn" style="font-size:11px;padding:6px 10px;background:#dc2626;color:#ffffff;border:none;border-radius:6px;cursor:pointer;font-weight:700" onclick="confirmarAdherenciaDemo(false, '${medSelected}')">⚠️ Olvidé tomarla</button>
        </div>
        <div class="wa-time" style="color:rgba(233,237,239,0.6)">${now}</div>
      </div>
    `;
    waBox.scrollTop = waBox.scrollHeight;
  }

  mostrarNotificacion(`📲 Seguimiento de "${medSelected}" enviado al WhatsApp`, '#7c3aed');
}

function confirmarAdherenciaDemo(cumplido, medNombre) {
  const waBox = document.getElementById('waChatBox');
  const now = new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });

  if (waBox) {
    if (cumplido) {
      waBox.innerHTML += `
        <div class="wa-msg out" style="animation:fadeIn 0.3s ease">
          Sí, ya tomé mi medicación (${medNombre}) a la hora indicada. Me siento mucho mejor.
          <div class="wa-time" style="color:rgba(233,237,239,0.6)">${now}</div>
        </div>
        <div class="wa-msg in" style="border-left:4px solid #22c55e;background:#132a1e;color:#e9edef;animation:fadeIn 0.3s ease">
          📈 <strong style="color:#4ade80">Adherencia Confirmada · Health Score: 88/100</strong><br>
          ¡Excelente noticia! Registro de adherencia 24h guardado en la póliza Mawdy TPA.
          <div class="wa-time" style="color:rgba(233,237,239,0.6)">${now}</div>
        </div>
      `;
      updateHealthScoreUI(88, 'Adherencia Excelente (88/100)', 'badge-green', '+12 pts (Bono Adherencia 24h)', '88 / 100', `Adherencia confirmada (${medNombre})`);
      mostrarNotificacion('🏆 Health Score recuperado a 88 pts (Excelente Adherencia)', '#16a34a');
      if (!isPlaying) switchRightTab(3); // Mostrar pestaña Health Score al instante en modo manual
    } else {
      waBox.innerHTML += `

        <div class="wa-msg out" style="animation:fadeIn 0.3s ease">
          Olvidé tomar la dosis de la mañana de ${medNombre}.
          <div class="wa-time" style="color:rgba(233,237,239,0.6)">${now}</div>
        </div>
        <div class="wa-msg in" style="border-left:4px solid #f59e0b;background:#2d2312;color:#e9edef;animation:fadeIn 0.3s ease">
          ⚠️ <strong style="color:#fbbf24">Alerta de Seguridad Farmacéutica:</strong><br>
          Por favor tome su dosis lo antes posible sin duplicar la siguiente toma. El médico tratante ha sido notificado.
          <div class="wa-time" style="color:rgba(233,237,239,0.6)">${now}</div>
        </div>
      `;
      updateHealthScoreUI(65, 'Alerta: Dosis Omitida (65/100)', 'badge-yellow', '-11 pts (Dosis Omitida)', '65 / 100', `Omisión de dosis (${medNombre})`);
      mostrarNotificacion('⚠️ Omisión de medicamento reportada — Score bajó a 65 pts', '#f59e0b');
      switchRightTab(3); // Mostrar pestaña Health Score al instante
    }
    waBox.scrollTop = waBox.scrollHeight;
  }
}



// ── CHATBOT IA RAG GEMINI 2.0 FLASH ─────────────────────────────────────────
async function preguntarRAGDemo() {
  const inputEl = document.getElementById('inputRAGDemo');
  const chatBox = document.getElementById('chatBoxRAGDemo');
  if (!inputEl || !chatBox) return;

  const pregunta = inputEl.value.trim();
  if (!pregunta) return;
  inputEl.value = '';

  chatBox.innerHTML += `
    <div style="text-align:right;margin-bottom:8px;animation:fadeIn 0.3s ease">
      <span style="background:#2563eb;color:#fff;padding:8px 12px;border-radius:10px;border-bottom-right-radius:2px;display:inline-block;max-width:85%;font-size:12px">
        ${pregunta}
      </span>
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  const typingId = 'typing_' + Date.now();
  chatBox.innerHTML += `
    <div id="${typingId}" style="color:#64748b;font-style:italic;margin-bottom:8px;font-size:12px;animation:fadeIn 0.3s ease">
      🤖 Gemini 2.0 Flash consultando la base de datos de MediLyft...
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const res = await fetch('/api/b2b-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rag_kpi', pregunta })
    });

    const data  = await res.json();
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();
    if (!res.ok) throw new Error(data.error || 'Error procesando RAG');

    const respuestaHtml = (data.respuesta || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    chatBox.innerHTML += `
      <div style="background:#ffffff;border:1px solid #e2e8f0;padding:12px 14px;border-radius:10px;border-bottom-left-radius:2px;margin-bottom:8px;line-height:1.55;animation:fadeIn 0.3s ease">
        <div style="font-size:10px;font-weight:800;color:#2563eb;text-transform:uppercase;margin-bottom:6px">💡 Respuesta RAG · Gemini 2.0 Flash</div>
        <div style="font-size:12px">${respuestaHtml}</div>
      </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;

  } catch (err) {
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();
    chatBox.innerHTML += `
      <div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px 12px;border-radius:8px;margin-bottom:8px;font-size:12px">
        ⚠️ ${err.message}
      </div>
    `;
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

// Inicializar estado 0 al cargar
document.addEventListener('DOMContentLoaded', () => {
  resetDemoToZero();
});
