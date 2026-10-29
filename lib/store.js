// Cliente mínimo de Upstash Redis por REST (sin dependencias). Acepta las variables que crea
// la integración de Vercel (KV_REST_API_*) o las de Upstash directamente (UPSTASH_REDIS_REST_*).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeConfigured = () => Boolean(URL_ && TOKEN);

async function call(path, body) {
  const res = await fetch(`${URL_}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Redis respondió ${res.status}`);
  return data;
}

export async function redis(...args) {
  const { result, error } = await call('', args);
  if (error) throw new Error(error);
  return result;
}

export async function pipeline(cmds) {
  if (!cmds.length) return [];
  const out = await call('/pipeline', cmds);
  return out.map((r) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}
