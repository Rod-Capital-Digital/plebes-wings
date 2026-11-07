// Cliente de solo lectura/autenticación para un sitio estático.
// La importación se retrasa hasta que exista configuración, por lo que el
// prototipo local funciona sin depender de una conexión externa.
export const SUPABASE_JS_VERSION = '2.119.0';
const SUPABASE_ESM_URL = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SUPABASE_JS_VERSION}/+esm`;

let clientPromise = null;

function configuration() {
  const config = globalThis.PW_SUPABASE_CONFIG || {};
  const url = String(config.url || '').trim();
  const publishableKey = String(config.publishableKey || '').trim();
  return { url, publishableKey };
}

export function getSupabaseConfigurationStatus() {
  const { url, publishableKey } = configuration();
  const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);
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
