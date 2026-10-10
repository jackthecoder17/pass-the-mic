import { tokenize, align } from './match.js';
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
const passMark = () => Math.min(75, 55 + (S.round - 1) * 5);
const alive = () => S.players.filter((p) => p.lives > 0);

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3500);
}

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 's-' + id));
  const inGame = ['handoff', 'listen', 'turn', 'reveal'].includes(id);
  $('#board').classList.toggle('hidden', !inGame);
  if (inGame) renderBoard();
  $('#ytwrap').classList.toggle('show', id === 'listen' || id === 'reveal');
  $('#syncPanel').classList.add('hidden');
  // keep one history entry above the app so the phone's back button opens our menu instead of leaving
  if (id !== 'home' && history.state?.ptm !== 'guard') history.pushState({ ptm: 'guard' }, '');
  scrollTo(0, 0);
}

function renderBoard() {
  $('#board').innerHTML =
    `<div class="board-top"><div class="songname">🎵 ${S.song ? esc(S.song.title) + ' · ' + esc(S.song.artist) : ''}</div>` +
    `<button class="menu-btn" type="button" data-menu aria-label="Pause menu">☰ Menu</button></div>` +
    `<div class="pl">${S.players.map((p, i) => `<span class="pc ${i === S.cur ? 'cur' : ''} ${p.lives <= 0 ? 'out' : ''}"><b>${esc(p.name)}</b><span class="hearts">${p.lives > 0 ? '❤️'.repeat(p.lives) : '💀'}</span></span>`).join('')}</div>`;
}

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
const sfx = {
  tick: () => beep(660, 0.1),
  go: () => beep(1320, 0.18),
  pass: () => { beep(660, 0.12, 'triangle', 0.2); beep(880, 0.12, 'triangle', 0.2, 0.1); beep(1320, 0.25, 'triangle', 0.2, 0.2); },
  fail: () => beep(220, 0.5, 'sawtooth', 0.12),
};

// ---------- players ----------
function renderPlayers() {
  $('#plist').innerHTML = S.players.map((p, i) => `<li>${esc(p.name)}<button type="button" data-rm="${i}" aria-label="Remove ${esc(p.name)}">✕</button></li>`).join('');
  $('#toSong').disabled = !S.players.length;
}
$('#startBtn').onclick = () => { unlockAudio(); show('players'); $('#nameIn').focus(); };
$('#addForm').onsubmit = (e) => {
  e.preventDefault();
  const name = $('#nameIn').value.trim();
  if (!name) return;
  if (S.players.length >= 12) return toast('Max 12 players');
  if (S.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast('Name already taken');
  S.players.push({ name });
  $('#nameIn').value = '';
  renderPlayers();
  $('#nameIn').focus();
};
$('#plist').onclick = (e) => {
  const i = e.target.dataset.rm;
  if (i != null) { S.players.splice(+i, 1); renderPlayers(); }
};
if (!SR) { $('#srWarn').classList.remove('hidden'); $('#micTest').classList.add('hidden'); }
$('#micTest').onclick = () => {
  S.lang = $('#langSel').value;
  $('#micOut').textContent = 'Listening… sing or say anything';
  let got = false;
  startRec(null, (t) => { got = !!t; $('#micOut').textContent = '✅ Heard: “' + t + '”'; });
  setTimeout(() => { stopRec(); if (!got) $('#micOut').textContent = S.micBlocked ? $('#toast').textContent : "Didn't hear anything. Speak up, or check the mic permission and try again."; }, 4500);
};
function resetScores() {
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
  if (picking) return;
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
async function nextPackSong() {
  S.songTurns = 0;
  showLoading();
  while (S.qi < S.queue.length) {
    const item = S.queue[S.qi++];
    try {
      const song = item.picked ? item.song : item.live ? await resolveLive(item) : await resolvePacked(item);
      if (song) {
        await setSong(song, !!item.picked);
        goHandoff();
        if (song.warn) toast(SYNC_WARN);
        return;
      }
    } catch (e) { console.warn('skipping', item.t, e); }
  }
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
      <button class="chip" type="button" data-play="${i}">▶ Play</button>
      <button class="chip add ${added ? 'on' : ''}" type="button" data-add="${i}" ${added ? 'disabled' : ''}>${added ? '✓ Added' : '+ Add'}</button>
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
  S.song = { title, artist, lines, ids, idx: 0 };
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
  for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (S.players[j].lives > 0) return j; }
  return -1;
}
function goHandoff() {
  $('#roundInfo').textContent = `Round ${S.round} · pass mark ${passMark()}%`;
  $('#handName').textContent = S.players[S.cur].name;
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
  else { S.song = null; show('song'); }
}
$('#skipSongBtn').onclick = skipSong;
$('#skipSongBtn2').onclick = () => { if (S.phase === 'listen') skipSong(); };

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
  $('#listenName').textContent = S.players[S.cur].name;
  lastKara = -2;
  show('listen');
  S.phase = 'listen';
  playFrom(S.resumeAt);
};
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
    if (t >= S.section.start - 0.12) { player.pauseVideo(); startTurn(); }
  } else if (t >= S.section.end + 0.3) {
    player.pauseVideo();
    S.phase = 'reveal';
  }
}
setInterval(loop, 40); // timer, not rAF: keeps working if the tab is backgrounded

