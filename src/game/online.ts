// Online multiplayer. The host's phone runs the game and broadcasts every decision. Each phone plays the music
// itself and cuts at the same lyric line; the singer's phone listens and streams their words to everyone else.
import { newCode, openRoom } from '@/lib/net';
import { S, ui, emit, type Member, type Player, type RawSong } from './store';
import { unlockAudio, sfx } from './audio';
import { dress, isMe, ME, passMark, store, toast, getSR } from './helpers';
import { startRec, stopRec } from './speech';
import {
  show, quitToHome, ensurePlayer, getPlayer as player, setSong, pickSection, songOver, sectionFrom, startListen, showReveal, showVerdict,
  applyResult, showEnd, resetScores, setTimer, kickWave, clearTurnTimers, COUNT_IN, singWindow,
} from './engine';
import { ACCT, myLook } from './accounts';

export const roomLink = (code: string) => `${location.origin}${location.pathname}?room=${code}`;

export function initOnline() {
  ui.myName = store.get('ptm-name') || '';
  const roomParam = new URLSearchParams(location.search).get('room');
  if (roomParam) { ui.joinCode = roomParam.toUpperCase().slice(0, 4); show('online'); ensurePlayer().catch(() => {}); }
}
export function openOnline() {
  unlockAudio();
  if (ACCT.v && !ui.myName) ui.myName = ACCT.v.profile.display_name.slice(0, 14);
  show('online'); ensurePlayer().catch(() => {});
}
const status = (t: string) => { ui.onlineStatus = t; emit(); };

function myName() {
  const n = ui.myName.trim();
  if (!n) { status('Type your name first 👆'); document.getElementById('myName')?.focus(); return null; }
  store.set('ptm-name', n);
  return n;
}
async function connect(code: string, host: boolean) {
  const me = { id: ME.id, name: S.myName };
  const room = await openRoom(code, me, { onMsg, onPresence });
  S.net = { ...room, code, me, host };
  return room;
}
export async function createRoom() {
  const name = myName(); if (!name) return;
  S.myName = name;
  status('Creating your room…');
  try {
    for (let tries = 0; tries < 4; tries++) {
      const code = newCode();
      const room = await connect(code, true);
      await room.track({ id: ME.id, name, host: true, ready: false, at: Date.now(), ...myLook() });
      await new Promise((r) => setTimeout(r, 1200)); // make sure nobody else already hosts this code
      if (!room.members().some((m) => m.host && m.id !== ME.id)) return enterLobby();
      room.leave(); S.net = null;
    }
    throw new Error('Could not create a room. Try again.');
  } catch (e) { status((e as Error).message); S.net = null; }
}
export async function joinRoom() {
  const name = myName(); if (!name) return;
  const code = ui.joinCode.trim().toUpperCase();
  if (code.length !== 4) return status('Room codes have 4 characters.');
  S.myName = name;
  status(`Joining ${code}…`);
  try {
    const room = await connect(code, false);
    // presence is only shared once you've announced yourself, so announce first, then look for the host
    await room.track({ id: ME.id, name, host: false, ready: false, at: Date.now(), ...myLook() });
    const t0 = Date.now();
    while (!room.members().some((m) => m.host) && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 200));
    if (!room.members().some((m) => m.host)) { room.leave(); S.net = null; return status(`No room called ${code}. Check the code with your friend.`); }
    enterLobby();
  } catch (err) { status((err as Error).message); S.net = null; }
}

