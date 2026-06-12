const { query } = require('../services/supabase');
const { crear: crearPaciente, buscarPorCedula } = require('../services/pacientes');
const { crear: crearConsulta, crearNotificacion, nivelACategoria } = require('../services/consultas');
const { registrarPlanillajeB2B } = require('../services/planillaje');
const { guardar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');
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

  // ── Paso 300: bienvenida call center ────────────────────────────────────
  if (paso === 300) {
    return {
      respuesta: `🏢 *Modo Call Center — ${empresa}*\n\nBienvenido agente. Puede registrar consultas para múltiples pacientes desde este número.\n\n📋 Ingrese la *cédula de identidad* del paciente:`,
      paso: 301, datos, terminar: false
    };

  // ── Paso 301: cédula del paciente ────────────────────────────────────────
  } else if (paso === 301) {
    const { valida, error, cedula: cedulaLimpia } = validarCedula(mensaje);
    if (!valida) {
      return {
        respuesta: `❌ ${error}\n\nIngrese la *cédula* del paciente:`,
        paso: 301, datos, terminar: false
      };
    }
    const cedula = cedulaLimpia || mensaje.replace(/\D/g, '');
    datos.cc_cedula = cedula;
    // Buscar paciente existente
    const existente = await buscarPorCedula(cedula);
    if (existente) {
      datos.cc_paciente_id   = existente.id;
      datos.cc_nombre        = `${existente.nombre || ''} ${existente.apellidos || ''}`.trim();
      datos.cc_telefono      = existente.telefono || '';
      datos.cc_correo        = existente.correo || '';
      datos.cc_paciente_nuevo = false;
      return {
        respuesta: `✅ Paciente encontrado: *${datos.cc_nombre}*\n\n¿Los datos son correctos?\n\n📱 Tel: ${datos.cc_telefono || 'sin registro'}`,
        paso: 302, datos, terminar: false,
        botones: [
          { id: 'si',  titulo: '✅ Sí, continuar' },
          { id: 'no',  titulo: '✏️ Ingresar datos' }
        ]
      };
    } else {
      datos.cc_paciente_id   = null;
      datos.cc_paciente_nuevo = true;
      return {
        respuesta: `📝 Paciente nuevo. Ingrese el *nombre completo* del paciente:`,
        paso: 303, datos, terminar: false
      };
    }

  // ── Paso 302: confirmar datos de paciente existente ──────────────────────
  } else if (paso === 302) {
    if (esSi(mensaje)) {
      return {
        respuesta: `🩺 Describa los *síntomas* del paciente:`,
        paso: 306, datos, terminar: false
      };
    } else {
      return {
        respuesta: `📝 Ingrese el *nombre completo* del paciente:`,
        paso: 303, datos, terminar: false
      };
    }

  // ── Paso 303: nombre del paciente ────────────────────────────────────────
  } else if (paso === 303) {
    datos.cc_nombre = mensaje.trim();
    return {
      respuesta: `🎂 Ingrese la *edad* del paciente:`,
      paso: 308, datos, terminar: false
    };

  // ── Paso 308: edad del paciente ──────────────────────────────────────────
  } else if (paso === 308) {
    datos.cc_edad = mensaje.replace(/\D/g, '').trim();
    return {
      respuesta: `📅 Ingrese la *fecha de nacimiento* del paciente (DD/MM/AAAA, ej: 15/03/1990):`,
      paso: 310, datos, terminar: false
    };

  // ── Paso 310: fecha de nacimiento ────────────────────────────────────────
  } else if (paso === 310) {
    datos.cc_nacimiento = mensaje.trim();
    return {
      respuesta: `📱 Ingrese el *número de teléfono* del paciente:`,
      paso: 304, datos, terminar: false
    };

  // ── Paso 304: teléfono del paciente (obligatorio para envío de docs y seguimiento) ──────
  } else if (paso === 304) {
    const tel = mensaje.trim().replace(/\D/g, '');
    if (tel.length < 7) {
      return {
        respuesta: `❌ Número inválido. Ingrese el *teléfono celular* del paciente (mínimo 7 dígitos):\n\nEj: 0991234567`,
        paso: 304, datos, terminar: false
      };
    }
    datos.cc_telefono = tel;
    return {
      respuesta: `📧 Ingrese el *correo electrónico* del paciente (o escriba *no* si no tiene):`,
      paso: 305, datos, terminar: false
    };

  // ── Paso 305: correo del paciente ────────────────────────────────────────
  } else if (paso === 305) {
    datos.cc_correo = /^no$/i.test(mensaje.trim()) ? '' : mensaje.trim();
    return {
      respuesta: `📍 Ingrese el *lugar de residencia* del paciente (ciudad y barrio):`,
      paso: 311, datos, terminar: false
    };

  // ── Paso 311: lugar de residencia ────────────────────────────────────────
  } else if (paso === 311) {
    datos.cc_residencia = mensaje.trim();
    return {
      respuesta: `🩺 Describa los *síntomas* del paciente:`,
      paso: 306, datos, terminar: false
    };

  // ── Paso 306: síntomas ───────────────────────────────────────────────────
  } else if (paso === 306) {
    const nivel = clasificarSintomas(mensaje);
    datos.cc_sintomas = mensaje.trim();
    datos.cc_nivel    = nivel;

    if (nivel === 3) {
      await alertar(`🚨 <b>EMERGENCIA - CALL CENTER ${empresa}</b>\nPaciente: ${datos.cc_nombre}\nCédula: ${datos.cc_cedula}\nSíntomas: ${mensaje}\nAgente: ${telefono}`);
      return {
        respuesta: `🚨 *EMERGENCIA MÉDICA*\n\nSíntomas de riesgo vital. *Llame al 911 de inmediato.*\n\n¿Desea registrar otro paciente?`,
        paso: 309, datos, terminar: false,
        botones: [
          { id: 'si', titulo: '✅ Otro paciente' },
          { id: 'no', titulo: '🔚 Finalizar sesión' }
        ]
      };
    }

    return {
      respuesta: `📋 *Resumen de la consulta:*\n\n👤 *Paciente:* ${datos.cc_nombre}\n🪪 *Cédula:* ${datos.cc_cedula}\n🎂 *Edad:* ${datos.cc_edad || '—'}\n📅 *Nacimiento:* ${datos.cc_nacimiento || '—'}\n📱 *Tel:* ${datos.cc_telefono || '—'}\n📧 *Correo:* ${datos.cc_correo || '—'}\n📍 *Residencia:* ${datos.cc_residencia || '—'}\n🩺 *Síntomas:* ${datos.cc_sintomas}\n🏢 *Empresa:* ${empresa}\n\n¿Confirma el registro?`,
      paso: 307, datos, terminar: false,
      botones: [
        { id: 'confirmar', titulo: '✅ Confirmar' },
        { id: 'corregir',  titulo: '✏️ Corregir'  }
      ]
    };

  // ── Paso 307: confirmar registro ─────────────────────────────────────────
  } else if (paso === 307) {
    if (mensaje === 'corregir' || mensaje === '✏️ Corregir') {
      // Reiniciar datos del paciente pero mantener autenticación
      datos.cc_cedula = datos.cc_nombre = datos.cc_edad = datos.cc_nacimiento = datos.cc_telefono = datos.cc_correo = datos.cc_residencia = datos.cc_sintomas = '';
      datos.cc_paciente_id = null;
      return {
        respuesta: `📋 Ingrese la *cédula* del paciente nuevamente:`,
        paso: 301, datos, terminar: false
      };
    }

    // Crear o actualizar paciente
    let pacienteId = datos.cc_paciente_id;
    const { nombre, apellidos } = separarNombre(datos.cc_nombre);

    if (!pacienteId) {
      const nuevo = await crearPaciente({
        cedula:          datos.cc_cedula,
        nombre,
        apellidos,
        edad:            datos.cc_edad || null,
        fecha_nacimiento: datos.cc_nacimiento || null,
        sexo:            inferirSexo(datos.cc_nombre),
        correo:          datos.cc_correo || '',
        telefono:        datos.cc_telefono || '',
        lugar_residencia: datos.cc_residencia || '',
        cliente_b2b_id:  empresaId
      });
      pacienteId = nuevo?.id || null;
    }

    // Crear consulta
    const consulta = await crearConsulta({
      paciente_id:         pacienteId,
      nivel_sintomas:      datos.cc_nivel || 1,
      sintomas_descripcion: datos.cc_sintomas,
      estado:              'pendiente'
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

    // Registrar planillaje B2B para facturación a la empresa (no debe interrumpir el flujo si falla)
    try {
      await registrarPlanillajeB2B({ ...datos, cc_paciente_id: pacienteId, cc_empresa_id: empresaId }, consulta?.id);
    } catch (e) {
      await alertar(`⚠️ <b>Error registrando planillaje B2B</b>\nPaciente: ${datos.cc_nombre}\nCédula: ${datos.cc_cedula}\nEmpresa: ${empresa}\nError: ${e.message}`);
    }

    return {
      respuesta: `✅ *¡Consulta registrada!*\n\n👤 ${datos.cc_nombre} — ${datos.cc_cedula}\n\nUn médico de MediLyft le contactará pronto.\n\n¿Desea registrar otro paciente?`,
      paso: 309, datos, terminar: false,
      botones: [
        { id: 'si', titulo: '✅ Otro paciente' },
        { id: 'no', titulo: '🔚 Finalizar sesión' }
      ]
    };

  // ── Paso 309: ¿otro paciente? ────────────────────────────────────────────
  } else if (paso === 309) {
    if (esSi(mensaje)) {
      // Limpiar datos del paciente anterior, mantener autenticación empresa
      datos.cc_cedula = datos.cc_nombre = datos.cc_edad = datos.cc_nacimiento = datos.cc_telefono = datos.cc_correo = datos.cc_residencia = datos.cc_sintomas = '';
      datos.cc_paciente_id = null;
      datos.cc_nivel = 1;
      await guardar(telefono, 301, datos);
      return {
        respuesta: `📋 *${empresa}* — Ingrese la *cédula* del siguiente paciente:`,
        paso: 301, datos, terminar: false
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

module.exports = { procesarCallCenter, buscarEmpresaPorCodigo };
