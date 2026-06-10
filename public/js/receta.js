const CIE10 = [
  {c:'A00',n:'Cólera'},{c:'A01',n:'Fiebre tifoidea y paratifoidea'},{c:'A02',n:'Otras infecciones por Salmonella'},{c:'A03',n:'Shigelosis'},{c:'A04',n:'Otras infecciones intestinales bacterianas'},{c:'A05',n:'Intoxicación alimentaria bacteriana'},{c:'A06',n:'Amebiasis'},{c:'A08',n:'Infecciones intestinales virales'},{c:'A09',n:'Diarrea y gastroenteritis de origen infeccioso'},{c:'A15',n:'Tuberculosis respiratoria'},{c:'A36',n:'Difteria'},{c:'A37',n:'Tos ferina (pertussis)'},{c:'A38',n:'Escarlatina'},{c:'A39',n:'Infección meningocócica'},{c:'A40',n:'Septicemia estreptocócica'},{c:'A41',n:'Septicemia, no especificada'},{c:'A46',n:'Erisipela'},{c:'A49',n:'Infección bacteriana, sin otra especificación'},{c:'A50',n:'Sífilis congénita'},{c:'A51',n:'Sífilis temprana'},{c:'A53',n:'Sífilis'},{c:'A54',n:'Gonococia'},{c:'A56',n:'Infecciones clamidiales de transmisión sexual'},{c:'A57',n:'Chancro blando'},{c:'A59',n:'Tricomoniasis'},{c:'A60',n:'Infección anogenital por herpesvirus'},{c:'A63',n:'Otras enfermedades de transmisión sexual'},{c:'A69',n:'Otras infecciones por espiroquetas'},{c:'A75',n:'Tifus'},{c:'A77',n:'Fiebre manchada'},{c:'A80',n:'Poliomielitis aguda'},{c:'A81',n:'Infecciones del SNC por virus lentos'},{c:'A82',n:'Rabia'},{c:'A83',n:'Encefalitis viral por mosquito'},{c:'A87',n:'Meningitis viral'},{c:'A90',n:'Dengue clásico'},{c:'A91',n:'Dengue hemorrágico'},{c:'A92',n:'Otras fiebres virales por mosquito'},{c:'A96',n:'Fiebre hemorrágica por arenavirus'},{c:'B00',n:'Infección por herpesvirus'},{c:'B01',n:'Varicela'},{c:'B02',n:'Zóster (herpes zóster)'},{c:'B03',n:'Viruela'},{c:'B04',n:'Viruela del simio'},{c:'B05',n:'Sarampión'},{c:'B06',n:'Rubéola'},{c:'B07',n:'Verrugas víricas'},{c:'B08',n:'Otras infecciones virales con lesiones cutáneas'},{c:'B09',n:'Infección viral no especificada con lesiones cutáneas'},{c:'B15',n:'Hepatitis A aguda'},{c:'B16',n:'Hepatitis B aguda'},{c:'B17',n:'Otras hepatitis virales agudas'},{c:'B18',n:'Hepatitis viral crónica'},{c:'B19',n:'Hepatitis viral no especificada'},{c:'B20',n:'VIH con enfermedades infecciosas'},{c:'B24',n:'VIH, no especificado'},{c:'B34',n:'Infección viral de sitio no especificado'},{c:'B35',n:'Dermatofitosis (tinea)'},{c:'B36',n:'Otras micosis superficiales'},{c:'B37',n:'Candidiasis'},{c:'B49',n:'Micosis no especificada'},{c:'B54',n:'Paludismo (malaria) no especificado'},{c:'B65',n:'Esquistosomiasis'},{c:'B76',n:'Anquilostomiasis'},{c:'B82',n:'Parasitosis intestinal no especificada'},{c:'B86',n:'Escabiosis (sarna)'},{c:'B99',n:'Enfermedades infecciosas no especificadas'},
  {c:'C00',n:'Tumor maligno del labio'},{c:'C15',n:'Tumor maligno del esófago'},{c:'C16',n:'Tumor maligno del estómago'},{c:'C18',n:'Tumor maligno del colon'},{c:'C20',n:'Tumor maligno del recto'},{c:'C25',n:'Tumor maligno del páncreas'},{c:'C34',n:'Tumor maligno del bronquio y pulmón'},{c:'C43',n:'Melanoma maligno de la piel'},{c:'C50',n:'Tumor maligno de la mama'},{c:'C53',n:'Tumor maligno del cuello del útero'},{c:'C54',n:'Tumor maligno del cuerpo del útero'},{c:'C61',n:'Tumor maligno de la próstata'},{c:'C67',n:'Tumor maligno de la vejiga urinaria'},{c:'C71',n:'Tumor maligno del encéfalo'},{c:'C80',n:'Tumor maligno de sitio no especificado'},{c:'C91',n:'Leucemia linfoide'},{c:'C92',n:'Leucemia mieloide'},
  {c:'D50',n:'Anemia por deficiencia de hierro'},{c:'D51',n:'Anemia por deficiencia de vitamina B12'},{c:'D52',n:'Anemia por deficiencia de folato'},{c:'D64',n:'Otras anemias'},{c:'D69',n:'Púrpura y otras afecciones hemorrágicas'},
  {c:'E01',n:'Trastornos tiroideos relacionados con yodo'},{c:'E03',n:'Hipotiroidismo'},{c:'E04',n:'Bocio no tóxico'},{c:'E05',n:'Tirotoxicosis (hipertiroidismo)'},{c:'E06',n:'Tiroiditis'},{c:'E10',n:'Diabetes mellitus tipo 1'},{c:'E11',n:'Diabetes mellitus tipo 2'},{c:'E14',n:'Diabetes mellitus no especificada'},{c:'E16',n:'Hipoglucemia'},{c:'E27',n:'Otros trastornos de la glándula suprarrenal'},{c:'E40',n:'Kwashiorkor'},{c:'E41',n:'Marasmo nutricional'},{c:'E44',n:'Desnutrición proteicocalórica moderada y leve'},{c:'E46',n:'Desnutrición proteicocalórica no especificada'},{c:'E55',n:'Deficiencia de vitamina D'},{c:'E58',n:'Deficiencia dietética de calcio'},{c:'E63',n:'Otras deficiencias nutricionales'},{c:'E66',n:'Obesidad'},{c:'E78',n:'Trastornos del metabolismo de lipoproteínas'},{c:'E83',n:'Trastornos del metabolismo de minerales'},
  {c:'F00',n:'Demencia en la enfermedad de Alzheimer'},{c:'F10',n:'Trastornos mentales por alcohol'},{c:'F20',n:'Esquizofrenia'},{c:'F31',n:'Trastorno bipolar'},{c:'F32',n:'Episodio depresivo'},{c:'F33',n:'Trastorno depresivo recurrente'},{c:'F40',n:'Trastornos fóbicos de ansiedad'},{c:'F41',n:'Trastornos de ansiedad'},{c:'F43',n:'Reacción al estrés grave y trastornos de adaptación'},{c:'F44',n:'Trastornos disociativos'},{c:'F45',n:'Trastornos somatomorfos'},{c:'F51',n:'Trastornos del sueño no orgánicos'},{c:'F90',n:'TDAH'},{c:'F99',n:'Trastorno mental no especificado'},
  {c:'G00',n:'Meningitis bacteriana'},{c:'G03',n:'Meningitis de otras causas'},{c:'G20',n:'Enfermedad de Parkinson'},{c:'G30',n:'Enfermedad de Alzheimer'},{c:'G35',n:'Esclerosis múltiple'},{c:'G40',n:'Epilepsia'},{c:'G43',n:'Migraña'},{c:'G44',n:'Otros síndromes de cefalea'},{c:'G45',n:'Ataques isquémicos cerebrales transitorios'},{c:'G47',n:'Trastornos del sueño'},{c:'G54',n:'Trastornos de raíces y plexos nerviosos'},{c:'G62',n:'Otras polineuropatías'},{c:'G89',n:'Dolor no clasificado en otra parte'},
  {c:'H00',n:'Orzuelo y chalazión'},{c:'H01',n:'Inflamación del párpado'},{c:'H10',n:'Conjuntivitis'},{c:'H11',n:'Otros trastornos de la conjuntiva'},{c:'H16',n:'Queratitis'},{c:'H25',n:'Catarata senil'},{c:'H26',n:'Otras cataratas'},{c:'H35',n:'Otros trastornos de la retina'},{c:'H40',n:'Glaucoma'},{c:'H52',n:'Trastornos de la acomodación y de la refracción'},{c:'H60',n:'Otitis externa'},{c:'H65',n:'Otitis media no supurativa'},{c:'H66',n:'Otitis media supurativa'},{c:'H72',n:'Perforación del tímpano'},{c:'H81',n:'Trastornos de la función vestibular'},{c:'H83',n:'Otros trastornos del oído interno'},
  {c:'I10',n:'Hipertensión esencial (primaria)'},{c:'I11',n:'Cardiopatía hipertensiva'},{c:'I15',n:'Hipertensión secundaria'},{c:'I20',n:'Angina de pecho'},{c:'I21',n:'Infarto agudo de miocardio'},{c:'I25',n:'Cardiopatía isquémica crónica'},{c:'I26',n:'Embolia pulmonar'},{c:'I33',n:'Endocarditis aguda y subaguda'},{c:'I42',n:'Cardiomiopatía'},{c:'I44',n:'Bloqueo auriculoventricular'},{c:'I48',n:'Fibrilación y flutter auricular'},{c:'I49',n:'Otras arritmias cardíacas'},{c:'I50',n:'Insuficiencia cardíaca'},{c:'I63',n:'Infarto cerebral'},{c:'I64',n:'Accidente vascular encefálico'},{c:'I67',n:'Otras enfermedades cerebrovasculares'},{c:'I70',n:'Aterosclerosis'},{c:'I80',n:'Flebitis y tromboflebitis'},{c:'I83',n:'Várices de las extremidades inferiores'},{c:'I84',n:'Hemorroides'},
  {c:'J00',n:'Rinofaringitis aguda (resfriado común)'},{c:'J01',n:'Sinusitis aguda'},{c:'J02',n:'Faringitis aguda'},{c:'J03',n:'Amigdalitis aguda'},{c:'J04',n:'Laringitis y traqueitis agudas'},{c:'J05',n:'Laringitis obstructiva aguda y epiglotitis'},{c:'J06',n:'Infecciones agudas de las vías respiratorias superiores'},{c:'J09',n:'Influenza por virus identificado'},{c:'J10',n:'Influenza (gripe)'},{c:'J11',n:'Influenza virus no identificado'},{c:'J12',n:'Neumonía viral'},{c:'J13',n:'Neumonía por Streptococcus pneumoniae'},{c:'J14',n:'Neumonía por Haemophilus influenzae'},{c:'J15',n:'Neumonía bacteriana'},{c:'J18',n:'Neumonía no especificada'},{c:'J20',n:'Bronquitis aguda'},{c:'J21',n:'Bronquiolitis aguda'},{c:'J22',n:'Infección aguda de las vías respiratorias inferiores'},{c:'J30',n:'Rinitis alérgica y vasomotora'},{c:'J31',n:'Rinitis crónica, nasofaringitis y faringitis'},{c:'J32',n:'Sinusitis crónica'},{c:'J35',n:'Enfermedades crónicas de amígdalas y adenoides'},{c:'J38',n:'Enfermedades de las cuerdas vocales y laringe'},{c:'J40',n:'Bronquitis no especificada'},{c:'J41',n:'Bronquitis crónica simple y mucopurulenta'},{c:'J42',n:'Bronquitis crónica no especificada'},{c:'J43',n:'Enfisema'},{c:'J44',n:'EPOC (enfermedad pulmonar obstructiva crónica)'},{c:'J45',n:'Asma'},{c:'J46',n:'Estado asmático'},{c:'J47',n:'Bronquiectasia'},
  {c:'K00',n:'Trastornos del desarrollo de los dientes'},{c:'K02',n:'Caries dental'},{c:'K04',n:'Enfermedades de la pulpa y tejidos periapicales'},{c:'K05',n:'Gingivitis y enfermedades periodontales'},{c:'K08',n:'Otros trastornos de los dientes'},{c:'K20',n:'Esofagitis'},{c:'K21',n:'Enfermedad por reflujo gastroesofágico'},{c:'K25',n:'Úlcera gástrica'},{c:'K26',n:'Úlcera duodenal'},{c:'K27',n:'Úlcera péptica'},{c:'K29',n:'Gastritis y duodenitis'},{c:'K30',n:'Dispepsia'},{c:'K35',n:'Apendicitis aguda'},{c:'K37',n:'Apendicitis no especificada'},{c:'K40',n:'Hernia inguinal'},{c:'K41',n:'Hernia femoral'},{c:'K44',n:'Hernia diafragmática'},{c:'K51',n:'Colitis ulcerativa'},{c:'K52',n:'Gastroenteritis y colitis no infecciosa'},{c:'K57',n:'Enfermedad diverticular del intestino'},{c:'K58',n:'Síndrome del colon irritable'},{c:'K59',n:'Otros trastornos funcionales del intestino'},{c:'K62',n:'Otras enfermedades del ano y recto'},{c:'K70',n:'Enfermedad hepática alcohólica'},{c:'K74',n:'Fibrosis y cirrosis del hígado'},{c:'K80',n:'Colelitiasis (cálculos biliares)'},{c:'K81',n:'Colecistitis'},{c:'K85',n:'Pancreatitis aguda'},{c:'K86',n:'Otras enfermedades del páncreas'},
  {c:'L01',n:'Impétigo'},{c:'L02',n:'Absceso cutáneo, forúnculo y ántrax'},{c:'L03',n:'Celulitis'},{c:'L04',n:'Linfadenitis aguda'},{c:'L08',n:'Otras infecciones locales de la piel'},{c:'L20',n:'Dermatitis atópica'},{c:'L21',n:'Dermatitis seborreica'},{c:'L22',n:'Dermatitis del pañal'},{c:'L23',n:'Dermatitis alérgica de contacto'},{c:'L25',n:'Dermatitis de contacto no especificada'},{c:'L27',n:'Dermatitis por sustancias ingeridas'},{c:'L29',n:'Prurito'},{c:'L30',n:'Otras dermatitis'},{c:'L40',n:'Psoriasis'},{c:'L50',n:'Urticaria'},{c:'L57',n:'Cambios en la piel por exposición crónica a radiación'},{c:'L60',n:'Trastornos de las uñas'},{c:'L70',n:'Acné'},{c:'L71',n:'Rosácea'},{c:'L72',n:'Quistes foliculares de la piel'},{c:'L80',n:'Vitíligo'},{c:'L98',n:'Otros trastornos de la piel'},
  {c:'M00',n:'Artritis piógena'},{c:'M05',n:'Artritis reumatoide seropositiva'},{c:'M06',n:'Otras artritis reumatoides'},{c:'M10',n:'Gota'},{c:'M13',n:'Otras artritis'},{c:'M15',n:'Poliartrosis'},{c:'M16',n:'Coxartrosis (artritis de cadera)'},{c:'M17',n:'Gonartrosis (artritis de rodilla)'},{c:'M19',n:'Otras artrosis'},{c:'M25',n:'Otros trastornos articulares'},{c:'M32',n:'Lupus eritematoso sistémico'},{c:'M40',n:'Cifosis y lordosis'},{c:'M41',n:'Escoliosis'},{c:'M42',n:'Osteocondritis espinal'},{c:'M47',n:'Espondiloartrosis'},{c:'M48',n:'Otras espondilopatías'},{c:'M50',n:'Trastornos de disco cervical'},{c:'M51',n:'Otros trastornos de disco intervertebral'},{c:'M54',n:'Dorsalgia (dolor de espalda)'},{c:'M60',n:'Miositis'},{c:'M65',n:'Sinovitis y tenosinovitis'},{c:'M70',n:'Trastornos de tejidos blandos por uso excesivo'},{c:'M75',n:'Lesiones del hombro'},{c:'M79',n:'Otros trastornos de tejidos blandos'},{c:'M80',n:'Osteoporosis con fractura'},{c:'M81',n:'Osteoporosis sin fractura'},
  {c:'N00',n:'Síndrome nefrítico agudo'},{c:'N03',n:'Síndrome nefrítico crónico'},{c:'N10',n:'Nefritis tubulointersticial aguda'},{c:'N17',n:'Insuficiencia renal aguda'},{c:'N18',n:'Insuficiencia renal crónica'},{c:'N20',n:'Cálculos del riñón y uréter'},{c:'N21',n:'Cálculos del tracto urinario inferior'},{c:'N23',n:'Cólico renal no especificado'},{c:'N28',n:'Otros trastornos del riñón'},{c:'N30',n:'Cistitis'},{c:'N34',n:'Uretritis'},{c:'N39',n:'Otras enfermedades del sistema urinario'},{c:'N40',n:'Hiperplasia de la próstata'},{c:'N41',n:'Enfermedades inflamatorias de la próstata'},{c:'N43',n:'Hidrocele y espermatocele'},{c:'N45',n:'Orquitis y epididimitis'},{c:'N50',n:'Otros trastornos de los órganos genitales masculinos'},{c:'N70',n:'Salpingitis y ooforitis'},{c:'N71',n:'Enfermedad inflamatoria del útero'},{c:'N72',n:'Enfermedad inflamatoria del cuello del útero'},{c:'N73',n:'Otras enfermedades inflamatorias pélvicas femeninas'},{c:'N76',n:'Otras inflamaciones de la vagina y vulva'},{c:'N80',n:'Endometriosis'},{c:'N83',n:'Trastornos no inflamatorios del ovario'},{c:'N91',n:'Menstruación ausente, escasa o rara'},{c:'N92',n:'Menstruación excesiva, frecuente e irregular'},{c:'N94',n:'Dolor y otras afecciones relacionadas con órganos genitales femeninos'},{c:'N95',n:'Trastornos menopáusicos'},
  {c:'O00',n:'Embarazo ectópico'},{c:'O20',n:'Hemorragia precoz del embarazo'},{c:'O21',n:'Vómitos excesivos del embarazo'},{c:'O24',n:'Diabetes mellitus en el embarazo'},{c:'O26',n:'Atención por otras afecciones en el embarazo'},{c:'O42',n:'Rotura prematura de membranas'},{c:'O80',n:'Parto único espontáneo'},
  {c:'R00',n:'Anomalías del latido cardíaco'},{c:'R05',n:'Tos'},{c:'R06',n:'Anomalías de la respiración'},{c:'R07',n:'Dolor de garganta y pecho'},{c:'R10',n:'Dolor abdominal y pélvico'},{c:'R11',n:'Náuseas y vómitos'},{c:'R12',n:'Pirosis (acidez)'},{c:'R21',n:'Erupción cutánea'},{c:'R42',n:'Vértigo'},{c:'R50',n:'Fiebre de origen desconocido'},{c:'R51',n:'Cefalea (dolor de cabeza)'},{c:'R52',n:'Dolor no especificado'},{c:'R53',n:'Malestar y fatiga'},{c:'R55',n:'Síncope y colapso'},
  {c:'U07',n:'COVID-19'},{c:'U09',n:'Afección post-COVID-19'},
  {c:'Z00',n:'Examen general'},{c:'Z10',n:'Examen rutinario de salud'},{c:'Z23',n:'Necesidad de inmunización'},{c:'Z30',n:'Anticoncepción'},{c:'Z34',n:'Supervisión del embarazo normal'}
];

