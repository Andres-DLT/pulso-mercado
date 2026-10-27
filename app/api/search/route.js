import { search } from '@/lib/market';
import { json, fail } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 40);
  if (q.length < 1) return json({ results: [] });
  try {
    return json({ results: await search(q) }, { maxAge: 3600 });
  } catch (e) {
    return fail(e);
  }
}
