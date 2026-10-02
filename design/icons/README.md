# Isotipos de marca

Fuente de los íconos de la app (favicon + PWA), aportados por el usuario
el 2026-09-11. No se sirven directo — quedan acá como fuente para volver a
generar los archivos reales si el diseño cambia. `public/` solo tiene lo
que la app necesita en runtime; estos SVG no se precachean con el resto
del build (`vite.config.ts`'s `globPatterns` barre `public/` completo).

- **`iso-favicon.svg`** — isotipo suelto, sin fondo (viewBox alto,
  262.86×372.94). Se usa tal cual como `public/favicon.svg`.
- **`iso-flow.svg`** — el mismo isotipo sobre un cuadrado sólido color
  marca (`#FF0055` magenta; antes `#40e0d0` turquesa, viewBox 606×606). Fuente de los tres PNG de
  `public/icons/` (`icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`) — el fondo cubre todo el cuadrado, así que
  sirve tal cual tanto para `purpose: "any"` como `"maskable"` sin
  necesitar un margen de seguridad aparte.

## Regenerar los PNG

No hay script permanente para esto (se generó una sola vez con `sharp`
como dependencia temporal, instalada y desinstalada en el momento). Para
repetirlo:

```bash
pnpm add -D sharp
node -e "
import('sharp').then(async ({ default: sharp }) => {
  const fs = await import('node:fs')
  const svg = fs.readFileSync('design/icons/iso-flow.svg')
  await sharp(svg, { density: 384 }).resize(192, 192).png().toFile('public/icons/icon-192.png')
  await sharp(svg, { density: 384 }).resize(512, 512).png().toFile('public/icons/icon-512.png')
  await sharp(svg, { density: 384 }).resize(512, 512).png().toFile('public/icons/icon-maskable-512.png')
})
"
pnpm remove sharp
```
