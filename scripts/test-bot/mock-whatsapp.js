// Mock de src/services/whatsapp.js para testing local.
// En vez de pegarle a la API real de Meta, registra lo que se "enviaría"
// para que el harness de pruebas pueda mostrarlo/loguearlo.

const log = [];

function record(tipo, telefono, payload) {
  log.push({ tipo, telefono, ...payload, ts: new Date().toISOString() });
}

async function enviar(telefono, mensaje) {
  record('texto', telefono, { texto: mensaje });
}

async function enviarBotones(telefono, texto, botones, cabecera = null) {
  record('botones', telefono, { texto, botones, cabecera });
}

async function enviarLista(telefono, texto, secciones, botonTexto = 'Ver opciones', cabecera = null) {
  record('lista', telefono, { texto, secciones, botonTexto, cabecera });
}

// Saca y limpia las entradas acumuladas desde la última llamada
function popLog() {
  return log.splice(0, log.length);
}

module.exports = { enviar, enviarBotones, enviarLista, popLog };
