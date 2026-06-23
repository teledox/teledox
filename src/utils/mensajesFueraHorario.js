// Devuelve la respuesta + botones estándar para cuando el paciente escribe
// fuera del horario de operación. El llamador integra esto en el resultado
// del flujo para que `despachar` lo envíe via WhatsApp.
function mensajeFueraHorario(prox) {
  return {
    respuesta: `Nuestro equipo médico atiende lunes a viernes de 8am a 5pm y sábados de 9am a 12pm.\n\nEstamos cerrados en este momento, pero puedes agendar ahora — tu médico lo verá ${prox.texto}.`,
    botones: [
      { id: 'fuera_horario_agendar',  titulo: '✅ Agendar mi cita' },
      { id: 'fuera_horario_cancelar', titulo: '❌ Ahora no'        }
    ]
  };
}

module.exports = { mensajeFueraHorario };
