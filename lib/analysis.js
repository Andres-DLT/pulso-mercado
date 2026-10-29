// Motor de análisis: puntuación técnica compuesta, pronóstico probabilístico y backtest.
// Todo se calcula sobre velas diarias. Es un modelo estadístico, no una garantía.
import { sma, rsi, macd, bollinger, atr, stochastic, adx, obv, stdev, normCdf } from './indicators.js';
import { newsSentiment } from './sentiment.js';

const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

export const HORIZONS = [5, 20, 60];
export const BENCHMARK = 'SPY';

// Cierre del índice de referencia en el mismo día (o el último anterior) de cada vela.
function alignBenchmark(candles, bench) {
  if (!bench?.length) return null;
  const out = new Array(candles.length).fill(null);
  let j = 0;
  for (let i = 0; i < candles.length; i++) {
    const day = Math.floor(candles[i].time / 86400);
    while (j + 1 < bench.length && Math.floor(bench[j + 1].time / 86400) <= day) j++;
    if (Math.floor(bench[j].time / 86400) <= day) out[i] = bench[j].close;
  }
  return out;
}

function computeIndicators(candles, benchmark) {
  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume || 0);
  const bench = alignBenchmark(candles, benchmark);
  return {
    closes,
    vols,
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    bb: bollinger(closes, 20, 2),
    volAvg20: sma(vols, 20),
    atr14: atr(candles, 14),
    stoch: stochastic(candles, 14, 3),
    adx14: adx(candles, 14),
    obv: obv(candles),
    hasVolume: vols.some((v) => v > 0),
    bench,
  };
}

