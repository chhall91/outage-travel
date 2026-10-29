// Two simulated phones (390x844) talk on the forum through the tunnel. URL=... node scripts/shots-forum.mjs
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:8787/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
const mk = async () => { const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/nrc\.gov|CORS|Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'test report' : undefined)); return p; };
const wait = (p, ms = 900) => p.waitForTimeout(ms);
const name = async (p, n) => { await p.waitForSelector('#dname'); await p.fill('#dname', n); await p.tap('#nf button.primary'); };
const A = await mk();
await A.goto(URL); await A.evaluate(() => localStorage.clear()); await A.goto(URL + '#/'); await wait(A, 1500);
console.log('home forum entry:', !!(await A.$('#home-forum')));
await A.tap('a[href="#/add"]'); await A.fill('#pq', 'nine mile'); await A.tap('.pitem'); await wait(A, 300); if (await A.$('.use')) await A.tap('.use');
await A.tap('button[type=submit]'); await wait(A, 1500);
console.log('hub tiles:', await A.$$eval('.grid .tile.big b', (t) => t.map((x) => x.textContent)));
await wait(A, 2200); await A.screenshot({ path: 'screenshots/22-hub-forum-tile.png' });
await A.tap('a[href="#/forum/nine-mile-point"]'); await wait(A);
await A.tap('a[href^="#/forum/new"]'); await wait(A);
await A.tap('#cats [data-c=housing]'); await A.fill('#ftitle', 'Rooms near Oswego for spring outage?'); await A.fill('#fbody', 'Looking for 6–8 weeks starting March. Anyone have a landlord that rents to travelers?');
await A.tap('#tf button.primary'); await name(A, 'Colton H'); await A.waitForURL(/#\/forum\/t\//); await wait(A);
const tURL = A.url().split('#')[1];
await A.goto(URL + '#/forum/nine-mile-point'); await wait(A);
await A.tap('a[href^="#/forum/new"]'); await wait(A); await A.tap('#cats [data-c=rides]'); await A.fill('#ftitle', 'Carpool from Fulton, day shift'); await A.tap('#tf button.primary'); await A.waitForURL(/#\/forum\/t\//); await wait(A);

const B = await mk();
await B.goto(URL + '#/forum/nine-mile-point'); await wait(B, 1500);
console.log('B sees threads:', await B.$$eval('.tcard b', (t) => t.map((x) => x.textContent)));
await B.tap(`a[href="#${tURL}"]`); await wait(B);
await B.fill('#rbody', 'Lake Ontario Motel does weekly rates, ~$450/wk. Book early, fills up by February.'); await B.tap('#rf button.primary');
await name(B, 'Sparky'); await wait(B, 1200);
await A.goto(URL + '#' + tURL); await wait(A, 1200);
console.log('A sees replies:', await A.$$eval('.post.reply .pre', (t) => t.map((x) => x.textContent)));
await A.fill('#rbody', 'Thanks! Calling them today.'); await A.tap('#rf button.primary'); await wait(A, 1200);
await B.reload(); await wait(B, 1200);
const replies = await B.$$eval('.post.reply', (t) => t.map((x) => x.querySelector('.fmeta b').textContent + ': ' + x.querySelector('.pre').textContent));
console.log('B sees conversation:', replies);
// B edits own reply
await B.tap('.post.reply a[href*="/edit/reply/"]'); await wait(B); await B.fill('#fbody', 'Lake Ontario Motel does weekly rates, about $450/wk. Book early — fills up by February.'); await B.tap('#ef button.primary'); await wait(B, 1200);
console.log('edited flag:', await B.$eval('.post.reply .fmeta', (x) => x.textContent));
// B reports A's ride thread
await B.goto(URL + '#/forum/nine-mile-point'); await wait(B, 1200);
await B.screenshot({ path: 'screenshots/23-forum-board.png' });
await B.goto(URL + '#' + tURL); await wait(B, 1200); await B.screenshot({ path: 'screenshots/24-forum-thread.png', fullPage: true });
console.log('report btn on others:', await B.$$eval('[data-rep]', (x) => x.length), 'edit/delete on own:', await B.$$eval('[data-del]', (x) => x.length));
await B.tap('[data-rep="reply"]'); await wait(B);
await B.goto(URL + '#/forum/overall'); await wait(B, 1200); console.log('overall board ok, switch:', await B.$$eval('.seg .segbtn', (x) => x.map((y) => y.textContent)));
await A.goto(URL + '#/forum/nine-mile-point?c=housing'); await wait(A, 1200); console.log('housing filter:', await A.$$eval('.tcard b', (t) => t.map((x) => x.textContent)), 'counts:', await A.$$eval('.chip', (c) => c.map((x) => x.textContent.trim())));
console.log('errors:', errors.length ? errors : 'none'); await b.close();
