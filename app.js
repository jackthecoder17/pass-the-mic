import { tokenize, align, score } from './match.js';
import { resolveSong } from './resolve.js';

const $ = (s) => document.querySelector(s);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const S = {
  players: [], lives: 3, lang: 'en-US',
  song: null, offset: 0,
  cur: 0, round: 1, resumeAt: 0, section: null,
  phase: 'idle', heard: '', result: null, results: [],
  mode: 'single', pack: null, queue: [], qi: 0, songTurns: 0, // pack mode: one round per song, then the next song
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
// [PTM] debug lines in the console (read while testing; harmless for players)
const dbg = (...a) => console.log('[PTM]', ...a);
const passMark = () => Math.min(80, 65 + (S.round - 1) * 5); // 65% → 80%: strict, but leaves room for speech-to-text slips
const hintCount = () => (S.round <= 2 ? 1 : 0); // early rounds show the first word, so it doesn't count
const alive = () => S.players.filter((p) => p.lives > 0 && !p.gone); // gone = dropped out of an online room (may come back)

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3500);
}

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 's-' + id));
  const inGame = ['handoff', 'listen', 'turn', 'reveal'].includes(id);
  if (S.net && id === 'song') $('#songBack').textContent = S.midGame && S.song ? '← Back to the game' : '← Lobby';
  else if (id === 'song') $('#songBack').textContent = S.midGame && S.song ? '← Back to the game' : '← Players';
  $('#board').classList.toggle('hidden', !inGame);
  if (inGame) renderBoard();
  $('#syncPanel').classList.add('hidden');
  if (id !== 'reveal') stopAutoNext();
  keepAwake(inGame || id === 'lobby');
  // keep one history entry above the app so the phone's back button opens our menu instead of leaving
  if (id !== 'home' && history.state?.ptm !== 'guard') history.pushState({ ptm: 'guard' }, '');
  scrollTo(0, 0);
  requestAnimationFrame(() => { placeTV(); fitBig(); });
}
// big poster names: shrink the font until the longest word fits instead of breaking it mid-word
function fitText(el, max = 88, min = 28) {
  if (!el || !el.offsetParent) return;
  let size = Math.min(max, el.clientWidth / 3);
  el.style.fontSize = `${size}px`;
  while (size > min && el.scrollWidth > el.clientWidth + 1) { size -= 3; el.style.fontSize = `${size}px`; }
}
const fitBig = () => document.querySelectorAll('.screen.active .who, .screen.active .go').forEach((el) => fitText(el, el.classList.contains('go') ? 76 : 88));
addEventListener('resize', fitBig);
// refit whenever these headlines change text (countdown numbers, SING!, winner names…)
for (const sel of ['#handName', '#endTitle', '#goTxt']) {
  const el = document.querySelector(sel);
  new MutationObserver(() => fitText(el, sel === '#goTxt' ? 76 : 88)).observe(el, { childList: true, characterData: true, subtree: true });
}

// keep the screen on during a game (phones lock while you're listening or passing the phone around)
let wakeLock = null, wantAwake = false;
async function keepAwake(on) {
  wantAwake = on;
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { const w = wakeLock; wakeLock = null; await w.release(); }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (wantAwake) keepAwake(true); return; }
  // one-phone game: switching apps pauses everything; Resume picks up where you left off
  if (!S.net && ['countin', 'listen', 'cut', 'turn', 'scoring', 'reveal-play', 'reveal'].includes(S.phase)) openMenu();
  else if (!S.net && $('#s-reveal').classList.contains('active')) openMenu();
});

// the YouTube iframe can't be moved in the DOM (it would reload), so it floats over the visible .tv-slot
function placeTV() {
  const wrap = $('#ytwrap'), slot = document.querySelector('.screen.active .tv-slot');
  if (!slot || !slot.offsetParent) { wrap.className = 'parked'; wrap.removeAttribute('style'); return; }
  const r = slot.getBoundingClientRect();
  wrap.className = '';
  Object.assign(wrap.style, { left: `${r.left + scrollX}px`, top: `${r.top + scrollY}px`, width: `${r.width}px`, height: `${r.height}px` });
}
addEventListener('resize', placeTV);
setInterval(placeTV, 400);

function renderBoard() {
  $('#board').innerHTML =
    `<div class="board-top"><div class="songname">🎵 ${S.song ? esc(S.song.title) + ' · ' + esc(S.song.artist) : ''}</div>` +
    `<button class="menu-btn" type="button" data-menu aria-label="Pause menu">☰ Menu</button></div>` +
    `<div class="pl">${S.players.map((p, i) => `<span class="pc ${i === S.cur ? 'cur' : ''} ${p.lives <= 0 || p.gone ? 'out' : ''} ${S.net && p.id === S.net.me.id ? 'me' : ''}">${avatar(p, 'sm')}<b>${esc(p.name)}</b><span class="hearts">${p.gone ? '👋' : p.lives > 0 ? '❤️'.repeat(p.lives) : '💀'}</span></span>`).join('')}</div>`;
}

// ---------- avatars: every player keeps a colour + face ----------
const FACES = ['😎', '🤩', '🥳', '😜', '🤠', '😏', '🥸', '🤓', '😇', '🤪', '😺', '🦁'];
function dress(p, i) { if (!p.c) { p.c = (i % 6) + 1; p.f = FACES[i % FACES.length]; } return p; }
const cssUrl = (u) => (/^https:\/\//.test(u || '') ? encodeURI(u).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29') : '');
const avatar = (p, size = '', extra = '') => (p?.photo && cssUrl(p.photo)
  ? `<span class="av ${size} c${p?.c || 1} photo ${extra}" style="background-image:url('${cssUrl(p.photo)}')" role="img" aria-label="${esc(p.name || 'player')}"></span>`
  : `<span class="av ${size} c${p?.c || 1} ${extra}">${p?.f || '🎤'}</span>`);

// ---------- sound effects ----------
let ac;
function unlockAudio() {
  try { ac ??= new (window.AudioContext || window.webkitAudioContext)(); ac.resume?.(); } catch {}
}
function beep(freq, dur = 0.12, type = 'sine', vol = 0.18, when = 0) {
  if (!ac) return;
  const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (type === 'sawtooth') o.frequency.exponentialRampToValueAtTime(freq / 2.5, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
// filtered noise burst (scratches, drums, crowd)
function noise(dur, { when = 0, vol = 0.3, from = 2000, to = 400, q = 1.2, type = 'bandpass' } = {}) {
  if (!ac) return;
  const t = ac.currentTime + when, len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(ac.destination); src.start(t); src.stop(t + dur);
}
const sfx = {
  tick: () => beep(660, 0.1),
  go: () => beep(1320, 0.18),
  // record scratch: two fast filter sweeps
  scratch: () => { noise(0.16, { from: 900, to: 3800, vol: 0.5, q: 3 }); noise(0.22, { when: 0.15, from: 3600, to: 500, vol: 0.45, q: 3 }); beep(140, 0.25, 'sawtooth', 0.08, 0.02); },
  drumroll: (dur = 0.9) => { for (let t = 0; t < dur; t += 0.045) noise(0.05, { when: t, from: 1800, to: 900, vol: 0.12 + 0.12 * (t / dur), q: 0.8 }); },
  pass: () => {
    noise(0.12, { from: 200, to: 60, vol: 0.5, type: 'lowpass', q: 0.7 }); // the stamp thud
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.18, 0.08 + i * 0.09));
    noise(1.4, { when: 0.2, from: 2500, to: 1200, vol: 0.09, q: 0.4 }); // crowd
  },
  fail: () => { // sad trombone: wah wah wah waaah
    noise(0.12, { from: 200, to: 60, vol: 0.5, type: 'lowpass', q: 0.7 });
    [[311, 0.1], [294, 0.45], [277, 0.8]].forEach(([f, w]) => beep(f, 0.32, 'sawtooth', 0.09, w));
    beep(262, 0.9, 'sawtooth', 0.09, 1.15);
  },
};
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch {} };

