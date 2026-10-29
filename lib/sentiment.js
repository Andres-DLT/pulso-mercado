// Sentimiento de titulares (en inglés, como los publica Yahoo) con un léxico financiero pequeño.
// Es orientativo: cuenta palabras, no entiende ironía ni contexto.
const POS = {
  beat: 1, beats: 1, tops: 1, surge: 1, surges: 1, soar: 1, soars: 1, jump: 0.8, jumps: 0.8, rally: 0.8, rallies: 0.8,
  gain: 0.6, gains: 0.6, rise: 0.5, rises: 0.5, climbs: 0.6, record: 0.7, high: 0.3, upgrade: 1, upgraded: 1, upgrades: 1,
  outperform: 0.8, buy: 0.5, bullish: 1, strong: 0.6, stronger: 0.6, growth: 0.5, grows: 0.5, raises: 0.7, raised: 0.6,
  boost: 0.6, boosts: 0.6, profit: 0.4, profitable: 0.6, approval: 0.8, approved: 0.8, wins: 0.7, win: 0.5, deal: 0.3,
  partnership: 0.4, expands: 0.5, expansion: 0.4, breakthrough: 0.8, optimism: 0.7, optimistic: 0.7, rebound: 0.6,
  recovers: 0.6, recovery: 0.5, dividend: 0.3, buyback: 0.6, upside: 0.6, momentum: 0.3, best: 0.5,
  soared: 1, surged: 1, jumped: 0.8, rallied: 0.8, gained: 0.6, rose: 0.5, climbed: 0.6, topped: 1, rebounds: 0.6, rebounded: 0.6,
};
const NEG = {
  miss: 1, misses: 1, missed: 1, plunge: 1, plunges: 1, tumble: 1, tumbles: 1, sink: 0.8, sinks: 0.8, slump: 0.9,
  slumps: 0.9, drop: 0.6, drops: 0.6, fall: 0.6, falls: 0.6, falling: 0.5, decline: 0.6, declines: 0.6, slide: 0.6,
  slides: 0.6, low: 0.3, downgrade: 1, downgraded: 1, downgrades: 1, underperform: 0.8, sell: 0.5, bearish: 1, weak: 0.7,
  weaker: 0.7, cut: 0.6, cuts: 0.6, lowers: 0.6, lowered: 0.6, warns: 0.8, warning: 0.7, loss: 0.6, losses: 0.6,
  lawsuit: 0.8, sued: 0.8, probe: 0.8, investigation: 0.8, recall: 0.8, layoffs: 0.7, fraud: 1, bankruptcy: 1, default: 0.8,
  delay: 0.5, delays: 0.5, halt: 0.7, halts: 0.7, ban: 0.7, fine: 0.5, fined: 0.7, crash: 1, crashes: 1, selloff: 0.9,
  fears: 0.7, fear: 0.6, risk: 0.3, risks: 0.3, concerns: 0.5, worst: 0.7, downside: 0.6, tariff: 0.4, tariffs: 0.4,
  plunged: 1, tumbled: 1, sank: 0.8, slumped: 0.9, dropped: 0.6, fell: 0.6, declined: 0.6, slid: 0.6, crashed: 1, worries: 0.6,
};
const NEGATORS = new Set(['not', 'no', "doesn't", "don't", "isn't", "won't", 'without', 'despite']);

export function headlineScore(title) {
  const words = title.toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/).filter(Boolean);
  let s = 0, hits = 0;
  words.forEach((w, i) => {
    const v = POS[w] ?? (NEG[w] != null ? -NEG[w] : 0);
    if (!v) return;
    const flip = NEGATORS.has(words[i - 1]) || NEGATORS.has(words[i - 2]);
    s += flip ? -v : v;
    hits++;
  });
  return hits ? Math.max(-1, Math.min(1, s / Math.sqrt(hits))) : 0;
}

// Titulares recientes pesan más (vida media ~3 días).
export function newsSentiment(news, now = Date.now() / 1000) {
  const items = news.map((n) => ({ ...n, sentiment: headlineScore(n.title) }));
  let w = 0, s = 0, scored = 0;
  for (const n of items) {
    const age = Math.max(0, (now - (n.time || now)) / 86400);
    const k = Math.pow(0.5, age / 3);
    w += k;
    s += k * n.sentiment;
    if (n.sentiment) scored++;
  }
  return { items, score: w ? s / w : 0, scored };
}
