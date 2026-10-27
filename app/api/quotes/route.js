import { getQuote, mapLimit } from '@/lib/market';
import { json, parseSymbol } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const raw = new URL(req.url).searchParams.get('symbols') || '';
  const symbols = [...new Set(raw.split(',').map(parseSymbol).filter(Boolean))].slice(0, 40);
  if (!symbols.length) return json({ error: 'Parámetro symbols requerido' }, { status: 400 });
  const quotes = await mapLimit(symbols, 8, getQuote);
  return json({ quotes, at: Date.now() });
}
