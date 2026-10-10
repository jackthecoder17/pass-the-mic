// Online rooms over Supabase Realtime: broadcast for game messages, presence for who's in the room.
// No database tables: the host's phone is the source of truth and broadcasts every decision.

const SB_URL = 'https://rwpscifwaaislizubdtz.supabase.co';
// public "anon" key: designed to ship in browser code
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3cHNjaWZ3YWFpc2xpenViZHR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODQyMjgsImV4cCI6MjEwNzE2MDIyOH0.qZQMgU17Z1bsmef-bhfNSwtH15cM9olNyn7_hEajtz4';

let client;
async function sb() {
  if (!client) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    client = createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 20 } } });
  }
  return client;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export const newCode = () => Array.from({ length: 4 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('');

// join (or create) a room channel; resolves once connected
export async function openRoom(code, me, { onMsg, onPresence }) {
  const c = await sb();
  const ch = c.channel('ptm:' + code, { config: { broadcast: { self: false }, presence: { key: me.id } } });
  const members = () => Object.values(ch.presenceState()).map((metas) => metas[0]).filter(Boolean).sort((a, b) => a.at - b.at);
  ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
  ch.on('presence', { event: 'sync' }, () => onPresence(members()));
  await new Promise((ok, fail) => {
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
