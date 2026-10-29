// Fetches the NRC daily power reactor status (365 days) with headless Chrome (nrc.gov blocks plain HTTP clients)
// and writes public/reactor-status.json. Run by the scheduled GitHub Action and locally.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { parseStatus, NRC_STATUS_URL } from '../src/lib/status.js';
const exe = process.env.CHROME || '/usr/bin/google-chrome';
const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
try {
  const p = await b.newPage();
  const r = await p.goto(NRC_STATUS_URL, { timeout: 60000 });
  const text = await r.text();
  if (r.status() !== 200 || !text.startsWith('ReportDt|')) throw new Error(`NRC fetch failed: HTTP ${r.status()}`);
  const snap = { ...parseStatus(text), fetchedAt: new Date().toISOString() };
  const n = Object.keys(snap.units).length;
  if (n < 80) throw new Error(`Only ${n} units parsed`);
  writeFileSync('public/reactor-status.json', JSON.stringify(snap));
  console.log(`report ${snap.reportDate}, ${n} units, ${Object.values(snap.units).filter((u) => u.power === 0).length} offline`);
} finally { await b.close(); }
