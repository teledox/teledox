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
};