let _pacData = {};

// Datalist global de códigos CIE-10 para autocompletar en receta, certificado e historia clínica
function _poblarDatalistCIE10() {
  const dl = document.getElementById('cie10-list');
  if (!dl || dl.children.length) return;
  dl.innerHTML = CIE10.map(x => `<option value="${x.c}">${x.c} — ${x.n}</option>`).join('');
}
window.addEventListener('load', _poblarDatalistCIE10);

async function openReceta(consultaId, pacienteId) {
  recetaConsultaId = consultaId;
  recetaPacienteId = pacienteId;
  medicamentosData = [];
  cie10Seleccionados = [];

  // Reset campos, PDFs y botones de acción
  pdfGenerados = { receta: null, certificado: null, pedido: null, historia: null, interconsulta: null };
  actualizarCheckboxDocs();
  const btnEnviar = document.getElementById('btnEnviarDocs');
  if (btnEnviar) { btnEnviar.disabled = false; btnEnviar.textContent = '📤 Enviar documentos al paciente'; btnEnviar.style.background = '#FF5A5F'; btnEnviar.style.borderColor = '#FF5A5F'; }
  const btnSeg = document.getElementById('btnActivarSeguimiento');
  if (btnSeg) { btnSeg.disabled = false; btnSeg.textContent = '🔔 Activar seguimiento de tratamiento'; btnSeg.style.background = '#f97316'; btnSeg.style.borderColor = '#f97316'; }
  const btnCronica = document.getElementById('btnActivarCronica');
  if (btnCronica) { btnCronica.disabled = false; btnCronica.textContent = '🏥 Activar seguimiento crónico'; btnCronica.style.background = '#2563eb'; btnCronica.style.borderColor = '#2563eb'; }
  ['recetaDiagnostico','cie10Search','recetaNotas','recetaIndicaciones']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cie10Dropdown').style.display = 'none';
  document.getElementById('cie10Seleccionados').innerHTML = '';

  // Cargar paciente y consulta — alimentan currentPacienteData/currentConsultaData,
  // que usan todas las funciones abrirPlantillaXxx para autorrellenar los documentos
  const [pacRes, consultaRes] = await Promise.all([
    supa('GET', 'pacientes', null, `?id=eq.${pacienteId}&select=*,clientes_b2b(*)`),
    supa('GET', 'consultas', null, `?id=eq.${consultaId}`)
  ]);
  _pacData = (pacRes || [])[0] || {};
  currentPacienteData = _pacData;
  currentConsultaData = (consultaRes || [])[0] || {};

  const init = ((_pacData.nombre || '?')[0] + (_pacData.apellidos || '?')[0]).toUpperCase();
  document.getElementById('recetaPacienteHeader').innerHTML = `
    <div class="patient-avatar-lg">${init}</div>
    <div><div class="patient-name">${_pacData.nombre || ''} ${_pacData.apellidos || ''}</div>
    <div class="patient-meta">Cédula: ${_pacData.cedula || '—'} · ${_pacData.clientes_b2b?.nombre_empresa || '—'} · Tel: ${_pacData.telefono || '—'}</div></div>
  `;
  showPage('receta');

  // Pre-cargar receta si existe
  const recetaData = await supa('GET', 'recetas', null, `?consulta_id=eq.${consultaId}&order=created_at.desc&limit=1`);
  const receta = (recetaData || [])[0];
  if (receta) {
    document.getElementById('recetaDiagnostico').value = receta.diagnostico || '';
    document.getElementById('recetaIndicaciones').value = receta.indicaciones || '';
    medicamentosData = (receta.medicamentos || []).map(m => ({ ...m, id: Date.now() + Math.random() }));
    cie10Seleccionados = receta.cie10_codigos || [];
    renderCIE10();
  }

  // Card de medicamentos de seguimiento (independiente del PDF)
  if (typeof renderSeguimientoMeds === 'function') renderSeguimientoMeds();

  // Cargar datos guardados de los documentos para esta consulta (para pre-rellenar al reabrir)
  documentosGuardados = {};
  const docsGuardados = await supa('GET', 'documentos_datos', null, `?consulta_id=eq.${consultaId}`);
  (docsGuardados || []).forEach(d => { documentosGuardados[d.tipo] = d.datos; });

  // Re-pintar los mini-previews de los documentos ya generados/guardados
  if (typeof renderPreviewsGuardados === 'function') renderPreviewsGuardados();

  // Timeline de seguimiento de esta consulta + enfermedades crónicas del paciente
  if (typeof renderSeguimientoTimeline === 'function') renderSeguimientoTimeline();
  if (typeof renderCronicasConsulta === 'function') renderCronicasConsulta();
}

