// Packs each deck in src/ into one self-contained HTML file (styles, scripts,
// fonts and images inlined) that works offline and can be uploaded anywhere.
// usage: node pack.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const MIME = { '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const dataUri = (path) => `data:${MIME[extname(path)]};base64,${readFileSync(path).toString('base64')}`;

function inlineCss(file) {
  const css = readFileSync(join(src, file), 'utf8');
  const base = dirname(join(src, file));
  return css.replace(/url\(([^)'"]+)\)/g, (_, ref) => `url(${dataUri(join(base, ref))})`);
}

function pack(input, output) {
  let html = readFileSync(join(src, input), 'utf8');
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${inlineCss(href)}\n</style>`);
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, ref) => `<script>\n${readFileSync(join(src, ref), 'utf8')}\n</script>`);
  html = html.replace(/src="(assets\/[^"]+)"/g, (_, ref) => `src="${dataUri(join(src, ref))}"`);
  writeFileSync(join(root, output), html);
  console.log(`${output}: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
}

pack('through-his-eyes.html', '3ayni-through-his-eyes.html');
pack('hologram.html', '3ayni-hologram.html');
