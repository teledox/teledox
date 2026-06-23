// Horario de operación — America/Guayaquil (UTC-5, sin horario de verano)
// L-V: 8:00–17:00 · Sáb: 9:00–12:00 · Dom: cerrado

const OFFSET_EC = -5;
const DIAS_ES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

// Devuelve los componentes de tiempo en hora Ecuador.
// Truco: sumamos el offset al timestamp UTC y usamos los métodos getUTC* sobre el
// resultado — así no dependemos de la zona del servidor.
function getECNow() {
  const now  = new Date();
  const ecMs = now.getTime() + OFFSET_EC * 3600000;
  const d    = new Date(ecMs);
  return {
    day:  d.getUTCDay(),
    hour: d.getUTCHours(),
    min:  d.getUTCMinutes(),
    sec:  d.getUTCSeconds(),
    ms:   d.getUTCMilliseconds(),
    ecMs
  };
}

function estaEnHorario() {
  const { day, hour } = getECNow();
  if (day >= 1 && day <= 5) return hour >= 8 && hour < 17;  // L-V
  if (day === 6)            return hour >= 9 && hour < 12;  // Sáb
  return false;                                              // Dom
}

function proximaApertura() {
  const { day, hour, min, sec, ms, ecMs } = getECNow();

  // Medianoche EC de hoy (en ms ajustados)
  const ecMidnight = ecMs - (hour * 3600000 + min * 60000 + sec * 1000 + ms);

  let daysAdd, targetHour;

  if (day === 0) {                        // Domingo → lunes 8am
    daysAdd = 1; targetHour = 8;
  } else if (day === 6) {                 // Sábado
    if (hour < 9) { daysAdd = 0; targetHour = 9; }  // hoy 9am
    else          { daysAdd = 2; targetHour = 8; }   // lunes 8am
  } else if (day === 5) {                 // Viernes
    if (hour < 8) { daysAdd = 0; targetHour = 8; }  // hoy 8am
    else          { daysAdd = 3; targetHour = 8; }   // lunes 8am
  } else {                                // Lun-Jue
    if (hour < 8) { daysAdd = 0; targetHour = 8; }  // hoy 8am
    else          { daysAdd = 1; targetHour = 8; }   // mañana 8am
  }

  // Timestamp EC de apertura → convertir a UTC real
  const targetECMs = ecMidnight + daysAdd * 86400000 + targetHour * 3600000;
  const fecha       = new Date(targetECMs - OFFSET_EC * 3600000); // UTC = EC + 5h

  const targetDay = new Date(targetECMs).getUTCDay();
  const timeStr   = targetHour < 12 ? `${targetHour}:00am` : `${targetHour}:00pm`;

  let texto;
  if      (daysAdd === 0) texto = `hoy a las ${timeStr}`;
  else if (daysAdd === 1) texto = `mañana ${DIAS_ES[targetDay]} a las ${timeStr}`;
  else                    texto = `el ${DIAS_ES[targetDay]} a las ${timeStr}`;

  return { fecha, texto };
}

module.exports = { estaEnHorario, proximaApertura };
