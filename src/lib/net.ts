// Online rooms over Supabase Realtime: broadcast for game messages, presence for who's in the room.
// Rooms use no database tables: the host's phone is the source of truth and broadcasts every decision.
// The same client also handles accounts (Google sign-in), profiles and leaderboards.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Member, Room } from '@/game/store';

const SB_URL = 'https://rwpscifwaaislizubdtz.supabase.co';
// public "anon" key: designed to ship in browser code
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3cHNjaWZ3YWFpc2xpenViZHR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODQyMjgsImV4cCI6MjEwNzE2MDIyOH0.qZQMgU17Z1bsmef-bhfNSwtH15cM9olNyn7_hEajtz4';

let client: SupabaseClient | null = null;
// one Supabase client for everything: accounts (Google sign-in), profiles, leaderboards, live rooms
export function sb() {
  client ??= createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}

// which sign-in providers are switched on (so we never send people to an error page)
export async function providers(): Promise<Record<string, boolean>> {
  const r = await fetch(`${SB_URL}/auth/v1/settings`, { headers: { apikey: SB_KEY } });
  return r.ok ? (await r.json()).external || {} : {};
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export const newCode = () => Array.from({ length: 4 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('');

// join (or create) a room channel; resolves once connected
export async function openRoom(code: string, me: { id: string }, { onMsg, onPresence }: { onMsg: (m: Record<string, unknown>) => void; onPresence: (m: Member[]) => void }): Promise<Room> {
  const c = sb();
  const ch = c.channel('ptm:' + code, { config: { broadcast: { self: false }, presence: { key: me.id } } });
  const members = () => Object.values(ch.presenceState()).map((metas) => metas[0] as unknown as Member).filter(Boolean).sort((a, b) => a.at - b.at);
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
  ch.on('presence', { event: 'sync' }, () => onPresence(members()));
  await new Promise<void>((ok, fail) => {
    const t = setTimeout(() => fail(new Error("Couldn't connect. Check your internet and try again.")), 12000);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(t); ok(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); fail(new Error("Couldn't connect. Check your internet and try again.")); }
    });
  });
  let meta = {};
  return {
    code,
    members,
    send: (t, data = {}) => ch.send({ type: 'broadcast', event: 'm', payload: { t, from: me.id, ...data } }),
    track: (patch) => { meta = { ...meta, ...patch }; return ch.track(meta); },
    leave: () => { try { ch.untrack(); c.removeChannel(ch); } catch {} },
  };
}
