const { query } = require('../services/supabase');
const { crear: crearPaciente, buscarPorCedula } = require('../services/pacientes');
const { crear: crearConsulta, crearNotificacion, nivelACategoria } = require('../services/consultas');
const { registrarPlanillajeB2B } = require('../services/planillaje');
const { guardar, eliminar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');
const { estaEnHorario, proximaApertura } = require('../utils/horarioOperacion');
const { mensajeFueraHorario } = require('../utils/mensajesFueraHorario');
const { clasificarSintomas, esSi, inferirSexo, separarNombre, validarCedula } = require('../utils/validaciones');

// Buscar empresa por codigo_acceso
async function buscarEmpresaPorCodigo(codigo) {
  const data = await query('GET', 'clientes_b2b', null,
    `?codigo_acceso=eq.${encodeURIComponent(codigo.trim().toUpperCase())}&activo=eq.true&select=*&limit=1`
  );
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function procesarCallCenter(paso, mensaje, datos, telefono) {
  const empresa     = datos.cc_empresa     || 'su empresa';
  const empresaId   = datos.cc_empresa_id  || null;

  if (paso === 'cc_inicio') {
    return {
      respuesta: `🏢 *Modo Call Center — ${empresa}*\n\nBienvenido agente. Puede registrar consultas para múltiples pacientes desde este número.\n\n📋 Ingrese la *cédula de identidad* del paciente:`,
      paso: 'cc_cedula', datos, terminar: false
    };

  } else if (paso === 'cc_cedula') {
    const { valida, error, cedula: cedulaLimpia } = validarCedula(mensaje);
    if (!valida) {
      return {
        respuesta: `❌ ${error}\n\nIngrese la *cédula* del paciente:`,
        paso: 'cc_cedula', datos, terminar: false
      };
    }
    const cedula = cedulaLimpia || mensaje.replace(/\D/g, '');
    datos.cc_cedula = cedula;
    const existente = await buscarPorCedula(cedula);
    if (existente) {
      datos.cc_paciente_id   = existente.id;
      datos.cc_nombre        = `${existente.nombre || ''} ${existente.apellidos || ''}`.trim();
      datos.cc_telefono      = existente.telefono || '';
      datos.cc_correo        = existente.correo || '';
      datos.cc_paciente_nuevo = false;
      return {
        respuesta: `✅ Paciente encontrado: *${datos.cc_nombre}*\n\n¿Los datos son correctos?\n\n📱 Tel: ${datos.cc_telefono || 'sin registro'}`,
        paso: 'cc_confirmar', datos, terminar: false,
        botones: [
          { id: 'si', titulo: '✅ Sí, continuar' },
          { id: 'no', titulo: '✏️ Ingresar datos' }
        ]
      };
    } else {
      datos.cc_paciente_id   = null;
      datos.cc_paciente_nuevo = true;
      return {
        respuesta: `📝 Paciente nuevo. Ingrese el *nombre completo* del paciente:`,
        paso: 'cc_nombre', datos, terminar: false
      };
    }

  } else if (paso === 'cc_confirmar') {
    if (esSi(mensaje)) {
      return {
        respuesta: `🩺 Describa los *síntomas* del paciente:`,
        paso: 'cc_sintomas', datos, terminar: false
      };
    } else {
      return {
        respuesta: `📝 Ingrese el *nombre completo* del paciente:`,
        paso: 'cc_nombre', datos, terminar: false
      };
    }

  } else if (paso === 'cc_nombre') {
    datos.cc_nombre = mensaje.trim();
    return {
      respuesta: `🎂 Ingrese la *edad* del paciente:`,
      paso: 'cc_edad', datos, terminar: false
    };

  } else if (paso === 'cc_edad') {
    datos.cc_edad = mensaje.replace(/\D/g, '').trim();
    return {
      respuesta: `📅 Ingrese la *fecha de nacimiento* del paciente (DD/MM/AAAA, ej: 15/03/1990):`,
      paso: 'cc_nacimiento', datos, terminar: false
    };

  } else if (paso === 'cc_nacimiento') {
    datos.cc_nacimiento = mensaje.trim();
    return {
      respuesta: `⚧ *Sexo biológico* del paciente:`,
      paso: 'cc_sexo', datos, terminar: false,
      botones: [
        { id: 'masculino', titulo: '👨 Masculino' },
        { id: 'femenino',  titulo: '👩 Femenino'  },
      ]
    };

  } else if (paso === 'cc_sexo') {
    const m = mensaje.trim().toLowerCase();
    datos.cc_sexo = (m === 'femenino' || m === 'f') ? 'F' : 'M';
    return {
      respuesta: `📱 Ingrese el *número de teléfono* del paciente:`,
      paso: 'cc_telefono', datos, terminar: false
    };

  } else if (paso === 'cc_telefono') {
    const tel = mensaje.trim().replace(/\D/g, '');
    if (tel.length < 7) {
      return {
        respuesta: `❌ Número inválido. Ingrese el *teléfono celular* del paciente (mínimo 7 dígitos):\n\nEj: 0991234567`,
        paso: 'cc_telefono', datos, terminar: false
      };
    }
    datos.cc_telefono = tel;
    return {
      respuesta: `📧 Ingrese el *correo electrónico* del paciente (o escriba *no* si no tiene):`,
      paso: 'cc_correo', datos, terminar: false
    };

  } else if (paso === 'cc_correo') {
    datos.cc_correo = /^no$/i.test(mensaje.trim()) ? '' : mensaje.trim();
    return {
      respuesta: `📍 Ingrese el *lugar de residencia* del paciente (ciudad y barrio):`,
      paso: 'cc_residencia', datos, terminar: false
    };

  } else if (paso === 'cc_residencia') {
    datos.cc_residencia = mensaje.trim();
    return {
      respuesta: `🩺 Describa los *síntomas* del paciente:`,
      paso: 'cc_sintomas', datos, terminar: false
    };

  } else if (paso === 'cc_sintomas') {
    const nivel = clasificarSintomas(mensaje);
    datos.cc_sintomas = mensaje.trim();
    datos.cc_nivel    = nivel;

    if (nivel === 3) {
      await alertar(`🚨 <b>EMERGENCIA - CALL CENTER ${empresa}</b>\nPaciente: ${datos.cc_nombre}\nCédula: ${datos.cc_cedula}\nSíntomas: ${mensaje}\nAgente: ${telefono}`);
      return {
        respuesta: `🚨 *EMERGENCIA MÉDICA*\n\nSíntomas de riesgo vital. *Llame al 911 de inmediato.*\n\n¿Desea registrar otro paciente?`,
        paso: 'cc_siguiente', datos, terminar: false,
        botones: [
          { id: 'si', titulo: '✅ Otro paciente' },
          { id: 'no', titulo: '🔚 Finalizar sesión' }
        ]
      };
    }

    return {
      respuesta: `📋 *Resumen de la consulta:*\n\n👤 *Paciente:* ${datos.cc_nombre}\n🪪 *Cédula:* ${datos.cc_cedula}\n🎂 *Edad:* ${datos.cc_edad || '—'}\n📅 *Nacimiento:* ${datos.cc_nacimiento || '—'}\n⚧ *Sexo:* ${datos.cc_sexo || '—'}\n📱 *Tel:* ${datos.cc_telefono || '—'}\n📧 *Correo:* ${datos.cc_correo || '—'}\n📍 *Residencia:* ${datos.cc_residencia || '—'}\n🩺 *Síntomas:* ${datos.cc_sintomas}\n🏢 *Empresa:* ${empresa}\n\n¿Confirma el registro?`,
      paso: 'cc_revisar', datos, terminar: false,
      botones: [
        { id: 'confirmar', titulo: '✅ Confirmar' },
        { id: 'corregir',  titulo: '✏️ Corregir'  }
      ]
    };

  } else if (paso === 'cc_revisar') {
    if (mensaje === 'corregir' || mensaje === '✏️ Corregir') {
      datos.cc_cedula = datos.cc_nombre = datos.cc_edad = datos.cc_nacimiento = datos.cc_sexo = datos.cc_telefono = datos.cc_correo = datos.cc_residencia = datos.cc_sintomas = '';
      datos.cc_paciente_id = null;
      return {
        respuesta: `📋 Ingrese la *cédula* del paciente nuevamente:`,
        paso: 'cc_cedula', datos, terminar: false
      };
    }

    let pacienteId = datos.cc_paciente_id;
    const { nombre, apellidos } = separarNombre(datos.cc_nombre);

    if (!pacienteId) {
      const nuevo = await crearPaciente({
        cedula:           datos.cc_cedula,
        nombre,
        apellidos,
        edad:             datos.cc_edad || null,
        fecha_nacimiento: datos.cc_nacimiento || null,
        sexo:             datos.cc_sexo || inferirSexo(datos.cc_nombre),
        correo:           datos.cc_correo || '',
        telefono:         datos.cc_telefono || '',
        lugar_residencia: datos.cc_residencia || '',
        cliente_b2b_id:   empresaId
      });
      pacienteId = nuevo?.id || null;
    }

    if (!estaEnHorario()) {
      const prox = proximaApertura();
      const fhDatos = {
        ...datos,
        cc_paciente_id: pacienteId,
        _flujo:         'fuera_horario',
        _pendingOrigen: 'callcenter',
        _activada_at:   prox.fecha.toISOString(),
        _proximaTexto:  prox.texto
      };
      await guardar(telefono, 0, fhDatos, 'fuera_horario');
      const { respuesta, botones } = mensajeFueraHorario(prox);
      return { respuesta, botones, paso: 0, datos: fhDatos, terminar: false };
    }

    const consulta = await crearConsulta({
      paciente_id:          pacienteId,
      nivel_sintomas:       datos.cc_nivel || 1,
      sintomas_descripcion: datos.cc_sintomas,
      estado:               'pendiente'
    });

    await crearNotificacion(
      datos.cc_nivel === 2 ? 'urgente' : 'nueva_consulta',
      `📅 Consulta B2B — ${empresa}`,
      `${datos.cc_nombre} (${datos.cc_cedula}) registrado por call center`,
      pacienteId,
      consulta?.id,
      { origen: 'b2b', categoria: nivelACategoria(datos.cc_nivel || 1), etiqueta: 'EMPLEADO CON CÓDIGO' }
    );

    await alertar(`📅 <b>NUEVA CONSULTA CALL CENTER — ${empresa}</b>\nPaciente: ${datos.cc_nombre}\nCédula: ${datos.cc_cedula}\nTeléfono: ${datos.cc_telefono}\nSíntomas: ${datos.cc_sintomas}\nAgente: ${telefono}`);

    try {
      await registrarPlanillajeB2B({ ...datos, cc_paciente_id: pacienteId, cc_empresa_id: empresaId }, consulta?.id);
    } catch (e) {
      await alertar(`⚠️ <b>Error registrando planillaje B2B</b>\nPaciente: ${datos.cc_nombre}\nCédula: ${datos.cc_cedula}\nEmpresa: ${empresa}\nError: ${e.message}`);
    }

    return {
      respuesta: `✅ *¡Consulta registrada!*\n\n👤 ${datos.cc_nombre} — ${datos.cc_cedula}\n\nUn médico de MediLyft le contactará pronto.\n\n¿Desea registrar otro paciente?`,
      paso: 'cc_siguiente', datos, terminar: false,
      botones: [
        { id: 'si', titulo: '✅ Otro paciente' },
        { id: 'no', titulo: '🔚 Finalizar sesión' }
      ]
    };

  } else if (paso === 'cc_siguiente') {
    if (esSi(mensaje)) {
      datos.cc_cedula = datos.cc_nombre = datos.cc_edad = datos.cc_nacimiento = datos.cc_sexo = datos.cc_telefono = datos.cc_correo = datos.cc_residencia = datos.cc_sintomas = '';
      datos.cc_paciente_id = null;
      datos.cc_nivel = 1;
      await guardar(telefono, 'cc_cedula', datos, 'callcenter');
      return {
        respuesta: `📋 *${empresa}* — Ingrese la *cédula* del siguiente paciente:`,
        paso: 'cc_cedula', datos, terminar: false
      };
    } else {
      return {
        respuesta: `👋 Sesión de call center finalizada. Para iniciar otra sesión escríbanos *hola*.\n\n¡Hasta pronto, agente!`,
        paso: 0, datos, terminar: true
      };
    }
  }

  return { respuesta: '⚠️ Estado no reconocido. Escriba *hola* para reiniciar.', paso: 0, datos, terminar: true };
}

async function confirmarCallCenterFueraHorario(datos, telefono) {
  const empresa   = datos.cc_empresa    || 'su empresa';
  const empresaId = datos.cc_empresa_id || null;
  const pacienteId = datos.cc_paciente_id;

  const consulta = await crearConsulta({
    paciente_id:          pacienteId,
    nivel_sintomas:       datos.cc_nivel || 1,
    sintomas_descripcion: datos.cc_sintomas,
    estado:               'pendiente_apertura',
    activada_at:          datos._activada_at || null
  });

  await crearNotificacion(
    datos.cc_nivel === 2 ? 'urgente' : 'nueva_consulta',
    `📅 Consulta B2B — ${empresa}`,
    `${datos.cc_nombre} (${datos.cc_cedula}) — call center, activa ${datos._proximaTexto}`,
    pacienteId, consulta?.id,
    { origen: 'b2b', categoria: nivelACategoria(datos.cc_nivel || 1), etiqueta: 'EMPLEADO CON CÓDIGO' }
  );

  await alertar(
    `📅 <b>CALL CENTER FUERA DE HORARIO — agendada</b>\n` +
    `Paciente: ${datos.cc_nombre}\nCédula: ${datos.cc_cedula}\nTeléfono: ${datos.cc_telefono}\n` +
    `Síntomas: ${datos.cc_sintomas}\nActiva: ${datos._proximaTexto}\nAgente: ${telefono}`
  );

  try {
    await registrarPlanillajeB2B({ ...datos, cc_paciente_id: pacienteId, cc_empresa_id: empresaId }, consulta?.id);
  } catch (e) {
    await alertar(`⚠️ <b>Error planillaje B2B</b>\n${datos.cc_nombre}\n${e.message}`);
  }

  await eliminar(telefono);

  return {
    respuesta: `✅ *¡Cita agendada!*\n\n👤 ${datos.cc_nombre} — ${datos.cc_cedula}\n\nUn médico de MediLyft atenderá la solicitud ${datos._proximaTexto}.\n\n¿Desea registrar otro paciente?`,
    paso: 'cc_siguiente', datos, terminar: false,
    botones: [
      { id: 'si', titulo: '✅ Otro paciente' },
      { id: 'no', titulo: '🔚 Finalizar sesión' }
    ]
  };
}

module.exports = { procesarCallCenter, buscarEmpresaPorCodigo, confirmarCallCenterFueraHorario };
