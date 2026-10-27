'use client';
import { useEffect, useState } from 'react';
import { fmtPrice } from '@/lib/format';

export default function AlertsPanel({ symbol, price, currency, alerts, setAlerts }) {
  const [op, setOp] = useState('above');
  const [value, setValue] = useState('');
  const [perm, setPerm] = useState('unsupported');

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPerm(Notification.permission);
  }, []);

  useEffect(() => {
    if (price) setValue((op === 'above' ? price * 1.02 : price * 0.98).toFixed(price < 1 ? 4 : 2));
  }, [symbol, op, !!price]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (e) => {
    e.preventDefault();
    const p = parseFloat(String(value).replace(',', '.'));
    if (!isFinite(p) || p <= 0) return;
    setAlerts((list) => [
      { id: crypto.randomUUID(), symbol, currency, op, price: p, createdAt: Date.now(), triggered: false },
      ...list,
    ].slice(0, 100));
  };

  const askPerm = async () => {
    if (typeof Notification === 'undefined') return;
    setPerm(await Notification.requestPermission());
  };

  const remove = (id) => setAlerts((l) => l.filter((a) => a.id !== id));
  const rearm = (id) => setAlerts((l) => l.map((a) => (a.id === id ? { ...a, triggered: false, triggeredAt: null } : a)));
  const sorted = [...alerts].sort((a, b) => (a.symbol === symbol ? -1 : 0) - (b.symbol === symbol ? -1 : 0) || Number(a.triggered) - Number(b.triggered));

  return (
    <section className="card">
      <div className="card-head">
        <h2>Alertas de precio</h2>
        {perm !== 'granted' && perm !== 'unsupported' && (
          <button className="btn ghost small" onClick={askPerm} disabled={perm === 'denied'}>
            {perm === 'denied' ? 'Notificaciones bloqueadas' : 'Activar notificaciones'}
          </button>
        )}
      </div>
      <form className="alert-form" onSubmit={add}>
        <span className="mono"><b>{symbol}</b></span>
        <select value={op} onChange={(e) => setOp(e.target.value)} aria-label="Condición">
          <option value="above">sube a ≥</option>
          <option value="below">baja a ≤</option>
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" aria-label="Precio objetivo" className="mono" />
        <button className="btn" type="submit">Crear</button>
      </form>
      {sorted.length === 0 ? (
        <p className="muted small">Sin alertas. Se comprueban cada 10 s mientras la app esté abierta y se guardan en este navegador.</p>
      ) : (
        <ul className="alert-list">
          {sorted.map((a) => (
            <li key={a.id} className={a.triggered ? 'fired' : ''}>
              <span className="mono"><b>{a.symbol}</b> {a.op === 'above' ? '≥' : '≤'} {fmtPrice(a.price, a.currency)}</span>
              <span className="muted small">
                {a.triggered ? `disparada ${new Date(a.triggeredAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'activa'}
              </span>
              <span className="row-actions">
                {a.triggered && <button className="btn ghost small" onClick={() => rearm(a.id)}>Rearmar</button>}
                <button className="btn ghost small" onClick={() => remove(a.id)} aria-label={`Eliminar alerta ${a.symbol}`}>✕</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
