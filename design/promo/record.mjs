// Records a vertical promo of Pass The Mic by driving the real app (local dev server) in headless Chrome.
// Usage: node record.mjs <outDir>
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(process.env.PUPPETEER_FROM + '/');
const puppeteer = require('puppeteer-core');
const OUT = process.argv[2];
const FRAMES = join(OUT, 'frames');
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  // headless windows can't go below 500px wide, so record a 540x960 page at 2x = 1080x1920
  args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--force-color-profile=srgb', '--force-device-scale-factor=2', '--window-size=540,1047'],
  defaultViewport: null,
});
const [page] = await browser.pages();
await page.goto('http://localhost:5174/', { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 600));

// ---- helpers living in the page
await page.evaluate(() => {
  const $ = (s) => document.querySelector(s);
  window.$p = $;
  const style = document.createElement('style');
  style.textContent = `
    #ytwrap, .replay-box, #installBtn { display: none !important; }
    #cap { position: fixed; left: 14px; right: 14px; bottom: 26px; z-index: 90; text-align: center; pointer-events: none; }
    #cap span { display: inline-block; font: 400 40px/1.02 Anton, Impact, sans-serif; letter-spacing: .01em; color: #1a0d06;
      background: linear-gradient(180deg, #ffc23d, #ff6b1a); padding: 8px 14px 6px; border-radius: 14px; transform: rotate(-2deg);
      box-shadow: 0 6px 0 #b8430a, 0 20px 40px rgba(0,0,0,.6); animation: capIn .35s cubic-bezier(.3,1.6,.5,1); }
    #cap span.dark { color: #fff4e6; background: #1d110c; box-shadow: 0 0 0 2px #ffc23d, 0 20px 40px rgba(0,0,0,.6); }
    @keyframes capIn { from { transform: rotate(-2deg) scale(.4); opacity: 0; } }
    .tv-demo { position: absolute; inset: 0; border-radius: 16px; overflow: hidden; background: radial-gradient(circle at 30% 30%, #ff6b1a, #2a0f05 70%); border: 3px solid #3a2a22; display: grid; place-items: center; }
    .tv-demo i { position: absolute; top: 10px; left: 10px; font: 800 9px "DM Sans"; letter-spacing: .12em; color: #fff; background: #ff2e63; border-radius: 4px; padding: 2px 6px; font-style: normal; }
    .tv-demo .bars { display: flex; gap: 6px; align-items: end; height: 70px; }
    .tv-demo .bars b { width: 12px; border-radius: 4px; background: #fff4e6; animation: tvb .8s ease-in-out infinite; }
    @keyframes tvb { 0%,100% { height: 18px; } 50% { height: 70px; } }
    .endcard { position: fixed; inset: 0; z-index: 80; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; text-align: center; padding: 20px;
      background: radial-gradient(120% 60% at 50% -10%, rgba(255,107,26,.4), transparent 60%), #120a07; animation: enter .4s ease-out; }
    .endcard .logo { font-size: 140px; }
    .endcard .url { font: 800 24px "DM Sans"; color: #1a0d06; background: #fff4e6; border-radius: 999px; padding: 12px 20px; }
    .endcard .sub { color: rgba(255,244,230,.75); font: 600 19px "DM Sans"; }
  `;
  document.head.appendChild(style);
  const cap = document.createElement('div');
  cap.id = 'cap';
  document.body.appendChild(cap);
  window.caption = (t, dark = false) => { cap.innerHTML = t ? `<span class="${dark ? 'dark' : ''}">${t}</span>` : ''; };
  window.screenTo = (id) => {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 's-' + id));
    const g = ['handoff', 'listen', 'turn', 'reveal'].includes(id);
    $('#board').classList.toggle('hidden', !g);
    scrollTo(0, 0);
    dispatchEvent(new Event('resize'));
  };
  const P = [['John', 1, '😎', 3], ['Ada', 2, '🤩', 3], ['Tunde', 3, '🥳', 2], ['Kemi', 4, '😜', 3]];
  window.board = (cur, lives) => {
    $('#board').innerHTML = `<div class="board-top"><div class="songname">🎵 LAST LAST · BURNA BOY</div><button class="menu-btn">☰ Menu</button></div><div class="pl">${P.map(([n, c, f, l], i) => `<span class="pc ${i === cur ? 'cur' : ''}"><span class="av sm c${c}">${f}</span><b>${n}</b><span class="hearts">${'❤️'.repeat(lives?.[i] ?? l)}</span></span>`).join('')}</div>`;
  };
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const marks = [];
const mark = (name) => marks.push([name, Date.now() / 1000]);
const ev = (fn, ...a) => page.evaluate(fn, ...a);

