import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata = {
  title: 'Pulso — Mercado en vivo y análisis técnico',
  description: 'Cotizaciones en tiempo real, gráficos en vivo, alertas de precio, análisis técnico y pronósticos estadísticos de acciones, ETFs y cripto.',
};

export const viewport = { themeColor: '#0b0f17', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${sans.variable} ${mono.variable}`}>
      <body>
        {children}
        <footer className="disclaimer">
          Pulso es una herramienta informativa y educativa. Las señales y pronósticos son modelos estadísticos sobre datos
          históricos, pueden equivocarse y <b>no constituyen asesoramiento financiero</b> ni una recomendación de compra o venta.
          Invertir conlleva riesgo de pérdida. Datos de Yahoo Finance; pueden tener retraso.
        </footer>
      </body>
    </html>
  );
}
