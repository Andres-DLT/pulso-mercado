// Capa de datos de mercado: Yahoo Finance (endpoints públicos v8/v1) con caché en memoria.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

const cache = new Map();

async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return v;
}

async function yahooJson(path) {
  let lastErr;
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 404) throw Object.assign(new Error('Símbolo no encontrado'), { notFound: true });
      if (!res.ok) throw new Error(`Yahoo respondió ${res.status}`);
      return await res.json();
    } catch (e) {
      if (e.notFound) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

export const SYMBOL_RE = /^[A-Za-z0-9.\-=^]{1,20}$/;

const TTL = { '1m': 10_000, '2m': 15_000, '5m': 20_000, '15m': 60_000, '30m': 60_000, '1h': 120_000, '1d': 300_000, '1wk': 900_000 };

export async function getChart(symbol, range = '1d', interval = '1m') {
  const key = `${symbol}|${range}|${interval}`;
  return cached(key, TTL[interval] ?? 60_000, async () => {
    const json = await yahooJson(
      `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplit`
    );
    const r = json?.chart?.result?.[0];
    if (!r) throw Object.assign(new Error(json?.chart?.error?.description || 'Sin datos'), { notFound: true });
    const q = r.indicators?.quote?.[0] ?? {};
    const ts = r.timestamp ?? [];
    const candles = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
    }
    const m = r.meta ?? {};
    return {
      meta: {
        symbol: m.symbol,
        name: m.longName || m.shortName || m.symbol,
        currency: m.currency,
        exchange: m.fullExchangeName || m.exchangeName,
        type: m.instrumentType,
        price: m.regularMarketPrice,
        previousClose: m.previousClose ?? m.chartPreviousClose,
        dayHigh: m.regularMarketDayHigh,
        dayLow: m.regularMarketDayLow,
        volume: m.regularMarketVolume,
        high52: m.fiftyTwoWeekHigh,
        low52: m.fiftyTwoWeekLow,
        marketTime: m.regularMarketTime,
        gmtoffset: m.gmtoffset ?? 0,
        timezone: m.exchangeTimezoneName,
        marketState: marketState(m),
      },
      candles,
    };
  });
}

function marketState(m) {
  const p = m.currentTradingPeriod?.regular;
  if (m.instrumentType === 'CRYPTOCURRENCY') return 'OPEN';
  if (!p) return 'UNKNOWN';
  const now = Date.now() / 1000;
  return now >= p.start && now < p.end ? 'OPEN' : 'CLOSED';
}

export async function getQuote(symbol) {
  const { meta, candles } = await getChart(symbol, '1d', '5m');
  const price = meta.price ?? candles.at(-1)?.close;
  const prev = meta.previousClose;
  return {
    ...meta,
    price,
    change: prev ? price - prev : 0,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    spark: candles.map((c) => c.close),
  };
}

export async function search(q) {
  return cached(`search|${q.toLowerCase()}`, 3_600_000, async () => {
    const json = await yahooJson(
      `/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`
    );
    return (json.quotes ?? [])
      .filter((x) => x.symbol && x.isYahooFinance !== false)
      .map((x) => ({
        symbol: x.symbol,
        name: x.longname || x.shortname || x.symbol,
        exchange: x.exchDisp || x.exchange,
        type: x.typeDisp || x.quoteType,
      }));
  });
}

// Ejecuta tareas asíncronas con un límite de concurrencia.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]);
      } catch (e) {
        out[idx] = { error: e.message, symbol: items[idx] };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

// Rangos de UI → parámetros de Yahoo.
export const RANGES = {
  '1D': { range: '1d', interval: '1m' },
  '5D': { range: '5d', interval: '5m' },
  '1M': { range: '1mo', interval: '30m' },
  '6M': { range: '6mo', interval: '1d' },
  '1A': { range: '1y', interval: '1d' },
  '5A': { range: '5y', interval: '1wk' },
};

export const UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'AMD', 'NFLX',
  'ORCL', 'CRM', 'ADBE', 'PLTR', 'INTC', 'JPM', 'V', 'MA', 'BAC', 'UNH',
  'LLY', 'JNJ', 'XOM', 'CVX', 'COST', 'WMT', 'KO', 'PEP', 'DIS', 'BA',
  'SPY', 'QQQ', 'IWM', 'GLD', 'BTC-USD', 'ETH-USD',
];

// Las series diarias de Yahoo a veces no incluyen aún la sesión actual: la completamos con la cotización.
export function withLiveBar(meta, candles) {
  const last = candles.at(-1);
  if (!last || meta.price == null || !meta.marketTime) return candles;
  const day = (t) => Math.floor((t + (meta.gmtoffset || 0)) / 86400);
  const out = candles.slice();
  if (day(meta.marketTime) === day(last.time)) {
    out[out.length - 1] = { ...last, close: meta.price, high: Math.max(last.high, meta.price), low: Math.min(last.low, meta.price) };
  } else if (meta.marketTime > last.time) {
    out.push({
      time: meta.marketTime,
      open: last.close,
      high: Math.max(meta.dayHigh ?? meta.price, meta.price),
      low: Math.min(meta.dayLow ?? meta.price, meta.price),
      close: meta.price,
      volume: meta.volume ?? 0,
    });
  }
  return out;
}
