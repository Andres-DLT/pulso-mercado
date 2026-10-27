// Motor de análisis: puntuación técnica compuesta, pronóstico probabilístico y backtest.
// Todo se calcula sobre velas diarias. Es un modelo estadístico, no una garantía.
import { sma, rsi, macd, bollinger, atr, stdev, normCdf } from './indicators.js';

const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

export const HORIZONS = [5, 20, 60];

function computeIndicators(candles) {
  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume || 0);
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
  };
}

// Señales individuales en el índice i. score ∈ [-1, 1].
function signalsAt(ind, i) {
  const { closes, vols, sma20, sma50, sma200, rsi14, macd: m, bb, volAvg20 } = ind;
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

  return out;
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
function backtest(ind, n, horizon = 20) {
  const { closes } = ind;
  const start = Math.max(200, n - 520);
  let bull = 0, bullHit = 0, bullRet = 0, bear = 0, bearHit = 0, bearRet = 0, all = 0, allUp = 0, allRet = 0;
  for (let i = start; i < n - horizon; i++) {
    const s = compositeScore(signalsAt(ind, i));
    const fwd = closes[i + horizon] / closes[i] - 1;
    all++; allRet += fwd; if (fwd > 0) allUp++;
    if (s >= 15) { bull++; bullRet += fwd; if (fwd > 0) bullHit++; }
    else if (s <= -15) { bear++; bearRet += fwd; if (fwd < 0) bearHit++; }
  }
  if (!all) return null;
  return {
    horizon,
    samples: all,
    bullish: { count: bull, hitRate: bull ? bullHit / bull : null, avgReturn: bull ? bullRet / bull : null },
    bearish: { count: bear, hitRate: bear ? bearHit / bear : null, avgReturn: bear ? bearRet / bear : null },
    accuracy: bull + bear ? (bullHit + bearHit) / (bull + bear) : null,
    baselineUpRate: allUp / all,
    baselineAvgReturn: allRet / all,
  };
}

export function analyze(candles, { withBacktest = true } = {}) {
  const n = candles.length;
  if (n < 60) throw new Error('Historial insuficiente para el análisis (mínimo 60 sesiones)');
  const ind = computeIndicators(candles);
  const i = n - 1;
  const { closes } = ind;
  const signals = signalsAt(ind, i);
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
    },
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
