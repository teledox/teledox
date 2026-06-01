const { query } = require('../services/supabase');
const { guardar, eliminar } = require('../services/sesiones');
const { esSi } = require('../utils/validaciones');

async function procesarReagendamiento(datos, mensaje, telefono) {
  if (esSi(mensaje)) {
    const pacienteData = await query('GET', 'pacientes', null, `?id=eq.${datos.paciente_id}&select=*,clientes_b2b(*)`);
    const p = (pacienteData || [])[0] || {};
    const nuevosDatos = {
      cedula: p.cedula,
      paciente_id: p.id,
      nombre_paciente: p.nombre,
      empresa: p.clientes_b2b?.nombre_empresa || 'su empresa',
      seguro: p.clientes_b2b?.nombre_seguro || 'su seguro',
      sintomas: 'Seguimiento de tratamiento — consulta de control'
    };
    await guardar(telefono, 3, nuevosDatos);
    return { respuesta: `Perfecto. Por favor indíquenos sus síntomas actuales:`, paso: 3, datos: nuevosDatos };
  } else {
    await eliminar(telefono);
    return { respuesta: `Entendido. Si necesita atención escriba *hola*.\n\nEstamos disponibles 24/7. 💙`, paso: 0, terminar: true };
  }
}

module.exports = { procesarReagendamiento };
