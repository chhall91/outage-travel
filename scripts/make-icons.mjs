import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 0.12], ['apple-touch-icon.png', 180, 0]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:#111418"><div style="padding:${size * pad}px">${svg.replace('<svg ', `<svg width="${size * (1 - 2 * pad)}" height="${size * (1 - 2 * pad)}" `)}</div></body>`);
  await p.screenshot({ path: `public/icons/${name}` }); await p.close();
}
await b.close();