// ---------- players ----------
function renderPlayers() {
  $('#plist').innerHTML = S.players.map((p, i) => `<li>${avatar(dress(p, i), 'lg')}<span class="nm">${esc(p.name)}</span><button class="rm" type="button" data-rm="${i}" aria-label="Remove ${esc(p.name)}">✕</button></li>`).join('') +
    (S.players.length < 12 ? `<li class="empty"><span class="av lg">＋</span><span class="tag">${S.players.length ? 'add another' : 'add players above'}</span></li>` : '');
  const canAddMe = ACCT && !S.players.some((p) => p.uid === ACCT.id);
  $('#addMe').classList.toggle('hidden', !canAddMe);
  if (canAddMe) $('#addMe').textContent = `+ Add me (${ACCT.profile.display_name})`;
  $('#toSong').disabled = !S.players.length;
}
$('#startBtn').onclick = () => {
  unlockAudio();
  if (ACCT && !S.players.length) S.players.push(meAsPlayer()); // signed in: you're player one
  renderPlayers(); show('players'); $('#nameIn').focus();
};
$('#addForm').onsubmit = (e) => {
  e.preventDefault();
  const name = $('#nameIn').value.trim();
  if (!name) return;
  if (S.players.length >= 12) return toast('Max 12 players');
  if (S.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast('Name already taken');
  const used = new Set(S.players.map((p) => p.c));
  const slot = [0, 1, 2, 3, 4, 5].find((k) => !used.has(k + 1)) ?? S.players.length;
  S.players.push(dress({ name }, slot + (S.players.length >= 6 ? 6 : 0)));
  $('#nameIn').value = '';
  renderPlayers();
  $('#nameIn').focus();
};
$('#plist').onclick = (e) => {
  const i = e.target.closest('[data-rm]')?.dataset.rm;
  if (i != null) { S.players.splice(+i, 1); renderPlayers(); }
};
if (!SR) { $('#srWarn').classList.remove('hidden'); $('#micTest').classList.add('hidden'); }
$('#micTest').onclick = () => {
  S.lang = $('#langSel').value;
  $('#micOut').textContent = 'Listening… sing or say anything';
  if (S.cloud) {
    startCloudRec('', (t) => { if (t) $('#micOut').textContent = '✅ Heard: “' + t + '”'; });
    setTimeout(() => stopCloudRec().then((t) => { $('#micOut').textContent = t ? '✅ Heard: “' + t + '”' : S.micBlocked ? 'Microphone blocked. Allow mic access for this site, then reload.' : "Didn't hear anything. Speak up and try again."; }), 4500);
    return;
  }
  let got = false;
  startRec(null, (t) => { got = !!t; $('#micOut').textContent = '✅ Heard: “' + t + '”'; });
  setTimeout(() => { stopRec(); if (!got) $('#micOut').textContent = S.micBlocked ? $('#toast').textContent : "Didn't hear anything. Speak up, or check the mic permission and try again."; }, 4500);
};
function resetScores() {
  S.recorded = false; S.clips = [];
  S.players.forEach((p) => { p.lives = S.lives; p.points = 0; p.passes = 0; });
  S.round = 1; S.cur = 0;
}
$('#toSong').onclick = () => {
  unlockAudio();
  S.lives = +$('#livesSel').value; S.lang = $('#langSel').value;
  resetScores(); S.midGame = false;
  show('song');
};

// ---------- song packs ----------
let PACKS = { live: [], packs: [] };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
fetch('packs.json').then((r) => r.json()).then((d) => { PACKS = d; renderPacks(); }).catch(() => toast("Couldn't load song packs. You can still search."));
function renderPacks() {
  const all = PACKS.packs.reduce((n, p) => n + p.songs.length, 0);
  const card = (key, emoji, name, blurb, tag) =>
    `<button class="pack" type="button" data-pack="${key}"><span class="pe">${emoji}</span><b>${esc(name)}</b><span class="pb">${esc(blurb)}</span><span class="pt">${tag}</span></button>`;
  $('#packs').innerHTML =
    card('mix', '🎲', 'Mix Everything', 'Every genre, shuffled', `${all} songs`) +
    PACKS.live.map((p) => card(p.id, p.emoji, p.name, p.blurb, '<i class="live"></i>LIVE')).join('') +
    PACKS.packs.map((p) => card(p.id, p.emoji, p.name, p.blurb, `${p.songs.length} songs`)).join('');
}
$('#packs').onclick = (e) => {
  const key = e.target.closest('[data-pack]')?.dataset.pack;
  if (key) startPack(key);
};

async function startPack(key) {
  if (picking || loadingSong) return;
  picking = true; // live charts load over the network first; ignore extra taps meanwhile
  try { await loadPack(key); } finally { picking = false; }
}
async function loadPack(key) {
  const live = PACKS.live.find((p) => p.id === key);
  let name, songs;
  $('#songStatus').textContent = 'Shuffling the pack…';
  if (key === 'mix') { name = 'Mix Everything'; songs = PACKS.packs.flatMap((p) => p.songs); }
  else if (live) {
    name = live.name;
    try {
      const r = await fetch(`/api/chart?country=${live.country}`);
      songs = ((await r.json()).songs || []).map((x) => ({ t: x.title, a: x.artist, live: true }));
    } catch { songs = []; }
    if (!songs.length) { $('#songStatus').textContent = "Couldn't load the live chart right now. Try another pack."; return; }
  } else { const p = PACKS.packs.find((x) => x.id === key); name = p.name; songs = p.songs; }
  // live charts: keep chart order loosely (hits first) but mix it up a bit
  S.queue = live ? shuffle(songs.slice(0, 20)).concat(shuffle(songs.slice(20))) : shuffle(songs);
  S.qi = 0; S.mode = 'pack'; S.pack = name;
  $('#songStatus').textContent = '';
  nextPackSong();
}

// load the next playable song from the queue (skipping any that fail) and hand over
let loadingSong = false;
async function nextPackSong() {
  if (loadingSong) return; // double taps / overlapping triggers load one song, not two
  loadingSong = true;
  S.songTurns = 0;
  showLoading();
  try {
    while (S.qi < S.queue.length) {
      const item = S.queue[S.qi++];
      try {
        const song = item.picked ? item.song : item.live ? await resolveLive(item) : await resolvePacked(item);
        if (song) {
          await setSong(song, !!item.picked);
          loadingSong = false;
          goHandoff();
          if (song.warn) toast(SYNC_WARN);
          return;
        }
      } catch (e) { console.warn('skipping', item.t, e); }
    }
  } finally { loadingSong = false; }
  endGame(`${S.pack} finished`);
}
async function resolvePacked(item) {
  const r = await fetch(`https://lrclib.net/api/get/${item.l}`);
  if (!r.ok) return null;
  const y = await r.json();
  return y.syncedLyrics ? { title: item.t, artist: item.a, lyrics: y.syncedLyrics, ids: item.v } : null;
}
const findVideos = (title, artist, dur) =>
  fetch(`/api/yt?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&dur=${dur}`).then((r) => r.json()).then((j) => j.results || []);
async function resolveLive(item) {
  const s = await resolveSong(item.t, item.a, findVideos);
  if (!s || !s.official || s.delta > 2) return null; // charts: only songs we can keep in sync
  return { title: item.t, artist: item.a, lyrics: s.lyrics, ids: s.v };
}
// a song someone searched for: play the exact track they picked, match lyrics to its length
async function resolvePicked(item) {
  const find = async (title, artist, dur) => {
    const more = await findVideos(title, artist, dur).catch(() => []);
    return [{ id: item.vid, seconds: item.secs, official: true }, ...more.filter((v) => v.id !== item.vid)];
  };
  const s = await resolveSong(item.t, item.a, find);
  if (!s) return null;
  return { title: item.t, artist: item.a, lyrics: s.lyrics, ids: s.v, warn: s.delta > 2 };
}
function showLoading() {
  $('#roundInfo').textContent = S.pack || '';
  $('#handName').textContent = S.players[S.cur]?.name || '';
  $('#handAv').innerHTML = avatar(S.players[S.cur], 'xl');
  $('#handSong').textContent = 'Loading the next song…';
  $('#readyBtn').disabled = true;
  $('#skipSongBtn').classList.add('hidden');
  show('handoff');
}
const SYNC_WARN = 'Heads up: the lyrics for this one may be slightly off. Use 🎯 Fix sync while it plays.';

// ---------- song search + your own playlist ----------
S.mine = []; // songs the room added: { t, a, vid, secs, art, song }
$('#searchForm').onsubmit = (e) => { e.preventDefault(); const q = $('#q').value.trim(); if (q) search(q); };

async function search(q) {
  $('#searchStatus').textContent = 'Searching…';
  $('#results').innerHTML = '';
  try {
    const r = await fetch('/api/search?q=' + encodeURIComponent(q));
    const list = ((await r.json()).results || []).map((v) => ({ t: v.title, a: v.channel, album: v.album, vid: v.id, secs: v.seconds, art: v.art }));
    S.results = list;
    $('#searchStatus').textContent = list.length ? '' : 'No songs found. Try different words.';
    renderResults();
  } catch {
    $('#searchStatus').textContent = "Couldn't search right now. Check your connection.";
  }
}
function renderResults() {
  $('#results').innerHTML = S.results.map((x, i) => {
    const added = S.mine.some((m) => m.vid === x.vid);
    return `<li class="res">
      ${x.art ? `<img src="${esc(x.art)}" alt="" loading="lazy">` : '<span class="noart">🎵</span>'}
      <div class="ri"><b>${esc(x.t)}</b><span>${esc(x.a)}${x.album && x.album !== x.t ? ' · ' + esc(x.album) : ''} · ${fmt(x.secs)}</span></div>
      <button class="chip" type="button" data-play="${i}" aria-label="Play ${esc(x.t)}">▶<span class="lbl"> Play</span></button>
      <button class="chip add ${added ? 'on' : ''}" type="button" data-add="${i}" ${added ? 'disabled' : ''} aria-label="Add ${esc(x.t)} to playlist">${added ? '✓<span class="lbl"> Added</span>' : '+<span class="lbl"> Add</span>'}</button>
    </li>`;
  }).join('');
}
$('#results').onclick = (e) => {
  const play = e.target.closest('[data-play]')?.dataset.play;
  const add = e.target.closest('[data-add]');
  if (play != null) playPicked(S.results[+play]);
  else if (add) addToPlaylist(S.results[+add.dataset.add], add);
};

async function addToPlaylist(x, btn) {
  if (S.mine.some((m) => m.vid === x.vid)) return;
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const song = await resolvePicked(x);
    if (!song) { btn.textContent = '✗ No lyrics'; toast(`No synced lyrics exist for “${x.t}” yet. Try another song.`); return; }
    S.mine.push({ ...x, song });
    btn.textContent = '✓ Added'; btn.classList.add('on');
    if (song.warn) toast(`Added. ${SYNC_WARN}`);
    renderTray();
  } catch {
    btn.disabled = false; btn.textContent = '+ Add';
    toast('Something went wrong. Try again.');
  }
}
function renderTray() {
  const n = S.mine.length;
  $('#tray').classList.toggle('hidden', !n);
  $('#trayCount').textContent = `🎶 Your playlist · ${n} song${n === 1 ? '' : 's'}`;
  $('#trayList').innerHTML = S.mine.map((m, i) => `<span class="tchip">${esc(m.t)}<button type="button" data-rm="${i}" aria-label="Remove ${esc(m.t)}">✕</button></span>`).join('');
}
$('#trayList').onclick = (e) => {
  const i = e.target.closest('[data-rm]')?.dataset.rm;
  if (i == null) return;
  S.mine.splice(+i, 1); renderTray(); renderResults();
};
$('#trayStart').onclick = () => {
  if (!S.mine.length) return;
  S.queue = S.mine.map((m) => ({ picked: true, song: m.song, t: m.t }));
  S.qi = 0; S.mode = 'pack'; S.pack = 'Your playlist';
  nextPackSong();
};

let picking = false;
async function playPicked(x) {
  if (picking) return;
  picking = true;
  $('#searchStatus').textContent = `Finding the lyrics for “${x.t}”…`;
  try {
    const song = await resolvePicked(x);
    if (!song) throw new Error(`Sorry, no synced lyrics exist for “${x.t}” yet. Try another song.`);
    S.mode = 'single'; S.pack = null;
    await setSong(song, true);
    $('#searchStatus').textContent = '';
    goHandoff();
    if (song.warn) toast(SYNC_WARN);
  } catch (e) {
    $('#searchStatus').textContent = e.message || 'Something went wrong. Try another song.';
  } finally {
    picking = false;
  }
}

function parseLRC(lrc) {
  const lines = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) lines.push({ t: +m[1] * 60 + +m[2], text });
  }
  lines.sort((a, b) => a.t - b.t);
  lines.forEach((l, i) => {
    l.end = Math.min(lines[i + 1]?.t ?? l.t + 5, l.t + 9);
    l.words = tokenize(l.text);
  });
  return lines;
}

async function setSong({ title, artist, lyrics, ids }, fromStart = false) {
  const lines = parseLRC(lyrics);
  const sung = lines.filter((l) => l.words.length >= 3);
  if (sung.length < 4) throw new Error('Not enough lyrics in this one. Pick another.');
  S.song = { title, artist, lines, ids, idx: 0, raw: { title, artist, lyrics, ids } };
  S.offset = savedOffset(ids[0]); updateSyncLabel();
  await ensurePlayer();
  player.cueVideoById(ids[0]);
  // packs drop you in somewhere in the first half so every song feels different
  const from = fromStart ? sung[0] : sung[(Math.random() * Math.max(1, sung.length * 0.4)) | 0];
  S.resumeAt = Math.max(0, from.t - 4);
  S.songTurns = 0;
  if (S.players[S.cur]?.lives <= 0) S.cur = nextAlive(S.cur);
}

// per-video sync offset, remembered on this device
const offsetKey = (id) => 'ptm-offset:' + id;
function savedOffset(id) { try { return Number(localStorage.getItem(offsetKey(id))) || 0; } catch { return 0; } }
function saveOffset() { try { localStorage.setItem(offsetKey(S.song.ids[S.song.idx]), String(S.offset)); } catch {} }

// ---------- YouTube ----------
let player, playerReady;
function ensurePlayer() {
  if (playerReady) return playerReady;
  playerReady = new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => {
      player = new YT.Player('yt', {
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0, modestbranding: 1, fs: 0, iv_load_policy: 3 },
        events: { onReady: () => resolve(), onError: onYtError, onStateChange: onYtState },
      });
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { playerReady = null; reject(new Error("Couldn't load the music player.")); };
    document.head.appendChild(s);
  });
  return playerReady;
}
function onYtError() {
  const song = S.song;
  if (!song) return;
  if (song.idx < song.ids.length - 1) {
    song.idx++;
    S.offset = savedOffset(song.ids[song.idx]); updateSyncLabel();
    if (S.phase === 'listen' || S.phase === 'reveal-play') {
      player.loadVideoById({ videoId: song.ids[song.idx], startSeconds: Math.max(0, S.playFrom - S.offset) });
    } else player.cueVideoById(song.ids[song.idx]);
  } else {
    if (S.net && !S.net.host) return toast("This song won't play on your phone. Follow along on screen.");
    toast("This song won't play here. Skipping it.");
    S.phase = 'idle';
    if (S.mode === 'pack') nextPackSong(); else show('song');
  }
}
function onYtState(e) {
  if (e.data === 0 && S.phase === 'listen') songOver(); // video ended before the next section
}
function playFrom(t) {
  S.playFrom = t;
  player.seekTo(Math.max(0, t - S.offset), true);
  player.playVideo();
}
const lyricTime = () => (player?.getCurrentTime?.() ?? 0) + S.offset;

// ---------- game flow ----------
function nextAlive(i) {
  const n = S.players.length;
  for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (S.players[j].lives > 0 && !S.players[j].gone) return j; }
  return -1;
}
function goHandoff() {
  if (S.net) return hostRound();
  $('#handLead').textContent = 'Pass the phone to';
  $('#handHint').textContent = "Listen closely. When the music stops, it's your turn to carry on.";
  $('#handCount').classList.add('hidden');
  $('#readyBtn').classList.remove('hidden');
  $('#roundInfo').textContent = `Round ${S.round} · pass mark ${passMark()}%`;
  $('#handName').textContent = S.players[S.cur].name;
  $('#handAv').innerHTML = avatar(S.players[S.cur], 'xl');
  $('#handSong').textContent = S.songTurns === 0 ? `🎵 ${S.mode === 'pack' ? 'Next song' : 'Song'}: ${S.song.title} · ${S.song.artist}` : '';
  $('#readyBtn').disabled = false;
  $('#skipSongBtn').classList.remove('hidden');
  show('handoff');
}

