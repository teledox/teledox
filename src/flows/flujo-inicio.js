// Mensaje de bienvenida / reinicio del flujo principal — compartido entre
// flujo-consulta y flujo-b2c para el botón "Otra consulta" tras un registro exitoso.
function mensajeBienvenida(nombreWhatsApp) {
  return {
    respuesta: `¡Hola, ${nombreWhatsApp}! 👋 Bienvenido a *MediLyft*.\n\nEstamos listos para ayudarle.\n\nPor favor indíquenos su número de *cédula de identidad* o su *código de acceso* de empresa:`,
    paso: 1, datos: {}, terminar: false
  };
}

module.exports = { mensajeBienvenida };
