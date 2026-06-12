// Horario de atención de MediLyft (hora Ecuador, UTC-5 fijo, sin horario de verano):
//   Lunes a Viernes: 8:00 AM - 5:00 PM
//   Sábado y Domingo: 9:00 AM - 12:00 PM

const OFFSET_ECUADOR_HORAS = 5;

const HORARIO_TEXTO = 'Lunes a Viernes: 8:00 AM - 5:00 PM\nSábado y Domingo: 9:00 AM - 12:00 PM\n(Hora Ecuador)';

const BOTONES_HORARIO = [
  { id: 'confirmar', titulo: '✅ Confirmar' },
  { id: 'abandonar', titulo: '❌ Abandonar' },
];

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function _aEcuador(fechaUTC) {
  return new Date(fechaUTC.getTime() - OFFSET_ECUADOR_HORAS * 3600000);
}

function _horarioApertura(diaSemana) {
  return diaSemana >= 1 && diaSemana <= 5 ? 8 : 9;
}

function _horarioCierre(diaSemana) {
  return diaSemana >= 1 && diaSemana <= 5 ? 17 : 12;
}

function estaEnHorarioAtencion(fechaUTC = new Date()) {
  const ec = _aEcuador(fechaUTC);
  const dia = ec.getUTCDay();
  const hora = ec.getUTCHours() + ec.getUTCMinutes() / 60;
  return hora >= _horarioApertura(dia) && hora < _horarioCierre(dia);
}

// Próxima apertura del consultorio, devuelta como Date (instante real en UTC).
function proximaApertura(fechaUTC = new Date()) {
  const ec = _aEcuador(fechaUTC);
  const dia = ec.getUTCDay();
  const hora = ec.getUTCHours() + ec.getUTCMinutes() / 60 + ec.getUTCSeconds() / 3600;
  const diasASumar = hora < _horarioApertura(dia) ? 0 : 1;

  const apertura = new Date(ec);
  apertura.setUTCDate(apertura.getUTCDate() + diasASumar);
  apertura.setUTCHours(_horarioApertura((dia + diasASumar) % 7), 0, 0, 0);

  return new Date(apertura.getTime() + OFFSET_ECUADOR_HORAS * 3600000);
}

// Mensaje a mostrar cuando la consulta llega fuera de horario, con opción de
// confirmar (se procesará en la próxima apertura) o abandonar.
function mensajeFueraHorario(fechaUTC = new Date()) {
  const apertura = proximaApertura(fechaUTC);
  const ahoraEc = _aEcuador(fechaUTC);
  const aperturaEc = _aEcuador(apertura);

  const diffDias = Math.round(
    (Date.UTC(aperturaEc.getUTCFullYear(), aperturaEc.getUTCMonth(), aperturaEc.getUTCDate()) -
     Date.UTC(ahoraEc.getUTCFullYear(), ahoraEc.getUTCMonth(), ahoraEc.getUTCDate())) / 86400000
  );

  const horaTexto = `${_horarioApertura(aperturaEc.getUTCDay())}:00 AM`;
  const cuando = diffDias === 0 ? `hoy a las ${horaTexto}`
               : diffDias === 1 ? `mañana a las ${horaTexto}`
               : `el ${DIAS[aperturaEc.getUTCDay()]} a las ${horaTexto}`;

  return `🕐 *Nuestro horario de atención es:*\n${HORARIO_TEXTO}\n\nActualmente estamos fuera de este horario. Daremos seguimiento a su consulta a partir de *${cuando}*.\n\n¿Desea continuar?`;
}

module.exports = { estaEnHorarioAtencion, proximaApertura, mensajeFueraHorario, BOTONES_HORARIO, HORARIO_TEXTO };