// nobody knows it? move on: no lives lost, same player keeps their turn
function skipSong() {
  if (!S.song) return;
  player?.pauseVideo?.();
  S.phase = 'idle';
  toast(`Skipped “${S.song.title}”`);
  if (S.mode === 'pack') nextPackSong();
  else { S.song = null; if (S.net) S.net.send('picking'); show('song'); }
}
$('#skipSongBtn').onclick = skipSong;
$('#skipSongBtn2').onclick = () => { if (S.phase === 'listen') skipSong(); };

function sectionFrom(i, j) {
  const L = S.song.lines, lines = L.slice(i, j);
  return { i, j, start: L[i].t, end: lines[lines.length - 1].end, words: lines.flatMap((l) => l.words) };
}
// choose the next stretch of lyrics for the current player to sing
function pickSection(from) {
  const L = S.song.lines;
  const minWords = Math.min(14, 4 + (S.round - 1) * 2);
  const lead = 7 + Math.random() * 7; // seconds of music to hear first
  for (let i = 1; i < L.length; i++) {
    if (L[i].t < from + lead || L[i].words.length < 3) continue;
    let j = i;
    const words = [];
    while (j < L.length && j - i < 3 && words.length < minWords && L[j].words.length) { words.push(...L[j].words); j++; }
    if (words.length < 4) continue;
    const lines = L.slice(i, j);
    return { i, j, start: L[i].t, end: lines[lines.length - 1].end, words };
  }
  return null;
}

$('#readyBtn').onclick = () => {
  unlockAudio();
  const sec = pickSection(S.resumeAt);
  if (!sec) return songOver();
  S.section = sec;
  startListen();
};
function startListen() {
  const p = S.players[S.cur];
  $('#listenName').textContent = isMe(S.cur) ? 'YOU' : p.name;
  $('#upAv').innerHTML = avatar(p, 'sm');
  $('#npTitle').textContent = S.song.title;
  $('#npArtist').textContent = S.song.artist + (S.pack ? ` · ${S.pack}` : '');
  $('#vinylArt').src = `https://i.ytimg.com/vi/${S.song.ids[S.song.idx]}/hqdefault.jpg`;
  $('#vinyl').classList.remove('stopped');
  $('#skipSongBtn2').classList.toggle('hidden', !!S.net && !S.net.host);
  lastKara = -2;
  show('listen');
  S.phase = 'listen';
  playFrom(S.resumeAt);
}
$('#skipBtn').onclick = () => { if (S.phase === 'listen') playFrom(Math.max(S.resumeAt, S.section.start - 5)); };
document.querySelectorAll('[data-sync]').forEach((b) => (b.onclick = () => { S.offset += +b.dataset.sync; updateSyncLabel(); saveOffset(); lastKara = -2; }));

// tap-to-sync: tap the line the moment the singer starts it
$('#syncBtn').onclick = () => {
  const L = S.song.lines, t = lyricTime();
  let i = L.findIndex((l) => l.t > t);
  if (i < 0) i = L.length;
  const pick = [];
  for (let k = Math.max(0, i - 3); k < L.length && pick.length < 6; k++) if (L[k].words.length && k < S.section.i) pick.push(k);
  if (!pick.length) return toast('No lyrics to sync against right here. Try again in a moment.');
  $('#syncLines').innerHTML = pick.map((k) => `<button type="button" data-line="${k}">${esc(L[k].text)}</button>`).join('');
  $('#syncPanel').classList.remove('hidden');
};
$('#syncLines').onclick = (e) => {
  const k = e.target.closest('[data-line]')?.dataset.line;
  if (k == null) return;
  const video = player.getCurrentTime();
  S.offset = S.song.lines[+k].t - (video - 0.2); // ~200ms reaction time
  updateSyncLabel(); saveOffset(); lastKara = -2;
  $('#syncPanel').classList.add('hidden');
  toast('Synced ✓ Saved for this song');
};
$('#syncClose').onclick = () => $('#syncPanel').classList.add('hidden');
function updateSyncLabel() { $('#syncVal').textContent = S.offset ? `${S.offset > 0 ? '+' : ''}${S.offset.toFixed(1)}s` : ''; }

// karaoke display + section trigger
let lastKara = -2;
function renderKaraoke(t) {
  const L = S.song.lines;
  let i = -1;
  for (let k = 0; k < L.length; k++) { if (L[k].t <= t) i = k; else break; }
  if (i === lastKara) return;
  lastKara = i;
  const hide = S.phase === 'listen';
  const text = (k) => (k < 0 || k >= L.length ? '' : L[k].text || '♪');
  const next = $('#kara .next'), cur = $('#kara .cur');
  $('#kara .prev').textContent = text(i - 1);
  cur.textContent = text(i) || '♪';
  const spoiler = hide && i + 1 >= S.section.i;
  next.textContent = spoiler ? '🎤 · · ·' : text(i + 1);
  next.classList.toggle('mystery', spoiler);
  cur.classList.remove('pop'); void cur.offsetWidth; cur.classList.add('pop');
}
function loop() {
  if (S.phase !== 'listen' && S.phase !== 'reveal-play') return;
  if (!player?.getCurrentTime) return;
  const t = lyricTime();
  if (S.phase === 'listen') {
    renderKaraoke(t);
    if (t >= S.section.start - 0.12) { player.pauseVideo(); theCut(); }
  } else if (t >= S.section.end + 0.3) {
    player.pauseVideo();
    S.phase = 'reveal';
  }
}
setInterval(loop, 40); // timer, not rAF: keeps working if the tab is backgrounded

// the music stops: scratch, flash, shake, record grinds to a halt — then the spotlight
function theCut() {
  S.phase = 'cut';
  unlockAudio(); sfx.scratch(); buzz([60, 40, 120]);
  $('#vinyl').classList.add('stopped');
  document.body.classList.remove('cutting'); void document.body.offsetWidth; document.body.classList.add('cutting');
  setTimeout(() => { document.body.classList.remove('cutting'); if (S.phase === 'cut') startTurn(); }, 850);
}

// timing: a 5-second count-in, then 15 seconds to sing (only stretched if the section itself runs longer)
const COUNT_IN = 5, SING_SECS = 15;
const singWindow = (sec) => Math.max(SING_SECS, (sec.end - sec.start) + 3);

// ring timer around the singer's avatar (f: 1 = full, 0 = empty)
const setTimer = (f) => { $('#timerBar').style.strokeDashoffset = String(390 * (1 - Math.max(0, Math.min(1, f)))); };

// voice waveform: bars jump when new words come in (from your mic, or the singer's phone online)
const WAVE_N = 26;
$('#wave').innerHTML = '<i></i>'.repeat(WAVE_N);
let waveE = 0, waveOn = false;
const kickWave = (amt = 1) => { waveE = Math.min(1.4, waveE + amt); };
function waveLoop() {
  if (!waveOn) return;
  const bars = $('#wave').children, t = performance.now() / 1000;
  waveE *= 0.93;
  const lvl = micLevel();
  if (lvl !== null) waveE = Math.max(waveE, Math.min(1.4, lvl * 7));
  for (let i = 0; i < bars.length; i++) {
    const shape = Math.abs(Math.sin(i * 1.7 + t * 6)) * 0.7 + Math.abs(Math.sin(i * 0.6 - t * 9)) * 0.3;
    bars[i].style.height = `${6 + (8 + 42 * shape) * Math.min(1, 0.12 + waveE)}px`;
  }
  setTimeout(waveLoop, 70);
}
function startWave() { waveE = 0.3; if (!waveOn) { waveOn = true; waveLoop(); } }
function stopWave() { waveOn = false; }

// ---------- the turn ----------
let turnTimer, countT;
function startTurn() {
  S.phase = 'turn';
  const sec = S.section;
  const p = S.players[S.cur];
  $('#turnName').textContent = isMe(S.cur) ? `${p.name} · that's you` : p.name;
  $('#turnAv').innerHTML = avatar(p, 'xl');
  const cueLine = S.song.lines.slice(0, sec.i).reverse().find((l) => l.words.length);
  $('#cue').textContent = cueLine ? `“…${cueLine.text}”` : '';
  const hint = hintCount(); // early rounds: show the first word so you know where to come in
  $('#chips').innerHTML = sec.words.map((w, i) => `<span class="w${i < hint ? ' hint' : ''}" style="--len:${Math.max(2, w.d.length)}"><b>${esc(w.d)}</b></span>`).join('');
  $('#heard').textContent = '';
  setTimer(1);
  startWave();
  $('#doneBtn').disabled = true;
  $('#doneBtn').classList.toggle('hidden', !!S.net && !isMe(S.cur));
  show('turn');
  if (S.net && !isMe(S.cur)) return spectate();

  const go = $('#goTxt');
  let n = COUNT_IN;
  $('#turnName').textContent = `${p.name} · your turn in`;
  go.className = 'go count'; go.textContent = String(n);
  sfx.tick();
  clearInterval(countT);
  countT = setInterval(() => {
    if (--n > 0) { go.className = 'go'; void go.offsetWidth; go.className = 'go count'; go.textContent = String(n); sfx.tick(); return; }
    clearInterval(countT);
    $('#turnName').textContent = `${p.name} · go!`;
    go.className = 'go sing'; go.textContent = 'SING!'; sfx.go(); buzz(80);
    beginListening();
  }, 1000);
}

function beginListening() {
  const sec = S.section;
  const expected = sec.words.map((w) => w.n);
  const dur = singWindow(sec);
  S.heard = ''; S.heardBy = {};
  let allIn = false;
  // two "ears" can report: the phone's own recognizer (instant) and Whisper (more accurate).
  // A word counts if either heard it; the transcript shown is whichever matched more.
  const turnT0 = performance.now();
  dbg('turn start', JSON.stringify({ lyric: sec.words.map((w) => w.d).join(' '), passMark: passMark(), hint: hintCount(), cloud: S.cloud, liveSR: !!SR && !IS_IOS }));
  const onText = (src) => (text) => {
    if (S.phase !== 'turn') return;
    if (S.heardBy[src] !== text) dbg(`+${((performance.now() - turnT0) / 1000).toFixed(1)}s ${src}:`, JSON.stringify(text));
    S.heardBy[src] = text;
    const { sims, text: best } = bestOf(expected);
    S.heard = best;
    paintChips('#chips', sims, false);
    $('#heard').textContent = best ? `👂 “${best}”` : '';
    kickWave(0.7);
    if (S.net) sendLive(sims, best);
    // every word caught: wrap up on our own instead of waiting out the clock
    if (!allIn && sims.length && sims.every((x) => x > 0)) { allIn = true; setTimeout(finishTurn, 1400); }
  };
  S.turnCloud = S.cloud && !!window.MediaRecorder;
  if (S.turnCloud) {
    // instant words from the phone's recognizer where it can share the mic; Whisper live updates otherwise
    const live = !!SR && !IS_IOS;
    startCloudRec(cloudPrompt(sec), onText('cloud'), { partials: !live, lang: sectionLang(sec) });
    if (live) startRec(expected, onText('sr'), { quiet: true, onFail: () => { if (cRec) cRec.partials = true; } });
  } else startRec(expected, onText('sr'));
  $('#doneBtn').disabled = false;
  const t0 = performance.now();
  clearInterval(turnTimer);
  turnTimer = setInterval(() => {
    const f = 1 - (performance.now() - t0) / 1000 / dur;
    setTimer(f);
    if (f <= 0) finishTurn();
  }, 50);
}
$('#doneBtn').onclick = () => finishTurn();
// each "ear" is graded on its own; the better one wins (words are never mixed between engines)
function bestOf(expected) {
  let best = { sims: expected.map(() => 0), text: '', score: -1 };
  for (const t of Object.values(S.heardBy || {})) {
    if (!t) continue;
    const r = score(expected, tokenize(t).map((w) => w.n), { hint: hintCount() });
    if (r.score > best.score) best = { sims: r.sims, text: t, score: r.score };
  }
  return best;
}