// ---- start recording (frames arrive with timestamps; assembled at a constant 30fps afterwards)
const cdp = await page.createCDPSession();
const frames = [];
cdp.on('Page.screencastFrame', async (f) => {
  frames.push({ t: f.metadata.timestamp, data: f.data });
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });

// 1 · HOME
await ev(() => { screenTo('home'); caption('NEW PARTY GAME 🎤'); });
mark('home');
await wait(2600);

// 2 · LOBBY
await ev(() => {
  screenTo('lobby');
  $p('#roomCode').textContent = 'BZ7U';
  $p('#livesWrap').classList.remove('hidden'); $p('#lobbyStart').classList.remove('hidden');
  $p('#lobbyCount').textContent = "Who's in · 4";
  $p('#lobbyList').innerHTML = '';
  $p('#readyUp').classList.add('on'); $p('#readyUp').textContent = '✓ Ready! Sound and mic are on';
  $p('#lobbyStatus').textContent = '4/4 ready';
  caption('PLAY WITH FRIENDS · ONLINE OR ONE PHONE', true);
});
mark('lobby');
const crowd = [['John', 1, '😎', '👑 host'], ['Ada', 2, '🤩', 'ready'], ['Tunde', 3, '🥳', 'ready'], ['Kemi', 4, '😜', 'ready']];
for (let i = 0; i < crowd.length; i++) {
  mark('pop');
  await ev((m) => { const [n, c, f, tag] = m; $p('#lobbyList').insertAdjacentHTML('beforeend', `<li><span class="av lg c${c} ready">${f}</span><span class="nm">${n}</span><span class="tag ${tag === 'ready' ? 'ok' : ''}">${tag}</span></li>`); }, crowd[i]);
  await wait(420);
}
await wait(1000);

// 3 · LISTEN
await ev(() => {
  board(1);
  screenTo('listen');
  $p('.deck .tv-slot').innerHTML = '<div class="tv-demo"><i>LIVE</i><div class="bars"><b></b><b style="animation-delay:-.2s"></b><b style="animation-delay:-.5s"></b><b style="animation-delay:-.1s"></b><b style="animation-delay:-.65s"></b></div></div>';
  $p('.deck .tv-slot').style.position = 'relative';
  $p('#vinylArt').removeAttribute('src');
  $p('#vinyl').classList.remove('stopped');
  $p('#npTitle').textContent = 'Last Last';
  $p('#npArtist').textContent = 'Burna Boy · Naija Anthems';
  $p('#listenName').textContent = 'ADA';
  $p('#upAv').innerHTML = '<span class="av sm c2">🤩</span>';
  caption('THE SONG PLAYS…');
});
mark('listen');
const lines = [['', 'Shayo oh, nah', 'Shayo oh, igbo-oh'], ['Shayo oh, nah', 'Shayo oh, igbo-oh', '🎤 · · ·']];
for (const [p, c, n] of lines) {
  await ev((p, c, n) => {
    $p('#kara .prev').textContent = p; const cur = $p('#kara .cur'); cur.textContent = c; cur.classList.remove('pop'); void cur.offsetWidth; cur.classList.add('pop');
    const nx = $p('#kara .next'); nx.textContent = n; nx.classList.toggle('mystery', n.startsWith('🎤'));
  }, p, c, n);
  await wait(1700);
}

// 4 · THE CUT
await ev(() => { caption(''); $p('#vinyl').classList.add('stopped'); document.body.classList.add('cutting'); });
mark('cut');
await wait(900);
await ev(() => document.body.classList.remove('cutting'));

