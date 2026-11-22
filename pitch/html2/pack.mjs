// Packs src/index.html into one self-contained file (styles, scripts, fonts,
// photographs and video inlined) that works offline. usage: node pack.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const MIME = { '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm', '.webp': 'image/webp' };
const dataUri = (path) => `data:${MIME[extname(path)]};base64,${readFileSync(path).toString('base64')}`;

let html = readFileSync(join(src, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  const css = readFileSync(join(src, href), 'utf8').replace(/url\(([^)'"]+)\)/g, (m, ref) => `url(${dataUri(join(src, ref))})`);
  return `<style>\n${css}\n</style>`;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, ref) => `<script>\n${readFileSync(join(src, ref), 'utf8')}\n</script>`);
html = html.replace(/src="(media\/[^"]+)"/g, (_, ref) => `src="${dataUri(join(src, ref))}"`);
const out = join(root, '3ayni-through-his-eyes.html');
writeFileSync(out, html);
console.log(`3ayni-through-his-eyes.html: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB`);
