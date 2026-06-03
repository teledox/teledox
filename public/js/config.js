const SUPA_URL = 'https://kcoopkkvbkgrnkpksiuh.supabase.co';
const SUPA_KEY = 'sb_publishable_cxK_dgG5vRrJQynj06G-Bg_MrZotk6D';

const supabaseClient = supabase.createClient(SUPA_URL, SUPA_KEY);

// Estado global compartido
let currentUser = null;
let pacientesData = [];
let notifInterval = null;
let lastNotifCount = 0;
let currentConsultaId = null;
let currentPacienteId = null;
let firmaData = { firma: null, sello: null };
let medicamentosData = [];
let recetaConsultaId = null;
let recetaPacienteId = null;
let cie10Seleccionados = [];
let plantillaSeleccionada = null;
let currentPacienteData = null;
let currentConsultaData = null;

async function supa(method, table, body, query = '') {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const token = session?.access_token || SUPA_KEY;
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 204) return null;
  return r.json();
}
