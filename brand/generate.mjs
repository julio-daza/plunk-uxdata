// Regenerates every file in brand/web/ from the Uxdata source SVGs in brand/src/.
// Run locally only when the brand changes (outputs are committed; CI never runs this):
//   cd brand && npm install && node generate.mjs
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'web');
const iso = readFileSync(join(here, 'src/uxdata-isotipo.svg'), 'utf8');

// The isotipo path lives under two nested translate() groups; flatten them.
const d = iso.match(/<path d="([^"]+)"/)[1];
const TX = -840.565563 - 499.884854;
const TY = -1781.033711 + 1483.139529;
// Mark bounds after the translation: x 1.06..300.6, y 0..123.4.
const CX = 150.8;
const CY = 61.7;

/** Square SVG with the isotipo centered; `size` = side of the viewBox in mark units (bigger = more padding). */
function squareSvg({size, fill = '#000', background = null, adaptive = false}) {
  const x = CX - size / 2;
  const y = CY - size / 2;
  const style = adaptive
    ? '<style>path { fill: #000; } @media (prefers-color-scheme: dark) { path { fill: #fff; } }</style>'
    : '';
  const bg = background ? `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${background}"/>` : '';
  const pathFill = adaptive ? '' : ` fill="${fill}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${size} ${size}">${style}${bg}<g transform="translate(${TX} ${TY})"><path${pathFill} fill-rule="evenodd" d="${d}"/></g></svg>\n`;
}

const png = (svg, px) => sharp(Buffer.from(svg), {density: 72 * (px / 300) * 4}).resize(px, px).png().toBuffer();

async function main() {
  mkdirSync(join(out, 'assets'), {recursive: true});
  mkdirSync(join(out, 'favicon'), {recursive: true});
  const write = (p, data) => writeFileSync(join(out, p), data);

  const tight = squareSvg({size: 316});
  write('assets/logo.svg', tight);
  write('assets/logo.png', await png(tight, 1080));

  write('favicon/favicon.svg', squareSvg({size: 316, adaptive: true}));
  write('favicon/safari-pinned-tab.svg', tight);
  const f16 = await png(tight, 16);
  const f32 = await png(tight, 32);
  const f48 = await png(tight, 48);
  write('favicon/favicon-16x16.png', f16);
  write('favicon/favicon-32x32.png', f32);
  const ico = await pngToIco([f16, f32, f48]);
  write('favicon/favicon.ico', ico);
  write('favicon.ico', ico);

  // Home-screen icons: iOS paints transparent pixels black, so these get a white tile.
  const tile = squareSvg({size: 420, background: '#ffffff'});
  write('favicon/apple-touch-icon.png', await png(tile, 180));
  write('favicon/android-chrome-192x192.png', await png(tile, 192));
  write('favicon/android-chrome-512x512.png', await png(tile, 512));
  write('favicon/mstile-150x150.png', await png(squareSvg({size: 420}), 270));

  // Link-preview image (og:image): wordmark centered on white, 1200x630.
  const wordmark = await sharp(join(here, 'src/uxdata-logo.svg'), {density: 300}).resize({width: 640}).png().toBuffer();
  write(
    'assets/og.png',
    await sharp({create: {width: 1200, height: 630, channels: 4, background: '#ffffff'}})
      .composite([{input: wordmark, gravity: 'center'}])
      .png()
      .toBuffer(),
  );
  console.log('brand/web regenerated');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
