import { getChart, withLiveBar } from '@/lib/market';
import { analyze } from '@/lib/analysis';
import { json, fail, parseSymbol } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const symbol = parseSymbol(new URL(req.url).searchParams.get('symbol'));
  if (!symbol) return json({ error: 'Símbolo inválido' }, { status: 400 });
  try {
    const { meta, candles: raw } = await getChart(symbol, '2y', '1d');
    const candles = withLiveBar(meta, raw);
    const result = analyze(candles);
    const history = candles.slice(-120).map((c) => ({ time: c.time, close: c.close }));
    return json({ meta, ...result, history }, { maxAge: 60 });
  } catch (e) {
    return fail(e);
  }
}
