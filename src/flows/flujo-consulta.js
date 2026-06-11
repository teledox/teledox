const { buscarPorCedula, actualizar, crear: crearPaciente } = require('../services/pacientes');
const { buscarCedulaB2B } = require('../services/empleados');
const { buscarEmpresaPorCodigo } = require('./flujo-callcenter');
const { crear: crearConsulta, crearNotificacion } = require('../services/consultas');
const { guardar, eliminar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');
const { validarCedula, clasificarSintomas, esSi, tieneApellidos, inferirSexo, separarNombre } = require('../utils/validaciones');
const { procesarB2C } = require('./flujo-b2c');
const { procesarSeguimientoPago } = require('./flujo-seguimiento-pago');

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
  const res = await fetch(`${SUPA_URL}/rest/v1/planillaje_b2b`, {
    method: 'POST',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Supabase POST planillaje_b2b: ${data?.message || `HTTP ${res.status}`}`);
  }
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

  // Pasos 90-97 — flujo de seguimiento aprobado por médico (agendar + pago)
  if (paso >= 90 && paso <= 97) {
    const result = await procesarSeguimientoPago(paso, mensaje, datos, telefono, nombreWhatsApp);
    if (!result.terminar) await guardar(telefono, result.paso, result.datos);
    return result;
  }

  // Paso desconocido/no reconocido — reiniciar sesión para evitar bucles
  // sin salida (en lugar de repetir una respuesta vacía indefinidamente)
  const PASOS_VALIDOS = [0, 1, 2, 3, 39, 4, 5, 6, 7, 8, 41, 9, 10, 11, 12];
  if (!PASOS_VALIDOS.includes(paso)) {
    await eliminar(telefono);
    return {
      respuesta: `¡Hola, ${nombreWhatsApp}! 👋 Bienvenido a *MediLyft*.\n\nEstamos listos para ayudarle.\n\nPor favor indíquenos su número de *cédula de identidad* o su *código de acceso* de empresa:`,
      paso: 0, datos: {}, terminar: true
    };
  }

  if (paso === 0) {
    respuesta = `¡Hola, ${nombreWhatsApp}! 👋 Bienvenido a *MediLyft*.\n\nEstamos listos para ayudarle.\n\nPor favor indíquenos su número de *cédula de identidad* o su *código de acceso* de empresa:`;
    nuevoPaso = 1;

  } else if (paso === 1) {
    // Verificar si es un código de acceso call center (tiene letras → no es cédula)
    const posibleCodigo = mensaje.trim().toUpperCase();
    if (posibleCodigo.length >= 4 && posibleCodigo.length <= 20 && !/^\d+$/.test(posibleCodigo)) {
      const empresa = await buscarEmpresaPorCodigo(posibleCodigo);
      if (empresa) {
        datos.cc_empresa    = empresa.nombre_empresa;
        datos.cc_empresa_id = empresa.id;
        return { respuesta: '', paso: 300, datos, terminar: false,
          _redirect: { paso: 300, datos }
        };
      }
      // Tiene letras → claramente intentaron un código de acceso, no una cédula
      return {
        respuesta: `❌ El *código de acceso* "${posibleCodigo}" no es válido o está inactivo.\n\nVerifíquelo con su empresa, o si es paciente particular ingrese su *cédula* (10 dígitos):`,
        paso: 1, datos, terminar: false
      };
    }

    const { valida, error, cedula: cedulaLimpia } = validarCedula(mensaje);
    if (!valida) {
      respuesta = `❌ ${error}\n\nIngrese su *cédula* (10 dígitos) o su *código de acceso* de empresa:`;
      return { respuesta, paso: 1, datos, terminar: false };
    }
    // Usar la cédula limpia (sin caracteres extraños que WhatsApp pueda agregar)
    const cedulaFinal = cedulaLimpia || mensaje.replace(/\D/g, '');
    const [paciente, empleado] = await Promise.all([
      buscarPorCedula(cedulaFinal),
      buscarCedulaB2B(cedulaFinal)
    ]);

    if (paciente) {
      // Paciente ya registrado — puede ser afiliado B2B o particular (B2C)
      const afiliacionB2B = paciente.clientes_b2b || empleado?.clientes_b2b || null;
      datos.cedula = cedulaFinal;
      datos.paciente_id = paciente.id;
      datos.nombre_paciente = paciente.nombre;
      datos.empresa = afiliacionB2B?.nombre_empresa || null;
      datos.empresa_id = afiliacionB2B?.id || null;
      datos.origen_afiliacion = afiliacionB2B ? 'afiliado' : null;
      datos.seguro = afiliacionB2B?.nombre_seguro || null;
      // Pre-cargar datos personales ya registrados para no volver a preguntarlos más adelante
      datos.nombre = paciente.nombre || '';
      datos.apellidos = paciente.apellidos || '';
      datos.nombreCompleto = `${paciente.nombre || ''} ${paciente.apellidos || ''}`.trim();
      datos.edad = paciente.edad || '';
      datos.fecha_nacimiento = paciente.fecha_nacimiento || '';
      datos.correo = paciente.correo || '';
      datos.telefono = paciente.telefono || '';
      datos.lugar_residencia = paciente.lugar_residencia || '';
      const saludo = afiliacionB2B
        ? `✅ Le identificamos como afiliado a *${datos.empresa}* con cobertura *${datos.seguro}*.`
        : `✅ Ya tenemos registrados sus datos${datos.nombreCompleto ? `, *${datos.nombreCompleto}*` : ''}.`;
      return {
        respuesta: `${saludo}\n\n¿Acepta el uso y tratamiento de sus datos personales con fines médicos?`,
        paso: 2, datos, terminar: false,
        botones: [
          { id: 'si',  titulo: '✅ Sí, autorizo' },
          { id: 'no',  titulo: '❌ No autorizo'  },
        ]
      };
    } else if (empleado) {
      // Cédula autorizada por empresa B2B — crear paciente on-the-fly y continuar sin pago
      datos.cedula = cedulaFinal;
      datos.empresa = empleado.clientes_b2b?.nombre_empresa || 'su empresa';
      datos.empresa_id = empleado.clientes_b2b?.id || null;
      datos.origen_afiliacion = 'empleado_codigo';
      datos.seguro = empleado.clientes_b2b?.nombre_seguro || 'su seguro';
      const nuevo = await crearPaciente({
        cedula: cedulaFinal,
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
      datos.cedula = cedulaFinal;
      const result = await procesarB2C(50, cedulaFinal, datos, telefono, nombreWhatsApp);
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
      await alertar(`🚨 <b>ALERTA GRAVE - EMERGENCIA</b>\nPaciente: ${datos.nombre_paciente || nombreWhatsApp}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa || 'Particular (B2C)'}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      await eliminar(telefono);
      return {
        respuesta: `🚨 *EMERGENCIA MÉDICA* 🚨\n\nSus síntomas indican una situación de *riesgo vital*.\n\n*Llame al 911 AHORA MISMO.*\n\n📞 tel:911`,
        paso: 0, datos, terminar: true
      };
    } else if (nivel === 2) {
      await alertar(`⚠️ <b>SÍNTOMAS MEDIOS - ATENCIÓN URGENTE</b>\nPaciente: ${datos.nombre_paciente || nombreWhatsApp}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa || 'Particular (B2C)'}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);
      const consulta = await crearConsulta({ paciente_id: datos.paciente_id, nivel_sintomas: 2, sintomas_descripcion: mensaje, estado: 'pendiente' });
      await crearNotificacion('urgente', '⚠️ Síntomas medios', `Paciente ${datos.nombre_paciente} requiere atención urgente`, datos.paciente_id, consulta?.id, {
        origen: datos.empresa_id ? 'b2b' : 'b2c',
        categoria: 'medio',
        etiqueta: datos.origen_afiliacion === 'empleado_codigo' ? 'EMPLEADO CON CÓDIGO'
                : datos.origen_afiliacion === 'afiliado'        ? 'AFILIADO'
                : null,
      });
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
      respuesta = `✅ Sus síntomas pueden ser atendidos por *teleconsulta*.\n\nNecesitamos completar sus datos:\n\n👤 *Nombre y apellidos completos* (2 nombres y 2 apellidos):`;
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
      respuesta = `Entendido, actualicemos sus datos.\n\n👤 *Nombre y apellidos completos* (2 nombres y 2 apellidos):`;
      nuevoPaso = 4;
    }

  } else if (paso === 4) {
    datos.nombreCompleto = mensaje.trim();
    if (tieneApellidos(datos.nombreCompleto)) {
      // Convención ecuatoriana: los dos últimos términos son apellidos
      const { nombre, apellidos } = separarNombre(datos.nombreCompleto);
      datos.nombre = nombre;
      datos.apellidos = apellidos;
      respuesta = `*Edad:*`;
      nuevoPaso = 6;
    } else {
      datos.nombre = datos.nombreCompleto;
      respuesta = `Por favor indique sus *dos apellidos* (paterno y materno):`;
      nuevoPaso = 5;
    }

  } else if (paso === 5) {
    datos.apellidos = mensaje.trim();
    datos.nombreCompleto = `${datos.nombre} ${datos.apellidos}`.trim();
    respuesta = `*Edad:*`;
    nuevoPaso = 6;

  } else if (paso === 6) {
    datos.edad = mensaje;
    respuesta = `*Fecha de nacimiento* (DD/MM/AAAA, ej: 15/03/1990):`;
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
        sexo: inferirSexo(datos.nombreCompleto || `${datos.nombre} ${datos.apellidos}`),
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

      await crearNotificacion('nueva_consulta', '📅 Nueva teleconsulta', `${datos.nombreCompleto} solicita teleconsulta para ${datos.horario}`, datos.paciente_id, consulta?.id, {
        origen: datos.empresa_id ? 'b2b' : 'b2c',
        categoria: 'leve',
        etiqueta: datos.origen_afiliacion === 'empleado_codigo' ? 'EMPLEADO CON CÓDIGO'
                : datos.origen_afiliacion === 'afiliado'        ? 'AFILIADO'
                : null,
      });
      await alertar(`📅 <b>NUEVA TELECONSULTA - MEDILYFT</b>\nPaciente: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa || 'Particular (B2C)'}\nSíntomas: ${datos.sintomas}\nHorario: ${datos.horario}\nTeléfono: ${datos.telefono}\nCorreo: ${datos.correo}\nResidencia: ${datos.lugar_residencia}`);

      // Registrar planillaje B2B automáticamente al confirmar
      if (datos.empresa_id) await registrarPlanillajeB2B(datos, consulta?.id);

      await guardar(telefono, 13, datos);
      return {
        respuesta: `🎉 *¡Consulta registrada exitosamente!*\n\nUn asesor de *MediLyft* le confirmará su teleconsulta a la brevedad.\n\nPara completar su historia clínica necesitamos algunas preguntas más:\n\n💊 ¿Tiene *alergias* conocidas a medicamentos o alimentos?\n\nResponda *No* o descríbalas brevemente.`,
        paso: 13, datos, terminar: true
      };
    } else {
      datos = { cedula: datos.cedula, paciente_id: datos.paciente_id, nombre_paciente: datos.nombre_paciente, empresa: datos.empresa, empresa_id: datos.empresa_id, seguro: datos.seguro, sintomas: datos.sintomas, nivel: datos.nivel };
      respuesta = `Entendido, volvamos a empezar.\n\n👤 *Nombre y apellidos completos* (2 nombres y 2 apellidos):`;
      nuevoPaso = 4;
    }
  }

  return { respuesta, paso: nuevoPaso, datos, terminar: false };
}

module.exports = { procesarPaso };
