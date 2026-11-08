// Cliente autenticado para catálogo de un sitio estático.
// Sin configuración o conexión no se habilita acceso administrativo.
export const SUPABASE_JS_VERSION = '2.119.0';
const SUPABASE_ESM_URL = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SUPABASE_JS_VERSION}/+esm`;
const EXPECTED_SUPABASE_URL = 'https://rilrfcmmylldftioapnc.supabase.co';

let clientPromise = null;

function configuration() {
  const config = globalThis.PW_SUPABASE_CONFIG || {};
  const url = String(config.url || '').trim();
  const publishableKey = String(config.publishableKey || '').trim();
  return { url, publishableKey };
}

export function getSupabaseConfigurationStatus() {
  const { url, publishableKey } = configuration();
  const validUrl = url === EXPECTED_SUPABASE_URL;
  const validKey = publishableKey.startsWith('sb_publishable_');
  return { configured: validUrl && validKey, validUrl, validKey };
}

export async function getSupabaseClient() {
  const { configured } = getSupabaseConfigurationStatus();
  if (!configured) throw new Error('Falta la configuración pública de Supabase.');
  if (!clientPromise) {
    clientPromise = import(SUPABASE_ESM_URL).then(({ createClient }) => {
      const { url, publishableKey } = configuration();
      return createClient(url, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }).catch(error => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}