// ---------- the turn ----------
let turnTimer, countT;
function startTurn() {
  S.phase = 'turn';
  const sec = S.section;
  $('#turnName').textContent = S.players[S.cur].name;
  const cueLine = S.song.lines.slice(0, sec.i).reverse().find((l) => l.words.length);
  $('#cue').textContent = cueLine ? `“…${cueLine.text}”` : '';
  const hint = S.round <= 2 ? 1 : 0; // early rounds: show the first word so you know where to come in
  $('#chips').innerHTML = sec.words.map((w, i) => `<span class="w${i < hint ? ' hint' : ''}" style="--len:${Math.max(2, w.d.length)}"><b>${esc(w.d)}</b></span>`).join('');
  $('#heard').textContent = '';
  $('#timerBar').style.transform = 'scaleX(1)';
  $('#doneBtn').disabled = true;
  show('turn');

  const go = $('#goTxt');
  const steps = ['3', '2', '1'];
  let n = 0;
  go.className = 'go'; go.textContent = 'CONTINUE!';
  sfx.tick();
  clearInterval(countT);
  countT = setInterval(() => {
    if (n < steps.length) { go.className = 'go count'; go.textContent = steps[n++]; sfx.tick(); return; }
    clearInterval(countT);
    go.className = 'go sing'; go.textContent = 'SING! 🎤'; sfx.go();
    beginListening();
  }, 520);
}

function beginListening() {
  const sec = S.section;
  const expected = sec.words.map((w) => w.n);
  const dur = Math.max(5, (sec.end - sec.start) * 1.35 + 2.5);
  S.heard = '';
  startRec(expected, (text) => {
    S.heard = text;
    paintChips('#chips', align(expected, tokenize(text).map((w) => w.n)).sims, false);
    $('#heard').textContent = text ? `👂 “${text}”` : '';
  });
  $('#doneBtn').disabled = false;
  const t0 = performance.now();
  clearInterval(turnTimer);
  turnTimer = setInterval(() => {
    const f = 1 - (performance.now() - t0) / 1000 / dur;
    $('#timerBar').style.transform = `scaleX(${Math.max(0, f)})`;
    if (f <= 0) finishTurn();
  }, 50);
}
$('#doneBtn').onclick = () => finishTurn();

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
  clearInterval(turnTimer); clearInterval(countT);
  $('#doneBtn').disabled = true;
  stopRec();
  setTimeout(scoreTurn, 800); // let the recognizer flush its final words
}

