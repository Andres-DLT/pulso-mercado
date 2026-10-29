import { getChart, mapLimit, withLiveBar } from '@/lib/market';
import { json, parseSymbol } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Cierres diarios de varios símbolos desde una fecha (para la evolución de la cartera).
export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const symbols = [...new Set((params.get('symbols') || '').split(',').map(parseSymbol).filter(Boolean))].slice(0, 25);
  const from = Number(params.get('from')) || 0;
  if (!symbols.length) return json({ error: 'Parámetro symbols requerido' }, { status: 400 });
  const years = (Date.now() / 1000 - from) / (365 * 86400);
  const range = years <= 1 ? '1y' : years <= 2 ? '2y' : years <= 5 ? '5y' : '10y';
  const rows = await mapLimit(symbols, 6, async (s) => {
    const { meta, candles } = await getChart(s, range, '1d');
    return { symbol: s, currency: meta.currency, series: withLiveBar(meta, candles).map((c) => ({ time: c.time, close: c.close })) };
  });
  const series = {}, currency = {};
  for (const r of rows) {
    if (!r || r.error) continue;
    const start = from - 7 * 86400;
    series[r.symbol] = r.series.filter((c) => c.time >= start);
    currency[r.symbol] = r.currency;
  }
  return json({ series, currency, at: Date.now() }, { maxAge: 120 });
}