// 5 · YOUR TURN
const target = ['You', 'go', 'bow', 'for', 'the', 'result', 'oh'];
await ev((words) => {
  board(1);
  screenTo('turn');
  $p('#turnAv').innerHTML = '<span class="av xl c2">🤩</span>';
  $p('#turnName').textContent = 'Ada · your turn in';
  $p('#cue').textContent = '“…Shayo oh, igbo-oh”';
  $p('#chips').innerHTML = words.map((w, i) => `<span class="w${i === 0 ? ' hint' : ''}" style="--len:${Math.max(2, w.length)}"><b>${w}</b></span>`).join('');
  $p('#heard').textContent = '';
  $p('#doneBtn').classList.remove('hidden');
  $p('#timerBar').style.transition = 'none'; $p('#timerBar').style.strokeDashoffset = '0';
  const go = $p('#goTxt'); go.className = 'go count'; go.textContent = '3';
  caption('…YOU SING THE NEXT LINE');
}, target);
mark('tick');
for (const n of ['2', '1']) { await wait(550); await ev((n) => { const g = $p('#goTxt'); g.className = 'go'; void g.offsetWidth; g.className = 'go count'; g.textContent = n; }, n); mark('tick'); }
await wait(550);
await ev(() => {
  const g = $p('#goTxt'); g.className = 'go sing'; g.textContent = 'SING!'; $p('#turnName').textContent = 'Ada · go!';
  window.__singAt = performance.now();
  $p('#timerBar').style.transition = 'stroke-dashoffset 6s linear'; requestAnimationFrame(() => { $p('#timerBar').style.strokeDashoffset = '170'; });
  // lively waveform while she sings
  const bars = [...$p('#wave').children];
  window.__wv = setInterval(() => { const t = performance.now() / 1000; bars.forEach((b, i) => { const s = Math.abs(Math.sin(i * 1.7 + t * 7)) * 0.7 + Math.abs(Math.sin(i * 0.6 - t * 10)) * 0.3; b.style.height = `${8 + 44 * s}px`; }); }, 60);
});
mark('sing');
const heard = ['you', 'you go', 'you go bow', 'you go bow for', 'you go bow for the', 'you go bow for the result', 'you go bow for the result oh'];
for (let i = 1; i < target.length; i++) {
  await wait(520);
  await ev((i, h) => { $p('#chips').children[i].classList.add('ok'); $p('#heard').textContent = `👂 “${h}”`; }, i, heard[i]);
  mark('word');
}
await ev(() => { $p('#chips').children[0].classList.add('ok'); });
await wait(900);
await ev(() => { clearInterval(window.__wv); $p('#goTxt').className = 'go'; $p('#goTxt').textContent = 'SCORING…'; });
mark('scoring');
await wait(600);

// 6 · REVEAL (pass)
await ev((words) => {
  board(1);
  screenTo('reveal');
  $p('#revWho').textContent = 'Ada · Round 3';
  $p('#stamp').className = 'stamp hidden';
  $p('#revChips').innerHTML = words.map((w, i) => `<span class="w ok" style="--len:${Math.max(2, w.length)};animation-delay:${0.9 + i * 0.09}s"><b>${w}</b></span>`).join('');
  $p('#revHeard').textContent = 'AI heard: “you go bow for the result oh”';
  $p('#verdict').className = 'verdict'; $p('#verdict').textContent = '';
  $p('#voteBox').classList.add('hidden'); $p('#contBtn').classList.add('hidden'); $p('#holdBtn').classList.add('hidden');
  $p('#standings').innerHTML = '';
  $p('#dialFg').style.strokeDashoffset = '408.4';
  caption('THE AI IS LISTENING 👂', true);
  const t0 = performance.now(), to = 96;
  (function f(now) { const k = Math.min(1, (now - t0) / 1100), v = to * (1 - Math.pow(1 - k, 3)); $p('#scoreNum').textContent = Math.round(v) + '%'; $p('#dialFg').style.strokeDashoffset = String(408.4 * (1 - v / 100)); if (k < 1) requestAnimationFrame(f); })(t0);
}, target);
mark('reveal');
await wait(1500);
await ev(() => {
  $p('#stamp').className = 'stamp pass'; $p('#stamp').textContent = 'PASS';
  $p('#verdict').className = 'verdict pass'; $p('#verdict').textContent = 'NAILED IT 🔥';
  $p('#standings').innerHTML = [['Ada', 2, '🤩', 3, 286, '+96'], ['John', 1, '😎', 3, 240], ['Tunde', 3, '🥳', 2, 175]].map(([n, c, f, l, pts, d], i) => `<div class="st ${i ? '' : 'me'}"><span class="av sm c${c}">${f}</span><span class="nm">${n}</span>${d ? `<span class="delta">${d}</span>` : ''}<span class="hearts">${'❤️'.repeat(l)}</span><span class="pts">${pts}</span></div>`).join('');
  $p('#contBtn').classList.remove('hidden'); $p('#contBtn').classList.add('counting'); $p('#contBtn').textContent = 'NEXT: TUNDE →  5';
});
mark('pass');
await wait(2300);