function paintChips(sel, sims, final) {
  document.querySelectorAll(sel + ' .w').forEach((el, i) => {
    const ok = sims[i] > 0;
    el.classList.toggle('ok', ok);
    el.classList.toggle('miss', final && !ok);
  });
}

function finishTurn() {
  if (S.phase !== 'turn') return;
  S.phase = 'scoring';
  stopWave();
  clearInterval(turnTimer); clearInterval(countT);
  $('#doneBtn').disabled = true;
  $('#goTxt').className = 'go'; $('#goTxt').textContent = 'SCORING…';
  if (S.turnCloud) {
    recOn = false; try { rec?.stop(); } catch {} // the live recognizer (if any)
    stopCloudRec().then((text) => {
      if (text) S.heardBy.cloud = text;
      S.heard = bestOf(S.section.words.map((w) => w.n)).text || S.heard;
      scoreTurn();
    });
  } else {
    stopRec();
    setTimeout(scoreTurn, 800); // let the recognizer flush its final words
  }
}

function scoreTurn() {
  if (S.phase !== 'scoring') return; // paused or quit meanwhile
  const sec = S.section;
  const r = score(sec.words.map((w) => w.n), tokenize(S.heard).map((w) => w.n), { hint: hintCount() });
  const pct = Math.round(r.score * 100);
  const exp = sec.words.map((w) => w.n);
  dbg('GRADE', JSON.stringify({
    lyric: sec.words.map((w) => w.d).join(' '),
    engines: Object.fromEntries(Object.entries(S.heardBy || {}).map(([k, t]) => [k, { heard: t, pct: Math.round(score(exp, tokenize(t).map((w) => w.n), { hint: hintCount() }).score * 100) }])),
    used: S.heard, pct, passMark: passMark(),
    words: sec.words.map((w, i) => `${w.d}${r.sims[i] ? '✓' : '✗'}`).join(' '),
  }));
  const noMic = S.turnCloud ? S.micBlocked || (S.cloudFailed && !S.heard) : !SR || S.micBlocked;
  if (S.net) {
    const res = { pct, sims: r.sims, heard: S.heard, noMic };
    S.phase = 'waiting';
    $('#goTxt').className = 'go'; $('#goTxt').textContent = 'Scoring…';
    if (S.net.host) hostJudge(res); else S.net.send('result', res);
    return;
  }
  const mark = passMark();
  const verdict = noMic ? 'vote' : pct >= mark ? 'pass' : pct < mark - 10 ? 'fail' : 'vote';
  S.result = { pct, verdict };
  showReveal({ pct, sims: r.sims, heard: S.heard, noMic, verdict }, () => {
    if (verdict === 'vote') $('#voteBox').classList.remove('hidden');
    else applyVerdict(verdict === 'pass');
  });
}

// reveal screen: score, green/red words, and the real line played back
function showReveal({ pct, sims, heard, noMic, verdict }, after) {
  const sec = S.section;
  stopWave();
  const p = S.players[S.cur];
  $('#revWho').textContent = `${p?.name || ''} · Round ${S.round}`;
  $('#stamp').className = 'stamp hidden';
  $('#dialFg').style.strokeDashoffset = '408.4';
  $('#standings').innerHTML = '';
  $('#revChips').innerHTML = $('#chips').innerHTML || sec.words.map((w) => `<span class="w" style="--len:${Math.max(2, w.d.length)}"><b>${esc(w.d)}</b></span>`).join('');
  document.querySelectorAll('#revChips .w').forEach((el, i) => { el.classList.remove('hint'); el.style.animationDelay = `${0.9 + i * 0.09}s`; });
  if (noMic) document.querySelectorAll('#revChips .w').forEach((el) => el.classList.add('show'));
  else paintChips('#revChips', sims, true);
  $('#revHeard').textContent = noMic ? 'Here are the real lyrics. Did they get it?' : heard ? `AI heard: “${heard}”` : 'AI heard: nothing 🤐';
  $('#voteBox').classList.add('hidden');
  $('#contBtn').classList.add('hidden');
  $('#waitHost').classList.add('hidden');
  const v = $('#verdict');
  v.className = 'verdict'; v.textContent = '';
  show('reveal');
  if (noMic) $('#scoreNum').textContent = '🎤?';
  else sfx.drumroll(0.9);
  (noMic ? (f) => f() : (f) => countUp($('#scoreNum'), pct, f))(() => {
    if (verdict === 'vote') {
      v.className = 'verdict vote'; v.textContent = noMic ? 'MIC IS OFF · THE ROOM DECIDES' : 'TOO CLOSE TO CALL · THE ROOM DECIDES';
    }
    after();
  });
  // play the real line so the room hears what it should have been
  lastKara = -2;
  S.phase = 'reveal-play';
  playFrom(Math.max(0, sec.start - 0.4));
}

function countUp(el, to, done) {
  const t0 = performance.now(), d = 900;
  (function f(now) {
    const k = Math.min(1, (now - t0) / d), v = to * (1 - Math.pow(1 - k, 3));
    el.textContent = Math.round(v) + '%';
    $('#dialFg').style.strokeDashoffset = String(408.4 * (1 - v / 100));
    if (k < 1) requestAnimationFrame(f); else done();
  })(t0);
}

// the score change itself (local game, or the online host)
function applyResult(pass, pct) {
  const p = S.players[S.cur];
  if (!p || p.gone) return;
  if (pass) { p.points += Math.max(pct, passMark()); p.passes++; }
  else p.lives = Math.max(0, p.lives - 1);
}
function stamp(text, kind) {
  const el = $('#stamp');
  el.className = 'stamp hidden'; void el.offsetWidth;
  el.textContent = text; el.className = `stamp ${kind}`;
}
function showVerdict(pass) {
  const p = S.players[S.cur], v = $('#verdict');
  keepClip(p, pass);
  if (pass) {
    stamp('PASS', 'pass');
    v.className = 'verdict pass'; v.textContent = ['NAILED IT 🔥', 'STAR BEHAVIOUR 🌟', 'CORRECT! 🎤', 'ON KEY ✨'][Math.floor(Math.random() * 4)];
    sfx.pass(); buzz(60);
  } else {
    const out = p.gone || p.lives <= 0;
    stamp(out ? 'OUT' : 'MISS', 'fail');
    v.className = 'verdict fail';
    v.textContent = p.gone ? `${p.name.toUpperCase()} LEFT 👋` : p.lives > 0 ? `LOST A LIFE 💔 ${p.lives} LEFT` : `${p.name.toUpperCase()} IS OUT 💀`;
    sfx.fail(); buzz([100, 60, 200]);
  }
  renderStandings(pass ? Math.max(S.result?.pct ?? S.lastPct ?? 0, passMark()) : null);
  $('#voteBox').classList.add('hidden');
  const canContinue = !S.net || S.net.host;
  $('#contBtn').classList.toggle('hidden', !canContinue);
  $('#waitHost').classList.toggle('hidden', canContinue);
  renderBoard();
  if (canContinue) startAutoNext();
}

// remember this turn for the highlight reel (only turns sung on this phone have audio)
function keepClip(p, pass) {
  const blob = S.lastAudio;
  S.lastAudio = null;
  if (!blob || !p || !S.section || (S.net && !isMe(S.cur))) return;
  S.clips ??= [];
  S.clips.push({
    name: p.name, c: p.c, f: p.f, photo: p.photo, pass, round: S.round, at: Date.now(),
    lyric: S.section.words.map((w) => w.d).join(' '), heard: S.heard, pct: S.result?.pct ?? 0,
    song: S.song ? `${S.song.title} · ${S.song.artist}` : '', blob,
  });
  if (S.clips.length > 30) S.clips.shift();
}

// what the Continue button leads to (mirrors the #contBtn logic, without changing anything)
function upcoming() {
  const solo = S.players.length === 1, left = alive().length;
  const standing = S.players.filter((p) => p.lives > 0).length;
  if ((solo && standing === 0) || (!solo && standing <= 1) || left === 0) return { kind: 'end', label: 'SEE RESULTS 🏆' };
  if (S.mode === 'pack' && S.songTurns + 1 >= left) return { kind: 'song', label: 'NEXT SONG 🎵' };
  const n = nextAlive(S.cur);
  return { kind: 'next', label: n === S.cur ? 'GO AGAIN →' : `NEXT: ${S.players[n].name.toUpperCase()} →` };
}
// the game keeps moving: Continue fires by itself after 5s unless someone taps "Hold on"
const AUTO_SECS = 5;
let autoT = null, autoLeft = 0;
function startAutoNext() {
  stopAutoNext();
  const btn = $('#contBtn'), label = upcoming().label;
  autoLeft = AUTO_SECS;
  btn.textContent = `${label}  ${autoLeft}`;
  btn.classList.remove('counting'); void btn.offsetWidth; btn.classList.add('counting');
  $('#holdBtn').classList.remove('hidden');
  autoT = setInterval(() => {
    if (!$('#menu').classList.contains('hidden')) return; // paused while the menu is open
    if (--autoLeft <= 0) { stopAutoNext(); btn.click(); return; }
    btn.textContent = `${label}  ${autoLeft}`;
  }, 1000);
}
function stopAutoNext() {
  if (autoT) clearInterval(autoT);
  autoT = null;
  const btn = $('#contBtn');
  btn.classList.remove('counting');
  if (S.players.length && S.section) btn.textContent = upcoming().label;
  $('#holdBtn').classList.add('hidden');
}
$('#holdBtn').onclick = () => { stopAutoNext(); toast('Take your time. Tap the button when you\'re ready'); };
function applyVerdict(pass) {
  applyResult(pass, S.result.pct);
  showVerdict(pass);
}
$('#votePass').onclick = () => (S.net ? castVote(true) : applyVerdict(true));
$('#voteFail').onclick = () => (S.net ? castVote(false) : applyVerdict(false));

$('#contBtn').onclick = () => {
  if ($('#s-reveal').classList.contains('active') === false) return;
  stopAutoNext();
  player.pauseVideo();
  S.phase = 'idle';
  S.resumeAt = S.section.end;
  const solo = S.players.length === 1, left = alive().length;
  const standing = S.players.filter((p) => p.lives > 0).length; // includes anyone briefly disconnected
  if ((solo && standing === 0) || (!solo && standing <= 1) || left === 0) return endGame();
  const prev = S.cur;
  S.cur = nextAlive(S.cur);
  if (S.cur <= prev) S.round++;
  S.songTurns++;
  if (S.mode === 'pack' && S.songTurns >= left) return nextPackSong(); // everyone had a go: next song
  goHandoff();
};

// mini leaderboard on the reveal screen
function renderStandings(gain) {
  const cur = S.players[S.cur];
  if (!cur) return ($('#standings').innerHTML = '');
  const list = [...S.players].filter((p) => !p.gone || p === cur).sort((a, b) => b.points - a.points || b.lives - a.lives).slice(0, 4);
  if (!list.includes(cur)) list[list.length - 1] = cur;
  $('#standings').innerHTML = list.map((p) =>
    `<div class="st ${p === cur ? 'me' : ''} ${p.lives <= 0 ? 'out' : ''}">${avatar(p, 'sm')}<span class="nm">${esc(p.name)}</span>${p === cur && gain ? `<span class="delta">+${gain}</span>` : ''}<span class="hearts">${p.lives > 0 ? '❤️'.repeat(p.lives) : '💀'}</span><span class="pts">${p.points}</span></div>`).join('');
}

