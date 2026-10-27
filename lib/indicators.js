// Indicadores técnicos causales: el valor en i sólo usa datos hasta i (sirve para backtest).

export function sma(v, p) {
  const out = new Array(v.length).fill(null);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= p) s -= v[i - p];
    if (i >= p - 1) out[i] = s / p;
  }
  return out;
}

// EMA que tolera valores null iniciales (p. ej. la línea MACD).
export function ema(v, p) {
  const out = new Array(v.length).fill(null);
  const k = 2 / (p + 1);
  let start = v.findIndex((x) => x != null);
  if (start < 0 || v.length - start < p) return out;
  let s = 0;
  for (let i = start; i < start + p; i++) s += v[i];
  let prev = s / p;
  out[start + p - 1] = prev;
  for (let i = start + p; i < v.length; i++) {
    prev = v[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(v, p = 14) {
  const out = new Array(v.length).fill(null);
  if (v.length <= p) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= p; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= p; loss /= p;
  out[p] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = p + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    gain = (gain * (p - 1) + Math.max(d, 0)) / p;
    loss = (loss * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(v, fast = 12, slow = 26, signal = 9) {
  const ef = ema(v, fast), es = ema(v, slow);
  const line = v.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const sig = ema(line, signal);
  const hist = line.map((x, i) => (x != null && sig[i] != null ? x - sig[i] : null));
  return { line, signal: sig, hist };
}

export function bollinger(v, p = 20, k = 2) {
  const mid = sma(v, p);
  const upper = new Array(v.length).fill(null);
  const lower = new Array(v.length).fill(null);
  for (let i = p - 1; i < v.length; i++) {
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) s += (v[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / p);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
  }
  return { mid, upper, lower };
}

export function atr(candles, p = 14) {
  const tr = candles.map((c, i) =>
    i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close))
  );
  return ema(tr, p);
}

export function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}

// Función de distribución normal estándar (aprox. Abramowitz-Stegun).
export function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
