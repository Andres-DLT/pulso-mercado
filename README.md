# Pulso — mercado en vivo y análisis técnico

App web (Next.js 16) con cotizaciones en tiempo real, gráficos de velas en vivo, alertas de precio,
análisis técnico, pronóstico estadístico y un ranking de activos.

## Funciones

- **Mercado** (`/`): lista de seguimiento con precios cada 10 s, gráfico de velas (1D–5A) con SMA 20/50 y
  Bollinger, búsqueda de cualquier símbolo de Yahoo Finance (acciones, ETF, cripto, índices).
- **Señal técnica**: puntuación de −100 a +100 que combina tendencia (SMA 50/200), pendiente, RSI, MACD,
  Bollinger, momentum de 3 meses y volumen.
- **Pronóstico**: paseo aleatorio con deriva contraída; precio esperado, rango del 90 % y probabilidad de subida
  a 5, 20 y 60 sesiones.
- **Fiabilidad**: backtest walk-forward de ~2 años que compara el acierto de la señal con la línea base.
- **Alertas**: por encima/debajo de un precio; aviso en pantalla, sonido y notificación del navegador.
  Se guardan en el navegador del usuario (localStorage) y se comprueban mientras la app está abierta.
- **Ranking** (`/ranking`): 36 activos populares ordenables por señal, retorno esperado, probabilidad y momentum.

## Desarrollo

```bash
npm install
npm run dev
```

## Despliegue (Firebase App Hosting)

El backend de App Hosting está conectado a la rama `main` de este repositorio: cada `git push` a `main`
compila y publica una nueva versión. La configuración de Cloud Run está en `apphosting.yaml`.
Requiere el plan Blaze. No necesita variables de entorno.

## Limitaciones

- Los datos vienen de los endpoints públicos no oficiales de Yahoo Finance. Para tráfico alto o uso comercial,
  conviene cambiar `lib/market.js` a un proveedor con licencia (Finnhub, Polygon, Alpha Vantage…).
- Las señales y pronósticos son modelos estadísticos y no constituyen asesoramiento financiero.