// ── Timeline de seguimiento de esta consulta (mensajes enviados + respuestas) ──
function segEstadoInfo(s) {
  if (s.respuesta == null) return { cls: 'seg-gris', label: '⏳ Sin respuesta' };
  if (s.tomo_medicamento === false) return { cls: 'seg-naranja', label: '⚠️ No tomó el medicamento' };
  if (s.tomo_medicamento === true)  return { cls: 'seg-verde',   label: '✅ Tomó el medicamento' };
  if (s.respuesta === '3') return { cls: 'seg-rojo',     label: '🔴 No mejoró / empeoró' };
  if (s.respuesta === '2') return { cls: 'seg-amarillo', label: '🟡 Mejoró, persisten síntomas' };
  if (s.se_siente_mejor === true || s.respuesta === '1' || s.respuesta === 'curado')
    return { cls: 'seg-verde', label: '✅ Se siente mejor / Curado' };
  return { cls: 'seg-gris', label: s.respuesta };
}

function segPreguntaLabel(s) {
  const p = s.pregunta || '';
  if (/tomar su medicamento/i.test(p)) return '💊 Control de medicamento';
  if (/tratamiento.*finalizado/i.test(p)) return '🏥 Cierre de tratamiento';
  return '🔁 Mensaje de seguimiento';
}

