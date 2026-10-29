import { pushConfigured, checkAlerts } from '@/lib/push';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo llama el programador (Vercel Cron o cron-job.org) con "Authorization: Bearer CRON_SECRET".
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!pushConfigured()) return json({ error: 'Avisos push no configurados' }, { status: 503 });
  try {
    return json({ ok: true, ...(await checkAlerts()), at: Date.now() });
  } catch (e) {
    return json({ error: e.message }, { status: 502 });
  }
}
