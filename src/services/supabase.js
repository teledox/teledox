const { SUPABASE_URL, SUPABASE_KEY } = require('../config');

async function query(method, table, body, params = '', prefer = null) {
  if (!SUPABASE_URL || !SUPABASE_URL.startsWith('http')) {
    console.error(`[Supabase] SUPABASE_URL is invalid: "${SUPABASE_URL}"`);
    throw new Error(`SUPABASE_URL no configurada o inválida`);
  }
  const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
  const defaultPrefer = method === 'POST' ? 'return=representation' : '';
  const res = await fetch(url, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': prefer != null ? prefer : defaultPrefer
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    console.error(`[Supabase] ${method} ${table}: ${text}`);
    throw new Error(`Supabase ${method} ${table}: ${data?.message || `HTTP ${res.status}`}`);
  }
  return data;
}

module.exports = { query };
