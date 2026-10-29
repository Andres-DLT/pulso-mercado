'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sparkline from '@/components/Sparkline';
import { ScoreGauge } from '@/components/AnalysisPanel';
import { usePoll, getJson } from '@/lib/hooks';
import { fmtPrice, fmtPct, fmtNum, tone, scoreTone } from '@/lib/format';

const SORTS = {
  score: { label: 'Señal técnica', get: (r) => r.score },
  exp: { label: 'Retorno esperado 20d', get: (r) => r.expectedReturn20 },
  prob: { label: 'Prob. de subida 20d', get: (r) => r.probUp20 },
  mom: { label: 'Momentum 3M', get: (r) => r.returns['3M'] ?? -Infinity },
  rs: { label: 'vs S&P 3M', get: (r) => r.relative3M ?? -Infinity },
  day: { label: 'Variación hoy', get: (r) => r.dayChange },
};
const TYPES = { all: 'Todos', EQUITY: 'Acciones', ETF: 'ETF', CRYPTOCURRENCY: 'Cripto' };

function Leader({ r, onOpen }) {
  return (
    <button className="card leader" onClick={() => onOpen(r.symbol)}>
      <div className="leader-top">
        <b className="mono">{r.symbol}</b>
        <span className={`pill ${scoreTone(r.score)}`}>{r.label}</span>
      </div>
      <div className="muted small ellipsis">{r.name}</div>
      <Sparkline data={r.spark} width={220} height={44} className="leader-spark" />
      <div className="leader-stats">
        <span><span className="muted small">Precio</span><span className="mono">{fmtPrice(r.price, r.currency)}</span></span>
        <span><span className="muted small">Esperado 20d</span><span className={`mono ${tone(r.expectedReturn20)}`}>{fmtPct(r.expectedReturn20, 1, { ratio: true })}</span></span>
        <span><span className="muted small">P(sube)</span><span className="mono">{fmtNum(r.probUp20 * 100, 0)}%</span></span>
      </div>
      <ScoreGauge score={r.score} compact />
    </button>
  );
}

export default function Ranking() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [sort, setSort] = useState('score');
  const [dir, setDir] = useState(-1);
  const [type, setType] = useState('all');

  usePoll(async () => {
    try {
      setData(await getJson('/api/scan'));
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, 300_000, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const g = SORTS[sort].get;
    return data.rows.filter((r) => type === 'all' || r.type === type).sort((a, b) => dir * (g(a) - g(b)));
  }, [data, sort, dir, type]);

  const byScore = useMemo(() => (data ? [...data.rows].sort((a, b) => b.score - a.score) : []), [data]);
  const open = (s) => router.push(`/?s=${encodeURIComponent(s)}`);
  const th = (k) => (
    <th aria-sort={sort === k ? (dir < 0 ? 'descending' : 'ascending') : 'none'}>
      <button className="th-btn" onClick={() => (sort === k ? setDir(-dir) : (setSort(k), setDir(-1)))}>
        {SORTS[k].label}{sort === k ? (dir < 0 ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  return (
    <>
      <Header />
      <main className="page">
        <div className="page-head">
          <div>
            <h1>Ranking de oportunidades</h1>
            <p className="muted">
              {data ? `${data.rows.length} activos analizados · actualizado ${new Date(data.at).toLocaleTimeString('es-ES')}` : 'Analizando el mercado…'}
              {' '}· Ordenados por señal técnica, pronóstico y momentum. No es una recomendación de inversión.
            </p>
          </div>
        </div>

        {err && <p className="down">Error al cargar el ranking: {err}</p>}

        <h2 className="sec-title up">Señales más alcistas</h2>
        <div className="leaders">
          {data ? byScore.slice(0, 4).map((r) => <Leader key={r.symbol} r={r} onOpen={open} />)
            : [0, 1, 2, 3].map((i) => <div key={i} className="card skeleton" style={{ height: 200 }} />)}
        </div>
        <h2 className="sec-title down">Señales más bajistas</h2>
        <div className="leaders">
          {data ? byScore.slice(-4).reverse().map((r) => <Leader key={r.symbol} r={r} onOpen={open} />)
            : [0, 1, 2, 3].map((i) => <div key={i} className="card skeleton" style={{ height: 200 }} />)}
        </div>

        <section className="card">
          <div className="card-head">
            <h2>Todos los activos</h2>
            <div className="seg">
              {Object.entries(TYPES).map(([k, l]) => (
                <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl rank">
              <thead>
                <tr>
                  <th>Activo</th><th>Precio</th>{th('day')}<th className="hide-sm">60d</th>{th('score')}
                  {th('exp')}{th('prob')}{th('mom')}{th('rs')}<th className="hide-sm">RSI</th><th className="hide-sm" title="Acierto direccional histórico de la señal a 20 días">Acierto hist.</th>
                  <th className="hide-sm" title="Rentabilidad de seguir la señal frente a comprar y mantener en el backtest">Señal / mantener</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol} onClick={() => open(r.symbol)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(r.symbol)}>
                    <td><b className="mono">{r.symbol}</b><div className="muted small ellipsis" style={{ maxWidth: 180 }}>{r.name}</div></td>
                    <td className="mono">{fmtPrice(r.price, r.currency)}</td>
                    <td className={`mono ${tone(r.dayChange)}`}>{fmtPct(r.dayChange, 2, { ratio: true })}</td>
                    <td className="hide-sm"><Sparkline data={r.spark} width={70} height={22} /></td>
                    <td><span className={`pill ${scoreTone(r.score)}`}>{r.score > 0 ? '+' : ''}{fmtNum(r.score, 0)}</span></td>
                    <td className={`mono ${tone(r.expectedReturn20)}`}>{fmtPct(r.expectedReturn20, 1, { ratio: true })}</td>
                    <td className="mono">{fmtNum(r.probUp20 * 100, 0)}%</td>
                    <td className={`mono ${tone(r.returns['3M'])}`}>{fmtPct(r.returns['3M'], 1, { ratio: true })}</td>
                    <td className={`mono ${tone(r.relative3M)}`}>{fmtPct(r.relative3M, 1, { ratio: true })}</td>
                    <td className="mono hide-sm">{fmtNum(r.rsi, 0)}</td>
                    <td className="mono hide-sm muted">{r.accuracy == null ? '—' : `${fmtNum(r.accuracy * 100, 0)}%`}</td>
                    <td className="mono hide-sm small">
                      <span className={tone(r.signalReturn)}>{fmtPct(r.signalReturn, 0, { ratio: true })}</span>
                      <span className="muted"> / </span>
                      <span className={tone(r.buyHoldReturn)}>{fmtPct(r.buyHoldReturn, 0, { ratio: true })}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            “Retorno esperado” y “Prob. de subida” provienen de un modelo estadístico con alta incertidumbre: la mayoría de
            probabilidades rondan el 50–60%. “Acierto hist.” mide cuántas veces la señal acertó la dirección a 20 días en los últimos ~2 años.
            “Señal / mantener” compara, en ese mismo periodo, invertir solo con señal alcista frente a mantener siempre.
          </p>
        </section>
      </main>
    </>
  );
}
