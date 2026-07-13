/**
 * scripts/test-oim-flow.js
 * Script para probar localmente la lógica del flujo de operador OIM.
 */

// Mockear variables de entorno para evitar dependencias
process.env.SUPABASE_URL = "https://kcoopkkvbkgrnkpksiuh.supabase.co";
process.env.SUPABASE_KEY = "mock_secret_key";

// Mockear el servicio de supabase para que no intente escrituras reales si no es necesario
const supabase = require('../src/services/supabase');
const originalQuery = supabase.query;
supabase.query = async (method, table, body, queryStr) => {
  console.log(`[MOCK SUPABASE] ${method} ${table} ${queryStr || ''}`);
  if (table === 'clientes_b2b') {
    return [{ id: 'oim-empresa-mock-id', nombre: 'OIM Ecuador' }];
  }
  if (table === 'pacientes') {
    return null; // Simular que no existe el paciente para probar el flujo completo de creación
  }
  return [];
};

// Mockear pacientes.js
const pacientes = require('../src/services/pacientes');
pacientes.buscarPorCedula = async (cedula) => {
  console.log(`[MOCK pac.buscarPorCedula] ${cedula}`);
  if (cedula === '1729485730') {
    return { id: 'carlos-id', nombre: 'Carlos', apellidos: 'Mendoza', telefono: '0991234567', correo: 'carlos@oim.org' };
  }
  return null;
};
pacientes.crear = async (pac) => {
  console.log('[MOCK pac.crear]', pac);
  return { id: 'nuevo-paciente-id', ...pac };
};

// Mockear consultas.js
const consultas = require('../src/services/consultas');
consultas.crear = async (con) => {
  console.log('[MOCK con.crear]', con);
  return { id: 'nueva-consulta-id', ...con };
};
consultas.crearNotificacion = async (tipo, titulo, mensaje) => {
  console.log(`[MOCK con.crearNotificacion] [${tipo}] ${titulo} - ${mensaje}`);
  return { id: 'nueva-notif-id' };
};

// Mockear telegram.js
const telegram = require('../src/services/telegram');
telegram.alertar = async (msg) => {
  console.log(`[MOCK telegram.alertar] ${msg.replace(/<[^>]*>/g, '')}`);
  return true;
};

// Mockear whatsapp.js
const whatsapp = require('../src/services/whatsapp');
whatsapp.enviar = async (tel, msg) => {
  console.log(`[MOCK whatsapp.enviar] To: ${tel} | Msg: ${msg}`);
  return true;
};

const { procesarOimOperador } = require('../src/flows/flujo-oim-operador');

async function test() {
  console.log('=== INICIANDO PRUEBA DEL FLUJO DE OPERADOR OIM ===\n');
  
  let datos = {};
  let paso = 'oim_inicio';
  let telefono = '593987654321'; // Teléfono del operador
  
  // 1. Inicio del flujo
  console.log(`--> Operador inicia sesión (escribiendo 'oim')`);
  let res = await procesarOimOperador(paso, 'oim', datos, telefono);
  console.log(`Bot: ${res.respuesta}\n`);
  paso = res.paso;
  datos = res.datos;

  // 2. Ingresar Cédula (beneficiario nuevo)
  console.log(`--> Operador ingresa cédula de beneficiario nuevo: '1756283940'`);
  res = await procesarOimOperador(paso, '1756283940', datos, telefono);
  console.log(`Bot: ${res.respuesta}\n`);
  paso = res.paso;
  datos = res.datos;

  // 3. Ingresar Nombre completo
  console.log(`--> Operador ingresa nombre completo: 'Carlos Mendoza'`);
  res = await procesarOimOperador(paso, 'Carlos Mendoza', datos, telefono);
  console.log(`Bot: ${res.respuesta}\n`);
  paso = res.paso;
  datos = res.datos;

  // 4. Ingresar Edad
  console.log(`--> Operador ingresa edad: '34'`);
  res = await procesarOimOperador(paso, '34', datos, telefono);
  console.log(`Bot: ${res.respuesta}\n`);
  paso = res.paso;
  datos = res.datos;

  // 5. Ingresar Nacimiento
  console.log(`--> Operador ingresa fecha de nacimiento: '18/06/1992'`);
  res = await procesarOimOperador(paso, '18/06/1992', datos, telefono);
  console.log(`Bot: ${res.respuesta}\n`);
  paso = res.paso;
  datos = res.datos;

  // 6. Seleccionar Sexo
  console.log(`--> Operador selecciona sexo: 'masculino'`);
  res = await procesarOimOperador(paso, 'masculino', datos, telefono);
  console.log(`Bot: ${res.respuesta}\n`);
  paso = res.paso;
  datos = res.datos;

  // 7. Ingresar Teléfono
  console.log(`--> Operador ingresa teléfono del beneficiario: '0991234567'`);
  res = await procesarOimOperador(paso, '0991234567', datos, telefono);
  console.log(`Bot: ${res.respuesta}\n`);
  paso = res.paso;
  datos = res.datos;

  // 8. Ingresar Correo
  console.log(`--> Operador ingresa correo: 'no'`);
  res = await procesarOimOperador(paso, 'no', datos, telefono);
  console.log(`Bot: ${res.respuesta}\n`);
  paso = res.paso;
  datos = res.datos;

  // 9. Ingresar Residencia
  console.log(`--> Operador ingresa residencia: 'Quito, Carcelén'`);
  res = await procesarOimOperador(paso, 'Quito, Carcelén', datos, telefono);
  console.log(`Bot: ${res.respuesta}\n`);
  paso = res.paso;
  datos = res.datos;

  // 10. Ingresar Síntomas
  console.log(`--> Operador ingresa síntomas: 'Dolor abdominal agudo y náuseas desde anoche'`);
  res = await procesarOimOperador(paso, 'Dolor abdominal agudo y náuseas desde anoche', datos, telefono);
  console.log(`Bot: ${res.respuesta}\n`);
  paso = res.paso;
  datos = res.datos;

  // 11. Confirmar el Registro
  console.log(`--> Operador confirma el registro`);
  res = await procesarOimOperador(paso, 'confirmar', datos, telefono);
  console.log(`Bot: ${res.respuesta}\n`);
  paso = res.paso;
  datos = res.datos;
  
  console.log('=== FIN DE PRUEBAS DEL FLUJO DE OPERADOR ===');
}

test().catch(console.error);