// ---------- endings ----------
function standings() {
  return [...S.players].sort((a, b) => (b.lives > 0) - (a.lives > 0) || b.lives - a.lives || b.points - a.points);
}
function renderRank() {
  $('#rank').innerHTML = standings().map((p, i) => `<li><span class="pos">${i + 1}</span>${avatar(p, 'sm')}<span class="nm">${esc(p.name)}</span><span class="stt">${p.lives > 0 ? '❤️'.repeat(p.lives) : '💀'}<br>${p.passes} lines · ${p.points} pts</span></li>`).join('');
}
function endButtons(isFinal) {
  $('#nextSong').classList.toggle('hidden', isFinal);
  $('#endGame').classList.toggle('hidden', isFinal);
  $('#again').classList.toggle('hidden', !isFinal);
  $('#newPlayers').classList.toggle('hidden', !isFinal);
}
function songOver() {
  if (S.net && !S.net.host) return; // the host decides what plays next
  S.phase = 'idle';
  player?.pauseVideo?.();
  if (S.mode === 'pack') return nextPackSong();
  if (S.net) { S.song = null; S.net.send('picking'); toast('Song over! Pick the next one 🎵'); return show('song'); }
  $('#endKicker').textContent = 'Song over 🎵';
  $('#endTitle').textContent = alive().length ? 'Still standing' : 'Everyone is out';
  $('#endAv').innerHTML = '';
  renderRank(); endButtons(false);
  show('end');
}
function endGame(kicker = 'Game over') {
  kicker = typeof kicker === 'string' ? kicker : 'Game over';
  if (S.net?.host) S.net.send('end', { players: S.players, kicker });
  showEnd(kicker);
}
function showEnd(kicker) {
  S.phase = 'idle';
  stopRec(); clearInterval(turnTimer); clearInterval(countT);
  player?.pauseVideo?.();
  const top = standings()[0];
  $('#endKicker').textContent = kicker;
  $('#endTitle').textContent = S.players.length === 1 ? `${top.points} points` : `${top.name} wins!`;
  $('#endAv').innerHTML = `<span class="crown">👑</span>${avatar(top, 'xl')}`;
  sfx.pass();
  renderRank(); endButtons(true);
  recordResult();
  offerReel();
  if (S.net) {
    $('#again').classList.toggle('hidden', !S.net.host);
    $('#newPlayers').classList.add('hidden');
    $('#endHome').textContent = S.net.host ? '🚪 Close room' : '🚪 Leave room';
  } else $('#endHome').textContent = '🏠 Home';
  show('end');
  confetti();
}
$('#nextSong').onclick = () => { S.song = null; S.cur = nextAlive(S.cur); show('song'); };
$('#endGame').onclick = endGame;
$('#again').onclick = () => {
  resetScores(); S.midGame = false;
  if (S.net) { S.players = S.players.filter((p) => !p.gone); S.net.send('picking'); }
  show('song');
};
$('#endHome').onclick = () => quitToHome();

// ---------- navigation & pause menu ----------
$('#playersBack').onclick = () => show('home');
$('#songBack').onclick = () => {
  if (S.midGame && S.song) return goHandoff();
  if (S.net) { S.started = false; S.net.send('lobby'); return show('lobby'); }
  show('players');
};
$('#board').onclick = (e) => { if (e.target.closest('[data-menu]')) openMenu(); };

let pausedPhase = null;
function openMenu() {
  if (!$('#menu').classList.contains('hidden')) return;
  if (autoT) stopAutoNext(); // a pause shouldn't skip the next singer behind your back
  if (S.net) { // online: the game keeps going for everyone; host gets controls, guests can leave
    const host = S.net.host;
    $('#menuTitle').textContent = `Room ${S.net.code}`;
    for (const id of ['#mResume', '#mSkip', '#mChange', '#mEnd']) $(id).classList.toggle('hidden', !host);
    $('#mResume').classList.add('hidden');
    $('#mSkip').classList.toggle('hidden', !host || !S.song);
    $('#mQuit').textContent = host ? '🚪 Close the room' : '🚪 Leave room';
    $('#mClose').classList.remove('hidden');
    return $('#menu').classList.remove('hidden');
  }
  $('#menuTitle').textContent = 'Game paused';
  for (const id of ['#mResume', '#mChange', '#mEnd']) $(id).classList.remove('hidden');
  $('#mQuit').textContent = '🚪 Quit to home';
  $('#mClose').classList.add('hidden');
  pausedPhase = S.phase;
  player?.pauseVideo?.();
  if (S.phase === 'turn' || S.phase === 'scoring') { clearInterval(turnTimer); clearInterval(countT); stopRec(); }
  S.phase = 'paused';
  $('#mSkip').classList.toggle('hidden', !S.song);
  $('#menu').classList.remove('hidden');
}
function closeMenu() {
  $('#menu').classList.add('hidden');
  // back on the reveal with the verdict in: restart the countdown
  setTimeout(() => { if ($('#s-reveal').classList.contains('active') && !$('#contBtn').classList.contains('hidden') && !autoT) startAutoNext(); }, 0);
}
$('#mResume').onclick = () => {
  closeMenu();
  const p = pausedPhase; pausedPhase = null;
  if (p === 'listen' || p === 'reveal-play') { S.phase = p; player.playVideo(); }
  else if (p === 'turn' || p === 'scoring' || p === 'cut') startTurn(); // a fresh attempt at the same lines
  else S.phase = p || 'idle';
};
$('#mSkip').onclick = () => { closeMenu(); pausedPhase = null; skipSong(); };
$('#mChange').onclick = () => {
  closeMenu(); pausedPhase = null; S.phase = 'idle'; S.midGame = true;
  if (S.net) { player?.pauseVideo?.(); S.net.send('picking'); }
  show('song');
};
$('#mClose').onclick = closeMenu;
$('#mEnd').onclick = () => { closeMenu(); pausedPhase = null; endGame(); };
$('#mQuit').onclick = () => { closeMenu(); pausedPhase = null; quitToHome(); };
function quitToHome() {
  stopWave();
  if (S.net) leaveRoom();
  stopRec(); clearInterval(turnTimer); clearInterval(countT);
  player?.pauseVideo?.();
  S.phase = 'idle'; S.song = null; S.midGame = false;
  show('home');
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#board').classList.contains('hidden')) openMenu(); });

// phone / browser back button
addEventListener('popstate', () => {
  const cur = document.querySelector('.screen.active').id.slice(2);
  if (['handoff', 'listen', 'turn', 'reveal'].includes(cur)) {
    if ($('#menu').classList.contains('hidden')) openMenu(); else $('#mResume').click();
    history.pushState({ ptm: 'guard' }, '');
  } else if (cur === 'song') $('#songBack').click();
  else if (cur === 'lobby' || (S.net && cur === 'end')) { quitToHome(); }
  else if (['signin', 'profile', 'leaders'].includes(cur)) show('home');
  else if (cur !== 'home') show('home');
});
$('#newPlayers').onclick = () => { renderPlayers(); show('players'); };


// ---------- online multiplayer ----------
// The host's phone runs the game and broadcasts every decision. Each phone plays the music itself and
// cuts at the same lyric line; the singer's phone listens and streams their words to everyone else.
import('./net.js').then((m) => (NET = m));
let NET;
const ME = (() => {
  let id; try { id = sessionStorage.getItem('ptm-id'); } catch {}
  if (!id) { id = (crypto.randomUUID?.() || String(Math.random()).slice(2)); try { sessionStorage.setItem('ptm-id', id); } catch {} }
  return { id };
})();
const isMe = (i) => !!S.net && S.players[i]?.id === S.net.me.id;
const roomLink = (code) => `${location.origin}${location.pathname}?room=${code}`;
try { $('#myName').value = localStorage.getItem('ptm-name') || ''; } catch {}

$('#onlineBtn').onclick = () => {
  unlockAudio();
  if (ACCT && !$('#myName').value) $('#myName').value = ACCT.profile.display_name.slice(0, 14);
  show('online'); ensurePlayer().catch(() => {});
};
$('#onlineBack').onclick = () => show('home');
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) { $('#joinCode').value = roomParam.toUpperCase().slice(0, 4); show('online'); ensurePlayer().catch(() => {}); }

function myName() {
  const n = $('#myName').value.trim();
  if (!n) { $('#onlineStatus').textContent = 'Type your name first 👆'; $('#myName').focus(); return null; }
  try { localStorage.setItem('ptm-name', n); } catch {}
  return n;
}
async function connect(code, host) {
  if (!NET) NET = await import('./net.js');
  const me = { id: ME.id, name: S.myName };
  const room = await NET.openRoom(code, me, { onMsg, onPresence });
  S.net = { ...room, code, me, host };
  return room;
}
$('#createRoom').onclick = async () => {
  const name = myName(); if (!name) return;
  S.myName = name;
  $('#onlineStatus').textContent = 'Creating your room…';
  try {
    for (let tries = 0; tries < 4; tries++) {
      const code = NET?.newCode?.() || (await import('./net.js')).newCode();
      const room = await connect(code, true);
      await room.track({ id: ME.id, name, host: true, ready: false, at: Date.now(), ...myLook() });
      await new Promise((r) => setTimeout(r, 1200)); // make sure nobody else already hosts this code
      if (!room.members().some((m) => m.host && m.id !== ME.id)) return enterLobby();
      room.leave(); S.net = null;
    }
    throw new Error('Could not create a room. Try again.');
  } catch (e) { $('#onlineStatus').textContent = e.message; S.net = null; }
};
$('#joinForm').onsubmit = async (e) => {
  e.preventDefault();
  const name = myName(); if (!name) return;
  const code = $('#joinCode').value.trim().toUpperCase();
  if (code.length !== 4) { $('#onlineStatus').textContent = 'Room codes have 4 characters.'; return; }
  S.myName = name;
  $('#onlineStatus').textContent = `Joining ${code}…`;
  try {
    const room = await connect(code, false);
    // presence is only shared once you've announced yourself, so announce first, then look for the host
    await room.track({ id: ME.id, name, host: false, ready: false, at: Date.now(), ...myLook() });
    const t0 = Date.now();
    while (!room.members().some((m) => m.host) && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 200));
    if (!room.members().some((m) => m.host)) { room.leave(); S.net = null; $('#onlineStatus').textContent = `No room called ${code}. Check the code with your friend.`; return; }
    enterLobby();
  } catch (err) { $('#onlineStatus').textContent = err.message; S.net = null; }
};

function enterLobby() {
  $('#onlineStatus').textContent = '';
  $('#roomCode').textContent = S.net.code;
  $('#livesWrap').classList.toggle('hidden', !S.net.host);
  $('#lobbyStart').classList.toggle('hidden', !S.net.host);
  $('#readyUp').classList.remove('on'); $('#readyUp').textContent = '🎧 Tap when ready (turns on sound + mic)';
  S.started = false; S.players = []; S.mode = 'single'; S.song = null; S.songKey = null;
  history.replaceState(history.state, '', `?room=${S.net.code}`);
  show('lobby');
  renderLobby(S.net.members());
}
function renderLobby(members) {
  if (!S.net) return;
  const host = members.find((m) => m.host);
  $('#lobbyCount').textContent = `Who's in · ${members.length}`;
  $('#lobbyList').innerHTML = members.map((m, i) => `<li>${avatar(dress({ photo: m.photo, c: m.c, f: m.f, name: m.name }, i), 'lg', m.ready ? 'ready' : '')}<span class="nm">${esc(m.name)}</span>${m.id === ME.id ? '<span class="tag">(you)</span>' : ''}<span class="tag ${m.host ? '' : m.ready ? 'ok' : ''}">${m.host ? '👑 host' : m.ready ? 'ready' : 'getting ready…'}</span></li>`).join('') +
    '<li class="empty"><span class="av lg">＋</span><span class="tag">invite</span></li>';
  const ready = members.filter((m) => m.ready).length;
  if (S.net.host) $('#lobbyStatus').textContent = members.length < 2 ? 'Share the code. Your friends join from their own phones.' : `${ready}/${members.length} ready`;
  else if (!S.started && !$('#lobbyStatus').dataset.picking) $('#lobbyStatus').textContent = host ? `Waiting for ${host.name} to pick the music…` : '';
}
$('#shareRoom').onclick = async () => {
  const url = roomLink(S.net.code), text = `Join my Pass The Mic room 🎤 Code: ${S.net.code}`;
  try { if (navigator.share) return await navigator.share({ title: 'Pass The Mic', text, url }); } catch { return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Invite link copied. Paste it in your group chat'); } catch { toast(url); }
};
// one tap that unlocks sound (YouTube) and asks for the mic, so later turns can start by themselves
$('#readyUp').onclick = async () => {
  unlockAudio();
  S.lang = $('#lobbyLang').value;
  primePlayer();
  if (S.cloud) navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => toast('Allow microphone access so you can sing your turns.'));
  else if (SR) { startRec(null, () => {}); setTimeout(stopRec, 1500); }
  $('#readyUp').classList.add('on'); $('#readyUp').textContent = '✓ Ready! Sound and mic are on';
  S.net?.track({ ready: true });
};
$('#lobbyLang').onchange = () => { S.lang = $('#lobbyLang').value; };
function primePlayer() {
  if (!player?.playVideo) return;
  try {
    player.mute();
    player.loadVideoById({ videoId: S.song?.ids?.[0] || '2cNFrajBk0k', startSeconds: 0 });
    setTimeout(() => { player.pauseVideo(); player.unMute(); }, 700);
  } catch {}
}
$('#lobbyStart').onclick = () => {
  unlockAudio(); primePlayer();
  S.lang = $('#lobbyLang').value;
  S.net.track({ ready: true });
  S.lives = +$('#lobbyLives').value;
  S.players = S.net.members().map((m, i) => dress({ id: m.id, name: m.name, photo: m.photo, uid: m.uid, c: m.c, f: m.f }, i));
  S.recorded = false; S.clips = [];
  resetScores();
  S.started = true; S.midGame = false;
  S.net.send('picking');
  show('song');
};
$('#lobbyBack').onclick = () => quitToHome();

