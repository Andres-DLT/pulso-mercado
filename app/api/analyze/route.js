import { getChart, getNews, withLiveBar } from '@/lib/market';
import { analyze, BENCHMARK } from '@/lib/analysis';
import { newsSentiment } from '@/lib/sentiment';
import { json, fail, parseSymbol } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const symbol = parseSymbol(new URL(req.url).searchParams.get('symbol'));
  if (!symbol) return json({ error: 'Símbolo inválido' }, { status: 400 });
  try {
    // El índice de referencia y las noticias son opcionales: si fallan, el análisis sigue sin ellos.
    const [chart, bench, news] = await Promise.all([
      getChart(symbol, '2y', '1d'),
      symbol === BENCHMARK ? null : getChart(BENCHMARK, '2y', '1d').catch(() => null),
      getNews(symbol).catch(() => []),
    ]);
    const candles = withLiveBar(chart.meta, chart.candles);
    const result = analyze(candles, { benchmark: bench?.candles, news });
    const history = candles.slice(-120).map((c) => ({ time: c.time, close: c.close }));
    return json(
      { meta: chart.meta, ...result, history, news: newsSentiment(news).items, stale: chart.stale || undefined },
      { maxAge: 60 }
    );
  } catch (e) {
    return fail(e);
  }
}