function scoreTurn() {
  if (S.phase !== 'scoring') return; // paused or quit meanwhile
  const sec = S.section;
  const r = align(sec.words.map((w) => w.n), tokenize(S.heard).map((w) => w.n));
  const pct = Math.round(r.score * 100);
  const mark = passMark();
  const verdict = !SR || S.micBlocked ? 'vote' : pct >= mark ? 'pass' : pct < mark - 15 ? 'fail' : 'vote';
  S.result = { pct, verdict };

  const noMic = !SR || S.micBlocked;
  $('#revChips').innerHTML = $('#chips').innerHTML;
  if (noMic) document.querySelectorAll('#revChips .w').forEach((el) => el.classList.add('show'));
  else paintChips('#revChips', r.sims, true);
  $('#revHeard').textContent = noMic ? 'Here are the real lyrics. Did they get it?' : S.heard ? `AI heard: “${S.heard}”` : 'AI heard: nothing 🤐';
  $('#voteBox').classList.add('hidden');
  $('#contBtn').classList.add('hidden');
  const v = $('#verdict');
  v.className = 'verdict'; v.textContent = '';
  show('reveal');
  if (noMic) $('#scoreNum').textContent = '🎤❓';
  (noMic ? (f) => f() : (f) => countUp($('#scoreNum'), pct, f))(() => {
    if (verdict === 'vote') {
      v.className = 'verdict vote'; v.textContent = noMic ? 'MIC IS OFF · ROOM DECIDES' : 'TOO CLOSE TO CALL 🤔';
      $('#voteBox').classList.remove('hidden');
    } else applyVerdict(verdict === 'pass');
  });
  // play the real line so the room hears what it should have been
  lastKara = -2;
  S.phase = 'reveal-play';
  playFrom(Math.max(0, sec.start - 0.4));
}

function countUp(el, to, done) {
  const t0 = performance.now(), d = 900;
  (function f(now) {
    const k = Math.min(1, (now - t0) / d);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + '%';
    if (k < 1) requestAnimationFrame(f); else done();
  })(t0);
}

function applyVerdict(pass) {
  const p = S.players[S.cur], v = $('#verdict');
  if (pass) {
    p.points += Math.max(S.result.pct, passMark()); p.passes++;
    v.className = 'verdict pass'; v.textContent = ['NAILED IT ✅', 'STAR! 🌟', 'CORRECT 🔥', 'ON KEY 🎤'][Math.floor(Math.random() * 4)];
    sfx.pass();
  } else {
    p.lives--;
    v.className = 'verdict fail';
    v.textContent = p.lives > 0 ? `LOST A LIFE 💔 ${p.lives} left` : `${p.name.toUpperCase()} IS OUT 💀`;
    sfx.fail();
  }
  $('#voteBox').classList.add('hidden');
  $('#contBtn').classList.remove('hidden');
  renderBoard();
}
$('#votePass').onclick = () => applyVerdict(true);
$('#voteFail').onclick = () => applyVerdict(false);

$('#contBtn').onclick = () => {
  player.pauseVideo();
  S.phase = 'idle';
  S.resumeAt = S.section.end;
  const solo = S.players.length === 1, left = alive().length;
  if ((solo && left === 0) || (!solo && left <= 1)) return endGame();
  const prev = S.cur;
  S.cur = nextAlive(S.cur);
  if (S.cur <= prev) S.round++;
  S.songTurns++;
  if (S.mode === 'pack' && S.songTurns >= left) return nextPackSong(); // everyone had a go: next song
  goHandoff();
};

