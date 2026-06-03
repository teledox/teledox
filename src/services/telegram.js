const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = require('../config');

async function alertar(mensaje) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: mensaje, parse_mode: 'HTML' })
    });
  } catch (e) {
    console.error('Error Telegram:', e.message);
  }
}

module.exports = { alertar };
