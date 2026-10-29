import { fmtPrice } from '@/lib/format';

// Dos series en la misma escala: la cartera (sólida) y el índice de referencia (discontinua), más lo invertido.
export default function LineCompare({ points, currency = 'USD' }) {
  if (!points || points.length < 2) return null;
  const W = 720, H = 240, padL = 8, padR = 84, padT = 12, padB = 24;
  const vals = points.flatMap((p) => [p.value, p.bench, p.invested]).filter((v) => v != null && isFinite(v));
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);
  const line = (k) => points.map((p, i) => `${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const end = points.at(-1);
  const fmtDate = (t) => new Date(t * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  // Evita que las etiquetas finales se pisen.
  const labels = [
    { v: end.value, cls: 'lc-lbl lc-lbl-main' },
    { v: end.bench, cls: 'lc-lbl lc-lbl-bench' },
  ].sort((a, b) => y(a.v) - y(b.v));
  if (labels.length === 2 && y(labels[1].v) - y(labels[0].v) < 14) labels[1].dy = 14 - (y(labels[1].v) - y(labels[0].v));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fan" role="img" aria-label="Evolución de la cartera frente al S&P 500">
      <polyline points={line('invested')} className="lc-invested" />
      <polyline points={line('bench')} className="lc-bench" />
      <polyline points={line('value')} className="lc-main" />
      <text x={padL} y={H - 6} className="fan-axis">{fmtDate(points[0].time)}</text>
      <text x={x(points.length - 1)} y={H - 6} textAnchor="end" className="fan-axis">{fmtDate(end.time)}</text>
      {labels.map((l) => (
        <text key={l.cls} x={W - padR + 6} y={y(l.v) + 4 + (l.dy || 0)} className={l.cls}>{fmtPrice(l.v, currency)}</text>
      ))}
    </svg>
  );
}