// Señales individuales en el índice i. score ∈ [-1, 1].
function signalsAt(ind, i) {
  const { closes, vols, sma20, sma50, sma200, rsi14, macd: m, bb, volAvg20, stoch, adx14, bench } = ind;
  const p = closes[i];
  const out = [];

  const longMa = sma200[i] ?? sma50[i];
  if (longMa) {
    const d = p / longMa - 1;
    out.push({
      key: 'trendLong', label: `Precio vs SMA${sma200[i] ? 200 : 50}`, weight: 1.5,
      score: clamp(d / 0.1),
      detail: `${pct(d)} ${d >= 0 ? 'por encima' : 'por debajo'} de la media de largo plazo`,
    });
  }

  if (sma50[i] && sma200[i]) {
    const golden = sma50[i] > sma200[i];
    let recent = false;
    for (let j = Math.max(1, i - 10); j <= i; j++) {
      if (sma50[j - 1] && sma200[j - 1] && sma50[j - 1] > sma200[j - 1] !== sma50[j] > sma200[j]) recent = true;
    }
    out.push({
      key: 'cross', label: 'Cruce SMA50 / SMA200', weight: 1,
      score: golden ? 1 : -1,
      detail: `${golden ? 'Cruce dorado' : 'Cruce de la muerte'}${recent ? ' (reciente, últimos 10 días)' : ' vigente'}`,
    });
  }

  if (sma20[i] && sma20[i - 5]) {
    const slope = sma20[i] / sma20[i - 5] - 1;
    out.push({
      key: 'trendShort', label: 'Pendiente SMA20 (5d)', weight: 1,
      score: clamp(slope / 0.02),
      detail: `Media de 20 días ${slope >= 0 ? 'subiendo' : 'bajando'} ${pct(slope)}`,
    });
  }

  const r = rsi14[i];
  if (r != null) {
    const s = r < 30 ? 0.8 : r > 70 ? -0.8 : (r - 50) / 50;
    out.push({
      key: 'rsi', label: 'RSI (14)', weight: 1, score: s,
      detail: `${r.toFixed(1)} — ${r < 30 ? 'sobreventa: posible rebote' : r > 70 ? 'sobrecompra: posible corrección' : r >= 50 ? 'impulso positivo' : 'impulso débil'}`,
    });
  }

  const h = m.hist[i], hPrev = m.hist[i - 1];
  if (h != null && hPrev != null) {
    let crossed = 0;
    for (let j = Math.max(1, i - 2); j <= i; j++) {
      if (m.hist[j - 1] != null && Math.sign(m.hist[j - 1]) !== Math.sign(m.hist[j])) crossed = Math.sign(m.hist[j]);
    }
    out.push({
      key: 'macd', label: 'MACD (12,26,9)', weight: 1.2,
      score: crossed ? crossed : h > 0 ? 0.5 : -0.5,
      detail: crossed
        ? `Cruce ${crossed > 0 ? 'alcista' : 'bajista'} reciente de la línea de señal`
        : `Histograma ${h > 0 ? 'positivo' : 'negativo'} y ${Math.abs(h) > Math.abs(hPrev) ? 'ampliándose' : 'perdiendo fuerza'}`,
    });
  }

  if (bb.upper[i] != null && bb.upper[i] !== bb.lower[i]) {
    const pb = (p - bb.lower[i]) / (bb.upper[i] - bb.lower[i]);
    out.push({
      key: 'bb', label: 'Bandas de Bollinger', weight: 0.6,
      score: pb < 0 ? 0.7 : pb > 1 ? -0.7 : clamp((0.5 - pb) * 0.4),
      detail: `%B = ${(pb * 100).toFixed(0)}% — ${pb < 0 ? 'bajo la banda inferior' : pb > 1 ? 'sobre la banda superior' : 'dentro de las bandas'}`,
    });
  }

  if (i >= 63) {
    const ret = p / closes[i - 63] - 1;
    out.push({
      key: 'mom', label: 'Momentum 3 meses', weight: 1.2,
      score: clamp(ret / 0.15),
      detail: `Rentabilidad de 3 meses ${pct(ret)}`,
    });
  }

  if (volAvg20[i] && i > 0) {
    const rel = vols[i] / volAvg20[i];
    const up = p >= closes[i - 1];
    out.push({
      key: 'vol', label: 'Volumen relativo', weight: 0.5,
      score: rel > 1.5 ? (up ? 0.6 : -0.6) : 0,
      detail: `${rel.toFixed(2)}× la media de 20 días${rel > 1.5 ? (up ? ' con subida: presión compradora' : ' con caída: presión vendedora') : ''}`,
    });
  }

  const k = stoch.k[i], d = stoch.d[i];
  if (k != null && d != null) {
    const s = k < 20 ? (k > d ? 0.8 : 0.4) : k > 80 ? (k < d ? -0.8 : -0.4) : clamp((k - d) / 20) * 0.5;
    out.push({
      key: 'stoch', label: 'Estocástico (14,3)', weight: 0.6, score: s,
      detail: `%K ${k.toFixed(0)} / %D ${d.toFixed(0)} — ${k < 20 ? 'zona de sobreventa' : k > 80 ? 'zona de sobrecompra' : k > d ? '%K sobre %D: giro al alza' : '%K bajo %D: giro a la baja'}${(k < 20 && k > d) || (k > 80 && k < d) ? ' con cruce' : ''}`,
    });
  }

  const a = adx14.adx[i], pdi = adx14.plusDI[i], mdi = adx14.minusDI[i];
  if (a != null) {
    const strength = clamp((a - 20) / 20, 0, 1);
    out.push({
      key: 'adx', label: 'Fuerza de tendencia (ADX)', weight: 1,
      score: Math.sign(pdi - mdi) * strength,
      detail: a < 20
        ? `ADX ${a.toFixed(0)} — sin tendencia clara, el precio va de lado`
        : `ADX ${a.toFixed(0)} — tendencia ${a > 40 ? 'muy fuerte' : 'definida'} ${pdi > mdi ? 'alcista (+DI > −DI)' : 'bajista (−DI > +DI)'}`,
    });
  }

  if (ind.hasVolume && i >= 20 && volAvg20[i]) {
    const flow = (ind.obv[i] - ind.obv[i - 20]) / (volAvg20[i] * 20);
    out.push({
      key: 'obv', label: 'Flujo de volumen (OBV 20d)', weight: 0.5,
      score: clamp(flow * 2),
      detail: `${flow >= 0 ? 'Entra' : 'Sale'} dinero: ${Math.abs(flow * 100).toFixed(0)}% del volumen de 20 días en días ${flow >= 0 ? 'de subida' : 'de bajada'}`,
    });
  }

  if (bench && i >= 63 && bench[i] && bench[i - 63]) {
    const rs = closes[i] / closes[i - 63] - bench[i] / bench[i - 63];
    out.push({
      key: 'rs', label: 'Fuerza relativa vs S&P 500', weight: 1,
      score: clamp(rs / 0.1),
      detail: `${pct(rs)} ${rs >= 0 ? 'mejor' : 'peor'} que el S&P 500 (SPY) en 3 meses`,
    });
  }

  return out;
}