function leaveRoom() {
  if (!S.net) return;
  if (S.net.host) S.net.send('bye');
  clearTimeout(hostGoneT); clearTimeout(voteT); clearTimeout(watchdogT);
  S.net.leave();
  S.net = null; S.started = false; S.players = [];
  history.replaceState(history.state, '', location.pathname);
}

// ---- presence: who's here
let hostGoneT;
function onPresence(members) {
  if (!S.net) return;
  if ($('#s-lobby').classList.contains('active')) renderLobby(members);
  if (S.net.host) return hostSyncPlayers(members);
  // guests: if the host disappears for a while, the room is over
  if (members.some((m) => m.host)) clearTimeout(hostGoneT);
  else { clearTimeout(hostGoneT); hostGoneT = setTimeout(() => { toast('The host left, so the room closed.'); quitToHome(); }, 8000); }
}
function hostSyncPlayers(members) {
  if (!S.started) return;
  const here = new Set(members.map((m) => m.id));
  let changed = false, newcomer = false, singerLeft = false;
  for (const m of members) {
    const p = S.players.find((x) => x.id === m.id);
    if (!p) { S.players.push(dress({ id: m.id, name: m.name, photo: m.photo, uid: m.uid, c: m.c, f: m.f, lives: S.lives, points: 0, passes: 0 }, S.players.length)); changed = newcomer = true; }
    else if (p.gone) { p.gone = false; changed = newcomer = true; } // came back (lives stay as they were)
  }
  for (const p of S.players) {
    if (here.has(p.id) || p.gone) continue;
    p.gone = true; changed = true; // keeps their lives: a dropped connection shouldn't knock you out
    if (p === S.players[S.cur] && ['countin', 'listen', 'spectate', 'turn', 'scoring'].includes(S.phase)) singerLeft = true;
  }
  if (!changed) return;
  S.net.send('players', { players: S.players });
  if (newcomer && S.song) sendSong();
  renderBoard();
  if (singerLeft) hostJudge({ pct: 0, sims: [], heard: '', noMic: false });
  if (S.voting) maybeDecide();
}

// ---- messages
function onMsg(m) {
  if (!S.net) return;
  const fromHost = !S.net.host;
  switch (m.t) {
    case 'picking': if (fromHost) guestPicking(); break;
    case 'lobby': if (fromHost) { S.started = false; delete $('#lobbyStatus').dataset.picking; stopAll(); show('lobby'); renderLobby(S.net.members()); } break;
    case 'song': if (fromHost) handleSong(m); break;
    case 'round': if (fromHost) handleRound(m); break;
    case 'players': if (fromHost) { S.players = m.players; S.cur = S.players.findIndex((p) => p.id === S.curId); renderBoard(); } break;
    case 'live': if (m.from !== ME.id) { S.live = m; if (S.phase === 'spectate') paintLive(m); } break;
    case 'result': if (S.net.host && m.from === S.players[S.cur]?.id) hostJudge(m); break;
    case 'verdict': if (fromHost) handleVerdict(m); break;
    case 'vote': if (S.net.host) hostVote(m.from, m.pass); break;
    case 'decided': if (fromHost) handleDecided(m); break;
    case 'end': if (fromHost) { S.players = m.players; showEnd(m.kicker); } break;
    case 'bye': if (fromHost) { toast('The host closed the room.'); quitToHome(); } break;
  }
}
function stopAll() {
  stopRec(); clearInterval(turnTimer); clearInterval(countT); clearInterval(countInT); clearInterval(specT);
  player?.pauseVideo?.();
  S.phase = 'idle';
}
function guestPicking() {
  stopAll();
  S.started = true;
  $('#lobbyStatus').dataset.picking = '1';
  $('#lobbyStatus').textContent = '🎵 The host is picking the music…';
  show('lobby');
  renderLobby(S.net.members());
}

// ---- host: send song + start rounds
function sendSong() {
  S.net.send('song', { key: S.songKey, song: S.song.raw, mode: S.mode, pack: S.pack, players: S.players });
}
function hostRound() {
  const key = `${S.song.ids[0]}:${S.qi}:${S.mode}`;
  if (S.songKey !== key) { S.songKey = key; sendSong(); }
  const sec = pickSection(S.resumeAt);
  if (!sec) return songOver();
  const m = { cur: S.players[S.cur].id, round: S.round, resumeAt: S.resumeAt, i: sec.i, j: sec.j, players: S.players, fresh: S.songTurns === 0 };
  S.net.send('round', m);
  handleRound(m);
}

// ---- everyone: load song, count in, listen
function handleSong(m) {
  if (S.songKey === m.key && S.song) return;
  stopAll();
  S.songKey = m.key; S.mode = m.mode; S.pack = m.pack; S.players = m.players;
  $('#handLead').textContent = 'Get ready';
  $('#handName').textContent = 'NEXT SONG';
  $('#handAv').innerHTML = '';
  $('#handSong').textContent = 'Loading the next song…';
  $('#handHint').textContent = '';
  $('#handCount').classList.add('hidden');
  $('#readyBtn').classList.add('hidden'); $('#skipSongBtn').classList.add('hidden');
  show('handoff');
  S.songLoading = setSong(m.song).then(() => {
    if (S.phase !== 'idle' || !$('#s-handoff').classList.contains('active')) return;
    $('#handSong').textContent = `🎵 ${S.song.title} · ${S.song.artist}`;
    $('#handHint').textContent = "You'll jump in on the next turn.";
  }).catch((e) => { console.warn(e); toast("Couldn't load this song."); });
}
let countInT;
async function handleRound(m) {
  await S.songLoading;
  if (!S.song || !S.net) return;
  stopAll();
  S.players = m.players; S.curId = m.cur;
  S.cur = S.players.findIndex((p) => p.id === m.cur);
  S.round = m.round; S.resumeAt = m.resumeAt; S.live = null; S.judged = false;
  if (m.round === 1 && m.fresh) { S.recorded = false; S.clips = []; }
  S.section = sectionFrom(m.i, m.j);
  $('#chips').innerHTML = ''; $('#heard').textContent = '';
  const me = isMe(S.cur), name = S.players[S.cur]?.name || '';
  $('#roundInfo').textContent = `Round ${S.round} · pass mark ${passMark()}%`;
  $('#handLead').textContent = me ? "You're up next" : 'Up next';
  $('#handName').textContent = me ? 'YOU' : name;
  $('#handAv').innerHTML = avatar(S.players[S.cur], 'xl');
  $('#handSong').textContent = m.fresh ? `🎵 ${S.song.title} · ${S.song.artist}` : '';
  $('#handHint').textContent = me ? 'Listen closely. When the music stops, carry on singing.' : `Listen along. When the music stops, ${name} has to carry on.`;
  $('#readyBtn').classList.add('hidden'); $('#skipSongBtn').classList.add('hidden');
  const c = $('#handCount'); c.classList.remove('hidden');
  show('handoff');
  S.phase = 'countin';
  let n = 3;
  c.textContent = `Starting in ${n}…`;
  clearInterval(countInT);
  countInT = setInterval(() => {
    if (S.phase !== 'countin') return clearInterval(countInT);
    if (--n > 0) { c.textContent = `Starting in ${n}…`; return; }
    clearInterval(countInT);
    startListen();
  }, 1000);
}

// ---- everyone else watches the singer
let specT, watchdogT;
function spectate() {
  S.phase = 'spectate';
  const go = $('#goTxt');
  go.className = 'go count'; go.textContent = 'IS SINGING';
  sfx.go();
  const sec = S.section, dur = singWindow(sec) + COUNT_IN + 0.5, t0 = performance.now();
  clearInterval(specT);
  specT = setInterval(() => {
    const f = 1 - (performance.now() - t0) / 1000 / dur;
    setTimer(f);
    if (f <= 0) clearInterval(specT);
  }, 100);
  if (S.live) paintLive(S.live);
  if (S.net.host) { // singer's phone went quiet? don't stall the game
    clearTimeout(watchdogT);
    watchdogT = setTimeout(() => { if (S.phase === 'spectate') hostJudge({ pct: 0, sims: [], heard: '', noMic: true }); }, (dur + 12) * 1000);
  }
}
function paintLive(m) {
  kickWave(0.7);
  paintChips('#chips', m.sims || [], false);
  $('#heard').textContent = m.heard ? `👂 “${m.heard}”` : '';
}
let liveAt = 0, liveT;
function sendLive(sims, heard) {
  clearTimeout(liveT);
  const wait = 300 - (Date.now() - liveAt);
  const go = () => { liveAt = Date.now(); S.net?.send('live', { sims, heard }); };
  if (wait <= 0) go(); else liveT = setTimeout(go, wait);
}

// ---- host decides; everyone shows the reveal
function hostJudge(res) {
  if (S.judged) return;
  S.judged = true;
  clearTimeout(watchdogT);
  const mark = passMark();
  const verdict = res.noMic ? 'vote' : res.pct >= mark ? 'pass' : res.pct < mark - 10 ? 'fail' : 'vote';
  S.lastPct = res.pct;
  if (verdict !== 'vote') applyResult(verdict === 'pass', res.pct);
  const m = { pct: res.pct, sims: res.sims, heard: res.heard, noMic: res.noMic, verdict, pass: verdict === 'pass', players: S.players };
  S.net.send('verdict', m);
  handleVerdict(m);
  if (verdict === 'vote') openVoting();
}
function handleVerdict(m) {
  if (!S.section || !S.song) { S.players = m.players; return renderBoard(); } // joined mid-turn: catch up next round
  clearInterval(specT); clearInterval(turnTimer); clearInterval(countT); stopRec();
  S.players = m.players; S.cur = S.players.findIndex((p) => p.id === S.curId);
  S.result = { pct: m.pct, verdict: m.verdict };
  if (!$('#chips').innerHTML) $('#chips').innerHTML = S.section.words.map((w) => `<span class="w" style="--len:${Math.max(2, w.d.length)}"><b>${esc(w.d)}</b></span>`).join('');
  showReveal(m, () => {
    if (m.verdict !== 'vote') return showVerdict(m.pass);
    const meVoter = !isMe(S.cur) && S.players.some((p) => p.id === ME.id && !p.gone);
    $('#voteBox').classList.toggle('hidden', !meVoter);
    if (!meVoter) { $('#verdict').textContent = '🗳️ The room is voting…'; }
  });
}
function castVote(pass) {
  $('#voteBox').classList.add('hidden');
  $('#verdict').className = 'verdict vote'; $('#verdict').textContent = 'Vote sent ✓ waiting for the others…';
  if (S.net.host) hostVote(ME.id, pass); else S.net.send('vote', { pass });
}
let voteT;
function openVoting() {
  S.voting = true; S.votes = new Map();
  maybeDecide();
  clearTimeout(voteT);
  voteT = setTimeout(() => { if (S.voting) decide(); }, 15000);
}
const voters = () => S.players.filter((p) => !p.gone && p.id !== S.players[S.cur]?.id).map((p) => p.id);
function hostVote(id, pass) { if (S.voting && voters().includes(id)) { S.votes.set(id, pass); maybeDecide(); } }
function maybeDecide() { if (S.voting && voters().every((id) => S.votes.has(id))) decide(); }
function decide() {
  S.voting = false; clearTimeout(voteT);
  const yes = [...S.votes.values()].filter(Boolean).length, no = S.votes.size - yes;
  const pass = yes >= no; // ties (and nobody voting) go to the singer
  applyResult(pass, S.lastPct);
  const m = { pass, players: S.players };
  S.net.send('decided', m);
  handleDecided(m);
}
function handleDecided(m) {
  S.players = m.players; S.cur = S.players.findIndex((p) => p.id === S.curId);
  showVerdict(m.pass);
}

