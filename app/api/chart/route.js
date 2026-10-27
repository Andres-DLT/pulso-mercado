import { getChart, RANGES } from '@/lib/market';
import { json, fail, parseSymbol } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const symbol = parseSymbol(sp.get('symbol'));
  const r = RANGES[sp.get('range')] ?? RANGES['1D'];
  if (!symbol) return json({ error: 'Símbolo inválido' }, { status: 400 });
  try {
    return json(await getChart(symbol, r.range, r.interval));
  } catch (e) {
    return fail(e);
  }
}
