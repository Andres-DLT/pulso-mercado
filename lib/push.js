// Alertas en el servidor: guarda las suscripciones push del navegador con sus alertas y, cuando
// el programador llama a checkAlerts(), envía una notificación por cada alerta que se cumpla.
// pulso:subs            conjunto de ids de suscripción
// pulso:sub:{id}        { subscription, alerts, updatedAt } (lo escribe solo el navegador)
// pulso:fired:{id}      hash alertId → { at, price } (lo escribe solo el comprobador)
import webpush from 'web-push';
import { createHash } from 'node:crypto';
import { redis, pipeline, storeConfigured } from './store.js';
import { getQuote, mapLimit, SYMBOL_RE } from './market.js';
import { fmtPrice } from './format.js';

const PUB = process.env.VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'https://pulso-mercado.vercel.app';
const SUBS = 'pulso:subs';
const subKey = (id) => `pulso:sub:${id}`;
const firedKey = (id) => `pulso:fired:${id}`;

export const pushConfigured = () => Boolean(PUB && PRIV && storeConfigured());
export const publicKey = () => PUB;
export const subId = (endpoint) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

let vapidSet = false;
function initVapid() {
  if (!vapidSet) webpush.setVapidDetails(SUBJECT, PUB, PRIV);
  vapidSet = true;
}

export function validSubscription(s) {
  return (
    typeof s?.endpoint === 'string' && s.endpoint.startsWith('https://') && s.endpoint.length < 1000 &&
    typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string'
  );
}

function cleanAlerts(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => typeof a?.id === 'string' && a.id.length <= 64 && SYMBOL_RE.test(a.symbol || '') &&
      (a.op === 'above' || a.op === 'below') && Number.isFinite(a.price) && a.price > 0)
    .slice(0, 100)
    .map((a) => ({
      id: a.id,
      symbol: a.symbol.toUpperCase(),
      op: a.op,
      price: a.price,
      currency: typeof a.currency === 'string' ? a.currency.slice(0, 5) : 'USD',
      triggered: Boolean(a.triggered),
      rearmedAt: Number(a.rearmedAt) || 0,
    }));
}

function parseFired(flat) {
  const out = {};
  for (let i = 0; i + 1 < (flat?.length ?? 0); i += 2) {
    try { out[flat[i]] = JSON.parse(flat[i + 1]); } catch {}
  }
  return out;
}

// Una alerta disparada en el servidor después de su último rearme cuenta como disparada.
const firedSince = (a, fired) => (fired[a.id] && fired[a.id].at > a.rearmedAt ? fired[a.id] : null);

// Guarda las alertas del navegador y devuelve las que el servidor ya disparó, para marcarlas allí.
export async function syncSubscription(subscription, alerts) {
  const id = subId(subscription.endpoint);
  const clean = cleanAlerts(alerts);
  const [, , firedFlat] = await pipeline([
    ['SET', subKey(id), JSON.stringify({ subscription, alerts: clean, updatedAt: Date.now() })],
    ['SADD', SUBS, id],
    ['HGETALL', firedKey(id)],
  ]);
  const fired = parseFired(firedFlat);
  const live = new Set(clean.map((a) => a.id));
  const stale = Object.keys(fired).filter((k) => !live.has(k));
  if (stale.length) await redis('HDEL', firedKey(id), ...stale);
  return clean
    .map((a) => ({ id: a.id, fired: !a.triggered && firedSince(a, fired) }))
    .filter((x) => x.fired)
    .map((x) => ({ id: x.id, triggeredAt: x.fired.at, triggeredPrice: x.fired.price }));
}

export async function removeSubscription(endpoint) {
  const id = subId(endpoint);
  await pipeline([['DEL', subKey(id)], ['DEL', firedKey(id)], ['SREM', SUBS, id]]);
}

export async function checkAlerts() {
  initVapid();
  const ids = (await redis('SMEMBERS', SUBS)) ?? [];
  if (!ids.length) return { subscriptions: 0, symbols: 0, sent: 0 };
  const [raw, ...firedRaw] = await pipeline([['MGET', ...ids.map(subKey)], ...ids.map((id) => ['HGETALL', firedKey(id)])]);

  const recs = ids.map((id, i) => {
    let rec = null;
    try { rec = raw[i] ? JSON.parse(raw[i]) : null; } catch {}
    const fired = parseFired(firedRaw[i]);
    const pending = rec ? rec.alerts.filter((a) => !a.triggered && !firedSince(a, fired)) : [];
    return { id, rec, pending };
  });

  const symbols = [...new Set(recs.flatMap((r) => r.pending.map((a) => a.symbol)))];
  const quotes = {};
  for (const q of await mapLimit(symbols, 8, getQuote)) {
    // Con datos en caché (fuente caída) no se avisa: podría ser un precio viejo.
    if (q && !q.error && q.price != null && !q.stale) quotes[q.symbol] = q;
  }

  const cmds = [];
  let sent = 0;
  for (const { id, rec, pending } of recs) {
    if (!rec) { cmds.push(['SREM', SUBS, id]); continue; }
    const hits = pending.filter((a) => {
      const q = quotes[a.symbol];
      return q && (a.op === 'above' ? q.price >= a.price : q.price <= a.price);
    });
    let gone = false;
    for (const a of hits) {
      const q = quotes[a.symbol];
      const body = `${a.symbol} ${a.op === 'above' ? 'superó' : 'cayó a'} ${fmtPrice(a.price, a.currency)} (ahora ${fmtPrice(q.price, a.currency)})`;
      try {
        await webpush.sendNotification(
          rec.subscription,
          JSON.stringify({ title: 'Alerta de precio · Pulso', body, url: `/?s=${encodeURIComponent(a.symbol)}`, tag: a.id }),
          { TTL: 6 * 3600, urgency: 'high' }
        );
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { gone = true; break; }
        continue;
      }
      cmds.push(['HSET', firedKey(id), a.id, JSON.stringify({ at: Date.now(), price: q.price })]);
    }
    if (gone) cmds.push(['DEL', subKey(id)], ['DEL', firedKey(id)], ['SREM', SUBS, id]);
  }
  await pipeline(cmds);
  return { subscriptions: ids.length, symbols: symbols.length, sent };
}
