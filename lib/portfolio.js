// Cálculo de cartera a partir de operaciones (método de coste medio).
// tx: { id, symbol, side: 'buy' | 'sell', qty, price, time (unix s) }

export const SIM_START_CASH = 10_000;
const DAY = 86400;

const byTime = (a, b) => a.time - b.time || String(a.id).localeCompare(String(b.id));

export function positions(txs) {
  const map = new Map();
  for (const t of [...txs].sort(byTime)) {
    const p = map.get(t.symbol) ?? { symbol: t.symbol, qty: 0, cost: 0, realized: 0, firstTime: t.time };
    if (t.side === 'buy') {
      p.qty += t.qty;
      p.cost += t.qty * t.price;
    } else {
      const q = Math.min(t.qty, p.qty);
      const avg = p.qty ? p.cost / p.qty : 0;
      p.realized += q * (t.price - avg);
      p.cost -= q * avg;
      p.qty -= q;
    }
    if (p.qty < 1e-9) { p.qty = 0; p.cost = 0; }
    map.set(t.symbol, p);
  }
  return [...map.values()].map((p) => ({ ...p, avgCost: p.qty ? p.cost / p.qty : 0 }));
}

export function cashOf(txs, startCash) {
  return txs.reduce((c, t) => c + (t.side === 'buy' ? -1 : 1) * t.qty * t.price, startCash);
}

export function qtyHeld(txs, symbol) {
  return positions(txs.filter((t) => t.symbol === symbol))[0]?.qty ?? 0;
}

// Valor diario de la cartera y de una cartera espejo que mueve el mismo dinero en el índice.
// series: { SYM: [{ time, close }] } (diarias). Devuelve [{ time, value, bench, invested }].
export function evolution(txs, series, { startCash = 0, benchmark = 'SPY' } = {}) {
  if (!txs.length || !series[benchmark]?.length) return [];
  const sorted = [...txs].sort(byTime);
  const dayOf = (t) => Math.floor(t / DAY);
  const firstDay = dayOf(sorted[0].time);
  const days = series[benchmark].map((c) => c.time).filter((t) => dayOf(t) >= firstDay);
  // Fin de semana o festivo: añadimos "ahora" para incluir operaciones y cripto posteriores al último cierre.
  const now = Math.floor(Date.now() / 1000);
  if (!days.length || dayOf(now) > dayOf(days.at(-1))) days.push(now);

  const ptr = {}, last = {};
  const closeAt = (sym, day) => {
    const s = series[sym];
    if (!s) return last[sym] ?? null;
    let j = ptr[sym] ?? 0;
    while (j < s.length && dayOf(s[j].time) <= day) { last[sym] = s[j].close; j++; }
    ptr[sym] = j;
    return last[sym] ?? null;
  };

  const held = {};
  let cash = startCash, invested = startCash, benchUnits = 0, benchCash = startCash, k = 0;
  // El simulador parte del capital inicial justo antes de la primera operación.
  const out = startCash ? [{ time: sorted[0].time - 1, value: startCash, bench: startCash, invested: startCash }] : [];
  for (const t of days) {
    const day = dayOf(t);
    const bClose = closeAt(benchmark, day);
    for (const s of Object.keys(series)) if (s !== benchmark) closeAt(s, day);
    while (k < sorted.length && dayOf(sorted[k].time) <= day) {
      const x = sorted[k++];
      const amount = x.qty * x.price;
      const sign = x.side === 'buy' ? 1 : -1;
      held[x.symbol] = (held[x.symbol] ?? 0) + sign * x.qty;
      cash -= sign * amount;
      if (!startCash) invested += sign * amount;
      if (bClose) {
        benchUnits += (sign * amount) / bClose;
        benchCash -= sign * amount;
      }
    }
    let value = startCash ? cash : 0;
    for (const [s, q] of Object.entries(held)) value += q * (last[s] ?? 0);
    out.push({ time: t, value, bench: (startCash ? benchCash : 0) + benchUnits * (bClose ?? 0), invested });
  }
  return out;
}
