const { query } = require('../services/supabase');
const { eliminar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');
// generarHistoriaMedica usa pdf-lib — se carga lazy para no crashear el bundler de Vercel
// Solo se require cuando realmente se va a generar el PDF (paso 17)

async function procesarAntecedentes(paso, mensaje, datos, telefono) {
  let respuesta = '';
  let nuevoPaso = paso;

  if (paso === 13) {
    datos.alergias = mensaje;
    respuesta = `¿Tiene o ha tenido *hipertensión arterial*?\n\nResponda *Sí*, *No* o descríbala brevemente.`;
    nuevoPaso = 14;

  } else if (paso === 14) {
    datos.hipertension = mensaje;
    respuesta = `¿Tiene o ha tenido *diabetes*?\n\nResponda *Sí*, *No* o descríbala brevemente.`;
    nuevoPaso = 15;

  } else if (paso === 15) {
    datos.diabetes = mensaje;
    respuesta = `¿Ha tenido *cirugías previas*?\n\nResponda *No* o descríbalas brevemente.`;
    nuevoPaso = 16;

  } else if (paso === 16) {
    datos.cirugias = mensaje;
    respuesta = `¿Tiene *otros antecedentes médicos* relevantes? (enfermedades crónicas, medicación habitual, etc.)\n\nResponda *No* o descríbalos.`;
    nuevoPaso = 17;

  } else if (paso === 17) {
    datos.otros_antecedentes = mensaje;

    // Guardar antecedentes en BD (solo si hay paciente_id)
    if (datos.paciente_id) await guardarAntecedentes(datos);

    // Generar y subir PDF
    try {
      await generarYSubirHistoria(datos);
      respuesta = `✅ Sus antecedentes han sido registrados.\n\nSu historia clínica ha sido generada y estará disponible para su médico.\n\n¡Hasta pronto! 💙`;
    } catch (e) {
      console.error('Error generando historia clínica:', e.message);
      await alertar(`⚠️ <b>Error generando historia clínica</b>\nPaciente: ${datos.nombreCompleto}\nError: ${e.message}`);
      respuesta = `✅ Sus antecedentes han sido registrados.\n\n¡Hasta pronto! 💙`;
    }

    await eliminar(telefono);
    return { respuesta, paso: 99, datos, terminar: true };
  }

  return { respuesta, paso: nuevoPaso, datos, terminar: false };
}

async function guardarAntecedentes(datos) {
  // Upsert — si ya existe el registro lo actualiza, si no lo crea
  const existente = await query('GET', 'antecedentes', null, `?paciente_id=eq.${datos.paciente_id}`);
  const payload = {
    paciente_id:  datos.paciente_id,
    alergias:     datos.alergias,
    hipertension: datos.hipertension,
    diabetes:     datos.diabetes,
    cirugias:     datos.cirugias,
    otros:        datos.otros_antecedentes,
    updated_at:   new Date().toISOString()
  };

  if (existente && existente.length > 0) {
    await query('PATCH', 'antecedentes', payload, `?paciente_id=eq.${datos.paciente_id}`);
  } else {
    await query('POST', 'antecedentes', payload);
  }
}

async function generarYSubirHistoria(datos) {
  // Lazy load — evita que pdf-lib crashee el bundler de Vercel en el arranque
  const { generarHistoriaMedica } = require('../services/generarHistoriaMedica');
  const { subirPDF, registrarDocumento } = require('../services/documentos');

  // Obtener datos completos del paciente
  const pacientes = await query('GET', 'pacientes', null,
    `?id=eq.${datos.paciente_id}&select=*,clientes_b2b(*)`
  );
  const paciente = pacientes?.[0] || {};

  // Obtener la consulta recién creada
  const consultas = await query('GET', 'consultas', null,
    `?paciente_id=eq.${datos.paciente_id}&order=created_at.desc&limit=1`
  );
  const consulta = consultas?.[0] || {};

  const antecedentes = {
    alergias:     datos.alergias,
    hipertension: datos.hipertension,
    diabetes:     datos.diabetes,
    cirugias:     datos.cirugias,
    otros:        datos.otros_antecedentes
  };

  const pdfBytes = await generarHistoriaMedica({
    paciente: {
      ...paciente,
      empresa: paciente.clientes_b2b?.nombre_empresa,
      seguro:  paciente.clientes_b2b?.nombre_seguro
    },
    antecedentes,
    consulta: {
      ...consulta,
      horario_preferencia: datos.horario
    }
  });

  const storagePath = await subirPDF(datos.paciente_id, 'historia_clinica', pdfBytes);
  await registrarDocumento(datos.paciente_id, consulta.id, 'historia_clinica', storagePath);
}

module.exports = { procesarAntecedentes };
