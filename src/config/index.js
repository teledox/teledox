module.exports = {
  // Strip accidental quotes/trailing slashes from env vars (Vercel dashboard can add them)
  SUPABASE_URL:    (process.env.SUPABASE_URL || '').replace(/^["']|["']$/g, '').replace(/\/+$/, ''),
  SUPABASE_KEY:    (process.env.SUPABASE_KEY || '').replace(/^["']|["']$/g, ''),
  TELEGRAM_TOKEN:  (process.env.TELEGRAM_TOKEN || '').replace(/^["']|["']$/g, ''),
  TELEGRAM_CHAT_ID: (process.env.TELEGRAM_CHAT_ID || '').replace(/^["']|["']$/g, ''),
  // WhatsApp Business API (Meta Cloud API)
  WA_TOKEN:        (process.env.WA_TOKEN || '').replace(/^["']|["']$/g, ''),
  WA_PHONE_ID:     (process.env.WA_PHONE_ID || '').replace(/^["']|["']$/g, ''),
  WA_VERIFY_TOKEN: (process.env.WA_VERIFY_TOKEN || '').replace(/^["']|["']$/g, ''),
  // Google Gemini
  GEMINI_API_KEY:  (process.env.GEMINI_API_KEY || '').replace(/^["']|["']$/g, ''),
  // Números autorizados (formato tal cual lo manda Meta, ej. 593987654321) para
  // saltarse el comprobante de pago escribiendo "DEMOTEST" — solo para demos
  // controladas, nunca vacío por accidente en producción real de clientes.
  DEMO_PHONE_NUMBERS: (process.env.DEMO_PHONE_NUMBERS || '')
    .split(',').map(s => s.replace(/\D/g, '')).filter(Boolean),
};
