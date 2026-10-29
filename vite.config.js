import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Tiny plugin: after build, inject the full list of output files into dist/sw.js so the whole
// app is precached on first load and works with no signal.
function precacheSW() {
  let base = '/', outDir = 'dist';
  return {
    name: 'precache-sw',
    apply: 'build',
    configResolved(c) { base = c.base; outDir = c.build.outDir.startsWith('/') ? c.build.outDir : join(c.root, c.build.outDir); },
    closeBundle() {
      const dist = outDir;
      const files = [];
      const walk = (dir) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (statSync(p).isDirectory()) walk(p);
          else if (!f.endsWith('sw.js') && !f.endsWith('.map')) files.push(relative(dist, p).split('\\').join('/'));
        }
      };
      walk(dist);
      const hash = createHash('sha256');
      for (const f of files.sort()) hash.update(f + readFileSync(join(dist, f)).length);
      const version = hash.digest('hex').slice(0, 10);
      const list = [base, ...files.map((f) => base + f)];
      const swPath = join(dist, 'sw.js');
      const src = readFileSync(swPath, 'utf8')
        .replaceAll('__VERSION__', version)
        .replace("self.__PRECACHE__ ||", `${JSON.stringify(list)} ||`);
      writeFileSync(swPath, src);
      console.log(`[precache-sw] base ${base}, version ${version}, ${list.length} files precached`);
    },
  };
}

// GH_PAGES=1 → build for https://<user>.github.io/outage-travel/ (static hosting, no /api sync server).
const GH = !!process.env.GH_PAGES;

export default defineConfig({
  base: GH ? '/outage-travel/' : '/',
  
  plugins: [precacheSW()],
  build: { target: 'es2019' },
  // allow access through a Cloudflare quick tunnel
  preview: { allowedHosts: ['.trycloudflare.com'] },
  test: { include: ['tests/**/*.test.js'] },
});