function newsSignal(news) {
  if (!news?.length) return null;
  const { score, scored } = newsSentiment(news);
  if (!scored) return null;
  return {
    key: 'news', label: 'Sentimiento de noticias', weight: 0.6,
    score: clamp(score * 1.5),
    detail: `${scored} de ${news.length} titulares recientes con tono ${score > 0.1 ? 'positivo' : score < -0.1 ? 'negativo' : 'mixto'}`,
  };
}

function compositeScore(sigs) {
  const w = sigs.reduce((a, s) => a + s.weight, 0);
  return w ? (sigs.reduce((a, s) => a + s.score * s.weight, 0) / w) * 100 : 0;
}

export function scoreLabel(score) {
  if (score >= 50) return 'Alcista fuerte';
  if (score >= 15) return 'Alcista';
  if (score > -15) return 'Neutral';
  if (score > -50) return 'Bajista';
  return 'Bajista fuerte';
}

// Deriva diaria esperada: tendencia de regresión (muy contraída, los mercados son casi aleatorios)
// más una pequeña inclinación según la puntuación técnica.
function driftAt(closes, i, score) {
  const look = Math.min(90, i);
  const rets = [];
  for (let j = i - look + 1; j <= i; j++) rets.push(Math.log(closes[j] / closes[j - 1]));
  const sigma = stdev(rets) || 0.01;
  const n = Math.min(60, i + 1);
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let k = 0; k < n; k++) {
    const y = Math.log(closes[i - n + 1 + k]);
    sx += k; sy += y; sxy += k * y; sxx += k * k;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const mu = clamp(0.3 * slope + 0.05 * sigma * (score / 100), -0.5 * sigma, 0.5 * sigma);
  return { mu, sigma, slope };
}

function forecast(candles, closes, i, score) {
  const { mu, sigma, slope } = driftAt(closes, i, score);
  const p = closes[i];
  const z = 1.645; // intervalo del 90%
  const horizons = HORIZONS.map((h) => ({
    days: h,
    expected: p * Math.exp(mu * h),
    low: p * Math.exp(mu * h - z * sigma * Math.sqrt(h)),
    high: p * Math.exp(mu * h + z * sigma * Math.sqrt(h)),
    expectedReturn: Math.exp(mu * h) - 1,
    probUp: normCdf((mu * h) / (sigma * Math.sqrt(h))),
  }));
  const day = 86400;
  const last = candles[i].time;
  const path = [];
  for (let d = 0, t = last; d <= 60; d++) {
    if (d > 0) {
      t += day;
      const wd = new Date(t * 1000).getUTCDay();
      if (wd === 6) t += 2 * day;
      else if (wd === 0) t += day;
    }
    path.push({
      time: t,
      mid: p * Math.exp(mu * d),
      low: p * Math.exp(mu * d - z * sigma * Math.sqrt(d)),
      high: p * Math.exp(mu * d + z * sigma * Math.sqrt(d)),
    });
  }
  return { horizons, path, dailyDrift: mu, dailyVol: sigma, annualVol: sigma * Math.sqrt(252), trendSlope: slope };
}

