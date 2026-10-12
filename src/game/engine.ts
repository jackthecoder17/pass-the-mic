// The game: players, music, the cut, turns, scoring, reveal, endings, pause menu and navigation.
// Ported from the original single-file app; every rule and timing is unchanged.
import { tokenize, score } from '@/lib/match';
import { resolveSong, type Video } from '@/lib/resolve';
import { S, ui, dom, emit, IN_GAME, HAND_DEFAULTS, type Screen, type Player, type Section, type RawSong, type QueueItem, type SearchResult, type Line } from './store';
import { sfx, buzz, unlockAudio } from './audio';
import { alive, dbg, dress, hintCount, isMe, nextAlive, passMark, toast, getSR, IS_IOS } from './helpers';
import { startRec, stopRec, stopLiveRec, startCloudRec, stopCloudRec, cloudRec, micLevel, checkCloud } from './speech';
import { ACCT, meAsPlayer, recordResult } from './accounts';
import { hostRound, sendLive, hostJudge, castVote, leaveRoom, spectate } from './online';

// ---------- screens ----------
export function show(id: Screen) {
  ui.screen = id;
  const inGame = IN_GAME.includes(id);
  if (S.net && id === 'song') ui.songBack = S.midGame && S.song ? '← Back to the game' : '← Lobby';
  else if (id === 'song') ui.songBack = S.midGame && S.song ? '← Back to the game' : '← Players';
  ui.syncPanel = null;
  if (id !== 'reveal') stopAutoNext();
  keepAwake(inGame || id === 'lobby');
  // keep one history entry above the app so the phone's back button opens our menu instead of leaving
  if (id !== 'home' && history.state?.ptm !== 'guard') history.pushState({ ptm: 'guard' }, '');
  scrollTo(0, 0);
  emit();
  requestAnimationFrame(() => requestAnimationFrame(placeTV));
}
const boardShown = () => IN_GAME.includes(ui.screen);

// keep the screen on during a game (phones lock while you're listening or passing the phone around)
let wakeLock: WakeLockSentinel | null = null, wantAwake = false;
async function keepAwake(on: boolean) {
  wantAwake = on;
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { const w = wakeLock; wakeLock = null; await w.release(); }
  } catch {}
}
function onVisibility() {
  if (document.visibilityState === 'visible') { if (wantAwake) keepAwake(true); return; }
  // one-phone game: switching apps pauses everything; Resume picks up where you left off
  if (!S.net && ['countin', 'listen', 'cut', 'turn', 'scoring', 'reveal-play', 'reveal'].includes(S.phase)) openMenu();
  else if (!S.net && ui.screen === 'reveal') openMenu();
}

// the YouTube iframe can't be moved in the DOM (it would reload), so it floats over the visible .tv-slot
export function placeTV() {
  const wrap = document.getElementById('ytwrap'), slot = document.querySelector<HTMLElement>('.screen.active .tv-slot');
  if (!wrap) return;
  if (!slot || !slot.offsetParent) { wrap.className = 'parked'; wrap.removeAttribute('style'); return; }
  const r = slot.getBoundingClientRect();
  wrap.className = '';
  Object.assign(wrap.style, { left: `${r.left + scrollX}px`, top: `${r.top + scrollY}px`, width: `${r.width}px`, height: `${r.height}px` });
}

