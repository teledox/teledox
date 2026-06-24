const { buscarPorCedula, actualizar, crear: crearPaciente } = require('../services/pacientes');
const { buscarCedulaB2B } = require('../services/empleados');
const { buscarEmpresaPorCodigo } = require('./flujo-callcenter');
const { crear: crearConsulta, crearNotificacion } = require('../services/consultas');
const { registrarPlanillajeB2B } = require('../services/planillaje');
const { guardar, eliminar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');
const { validarCedula, clasificarSintomas, esSi, tieneApellidos, inferirSexo, separarNombre } = require('../utils/validaciones');
const { procesarB2C, BOTONES_PAGO } = require('./flujo-b2c');
const { mensajeBienvenida } = require('./flujo-inicio');
const { query } = require('../services/supabase');
const { estaEnHorario, proximaApertura } = require('../utils/horarioOperacion');
const { mensajeFueraHorario } = require('../utils/mensajesFueraHorario');

async function procesarPaso(paso, mensaje, datos, telefono, nombreWhatsApp, msg) {
  let respuesta = '';
  let nuevoPaso = paso;

  // Paso desconocido/no reconocido — reiniciar sesión para evitar bucles
  // sin salida (en lugar de repetir una respuesta vacía indefinidamente)
  const PASOS_VALIDOS = [0, 1, 2, 3, 39, 4, 5, 6, 7, 8, 41, 9, 10, 11, 42];
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
      const b2cDatos = { ...result.datos, _flujo: 'b2c' };
      await guardar(telefono, result.paso, b2cDatos, 'b2c');
      return { ...result, datos: b2cDatos };
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
      await guardar(telefono, 0, {
        _flujo: 'emergencia',
        paciente_id: datos.paciente_id || null,
        cedula: datos.cedula,
        nombreCompleto: datos.nombre_paciente,
        empresa_id: datos.empresa_id || null,
        contexto: `Síntomas: ${mensaje}`
      }, 'emergencia');
      return {
        respuesta: `🚨 *EMERGENCIA MÉDICA* 🚨\n\nSus síntomas indican una situación de *riesgo vital*.\n\nPuede:\n• Acudir al hospital más cercano\n• Llamar al *911*\n• Iniciar una consulta urgente ahora`,
        paso: 0, datos: { ...datos, _flujo: 'emergencia' },
        botones: [
          { id: 'emergencia_911',      titulo: '📞 Llamar al 911'   },
          { id: 'emergencia_consulta', titulo: '🏥 Consulta urgente' },
        ],
        terminar: false
      };
    } else if (nivel === 2) {
      await alertar(`⚠️ <b>SÍNTOMAS MEDIOS - ATENCIÓN URGENTE</b>\nPaciente: ${datos.nombre_paciente || nombreWhatsApp}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa || 'Particular (B2C)'}\nTeléfono: ${telefono}\nSíntomas: ${mensaje}`);

      if (!datos.empresa_id) {
        // B2C: requiere pago incluso en nivel 2 (urgente pero no emergencia)
        const b2cDatos = { ...datos, _flujo: 'b2c', modalidad: 'b2c' };
        await guardar(telefono, 59, b2cDatos, 'b2c');
        return {
          respuesta: `⚠️ Sus síntomas requieren atención médica urgente.\n\nNuestro equipo ya ha sido notificado.\n\nPara gestionar su teleconsulta de forma *prioritaria*, el costo es *$8.00*.\n\n¿Cómo desea realizar el pago?`,
          paso: 59, datos: b2cDatos, terminar: false,
          botones: BOTONES_PAGO
        };
      }

      const consulta = await crearConsulta({ paciente_id: datos.paciente_id, nivel_sintomas: 2, sintomas_descripcion: mensaje, estado: 'pendiente' });
      await crearNotificacion('urgente', '⚠️ Síntomas medios', `Paciente ${datos.nombre_paciente} requiere atención urgente`, datos.paciente_id, consulta?.id, {
        origen: 'b2b',
        categoria: 'medio',
        etiqueta: datos.origen_afiliacion === 'empleado_codigo' ? 'EMPLEADO CON CÓDIGO'
                : datos.origen_afiliacion === 'afiliado'        ? 'AFILIADO'
                : null,
      });
      if (datos.empresa_id) {
        try {
          await registrarPlanillajeB2B(datos, consulta?.id);
        } catch (e) {
          await alertar(`⚠️ <b>Error registrando planillaje B2B</b>\nPaciente: ${datos.nombre_paciente || datos.nombreCompleto}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa}\nError: ${e.message}`);
        }
      }
      await eliminar(telefono);
      return {
        respuesta: `⚠️ *Atención prioritaria requerida*\n\nSus síntomas necesitan evaluación médica urgente.\n\nHemos notificado a nuestro equipo y le contactarán a la brevedad.\n\nSi los síntomas empeoran *llame al 911 de inmediato*.`,
        paso: 0, datos, terminar: true
      };
    } else {
      const datosCompletos = datos.paciente_id && datos.nombreCompleto?.trim() && datos.telefono && datos.correo && datos.lugar_residencia;

      if (!datos.empresa_id) {
        // B2C: siempre requiere pago — no puede continuar sin verificar comprobante
        const b2cDatos = { ...datos, _flujo: 'b2c', modalidad: datos.modalidad || 'b2c' };
        await guardar(telefono, 59, b2cDatos, 'b2c');
        const resumen = datosCompletos
          ? `\n\nYa tenemos sus datos registrados:\n\n👤 *Nombre:* ${datos.nombreCompleto}\n🎂 *Edad:* ${datos.edad || '—'}\n📧 *Correo:* ${datos.correo}\n📱 *Teléfono:* ${datos.telefono}\n📍 *Residencia:* ${datos.lugar_residencia}`
          : '';
        return {
          respuesta: `✅ Sus síntomas pueden ser atendidos por *teleconsulta*.${resumen}\n\nEl costo de la teleconsulta es *$8.00*.\n\n¿Cómo desea realizar el pago?`,
          paso: 59, datos: b2cDatos, terminar: false,
          botones: BOTONES_PAGO
        };
      }

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
        respuesta: `Perfecto. ¿Cuándo necesita la atención?`,
        paso: 11, datos, terminar: false,
        botones: [
          { id: 'pronto',  titulo: '⚡ Cita lo más pronto posible' },
          { id: 'esperar', titulo: '🕐 Cita, puedo esperar'        },
        ]
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
    return {
      respuesta: `Perfecto. ¿Cuándo necesita la atención?`,
      paso: 11, datos, terminar: false,
      botones: [
        { id: 'pronto',  titulo: '⚡ Cita lo más pronto posible' },
        { id: 'esperar', titulo: '🕐 Cita, puedo esperar'        },
      ]
    };

  } else if (paso === 11) {
    const mp = mensaje.trim().toLowerCase();
    datos.prioridad = (mp === 'pronto' || mp.includes('pronto')) ? 'pronto' : 'esperar';

    if (!datos.empresa_id) {
      const b2cDatos = { ...datos, _flujo: 'b2c', modalidad: datos.modalidad || 'b2c' };
      await guardar(telefono, 59, b2cDatos, 'b2c');
      return {
        respuesta: `Para confirmar su teleconsulta necesitamos verificar el pago.\n\nEl costo es *$8.00*.\n\n¿Cómo desea realizar el pago?`,
        paso: 59, datos: b2cDatos, terminar: false,
        botones: BOTONES_PAGO
      };
    }

    // Verificar horario de operación antes de crear la consulta (solo B2B)
    if (!estaEnHorario()) {
      const prox = proximaApertura();
      const fhDatos = {
        ...datos,
        _flujo:         'fuera_horario',
        _pendingOrigen: 'consulta',
        _activada_at:   prox.fecha.toISOString(),
        _proximaTexto:  prox.texto
      };
      await guardar(telefono, 0, fhDatos, 'fuera_horario');
      const { respuesta, botones } = mensajeFueraHorario(prox);
      return { respuesta, botones, paso: 0, datos: fhDatos, terminar: false };
    }

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
      estado: 'pendiente',
      activada_at: new Date().toISOString()
    });

    const prioridadTexto = datos.prioridad === 'pronto' ? 'lo más pronto posible' : 'cuando haya disponibilidad';
    await crearNotificacion('nueva_consulta', '📅 Nueva teleconsulta',
      `${datos.nombreCompleto} solicita teleconsulta (${prioridadTexto})`,
      datos.paciente_id, consulta?.id, {
        origen: datos.empresa_id ? 'b2b' : 'b2c',
        categoria: 'leve',
        etiqueta: datos.origen_afiliacion === 'empleado_codigo' ? 'EMPLEADO CON CÓDIGO'
                : datos.origen_afiliacion === 'afiliado'        ? 'AFILIADO'
                : null,
      });
    await alertar(`📅 <b>NUEVA TELECONSULTA - MEDILYFT</b>\nPaciente: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa || 'Particular (B2C)'}\nSíntomas: ${datos.sintomas}\nPrioridad: ${prioridadTexto}\nTeléfono: ${datos.telefono}\nCorreo: ${datos.correo}\nResidencia: ${datos.lugar_residencia}`);

    if (datos.empresa_id) {
      try {
        await registrarPlanillajeB2B(datos, consulta?.id);
      } catch (e) {
        await alertar(`⚠️ <b>Error registrando planillaje B2B</b>\nPaciente: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\nEmpresa: ${datos.empresa}\nError: ${e.message}`);
      }
    }

    return {
      respuesta: `🎉 *¡Consulta registrada exitosamente!*\n\n👤 ${datos.nombreCompleto} — ${datos.cedula}\n\nUn médico de *MediLyft* le atenderá a la brevedad.`,
      paso: 42, datos, terminar: false,
      botones: [
        { id: 'otra_consulta', titulo: '✅ Otra consulta'     },
        { id: 'finalizar',     titulo: '🔚 Finalizar proceso' },
      ]
    };

  } else if (paso === 42) {
    if (mensaje === 'otra_consulta' || mensaje.toLowerCase().includes('otra consulta')) {
      return mensajeBienvenida(nombreWhatsApp);
    } else {
      // Si el paciente ya tiene antecedentes registrados, no volver a preguntar
      if (datos.paciente_id) {
        const existentes = await query('GET', 'antecedentes', null,
          `?paciente_id=eq.${datos.paciente_id}&limit=1`).catch(() => []);
        if (existentes?.length) {
          await eliminar(telefono);
          return {
            respuesta: `✅ Su historia clínica ya se encuentra registrada en nuestro sistema.\n\n¡Gracias por confiar en *MediLyft*! Hasta pronto 💙`,
            paso: 0, datos: {}, terminar: true
          };
        }
      }
      const datosAnt = { ...datos, _flujo: 'antecedentes' };
      await guardar(telefono, 13, datosAnt, 'antecedentes');
      return {
        respuesta: `Para completar su historia clínica necesitamos algunas preguntas más:\n\n💊 ¿Tiene *alergias* conocidas a medicamentos o alimentos?\n\nResponda *No* o descríbalas brevemente.`,
        paso: 13, datos: datosAnt, terminar: false
      };
    }
  }

  return { respuesta, paso: nuevoPaso, datos, terminar: false };
}

