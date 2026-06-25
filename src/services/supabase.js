const { SUPABASE_URL, SUPABASE_KEY } = require('../config');

async function query(method, table, body, params = '', prefer = null) {
  const defaultPrefer = method === 'POST' ? 'return=representation' : '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
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
  const data = await res.json();
  if (!res.ok) {
    console.error(`[Supabase] ${method} ${table}: ${JSON.stringify(data)}`);
    throw new Error(`Supabase ${method} ${table}: ${data?.message || `HTTP ${res.status}`}`);
  }
  return data;
}

module.exports = { query };