function segAlertaBadge(s) {
  const a = s._alerta;
  if (!a) return '';
  const m = a.medico_validador;
  const medNombre = m ? ` — Dr. ${m.nombre || ''} ${m.apellidos || ''}`.trim() : '';
  if (a.estado_validacion === 'aprobada')  return `<span class="seg-alerta-badge seg-aprobada">✅ Aprobada${medNombre}</span>`;
  if (a.estado_validacion === 'rechazada') return `<span class="seg-alerta-badge seg-rechazada">❌ Rechazada${medNombre}</span>`;
  return `<span class="seg-alerta-badge seg-pendiente">⏳ Pendiente de revisión médica</span>`;
}

async function renderSeguimientoTimeline() {
  const el = document.getElementById('segTimelineConsulta');
  if (!el) return;
  const segs = await supa('GET', 'seguimiento_respuestas', null,
    `?consulta_id=eq.${recetaConsultaId}&select=*&order=created_at.asc`) || [];
  if (!segs.length) {
    el.innerHTML = '<div class="empty-state">Sin mensajes de seguimiento enviados todavía.</div>';
    return;
  }
  const segIds = segs.map(s => s.id);
  const alertas = await supa('GET', 'notificaciones', null,
    `?seguimiento_respuesta_id=in.(${segIds.join(',')})&select=seguimiento_respuesta_id,estado_validacion,medico_validador:usuarios!notificaciones_medico_validador_id_fkey(nombre,apellidos)`) || [];
  const alertaPorSeg = {};
  alertas.forEach(a => { alertaPorSeg[a.seguimiento_respuesta_id] = a; });
  segs.forEach(s => { s._alerta = alertaPorSeg[s.id] || null; });

  el.innerHTML = `<div class="seg-timeline">${segs.map(s => {
    const info = segEstadoInfo(s);
    return `<div class="seg-item ${info.cls}">
      <div class="seg-item-fecha">${new Date(s.created_at).toLocaleString('es-EC',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
      <div class="seg-item-pregunta" title="${(s.pregunta || '').replace(/"/g,'&quot;')}">${segPreguntaLabel(s)}</div>
      <div class="seg-item-respuesta">${info.label}</div>
      ${segAlertaBadge(s)}
    </div>`;
  }).join('')}</div>`;
}

