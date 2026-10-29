export default function manifest() {
  return {
    name: 'Pulso — Mercado en vivo',
    short_name: 'Pulso',
    description: 'Cotizaciones en vivo, alertas de precio, análisis técnico y cartera.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0f17',
    theme_color: '#0b0f17',
    lang: 'es',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
