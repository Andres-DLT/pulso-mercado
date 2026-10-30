# Pulso

App web para seguir el mercado en vivo: cotizaciones en tiempo real, gráficos de velas, alertas de
precio, análisis técnico, un pronóstico estadístico y un ranking de activos. Hecha con Next.js 16 y
publicada en Vercel: https://pulso-mercado.vercel.app

## Funciones

- **Mercado** (`/`): lista de seguimiento con precios cada 10 s, gráfico de velas (1D–5A) con SMA 20/50 y
  Bollinger, búsqueda de cualquier símbolo de Yahoo Finance (acciones, ETF, cripto, índices).
- **Señal técnica**: puntuación de −100 a +100 que combina tendencia (SMA 50/200), pendiente, RSI, MACD,
  Bollinger, estocástico, ADX, flujo de volumen (OBV), momentum de 3 meses, fuerza relativa frente al S&P 500
  y el tono de las noticias recientes.
- **Noticias**: titulares recientes del activo con su tono estimado (positivo, negativo o neutro).
- **Pronóstico**: paseo aleatorio con deriva contraída; precio esperado, rango del 90 % y probabilidad de subida
  a 5, 20 y 60 sesiones.
- **Fiabilidad**: backtest walk-forward de ~2 años que compara el acierto de la señal con la línea base y la
  rentabilidad de seguir la señal frente a comprar y mantener.
- **Alertas**: por encima/debajo de un precio; aviso en pantalla, sonido y notificación del navegador.
  Opcionalmente, avisos push aunque la app esté cerrada (ver configuración).
- **Ranking** (`/ranking`): 36 activos populares ordenables por señal, retorno esperado, probabilidad, momentum
  y rendimiento frente al S&P 500.
- **Cartera** (`/cartera`): simulador con 10.000 US$ virtuales y registro de la cartera real, con ganancias,
  reparto y evolución frente a invertir lo mismo en el S&P 500. Se guarda en el navegador.

## Desarrollo

```bash
npm install
npm run dev
```

## Despliegue (Vercel)

El proyecto está importado en Vercel (plan Hobby, gratuito) desde la rama `main` de este repositorio:
cada `git push` a `main` compila y publica una nueva versión, y cada rama o PR obtiene una URL de vista previa.
La app funciona sin variables de entorno. Variables opcionales:

| Variable | Para qué |
|---|---|
| `FINNHUB_API_KEY` | Respaldo de cotizaciones de EE. UU. si Yahoo no responde (clave gratuita de finnhub.io). |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (integración de Vercel) para guardar las alertas push. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Claves para enviar notificaciones push (`npx web-push generate-vapid-keys`). |
| `CRON_SECRET` | Protege `/api/push/check`, que revisa las alertas. |

`node scripts/setup-push.cjs` genera las claves VAPID y el `CRON_SECRET`, las guarda en `.env.local` y las añade
a Vercel (producción).

Los avisos push se revisan cuando un programador llama a `GET /api/push/check` con la cabecera
`Authorization: Bearer <CRON_SECRET>`. Vercel Cron (plan Hobby) lo hace una vez al día; para revisarlas cada pocos
minutos se puede usar un servicio externo como cron-job.org.

## Limitaciones

- Los datos vienen de los endpoints públicos no oficiales de Yahoo Finance. Si fallan, se sirve el último dato
  conocido (hasta 6 h) y, con `FINNHUB_API_KEY`, Finnhub. Para tráfico alto o uso comercial conviene un proveedor
  con licencia.
- El tono de las noticias se estima con un léxico de palabras clave en inglés: es orientativo.
- Las señales y pronósticos son modelos estadísticos y no constituyen asesoramiento financiero.
