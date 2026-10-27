import { SYMBOL_RE } from './market.js';

export function json(data, { status = 200, maxAge = 0 } = {}) {
  return Response.json(data, {
    status,
    // El navegador siempre revalida; la caché compartida (CDN) sí puede guardar la respuesta.
    headers: maxAge
      ? { 'Cache-Control': 'public, max-age=0, must-revalidate', 'CDN-Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}` }
      : { 'Cache-Control': 'no-store' },
  });
}

export function fail(e) {
  return json({ error: e?.message || 'Error inesperado' }, { status: e?.notFound ? 404 : 502 });
}

export function parseSymbol(v) {
  const s = (v || '').trim().toUpperCase();
  return SYMBOL_RE.test(s) ? s : null;
}
