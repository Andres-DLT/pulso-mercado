'use client';
import { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { sma, bollinger } from '@/lib/indicators';

const C = {
  text: '#8b95a7',
  grid: 'rgba(139,149,167,0.08)',
  up: '#22c55e',
  down: '#ef4444',
  sma20: '#f5b942',
  sma50: '#60a5fa',
  bb: 'rgba(167,139,250,0.75)',
  alert: '#f97316',
};

function toLine(candles, values) {
  const out = [];
  for (let i = 0; i < candles.length; i++) if (values[i] != null) out.push({ time: candles[i].time, value: values[i] });
  return out;
}

export default function PriceChart({ candles, intraday, overlays, alerts, livePrice, resetKey, height = 420 }) {
  const el = useRef(null);
  const api = useRef(null);
  const lastReset = useRef(null);

  useEffect(() => {
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: C.text, fontFamily: 'var(--font-mono), monospace', fontSize: 11 },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.24 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4, fixLeftEdge: true },
      localization: { locale: 'es-ES' },
    });
    const candleS = chart.addCandlestickSeries({
      upColor: C.up, downColor: C.down, wickUpColor: C.up, wickDownColor: C.down, borderVisible: false,
    });
    const volS = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const line = (color, style = LineStyle.Solid) =>
      chart.addLineSeries({ color, lineWidth: 1.5, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    api.current = {
      chart, candleS, volS,
      sma20: line(C.sma20), sma50: line(C.sma50),
      bbU: line(C.bb, LineStyle.Dashed), bbL: line(C.bb, LineStyle.Dashed),
      priceLines: [], last: null,
    };
    return () => {
      chart.remove();
      api.current = null;
    };
  }, []);

  // Datos e indicadores.
  useEffect(() => {
    const a = api.current;
    if (!a || !candles) return;
    const data = [];
    for (const c of candles) if (!data.length || c.time > data.at(-1).time) data.push(c);
    a.chart.applyOptions({ timeScale: { timeVisible: intraday } });
    a.candleS.setData(data);
    a.volS.setData(data.map((c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)' })));
    const closes = data.map((c) => c.close);
    const bb = overlays.bb ? bollinger(closes, 20, 2) : null;
    a.sma20.setData(overlays.sma20 ? toLine(data, sma(closes, 20)) : []);
    a.sma50.setData(overlays.sma50 ? toLine(data, sma(closes, 50)) : []);
    a.bbU.setData(bb ? toLine(data, bb.upper) : []);
    a.bbL.setData(bb ? toLine(data, bb.lower) : []);
    a.last = data.at(-1) ?? null;
    if (lastReset.current !== resetKey && data.length) {
      requestAnimationFrame(() => api.current?.chart.timeScale().fitContent());
      lastReset.current = resetKey;
    }
  }, [candles, intraday, overlays, resetKey]);

  // Precio en vivo: actualiza la última vela entre recargas del gráfico.
  useEffect(() => {
    const a = api.current;
    if (!a?.last || livePrice == null || !intraday) return;
    const l = a.last;
    const next = { ...l, close: livePrice, high: Math.max(l.high, livePrice), low: Math.min(l.low, livePrice) };
    a.candleS.update(next);
    a.last = next;
  }, [livePrice, intraday]);

  // Líneas de alertas activas.
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    a.priceLines.forEach((pl) => a.candleS.removePriceLine(pl));
    a.priceLines = (alerts || []).map((al) =>
      a.candleS.createPriceLine({
        price: al.price, color: C.alert, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true,
        title: al.op === 'above' ? '▲ alerta' : '▼ alerta',
      })
    );
  }, [alerts]);

  return <div ref={el} style={{ width: '100%', height }} />;
}
