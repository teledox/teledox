const { buscarPorCedula, actualizar, crear: crearPaciente } = require('../services/pacientes');
const { buscarCedulaB2B } = require('../services/empleados');
const { crear: crearConsulta, crearNotificacion } = require('../services/consultas');
const { guardar, eliminar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');
const { validarCedula, clasificarSintomas, esSi, tieneApellidos } = require('../utils/validaciones');
const { procesarB2C } = require('./flujo-b2c');

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_KEY;

async function registrarPlanillajeB2B(datos, consultaId) {
  const ahora = new Date();
  const body = {
    paciente_id: datos.paciente_id || null,
    empresa_id: datos.empresa_id || null,
    nombre_paciente: datos.nombreCompleto || datos.nombre_paciente || '',
    cedula_paciente: datos.cedula || '',
    fecha_consulta: ahora.toISOString(),
    sintomas: datos.sintomas || '',
    nivel_sintomas: datos.nivel || 1,
    estado_planillaje: 'pendiente',
    mes: ahora.getMonth() + 1,
    anio: ahora.getFullYear()
  };
  await fetch(`${SUPA_URL}/rest/v1/planillaje_b2b`, {
    method: 'POST',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(body)
  });
}

async function procesarPaso(paso, mensaje, datos, telefono, nombreWhatsApp) {
  let respuesta = '';
  let nuevoPaso = paso;

  // Pasos 50+ — flujo B2C (pago directo)
  if (paso >= 50 && paso < 90) {
    const result = await procesarB2C(paso, mensaje, datos, telefono, nombreWhatsApp);
    if (!result.terminar) await guardar(telefono, result.paso, result.datos);
    return result;
  }

  if (paso === 0) {
    respuesta = `¡Hola, ${nombreWhatsApp}! 👋 Bienvenido a *MediLyft*.\n\nEstamos listos para ayudarle.\n\nPor favor indíquenos su número de *cédula de identidad*:`;
    nuevoPaso = 1;

  } else if (paso === 1) {
    const { valida, error } = validarCedula(mensaje);
    if (!valida) {
      respuesta = `❌ ${error}\n\nPor favor ingrese su cédula nuevamente:`;
      return { respuesta, paso: 1, datos, terminar: false };
    }
    const [paciente, empleado] = await Promise.all([
      buscarPorCedula(mensaje),
      buscarCedulaB2B(mensaje)
    ]);

    if (paciente) {
      // Paciente ya registrado con empresa asignada
      datos.cedula = mensaje;
      datos.paciente_id = paciente.id;
      datos.nombre_paciente = paciente.nombre;
      datos.empresa = paciente.clientes_b2b?.nombre_empresa || empleado?.clientes_b2b?.nombre_empresa || 'su empresa';
      datos.empresa_id = paciente.clientes_b2b?.id || empleado?.clientes_b2b?.id || null;
      datos.seguro = paciente.clientes_b2b?.nombre_seguro || empleado?.clientes_b2b?.nombre_seguro || 'su seguro';
      // Pre-cargar datos personales ya registrados para no volver a preguntarlos más adelante
      datos.nombre = paciente.nombre || '';
      datos.apellidos = paciente.apellidos || '';
      datos.nombreCompleto = `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim();
      datos.edad = paciente.edad || '';
      datos.fecha_nacimiento = paciente.fecha_nacimiento || '';
      datos.correo = paciente.correo || '';
      datos.telefono = paciente.telefono || '';
      datos.lugar_residencia = paciente.lugar_residencia || '';
      return {
        respuesta: `✅ Le identificamos como afiliado a *${datos.empresa}* con cobertura *${datos.seguro}*.\n\n¿Acepta el uso y tratamiento de sus datos personales con fines médicos?`,
        paso: 2, datos, terminar: false,
        botones: [
          { id: 'si',  titulo: '✅ Sí, autorizo' },
          { id: 'no',  titulo: '❌ No autorizo'  },
        ]
      };
    } else if (empleado) {
      // Cédula autorizada por empresa B2B — crear paciente on-the-fly y continuar sin pago
      datos.cedula = mensaje;
      datos.empresa = empleado.clientes_b2b?.nombre_empresa || 'su empresa';
      datos.empresa_id = empleado.clientes_b2b?.id || null;
      datos.seguro = empleado.clientes_b2b?.nombre_seguro || 'su seguro';
      const nuevo = await crearPaciente({
        cedula: mensaje,
        nombre: '',
        apellidos: '',
        correo: '',
        telefono,
        cliente_b2b_id: datos.empresa_id
      });
      datos.paciente_id = nuevo?.id || null;
      datos.nombre_paciente = '';
      return {
        respuesta: `✅ Su cédula está registrada como empleado de *${datos.empresa}*.\n\n¿Acepta el uso y tratamiento de sus datos personales con fines médicos?`,
        paso: 2, datos, terminar: false,
        botones: [
          { id: 'si',  titulo: '✅ Sí, autorizo' },
          { id: 'no',  titulo: '❌ No autorizo'  },
        ]
      };
    } else {
      // MODALIDAD B2C — cédula no encontrada en ninguna lista
      datos.cedula = mensaje;
      const result = await procesarB2C(50, mensaje, datos, telefono, nombreWhatsApp);
      await guardar(telefono, result.paso, result.datos);
      return result;
    }

  } else if (paso === 2) {
    if (esSi(mensaje)) {
      respuesta = `Gracias por su autorización. ✅\n\n¿Cuál es el motivo de su consulta?\n\nDescríbanos sus síntomas con detalle:`;
      nuevoPaso = 3;
    } else {
      respuesta = `Sin su autorización no es posible continuar.\n\nSi cambia de opinión escríbanos *hola*. 👋`;
      await eliminar(telefono);
      return { respuesta, paso: 0, datos, terminar: true };
    }

  } else if (paso === 3) {
    const nivel = clasificarSintomas(mensaje);
    datos.sintomas = mensaje;
    datos.nivel = nivel;

    if (nivel === 3) {
      await alertar(`🚨 <b>ALERTA GRAVE - EMERGENCIA</b>\nPaciente: ${datos.nombre_paciente || nombreWhatsApp}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      await eliminar(telefono);
      return {
        respuesta: `🚨 *EMERGENCIA MÉDICA* 🚨\n\nSus síntomas indican una situación de *riesgo vital*.\n\n*Llame al 911 AHORA MISMO.*\n\n📞 tel:911`,
        paso: 0, datos, terminar: true
      };
    } else if (nivel === 2) {
      await alertar(`⚠️ <b>SÍNTOMAS MEDIOS - ATENCIÓN URGENTE</b>\nPaciente: ${datos.nombre_paciente || nombreWhatsApp}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      const consulta = await crearConsulta({ paciente_id: datos.paciente_id, nivel_sintomas: 2, sintomas_descripcion: mensaje, estado: 'pendiente' });
      await crearNotificacion('urgente', '⚠️ Síntomas medios', `Paciente ${datos.nombre_paciente} requiere atención urgente`, datos.paciente_id, consulta?.id);
      // Registrar planillaje B2B automáticamente
      if (datos.empresa_id) await registrarPlanillajeB2B(datos, consulta?.id);
      await eliminar(telefono);
      return {
        respuesta: `⚠️ *Atención prioritaria requerida*\n\nSus síntomas necesitan evaluación médica urgente.\n\nHemos notificado a nuestro equipo y le contactarán a la brevedad.\n\nSi los síntomas empeoran *llame al 911 de inmediato*.`,
        paso: 0, datos, terminar: true
      };
    } else {
      const datosCompletos = datos.paciente_id && datos.nombreCompleto?.trim() && datos.telefono && datos.correo && datos.lugar_residencia;
      if (datosCompletos) {
        return {
          respuesta: `✅ Sus síntomas pueden ser atendidos por *teleconsulta*.\n\nYa tenemos estos datos suyos registrados:\n\n👤 *Nombre:* ${datos.nombreCompleto}\n🎂 *Edad:* ${datos.edad || '—'}\n📧 *Correo:* ${datos.correo}\n📱 *Teléfono:* ${datos.telefono}\n📍 *Residencia:* ${datos.lugar_residencia}\n\n¿Desea usar estos datos o prefiere actualizarlos?`,
          paso: 39, datos, terminar: false,
          botones: [
            { id: 'usar',       titulo: '✅ Usar mis datos'  },
            { id: 'actualizar', titulo: '✏️ Actualizar datos' },
          ]
        };
      }
      respuesta = `✅ Sus síntomas pueden ser atendidos por *teleconsulta*.\n\nNecesitamos completar sus datos:\n\n👤 *Nombre y apellidos completos:*`;
      nuevoPaso = 4;
    }

  } else if (paso === 39) {
    const m = mensaje.trim().toLowerCase();
    if (m === 'usar' || m.includes('usar mis datos')) {
      return {
        respuesta: `*Horario de preferencia* para la teleconsulta\n(ej: mañana martes a las 10:00 AM):`,
        paso: 11, datos, terminar: false
      };
    } else {
      respuesta = `Entendido, actualicemos sus datos.\n\n👤 *Nombre y apellidos completos:*`;
      nuevoPaso = 4;
    }

  } else if (paso === 4) {
    datos.nombreCompleto = mensaje.trim();
    if (tieneApellidos(datos.nombreCompleto)) {
      const partes = datos.nombreCompleto.split(/\s+/);
      datos.nombre = partes[0];
      datos.apellidos = partes.slice(1).join(' ');
      respuesta = `*Edad:*`;
      nuevoPaso = 6;
    } else {
      datos.nombre = datos.nombreCompleto;
      respuesta = `*Apellidos completos:*`;
      nuevoPaso = 5;
    }

  } else if (paso === 5) {
    datos.apellidos = mensaje;
    datos.nombreCompleto = `${datos.nombre} ${datos.apellidos}`;
    respuesta = `*Edad:*`;
    nuevoPaso = 6;

  } else if (paso === 6) {
    datos.edad = mensaje;
    respuesta = `*Fecha de nacimiento* (ej: 15/03/1990):`;
    nuevoPaso = 7;

  } else if (paso === 7) {
    datos.fecha_nacimiento = mensaje;
    respuesta = `*Correo electrónico:*`;
    nuevoPaso = 8;

  } else if (paso === 8) {
    datos.correo = mensaje;
    return {
      respuesta: `*Número de teléfono de contacto:*\n\n¿Desea usar el número desde el que nos escribe (*${telefono}*) o prefiere indicar otro?`,
      paso: 41, datos, terminar: false,
      botones: [
        { id: 'actual', titulo: '📱 Usar este número' },
        { id: 'otro',   titulo: '✏️ Indicar otro'     },
      ]
    };

  } else if (paso === 41) {
    const m = mensaje.trim().toLowerCase();
    if (m === 'actual' || m.includes('usar este')) {
      datos.telefono = telefono;
      respuesta = `*Lugar de residencia* (ciudad y barrio):`;
      nuevoPaso = 10;
    } else {
      respuesta = `Indíquenos el número de teléfono que desea registrar:`;
      nuevoPaso = 9;
    }

  } else if (paso === 9) {
    datos.telefono = mensaje;
    respuesta = `*Lugar de residencia* (ciudad y barrio):`;
    nuevoPaso = 10;

  } else if (paso === 10) {
    datos.lugar_residencia = mensaje;
    respuesta = `*Horario de preferencia* para la teleconsulta\n(ej: mañana martes a las 10:00 AM):`;
    nuevoPaso = 11;

  } else if (paso === 11) {
    datos.horario = mensaje;
    return {
      respuesta: `Confirme sus datos:\n\n👤 *Nombre:* ${datos.nombreCompleto}\n🎂 *Edad:* ${datos.edad}\n📅 *Nacimiento:* ${datos.fecha_nacimiento}\n📧 *Correo:* ${datos.correo}\n📱 *Teléfono:* ${datos.telefono}\n📍 *Residencia:* ${datos.lugar_residencia}\n🕐 *Horario:* ${datos.horario}`,
      paso: 12, datos, terminar: false,
      botones: [
        { id: 'confirmar', titulo: '✅ Confirmar'     },
        { id: 'corregir',  titulo: '✏️ Corregir datos' },
      ]
    };

  } else if (paso === 12) {
    if (mensaje.toLowerCase() === 'confirmar' || mensaje.toLowerCase() === '✅ confirmar') {
      await actualizar(datos.cedula, {
        nombre: datos.nombre,
        apellidos: datos.apellidos,
        edad: datos.edad,
        fecha_nacimiento: datos.fecha_nacimiento,
        correo: datos.correo,
        telefono: datos.telefono,
        lugar_residencia: datos.lugar_residencia,
        updated_at: new Date().toISOString()
      });

      const consulta = await crearConsulta({
        paciente_id: datos.paciente_id,
        nivel_sintomas: 1,
        sintomas_descripcion: datos.sintomas,
        estado: 'pendiente'
      });

      await crearNotificacion('nueva_consulta', '📅 Nueva teleconsulta', `${datos.nombreCompleto} solicita teleconsulta para ${datos.horario}`, datos.paciente_id, consulta?.id);
      await alertar(`📅 <b>NUEVA TELECONSULTA - MEDILYFT</b>\nPaciente: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa}\nSíntomas: ${datos.sintomas}\nHorario: ${datos.horario}\nTeléfono: ${datos.telefono}\nCorreo: ${datos.correo}\nResidencia: ${datos.lugar_residencia}`);

      // Registrar planillaje B2B automáticamente al confirmar
      if (datos.empresa_id) await registrarPlanillajeB2B(datos, consulta?.id);

      await guardar(telefono, 13, datos);
      return {
        respuesta: `🎉 *¡Consulta registrada exitosamente!*\n\nUn asesor de *MediLyft* le confirmará su teleconsulta a la brevedad.\n\nPara completar su historia clínica necesitamos algunas preguntas más:\n\n💊 ¿Tiene *alergias* conocidas a medicamentos o alimentos?\n\nResponda *No* o descríbalas brevemente.`,
        paso: 13, datos, terminar: true
      };
    } else {
      datos = { cedula: datos.cedula, paciente_id: datos.paciente_id, nombre_paciente: datos.nombre_paciente, empresa: datos.empresa, empresa_id: datos.empresa_id, seguro: datos.seguro, sintomas: datos.sintomas, nivel: datos.nivel };
      respuesta = `Entendido, volvamos a empezar.\n\n👤 *Nombre y apellidos completos:*`;
      nuevoPaso = 4;
    }
  }

  return { respuesta, paso: nuevoPaso, datos, terminar: false };
}

module.exports = { procesarPaso };
