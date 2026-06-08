function validarCedula(cedula) {
  // Limpiar espacios, guiones y cualquier caracter no numérico que WhatsApp pueda agregar
  const limpia = String(cedula || '').replace(/\D/g, '').trim();
  if (limpia.length !== 10) return { valida: false, error: 'Debe tener exactamente 10 dígitos numéricos.' };

  // Código de provincia (01–24, o 30 para casos especiales)
  const provincia = parseInt(limpia.slice(0, 2), 10);
  if (provincia < 1 || (provincia > 24 && provincia !== 30)) {
    return { valida: false, error: 'El código de provincia (primeros 2 dígitos) no es válido.' };
  }

  // Tercer dígito: 0–5 para cédulas de personas naturales
  if (parseInt(limpia[2], 10) > 5) {
    return { valida: false, error: 'La cédula ingresada no es válida.' };
  }

  // Dígito verificador — algoritmo módulo 10
  const coef = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let prod = parseInt(limpia[i], 10) * coef[i];
    if (prod > 9) prod -= 9;
    suma += prod;
  }
  const verificador = (10 - (suma % 10)) % 10;
  if (verificador !== parseInt(limpia[9], 10)) {
    return { valida: false, error: 'La cédula ingresada no es válida. Verifique los dígitos.' };
  }

  return { valida: true, cedula: limpia, error: null };
}

function clasificarSintomas(texto) {
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const graves = ['dolor de pecho','presion en el pecho','opresion en el pecho','no puedo respirar','dificultad para respirar','dificultad respiratoria','no respiro','me ahogo','perdida de conciencia','perdi el conocimiento','convulsion','convulsiones','paralisis','no puedo mover','sangrado incontrolable','hemorragia','infarto','ataque al corazon','derrame cerebral','stroke','labios morados','piel azul','vomito con sangre','heces con sangre','dolor abdominal insoportable'];
  const medios = ['fiebre alta','fiebre de 39','fiebre de 40','vomito repetitivo','vomitos frecuentes','diarrea con sangre','diarrea severa','dolor abdominal fuerte','desmayo leve','mareo intenso','herida infectada','dificultad respirar leve','palpitaciones','presion 160','presion 170','glucosa 300','hipoglucemia','reaccion alergica fuerte','fractura','hueso roto','sangrado moderado'];
  if (graves.some(s => t.includes(s))) return 3;
  if (medios.some(s => t.includes(s))) return 2;
  return 1;
}

function esSi(texto) {
  return /^(s[ií]|yes|1|ok|continuar|acepto|autorizo|confirmar|confirm)$/i.test(texto.trim());
}

function tieneApellidos(texto) {
  return texto.trim().split(/\s+/).length >= 3;
}

module.exports = { validarCedula, clasificarSintomas, esSi, tieneApellidos };
