// REPL interactivo para testear los flujos del bot localmente.
//
// Uso:
//   node --env-file=.env.local scripts/test-bot/repl.js [telefono] [nombre]
//
// Comandos especiales:
//   /boton <id>     simula tap en un botón con ese id
//   /lista <id>     simula selección de un item de lista con ese id
//   /media          simula envío de imagen/adjunto
//   /tel <numero>   cambia el número de teléfono de la sesión de prueba
//   /nombre <texto> cambia el nombre de WhatsApp del contacto
//   /reset          envía "hola" (el bot reinicia la sesión)
//   /salir          termina
//
// Cualquier otra línea se envía como mensaje de texto.
// Cada interacción queda registrada en scripts/test-bot/transcripts/<numero>.md

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { server, mock, PORT, ready } = require('./server');

let telefono = process.argv[2] || '593900000001';
let nombre = process.argv[3] || 'Tester';

const transcriptsDir = path.join(__dirname, 'transcripts');
fs.mkdirSync(transcriptsDir, { recursive: true });
let transcriptPath = path.join(transcriptsDir, `${telefono}.md`);

function appendTranscript(line) {
  fs.appendFileSync(transcriptPath, line + '\n');
}

function buildPayload(message) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name: nombre } }],
          messages: [{ from: telefono, ...message }],
        },
      }],
    }],
  };
}

async function enviarAlBot(message, etiquetaUsuario) {
  appendTranscript(`\n**👤 ${nombre} (${telefono}):** ${etiquetaUsuario}`);
  console.log(`👤 → ${etiquetaUsuario}`);

  await fetch(`http://localhost:${PORT}/api/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(message)),
  });

  const respuestas = mock.popLog();
  if (respuestas.length === 0) {
    console.log('🤖 (sin respuesta)');
    appendTranscript('**🤖 Bot:** _(sin respuesta)_');
  }
  for (const r of respuestas) {
    if (r.tipo === 'texto') {
      console.log(`🤖 ${r.texto}`);
      appendTranscript(`**🤖 Bot:**\n${r.texto}`);
    } else if (r.tipo === 'botones') {
      console.log(`🤖 ${r.texto}`);
      const lineas = r.botones.map((b) => `   [${b.titulo}] (id: ${b.id})`);
      lineas.forEach((l) => console.log(l));
      appendTranscript(`**🤖 Bot:**\n${r.texto}\n\nBotones:\n${lineas.map((l) => `- ${l.trim()}`).join('\n')}`);
    } else if (r.tipo === 'lista') {
      console.log(`🤖 ${r.texto}`);
      const filas = [];
      r.secciones.forEach((s) => {
        console.log(`   -- ${s.titulo} --`);
        s.filas.forEach((f) => {
          const linea = `${f.titulo} (id: ${f.id})${f.descripcion ? ' — ' + f.descripcion : ''}`;
          console.log(`   [${linea}]`);
          filas.push(`  - **${s.titulo}**: ${linea}`);
        });
      });
      appendTranscript(`**🤖 Bot:**\n${r.texto}\n\nLista:\n${filas.join('\n')}`);
    }
  }
}

function imprimirAyuda() {
  console.log(`
Comandos:
  /boton <id>     simula tap en botón con ese id
  /lista <id>     simula selección de item de lista con ese id
  /media          simula envío de imagen/adjunto
  /tel <numero>   cambia número de teléfono de prueba (nueva sesión)
  /nombre <texto> cambia nombre de WhatsApp
  /reset          envía "hola" (reinicia sesión)
  /salir          termina
  Cualquier otro texto -> mensaje de texto normal
`);
}

console.log(`Servidor de pruebas en http://localhost:${PORT}/api/webhook (mock de WhatsApp activo)`);
console.log(`Sesión de prueba: ${telefono} (${nombre}) — transcript en ${path.relative(process.cwd(), transcriptPath)}`);
imprimirAyuda();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
rl.prompt();

let salir = false;

async function processLine(input) {
  try {
    if (input === '/salir' || input === '/exit') {
      salir = true;
    } else if (input === '/help' || input === '/ayuda') {
      imprimirAyuda();
    } else if (input.startsWith('/boton ')) {
      const id = input.slice(7).trim();
      await enviarAlBot({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: id } } }, `[botón] ${id}`);
    } else if (input.startsWith('/lista ')) {
      const id = input.slice(7).trim();
      await enviarAlBot({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id, title: id } } }, `[lista] ${id}`);
    } else if (input === '/media') {
      await enviarAlBot({ type: 'image', image: {} }, '[imagen adjunta]');
    } else if (input.startsWith('/tel ')) {
      telefono = input.slice(5).trim();
      transcriptPath = path.join(transcriptsDir, `${telefono}.md`);
      console.log(`Número de prueba cambiado a ${telefono}`);
    } else if (input.startsWith('/nombre ')) {
      nombre = input.slice(8).trim();
      console.log(`Nombre de WhatsApp cambiado a "${nombre}"`);
    } else if (input === '/reset') {
      await enviarAlBot({ type: 'text', text: { body: 'hola' } }, 'hola');
    } else if (input === '') {
      // ignorar líneas vacías
    } else {
      await enviarAlBot({ type: 'text', text: { body: input } }, input);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

// readline emite 'line' sin esperar handlers async, así que encolamos
// el procesamiento para mantener el orden de los mensajes.
let queue = ready;

rl.on('line', (line) => {
  queue = queue.then(async () => {
    if (salir) return;
    await processLine(line.trim());
    if (salir) {
      rl.close();
    } else {
      rl.prompt();
    }
  });
});

rl.on('close', () => {
  queue.then(() => {
    console.log('Cerrando...');
    server.close(() => process.exit(0));
  });
});