// ---------- speech recognition ----------
let rec = null, recOn = false;
function startRec(expected, onText, { quiet = false, onFail = null } = {}) {
  if (!SR) return;
  recOn = false; try { rec?.stop(); } catch {}
  recOn = true;
  if (!quiet) S.micBlocked = false;
  let prior = '';
  const begin = () => {
    if (!recOn) return;
    let session = '';
    const r = new SR();
    rec = r;
    r.lang = S.lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e) => {
      const parts = [];
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        parts.push(res[0].transcript); // its top guess only: picking the guess that fits the lyric best inflated scores
      }
      session = parts.join(' ');
      onText(`${prior} ${session}`.replace(/\s+/g, ' ').trim());
    };
    r.onerror = (e) => {
      const why = {
        'not-allowed': 'Microphone blocked. Click the 🔒 by the address bar → allow Microphone, then reload.',
        'service-not-allowed': "This browser won't run speech recognition. Use Google Chrome or Safari.",
        'audio-capture': 'No microphone found. Check one is connected and allowed in System Settings → Privacy → Microphone.',
        'network': "This browser can't reach its speech service (common in Brave/Arc). Use Google Chrome or Safari.",
        'language-not-supported': 'That accent setting is not supported here. Try the US accent.',
      }[e.error];
      if (!why) return;
      recOn = false;
      if (quiet) return onFail?.(); // helper only: Whisper keeps listening
      S.micBlocked = true; toast(why);
    };
    r.onend = () => {
      prior = `${prior} ${session}`.trim();
      if (recOn && rec === r) setTimeout(begin, 120); // recognizers stop on pauses; keep listening
    };
    try { r.start(); } catch {}
  };
  begin();
}
function stopRec() {
  recOn = false;
  try { rec?.stop(); } catch {}
  if (cRec) stopCloudRec(true);
}

// ---------- cloud ears: Whisper via /api/transcribe ----------
// Records the turn and re-transcribes the growing clip every ~2.5s for live feedback, then once more
// in full when the turn ends. Much better than the browser recognizer on singing, accents and Pidgin,
// and works in every browser. Off (falls back to the browser recognizer) until GROQ_API_KEY is set.
S.cloud = false;
fetch('/api/transcribe?ping=1').then((r) => (r.ok ? r.json() : null)).then((j) => {
  S.cloud = !!j?.ok && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;
  if (S.cloud) { $('#srWarn').classList.add('hidden'); $('#micTest').classList.remove('hidden'); }
}).catch(() => {});

let cRec = null;
const recMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
// Whisper's prompt = what was sung just before, so it hears the song's words and spelling without being told the answer
const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const YO_MARKS = /[ẹọṣẸỌṢ]|[aeiou][\u0300\u0301]/i;
const YO_WORDS = new Set(['mo', 'mi', 'ni', 'ti', 'si', 'ko', 'ba', 'fun', 'wa', 're', 'won', 'ati', 'oluwa', 'olorun', 'emi', 'iwo', 'omo', 'owo', 'ife', 'gbogbo', 'sha', 'lo', 'se', 'temi', 'tiwa', 'jare', 'nkan', 'dada', 'soro', 'wo', 'fe', 'gba', 'yen', 'yi', 'eyin', 'awa', 'eleyi', 'ojo', 'ile', 'aye', 'orun', 'ori', 'oju', 'wahala', 'kilode', 'bawo', 'omoge', 'shey', 'sebi', 'abeg', 'jowo', 'ehn', 'ehen']);
const PIDGIN = /\b(dey|una|wetin|abeg|sabi|wahala|oya|wey|sey|comot|chop|shayo|gbese|ehn|na wa|o!|pikin|kpanla|gbedu)\b/i;
function sectionLang(sec) {
  const raw = S.song.lines.slice(sec.i, sec.j).map((l) => l.text).join(' ');
  const words = sec.words.map((w) => w.n);
  const yo = YO_MARKS.test(raw.normalize('NFD')) || words.filter((w) => YO_WORDS.has(w)).length / Math.max(1, words.length) >= 0.35;
  return yo ? '' : 'en'; // '' lets Whisper detect Yoruba itself instead of forcing English spellings
}
// Whisper gets a style hint only, never the song's lyrics or title: it knows famous songs and would
// "complete" a mumbled line with the real words, handing out points nobody sang.
function cloudPrompt() {
  const all = S.song.lines.map((l) => l.text).join(' ');
  const naija = PIDGIN.test(all) || YO_MARKS.test(all.normalize('NFD')) || /naija|afro|amapiano|throwback/i.test(S.pack || '');
  return naija ? 'Someone singing in Nigerian Pidgin, Yoruba and English, e.g. wetin, dey, abeg, sabi, wahala, oya, omo, gbogbo.' : 'Someone singing song lyrics.';
}
async function transcribe(blob, prompt, lang = 'en', final = false) {
  const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'content-type': blob.type || 'audio/webm', 'x-prompt': encodeURIComponent(prompt || ''), 'x-lang': lang, 'x-final': final ? '1' : '0' }, body: blob });
  if (!r.ok) throw new Error(`transcribe ${r.status}`);
  return (await r.json()).text || '';
}
async function startCloudRec(prompt, onText, { partials = true, lang = 'en' } = {}) {
  if (cRec) stopCloudRec(true);
  S.micBlocked = false; S.cloudFailed = false;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } }); }
  catch { S.micBlocked = true; toast('Microphone blocked. Allow mic access for this site in your browser settings, then reload.'); return; }
  const mime = recMime();
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const st = { stream, mr, chunks: [], mime: mr.mimeType || mime || 'audio/webm', inflight: false, sent: 0, text: '', ok: 0, onText, prompt, partials, lang };
  cRec = st;
  try { unlockAudio(); st.src = ac.createMediaStreamSource(stream); st.an = ac.createAnalyser(); st.an.fftSize = 512; st.src.connect(st.an); } catch {}
  mr.ondataavailable = (e) => { if (e.data.size) st.chunks.push(e.data); };
  mr.start(400);
  st.timer = setInterval(() => { if (st.partials) pump(st); }, 1500);
  // voice activity: count how long the mic actually hears something (silence never reaches Whisper)
  st.voiced = 0;
  st.vad = setInterval(() => { const l = levelOf(st); if (l === null || l > 0.025) st.voiced += 100; }, 100);
}
async function pump(st, final = false) {
  if (st.inflight && !final) return;
  const size = st.chunks.reduce((n, c) => n + c.size, 0);
  if (!final && size - st.sent < 5000) return; // nothing new worth sending yet
  if (!final && st.voiced < 300) return; // nobody has sung anything yet
  if (final && st.voiced < 400) { dbg(`whisper skipped: only ${st.voiced}ms of voice`); st.text = ''; st.ok++; return; } // silence: don't let Whisper imagine words
  st.inflight = true; st.sent = size;
  try {
    const t0 = performance.now();
    const text = await transcribe(new Blob(st.chunks, { type: st.mime }), st.prompt, st.lang, final);
    dbg(`whisper ${final ? 'FINAL' : 'partial'} ${Math.round(performance.now() - t0)}ms ${(size / 1024).toFixed(0)}KB voiced=${st.voiced}ms:`, JSON.stringify(text));
    st.ok++;
    if (text || final) { st.text = text || st.text; if (cRec === st || final) st.onText(st.text); }
  } catch (e) { console.warn(e); }
  finally { st.inflight = false; }
}
// stop recording; resolves with the transcript of the whole clip (abort: just stop)
function stopCloudRec(abort = false) {
  const st = cRec;
  if (!st) return Promise.resolve('');
  cRec = null; clearInterval(st.timer); clearInterval(st.vad);
  return new Promise((resolve) => {
    const finish = async () => {
      st.stream.getTracks().forEach((t) => t.stop());
      try { st.src?.disconnect(); } catch {}
      if (abort) return resolve('');
      const work = (async () => { while (st.inflight) await new Promise((r) => setTimeout(r, 80)); await pump(st, true); })();
      await Promise.race([work, new Promise((r) => setTimeout(r, 7000))]);
      S.cloudFailed = st.ok === 0;
      // keep this turn's singing for the highlight reel (never uploaded unless the player shares the reel)
      S.lastAudio = st.voiced >= 400 && st.chunks.length ? new Blob(st.chunks, { type: st.mime }) : null;
      resolve(st.text);
    };
    if (st.mr.state !== 'inactive') { st.mr.onstop = finish; st.mr.stop(); } else finish();
  });
}
function micLevel() { return cRec ? levelOf(cRec) : null; }
function levelOf(st) {
  const an = st?.an;
  if (!an) return null; // no analyser (audio context blocked): don't gate on volume
  const d = new Uint8Array(an.fftSize);
  an.getByteTimeDomainData(d);
  let sum = 0;
  for (const v of d) { const x = (v - 128) / 128; sum += x * x; }
  return Math.sqrt(sum / d.length);
}

// ---------- confetti ----------
function confetti() {
  const c = $('#confetti'), g = c.getContext('2d');
  const dpr = Math.min(devicePixelRatio, 2);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  g.scale(dpr, dpr);
  const colors = ['#ff3d8b', '#ffd23f', '#8f5bff', '#2fe39a', '#ffffff'];
  const bits = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  (function f(now) {
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
    }
    if (now - t0 < 4500) requestAnimationFrame(f); else g.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}


// ---------- accounts: Google sign-in, profiles, photos, leaderboards ----------
// Optional: guests can always play. Signing in saves your results and puts you on the leaderboards.
let SB = null, ACCT = null; // ACCT = { id, profile }
const getSB = async () => SB || (SB = await (await import('./net.js')).sb());
const meAsPlayer = () => ({ name: ACCT.profile.display_name.slice(0, 14), uid: ACCT.id, photo: ACCT.profile.avatar_url, c: ACCT.profile.color || 1, f: ACCT.profile.face || '😎' });
const myLook = () => (ACCT ? { uid: ACCT.id, photo: ACCT.profile.avatar_url || null, c: ACCT.profile.color || 1, f: ACCT.profile.face || '😎' } : {});

async function initAuth() {
  try {
    const c = await getSB();
    const { data } = await c.auth.getSession();
    await setSession(data.session, false);
    // (supabase-js: don't await other calls inside this callback)
    c.auth.onAuthStateChange((evt, session) => setTimeout(() => setSession(session, evt === 'SIGNED_IN'), 0));
  } catch (e) { console.warn('accounts unavailable', e); }
}
async function setSession(session, greet) {
  if (!session?.user) { ACCT = null; return renderAcct(); }
  if (ACCT?.id === session.user.id) return renderAcct();
  const c = await getSB();
  let { data: profile } = await c.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (!profile) { // account made before the profiles table existed
    const meta = session.user.user_metadata || {};
    ({ data: profile } = await c.from('profiles').upsert({ id: session.user.id, display_name: (meta.full_name || meta.name || 'Singer').slice(0, 24), avatar_url: meta.avatar_url || null }).select().single());
  }
  ACCT = { id: session.user.id, profile: profile || { display_name: 'Singer', face: '😎', color: 1 } };
  renderAcct();
  if (greet) toast(`Welcome, ${ACCT.profile.display_name.split(' ')[0]} 👋`);
}
function renderAcct() {
  const b = $('#acctBtn');
  b.classList.toggle('out', !ACCT);
  $('#acctAv').innerHTML = ACCT ? avatar({ photo: ACCT.profile.avatar_url, c: ACCT.profile.color, f: ACCT.profile.face, name: ACCT.profile.display_name }, 'xs') : '';
  $('#acctName').textContent = ACCT ? ACCT.profile.display_name.split(' ')[0] : 'Sign in';
  if ($('#s-players').classList.contains('active')) renderPlayers();
  $('#leadersSignin').classList.toggle('hidden', !!ACCT);
}
$('#acctBtn').onclick = () => (ACCT ? openProfile() : show('signin'));
$('#leadersBtn').onclick = () => openLeaders();
$('#endLeaders').onclick = () => openLeaders();
$('#leadersSignin').onclick = () => show('signin');
document.querySelectorAll('[data-home]').forEach((b) => (b.onclick = () => show('home')));
$('#addMe').onclick = () => {
  if (!ACCT || S.players.some((p) => p.uid === ACCT.id) || S.players.length >= 12) return;
  S.players.push(meAsPlayer()); renderPlayers();
};

$('#googleBtn').onclick = async () => {
  $('#signinStatus').textContent = 'Opening Google…';
  try {
    const on = await (await import('./net.js')).providers().catch(() => ({}));
    if (!on.google) return ($('#signinStatus').textContent = "Google sign-in isn't switched on yet. Try again soon!");
    const c = await getSB();
    const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href.split('#')[0] } });
    if (error) throw error;
  } catch (e) {
    $('#signinStatus').textContent = /provider is not enabled|Unsupported provider/i.test(e.message || '') ? "Google sign-in isn't switched on yet. Try again soon!" : "Couldn't open Google sign-in. Check your connection and try again.";
  }
};

