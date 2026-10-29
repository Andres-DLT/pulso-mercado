import ForecastChart from './ForecastChart';
import { fmtPrice, fmtPct, fmtNum, tone, scoreTone } from '@/lib/format';

export function ScoreGauge({ score, label, compact = false }) {
  const left = ((score + 100) / 200) * 100;
  return (
    <div className={`gauge ${compact ? 'gauge-sm' : ''}`}>
      {!compact && (
        <div className="gauge-head">
          <span className={`pill ${scoreTone(score)}`}>{label}</span>
          <span className="mono big">{score > 0 ? '+' : ''}{fmtNum(score, 0)}</span>
        </div>
      )}
      <div className="gauge-track" role="meter" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(score)} aria-label="Puntuación técnica">
        <div className="gauge-mark" style={{ left: `${left}%` }} />
      </div>
      {!compact && (
        <div className="gauge-scale muted"><span>Bajista</span><span>Neutral</span><span>Alcista</span></div>
      )}
    </div>
  );
}

function SignalRow({ s }) {
  const w = Math.abs(s.score) * 50;
  return (
    <li className="sig">
      <div className="sig-top">
        <span>{s.label}</span>
        <span className={`mono ${tone(s.score)}`}>{s.score > 0 ? '+' : ''}{fmtNum(s.score, 2)}</span>
      </div>
      <div className="sig-bar">
        <div className={`sig-fill ${tone(s.score)}`} style={s.score >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} />
      </div>
      <div className="muted small">{s.detail}</div>
    </li>
  );
}

const pctOrDash = (v) => (v == null ? '—' : `${fmtNum(v * 100, 0)}%`);