// ---------- players ----------
export function startOnePhone() {
  unlockAudio();
  if (ACCT.v && !S.players.length) S.players.push(meAsPlayer()); // signed in: you're player one
  show('players');
  focusSoon('nameIn');
}
export const focusSoon = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 60);
export function addPlayer() {
  const name = ui.nameIn.trim();
  if (!name) return;
  if (S.players.length >= 12) return toast('Max 12 players');
  if (S.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast('Name already taken');
  const used = new Set(S.players.map((p) => p.c));
  const slot = [0, 1, 2, 3, 4, 5].find((k) => !used.has(k + 1)) ?? S.players.length;
  S.players.push(dress({ name, lives: 0, points: 0, passes: 0 } as Player, slot + (S.players.length >= 6 ? 6 : 0)));
  ui.nameIn = '';
  emit();
  focusSoon('nameIn');
}
export function removePlayer(i: number) { S.players.splice(i, 1); emit(); }
export function addMe() {
  if (!ACCT.v || S.players.some((p) => p.uid === ACCT.v!.id) || S.players.length >= 12) return;
  S.players.push(meAsPlayer()); emit();
}
export function micTest() {
  S.lang = ui.langSel;
  ui.micOut = 'Listening… sing or say anything'; emit();
  const say = (t: string) => { ui.micOut = t; emit(); };
  if (S.cloud) {
    startCloudRec('', (t) => { if (t) say('✅ Heard: “' + t + '”'); });
    setTimeout(() => stopCloudRec().then((t) => say(t ? '✅ Heard: “' + t + '”' : S.micBlocked ? 'Microphone blocked. Allow mic access for this site, then reload.' : "Didn't hear anything. Speak up and try again.")), 4500);
    return;
  }
  let got = false;
  startRec(null, (t) => { got = !!t; say('✅ Heard: “' + t + '”'); });
  setTimeout(() => { stopRec(); if (!got) say(S.micBlocked ? ui.toast.msg : "Didn't hear anything. Speak up, or check the mic permission and try again."); }, 4500);
}
export function resetScores() {
  S.recorded = false; S.clips = [];
  S.players.forEach((p) => { p.lives = S.lives; p.points = 0; p.passes = 0; });
  S.round = 1; S.cur = 0;
}
export function toSong() {
  unlockAudio();
  S.lives = +ui.livesSel; S.lang = ui.langSel;
  resetScores(); S.midGame = false;
  show('song');
}

// ---------- song packs ----------
const shuffle = <T,>(a: T[]) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export function loadPacks() {
  fetch('/packs.json').then((r) => r.json()).then((d) => { ui.packs = d; emit(); }).catch(() => toast("Couldn't load song packs. You can still search."));
}
let picking = false, loadingSong = false;
export async function startPack(key: string) {
  if (picking || loadingSong) return;
  picking = true; // live charts load over the network first; ignore extra taps meanwhile
  try { await loadPack(key); } finally { picking = false; }
}
async function loadPack(key: string) {
  const PACKS = ui.packs;
  const live = PACKS.live.find((p) => p.id === key);
  let name: string, songs: QueueItem[];
  ui.songStatus = 'Shuffling the pack…'; emit();
  if (key === 'mix') { name = 'Mix Everything'; songs = PACKS.packs.flatMap((p) => p.songs); }
  else if (live) {
    name = live.name;
    try {
      const r = await fetch(`/api/chart?country=${live.country}`);
      songs = (((await r.json()).songs || []) as { title: string; artist: string }[]).map((x) => ({ t: x.title, a: x.artist, live: true }));
    } catch { songs = []; }
    if (!songs.length) { ui.songStatus = "Couldn't load the live chart right now. Try another pack."; emit(); return; }
  } else { const p = PACKS.packs.find((x) => x.id === key)!; name = p.name; songs = p.songs; }
  // live charts: keep chart order loosely (hits first) but mix it up a bit
  S.queue = live ? shuffle(songs.slice(0, 20)).concat(shuffle(songs.slice(20))) : shuffle(songs);
  S.qi = 0; S.mode = 'pack'; S.pack = name;
  ui.songStatus = ''; emit();
  nextPackSong();
}

// load the next playable song from the queue (skipping any that fail) and hand over
export async function nextPackSong() {
  if (loadingSong) return; // double taps / overlapping triggers load one song, not two
  loadingSong = true;
  S.songTurns = 0;
  showLoading();
  try {
    while (S.qi < S.queue.length) {
      const item = S.queue[S.qi++];
      try {
        const song = item.picked ? item.song! : item.live ? await resolveLive(item) : await resolvePacked(item);
        if (song) {
          await setSong(song);
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
async function resolvePacked(item: QueueItem): Promise<RawSong | null> {
  const r = await fetch(`https://lrclib.net/api/get/${item.l}`);
  if (!r.ok) return null;
  const y = await r.json();
  return y.syncedLyrics ? { title: item.t, artist: item.a!, lyrics: y.syncedLyrics, ids: item.v! } : null;
}
const findVideos = (title: string, artist: string, dur: number): Promise<Video[]> =>
  fetch(`/api/yt?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&dur=${dur}`).then((r) => r.json()).then((j) => j.results || []);
async function resolveLive(item: QueueItem): Promise<RawSong | null> {
  const s = await resolveSong(item.t, item.a!, findVideos);
  if (!s || !s.official || s.delta > 2) return null; // charts: only songs we can keep in sync
  return { title: item.t, artist: item.a!, lyrics: s.lyrics, ids: s.v };
}
// a song someone searched for: play the exact track they picked, match lyrics to its length
async function resolvePicked(item: SearchResult): Promise<RawSong | null> {
  const find = async (title: string, artist: string, dur: number) => {
    const more = await findVideos(title, artist, dur).catch(() => [] as Video[]);
    return [{ id: item.vid, seconds: item.secs, official: true }, ...more.filter((v) => v.id !== item.vid)];
  };
  const s = await resolveSong(item.t, item.a, find);
  if (!s) return null;
  return { title: item.t, artist: item.a, lyrics: s.lyrics, ids: s.v, warn: s.delta > 2 };
}
function showLoading() {
  ui.hand = { ...ui.hand, round: S.pack || '', name: S.players[S.cur]?.name || '', av: S.players[S.cur] || null, song: 'Loading the next song…', readyDisabled: true, skipShow: false };
  show('handoff');
}
const SYNC_WARN = 'Heads up: the lyrics for this one may be slightly off. Use 🎯 Fix sync while it plays.';

// ---------- song search + your own playlist ----------
export async function search(q: string) {
  ui.searchStatus = 'Searching…'; S.results = []; ui.addState = {}; emit();
  try {
    const r = await fetch('/api/search?q=' + encodeURIComponent(q));
    const list = (((await r.json()).results || []) as { title: string; channel: string; album: string; id: string; seconds: number; art: string }[])
      .map((v) => ({ t: v.title, a: v.channel, album: v.album, vid: v.id, secs: v.seconds, art: v.art }));
    S.results = list;
    ui.searchStatus = list.length ? '' : 'No songs found. Try different words.';
  } catch {
    ui.searchStatus = "Couldn't search right now. Check your connection.";
  }
  emit();
}
export async function addToPlaylist(x: SearchResult) {
  if (S.mine.some((m) => m.vid === x.vid) || ui.addState[x.vid]) return;
  ui.addState = { ...ui.addState, [x.vid]: 'busy' }; emit();
  const clear = () => { const { [x.vid]: _, ...rest } = ui.addState; void _; ui.addState = rest; };
  try {
    const song = await resolvePicked(x);
    if (!song) { ui.addState = { ...ui.addState, [x.vid]: 'nolyrics' }; emit(); toast(`No synced lyrics exist for “${x.t}” yet. Try another song.`); return; }
    S.mine.push({ ...x, song });
    clear(); emit();
    if (song.warn) toast(`Added. ${SYNC_WARN}`);
  } catch {
    clear(); emit();
    toast('Something went wrong. Try again.');
  }
}
export function removeFromPlaylist(i: number) { S.mine.splice(i, 1); emit(); }
export function startPlaylist() {
  if (!S.mine.length) return;
  S.queue = S.mine.map((m) => ({ picked: true, song: m.song, t: m.t }));
  S.qi = 0; S.mode = 'pack'; S.pack = 'Your playlist';
  nextPackSong();
}
export async function playPicked(x: SearchResult) {
  if (picking) return;
  picking = true;
  ui.searchStatus = `Finding the lyrics for “${x.t}”…`; emit();
  try {
    const song = await resolvePicked(x);
    if (!song) throw new Error(`Sorry, no synced lyrics exist for “${x.t}” yet. Try another song.`);
    S.mode = 'single'; S.pack = null;
    await setSong(song);
    ui.searchStatus = ''; emit();
    goHandoff();
    if (song.warn) toast(SYNC_WARN);
  } catch (e) {
    ui.searchStatus = (e as Error).message || 'Something went wrong. Try another song.'; emit();
  } finally {
    picking = false;
  }
}

function parseLRC(lrc: string): Line[] {
  const lines: Line[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) lines.push({ t: +m[1] * 60 + +m[2], text, end: 0, words: [] });
  }
  lines.sort((a, b) => a.t - b.t);
  lines.forEach((l, i) => {
    l.end = Math.min(lines[i + 1]?.t ?? l.t + 5, l.t + 9);
    l.words = tokenize(l.text);
  });
  return lines;
}

export async function setSong({ title, artist, lyrics, ids }: RawSong) {
  const lines = parseLRC(lyrics);
  const sung = lines.filter((l) => l.words.length >= 3);
  if (sung.length < 4) throw new Error('Not enough lyrics in this one. Pick another.');
  S.song = { title, artist, lines, ids, idx: 0, raw: { title, artist, lyrics, ids } };
  S.offset = savedOffset(ids[0]); updateSyncLabel();
  await ensurePlayer();
  player!.cueVideoById(ids[0]);
  // every new song starts playing ~10s in, so the room hears it build up before the first cut
  S.resumeAt = Math.min(10, Math.max(0, sung[sung.length - 1].t - 40));
  S.songTurns = 0;
  if (S.players[S.cur]?.lives <= 0) S.cur = nextAlive(S.cur);
}

// per-video sync offset, remembered on this device
const offsetKey = (id: string) => 'ptm-offset:' + id;
function savedOffset(id: string) { try { return Number(localStorage.getItem(offsetKey(id))) || 0; } catch { return 0; } }
function saveOffset() { try { localStorage.setItem(offsetKey(S.song!.ids[S.song!.idx]), String(S.offset)); } catch {} }

// ---------- YouTube ----------
interface YTPlayer {
  cueVideoById(id: string): void; loadVideoById(o: { videoId: string; startSeconds: number }): void;
  seekTo(t: number, allow: boolean): void; playVideo(): void; pauseVideo(): void; getCurrentTime(): number; mute(): void; unMute(): void;
}
let player: YTPlayer | null = null;
export const getPlayer = () => player;
let playerReady: Promise<void> | null = null;
export function ensurePlayer() {
  if (playerReady) return playerReady;
  playerReady = new Promise<void>((resolve, reject) => {
    const w = window as unknown as { onYouTubeIframeAPIReady: () => void; YT: { Player: new (id: string, o: object) => YTPlayer } };
    w.onYouTubeIframeAPIReady = () => {
      player = new w.YT.Player('yt', {
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
      player!.loadVideoById({ videoId: song.ids[song.idx], startSeconds: Math.max(0, S.playFrom - S.offset) });
    } else player!.cueVideoById(song.ids[song.idx]);
  } else {
    if (S.net && !S.net.host) return toast("This song won't play on your phone. Follow along on screen.");
    toast("This song won't play here. Skipping it.");
    S.phase = 'idle';
    if (S.mode === 'pack') nextPackSong(); else show('song');
  }
}
function onYtState(e: { data: number }) {
  if (e.data === 0 && S.phase === 'listen') songOver(); // video ended before the next section
}
function playFrom(t: number) {
  S.playFrom = t;
  player!.seekTo(Math.max(0, t - S.offset), true);
  player!.playVideo();
}
const lyricTime = () => (player?.getCurrentTime?.() ?? 0) + S.offset;

// ---------- game flow ----------
export function goHandoff() {
  if (S.net) return hostRound();
  ui.hand = {
    ...ui.hand, lead: 'Pass the phone to', hint: HAND_DEFAULTS.hint, count: null, readyShow: true,
    round: `Round ${S.round} · pass mark ${passMark()}%`, name: S.players[S.cur].name, av: S.players[S.cur],
    song: S.songTurns === 0 ? `🎵 ${S.mode === 'pack' ? 'Next song' : 'Song'}: ${S.song!.title} · ${S.song!.artist}` : '',
    readyDisabled: false, skipShow: true,
  };
  show('handoff');
}

// nobody knows it? move on: no lives lost, same player keeps their turn
export function skipSong() {
  if (!S.song) return;
  player?.pauseVideo?.();
  S.phase = 'idle';
  toast(`Skipped “${S.song.title}”`);
  if (S.mode === 'pack') nextPackSong();
  else { S.song = null; if (S.net) S.net.send('picking'); show('song'); }
}
export const skipSong2 = () => { if (S.phase === 'listen') skipSong(); };

export function sectionFrom(i: number, j: number): Section {
  const L = S.song!.lines, lines = L.slice(i, j);
  return { i, j, start: L[i].t, end: lines[lines.length - 1].end, words: lines.flatMap((l) => l.words) };
}
// choose the next stretch of lyrics for the current player to sing
export function pickSection(from: number): Section | null {
  const L = S.song!.lines;
  const minWords = Math.min(14, 4 + (S.round - 1) * 2);
  // let people feel the song first: ~22-32s on a fresh song, ~14-22s after that
  const fresh = S.songTurns === 0;
  const lead = fresh ? 22 + Math.random() * 10 : 14 + Math.random() * 8;
  // near the end of a song there may not be room for the full wait: fall back to shorter ones
  for (const wait of [lead, lead * 0.6, 7]) {
    for (let i = 1; i < L.length; i++) {
      if (L[i].t < from + wait || L[i].words.length < 3) continue;
      let j = i;
      const words = [];
      while (j < L.length && j - i < 3 && words.length < minWords && L[j].words.length) { words.push(...L[j].words); j++; }
      if (words.length < 4) continue;
      const lines = L.slice(i, j);
      return { i, j, start: L[i].t, end: lines[lines.length - 1].end, words };
    }
  }
  return null;
}

export function ready() {
  unlockAudio();
  const sec = pickSection(S.resumeAt);
  if (!sec) return songOver();
  S.section = sec;
  startListen();
}
export function startListen() {
  const p = S.players[S.cur];
  ui.listen = {
    name: isMe(S.cur) ? 'YOU' : p.name, av: p, title: S.song!.title, artist: S.song!.artist + (S.pack ? ` · ${S.pack}` : ''),
    art: `https://i.ytimg.com/vi/${S.song!.ids[S.song!.idx]}/hqdefault.jpg`, skip2: !(!!S.net && !S.net.host), stopped: false,
  };
  lastKara = -2;
  show('listen');
  S.phase = 'listen';
  playFrom(S.resumeAt);
}
export const jumpToMyPart = () => { if (S.phase === 'listen') playFrom(Math.max(S.resumeAt, S.section!.start - 5)); };
export function nudgeSync(d: number) { S.offset += d; updateSyncLabel(); saveOffset(); lastKara = -2; }

// tap-to-sync: tap the line the moment the singer starts it
export function openSync() {
  const L = S.song!.lines, t = lyricTime();
  let i = L.findIndex((l) => l.t > t);
  if (i < 0) i = L.length;
  const pick: number[] = [];
  for (let k = Math.max(0, i - 3); k < L.length && pick.length < 6; k++) if (L[k].words.length && k < S.section!.i) pick.push(k);
  if (!pick.length) return toast('No lyrics to sync against right here. Try again in a moment.');
  ui.syncPanel = pick.map((k) => ({ k, text: L[k].text })); emit();
}
export function syncTo(k: number) {
  const video = player!.getCurrentTime();
  S.offset = S.song!.lines[k].t - (video - 0.2); // ~200ms reaction time
  updateSyncLabel(); saveOffset(); lastKara = -2;
  ui.syncPanel = null; emit();
  toast('Synced ✓ Saved for this song');
}
export const closeSync = () => { ui.syncPanel = null; emit(); };
function updateSyncLabel() { ui.syncVal = S.offset ? `${S.offset > 0 ? '+' : ''}${S.offset.toFixed(1)}s` : ''; emit(); }

// karaoke display + section trigger
let lastKara = -2;
function renderKaraoke(t: number) {
  const L = S.song!.lines;
  let i = -1;
  for (let k = 0; k < L.length; k++) { if (L[k].t <= t) i = k; else break; }
  if (i === lastKara) return;
  lastKara = i;
  const hide = S.phase === 'listen';
  const text = (k: number) => (k < 0 || k >= L.length ? '' : L[k].text || '♪');
  const spoiler = hide && i + 1 >= S.section!.i;
  ui.kara = { prev: text(i - 1), cur: text(i) || '♪', next: spoiler ? '🎤 · · ·' : text(i + 1), mystery: spoiler, pop: ui.kara.pop + 1 };
  emit();
}
function loop() {
  if (S.phase !== 'listen' && S.phase !== 'reveal-play') return;
  if (!player?.getCurrentTime) return;
  const t = lyricTime();
  if (S.phase === 'listen') {
    renderKaraoke(t);
    if (t >= S.section!.start - 0.12) { player.pauseVideo(); theCut(); }
  } else if (t >= S.section!.end + 0.3) {
    player.pauseVideo();
    S.phase = 'reveal';
  }
}

// the music stops: scratch, flash, shake, record grinds to a halt — then the spotlight
function theCut() {
  S.phase = 'cut';
  unlockAudio(); sfx.scratch(); buzz([60, 40, 120]);
  ui.listen = { ...ui.listen, stopped: true }; emit();
  document.body.classList.remove('cutting'); void document.body.offsetWidth; document.body.classList.add('cutting');
  setTimeout(() => { document.body.classList.remove('cutting'); if (S.phase === 'cut') startTurn(); }, 850);
}

// timing: a 5-second count-in, then 15 seconds to sing (only stretched if the section itself runs longer)
export const COUNT_IN = 5, SING_SECS = 15;
export const singWindow = (sec: Section) => Math.max(SING_SECS, (sec.end - sec.start) + 3);

// ring timer around the singer's avatar (f: 1 = full, 0 = empty)
export const setTimer = (f: number) => { if (dom.timerBar) dom.timerBar.style.strokeDashoffset = String(390 * (1 - Math.max(0, Math.min(1, f)))); };

// voice waveform: bars jump when new words come in (from your mic, or the singer's phone online)
export const WAVE_N = 26;
let waveE = 0, waveOn = false;
export const kickWave = (amt = 1) => { waveE = Math.min(1.4, waveE + amt); };
function waveLoop() {
  if (!waveOn) return;
  const bars = dom.wave?.children, t = performance.now() / 1000;
  waveE *= 0.93;
  const lvl = micLevel();
  if (lvl !== null) waveE = Math.max(waveE, Math.min(1.4, lvl * 7));
  if (bars) for (let i = 0; i < bars.length; i++) {
    const shape = Math.abs(Math.sin(i * 1.7 + t * 6)) * 0.7 + Math.abs(Math.sin(i * 0.6 - t * 9)) * 0.3;
    (bars[i] as HTMLElement).style.height = `${6 + (8 + 42 * shape) * Math.min(1, 0.12 + waveE)}px`;
  }
  setTimeout(waveLoop, 70);
}
function startWave() { waveE = 0.3; if (!waveOn) { waveOn = true; waveLoop(); } }
export function stopWave() { waveOn = false; }

// ---------- the turn ----------
export let turnTimer: ReturnType<typeof setInterval> | undefined, countT: ReturnType<typeof setInterval> | undefined;
export const clearTurnTimers = () => { clearInterval(turnTimer); clearInterval(countT); };
const setGo = (cls: string, text: string) => { ui.go = { cls, text, key: ui.go.key + 1 }; };
export function startTurn() {
  S.phase = 'turn';
  const sec = S.section!;
  const p = S.players[S.cur];
  const cueLine = S.song!.lines.slice(0, sec.i).reverse().find((l) => l.words.length);
  ui.turn = {
    name: isMe(S.cur) ? `${p.name} · that's you` : p.name, av: p, cue: cueLine ? `“…${cueLine.text}”` : '', heard: '',
    doneDisabled: true, doneHidden: !!S.net && !isMe(S.cur),
  };
  // early rounds: show the first word so you know where to come in
  ui.words = sec.words; ui.hint = hintCount(); ui.ok = sec.words.map(() => false);
  setTimer(1);
  startWave();
  show('turn');
  if (S.net && !isMe(S.cur)) return spectate();

  let n = COUNT_IN;
  ui.turn = { ...ui.turn, name: `${p.name} · your turn in` };
  setGo('go count', String(n)); emit();
  sfx.tick();
  clearInterval(countT);
  countT = setInterval(() => {
    if (--n > 0) { setGo('go count', String(n)); emit(); sfx.tick(); return; }
    clearInterval(countT);
    ui.turn = { ...ui.turn, name: `${p.name} · go!` };
    setGo('go sing', 'SING!'); emit(); sfx.go(); buzz(80);
    beginListening();
  }, 1000);
}

function beginListening() {
  const sec = S.section!;
  const expected = sec.words.map((w) => w.n);
  const dur = singWindow(sec);
  S.heard = ''; S.heardBy = {};
  let allIn = false;
  // two "ears" can report: the phone's own recognizer (instant) and Whisper (more accurate).
  // Each is graded on its own; the transcript shown is whichever matched more.
  const turnT0 = performance.now();
  const SR = getSR(), ios = IS_IOS();
  dbg('turn start', JSON.stringify({ lyric: sec.words.map((w) => w.d).join(' '), passMark: passMark(), hint: hintCount(), cloud: S.cloud, liveSR: !!SR && !ios }));
  const onText = (src: string) => (text: string) => {
    if (S.phase !== 'turn') return;
    if (S.heardBy[src] !== text) dbg(`+${((performance.now() - turnT0) / 1000).toFixed(1)}s ${src}:`, JSON.stringify(text));
    S.heardBy[src] = text;
    const { sims, text: best } = bestOf(expected);
    S.heard = best;
    ui.ok = sims.map((x) => x > 0);
    ui.turn = { ...ui.turn, heard: best ? `👂 “${best}”` : '' };
    emit();
    kickWave(0.7);
    if (S.net) sendLive(sims, best);
    // every word caught: wrap up on our own instead of waiting out the clock
    if (!allIn && sims.length && sims.every((x) => x > 0)) { allIn = true; setTimeout(finishTurn, 1400); }
  };
  S.turnCloud = S.cloud && !!window.MediaRecorder;
  if (S.turnCloud) {
    // instant words from the phone's recognizer where it can share the mic; Whisper live updates otherwise
    const live = !!SR && !ios;
    startCloudRec(cloudPrompt(), onText('cloud'), { partials: !live, lang: sectionLang(sec) });
    if (live) startRec(expected, onText('sr'), { quiet: true, onFail: () => { const c = cloudRec(); if (c) c.partials = true; } });
  } else startRec(expected, onText('sr'));
  ui.turn = { ...ui.turn, doneDisabled: false }; emit();
  const t0 = performance.now();
  clearInterval(turnTimer);
  turnTimer = setInterval(() => {
    const f = 1 - (performance.now() - t0) / 1000 / dur;
    setTimer(f);
    if (f <= 0) finishTurn();
  }, 50);
}
// each "ear" is graded on its own; the better one wins (words are never mixed between engines)
function bestOf(expected: string[]) {
  let best = { sims: expected.map(() => 0), text: '', score: -1 };
  for (const t of Object.values(S.heardBy || {})) {
    if (!t) continue;
    const r = score(expected, tokenize(t).map((w) => w.n), { hint: hintCount() });
    if (r.score > best.score) best = { sims: r.sims, text: t, score: r.score };
  }
  return best;
}

export function finishTurn() {
  if (S.phase !== 'turn') return;
  S.phase = 'scoring';
  stopWave();
  clearInterval(turnTimer); clearInterval(countT);
  ui.turn = { ...ui.turn, doneDisabled: true };
  setGo('go', 'SCORING…'); emit();
  if (S.turnCloud) {
    stopLiveRec(); // the live recognizer (if any)
    stopCloudRec().then((text) => {
      if (text) S.heardBy.cloud = text;
      S.heard = bestOf(S.section!.words.map((w) => w.n)).text || S.heard;
      scoreTurn();
    });
  } else {
    stopRec();
    setTimeout(scoreTurn, 800); // let the recognizer flush its final words
  }
}

function scoreTurn() {
  if (S.phase !== 'scoring') return; // paused or quit meanwhile
  const sec = S.section!;
  const r = score(sec.words.map((w) => w.n), tokenize(S.heard).map((w) => w.n), { hint: hintCount() });
  const pct = Math.round(r.score * 100);
  const exp = sec.words.map((w) => w.n);
  dbg('GRADE', JSON.stringify({
    lyric: sec.words.map((w) => w.d).join(' '),
    engines: Object.fromEntries(Object.entries(S.heardBy || {}).map(([k, t]) => [k, { heard: t, pct: Math.round(score(exp, tokenize(t).map((w) => w.n), { hint: hintCount() }).score * 100) }])),
    used: S.heard, pct, passMark: passMark(),
    words: sec.words.map((w, i) => `${w.d}${r.sims[i] ? '✓' : '✗'}`).join(' '),
  }));
  const noMic = S.turnCloud ? S.micBlocked || (S.cloudFailed && !S.heard) : !getSR() || S.micBlocked;
  if (S.net) {
    const res = { pct, sims: r.sims, heard: S.heard, noMic };
    S.phase = 'waiting';
    setGo('go', 'Scoring…'); emit();
    if (S.net.host) hostJudge(res); else S.net.send('result', res);
    return;
  }
  const mark = passMark();
  const verdict = noMic ? 'vote' : pct >= mark ? 'pass' : pct < mark - 10 ? 'fail' : 'vote';
  S.result = { pct, verdict };
  showReveal({ pct, sims: r.sims, heard: S.heard, noMic, verdict }, () => {
    if (verdict === 'vote') { ui.rev = { ...ui.rev, vote: true }; emit(); }
    else applyVerdict(verdict === 'pass');
  });
}

// reveal screen: score, green/red words, and the real line played back
export function showReveal({ pct, sims, heard, noMic, verdict }: { pct: number; sims: number[]; heard: string; noMic: boolean; verdict: string }, after: () => void) {
  const sec = S.section!;
  stopWave();
  const p = S.players[S.cur];
  ui.stamp = { cls: 'stamp hidden', text: '', key: ui.stamp.key + 1 };
  if (dom.dialFg) dom.dialFg.style.strokeDashoffset = '408.4';
  const words = ui.words.length ? ui.words : sec.words;
  const turnOk = ui.ok.length === words.length ? ui.ok : words.map(() => false);
  ui.rev = {
    ...ui.rev, who: `${p?.name || ''} · Round ${S.round}`, standings: null, words, key: ui.rev.key + 1,
    // no mic: show the real words (keeping any the live ears caught); otherwise green/red by the grade
    ok: noMic ? turnOk : words.map((_, i) => sims[i] > 0),
    miss: noMic ? words.map(() => false) : words.map((_, i) => !(sims[i] > 0)),
    show: noMic,
    heard: noMic ? 'Here are the real lyrics. Did they get it?' : heard ? `AI heard: “${heard}”` : 'AI heard: nothing 🤐',
    vote: false, wait: false, verdict: { cls: 'verdict', text: '' },
  };
  ui.cont = { ...ui.cont, hidden: true };
  show('reveal');
  if (noMic) { if (dom.scoreNum) dom.scoreNum.textContent = '🎤?'; }
  else sfx.drumroll(0.9);
  const fin = () => {
    if (verdict === 'vote') {
      ui.rev = { ...ui.rev, verdict: { cls: 'verdict vote', text: noMic ? 'MIC IS OFF · THE ROOM DECIDES' : 'TOO CLOSE TO CALL · THE ROOM DECIDES' } };
      emit();
    }
    after();
  };
  if (noMic) fin(); else countUp(pct, fin);
  // play the real line so the room hears what it should have been
  lastKara = -2;
  S.phase = 'reveal-play';
  playFrom(Math.max(0, sec.start - 0.4));
}

function countUp(to: number, done: () => void) {
  const t0 = performance.now(), d = 900;
  const f = (now: number) => {
    const k = Math.min(1, (now - t0) / d), v = to * (1 - Math.pow(1 - k, 3));
    if (dom.scoreNum) dom.scoreNum.textContent = Math.round(v) + '%';
    if (dom.dialFg) dom.dialFg.style.strokeDashoffset = String(408.4 * (1 - v / 100));
    if (k < 1) requestAnimationFrame(f); else done();
  };
  f(t0);
}

// the score change itself (local game, or the online host)
export function applyResult(pass: boolean, pct: number) {
  const p = S.players[S.cur];
  if (!p || p.gone) return;
  if (pass) { p.points += Math.max(pct, passMark()); p.passes++; }
  else p.lives = Math.max(0, p.lives - 1);
}
function stamp(text: string, kind: string) { ui.stamp = { cls: `stamp ${kind}`, text, key: ui.stamp.key + 1 }; }
export function showVerdict(pass: boolean) {
  const p = S.players[S.cur];
  keepClip(p, pass);
  if (pass) {
    stamp('PASS', 'pass');
    ui.rev = { ...ui.rev, verdict: { cls: 'verdict pass', text: ['NAILED IT 🔥', 'STAR BEHAVIOUR 🌟', 'CORRECT! 🎤', 'ON KEY ✨'][Math.floor(Math.random() * 4)] } };
    sfx.pass(); buzz(60);
  } else {
    const out = p.gone || p.lives <= 0;
    stamp(out ? 'OUT' : 'MISS', 'fail');
    ui.rev = { ...ui.rev, verdict: { cls: 'verdict fail', text: p.gone ? `${p.name.toUpperCase()} LEFT 👋` : p.lives > 0 ? `LOST A LIFE 💔 ${p.lives} LEFT` : `${p.name.toUpperCase()} IS OUT 💀` } };
    sfx.fail(); buzz([100, 60, 200]);
  }
  renderStandings(pass ? Math.max(S.result?.pct ?? S.lastPct ?? 0, passMark()) : null);
  const canContinue = !S.net || S.net.host;
  ui.rev = { ...ui.rev, vote: false, wait: !canContinue };
  ui.cont = { ...ui.cont, hidden: !canContinue };
  emit();
  if (canContinue) startAutoNext();
}

// remember this turn for the highlight reel (only turns sung on this phone have audio)
function keepClip(p: Player, pass: boolean) {
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

// what the Continue button leads to (mirrors the continue logic, without changing anything)
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
let autoT: ReturnType<typeof setInterval> | null = null, autoLeft = 0;
export function startAutoNext() {
  stopAutoNext();
  const label = upcoming().label;
  autoLeft = AUTO_SECS;
  ui.cont = { ...ui.cont, label: `${label}  ${autoLeft}`, counting: true, key: ui.cont.key + 1 };
  ui.hold = true; emit();
  autoT = setInterval(() => {
    if (ui.menu.open) return; // paused while the menu is open
    if (--autoLeft <= 0) { stopAutoNext(); continueGame(); return; }
    ui.cont = { ...ui.cont, label: `${label}  ${autoLeft}` }; emit();
  }, 1000);
}
function stopAutoNext() {
  if (autoT) clearInterval(autoT);
  autoT = null;
  ui.cont = { ...ui.cont, counting: false, label: S.players.length && S.section ? upcoming().label : ui.cont.label };
  ui.hold = false;
  emit();
}
export function holdOn() { stopAutoNext(); toast('Take your time. Tap the button when you\'re ready'); }
function applyVerdict(pass: boolean) {
  applyResult(pass, S.result!.pct);
  showVerdict(pass);
}
export const votePass = () => (S.net ? castVote(true) : applyVerdict(true));
export const voteFail = () => (S.net ? castVote(false) : applyVerdict(false));

export function continueGame() {
  if (ui.screen !== 'reveal') return;
  stopAutoNext();
  player!.pauseVideo();
  S.phase = 'idle';
  S.resumeAt = S.section!.end;
  const solo = S.players.length === 1, left = alive().length;
  const standing = S.players.filter((p) => p.lives > 0).length; // includes anyone briefly disconnected
  if ((solo && standing === 0) || (!solo && standing <= 1) || left === 0) return endGame();
  const prev = S.cur;
  S.cur = nextAlive(S.cur);
  if (S.cur <= prev) S.round++;
  S.songTurns++;
  if (S.mode === 'pack' && S.songTurns >= left) return nextPackSong(); // everyone had a go: next song
  goHandoff();
}

// mini leaderboard on the reveal screen
function renderStandings(gain: number | null) {
  const cur = S.players[S.cur];
  if (!cur) { ui.rev = { ...ui.rev, standings: null }; return; }
  const list = [...S.players].filter((p) => !p.gone || p === cur).sort((a, b) => b.points - a.points || b.lives - a.lives).slice(0, 4);
  if (!list.includes(cur)) list[list.length - 1] = cur;
  ui.rev = { ...ui.rev, standings: { list, cur, gain } };
}

// ---------- endings ----------
export function standings() {
  return [...S.players].sort((a, b) => Number(b.lives > 0) - Number(a.lives > 0) || b.lives - a.lives || b.points - a.points);
}
function endButtons(isFinal: boolean) {
  ui.end = { ...ui.end, nextSong: !isFinal, endGame: !isFinal, again: isFinal, newPlayers: isFinal };
}
export function songOver() {
  if (S.net && !S.net.host) return; // the host decides what plays next
  S.phase = 'idle';
  player?.pauseVideo?.();
  if (S.mode === 'pack') return nextPackSong();
  if (S.net) { S.song = null; S.net.send('picking'); toast('Song over! Pick the next one 🎵'); return show('song'); }
  ui.end = { ...ui.end, kicker: 'Song over 🎵', title: alive().length ? 'Still standing' : 'Everyone is out', top: null };
  endButtons(false);
  show('end');
}
export function endGame(kicker: unknown = 'Game over') {
  const k = typeof kicker === 'string' ? kicker : 'Game over';
  if (S.net?.host) S.net.send('end', { players: S.players, kicker: k });
  showEnd(k);
}
export function showEnd(kicker: string) {
  S.phase = 'idle';
  stopRec(); clearInterval(turnTimer); clearInterval(countT);
  player?.pauseVideo?.();
  const top = standings()[0];
  ui.end = { ...ui.end, kicker, title: S.players.length === 1 ? `${top.points} points` : `${top.name} wins!`, top };
  sfx.pass();
  endButtons(true);
  recordResult();
  offerReel();
  if (S.net) ui.end = { ...ui.end, again: S.net.host, newPlayers: false, home: S.net.host ? '🚪 Close room' : '🚪 Leave room' };
  else ui.end = { ...ui.end, home: '🏠 Home' };
  show('end');
  confetti();
}
export function nextSongFromEnd() { S.song = null; S.cur = nextAlive(S.cur); show('song'); }
export function playAgain() {
  resetScores(); S.midGame = false;
  if (S.net) { S.players = S.players.filter((p) => !p.gone); S.net.send('picking'); }
  show('song');
}

// ---------- navigation & pause menu ----------
export function songBack() {
  if (S.midGame && S.song) return goHandoff();
  if (S.net) { S.started = false; S.net.send('lobby'); return show('lobby'); }
  show('players');
}

let pausedPhase: string | null = null;
export function openMenu() {
  if (ui.menu.open) return;
  if (autoT) stopAutoNext(); // a pause shouldn't skip the next singer behind your back
  if (S.net) { // online: the game keeps going for everyone; host gets controls, guests can leave
    const host = S.net.host;
    ui.menu = { open: true, title: `Room ${S.net.code}`, resume: false, skip: host && !!S.song, change: host, end: host, close: true, quit: host ? '🚪 Close the room' : '🚪 Leave room' };
    return emit();
  }
  pausedPhase = S.phase;
  player?.pauseVideo?.();
  if (S.phase === 'turn' || S.phase === 'scoring') { clearInterval(turnTimer); clearInterval(countT); stopRec(); }
  S.phase = 'paused';
  ui.menu = { open: true, title: 'Game paused', resume: true, skip: !!S.song, change: true, end: true, close: false, quit: '🚪 Quit to home' };
  emit();
}
function closeMenu() {
  ui.menu = { ...ui.menu, open: false }; emit();
  // back on the reveal with the verdict in: restart the countdown
  setTimeout(() => { if (ui.screen === 'reveal' && !ui.cont.hidden && !autoT) startAutoNext(); }, 0);
}
export function menuResume() {
  closeMenu();
  const p = pausedPhase; pausedPhase = null;
  if (p === 'listen' || p === 'reveal-play') { S.phase = p; player!.playVideo(); }
  else if (p === 'turn' || p === 'scoring' || p === 'cut') startTurn(); // a fresh attempt at the same lines
  else S.phase = p || 'idle';
}
export function menuSkip() { closeMenu(); pausedPhase = null; skipSong(); }
export function menuChange() {
  closeMenu(); pausedPhase = null; S.phase = 'idle'; S.midGame = true;
  if (S.net) { player?.pauseVideo?.(); S.net.send('picking'); }
  show('song');
}
export const menuClose = () => closeMenu();
export function menuEnd() { closeMenu(); pausedPhase = null; endGame(); }
export function menuQuit() { closeMenu(); pausedPhase = null; quitToHome(); }
export function quitToHome() {
  stopWave();
  if (S.net) leaveRoom();
  stopRec(); clearInterval(turnTimer); clearInterval(countT);
  player?.pauseVideo?.();
  S.phase = 'idle'; S.song = null; S.midGame = false;
  show('home');
}
export function newPlayers() { show('players'); }

function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && boardShown()) openMenu(); }
// phone / browser back button
function onPop() {
  const cur = ui.screen;
  if (IN_GAME.includes(cur)) {
    if (!ui.menu.open) openMenu(); else menuResume();
    history.pushState({ ptm: 'guard' }, '');
  } else if (cur === 'song') songBack();
  else if (cur === 'lobby' || (S.net && cur === 'end')) { quitToHome(); }
  else if (cur !== 'home') show('home');
}

// ---------- confetti ----------
function confetti() {
  const c = dom.confetti, g = c?.getContext('2d');
  if (!c || !g) return;
  const dpr = Math.min(devicePixelRatio, 2);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  g.scale(dpr, dpr);
  const colors = ['#ff3d8b', '#ffd23f', '#8f5bff', '#2fe39a', '#ffffff'];
  const bits = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  const f = (now: number) => {
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
    }
    if (now - t0 < 4500) requestAnimationFrame(f); else g.clearRect(0, 0, innerWidth, innerHeight);
  };
  f(t0);
}

// ---------- Whisper hints ----------
const YO_MARKS = /[ẹọṣẸỌṢ]|[aeiou][̀́]/i;
const YO_WORDS = new Set(['mo', 'mi', 'ni', 'ti', 'si', 'ko', 'ba', 'fun', 'wa', 're', 'won', 'ati', 'oluwa', 'olorun', 'emi', 'iwo', 'omo', 'owo', 'ife', 'gbogbo', 'sha', 'lo', 'se', 'temi', 'tiwa', 'jare', 'nkan', 'dada', 'soro', 'wo', 'fe', 'gba', 'yen', 'yi', 'eyin', 'awa', 'eleyi', 'ojo', 'ile', 'aye', 'orun', 'ori', 'oju', 'wahala', 'kilode', 'bawo', 'omoge', 'shey', 'sebi', 'abeg', 'jowo', 'ehn', 'ehen']);
const PIDGIN = /\b(dey|una|wetin|abeg|sabi|wahala|oya|wey|sey|comot|chop|shayo|gbese|ehn|na wa|o!|pikin|kpanla|gbedu)\b/i;
function sectionLang(sec: Section) {
  const raw = S.song!.lines.slice(sec.i, sec.j).map((l) => l.text).join(' ');
  const words = sec.words.map((w) => w.n);
  const yo = YO_MARKS.test(raw.normalize('NFD')) || words.filter((w) => YO_WORDS.has(w)).length / Math.max(1, words.length) >= 0.35;
  return yo ? '' : 'en'; // '' lets Whisper detect Yoruba itself instead of forcing English spellings
}
// Whisper gets a style hint only, never the song's lyrics or title: it knows famous songs and would
// "complete" a mumbled line with the real words, handing out points nobody sang.
function cloudPrompt() {
  const all = S.song!.lines.map((l) => l.text).join(' ');
  const naija = PIDGIN.test(all) || YO_MARKS.test(all.normalize('NFD')) || /naija|afro|amapiano|throwback/i.test(S.pack || '');
  return naija ? 'Someone singing in Nigerian Pidgin, Yoruba and English, e.g. wetin, dey, abeg, sabi, wahala, oya, omo, gbogbo.' : 'Someone singing song lyrics.';
}

// ---------- highlight reel ----------
let reelMod: typeof import('./reel') | null = null;
let reelOut: { blob: Blob; ext: string } | null = null;
const loadReel = async () => (reelMod ??= await import('./reel'));
async function offerReel() {
  const m = await loadReel().catch(() => null);
  ui.end = { ...ui.end, reel: !!(m && m.reelSupported() && S.clips?.some((c) => c.blob)) };
  emit();
}
export async function makeReel() {
  const m = await loadReel();
  ui.reel = { open: true, making: true, progress: 0, url: ui.reel.url }; emit();
  try {
    reelOut = await m.makeReel(S.clips, { onProgress: (k) => { ui.reel = { ...ui.reel, progress: k }; emit(); }, title: S.players.length > 1 ? 'GAME NIGHT HIGHLIGHTS' : 'MY HIGHLIGHTS' });
    if (ui.reel.url) URL.revokeObjectURL(ui.reel.url);
    ui.reel = { ...ui.reel, making: false, url: URL.createObjectURL(reelOut.blob) }; emit();
  } catch (e) {
    console.warn(e); ui.reel = { ...ui.reel, open: false }; emit(); toast("Couldn't make the reel on this phone. Try Chrome or Safari.");
  }
}
const reelFile = () => new File([reelOut!.blob], `pass-the-mic-highlights.${reelOut!.ext}`, { type: reelOut!.blob.type });
export async function shareReel() {
  if (!reelOut) return;
  const file = reelFile();
  try {
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: 'Pass The Mic', text: 'Game night on Pass The Mic 🎤😂 Think you can do better? pass-the-mic.vercel.app' });
  } catch (e) { if ((e as Error).name === 'AbortError') return; }
  downloadReel(file);
}
export const saveReel = () => { if (reelOut) downloadReel(reelFile()); };
function downloadReel(file: File) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast('Saved! Share it anywhere 🎬');
}
export function closeReel() { dom.reelVideo?.pause(); ui.reel = { ...ui.reel, open: false }; emit(); }

// ---------- installable app (PWA) ----------
let installEvt: (Event & { prompt: () => void; userChoice: Promise<unknown> }) | null = null;
export async function install() {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice.catch(() => {});
  installEvt = null; ui.install = false; emit();
}

// ---------- start-up (once, in the browser) ----------
let booted = false;
export function boot() {
  if (booted) return;
  booted = true;
  const SR = getSR();
  if (!SR) { ui.srWarn = true; ui.micTest = false; }
  // Whisper available? Then every browser can listen, even without its own recognizer
  checkCloud(() => { ui.srWarn = false; ui.micTest = true; emit(); });
  loadPacks();
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('resize', placeTV);
  setInterval(placeTV, 400);
  setInterval(loop, 40); // timer, not rAF: keeps working if the tab is backgrounded
  addEventListener('keydown', onKey);
  addEventListener('popstate', onPop);
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e as typeof installEvt; if (!standalone) { ui.install = true; emit(); } });
  addEventListener('appinstalled', () => { ui.install = false; emit(); toast('Installed! Open Pass The Mic from your home screen 🎤'); });
  // iPhone/iPad Safari has no install prompt: show the Share → Add to Home Screen tip instead
  if (!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)) ui.iosTip = true;
  emit();
}
