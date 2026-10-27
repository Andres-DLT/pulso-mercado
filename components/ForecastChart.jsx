import { fmtPrice } from '@/lib/format';

// Gráfico de abanico: historial reciente + proyección con banda de confianza del 90%.
export default function ForecastChart({ history, path, currency }) {
  if (!history?.length || !path?.length) return null;
  const W = 640, H = 220, padL = 8, padR = 72, padT = 12, padB = 22;
  const hist = history.slice(-90);
  const all = [...hist.map((h) => h.close), ...path.map((p) => p.low), ...path.map((p) => p.high)];
  const min = Math.min(...all), max = Math.max(...all);
  const n = hist.length + path.length - 1;
  const x = (i) => padL + (i / n) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);
  const o = hist.length - 1;
  const histPts = hist.map((h, i) => `${x(i)},${y(h.close)}`).join(' ');
  const midPts = path.map((p, i) => `${x(o + i)},${y(p.mid)}`).join(' ');
  const band = [...path.map((p, i) => `${x(o + i)},${y(p.high)}`), ...path.map((p, i) => `${x(o + i)},${y(p.low)}`).reverse()].join(' ');
  const end = path.at(-1);
  const label = (v, cls) => (
    <text x={W - padR + 6} y={y(v) + 4} className={cls}>{fmtPrice(v, currency)}</text>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fan" role="img" aria-label="Proyección de precio a 60 sesiones con intervalo del 90%">
      <polygon points={band} className="fan-band" />
      <polyline points={histPts} className="fan-hist" />
      <polyline points={midPts} className="fan-mid" />
      <line x1={x(o)} x2={x(o)} y1={padT} y2={H - padB} className="fan-now" />
      <text x={x(o)} y={H - 6} textAnchor="middle" className="fan-axis">hoy</text>
      <text x={padL} y={H - 6} className="fan-axis">-90 sesiones</text>
      <text x={x(n)} y={H - 6} textAnchor="end" className="fan-axis">+60</text>
      {label(end.high, 'fan-lbl')}
      {label(end.mid, 'fan-lbl fan-lbl-mid')}
      {label(end.low, 'fan-lbl')}
    </svg>
  );
}