// 7 · MISS IT (drama)
await ev(() => {
  board(2, [3, 3, 1, 3]);
  screenTo('reveal');
  $p('#revWho').textContent = 'Tunde · Round 3';
  $p('#contBtn').classList.add('hidden');
  $p('#standings').innerHTML = '';
  const words = ['Nothing', 'to', 'discuss', 'oh'];
  $p('#revChips').innerHTML = words.map((w, i) => `<span class="w ${i === 1 ? 'ok' : 'miss'}" style="--len:${w.length};animation-delay:${0.3 + i * 0.09}s"><b>${w}</b></span>`).join('');
  $p('#revHeard').textContent = 'AI heard: “nobody to this cuss”';
  $p('#scoreNum').textContent = '21%'; $p('#dialFg').style.strokeDashoffset = String(408.4 * 0.79);
  $p('#stamp').className = 'stamp hidden';
  $p('#verdict').className = 'verdict fail'; $p('#verdict').textContent = 'LOST A LIFE 💔 1 LEFT';
  caption('MISS IT, LOSE A LIFE 💀');
});
mark('miss');
await wait(500);
await ev(() => { $p('#stamp').className = 'stamp fail'; $p('#stamp').textContent = 'MISS'; });
mark('missStamp');
await wait(1900);

// 8 · LEADERBOARD
await ev(() => {
  screenTo('leaders');
  $p('#leadersSignin').classList.add('hidden');
  $p('#leadersStatus').textContent = '';
  $p('#leaders').innerHTML = [['Ada', 2, '🤩', '@ada_sings', 12, 3410], ['John', 1, '😎', '@johnny', 9, 2985], ['Kemi', 4, '😜', '@kemi.k', 7, 2440], ['Tunde', 3, '🥳', '@tunde', 4, 1720], ['Chiamaka', 5, '🤠', '@chi', 3, 1305]]
    .map(([n, c, f, u, w, p], i) => `<li style="animation-delay:${i * 0.08}s"><span class="pos">${i + 1}</span><span class="av sm c${c}">${f}</span><span class="who2"><b>${n}</b><small>${u} · ${w} wins</small></span><span class="pts">${p}</span></li>`).join('');
  caption('CLIMB THE LEADERBOARD 🏆', true);
});
mark('leaders');
await wait(2500);

// 9 · END CARD
await ev(() => {
  caption('');
  const d = document.createElement('div');
  d.className = 'endcard';
  d.innerHTML = '<div class="logo-wrap" style="width:100%"><div class="logo-disc" aria-hidden="true"><span>🎤</span></div><h1 class="logo">PASS<br>THE <span>MIC</span></h1></div><div class="sub">When the music stops, you sing.<br>Free · works on any phone · no download</div><div class="url">pass-the-mic.vercel.app</div>';
  document.body.appendChild(d);
});
mark('endcard');
await wait(3000);

await cdp.send('Page.stopScreencast');
await browser.close();

// ---- write frames + an ffconcat list with real durations
const lines2 = ['ffconcat version 1.0'];
frames.forEach((f, i) => {
  const name = `f${String(i).padStart(5, '0')}.jpg`;
  writeFileSync(join(FRAMES, name), Buffer.from(f.data, 'base64'));
  const next = frames[i + 1]?.t ?? f.t + 1 / 30;
  lines2.push(`file 'frames/${name}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
});
lines2.push(`file 'frames/f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
writeFileSync(join(OUT, 'frames.ffconcat'), lines2.join('\n'));
const T0 = frames[0].t;
writeFileSync(join(OUT, 'marks.json'), JSON.stringify({ duration: frames.at(-1).t - T0 + 1 / 30, marks: marks.map(([n, t]) => [n, +(t - T0).toFixed(3)]) }, null, 1));
console.log(`captured ${frames.length} frames over ${(frames.at(-1).t - frames[0].t).toFixed(1)}s`);
