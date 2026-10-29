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

// Estocástico %K (lento, suavizado 3) y %D.
export function stochastic(candles, p = 14, smooth = 3) {
  const raw = candles.map((c, i) => {
    if (i < p - 1) return null;
    let hi = -Infinity, lo = Infinity;
    for (let j = i - p + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    return hi === lo ? 50 : ((c.close - lo) / (hi - lo)) * 100;
  });
  const k = smoothNull(raw, smooth);
  return { k, d: smoothNull(k, smooth) };
}

function smoothNull(v, p) {
  return v.map((_, i) => {
    if (i < p - 1) return null;
    let s = 0;
    for (let j = i - p + 1; j <= i; j++) {
      if (v[j] == null) return null;
      s += v[j];
    }
    return s / p;
  });
}

// ADX de Wilder con +DI / -DI.
export function adx(candles, p = 14) {
  const n = candles.length;
  const plusDI = new Array(n).fill(null), minusDI = new Array(n).fill(null), out = new Array(n).fill(null);
  if (n <= 2 * p) return { adx: out, plusDI, minusDI };
  let tr = 0, pdm = 0, mdm = 0;
  const dx = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const c = candles[i], prev = candles[i - 1];
    const up = c.high - prev.high, down = prev.low - c.low;
    const t = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    const pd = up > down && up > 0 ? up : 0;
    const md = down > up && down > 0 ? down : 0;
    if (i <= p) {
      tr += t; pdm += pd; mdm += md;
      if (i < p) continue;
    } else {
      tr = tr - tr / p + t; pdm = pdm - pdm / p + pd; mdm = mdm - mdm / p + md;
    }
    plusDI[i] = tr ? (100 * pdm) / tr : 0;
    minusDI[i] = tr ? (100 * mdm) / tr : 0;
    const sum = plusDI[i] + minusDI[i];
    dx[i] = sum ? (100 * Math.abs(plusDI[i] - minusDI[i])) / sum : 0;
  }
  let a = 0;
  for (let i = p; i < 2 * p; i++) a += dx[i];
  a /= p;
  out[2 * p - 1] = a;
  for (let i = 2 * p; i < n; i++) {
    a = (a * (p - 1) + dx[i]) / p;
    out[i] = a;
  }
  return { adx: out, plusDI, minusDI };
}

// On-Balance Volume.
export function obv(candles) {
  const out = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    out[i] = out[i - 1] + (d > 0 ? candles[i].volume || 0 : d < 0 ? -(candles[i].volume || 0) : 0);
  }
  return out;
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