// ---- profile
let draft = null;
async function openProfile() {
  if (!ACCT) return show('signin');
  const p = ACCT.profile;
  draft = { face: p.face || '😎', color: p.color || 1, avatar_url: p.avatar_url || null };
  $('#profName').value = p.display_name || '';
  $('#profUser').value = p.username || '';
  $('#profStatus').textContent = '';
  renderProfile();
  show('profile');
  loadStats();
}
function renderProfile() {
  $('#profAv').innerHTML = avatar({ photo: draft.avatar_url, c: draft.color, f: draft.face, name: $('#profName').value }, '');
  $('#photoDel').classList.toggle('hidden', !draft.avatar_url);
  $('#faces').innerHTML = FACES.map((f) => `<button type="button" data-face="${f}" class="${f === draft.face ? 'on' : ''}" aria-label="Avatar ${f}">${f}</button>`).join('');
  $('#swatches').innerHTML = [1, 2, 3, 4, 5, 6].map((c) => `<button type="button" data-color="${c}" class="c${c} ${c === draft.color ? 'on' : ''}" aria-label="Colour ${c}"></button>`).join('');
}
$('#faces').onclick = (e) => { const f = e.target.closest('[data-face]')?.dataset.face; if (f) { draft.face = f; renderProfile(); } };
$('#swatches').onclick = (e) => { const c = e.target.closest('[data-color]')?.dataset.color; if (c) { draft.color = +c; renderProfile(); } };
async function saveProfile(patch) {
  const c = await getSB();
  const { data, error } = await c.from('profiles').upsert({ id: ACCT.id, ...patch, updated_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  ACCT.profile = data;
  renderAcct();
  return data;
}
$('#profSave').onclick = async () => {
  const name = $('#profName').value.trim(), user = $('#profUser').value.trim().replace(/^@/, '');
  if (!name) return ($('#profStatus').textContent = 'Add a display name first.');
  if (user && !/^[a-zA-Z0-9_]{3,20}$/.test(user)) return ($('#profStatus').textContent = 'Usernames are 3–20 letters, numbers or _.');
  $('#profSave').disabled = true; $('#profStatus').textContent = 'Saving…';
  try {
    await saveProfile({ display_name: name, username: user || null, face: draft.face, color: draft.color });
    $('#profStatus').textContent = '✓ Saved';
    toast('Profile saved ✓');
  } catch (e) {
    $('#profStatus').textContent = e.code === '23505' ? 'That username is taken. Try another.' : "Couldn't save. Try again.";
  } finally { $('#profSave').disabled = false; }
};
// photos: square-crop + shrink on the phone (fast uploads), then save straight away
$('#photoIn').onchange = async (e) => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (!file) return;
  $('#profStatus').textContent = 'Uploading your photo…';
  try {
    const blob = await squareJpeg(file, 512);
    const c = await getSB(), path = `${ACCT.id}/avatar-${Date.now()}.jpg`;
    const { error } = await c.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
    if (error) throw error;
    draft.avatar_url = c.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    await saveProfile({ avatar_url: draft.avatar_url });
    renderProfile();
    $('#profStatus').textContent = '✓ Looking good! Your photo shows up in every game.';
  } catch (err) {
    console.warn(err);
    $('#profStatus').textContent = "Couldn't use that photo. Try a JPG or PNG under 10 MB.";
  }
};
$('#photoDel').onclick = async () => {
  try { draft.avatar_url = null; await saveProfile({ avatar_url: null }); renderProfile(); $('#profStatus').textContent = 'Photo removed. Using your emoji avatar.'; }
  catch { $('#profStatus').textContent = "Couldn't remove it. Try again."; }
};
async function squareJpeg(file, size) {
  if (file.size > 10 * 1024 * 1024) throw new Error('too big');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    cv.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return await new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('encode'))), 'image/jpeg', 0.86));
  } finally { URL.revokeObjectURL(url); }
}
async function loadStats() {
  $('#profStats').innerHTML = '';
  try {
    const c = await getSB();
    const { data } = await c.from('game_results').select('points,lines,won').eq('user_id', ACCT.id).limit(5000);
    const g = data || [], sum = (k) => g.reduce((n, r) => n + (r[k] || 0), 0);
    const tile = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
    $('#profStats').innerHTML = tile(g.length, 'Games') + tile(g.filter((r) => r.won).length, 'Wins') + tile(sum('points'), 'Points') + tile(sum('lines'), 'Lines');
  } catch {}
}
$('#signOut').onclick = async () => {
  try { await (await getSB()).auth.signOut(); } catch {}
  ACCT = null; renderAcct(); show('home'); toast('Signed out. See you on the mic 🎤');
};

// ---- leaderboards
let boardKind = 'week';
document.querySelectorAll('[data-board]').forEach((t) => (t.onclick = () => openLeaders(t.dataset.board)));
async function openLeaders(kind = boardKind) {
  boardKind = kind;
  document.querySelectorAll('[data-board]').forEach((t) => t.classList.toggle('on', t.dataset.board === kind));
  if (!$('#s-leaders').classList.contains('active')) show('leaders');
  $('#leadersSignin').classList.toggle('hidden', !!ACCT);
  $('#leaders').innerHTML = '';
  $('#leadersStatus').textContent = 'Loading…';
  try {
    const c = await getSB();
    const { data, error } = await c.from(kind === 'week' ? 'leaderboard_week' : 'leaderboard_all').select('*').order('points', { ascending: false }).limit(50);
    if (error) throw error;
    if (boardKind !== kind) return; // switched tabs meanwhile
    $('#leadersStatus').textContent = data.length ? '' : kind === 'week' ? 'No scores yet this week. Play a game signed in and grab #1 👑' : 'No scores yet. Be the first legend 👑';
    $('#leaders').innerHTML = data.map((r, i) => `<li class="${ACCT && r.id === ACCT.id ? 'me' : ''}" style="animation-delay:${Math.min(i, 12) * 0.04}s">
      <span class="pos">${i + 1}</span>${avatar({ photo: r.avatar_url, c: r.color, f: r.face, name: r.display_name }, 'sm')}
      <span class="who2"><b>${esc(r.display_name)}${ACCT && r.id === ACCT.id ? ' (you)' : ''}</b><small>${r.username ? '@' + esc(r.username) + ' · ' : ''}${r.wins} win${r.wins === 1 ? '' : 's'} · ${r.games} game${r.games === 1 ? '' : 's'}</small></span>
      <span class="pts">${r.points}</span></li>`).join('');
  } catch { $('#leadersStatus').textContent = "Couldn't load the leaderboard. Check your connection."; }
}

// ---- save the result when a game ends (once per game, signed-in players only)
async function recordResult() {
  const note = $('#savedNote');
  const me = S.net ? S.players.find((p) => p.id === ME.id) : S.players.find((p) => ACCT && p.uid === ACCT.id);
  const played = S.players.some((p) => p.passes > 0 || p.lives < S.lives);
  if (!played) return (note.textContent = '');
  if (!ACCT) return (note.textContent = '🏆 Sign in to save your scores and get on the leaderboard.');
  if (!me) return (note.textContent = '');
  if (S.recorded) return;
  S.recorded = true;
  const top = standings()[0];
  try {
    const c = await getSB();
    const { error } = await c.from('game_results').insert({
      user_id: ACCT.id, mode: S.net ? 'online' : 'local', pack: (S.pack || S.song?.title || null)?.slice(0, 60),
      points: Math.min(5000, me.points || 0), lines: Math.min(200, me.passes || 0), players: S.players.length,
      won: S.players.length > 1 && top === me,
    });
    if (error) throw error;
    note.textContent = `✓ Saved to your profile · +${me.points || 0} points on the leaderboard`;
  } catch { S.recorded = false; note.textContent = "Couldn't save this game's score."; }
}
initAuth();

// ---------- highlight reel ----------
let reelMod = null, reelOut = null;
const loadReel = async () => (reelMod ??= await import('./reel.js'));
async function offerReel() {
  const m = await loadReel().catch(() => null);
  const ok = !!(m && m.reelSupported() && S.clips?.some((c) => c.blob));
  $('#reelBtn').classList.toggle('hidden', !ok);
  $('#reelNote').classList.toggle('hidden', !ok);
}
$('#reelBtn').onclick = async () => {
  const m = await loadReel();
  const sheet = $('#reelSheet');
  sheet.classList.remove('hidden');
  $('#reelMaking').classList.remove('hidden'); $('#reelReady').classList.add('hidden');
  $('#reelBar').style.transform = 'scaleX(0)';
  try {
    reelOut = await m.makeReel(S.clips, { onProgress: (k) => { $('#reelBar').style.transform = `scaleX(${k})`; }, title: S.players.length > 1 ? 'GAME NIGHT HIGHLIGHTS' : 'MY HIGHLIGHTS' });
    const v = $('#reelVideo');
    if (v.src) URL.revokeObjectURL(v.src);
    v.src = URL.createObjectURL(reelOut.blob);
    $('#reelMaking').classList.add('hidden'); $('#reelReady').classList.remove('hidden');
    v.play().catch(() => {});
  } catch (e) {
    console.warn(e); sheet.classList.add('hidden'); toast("Couldn't make the reel on this phone. Try Chrome or Safari.");
  }
};
$('#reelShare').onclick = async () => {
  if (!reelOut) return;
  const file = new File([reelOut.blob], `pass-the-mic-highlights.${reelOut.ext}`, { type: reelOut.blob.type });
  try {
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: 'Pass The Mic', text: 'Game night on Pass The Mic 🎤😂 Think you can do better? pass-the-mic.vercel.app' });
  } catch (e) { if (e.name === 'AbortError') return; }
  downloadReel(file);
};
$('#reelSave').onclick = () => reelOut && downloadReel(new File([reelOut.blob], `pass-the-mic-highlights.${reelOut.ext}`, { type: reelOut.blob.type }));
function downloadReel(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast('Saved! Share it anywhere 🎬');
}
$('#reelClose').onclick = () => { $('#reelVideo').pause(); $('#reelSheet').classList.add('hidden'); };

// ---------- installable app (PWA) ----------
if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (!standalone) $('#installBtn').classList.remove('hidden'); });
$('#installBtn').onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice.catch(() => {});
  installEvt = null; $('#installBtn').classList.add('hidden');
};
addEventListener('appinstalled', () => { $('#installBtn').classList.add('hidden'); toast('Installed! Open Pass The Mic from your home screen 🎤'); });
// iPhone/iPad Safari has no install prompt: show the Share → Add to Home Screen tip instead
if (!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)) $('#iosTip').classList.remove('hidden');