function enterLobby() {
  ui.onlineStatus = '';
  ui.roomCode = S.net!.code;
  ui.readyOn = false; ui.lobbyPicking = false;
  S.started = false; S.players = []; S.mode = 'single'; S.song = null; S.songKey = null;
  history.replaceState(history.state, '', `?room=${S.net!.code}`);
  show('lobby');
  renderLobby(S.net!.members());
}
function renderLobby(members: Member[]) {
  if (!S.net) return;
  const host = members.find((m) => m.host);
  ui.lobbyMembers = members;
  const ready = members.filter((m) => m.ready).length;
  if (S.net.host) ui.lobbyStatus = members.length < 2 ? 'Share the code. Your friends join from their own phones.' : `${ready}/${members.length} ready`;
  else if (!S.started && !ui.lobbyPicking) ui.lobbyStatus = host ? `Waiting for ${host.name} to pick the music…` : '';
  emit();
}
export async function shareRoom() {
  const url = roomLink(S.net!.code), text = `Join my Pass The Mic room 🎤 Code: ${S.net!.code}`;
  try { if (navigator.share) return await navigator.share({ title: 'Pass The Mic', text, url }); } catch { return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Invite link copied. Paste it in your group chat'); } catch { toast(url); }
}
// one tap that unlocks sound (YouTube) and asks for the mic, so later turns can start by themselves
export function readyUp() {
  unlockAudio();
  S.lang = ui.lobbyLang;
  primePlayer();
  if (S.cloud) navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => toast('Allow microphone access so you can sing your turns.'));
  else if (getSR()) { startRec(null, () => {}); setTimeout(stopRec, 1500); }
  ui.readyOn = true; emit();
  S.net?.track({ ready: true });
}
function primePlayer() {
  const p = player();
  if (!p?.playVideo) return;
  try {
    p.mute();
    p.loadVideoById({ videoId: S.song?.ids?.[0] || '2cNFrajBk0k', startSeconds: 0 });
    setTimeout(() => { p.pauseVideo(); p.unMute(); }, 700);
  } catch {}
}
export function lobbyStart() {
  unlockAudio(); primePlayer();
  S.lang = ui.lobbyLang;
  S.net!.track({ ready: true });
  S.lives = +ui.lobbyLives;
  S.players = S.net!.members().map((m, i) => dress({ id: m.id, name: m.name, photo: m.photo, uid: m.uid, c: m.c, f: m.f, lives: 0, points: 0, passes: 0 } as Player, i));
  S.recorded = false; S.clips = [];
  resetScores();
  S.started = true; S.midGame = false;
  S.net!.send('picking');
  show('song');
}

export function leaveRoom() {
  if (!S.net) return;
  if (S.net.host) S.net.send('bye');
  clearTimeout(hostGoneT); clearTimeout(voteT); clearTimeout(watchdogT);
  S.net.leave();
  S.net = null; S.started = false; S.players = [];
  history.replaceState(history.state, '', location.pathname);
}

// ---- presence: who's here
let hostGoneT: ReturnType<typeof setTimeout> | undefined;
function onPresence(members: Member[]) {
  if (!S.net) return;
  if (ui.screen === 'lobby') renderLobby(members);
  if (S.net.host) return hostSyncPlayers(members);
  // guests: if the host disappears for a while, the room is over
  if (members.some((m) => m.host)) clearTimeout(hostGoneT);
  else { clearTimeout(hostGoneT); hostGoneT = setTimeout(() => { toast('The host left, so the room closed.'); quitToHome(); }, 8000); }
}
function hostSyncPlayers(members: Member[]) {
  if (!S.started) return;
  const here = new Set(members.map((m) => m.id));
  let changed = false, newcomer = false, singerLeft = false;
  for (const m of members) {
    const p = S.players.find((x) => x.id === m.id);
    if (!p) { S.players.push(dress({ id: m.id, name: m.name, photo: m.photo, uid: m.uid, c: m.c, f: m.f, lives: S.lives, points: 0, passes: 0 } as Player, S.players.length)); changed = newcomer = true; }
    else if (p.gone) { p.gone = false; changed = newcomer = true; } // came back (lives stay as they were)
  }
  for (const p of S.players) {
    if (here.has(p.id!) || p.gone) continue;
    p.gone = true; changed = true; // keeps their lives: a dropped connection shouldn't knock you out
    if (p === S.players[S.cur] && ['countin', 'listen', 'spectate', 'turn', 'scoring'].includes(S.phase)) singerLeft = true;
  }
  if (!changed) return;
  S.net!.send('players', { players: S.players });
  if (newcomer && S.song) sendSong();
  emit();
  if (singerLeft) hostJudge({ pct: 0, sims: [], heard: '', noMic: false });
  if (S.voting) maybeDecide();
}

// ---- messages
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = Record<string, any>;
function onMsg(m: Msg) {
  if (!S.net) return;
  const fromHost = !S.net.host;
  switch (m.t) {
    case 'picking': if (fromHost) guestPicking(); break;
    case 'lobby': if (fromHost) { S.started = false; ui.lobbyPicking = false; stopAll(); show('lobby'); renderLobby(S.net.members()); } break;
    case 'song': if (fromHost) handleSong(m); break;
    case 'round': if (fromHost) handleRound(m); break;
    case 'players': if (fromHost) { S.players = m.players; S.cur = S.players.findIndex((p) => p.id === S.curId); emit(); } break;
    case 'live': if (m.from !== ME.id) { S.live = m; if (S.phase === 'spectate') paintLive(m); } break;
    case 'result': if (S.net.host && m.from === S.players[S.cur]?.id) hostJudge(m as Judged); break;
    case 'verdict': if (fromHost) handleVerdict(m); break;
    case 'vote': if (S.net.host) hostVote(m.from, m.pass); break;
    case 'decided': if (fromHost) handleDecided(m); break;
    case 'end': if (fromHost) { S.players = m.players; showEnd(m.kicker); } break;
    case 'bye': if (fromHost) { toast('The host closed the room.'); quitToHome(); } break;
  }
}
function stopAll() {
  stopRec(); clearTurnTimers(); clearInterval(countInT); clearInterval(specT);
  player()?.pauseVideo?.();
  S.phase = 'idle';
}
function guestPicking() {
  stopAll();
  S.started = true;
  ui.lobbyPicking = true;
  ui.lobbyStatus = '🎵 The host is picking the music…';
  show('lobby');
  renderLobby(S.net!.members());
}

