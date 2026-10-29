'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import SearchBox from '@/components/SearchBox';
import Sparkline from '@/components/Sparkline';
import AnalysisPanel from '@/components/AnalysisPanel';
import AlertsPanel from '@/components/AlertsPanel';
import { useLocalStorage, usePoll, getJson } from '@/lib/hooks';
import { usePushAlerts } from '@/lib/push-client';
import { fmtPrice, fmtPct, fmtCompact, tone } from '@/lib/format';

const PriceChart = dynamic(() => import('@/components/PriceChart'), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ height: 420 }} />,
});

const DEFAULT_WATCH = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'SPY', 'BTC-USD'];
const RANGE_KEYS = ['1D', '5D', '1M', '6M', '1A', '5A'];
const INTRADAY = new Set(['1D', '5D', '1M']);

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.stop(ctx.currentTime + 0.25);
  } catch {}
}

export default function Dashboard() {
  const [watch, setWatch] = useLocalStorage('pulso.watch', DEFAULT_WATCH);
  const [alerts, setAlerts] = useLocalStorage('pulso.alerts', []);
  const [overlays, setOverlays] = useLocalStorage('pulso.overlays', { sma20: true, sma50: true, bb: false });
  const [symbol, setSymbol] = useState('AAPL');
  const [range, setRange] = useState('1D');
  const [quotes, setQuotes] = useState({});
  const [quotesAt, setQuotesAt] = useState(null);
  const [chart, setChart] = useState(null);
  const [chartErr, setChartErr] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisErr, setAnalysisErr] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [flash, setFlash] = useState({});
  const prevPrices = useRef({});
  const push = usePushAlerts(alerts, setAlerts);

  // Símbolo inicial desde ?s=
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('s');
    if (s) setSymbol(s.toUpperCase());
  }, []);

  const select = useCallback((s) => {
    setSymbol(s);
    const url = new URL(window.location.href);
    url.searchParams.set('s', s);
    window.history.replaceState(null, '', url);
  }, []);

  // Cotizaciones en vivo (lista + símbolo activo + símbolos con alertas).
  const pollSymbols = useMemo(() => {
    const set = new Set([...watch, symbol, ...alerts.filter((a) => !a.triggered).map((a) => a.symbol)]);
    return [...set].sort().join(',');
  }, [watch, symbol, alerts]);

  usePoll(async () => {
    try {
      const d = await getJson(`/api/quotes?symbols=${encodeURIComponent(pollSymbols)}`);
      const map = {};
      const fl = {};
      for (const q of d.quotes) {
        if (!q || q.error || q.price == null) continue;
        map[q.symbol] = q;
        const prev = prevPrices.current[q.symbol];
        if (prev != null && prev !== q.price) fl[q.symbol] = q.price > prev ? 'flash-up' : 'flash-down';
        prevPrices.current[q.symbol] = q.price;
      }
      setQuotes((old) => ({ ...old, ...map }));
      setQuotesAt(d.at);
      if (Object.keys(fl).length) {
        setFlash(fl);
        setTimeout(() => setFlash({}), 900);
      }
    } catch {}
  }, 10_000, [pollSymbols]);

  // Gráfico.
  usePoll(async () => {
    try {
      const d = await getJson(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`);
      setChart({ ...d, key: `${symbol}|${range}` });
      setChartErr(null);
    } catch (e) {
      setChartErr(e.message);
    }
  }, INTRADAY.has(range) ? 30_000 : 120_000, [symbol, range]);

  // Análisis técnico diario.
  usePoll(async () => {
    setAnalysisLoading(true);
    try {
      const d = await getJson(`/api/analyze?symbol=${encodeURIComponent(symbol)}`);
      setAnalysis(d);
      setAnalysisErr(null);
    } catch (e) {
      setAnalysisErr(e.message);
    } finally {
      setAnalysisLoading(false);
    }
  }, 300_000, [symbol]);

  useEffect(() => {
    setAnalysis(null);
    setAnalysisErr(null);
    setChart(null);
    setChartErr(null);
  }, [symbol]);

  // Comprobación de alertas.
  useEffect(() => {
    const fired = [];
    const next = alerts.map((a) => {
      const q = quotes[a.symbol];
      if (a.triggered || !q) return a;
      const hit = a.op === 'above' ? q.price >= a.price : q.price <= a.price;
      if (!hit) return a;
      fired.push({ ...a, at: q.price });
      return { ...a, triggered: true, triggeredAt: Date.now(), triggeredPrice: q.price };
    });
    if (!fired.length) return;
    setAlerts(next);
    beep();
    for (const f of fired) {
      const msg = `${f.symbol} ${f.op === 'above' ? 'superó' : 'cayó a'} ${fmtPrice(f.price, f.currency)} (ahora ${fmtPrice(f.at, f.currency)})`;
      const id = f.id;
      setToasts((t) => [...t, { id, msg }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification('Alerta de precio · Pulso', { body: msg, tag: id }); } catch {}
      }
    }
  }, [quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = quotes[symbol];
  const meta = chart?.meta;
  const intraday = INTRADAY.has(range);
  const candles = useMemo(() => {
    if (!chart?.candles) return null;
    const off = intraday ? chart.meta.gmtoffset || 0 : 0;
    return chart.candles.map((c) => ({ ...c, time: c.time + off }));
  }, [chart, intraday]);
  const symAlerts = useMemo(() => alerts.filter((a) => a.symbol === symbol && !a.triggered), [alerts, symbol]);
  const inWatch = watch.includes(symbol);
  const price = q?.price ?? meta?.price;
  const currency = q?.currency ?? meta?.currency;
  const rangeChange = candles?.length && range !== '1D' ? price / candles[0].open - 1 : null;
  const open = (q?.marketState ?? meta?.marketState) === 'OPEN';

  return (
    <>
      <Header><SearchBox onPick={select} /></Header>
      <main className="layout">
        <aside className="side">
        <section className="watch card">
          <div className="card-head">
            <h2>Mi lista</h2>
            <span className="live muted small"><i className="dot" />{quotesAt ? new Date(quotesAt).toLocaleTimeString('es-ES') : 'conectando…'}</span>
          </div>
          <ul>
            {watch.map((s) => {
              const w = quotes[s];
              return (
                <li key={s} className={`${s === symbol ? 'sel' : ''} ${flash[s] || ''}`}>
                  <button className="watch-row" onClick={() => select(s)}>
                    <span className="watch-sym"><b>{s}</b><span className="muted small ellipsis">{w?.name ?? ''}</span></span>
                    <Sparkline data={w?.spark} width={64} height={24} />
                    <span className="watch-px">
                      <span className="mono">{w ? fmtPrice(w.price, w.currency) : '…'}</span>
                      <span className={`mono small ${tone(w?.changePct)}`}>{w ? fmtPct(w.changePct) : ''}</span>
                    </span>
                  </button>
                  <button className="x" aria-label={`Quitar ${s}`} onClick={() => setWatch(watch.filter((x) => x !== s))}>✕</button>
                </li>
              );
            })}
          </ul>
          {watch.length === 0 && <p className="muted small">Busca un símbolo y añádelo con ☆.</p>}
        </section>
        <AlertsPanel symbol={symbol} price={price} currency={currency} alerts={alerts} setAlerts={setAlerts} push={push} />
        </aside>

        <div className="main">
          <section className="card">
            <div className="quote-head">
              <div>
                <div className="sym-line">
                  <h1>{symbol}</h1>
                  <button className={`star ${inWatch ? 'on' : ''}`} aria-label={inWatch ? 'Quitar de mi lista' : 'Añadir a mi lista'}
                          onClick={() => setWatch(inWatch ? watch.filter((x) => x !== symbol) : [...watch, symbol])}>
                    {inWatch ? '★' : '☆'}
                  </button>
                  {q?.stale ? (
                    <span className="badge stale-note" title="La fuente de datos no responde; se muestra el último precio conocido">
                      Último dato {new Date(q.staleSince).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  ) : (
                    <span className={`badge ${open ? 'open' : ''}`}>{open ? <><i className="dot" />En vivo</> : 'Mercado cerrado'}</span>
                  )}
                </div>
                <div className="muted">{meta?.name ?? q?.name ?? ''}{meta?.exchange ? ` · ${meta.exchange}` : ''}{currency ? ` · ${currency}` : ''}</div>
              </div>
              <div className="px-block">
                <div className={`mono px ${flash[symbol] || ''}`}>{fmtPrice(price, currency)}</div>
                {q && <div className={`mono ${tone(q.change)}`}>{q.change > 0 ? '+' : ''}{fmtPrice(q.change, currency)} ({fmtPct(q.changePct)}) hoy</div>}
                {rangeChange != null && <div className={`mono small ${tone(rangeChange)}`}>{fmtPct(rangeChange, 2, { ratio: true })} en {range}</div>}
              </div>
            </div>

            <div className="stats-row">
              <div><span className="muted small">Mín–máx día</span><span className="mono">{fmtPrice(q?.dayLow ?? meta?.dayLow, currency)} – {fmtPrice(q?.dayHigh ?? meta?.dayHigh, currency)}</span></div>
              <div><span className="muted small">52 semanas</span><span className="mono">{fmtPrice(q?.low52 ?? meta?.low52, currency)} – {fmtPrice(q?.high52 ?? meta?.high52, currency)}</span></div>
              <div><span className="muted small">Volumen</span><span className="mono">{fmtCompact(q?.volume ?? meta?.volume)}</span></div>
              <div><span className="muted small">Cierre anterior</span><span className="mono">{fmtPrice(q?.previousClose, currency)}</span></div>
            </div>

            <div className="toolbar">
              <div className="seg" role="tablist" aria-label="Rango">
                {RANGE_KEYS.map((r) => (
                  <button key={r} role="tab" aria-selected={r === range} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>
                ))}
              </div>
              <div className="toggles">
                {[['sma20', 'SMA 20', 'c-sma20'], ['sma50', 'SMA 50', 'c-sma50'], ['bb', 'Bollinger', 'c-bb']].map(([k, l, c]) => (
                  <label key={k} className={`chk ${c}`}>
                    <input type="checkbox" checked={!!overlays[k]} onChange={(e) => setOverlays({ ...overlays, [k]: e.target.checked })} />
                    <i />{l}
                  </label>
                ))}
              </div>
            </div>

            {chartErr && !candles ? (
              <div className="empty"><p className="down">No hay datos para “{symbol}”: {chartErr}</p></div>
            ) : (
              <PriceChart
                candles={candles}
                intraday={intraday}
                overlays={overlays}
                alerts={symAlerts}
                livePrice={range === '1D' ? q?.price : null}
                resetKey={chart?.key}
              />
            )}
          </section>

          <div className="grid2">
            <AnalysisPanel data={analysis} loading={analysisLoading} error={analysisErr} />
          </div>
        </div>
      </main>

      <div className="toasts" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className="toast" role="alert">🔔 {t.msg}</div>
        ))}
      </div>
    </>
  );
}