// ---------- endings ----------
function standings() {
  return [...S.players].sort((a, b) => (b.lives > 0) - (a.lives > 0) || b.lives - a.lives || b.points - a.points);
}
function renderRank() {
  $('#rank').innerHTML = standings().map((p) => `<li><span class="nm">${esc(p.name)}</span><span class="st">${p.lives > 0 ? '❤️'.repeat(p.lives) : '💀'} · ${p.passes} lines · ${p.points} pts</span></li>`).join('');
}
function endButtons(isFinal) {
  $('#nextSong').classList.toggle('hidden', isFinal);
  $('#endGame').classList.toggle('hidden', isFinal);
  $('#again').classList.toggle('hidden', !isFinal);
  $('#newPlayers').classList.toggle('hidden', !isFinal);
}
function songOver() {
  S.phase = 'idle';
  player?.pauseVideo?.();
  if (S.mode === 'pack') return nextPackSong();
  $('#endKicker').textContent = 'Song over 🎵';
  $('#endTitle').textContent = alive().length ? 'Still standing' : 'Everyone is out';
  renderRank(); endButtons(false);
  show('end');
}
function endGame(kicker = 'Game over') {
  S.phase = 'idle';
  player?.pauseVideo?.();
  const top = standings()[0];
  $('#endKicker').textContent = typeof kicker === 'string' ? kicker : 'Game over';
  $('#endTitle').textContent = S.players.length === 1 ? `${top.points} points` : `👑 ${top.name} wins!`;
  renderRank(); endButtons(true);
  show('end');
  confetti();
}
$('#nextSong').onclick = () => { S.song = null; S.cur = nextAlive(S.cur); show('song'); };
$('#endGame').onclick = endGame;
$('#again').onclick = () => { resetScores(); S.midGame = false; show('song'); };
$('#endHome').onclick = () => quitToHome();

// ---------- navigation & pause menu ----------
$('#playersBack').onclick = () => show('home');
$('#songBack').onclick = () => (S.midGame && S.song ? goHandoff() : show('players'));
$('#board').onclick = (e) => { if (e.target.closest('[data-menu]')) openMenu(); };

let pausedPhase = null;
function openMenu() {
  if (!$('#menu').classList.contains('hidden')) return;
  pausedPhase = S.phase;
  player?.pauseVideo?.();
  if (S.phase === 'turn' || S.phase === 'scoring') { clearInterval(turnTimer); clearInterval(countT); stopRec(); }
  S.phase = 'paused';
  $('#mSkip').classList.toggle('hidden', !S.song);
  $('#menu').classList.remove('hidden');
}
function closeMenu() { $('#menu').classList.add('hidden'); }
$('#mResume').onclick = () => {
  closeMenu();
  const p = pausedPhase; pausedPhase = null;
  if (p === 'listen' || p === 'reveal-play') { S.phase = p; player.playVideo(); }
  else if (p === 'turn' || p === 'scoring') startTurn(); // a fresh attempt at the same lines
  else S.phase = p || 'idle';
};
$('#mSkip').onclick = () => { closeMenu(); pausedPhase = null; skipSong(); };
$('#mChange').onclick = () => { closeMenu(); pausedPhase = null; S.phase = 'idle'; S.midGame = true; show('song'); };
$('#mEnd').onclick = () => { closeMenu(); pausedPhase = null; endGame(); };
$('#mQuit').onclick = () => { closeMenu(); pausedPhase = null; quitToHome(); };
function quitToHome() {
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
  else if (cur !== 'home') show('home');
});
$('#newPlayers').onclick = () => { renderPlayers(); show('players'); };

// ---------- speech recognition ----------
let rec = null, recOn = false;
function startRec(expected, onText) {
  if (!SR) return;
  stopRec();
  recOn = true;
  S.micBlocked = false;
  let prior = '';
  const begin = () => {
    if (!recOn) return;
    let session = '';
    const r = new SR();
    rec = r;
    r.lang = S.lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 4;
    r.onresult = (e) => {
      const parts = [];
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        let best = res[0].transcript;
        if (expected && res.length > 1) { // pick whichever alternative best fits the lyric
          let bs = -1;
          for (let a = 0; a < res.length; a++) {
            const sc = align(expected, tokenize(`${prior} ${parts.join(' ')} ${res[a].transcript}`).map((w) => w.n)).score;
            if (sc > bs) { bs = sc; best = res[a].transcript; }
          }
        }
        parts.push(best);
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
      if (why) { recOn = false; S.micBlocked = true; toast(why); }
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
