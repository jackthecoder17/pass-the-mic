// Small shared pieces of game logic.
import { S, ui, emit, type Player } from './store';

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
// [PTM] debug lines in the console (read while testing; harmless for players)
export const dbg = (...a: unknown[]) => console.log('[PTM]', ...a);
export const passMark = () => Math.min(80, 65 + (S.round - 1) * 5); // 65% → 80%: strict, but leaves room for speech-to-text slips
export const hintCount = () => (S.round <= 2 ? 1 : 0); // early rounds show the first word, so it doesn't count
export const alive = () => S.players.filter((p) => p.lives > 0 && !p.gone); // gone = dropped out of an online room (may come back)
export function nextAlive(i: number) {
  const n = S.players.length;
  for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (S.players[j].lives > 0 && !S.players[j].gone) return j; }
  return -1;
}

let toastT: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  ui.toast = { msg, show: true };
  emit();
  clearTimeout(toastT);
  toastT = setTimeout(() => { ui.toast = { ...ui.toast, show: false }; emit(); }, 3500);
}

// ---------- avatars: every player keeps a colour + face ----------
export const FACES = ['😎', '🤩', '🥳', '😜', '🤠', '😏', '🥸', '🤓', '😇', '🤪', '😺', '🦁'];
export function dress<T extends Partial<Player>>(p: T, i: number): T {
  if (!p.c) { p.c = (i % 6) + 1; p.f = FACES[i % FACES.length]; }
  return p;
}

// ---------- who am I (online) ----------
export const ME = { id: '' };
export function initMe() {
  let id: string | null = null;
  try { id = sessionStorage.getItem('ptm-id'); } catch {}
  if (!id) { id = (crypto.randomUUID?.() || String(Math.random()).slice(2)); try { sessionStorage.setItem('ptm-id', id); } catch {} }
  ME.id = id;
}
export const isMe = (i: number) => !!S.net && S.players[i]?.id === S.net.me.id;

export const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
};

export const IS_IOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
type SRCtor = new () => SpeechRecognitionLike;
export interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
export const getSR = (): SRCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};