// Confirma una consulta que fue agendada fuera de horario y está pendiente.
// Llamada desde webhook.js cuando el paciente presiona "✅ Agendar mi cita".
async function confirmarConsultaFueraHorario(datos, telefono) {
  await actualizar(datos.cedula, {
    nombre: datos.nombre, apellidos: datos.apellidos,
    edad: datos.edad, fecha_nacimiento: datos.fecha_nacimiento,
    sexo: inferirSexo(datos.nombreCompleto || `${datos.nombre} ${datos.apellidos}`),
    correo: datos.correo, telefono: datos.telefono,
    lugar_residencia: datos.lugar_residencia,
    updated_at: new Date().toISOString()
  });

  const consulta = await crearConsulta({
    paciente_id: datos.paciente_id,
    nivel_sintomas: 1,
    sintomas_descripcion: datos.sintomas,
    estado: 'pendiente_apertura',
    activada_at: datos._activada_at || null
  });

  const prioridadTexto = datos.prioridad === 'pronto' ? 'lo más pronto posible' : 'cuando haya disponibilidad';
  await crearNotificacion('nueva_consulta', '📅 Nueva teleconsulta',
    `${datos.nombreCompleto} solicita teleconsulta — se activará ${datos._proximaTexto}`,
    datos.paciente_id, consulta?.id, {
      origen: datos.empresa_id ? 'b2b' : 'b2c',
      categoria: 'leve',
      etiqueta: datos.origen_afiliacion === 'empleado_codigo' ? 'EMPLEADO CON CÓDIGO'
              : datos.origen_afiliacion === 'afiliado'        ? 'AFILIADO'
              : null,
    });

  await alertar(
    `📅 <b>TELECONSULTA FUERA DE HORARIO — agendada</b>\n` +
    `Paciente: ${datos.nombreCompleto}\nCédula: ${datos.cedula}\n` +
    `Empresa: ${datos.empresa || 'Particular'}\nSíntomas: ${datos.sintomas}\n` +
    `Prioridad: ${prioridadTexto}\nActiva: ${datos._proximaTexto}`
  );

  if (datos.empresa_id) {
    try {
      await registrarPlanillajeB2B(datos, consulta?.id);
    } catch (e) {
      await alertar(`⚠️ <b>Error planillaje B2B</b>\n${datos.nombreCompleto}\n${e.message}`);
    }
  }

  await eliminar(telefono);

  return {
    respuesta: `🎉 *¡Cita agendada!*\n\n👤 ${datos.nombreCompleto} — ${datos.cedula}\n\nUn médico de *MediLyft* atenderá tu solicitud ${datos._proximaTexto}.`,
    paso: 0, datos: {}, terminar: true
  };
}

module.exports = { procesarPaso, confirmarConsultaFueraHorario };
