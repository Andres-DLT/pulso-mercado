import { getChart, mapLimit, withLiveBar, UNIVERSE } from '@/lib/market';
import { analyze } from '@/lib/analysis';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

let last = null;
const TTL = 10 * 60_000;

async function scanOne(symbol) {
  const { meta, candles: raw } = await getChart(symbol, '2y', '1d');
  const candles = withLiveBar(meta, raw);
  const a = analyze(candles);
  const f20 = a.forecast.horizons.find((h) => h.days === 20);
  return {
    symbol,
    name: meta.name,
    type: meta.type,
    currency: meta.currency,
    price: a.price,
    score: a.score,
    label: a.label,
    rsi: a.indicators.rsi,
    returns: a.returns,
    expectedReturn20: f20.expectedReturn,
    probUp20: f20.probUp,
    low20: f20.low,
    high20: f20.high,
    annualVol: a.forecast.annualVol,
    accuracy: a.backtest?.accuracy ?? null,
    bullHitRate: a.backtest?.bullish.hitRate ?? null,
    baselineUpRate: a.backtest?.baselineUpRate ?? null,
    dayChange: candles.length > 1 ? a.price / candles.at(-2).close - 1 : 0,
    spark: candles.slice(-60).map((c) => c.close),
  };
}

export async function GET() {
  if (!last || Date.now() - last.at > TTL) {
    const rows = (await mapLimit(UNIVERSE, 6, scanOne)).filter((r) => r && !r.error);
    last = { at: Date.now(), rows };
  }
  return json(last, { maxAge: 300 });
}