// Backtest walk-forward: ¿acertó la señal la dirección del precio a 20 días?
// Además simula seguir la señal (invertido con señal alcista, en liquidez si no) frente a comprar y mantener.
function backtest(ind, n, horizon = 20) {
  const { closes } = ind;
  const start = Math.max(200, n - 520);
  if (start >= n - 1) return null;
  const scores = [];
  for (let i = start; i < n; i++) scores[i] = compositeScore(signalsAt(ind, i));

  let bull = 0, bullHit = 0, bullRet = 0, bear = 0, bearHit = 0, bearRet = 0, all = 0, allUp = 0, allRet = 0;
  for (let i = start; i < n - horizon; i++) {
    const s = scores[i];
    const fwd = closes[i + horizon] / closes[i] - 1;
    all++; allRet += fwd; if (fwd > 0) allUp++;
    if (s >= 15) { bull++; bullRet += fwd; if (fwd > 0) bullHit++; }
    else if (s <= -15) { bear++; bearRet += fwd; if (fwd < 0) bearHit++; }
  }

  // Decisión al cierre del día i, aplicada al movimiento del día i+1.
  let strat = 1, hold = 1, inDays = 0, peakS = 1, ddS = 0, peakH = 1, ddH = 0;
  for (let i = start; i < n - 1; i++) {
    const r = closes[i + 1] / closes[i];
    hold *= r;
    if (scores[i] >= 15) { strat *= r; inDays++; }
    peakS = Math.max(peakS, strat); ddS = Math.min(ddS, strat / peakS - 1);
    peakH = Math.max(peakH, hold); ddH = Math.min(ddH, hold / peakH - 1);
  }
  const days = n - 1 - start;

  if (!all) return null;
  return {
    horizon,
    samples: all,
    bullish: { count: bull, hitRate: bull ? bullHit / bull : null, avgReturn: bull ? bullRet / bull : null },
    bearish: { count: bear, hitRate: bear ? bearHit / bear : null, avgReturn: bear ? bearRet / bear : null },
    accuracy: bull + bear ? (bullHit + bearHit) / (bull + bear) : null,
    baselineUpRate: allUp / all,
    baselineAvgReturn: allRet / all,
    strategy: {
      days,
      signalReturn: strat - 1,
      buyHoldReturn: hold - 1,
      exposure: days ? inDays / days : 0,
      signalMaxDrawdown: ddS,
      buyHoldMaxDrawdown: ddH,
    },
  };
}

export function analyze(candles, { withBacktest = true, benchmark = null, news = null } = {}) {
  const n = candles.length;
  if (n < 60) throw new Error('Historial insuficiente para el análisis (mínimo 60 sesiones)');
  const ind = computeIndicators(candles, benchmark);
  const i = n - 1;
  const { closes } = ind;
  const signals = signalsAt(ind, i);
  const ns = newsSignal(news);
  if (ns) signals.push(ns);
  const score = compositeScore(signals);
  const ret = (d) => (i >= d ? closes[i] / closes[i - d] - 1 : null);
  const win = (d) => candles.slice(-d);
  const lv = (k) => ind[k][i];

  return {
    price: closes[i],
    asOf: candles[i].time,
    score,
    label: scoreLabel(score),
    signals,
    indicators: {
      rsi: lv('rsi14'), sma20: lv('sma20'), sma50: lv('sma50'), sma200: lv('sma200'),
      macd: ind.macd.line[i], macdSignal: ind.macd.signal[i], macdHist: ind.macd.hist[i],
      bbUpper: ind.bb.upper[i], bbLower: ind.bb.lower[i], atr: lv('atr14'),
      atrPct: lv('atr14') ? lv('atr14') / closes[i] : null,
      stochK: ind.stoch.k[i], stochD: ind.stoch.d[i],
      adx: ind.adx14.adx[i], plusDI: ind.adx14.plusDI[i], minusDI: ind.adx14.minusDI[i],
    },
    relative: ind.bench && i >= 63 && ind.bench[i - 63]
      ? {
          benchmark: BENCHMARK,
          '1M': i >= 21 && ind.bench[i - 21] ? ret(21) - (ind.bench[i] / ind.bench[i - 21] - 1) : null,
          '3M': ret(63) - (ind.bench[i] / ind.bench[i - 63] - 1),
          '1A': i >= 252 && ind.bench[i - 252] ? ret(252) - (ind.bench[i] / ind.bench[i - 252] - 1) : null,
        }
      : null,
    returns: { '1S': ret(5), '1M': ret(21), '3M': ret(63), '6M': ret(126), '1A': ret(252) },
    levels: {
      support20: Math.min(...win(20).map((c) => c.low)),
      resistance20: Math.max(...win(20).map((c) => c.high)),
      support60: Math.min(...win(60).map((c) => c.low)),
      resistance60: Math.max(...win(60).map((c) => c.high)),
    },
    forecast: forecast(candles, closes, i, score),
    backtest: withBacktest ? backtest(ind, n) : null,
  };
}
