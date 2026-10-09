import { tokenize, align } from './match.js';

const $ = (s) => document.querySelector(s);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const QUICK = [
  ['Last Last', 'Burna Boy'], ['Calm Down', 'Rema'], ['Essence', 'Wizkid'], ['Love Nwantiti', 'CKay'],
  ['Shape of You', 'Ed Sheeran'], ['Someone Like You', 'Adele'], ['Blinding Lights', 'The Weeknd'], ['Fall', 'Davido'],
];

const S = {
  players: [], lives: 3, lang: 'en-US',
  song: null, offset: 0,
  cur: 0, round: 1, resumeAt: 0, section: null,
  phase: 'idle', heard: '', result: null, results: [],
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
  scrollTo(0, 0);
}

function renderBoard() {
  $('#board').innerHTML =
    `<div class="songname">🎵 ${S.song ? esc(S.song.title) + ' · ' + esc(S.song.artist) : ''}</div>` +
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
  setTimeout(() => { stopRec(); if (!got) $('#micOut').textContent = "Didn't hear anything. Check the mic permission and try again."; }, 4500);
};
function resetScores() {
  S.players.forEach((p) => { p.lives = S.lives; p.points = 0; p.passes = 0; });
  S.round = 1; S.cur = 0;
}
$('#toSong').onclick = () => {
  unlockAudio();
  S.lives = +$('#livesSel').value; S.lang = $('#langSel').value;
  resetScores();
  show('song');
};

// ---------- song search ----------
$('#quick').innerHTML = QUICK.map(([t, a], i) => `<button class="chip" type="button" data-q="${i}">${esc(t)} · ${esc(a)}</button>`).join('');
$('#quick').onclick = async (e) => {
  const i = e.target.closest('[data-q]')?.dataset.q;
  if (i == null) return;
  const [t, a] = QUICK[i];
  $('#q').value = `${t} ${a}`;
  const list = await search(`${t} ${a}`);
  const hit = list.find((x) => x.artistName.toLowerCase().includes(a.toLowerCase()) && x.trackName.toLowerCase().includes(t.toLowerCase()));
  if (hit) selectSong(hit);
};
$('#searchForm').onsubmit = (e) => { e.preventDefault(); const q = $('#q').value.trim(); if (q) search(q); };
$('#results').onclick = (e) => {
  const i = e.target.closest('[data-i]')?.dataset.i;
  if (i != null) selectSong(S.results[+i]);
};

async function search(q) {
  $('#songStatus').textContent = 'Searching…';
  $('#results').innerHTML = '';
  try {
    const r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(q));
    const data = await r.json();
    const seen = new Set();
    const list = data
      .filter((x) => x.syncedLyrics && !x.instrumental && !/sped up|slowed|nightcore|8d audio/i.test(x.trackName))
      .filter((x) => { const k = (cleanTitle(x.trackName, x.artistName) + '|' + x.artistName).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 12);
    S.results = list;
    $('#songStatus').textContent = list.length ? '' : 'No synced lyrics found for that. Try another song.';
    $('#results').innerHTML = list.map((x, i) => `<li><button type="button" data-i="${i}"><b>${esc(cleanTitle(x.trackName, x.artistName))}</b><span>${esc(x.artistName)} · ${fmt(x.duration)}</span></button></li>`).join('');
    return list;
  } catch {
    $('#songStatus').textContent = "Couldn't reach the lyrics service. Check your connection.";
    return [];
  }
}
const cleanTitle = (t, artist = '') => {
  let s = t.replace(/\s*[\[(](official|lyric|audio|video|visuali|music)[^\])]*[\])]/gi, '').trim();
  const dash = s.match(/^(.+?)\s+[-–]\s+(.+)$/); // "Rema - Calm Down" -> "Calm Down"
  if (dash && artist && artist.toLowerCase().includes(dash[1].toLowerCase())) s = dash[2];
  return s;
};

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

let picking = false;
async function selectSong(x) {
  if (picking) return;
  picking = true;
  $('#songStatus').textContent = `Loading “${cleanTitle(x.trackName)}”…`;
  try {
    const title = cleanTitle(x.trackName, x.artistName);
    const r = await fetch(`/api/yt?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(x.artistName)}&dur=${Math.round(x.duration)}`);
    const vids = (await r.json()).results || [];
    if (!vids.length) throw new Error("Couldn't find that track to play. Pick another.");
    // the official track is the master the lyrics were timed to; use the lyric version cut to its exact length
    const top = vids[0];
    const lrc = top.official && Math.abs(top.seconds - x.duration) > 1.5 ? (await lyricsFor(x, title, top.seconds)) || x : x;
    const lines = parseLRC(lrc.syncedLyrics);
    if (lines.filter((l) => l.words.length >= 3).length < 4) throw new Error('Not enough lyrics in this one. Pick another.');
    const ids = vids.map((v) => v.id);
    S.song = { title, artist: x.artistName, duration: lrc.duration, lines, ids, idx: 0 };
    S.offset = savedOffset(ids[0]); updateSyncLabel();
    await ensurePlayer();
    player.cueVideoById(ids[0]);
    const first = lines.find((l) => l.words.length);
    S.resumeAt = Math.max(0, (first?.t ?? 0) - 4);
    if (S.players[S.cur]?.lives <= 0) S.cur = nextAlive(S.cur);
    $('#songStatus').textContent = '';
    goHandoff();
  } catch (e) {
    $('#songStatus').textContent = e.message || 'Something went wrong. Try another song.';
  } finally {
    picking = false;
  }
}

async function lyricsFor(x, title, secs) {
  const same = S.results.find((y) => y !== x && y.syncedLyrics && y.artistName === x.artistName &&
    cleanTitle(y.trackName, y.artistName).toLowerCase() === title.toLowerCase() && Math.abs(y.duration - secs) <= 2);
  if (same) return same;
  try {
    const r = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(x.artistName)}&track_name=${encodeURIComponent(title)}&duration=${secs}`);
    if (!r.ok) return null;
    const y = await r.json();
    return y.syncedLyrics ? y : null;
  } catch { return null; }
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
    toast("This song won't play here. Pick another one.");
    S.phase = 'idle';
    show('song');
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
  show('handoff');
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
  $('#endKicker').textContent = 'Song over 🎵';
  $('#endTitle').textContent = alive().length ? 'Still standing' : 'Everyone is out';
  renderRank(); endButtons(false);
  show('end');
}
function endGame() {
  S.phase = 'idle';
  player?.pauseVideo?.();
  const top = standings()[0];
  $('#endKicker').textContent = 'Game over';
  $('#endTitle').textContent = S.players.length === 1 ? `${top.points} points` : `👑 ${top.name} wins!`;
  renderRank(); endButtons(true);
  show('end');
  confetti();
}
$('#nextSong').onclick = () => { S.song = null; S.cur = nextAlive(S.cur); show('song'); };
$('#endGame').onclick = endGame;
$('#again').onclick = () => { resetScores(); show('song'); };
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
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { recOn = false; S.micBlocked = true; toast('Microphone blocked. Allow mic access in your browser settings.'); }
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
