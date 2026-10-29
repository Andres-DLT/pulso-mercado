import { pushConfigured, syncSubscription, removeSubscription, validSubscription } from '@/lib/push';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

async function body(req) {
  const text = await req.text();
  if (text.length > 64_000) throw new Error('Petición demasiado grande');
  return JSON.parse(text || '{}');
}

// El navegador envía su suscripción push y sus alertas; recibe las que el servidor ya disparó.
export async function POST(req) {
  if (!pushConfigured()) return json({ error: 'Avisos push no configurados' }, { status: 503 });
  try {
    const { subscription, alerts } = await body(req);
    if (!validSubscription(subscription)) return json({ error: 'Suscripción inválida' }, { status: 400 });
    return json({ fired: await syncSubscription(subscription, alerts) });
  } catch (e) {
    return json({ error: e.message }, { status: 502 });
  }
}

export async function DELETE(req) {
  if (!pushConfigured()) return json({ ok: true });
  try {
    const { endpoint } = await body(req);
    if (typeof endpoint !== 'string') return json({ error: 'endpoint requerido' }, { status: 400 });
    await removeSubscription(endpoint);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, { status: 502 });
  }
}