// ---- host: send song + start rounds
function sendSong() {
  S.net!.send('song', { key: S.songKey, song: S.song!.raw, mode: S.mode, pack: S.pack, players: S.players });
}
export function hostRound() {
  const key = `${S.song!.ids[0]}:${S.qi}:${S.mode}`;
  if (S.songKey !== key) { S.songKey = key; sendSong(); }
  const sec = pickSection(S.resumeAt);
  if (!sec) return songOver();
  const m = { cur: S.players[S.cur].id, round: S.round, resumeAt: S.resumeAt, i: sec.i, j: sec.j, players: S.players, fresh: S.songTurns === 0 };
  S.net!.send('round', m);
  handleRound(m);
}

// ---- everyone: load song, count in, listen
function handleSong(m: Msg) {
  if (S.songKey === m.key && S.song) return;
  stopAll();
  S.songKey = m.key; S.mode = m.mode; S.pack = m.pack; S.players = m.players;
  ui.hand = { ...ui.hand, lead: 'Get ready', name: 'NEXT SONG', av: null, song: 'Loading the next song…', hint: '', count: null, readyShow: false, skipShow: false };
  show('handoff');
  S.songLoading = setSong(m.song as RawSong).then(() => {
    if (S.phase !== 'idle' || ui.screen !== 'handoff') return;
    ui.hand = { ...ui.hand, song: `🎵 ${S.song!.title} · ${S.song!.artist}`, hint: "You'll jump in on the next turn." };
    emit();
  }).catch((e) => { console.warn(e); toast("Couldn't load this song."); });
}
let countInT: ReturnType<typeof setInterval> | undefined;
async function handleRound(m: Msg) {
  await S.songLoading;
  if (!S.song || !S.net) return;
  stopAll();
  S.players = m.players; S.curId = m.cur;
  S.cur = S.players.findIndex((p) => p.id === m.cur);
  S.round = m.round; S.resumeAt = m.resumeAt; S.live = null; S.judged = false;
  if (m.round === 1 && m.fresh) { S.recorded = false; S.clips = []; }
  S.section = sectionFrom(m.i, m.j);
  ui.words = []; ui.ok = []; ui.turn = { ...ui.turn, heard: '' };
  const me = isMe(S.cur), name = S.players[S.cur]?.name || '';
  ui.hand = {
    ...ui.hand, round: `Round ${S.round} · pass mark ${passMark()}%`,
    lead: me ? "You're up next" : 'Up next', name: me ? 'YOU' : name, av: S.players[S.cur],
    song: m.fresh ? `🎵 ${S.song.title} · ${S.song.artist}` : '',
    hint: me ? 'Listen closely. When the music stops, carry on singing.' : `Listen along. When the music stops, ${name} has to carry on.`,
    readyShow: false, skipShow: false,
  };
  let n = 3;
  ui.hand.count = `Starting in ${n}…`;
  show('handoff');
  S.phase = 'countin';
  clearInterval(countInT);
  countInT = setInterval(() => {
    if (S.phase !== 'countin') return clearInterval(countInT);
    if (--n > 0) { ui.hand = { ...ui.hand, count: `Starting in ${n}…` }; emit(); return; }
    clearInterval(countInT);
    startListen();
  }, 1000);
}

