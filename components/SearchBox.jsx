'use client';
import { useEffect, useRef, useState } from 'react';
import { getJson } from '@/lib/hooks';

export default function SearchBox({ onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      getJson(`/api/search?q=${encodeURIComponent(q.trim())}`, ctl.signal)
        .then((d) => { setResults(d.results || []); setActive(0); })
        .catch(() => {});
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (r) => {
    onPick(r.symbol);
    setQ('');
    setResults([]);
    setOpen(false);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      if (results[active]) pick(results[active]);
      else if (q.trim()) pick({ symbol: q.trim().toUpperCase() });
    } else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="search" ref={box}>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Buscar acción, ETF o cripto (ej. Tesla, SPY, BTC)"
        aria-label="Buscar símbolo"
      />
      {open && results.length > 0 && (
        <ul className="search-list" role="listbox">
          {results.map((r, i) => (
            <li key={r.symbol} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(r); }}>
              <b>{r.symbol}</b>
              <span className="muted ellipsis">{r.name}</span>
              <span className="tag">{r.type}{r.exchange ? ` · ${r.exchange}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
