'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import SearchBox from '@/components/SearchBox';
import LineCompare from '@/components/LineCompare';
import { useLocalStorage, usePoll, getJson } from '@/lib/hooks';
import { positions, cashOf, qtyHeld, evolution, SIM_START_CASH } from '@/lib/portfolio';
import { fmtPrice, fmtMoney, fmtPct, fmtNum, tone } from '@/lib/format';

const EMPTY = { sim: { startCash: SIM_START_CASH, txs: [] }, real: { txs: [] } };
const MODES = { sim: 'Simulador', real: 'Mi cartera real' };
const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => parseFloat(String(v).replace(',', '.'));
const fmtQty = (q) => fmtNum(q, Number.isInteger(q) ? 0 : 4);

export default function Cartera() {
  const router = useRouter();
  const [book, setBook] = useLocalStorage('pulso.portfolio', EMPTY);
  const [mode, setMode] = useLocalStorage('pulso.portfolio.mode', 'sim');
  const [symbol, setSymbol] = useState('AAPL');
  const [qty, setQty] = useState('1');
  const [side, setSide] = useState('buy');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today);
  const [quotes, setQuotes] = useState({});
  const [hist, setHist] = useState(null);
  const [msg, setMsg] = useState(null);

  const pf = book[mode] ?? EMPTY[mode];
  const txs = pf.txs;
  const sim = mode === 'sim';
  const startCash = sim ? pf.startCash ?? SIM_START_CASH : 0;
  const pos = useMemo(() => positions(txs), [txs]);
  const held = pos.filter((p) => p.qty > 0);
  const cash = sim ? cashOf(txs, startCash) : null;
  const q = quotes[symbol];

  const update = (fn) => setBook((b) => ({ ...EMPTY, ...b, [mode]: fn(b[mode] ?? EMPTY[mode]) }));

  // Precios en vivo de las posiciones y del símbolo elegido.
  const pollSymbols = useMemo(
    () => [...new Set([...pos.filter((p) => p.qty > 0).map((p) => p.symbol), symbol])].sort().join(','),
    [pos, symbol]
  );
  usePoll(async () => {
    try {
      const d = await getJson(`/api/quotes?symbols=${encodeURIComponent(pollSymbols)}`);
      const map = {};
      for (const x of d.quotes) if (x && !x.error && x.price != null) map[x.symbol] = x;
      setQuotes((old) => ({ ...old, ...map }));
    } catch {}
  }, 15_000, [pollSymbols]);

  // Historial diario para la evolución frente al S&P 500.
  const histKey = useMemo(() => {
    if (!txs.length) return '';
    const syms = [...new Set([...txs.map((t) => t.symbol), 'SPY'])].sort().join(',');
    return `${syms}|${Math.min(...txs.map((t) => t.time))}`;
  }, [txs]);
  usePoll(async () => {
    if (!histKey) return setHist(null);
    const [syms, from] = histKey.split('|');
    try {
      setHist(await getJson(`/api/history?symbols=${encodeURIComponent(syms)}&from=${from}`));
    } catch {}
  }, 300_000, [histKey]);

  useEffect(() => {
    setPrice('');
    setMsg(null);
  }, [symbol, mode]);
  useEffect(() => {
    if (!sim && q?.price && !price) setPrice(String(+q.price.toFixed(q.price < 1 ? 4 : 2)));
  }, [q?.price, sim]); // eslint-disable-line react-hooks/exhaustive-deps

  const evo = useMemo(() => (hist ? evolution(txs, hist.series, { startCash }) : []), [hist, txs, startCash]);

  // Variación de hoy: lo que había al empezar el día se mide desde el cierre anterior;
  // lo comprado o vendido hoy, desde el precio de la operación.
  const dayStart = new Date().setHours(0, 0, 0, 0) / 1000;
  const rows = held.map((p) => {
    const x = quotes[p.symbol];
    const px = x?.price ?? p.avgCost;
    const value = p.qty * px;
    let day = 0;
    if (x) {
      const todays = txs.filter((t) => t.symbol === p.symbol && t.time >= dayStart);
      const net = todays.reduce((a, t) => a + (t.side === 'buy' ? t.qty : -t.qty), 0);
      const flow = todays.reduce((a, t) => a + (t.side === 'buy' ? 1 : -1) * t.qty * t.price, 0);
      day = value - (p.qty - net) * (x.price - x.change) - flow;
    }
    return { ...p, name: x?.name, price: px, value, pnl: value - p.cost, pnlPct: p.cost ? value / p.cost - 1 : 0, day, live: !!x };
  });
  const marketValue = rows.reduce((a, r) => a + r.value, 0);
  const costOpen = rows.reduce((a, r) => a + r.cost, 0);
  const realized = pos.reduce((a, p) => a + p.realized, 0);
  const dayChange = rows.reduce((a, r) => a + r.day, 0);
  const total = sim ? cash + marketValue : marketValue;
  const pnl = sim ? total - startCash : marketValue - costOpen + realized;
  const pnlBase = sim ? startCash : costOpen;
  const last = evo.at(-1);

  const submit = (e, s = side) => {
    e?.preventDefault();
    setMsg(null);
    const n = num(qty);
    if (!isFinite(n) || n <= 0) return setMsg({ err: 'Indica una cantidad mayor que cero.' });
    if (q && q.currency && q.currency !== 'USD') return setMsg({ err: `Por ahora la cartera solo admite activos en dólares (${symbol} cotiza en ${q.currency}).` });
    let px, time;
    if (sim) {
      if (!q?.price) return setMsg({ err: 'Esperando el precio en vivo…' });
      px = q.price;
      time = Math.floor(Date.now() / 1000);
      if (s === 'buy' && n * px > cash + 1e-6) return setMsg({ err: `Efectivo insuficiente: necesitas ${fmtMoney(n * px)} y tienes ${fmtMoney(cash)}.` });
    } else {
      px = num(price);
      if (!isFinite(px) || px <= 0) return setMsg({ err: 'Indica el precio al que operaste.' });
      if (!date || date > today()) return setMsg({ err: 'La fecha no puede ser futura.' });
      time = date === today() ? Math.floor(Date.now() / 1000) : Math.floor(Date.parse(`${date}T20:00:00Z`) / 1000);
    }
    if (s === 'sell' && n > qtyHeld(txs, symbol) + 1e-9) return setMsg({ err: `Solo tienes ${fmtQty(qtyHeld(txs, symbol))} ${symbol}.` });
    update((p) => ({ ...p, txs: [...p.txs, { id: crypto.randomUUID(), symbol, side: s, qty: n, price: px, time }] }));
    setMsg({ ok: `${s === 'buy' ? 'Compra' : 'Venta'} registrada: ${fmtQty(n)} ${symbol} a ${fmtPrice(px)}.` });
  };

  const removeTx = (id) => update((p) => ({ ...p, txs: p.txs.filter((t) => t.id !== id) }));
  const reset = () => {
    if (window.confirm('¿Reiniciar el simulador? Se borrarán todas sus operaciones y volverás a 10.000 US$.')) {
      update(() => ({ startCash: SIM_START_CASH, txs: [] }));
    }
  };

  const maxBuy = sim && q?.price ? Math.floor((cash / q.price) * 10000) / 10000 : null;

  return (
    <>
      <Header />
      <main className="page">
        <div className="page-head pf-head">
          <div>
            <h1>Cartera</h1>
            <p className="muted">
              {sim
                ? 'Practica con 10.000 US$ virtuales a precios reales, sin arriesgar dinero.'
                : 'Registra tus operaciones reales para seguir su rentabilidad. Se guardan solo en este navegador.'}
            </p>
          </div>
          <div className="seg" role="tablist" aria-label="Tipo de cartera">
            {Object.entries(MODES).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="pf-stats">
          <div className="card"><div className="muted small">Valor total</div><div className="mono big">{fmtMoney(total)}</div></div>
          <div className="card">
            <div className="muted small">Ganancia / pérdida</div>
            <div className={`mono big ${tone(pnl)}`}>{pnl > 0 ? '+' : ''}{fmtMoney(pnl)}</div>
            <div className={`mono small ${tone(pnl)}`}>{pnlBase ? fmtPct(pnl / pnlBase, 2, { ratio: true }) : '—'}</div>
          </div>
          <div className="card">
            <div className="muted small">Hoy</div>
            <div className={`mono big ${tone(dayChange)}`}>{dayChange > 0 ? '+' : ''}{fmtMoney(dayChange)}</div>
          </div>
          <div className="card">
            <div className="muted small">{sim ? 'Efectivo disponible' : 'Coste de las posiciones'}</div>
            <div className="mono big">{fmtMoney(sim ? cash : costOpen)}</div>
            {!sim && realized !== 0 && <div className={`mono small ${tone(realized)}`}>realizado {realized > 0 ? '+' : ''}{fmtMoney(realized)}</div>}
          </div>
        </div>

        <div className="pf-grid">
          <section className="card">
            <div className="card-head">
              <h2>{sim ? 'Operar' : 'Registrar operación'}</h2>
              {sim && txs.length > 0 && <button className="btn ghost small" onClick={reset}>Reiniciar simulador</button>}
            </div>
            <SearchBox onPick={setSymbol} />
            <div className="pf-sym">
              <b className="mono">{symbol}</b>
              <span className="muted small ellipsis">{q?.name ?? ''}</span>
              <span className="mono">{q ? fmtPrice(q.price, q.currency) : '…'}</span>
              {q && <span className={`mono small ${tone(q.changePct)}`}>{fmtPct(q.changePct)}</span>}
            </div>
            <form className="pf-form" onSubmit={(e) => submit(e, sim ? 'buy' : side)}>
              {!sim && (
                <label>Operación
                  <select value={side} onChange={(e) => setSide(e.target.value)}>
                    <option value="buy">Compra</option>
                    <option value="sell">Venta</option>
                  </select>
                </label>
              )}
              <label>Cantidad
                <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className="mono" />
              </label>
              {!sim && (
                <>
                  <label>Precio (US$)
                    <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="mono" />
                  </label>
                  <label>Fecha
                    <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
                  </label>
                </>
              )}
              <div className="pf-actions">
                {sim ? (
                  <>
                    <button className="btn buy" type="submit">Comprar</button>
                    <button className="btn sell" type="button" onClick={(e) => submit(e, 'sell')}>Vender</button>
                  </>
                ) : (
                  <button className="btn" type="submit">Registrar</button>
                )}
              </div>
            </form>
            <p className="muted small">
              {sim && q?.price ? <>Importe ≈ {fmtMoney(num(qty) * q.price || 0)} · máximo que puedes comprar: {fmtQty(maxBuy)} </> : null}
              {qtyHeld(txs, symbol) > 0 && <>· tienes {fmtQty(qtyHeld(txs, symbol))} {symbol}</>}
            </p>
            {msg && <p className={`small ${msg.err ? 'down' : 'up'}`} role="status">{msg.err || msg.ok}</p>}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Evolución vs S&amp;P 500</h2>
              <span className="pf-legend small"><i className="lg-main" />Tu cartera <i className="lg-bench" />Mismo dinero en SPY <i className="lg-inv" />{sim ? 'Capital inicial' : 'Invertido'}</span>
            </div>
            {evo.length > 1 ? (
              <>
                <LineCompare points={evo} />
                <p className="muted small">
                  Hoy tu cartera vale <b className="mono">{fmtMoney(last.value)}</b>; el mismo dinero, en las mismas fechas, en el S&amp;P 500 valdría{' '}
                  <b className="mono">{fmtMoney(last.bench)}</b>:{' '}
                  <span className={tone(last.value - last.bench)}>
                    {last.value >= last.bench ? 'vas ganando al mercado por ' : 'el mercado te gana por '}{fmtMoney(Math.abs(last.value - last.bench))}
                  </span>.
                </p>
              </>
            ) : (
              <div className="pf-empty muted">
                {!txs.length
                  ? 'Haz tu primera operación para ver cómo evoluciona tu cartera frente al mercado.'
                  : hist
                    ? 'La evolución aparecerá cuando haya al menos dos días de cotización desde tu primera operación.'
                    : 'Calculando la evolución…'}
              </div>
            )}
          </section>
        </div>

        <section className="card">
          <div className="card-head"><h2>Posiciones</h2>{rows.length > 0 && <span className="muted small">{rows.length} activos</span>}</div>
          {rows.length === 0 ? (
            <p className="muted small">Aún no tienes posiciones abiertas.</p>
          ) : (
            <>
              <div className="alloc" aria-label="Reparto de la cartera">
                {rows.map((r, i) => (
                  <span key={r.symbol} style={{ flexGrow: r.value, background: `hsl(${(i * 67 + 200) % 360} 65% 55%)` }} title={`${r.symbol} ${fmtNum((r.value / total) * 100, 1)}%`} />
                ))}
                {sim && cash > 0 && <span style={{ flexGrow: cash }} className="alloc-cash" title={`Efectivo ${fmtNum((cash / total) * 100, 1)}%`} />}
              </div>
              <div className="tbl-wrap">
                <table className="tbl rank">
                  <thead>
                    <tr><th>Activo</th><th>Cantidad</th><th className="hide-sm">Coste medio</th><th>Precio</th><th>Valor</th><th>Ganancia</th><th className="hide-sm">Hoy</th><th className="hide-sm">Peso</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.symbol} onClick={() => router.push(`/?s=${encodeURIComponent(r.symbol)}`)} tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && router.push(`/?s=${encodeURIComponent(r.symbol)}`)}>
                        <td><b className="mono">{r.symbol}</b><div className="muted small ellipsis" style={{ maxWidth: 160 }}>{r.name ?? ''}</div></td>
                        <td className="mono">{fmtQty(r.qty)}</td>
                        <td className="mono hide-sm">{fmtPrice(r.avgCost)}</td>
                        <td className="mono">{r.live ? fmtPrice(r.price) : '…'}</td>
                        <td className="mono">{fmtMoney(r.value)}</td>
                        <td className={`mono ${tone(r.pnl)}`}>{r.pnl > 0 ? '+' : ''}{fmtMoney(r.pnl)}<div className="small">{fmtPct(r.pnlPct, 1, { ratio: true })}</div></td>
                        <td className={`mono hide-sm ${tone(r.day)}`}>{r.day > 0 ? '+' : ''}{fmtMoney(r.day)}</td>
                        <td className="mono hide-sm">{fmtNum((r.value / total) * 100, 1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {txs.length > 0 && (
          <section className="card">
            <div className="card-head"><h2>Operaciones</h2><span className="muted small">{txs.length}</span></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Fecha</th><th>Operación</th><th>Activo</th><th>Cantidad</th><th>Precio</th><th>Importe</th>{!sim && <th />}</tr></thead>
                <tbody>
                  {[...txs].sort((a, b) => b.time - a.time).map((t) => (
                    <tr key={t.id}>
                      <td className="small">{new Date(t.time * 1000).toLocaleDateString('es-ES')}</td>
                      <td className={t.side === 'buy' ? 'up' : 'down'}>{t.side === 'buy' ? 'Compra' : 'Venta'}</td>
                      <td className="mono"><b>{t.symbol}</b></td>
                      <td className="mono">{fmtQty(t.qty)}</td>
                      <td className="mono">{fmtPrice(t.price)}</td>
                      <td className="mono">{fmtMoney(t.qty * t.price)}</td>
                      {!sim && <td><button className="btn ghost small" onClick={() => removeTx(t.id)} aria-label={`Eliminar operación ${t.symbol}`}>✕</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