// ── Enfermedades crónicas activas del paciente (para activar seguimiento) ──
async function renderCronicasConsulta() {
  const el = document.getElementById('consultaCronicasList');
  if (!el) return;
  const cronicas = await supa('GET', 'enfermedades_cronicas', null,
    `?paciente_id=eq.${recetaPacienteId}&activo=eq.true&order=created_at.desc`) || [];
  const btn = document.getElementById('btnActivarCronica');
  if (!cronicas.length) {
    el.innerHTML = '<div class="empty-state" style="padding:8px 0">Sin enfermedades crónicas activas registradas.</div>';
    return;
  }
  el.innerHTML = cronicas.map(c => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f5f5f5;font-size:13px">
      <div>
        <strong>${NOMBRES_ENFERMEDAD[c.enfermedad] || c.enfermedad}</strong>
        ${c.codigo_cie10 ? `<span style="color:#aaa"> · ${c.codigo_cie10}</span>` : ''}
        <div style="font-size:11px;color:#888">Cada ${c.frecuencia_horas}h · Próx.: ${c.proximo_seguimiento ? new Date(c.proximo_seguimiento).toLocaleString('es-EC') : '—'}</div>
      </div>
      <span class="badge badge-green">Activo</span>
    </div>`).join('');
}

// Sincroniza medicamentosData con la tabla del modal de Receta y refleja el cambio en el card de seguimiento.
// El modal no tiene la columna de notificaciones, así que se conserva el 'seguimiento' por índice.
function sincronizarMedicamentosDesdeModal() {
  const prev = medicamentosData || [];
  medicamentosData = _leerMedRows('rec-meds-body').map((m, i) => ({
    ...m,
    seguimiento: m.seguimiento ?? prev[i]?.seguimiento ?? true
  }));
  if (typeof renderSeguimientoMeds === 'function') renderSeguimientoMeds();
}

// Guarda/actualiza la receta (medicamentos + diagnóstico) en BD para que persista al reabrir,
// aunque todavía no se haya enviado ni activado el seguimiento. No toca seguimiento_activo.
async function guardarRecetaBD() {
  if (!recetaConsultaId || medicamentosData.length === 0) return;
  const ahora = new Date();
  const payload = {
    consulta_id: recetaConsultaId, paciente_id: recetaPacienteId, medico_id: currentUser?.id,
    medicamentos: medicamentosData,
    diagnostico: document.getElementById('recetaDiagnostico').value.trim(),
    cie10_codigos: cie10Seleccionados,
    indicaciones: document.getElementById('recetaIndicaciones').value,
    fecha_inicio: ahora.toISOString(),
    fecha_fin: new Date(ahora.getTime() + Math.max(...medicamentosData.map(m => m.dias || 1)) * 86400000).toISOString()
  };
  try {
    const existing = await supa('GET', 'recetas', null, `?consulta_id=eq.${recetaConsultaId}&limit=1`);
    if (existing?.length) await supa('PATCH', 'recetas', payload, `?id=eq.${existing[0].id}`);
    else await supa('POST', 'recetas', payload);
  } catch (e) {
    console.error('Error guardando receta en BD', e);
  }
}

// PDFs generados localmente (antes de enviar)
let pdfGenerados = { receta: null, certificado: null, pedido: null, historia: null, interconsulta: null };

function actualizarCheckboxDocs() {
  const mapa = {
    receta: 'receta', certificado: 'certificado', pedido: 'pedido',
    historia: 'historia', interconsulta: 'interconsulta'
  };
  Object.keys(mapa).forEach(tipo => {
    const chk = document.getElementById(`chk-${tipo}`);
    const status = document.getElementById(`status-${tipo}`);
    const generado = pdfGenerados[tipo] !== null;
    if (chk) { chk.disabled = !generado; chk.checked = generado; }
    if (status) {
      status.textContent = generado ? '✓ Generada' : 'No generada';
      status.className = `doc-check-status ${generado ? 'generado' : 'pendiente'}`;
    }
  });
}

// ── BOTÓN 1: Enviar documentos al paciente por WhatsApp ──────────────────
async function enviarDocumentos() {
  const diagnostico = document.getElementById('recetaDiagnostico').value.trim();
  if (!diagnostico) { alert('Ingrese el diagnóstico antes de enviar'); return; }

  const docsMarcados = Object.entries(pdfGenerados).filter(([k, v]) => {
    if (!v) return false;
    const chk = document.getElementById(`chk-${k}`);
    return chk && chk.checked;
  });
  if (!docsMarcados.length) { alert('Genere al menos un documento y selecciónelo para enviar'); return; }

  showToast('⏳ Enviando documentos al paciente...');
  try {
    const ahora = new Date();

    // Guardar/actualizar receta en BD si tiene medicamentos
    if (medicamentosData.length > 0) {
      const payload = {
        consulta_id: recetaConsultaId, paciente_id: recetaPacienteId, medico_id: currentUser.id,
        medicamentos: medicamentosData, diagnostico,
        cie10_codigos: cie10Seleccionados,
        indicaciones: document.getElementById('recetaIndicaciones').value,
        seguimiento_activo: false,
        fecha_inicio: ahora.toISOString(),
        fecha_fin: new Date(ahora.getTime() + Math.max(...medicamentosData.map(m => m.dias)) * 86400000).toISOString()
      };
      const existing = await supa('GET', 'recetas', null, `?consulta_id=eq.${recetaConsultaId}&limit=1`);
      if (existing?.length > 0) {
        await supa('PATCH', 'recetas', payload, `?id=eq.${existing[0].id}`);
      } else {
        await supa('POST', 'recetas', payload);
      }
    }

    // Subir solo los PDFs seleccionados y marcarlos como enviados
    const tipoMap = { receta: 'receta', certificado: 'certificado', pedido: 'pedido_laboratorio', historia: 'historia_clinica', interconsulta: 'interconsulta' };
    for (const [key, pdfBytes] of docsMarcados) {
      await upsertDocumentoStorage(recetaPacienteId, recetaConsultaId, tipoMap[key], pdfBytes, true);
    }

    // Actualizar consulta → completada
    await supa('PATCH', 'consultas', {
      diagnostico,
      notas_medico: document.getElementById('recetaNotas').value,
      estado: 'completada',
      medico_id: currentUser.id
    }, `?id=eq.${recetaConsultaId}`);

    // Enviar por WhatsApp via backend
    // Limpiar número: solo dígitos; si empieza en 0 → Ecuador (593)
    const telefonoPaciente = _pacData?.telefono
      ? (() => { const d = String(_pacData.telefono).replace(/\D/g, ''); return d.startsWith('0') ? '593' + d.slice(1) : d; })()
      : null;

    if (telefonoPaciente) {
      const waRes = await fetch('/api/enviar-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paciente_id: recetaPacienteId,
          consulta_id: recetaConsultaId,
          telefono: telefonoPaciente
        })
      });
      const waData = await waRes.json();
      console.log(`[enviar-docs] Número WhatsApp usado: ${waData.numero || telefonoPaciente} (original en BD: ${_pacData.telefono})`);
      if (waData.errores?.length) {
        const detalle = waData.errores[0]?.detalle?.error?.message || JSON.stringify(waData.errores[0]?.detalle);
        showToast(`⚠️ Error WhatsApp (enviado a ${waData.numero || telefonoPaciente}): ${detalle}`);
        console.error('[enviar-docs] Errores WhatsApp:', waData.errores);
      } else if (waData.enviados > 0) {
        showToast(`✓ ${waData.enviados} documento(s) enviado(s) a ${waData.numero || telefonoPaciente} por WhatsApp`);
      } else {
        showToast('⚠️ No se enviaron documentos — revisa la consola del navegador');
        console.error('[enviar-docs] Respuesta:', waData);
      }
    } else {
      showToast(`✓ ${docsMarcados.length} documento(s) guardado(s) — paciente sin teléfono registrado`);
    }

    // TEMPORAL (testing): no se deshabilita el botón para poder reenviar y probar la recepción.
    const btn = document.getElementById('btnEnviarDocs');
    if (btn) { btn.textContent = '✓ Documentos enviados — reenviar'; btn.style.background = '#16a34a'; btn.style.borderColor = '#16a34a'; }
  } catch (e) {
    console.error('Error al enviar documentos:', e);
    showToast(`Error: ${e.message}`);
  }
}

// ── BOTÓN 2: Activar seguimiento de TRATAMIENTO (medicamentos) ───────────
async function activarSeguimiento() {
  const diagnostico = document.getElementById('recetaDiagnostico').value.trim();
  if (!diagnostico) { alert('Ingrese el diagnóstico primero'); return; }

  const soloDigitosSeg = String(_pacData.telefono || '').replace(/\D/g, '');
  const telefono = soloDigitosSeg
    ? `whatsapp:+${soloDigitosSeg.startsWith('0') ? '593' + soloDigitosSeg.slice(1) : soloDigitosSeg}`
    : null;
  if (!telefono) { alert('El paciente no tiene número de teléfono registrado'); return; }

  if (typeof sincronizarMedSeguimiento === 'function') sincronizarMedSeguimiento();

  const medsConSeg = medicamentosData.filter(m => m.seguimiento !== false);
  if (!medicamentosData.length || !medsConSeg.length) {
    showToast('⚠️ No hay medicamentos con seguimiento activado. Agrega medicamentos en la sección de seguimiento.');
    return;
  }

  showToast('⏳ Activando seguimiento de tratamiento...');
  try {
    const ahora = new Date();
    let receta_id;
    const existing = await supa('GET', 'recetas', null, `?consulta_id=eq.${recetaConsultaId}&limit=1`);
    if (existing?.length > 0) {
      receta_id = existing[0].id;
      await supa('PATCH', 'recetas', { seguimiento_activo: true }, `?id=eq.${receta_id}`);
    } else {
      const res = await supa('POST', 'recetas', {
        consulta_id: recetaConsultaId, paciente_id: recetaPacienteId, medico_id: currentUser.id,
        medicamentos: medicamentosData, diagnostico,
        cie10_codigos: cie10Seleccionados,
        indicaciones: document.getElementById('recetaIndicaciones').value,
        seguimiento_activo: true,
        fecha_inicio: ahora.toISOString(),
        fecha_fin: new Date(ahora.getTime() + Math.max(...medicamentosData.map(m => m.dias)) * 86400000).toISOString()
      });
      receta_id = (res || [])[0]?.id;
    }

    if (receta_id) {
      const yaExisten = await supa('GET', 'recordatorios', null, `?receta_id=eq.${receta_id}&activo=eq.true&limit=1`);
      if (yaExisten?.length) {
        showToast('ℹ️ El seguimiento de tratamiento ya estaba activo');
        return;
      }
      for (const med of medsConSeg) {
        await supa('POST', 'recordatorios', {
          receta_id, paciente_id: recetaPacienteId, telefono,
          consulta_id: recetaConsultaId,
          medicamento: med.nombre, dosis: med.dosis || '',
          frecuencia_horas: med.frecuencia_horas,
          fecha_proximo: new Date(ahora.getTime() + med.frecuencia_horas * 3600000).toISOString(),
          fecha_fin: new Date(ahora.getTime() + med.dias * 86400000).toISOString(),
          activo: true, tipo: 'medicamento'
        });
      }
    }

    showToast('✓ Seguimiento de tratamiento activado — el bot enviará recordatorios al paciente');
    const btn = document.getElementById('btnActivarSeguimiento');
    if (btn) { btn.textContent = '✓ Tratamiento activo'; btn.disabled = true; btn.style.background = '#16a34a'; btn.style.borderColor = '#16a34a'; }
  } catch (e) {
    console.error('Error activando seguimiento de tratamiento:', e);
    showToast(`Error: ${e.message}`);
  }
}

// ── BOTÓN 3: Activar seguimiento de ENFERMEDAD CRÓNICA ───────────────────
async function activarSeguimientoCronico() {
  showToast('⏳ Activando seguimiento de enfermedad crónica...');
  try {
    const ahora = new Date();
    const cronicas = await supa('GET', 'enfermedades_cronicas', null,
      `?paciente_id=eq.${recetaPacienteId}&activo=eq.true`);

    if (!cronicas?.length) {
      showToast('⚠️ El paciente no tiene enfermedades crónicas registradas. Agrégalas en su ficha de paciente.');
      return;
    }

    for (const c of cronicas) {
      const proxima = new Date(ahora.getTime() + (c.frecuencia_horas || 24) * 3600000);
      await supa('PATCH', 'enfermedades_cronicas', {
        ultima_consulta: ahora.toISOString(),
        proximo_seguimiento: proxima.toISOString()
      }, `?id=eq.${c.id}`);
    }

    showToast(`✓ Seguimiento crónico activado para ${cronicas.length} enfermedad(es) — el bot contactará al paciente periódicamente`);
    const btn = document.getElementById('btnActivarCronica');
    if (btn) { btn.textContent = '✓ Seguimiento crónico activo'; btn.disabled = true; btn.style.background = '#16a34a'; btn.style.borderColor = '#16a34a'; }
  } catch (e) {
    console.error('Error activando seguimiento crónico:', e);
    showToast(`Error: ${e.message}`);
  }
}

function buscarCIE10() {
  const q = document.getElementById('cie10Search').value.trim().toLowerCase();
  const dd = document.getElementById('cie10Dropdown');
  if (!q || q.length < 2) { dd.style.display = 'none'; return; }
  const res = CIE10.filter(x => x.c.toLowerCase().includes(q) || x.n.toLowerCase().includes(q)).slice(0, 10);
  if (res.length === 0) { dd.style.display = 'none'; return; }
  dd.innerHTML = res.map(x => `<div onclick="agregarCIE10('${x.c}','${x.n.replace(/'/g, "\\'")}'); " style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5"><strong style="color:#2563eb">${x.c}</strong> — ${x.n}</div>`).join('');
  dd.style.display = 'block';
}

function agregarCIE10(codigo, nombre) {
  if (cie10Seleccionados.find(x => x.c === codigo)) { document.getElementById('cie10Search').value = ''; document.getElementById('cie10Dropdown').style.display = 'none'; return; }
  cie10Seleccionados.push({ c: codigo, n: nombre });
  renderCIE10();
  document.getElementById('cie10Search').value = '';
  document.getElementById('cie10Dropdown').style.display = 'none';
}

function quitarCIE10(codigo) {
  cie10Seleccionados = cie10Seleccionados.filter(x => x.c !== codigo);
  renderCIE10();
}

function renderCIE10() {
  document.getElementById('cie10Seleccionados').innerHTML = cie10Seleccionados.map(x => `
    <span style="display:inline-flex;align-items:center;gap:6px;background:#dbeafe;color:#1e40af;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:500">
      <strong>${x.c}</strong> — ${x.n}
      <span onclick="quitarCIE10('${x.c}')" style="cursor:pointer;font-size:14px;line-height:1;color:#1e40af">✕</span>
    </span>
  `).join('');
}
