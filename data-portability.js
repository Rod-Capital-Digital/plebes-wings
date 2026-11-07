// Funciones puras: nunca escriben en el navegador ni en Supabase.
export const LOCAL_KEY = 'plebes-wings-piloto-v1';
export const COLLECTIONS = ['products','sales','deliveries','purchases','waste','expenses','closings','tasks','docs'];

export function previewLegacyImport(text, current) {
  if (text.length > 10 * 1024 * 1024) throw Error('El archivo supera 10 MB.');
  const parsed = JSON.parse(text);
  const candidate = parsed?.format === 'pw-local-export-v2' ? parsed.records : parsed;
  if (!candidate || candidate.version !== 1) throw Error('Versión incompatible.');
  if (!candidate.openingStock || typeof candidate.openingStock !== 'object' || Array.isArray(candidate.openingStock)) throw Error('Inventario inicial inválido.');
  const rows = COLLECTIONS.map(key => {
    if (!Array.isArray(candidate[key])) throw Error('Falta la colección ' + key);
    const known = new Set((current[key] || []).map(row => row.id));
    const seen = new Set();
    let duplicates = 0;
    for (const row of candidate[key]) {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id.trim()) throw Error('Registro sin identificador válido en ' + key);
      if (seen.has(row.id)) throw Error('Identificador repetido en el archivo: ' + key);
      seen.add(row.id);
      if (known.has(row.id)) duplicates++;
    }
    return { module: key, count: candidate[key].length, duplicates, newRecords: candidate[key].length - duplicates };
  });
  return rows;
}

export function localExport(raw, exportedAt = new Date().toISOString()) {
  // Se conserva el contenido original, incluso si está dañado.
  let records = null;
  try { records = raw === null ? null : JSON.parse(raw); } catch { /* raw conserva los bytes originales */ }
  return { format: 'pw-local-export-v2', exportedAt, origin: 'localStorage', key: LOCAL_KEY,
    scope: 'Solo historial de este navegador; no es un respaldo integral de Supabase.', records, raw };
}