function ago(t) {
  if (!t) return '';
  const m = Math.max(1, Math.round((Date.now() / 1000 - t) / 60));
  if (m < 60) return `hace ${m} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  return `hace ${Math.round(m / 1440)} d`;
}

export default function AnalysisPanel({ data, loading, error }) {
  if (error) return <section className="card"><p className="down">No se pudo analizar: {error}</p></section>;
  if (!data) return <section className="card"><div className="skeleton" style={{ height: 320 }} /></section>;
  const cur = data.meta?.currency;
  const { forecast: f, backtest: bt, indicators: ind, levels, returns } = data;

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Señal técnica <span className="muted small">· diaria{loading ? ' · actualizando…' : ''}</span></h2>
        </div>
        <ScoreGauge score={data.score} label={data.label} />
        <ul className="sig-list">{data.signals.map((s) => <SignalRow key={s.key} s={s} />)}</ul>
      </section>

      <section className="card">
        <div className="card-head"><h2>Pronóstico estadístico</h2><span className="muted small">intervalo del 90%</span></div>
        <ForecastChart history={data.history} path={f.path} currency={cur} />
        <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Horizonte</th><th>Precio esperado</th><th>Rango probable</th><th>Prob. de subida</th></tr></thead>
          <tbody>
            {f.horizons.map((h) => (
              <tr key={h.days}>
                <td>{h.days} sesiones</td>
                <td className="mono">{fmtPrice(h.expected, cur)} <span className={tone(h.expectedReturn)}>({fmtPct(h.expectedReturn, 1, { ratio: true })})</span></td>
                <td className="mono muted">{fmtPrice(h.low, cur)} – {fmtPrice(h.high, cur)}</td>
                <td className="mono"><span className={h.probUp >= 0.5 ? 'up' : 'down'}>{fmtNum(h.probUp * 100, 0)}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="muted small">
          Modelo de paseo aleatorio con deriva contraída: tendencia de 60 días + inclinación por la señal técnica,
          volatilidad diaria {fmtPct(f.dailyVol, 2, { ratio: true, sign: false })} (anual {fmtPct(f.annualVol, 0, { ratio: true, sign: false })}).
          Cuanto más ancho el rango, mayor la incertidumbre.
        </p>
      </section>

      {bt && (
        <section className="card">
          <div className="card-head"><h2>¿Qué tan fiable es la señal?</h2><span className="muted small">backtest {bt.samples} sesiones</span></div>
          <div className="stats3">
            <div><div className="muted small">Acierto direccional a {bt.horizon}d</div><div className="mono big">{pctOrDash(bt.accuracy)}</div></div>
            <div><div className="muted small">Señal alcista → subió</div><div className="mono big">{pctOrDash(bt.bullish.hitRate)}</div><div className="muted small">{bt.bullish.count} veces</div></div>
            <div><div className="muted small">Línea base (cualquier día)</div><div className="mono big">{pctOrDash(bt.baselineUpRate)}</div><div className="muted small">subió a {bt.horizon}d</div></div>
          </div>
          <p className="muted small">
            {bt.bullish.hitRate != null && bt.bullish.hitRate > bt.baselineUpRate + 0.03
              ? 'En este activo, la señal alcista ha superado a la línea base de “comprar cualquier día”.'
              : 'En este activo, la señal no ha superado claramente a la línea base: trátala como contexto, no como predicción.'}
            {' '}Rendimiento pasado no garantiza resultados futuros.
          </p>
          {bt.strategy && (
            <>
              <h3 className="sub-title">Seguir la señal vs comprar y mantener <span className="muted small">· {bt.strategy.days} sesiones</span></h3>
              <div className="versus">
                <div>
                  <div className="muted small">Siguiendo la señal</div>
                  <div className={`mono big ${tone(bt.strategy.signalReturn)}`}>{fmtPct(bt.strategy.signalReturn, 1, { ratio: true })}</div>
                  <div className="muted small">invertido {fmtNum(bt.strategy.exposure * 100, 0)}% del tiempo · peor caída {fmtPct(bt.strategy.signalMaxDrawdown, 0, { ratio: true })}</div>
                </div>
                <div>
                  <div className="muted small">Comprar y mantener</div>
                  <div className={`mono big ${tone(bt.strategy.buyHoldReturn)}`}>{fmtPct(bt.strategy.buyHoldReturn, 1, { ratio: true })}</div>
                  <div className="muted small">siempre invertido · peor caída {fmtPct(bt.strategy.buyHoldMaxDrawdown, 0, { ratio: true })}</div>
                </div>
              </div>
              <p className="muted small">
                {bt.strategy.signalReturn > bt.strategy.buyHoldReturn
                  ? 'Aquí, entrar solo con señal alcista habría ganado más que mantener siempre.'
                  : bt.strategy.signalMaxDrawdown > bt.strategy.buyHoldMaxDrawdown
                    ? 'Mantener siempre habría ganado más, aunque seguir la señal habría sufrido caídas menores.'
                    : 'Aquí habría sido mejor comprar y mantener que seguir la señal.'}
                {' '}No incluye comisiones ni impuestos.
              </p>
            </>
          )}
        </section>
      )}

      {data.news?.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Noticias recientes</h2><span className="muted small">tono estimado por palabras clave</span></div>
          <ul className="news">
            {data.news.slice(0, 8).map((n) => (
              <li key={n.link}>
                <span className={`pill ${tone(n.sentiment)} news-tone`}>{n.sentiment > 0.1 ? 'Positiva' : n.sentiment < -0.1 ? 'Negativa' : 'Neutra'}</span>
                <a href={n.link} target="_blank" rel="noopener noreferrer">{n.title}</a>
                <span className="muted small">{n.publisher} · {ago(n.time)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>Indicadores y niveles</h2></div>
        <dl className="kv">
          <dt>RSI 14</dt><dd className="mono">{fmtNum(ind.rsi, 1)}</dd>
          <dt>MACD / señal</dt><dd className="mono">{fmtNum(ind.macd, 2)} / {fmtNum(ind.macdSignal, 2)}</dd>
          <dt>SMA 20 / 50 / 200</dt><dd className="mono">{fmtNum(ind.sma20, 2)} / {fmtNum(ind.sma50, 2)} / {fmtNum(ind.sma200, 2)}</dd>
          <dt>Bollinger</dt><dd className="mono">{fmtNum(ind.bbLower, 2)} – {fmtNum(ind.bbUpper, 2)}</dd>
          <dt>ATR 14</dt><dd className="mono">{fmtNum(ind.atr, 2)} ({fmtPct(ind.atrPct, 2, { ratio: true, sign: false })})</dd>
          <dt>Estocástico %K / %D</dt><dd className="mono">{fmtNum(ind.stochK, 0)} / {fmtNum(ind.stochD, 0)}</dd>
          <dt>ADX · +DI / −DI</dt><dd className="mono">{fmtNum(ind.adx, 0)} · {fmtNum(ind.plusDI, 0)} / {fmtNum(ind.minusDI, 0)}</dd>
          <dt>Soporte / resist. 20d</dt><dd className="mono">{fmtPrice(levels.support20, cur)} / {fmtPrice(levels.resistance20, cur)}</dd>
          <dt>Soporte / resist. 60d</dt><dd className="mono">{fmtPrice(levels.support60, cur)} / {fmtPrice(levels.resistance60, cur)}</dd>
        </dl>
        <div className="returns">
          {Object.entries(returns).map(([k, v]) => (
            <div key={k}><span className="muted small">{k}</span><span className={`mono ${tone(v)}`}>{fmtPct(v, 1, { ratio: true })}</span></div>
          ))}
        </div>
        {data.relative && (
          <>
            <h3 className="sub-title">Frente al S&amp;P 500 (SPY)</h3>
            <div className="returns">
              {['1M', '3M', '1A'].map((k) => (
                <div key={k}><span className="muted small">{k}</span><span className={`mono ${tone(data.relative[k])}`}>{fmtPct(data.relative[k], 1, { ratio: true })}</span></div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
