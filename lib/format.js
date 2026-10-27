export function fmtPrice(v, currency = 'USD') {
  if (v == null || !isFinite(v)) return '—';
  const digits = Math.abs(v) < 1 ? 4 : Math.abs(v) >= 10000 ? 0 : 2;
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency', currency: currency || 'USD',
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(v);
  } catch {
    return v.toFixed(digits);
  }
}

export function fmtNum(v, d = 2) {
  if (v == null || !isFinite(v)) return '—';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}

export function fmtPct(v, d = 2, { ratio = false, sign = true } = {}) {
  if (v == null || !isFinite(v)) return '—';
  const x = ratio ? v * 100 : v;
  return `${sign && x > 0 ? '+' : ''}${fmtNum(x, d)}%`;
}

export function fmtCompact(v) {
  if (v == null || !isFinite(v)) return '—';
  return new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

export function tone(v) {
  return v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
}

export function scoreTone(s) {
  return s >= 15 ? 'up' : s <= -15 ? 'down' : 'flat';
}
