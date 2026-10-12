// Game state. The engine (src/game/*.ts) mutates `S` (the game) and `ui` (what's on screen) and calls
// emit(); React components re-render from them via useGame(). A few fast-moving widgets (timer ring,
// waveform, score dial, confetti) are drawn straight onto their elements through `dom`, so a 60fps
// animation never re-renders the whole tree.
import { useSyncExternalStore } from 'react';
import type { Token } from '@/lib/match';

export type Screen = 'home' | 'online' | 'lobby' | 'players' | 'song' | 'handoff' | 'listen' | 'turn' | 'reveal' | 'end' | 'signin' | 'profile' | 'leaders';
export const IN_GAME: Screen[] = ['handoff', 'listen', 'turn', 'reveal'];

export interface Player {
  name: string; id?: string; uid?: string; photo?: string | null; c?: number; f?: string;
  lives: number; points: number; passes: number; gone?: boolean;
}
export interface Line { t: number; text: string; end: number; words: Token[] }
export interface Section { i: number; j: number; start: number; end: number; words: Token[] }
export interface RawSong { title: string; artist: string; lyrics: string; ids: string[]; warn?: boolean }
export interface Song { title: string; artist: string; lines: Line[]; ids: string[]; idx: number; raw: RawSong }
export interface QueueItem { t: string; a?: string; l?: number; v?: string[]; live?: boolean; picked?: boolean; song?: RawSong }
export interface SearchResult { t: string; a: string; album: string; vid: string; secs: number; art: string }
export interface Mine extends SearchResult { song: RawSong }
export interface Clip {
  name: string; c?: number; f?: string; photo?: string | null; pass: boolean; round: number; at: number;
  lyric: string; heard: string; pct: number; song: string; blob: Blob;
}
export interface Member { id: string; name: string; host: boolean; ready: boolean; at: number; uid?: string; photo?: string | null; c?: number; f?: string }
export interface Room {
  code: string; members: () => Member[];
  send: (t: string, data?: object) => unknown; track: (patch: object) => unknown; leave: () => void;
}
export interface Net extends Room { me: { id: string; name: string }; host: boolean }
export interface Pack { id: string; name: string; emoji: string; blurb: string; songs: QueueItem[] }
export interface LivePack { id: string; name: string; emoji: string; blurb: string; country: string }
export interface Profile { display_name: string; username?: string | null; avatar_url?: string | null; face?: string; color?: number }
export interface Account { id: string; profile: Profile; cached?: boolean }
export interface LeaderRow { id: string; display_name: string; username?: string | null; avatar_url?: string | null; color?: number; face?: string; wins: number; games: number; points: number }

export const S = {
  players: [] as Player[], lives: 3, lang: 'en-US',
  song: null as Song | null, offset: 0,
  cur: 0, round: 1, resumeAt: 0, section: null as Section | null,
  phase: 'idle', heard: '', result: null as { pct: number; verdict: string } | null, results: [] as SearchResult[],
  mode: 'single', pack: null as string | null, queue: [] as QueueItem[], qi: 0, songTurns: 0, // pack mode: one round per song, then the next song
  mine: [] as Mine[], // songs the room added
  midGame: false, recorded: false, clips: [] as Clip[],
  playFrom: 0, heardBy: {} as Record<string, string>, turnCloud: false,
  micBlocked: false, cloudFailed: false, cloud: false, lastAudio: null as Blob | null, lastPct: 0,
  // online
  net: null as Net | null, myName: '', started: false, songKey: null as string | null, curId: null as string | null,
  live: null as { sims?: number[]; heard?: string } | null, judged: false, voting: false, votes: new Map<string, boolean>(),
  songLoading: null as Promise<void> | null,
};

const hand = { round: '', song: '', av: null as Player | null, lead: 'Pass the phone to', name: '', hint: "Listen closely. When the music stops, it's your turn to carry on.", count: null as string | null, readyShow: true, readyDisabled: false, skipShow: true };
export const ui = {
  screen: 'home' as Screen,
  toast: { msg: '', show: false },
  songBack: '← Players',
  // players
  nameIn: '', livesSel: '3', langSel: 'en-US', micOut: '', srWarn: false, micTest: true,
  // online + lobby
  myName: '', joinCode: '', onlineStatus: '',
  roomCode: '····', lobbyMembers: [] as Member[], lobbyStatus: '', lobbyPicking: false,
  lobbyLives: '3', lobbyLang: 'en-US', readyOn: false,
  // song
  q: '', searchStatus: '', songStatus: '', packs: { live: [] as LivePack[], packs: [] as Pack[] }, addState: {} as Record<string, 'busy' | 'nolyrics'>,
  // handoff
  hand: { ...hand },
  // listen
  listen: { name: '', av: null as Player | null, title: '', artist: '', art: '', skip2: true, stopped: false },
  kara: { prev: '', cur: '', next: '', mystery: false, pop: 0 },
  syncVal: '', syncPanel: null as { k: number; text: string }[] | null,
  // turn
  turn: { name: '', av: null as Player | null, cue: '', heard: '', doneDisabled: true, doneHidden: false },
  go: { cls: 'go', text: 'YOUR TURN', key: 0 },
  words: [] as Token[], hint: 0, ok: [] as boolean[],
  // reveal
  rev: {
    who: '', heard: '', words: [] as Token[], ok: [] as boolean[], miss: [] as boolean[], show: false, key: 0,
    vote: false, wait: false, verdict: { cls: 'verdict', text: '' },
    standings: null as { list: Player[]; cur: Player; gain: number | null } | null,
  },
  stamp: { cls: 'stamp hidden', text: '', key: 0 },
  cont: { hidden: true, label: 'NEXT SINGER →', counting: false, key: 0 }, hold: false,
  // end
  end: { kicker: '', title: '', top: null as Player | null, nextSong: false, endGame: false, again: true, newPlayers: true, home: '🏠 Home', reel: false, saved: '' },
  // accounts
  signinStatus: '', profName: '', profUser: '', profStatus: '', profSaving: false,
  draft: { face: '😎', color: 1, avatar_url: null as string | null },
  stats: null as { games: number; wins: number; points: number; lines: number } | null,
  board: 'week' as 'week' | 'all', leaders: [] as LeaderRow[], leadersStatus: '',
  // sheets
  menu: { open: false, title: 'Game paused', resume: true, skip: true, change: true, end: true, close: false, quit: '🚪 Quit to home' },
  reel: { open: false, making: true, progress: 0, url: '' },
  install: false, iosTip: false,
};
export const HAND_DEFAULTS = hand;

// elements the engine draws on directly
export const dom = {
  timerBar: null as SVGCircleElement | null,
  wave: null as HTMLDivElement | null,
  dialFg: null as SVGCircleElement | null,
  scoreNum: null as HTMLElement | null,
  confetti: null as HTMLCanvasElement | null,
  reelVideo: null as HTMLVideoElement | null,
};

// ---- change notifications (coalesced: many mutations in one tick = one render)
let version = 0, queued = false;
const listeners = new Set<() => void>();
export function emit() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; version++; listeners.forEach((l) => l()); });
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const useGame = () => useSyncExternalStore(subscribe, () => version, () => 0);