// ---- everyone else watches the singer
let specT: ReturnType<typeof setInterval> | undefined, watchdogT: ReturnType<typeof setTimeout> | undefined;
export function spectate() {
  S.phase = 'spectate';
  ui.go = { cls: 'go count', text: 'IS SINGING', key: ui.go.key + 1 }; emit();
  sfx.go();
  const sec = S.section!, dur = singWindow(sec) + COUNT_IN + 0.5, t0 = performance.now();
  clearInterval(specT);
  specT = setInterval(() => {
    const f = 1 - (performance.now() - t0) / 1000 / dur;
    setTimer(f);
    if (f <= 0) clearInterval(specT);
  }, 100);
  if (S.live) paintLive(S.live);
  if (S.net!.host) { // singer's phone went quiet? don't stall the game
    clearTimeout(watchdogT);
    watchdogT = setTimeout(() => { if (S.phase === 'spectate') hostJudge({ pct: 0, sims: [], heard: '', noMic: true }); }, (dur + 12) * 1000);
  }
}
function paintLive(m: { sims?: number[]; heard?: string }) {
  kickWave(0.7);
  ui.ok = ui.words.map((_, i) => (m.sims || [])[i] > 0);
  ui.turn = { ...ui.turn, heard: m.heard ? `👂 “${m.heard}”` : '' };
  emit();
}
let liveAt = 0, liveT: ReturnType<typeof setTimeout> | undefined;
export function sendLive(sims: number[], heard: string) {
  clearTimeout(liveT);
  const wait = 300 - (Date.now() - liveAt);
  const go = () => { liveAt = Date.now(); S.net?.send('live', { sims, heard }); };
  if (wait <= 0) go(); else liveT = setTimeout(go, wait);
}

// ---- host decides; everyone shows the reveal
interface Judged { pct: number; sims: number[]; heard: string; noMic: boolean }
export function hostJudge(res: Judged) {
  if (S.judged) return;
  S.judged = true;
  clearTimeout(watchdogT);
  const mark = passMark();
  const verdict = res.noMic ? 'vote' : res.pct >= mark ? 'pass' : res.pct < mark - 10 ? 'fail' : 'vote';
  S.lastPct = res.pct;
  if (verdict !== 'vote') applyResult(verdict === 'pass', res.pct);
  const m = { pct: res.pct, sims: res.sims, heard: res.heard, noMic: res.noMic, verdict, pass: verdict === 'pass', players: S.players };
  S.net!.send('verdict', m);
  handleVerdict(m);
  if (verdict === 'vote') openVoting();
}
function handleVerdict(m: Msg) {
  if (!S.section || !S.song) { S.players = m.players; return emit(); } // joined mid-turn: catch up next round
  clearInterval(specT); clearTurnTimers(); stopRec();
  S.players = m.players; S.cur = S.players.findIndex((p) => p.id === S.curId);
  S.result = { pct: m.pct, verdict: m.verdict };
  if (!ui.words.length) { ui.words = S.section.words; ui.ok = ui.words.map(() => false); }
  showReveal(m as Judged & { verdict: string }, () => {
    if (m.verdict !== 'vote') return showVerdict(m.pass);
    const meVoter = !isMe(S.cur) && S.players.some((p) => p.id === ME.id && !p.gone);
    ui.rev = { ...ui.rev, vote: meVoter };
    if (!meVoter) ui.rev = { ...ui.rev, verdict: { ...ui.rev.verdict, text: '🗳️ The room is voting…' } };
    emit();
  });
}
export function castVote(pass: boolean) {
  ui.rev = { ...ui.rev, vote: false, verdict: { cls: 'verdict vote', text: 'Vote sent ✓ waiting for the others…' } }; emit();
  if (S.net!.host) hostVote(ME.id, pass); else S.net!.send('vote', { pass });
}
let voteT: ReturnType<typeof setTimeout> | undefined;
function openVoting() {
  S.voting = true; S.votes = new Map();
  maybeDecide();
  clearTimeout(voteT);
  voteT = setTimeout(() => { if (S.voting) decide(); }, 15000);
}
const voters = () => S.players.filter((p) => !p.gone && p.id !== S.players[S.cur]?.id).map((p) => p.id!);
function hostVote(id: string, pass: boolean) { if (S.voting && voters().includes(id)) { S.votes.set(id, pass); maybeDecide(); } }
function maybeDecide() { if (S.voting && voters().every((id) => S.votes.has(id))) decide(); }
function decide() {
  S.voting = false; clearTimeout(voteT);
  const yes = [...S.votes.values()].filter(Boolean).length, no = S.votes.size - yes;
  const pass = yes >= no; // ties (and nobody voting) go to the singer
  applyResult(pass, S.lastPct);
  const m = { pass, players: S.players };
  S.net!.send('decided', m);
  handleDecided(m);
}
function handleDecided(m: Msg) {
  S.players = m.players; S.cur = S.players.findIndex((p) => p.id === S.curId);
  showVerdict(m.pass);
}
