module.exports = {
  SUPABASE_URL:    process.env.SUPABASE_URL,
  SUPABASE_KEY:    process.env.SUPABASE_KEY,
  TELEGRAM_TOKEN:  process.env.TELEGRAM_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  // WhatsApp Business API (Meta Cloud API)
  WA_TOKEN:        process.env.WA_TOKEN,
  WA_PHONE_ID:     process.env.WA_PHONE_ID,
  WA_VERIFY_TOKEN: process.env.WA_VERIFY_TOKEN,
  // Google Gemini (verificación de comprobantes de pago)
  GEMINI_API_KEY:  process.env.GEMINI_API_KEY,
  // Números autorizados (formato tal cual lo manda Meta, ej. 593987654321) para
  // saltarse el comprobante de pago escribiendo "DEMOTEST" — solo para demos
  // controladas, nunca vacío por accidente en producción real de clientes.
  DEMO_PHONE_NUMBERS: (process.env.DEMO_PHONE_NUMBERS || '')
    .split(',').map(s => s.replace(/\D/g, '')).filter(Boolean),
};
