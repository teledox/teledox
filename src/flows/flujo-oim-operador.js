const { query } = require('../services/supabase');
const { crear: crearPaciente, buscarPorCedula } = require('../services/pacientes');
const { crear: crearConsulta, crearNotificacion, nivelACategoria } = require('../services/consultas');
const { registrarPlanillajeB2B } = require('../services/planillaje');
const { guardar, eliminar } = require('../services/sesiones');
const { alertar } = require('../services/telegram');
const { enviar: enviarWhatsApp } = require('../services/whatsapp');
const { estaEnHorario, proximaApertura } = require('../utils/horarioOperacion');
const { mensajeFueraHorario } = require('../utils/mensajesFueraHorario');
const { clasificarSintomas, esSi, inferirSexo, separarNombre, validarCedula } = require('../utils/validaciones');

// Buscar empresa OIM de forma automática
async function obtenerEmpresaOIM() {
  try {
    const data = await query('GET', 'clientes_b2b', null,
      `?nombre=ilike.*oim*&activo=eq.true&select=*&limit=1`
    );
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error('Error buscando empresa OIM:', e.message);
    return null;
  }
}

async function procesarOimOperador(paso, mensaje, datos, telefono) {
  // Inicializar ID de empresa OIM si no está en datos
  if (!datos.oim_empresa_id) {
    const oim = await obtenerEmpresaOIM();
    if (oim) {
      datos.oim_empresa_id = oim.id;
      datos.oim_empresa_nombre = oim.nombre;
    } else {
      datos.oim_empresa_nombre = 'OIM Ecuador';
    }
  }

  const empresa = datos.oim_empresa_nombre;
  const empresaId = datos.oim_empresa_id;

  if (paso === 'oim_inicio') {
    return {
      respuesta: `🩺 *Portal de Operadores OIM — ${empresa}*\n\nBienvenido, operador de enlace. Ingrese el número de *cédula de identidad* (o documento de identidad) del beneficiario a registrar:`,
      paso: 'oim_cedula', datos, terminar: false
    };

  } else if (paso === 'oim_cedula') {
    const { valida, error, cedula: cedulaLimpia } = validarCedula(mensaje);
    if (!valida) {
      // OIM también acepta pasaportes u otros IDs. Si no es cédula ecuatoriana válida, permitir continuar pero advertir
      datos.oim_cedula = mensaje.trim();
    } else {
      datos.oim_cedula = cedulaLimpia || mensaje.replace(/\D/g, '');
    }

    const existente = await buscarPorCedula(datos.oim_cedula);
    if (existente) {
      datos.oim_paciente_id = existente.id;
      datos.oim_nombre = `${existente.nombre || ''} ${existente.apellidos || ''}`.trim();
      datos.oim_telefono = existente.telefono || '';
      datos.oim_correo = existente.correo || '';
      datos.oim_paciente_nuevo = false;
      return {
        respuesta: `✅ Beneficiario registrado encontrado:\n👤 *${datos.oim_nombre}*\n📱 Teléfono: ${datos.oim_telefono || 'no registrado'}\n\n¿Los datos actuales son correctos?`,
        paso: 'oim_confirmar', datos, terminar: false,
        botones: [
          { id: 'si', titulo: '✅ Sí, continuar' },
          { id: 'no', titulo: '✏️ Actualizar datos' }
        ]
      };
    } else {
      datos.oim_paciente_id = null;
      datos.oim_paciente_nuevo = true;
      return {
        respuesta: `📝 Nuevo beneficiario OIM. Ingrese el *nombre completo* del paciente:`,
        paso: 'oim_nombre', datos, terminar: false
      };
    }

  } else if (paso === 'oim_confirmar') {
    if (esSi(mensaje)) {
      return {
        respuesta: `🩺 Describa brevemente los *síntomas* o motivo de la teleconsulta:`,
        paso: 'oim_sintomas', datos, terminar: false
      };
    } else {
      return {
        respuesta: `📝 Ingrese el *nombre completo* del beneficiario:`,
        paso: 'oim_nombre', datos, terminar: false
      };
    }

  } else if (paso === 'oim_nombre') {
    datos.oim_nombre = mensaje.trim();
    return {
      respuesta: `🎂 Ingrese la *edad* del beneficiario (años):`,
      paso: 'oim_edad', datos, terminar: false
    };

  } else if (paso === 'oim_edad') {
    datos.oim_edad = mensaje.replace(/\D/g, '').trim();
    return {
      respuesta: `📅 Ingrese la *fecha de nacimiento* (DD/MM/AAAA, ej: 18/06/1992):`,
      paso: 'oim_nacimiento', datos, terminar: false
    };

  } else if (paso === 'oim_nacimiento') {
    datos.oim_nacimiento = mensaje.trim();
    return {
      respuesta: `⚧ *Sexo biológico* del beneficiario:`,
      paso: 'oim_sexo', datos, terminar: false,
      botones: [
        { id: 'masculino', titulo: '👨 Masculino' },
        { id: 'femenino',  titulo: '👩 Femenino'  },
      ]
    };

  } else if (paso === 'oim_sexo') {
    const m = mensaje.trim().toLowerCase();
    datos.oim_sexo = (m === 'femenino' || m === 'f') ? 'F' : 'M';
    return {
      respuesta: `📱 Ingrese el *número de teléfono celular* del beneficiario (donde recibirá el link de la consulta):\n\nEj: 0991234567`,
      paso: 'oim_telefono', datos, terminar: false
    };

  } else if (paso === 'oim_telefono') {
    const tel = mensaje.trim().replace(/\D/g, '');
    if (tel.length < 7) {
      return {
        respuesta: `❌ Número inválido. Ingrese el *teléfono* del beneficiario (ej: 0991234567):`,
        paso: 'oim_telefono', datos, terminar: false
      };
    }
    datos.oim_telefono = tel;
    return {
      respuesta: `📧 Ingrese el *correo electrónico* del beneficiario (escriba *no* si no tiene):`,
      paso: 'oim_correo', datos, terminar: false
    };

  } else if (paso === 'oim_correo') {
    datos.oim_correo = /^no$/i.test(mensaje.trim()) ? '' : mensaje.trim();
    return {
      respuesta: `📍 Ingrese el *lugar de residencia* del beneficiario (ciudad / barrio):`,
      paso: 'oim_residencia', datos, terminar: false
    };

  } else if (paso === 'oim_residencia') {
    datos.oim_residencia = mensaje.trim();
    return {
      respuesta: `🩺 Describa los *síntomas* o motivo de consulta:`,
      paso: 'oim_sintomas', datos, terminar: false
    };

  } else if (paso === 'oim_sintomas') {
    const nivel = clasificarSintomas(mensaje);
    datos.oim_sintomas = mensaje.trim();
    datos.oim_nivel = nivel;

    if (nivel === 3) {
      await alertar(`🚨 <b>EMERGENCIA - OPERADOR OIM</b>\nPaciente: ${datos.oim_nombre}\nDocumento: ${datos.oim_cedula}\nSíntomas: ${mensaje}\nOperador: ${telefono}`);
      return {
        respuesta: `🚨 *EMERGENCIA MÉDICA DETECTADA*\n\nEl paciente presenta síntomas críticos de riesgo vital.\n*Indíquele llamar al 911 de inmediato o trasladarse al hospital más cercano.*\n\n¿Desea registrar otra consulta para otro beneficiario?`,
        paso: 'oim_siguiente', datos, terminar: false,
        botones: [
          { id: 'si', titulo: '✅ Sí, registrar otro' },
          { id: 'no', titulo: '🔚 Terminar sesión' }
        ]
      };
    }

    return {
      respuesta: `📋 *Resumen de Registro OIM:*\n\n👤 *Beneficiario:* ${datos.oim_nombre}\n🪪 *Documento:* ${datos.oim_cedula}\n🎂 *Edad:* ${datos.oim_edad || '—'}\n⚧ *Sexo:* ${datos.oim_sexo || '—'}\n📱 *Teléfono:* ${datos.oim_telefono || '—'}\n📍 *Residencia:* ${datos.oim_residencia || '—'}\n🩺 *Motivo:* ${datos.oim_sintomas}\n🏢 *Cobertura:* OIM (B2B)\n\n¿Confirma el registro y envío de acceso?`,
      paso: 'oim_revisar', datos, terminar: false,
      botones: [
        { id: 'confirmar', titulo: '✅ Confirmar' },
        { id: 'corregir',  titulo: '✏️ Corregir'  }
      ]
    };

  } else if (paso === 'oim_revisar') {
    if (mensaje === 'corregir' || mensaje === '✏️ Corregir') {
      datos.oim_cedula = datos.oim_nombre = datos.oim_edad = datos.oim_nacimiento = datos.oim_sexo = datos.oim_telefono = datos.oim_correo = datos.oim_residencia = datos.oim_sintomas = '';
      datos.oim_paciente_id = null;
      return {
        respuesta: `📋 Ingrese la *cédula o documento* del beneficiario nuevamente:`,
        paso: 'oim_cedula', datos, terminar: false
      };
    }

    let pacienteId = datos.oim_paciente_id;
    const { nombre, apellidos } = separarNombre(datos.oim_nombre);

    if (!pacienteId) {
      const nuevo = await crearPaciente({
        cedula:           datos.oim_cedula,
        nombre,
        apellidos,
        edad:             datos.oim_edad || null,
        fecha_nacimiento: datos.oim_nacimiento || null,
        sexo:             datos.oim_sexo || inferirSexo(datos.oim_nombre),
        correo:           datos.oim_correo || '',
        telefono:         datos.oim_telefono || '',
        lugar_residencia: datos.oim_residencia || '',
        cliente_b2b_id:   empresaId
      });
      pacienteId = nuevo?.id || null;
    }

    // Si está fuera de horario, agendar para apertura
    if (!estaEnHorario()) {
      const prox = proximaApertura();
      const fhDatos = {
        ...datos,
        oim_paciente_id: pacienteId,
        _flujo:         'fuera_horario',
        _pendingOrigen: 'oim_operador',
        _activada_at:   prox.fecha.toISOString(),
        _proximaTexto:  prox.texto
      };
      await guardar(telefono, 0, fhDatos, 'fuera_horario');
      const { respuesta, botones } = mensajeFueraHorario(prox);
      return { respuesta, botones, paso: 0, datos: fhDatos, terminar: false };
    }

    // Crear consulta en base de datos
    const consulta = await crearConsulta({
      paciente_id:          pacienteId,
      nivel_sintomas:       datos.oim_nivel || 1,
      sintomas_descripcion: datos.oim_sintomas,
      estado:               'pendiente'
    });

    // Notificación en panel médico y alerta Telegram
    await crearNotificacion(
      datos.oim_nivel === 2 ? 'urgente' : 'nueva_consulta',
      `📅 Consulta OIM — Asistida`,
      `${datos.oim_nombre} (${datos.oim_cedula}) registrado por operador OIM`,
      pacienteId,
      consulta?.id,
      { origen: 'oim_operador', categoria: nivelACategoria(datos.oim_nivel || 1), etiqueta: 'OIM COBERTURA' }
    );

    await alertar(`📅 <b>NUEVA CONSULTA OIM — OPERADOR</b>\nPaciente: ${datos.oim_nombre}\nDocumento: ${datos.oim_cedula}\nTeléfono Paciente: ${datos.oim_telefono}\nSíntomas: ${datos.oim_sintomas}\nOperador: ${telefono}`);

    // Registrar planillaje B2B si aplica
    try {
      if (empresaId) {
        await registrarPlanillajeB2B({
          cc_paciente_id: pacienteId,
          cc_empresa_id:  empresaId,
          cc_cedula:      datos.oim_cedula,
          cc_nombre:      datos.oim_nombre,
          cc_telefono:    datos.oim_telefono,
          cc_correo:      datos.oim_correo,
          cc_residencia:  datos.oim_residencia
        }, consulta?.id);
      }
    } catch (e) {
      console.error('Error en planillaje OIM:', e.message);
    }

    // NOTIFICACIÓN AUTOMÁTICA AL PACIENTE POR WHATSAPP
    if (datos.oim_telefono) {
      const msgPaciente = `Hola ${datos.oim_nombre}. 🩺 OIM ha coordinado una teleconsulta médica para ti hoy. Un médico de MediLyft te contactará por este medio en breve. Por favor, mantente atento a tu teléfono.`;
      await enviarWhatsApp(datos.oim_telefono, msgPaciente);
    }

    return {
      respuesta: `✅ *¡Consulta OIM agendada con éxito!*\n\nBeneficiario: ${datos.oim_nombre}\nSe ha enviado una notificación automática a su celular: *${datos.oim_telefono}*.\n\n¿Desea registrar otra consulta médica?`,
      paso: 'oim_siguiente', datos, terminar: false,
      botones: [
        { id: 'si', titulo: '✅ Sí, registrar otro' },
        { id: 'no', titulo: '🔚 Terminar sesión' }
      ]
    };

  } else if (paso === 'oim_siguiente') {
    if (esSi(mensaje)) {
      datos.oim_cedula = datos.oim_nombre = datos.oim_edad = datos.oim_nacimiento = datos.oim_sexo = datos.oim_telefono = datos.oim_correo = datos.oim_residencia = datos.oim_sintomas = '';
      datos.oim_paciente_id = null;
      datos.oim_nivel = 1;
      await guardar(telefono, 'oim_cedula', datos, 'oim_operador');
      return {
        respuesta: `📋 *OIM* — Ingrese la *cédula o documento* del siguiente beneficiario:`,
        paso: 'oim_cedula', datos, terminar: false
      };
    } else {
      return {
        respuesta: `👋 Sesión finalizada. Gracias por utilizar el Portal OIM. Escriba *hola* en cualquier momento para iniciar un nuevo registro.`,
        paso: 0, datos, terminar: true
      };
    }
  }

  return { respuesta: '⚠️ Error de flujo. Escriba *hola* para reiniciar.', paso: 0, datos, terminar: true };
}

