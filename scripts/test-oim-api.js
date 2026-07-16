/**
 * scripts/test-oim-api.js
 * Script para probar localmente el endpoint api/oim-crear-consulta.js.
 */

// Configurar variables
process.env.SUPABASE_URL = "https://kcoopkkvbkgrnkpksiuh.supabase.co";
process.env.SUPABASE_KEY = "mock_secret_key";

// Mockear global fetch para simular llamadas API internas
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  console.log(`[MOCK FETCH] ${options?.method || 'GET'} ${url}`);
  if (url.includes('clientes_b2b')) {
    return {
      ok: true,
      json: async () => [{ id: 'oim-empresa-mock-id', nombre: 'OIM Ecuador' }]
    };
  }
  if (url.includes('pacientes?cedula=')) {
    return {
      ok: true,
      json: async () => [] // Paciente nuevo
    };
  }
  if (url.includes('pacientes') && options?.method === 'POST') {
    return {
      ok: true,
      json: async () => [{ id: 'nuevo-paciente-api-id' }]
    };
  }
  if (url.includes('consultas')) {
    return {
      ok: true,
      json: async () => [{ id: 'nueva-consulta-api-id' }]
    };
  }
  if (url.includes('notificaciones')) {
    return {
      ok: true,
      json: async () => ({})
    };
  }
  if (url.includes('messages')) {
    return {
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.api.mock' }] })
    };
  }
  return { ok: true, json: async () => ({}) };
};

const handler = require('../src/handlers/enviar-link');

async function testApi() {
  console.log('=== INICIANDO PRUEBA DEL ENDPOINT DE LA API OIM ===\n');

  const req = {
    method: 'POST',
    body: {
      accion: 'oim_crear_consulta',
      cedula: '1799999999',
      nombre_completo: 'Gabriela Pazmiño',
      telefono: '0998765432',
      sintomas: 'Fiebre alta y tos persistente',
      edad: 28,
      sexo: 'F',
      correo: 'gabriela@gmail.com',
      residencia: 'Guayaquil, Urdesa'
    }
  };

  const res = {
    statusVal: 200,
    headers: {},
    setHeader(name, val) {
      this.headers[name] = val;
    },
    status(code) {
      this.statusVal = code;
      return this;
    },
    json(obj) {
      console.log(`[Response ${this.statusVal}]`, JSON.stringify(obj, null, 2));
      return this;
    },
    end() {
      console.log(`[Response ${this.statusVal}] END`);
    }
  };

  await handler(req, res);

  console.log('\n=== FIN DE PRUEBAS DEL ENDPOINT API OIM ===');
}

testApi().catch(console.error);
