function validarCedula(cedula) {
  if (!/^\d{10}$/.test(cedula)) return { valida: false, error: 'Debe tener 10 dígitos.' };
  const provincia = parseInt(cedula.substring(0, 2));
  if ((provincia < 1 || provincia > 24) && provincia !== 30)
    return { valida: false, error: 'Código de provincia inválido.' };
  if (parseInt(cedula[2]) >= 6)
    return { valida: false, error: 'Tercer dígito inválido.' };
  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let r = parseInt(cedula[i]) * coeficientes[i];
    if (r >= 10) r -= 9;
    suma += r;
  }
  const residuo = suma % 10;
  const digitoCalculado = residuo === 0 ? 0 : 10 - residuo;
  if (digitoCalculado !== parseInt(cedula[9]))
    return { valida: false, error: 'Cédula inválida (dígito verificador).' };
  return { valida: true, error: null };
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