// Soporte para fuera de horario de OIM
async function confirmarOimFueraHorario(datos, telefono) {
  const empresaId = datos.oim_empresa_id;
  const pacienteId = datos.oim_paciente_id;

  const consulta = await crearConsulta({
    paciente_id:          pacienteId,
    nivel_sintomas:       datos.oim_nivel || 1,
    sintomas_descripcion: datos.oim_sintomas,
    estado:               'pendiente_apertura',
    activada_at:          datos._activada_at || null
  });

  await crearNotificacion(
    datos.oim_nivel === 2 ? 'urgente' : 'nueva_consulta',
    `📅 Consulta OIM — Asistida Fuera de Horario`,
    `${datos.oim_nombre} (${datos.oim_cedula}) — agendada para apertura ${datos._proximaTexto}`,
    pacienteId, consulta?.id,
    { origen: 'oim_operador', categoria: nivelACategoria(datos.oim_nivel || 1), etiqueta: 'OIM COBERTURA' }
  );

  await alertar(`📅 <b>OIM FUERA DE HORARIO — agendada</b>\nPaciente: ${datos.oim_nombre}\nDocumento: ${datos.oim_cedula}\nSíntomas: ${datos.oim_sintomas}\nActiva: ${datos._proximaTexto}\nOperador: ${telefono}`);

  try {
    if (empresaId) {
      await registrarPlanillajeB2B({
        cc_paciente_id: pacienteId,
        cc_empresa_id:  empresaId,
        cc_cedula:      datos.oim_cedula,
        cc_nombre:      datos.oim_nombre,
        cc_telefono:    datos.oim_telefono,
        cc_correo:      datos.oim_correo,
        cc_residencia:  datos.oim_residencia
      }, consulta?.id);
    }
  } catch (e) {
    console.error('Error planillaje OIM:', e.message);
  }

  // Notificar al paciente el horario programado
  if (datos.oim_telefono) {
    await enviarWhatsApp(datos.oim_telefono, `Hola ${datos.oim_nombre}. 🩺 OIM ha programado tu teleconsulta médica para ser atendida ${datos._proximaTexto}. Un médico de MediLyft te contactará por este medio.`);
  }

  await eliminar(telefono);

  return {
    respuesta: `✅ *¡Consulta OIM agendada fuera de horario!*\n\nBeneficiario: ${datos.oim_nombre}\nLa cita se activará ${datos._proximaTexto}.\n\n¿Desea registrar otro beneficiario?`,
    paso: 'oim_siguiente', datos, terminar: false,
    botones: [
      { id: 'si', titulo: '✅ Sí, registrar otro' },
      { id: 'no', titulo: '🔚 Terminar sesión' }
    ]
  };
}

module.exports = { procesarOimOperador, confirmarOimFueraHorario };
