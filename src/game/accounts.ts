// Accounts: Google sign-in, profiles, photos, leaderboards. Optional: guests can always play.
// Signing in saves your results and puts you on the leaderboards.
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { providers, sb } from '@/lib/net';
import { S, ui, emit, type Account, type Player } from './store';
import { ME, store, toast } from './helpers';
import { show, standings } from './engine';

export const ACCT: { v: Account | null } = { v: null };
export const meAsPlayer = (): Player => {
  const a = ACCT.v!;
  return { name: a.profile.display_name.slice(0, 14), uid: a.id, photo: a.profile.avatar_url, c: a.profile.color || 1, f: a.profile.face || '😎', lives: 0, points: 0, passes: 0 };
};
export const myLook = () => (ACCT.v ? { uid: ACCT.v.id, photo: ACCT.v.profile.avatar_url || null, c: ACCT.v.profile.color || 1, f: ACCT.v.profile.face || '😎' } : {});

// Installed app (home screen): Google sign-in can finish in a separate browser sheet with its own storage,
// so the sheet hands the one-time sign-in code back to the app over a private channel (the app holds the PKCE key).
const SB_TOKEN = 'sb-rwpscifwaaislizubdtz-auth-token';
let googleOn: boolean | null = null;

export async function initAuth() {
  // show the signed-in chip straight away from the last known profile, then confirm with Supabase
  try { const c = JSON.parse(store.get('ptm-acct') || 'null'); if (c?.id && store.get(SB_TOKEN)) { ACCT.v = { ...c, cached: true }; renderAcct(); } } catch {}
  navigator.storage?.persist?.().catch(() => {});
  try {
    const c = sb();
    providers().then((p) => (googleOn = !!p.google)).catch(() => {});
    const q = new URLSearchParams(location.search), code = q.get('code'), relay = q.get('relay');
    if (code || q.get('error')) history.replaceState(null, '', location.pathname + location.hash);
    if (code) {
      // finish here if this window started the sign-in; otherwise (or if that fails) hand the code to the app
      const mine = relay ? store.get('ptm-relay') === relay : true;
      const local = mine && store.get(SB_TOKEN + '-code-verifier') && !(await c.auth.exchangeCodeForSession(code)).error;
      if (!local && relay) return relayCode(c, relay, code);
      if (!local) toast("Sign-in didn't finish. Try again.");
    }
    await syncSession(c);
    // (supabase-js: don't await other calls inside this callback)
    c.auth.onAuthStateChange((evt, session) => { setTimeout(() => setSession(session, evt === 'SIGNED_IN'), 0); });
    const pending = store.get('ptm-relay');
    if (pending) listenRelay(c, pending);
    // another window on this device (e.g. the sign-in tab) may have signed in: pick it up when we come back
    addEventListener('storage', (e) => { if (e.key === SB_TOKEN) syncSession(c); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncSession(c); const p = store.get('ptm-relay'); if (p) listenRelay(c, p); } });
  } catch (e) { console.warn('accounts unavailable', e); }
}
async function syncSession(c: SupabaseClient) {
  const { data, error } = await c.auth.getSession();
  if (error && !data?.session) return; // offline: keep showing the saved account rather than signing out
  await setSession(data.session, false);
}

// in the sign-in sheet: pass the code back to the app until it confirms
function relayCode(c: SupabaseClient, id: string, code: string) {
  show('signin');
  const say = (t: string) => { ui.signinStatus = t; emit(); };
  say('Finishing sign-in…');
  let done = false;
  const ch = c.channel('ptm-auth-' + id);
  ch.on('broadcast', { event: 'got' }, ({ payload }) => {
    done = true;
    say(payload?.ok ? "✓ You're signed in! Close this window to jump back into Pass The Mic." : "Sign-in didn't finish. Open Pass The Mic and try again.");
    setTimeout(() => { try { window.close(); } catch {} }, 800);
  });
  ch.subscribe((st) => {
    if (st !== 'SUBSCRIBED') return;
    const send = () => !done && ch.send({ type: 'broadcast', event: 'code', payload: { code } });
    send();
    const t = setInterval(() => (done ? clearInterval(t) : send()), 1500);
    setTimeout(() => { clearInterval(t); if (!done) say("Couldn't reach the app. Open Pass The Mic and tap Sign in again."); }, 120000);
  });
}
// in the app: wait for the sign-in sheet to send the code back
const relays = new Set<string>();
function listenRelay(c: SupabaseClient, id: string) {
  if (relays.has(id)) return;
  relays.add(id);
  let busy = false;
  const ch = c.channel('ptm-auth-' + id);
  ch.on('broadcast', { event: 'code' }, async ({ payload }) => {
    if (busy) return;
    busy = true;
    const { error } = await c.auth.exchangeCodeForSession(payload.code);
    ch.send({ type: 'broadcast', event: 'got', payload: { ok: !error } });
    store.set('ptm-relay', null);
    if (error) { ui.signinStatus = "Sign-in didn't finish. Try again."; emit(); busy = false; return; }
    setTimeout(() => { c.removeChannel(ch); relays.delete(id); }, 3000);
    if (ui.screen === 'signin') show('home');
  });
  ch.subscribe();
}
async function setSession(session: Session | null, greet: boolean) {
  if (!session?.user) { ACCT.v = null; return renderAcct(); }
  store.set('ptm-relay', null);
  if (ACCT.v?.id === session.user.id && !ACCT.v.cached) return renderAcct();
  const c = sb();
  const res = await c.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  let profile = res.data;
  if (res.error && ACCT.v?.id === session.user.id) return renderAcct(); // offline: keep the saved profile
  if (!profile) { // account made before the profiles table existed
    const meta = session.user.user_metadata || {};
    ({ data: profile } = await c.from('profiles').upsert({ id: session.user.id, display_name: (meta.full_name || meta.name || 'Singer').slice(0, 24), avatar_url: meta.avatar_url || null }).select().single());
  }
  ACCT.v = { id: session.user.id, profile: profile || { display_name: 'Singer', face: '😎', color: 1 } };
  renderAcct();
  if (greet) toast(`Welcome, ${ACCT.v.profile.display_name.split(' ')[0]} 👋`);
}
function renderAcct() {
  store.set('ptm-acct', ACCT.v ? JSON.stringify({ id: ACCT.v.id, profile: ACCT.v.profile }) : null);
  emit();
}
export const acctClick = () => (ACCT.v ? openProfile() : show('signin'));

export async function googleSignIn() {
  const say = (t: string) => { ui.signinStatus = t; emit(); };
  say('Opening Google…');
  try {
    if (googleOn === null) googleOn = !!(await providers().catch(() => ({} as Record<string, boolean>))).google;
    if (!googleOn) return say("Google sign-in isn't switched on yet. Try again soon!");
    const c = sb();
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) {
      const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href.split('#')[0] } });
      if (error) throw error;
      return;
    }
    // installed app: if Google opens in a separate sheet, that sheet hands the code back (see relayCode)
    const id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, '');
    const { data, error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/?relay=${id}`, skipBrowserRedirect: true } });
    if (error) throw error;
    store.set('ptm-relay', id);
    listenRelay(c, id);
    location.assign(data.url!);
  } catch (e) {
    say(/provider is not enabled|Unsupported provider/i.test((e as Error).message || '') ? "Google sign-in isn't switched on yet. Try again soon!" : "Couldn't open Google sign-in. Check your connection and try again.");
  }
}

// ---- profile
export function openProfile() {
  if (!ACCT.v) return show('signin');
  const p = ACCT.v.profile;
  ui.draft = { face: p.face || '😎', color: p.color || 1, avatar_url: p.avatar_url || null };
  ui.profName = p.display_name || '';
  ui.profUser = p.username || '';
  ui.profStatus = '';
  show('profile');
  loadStats();
}
const profStatus = (t: string) => { ui.profStatus = t; emit(); };
export function pickFace(f: string) { ui.draft = { ...ui.draft, face: f }; emit(); }
export function pickColor(c: number) { ui.draft = { ...ui.draft, color: c }; emit(); }
async function saveProfile(patch: object) {
  const c = sb();
  const { data, error } = await c.from('profiles').upsert({ id: ACCT.v!.id, ...patch, updated_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  ACCT.v!.profile = data;
  renderAcct();
  return data;
}
export async function saveProfileForm() {
  const name = ui.profName.trim(), user = ui.profUser.trim().replace(/^@/, '');
  if (!name) return profStatus('Add a display name first.');
  if (user && !/^[a-zA-Z0-9_]{3,20}$/.test(user)) return profStatus('Usernames are 3–20 letters, numbers or _.');
  ui.profSaving = true; profStatus('Saving…');
  try {
    await saveProfile({ display_name: name, username: user || null, face: ui.draft.face, color: ui.draft.color });
    profStatus('✓ Saved');
    toast('Profile saved ✓');
  } catch (e) {
    profStatus((e as { code?: string }).code === '23505' ? 'That username is taken. Try another.' : "Couldn't save. Try again.");
  } finally { ui.profSaving = false; emit(); }
}
// photos: square-crop + shrink on the phone (fast uploads), then save straight away
export async function uploadPhoto(file: File | undefined) {
  if (!file) return;
  profStatus('Uploading your photo…');
  try {
    const blob = await squareJpeg(file, 512);
    const c = sb(), path = `${ACCT.v!.id}/avatar-${Date.now()}.jpg`;
    const { error } = await c.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
    if (error) throw error;
    ui.draft = { ...ui.draft, avatar_url: c.storage.from('avatars').getPublicUrl(path).data.publicUrl };
    await saveProfile({ avatar_url: ui.draft.avatar_url });
    profStatus('✓ Looking good! Your photo shows up in every game.');
  } catch (err) {
    console.warn(err);
    profStatus("Couldn't use that photo. Try a JPG or PNG under 10 MB.");
  }
}
export async function removePhoto() {
  try { ui.draft = { ...ui.draft, avatar_url: null }; await saveProfile({ avatar_url: null }); profStatus('Photo removed. Using your emoji avatar.'); }
  catch { profStatus("Couldn't remove it. Try again."); }
}
async function squareJpeg(file: File, size: number) {
  if (file.size > 10 * 1024 * 1024) throw new Error('too big');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    cv.getContext('2d')!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return await new Promise<Blob>((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('encode'))), 'image/jpeg', 0.86));
  } finally { URL.revokeObjectURL(url); }
}
async function loadStats() {
  ui.stats = null; emit();
  try {
    const { data } = await sb().from('game_results').select('points,lines,won').eq('user_id', ACCT.v!.id).limit(5000);
    const g = (data || []) as { points: number; lines: number; won: boolean }[], sum = (k: 'points' | 'lines') => g.reduce((n, r) => n + (r[k] || 0), 0);
    ui.stats = { games: g.length, wins: g.filter((r) => r.won).length, points: sum('points'), lines: sum('lines') };
    emit();
  } catch {}
}
export async function signOut() {
  try { await sb().auth.signOut(); } catch {}
  ACCT.v = null; renderAcct(); show('home'); toast('Signed out. See you on the mic 🎤');
}

// ---- leaderboards
export async function openLeaders(kind: 'week' | 'all' = ui.board) {
  ui.board = kind;
  if (ui.screen !== 'leaders') show('leaders');
  ui.leaders = []; ui.leadersStatus = 'Loading…'; emit();
  try {
    const { data, error } = await sb().from(kind === 'week' ? 'leaderboard_week' : 'leaderboard_all').select('*').order('points', { ascending: false }).limit(50);
    if (error) throw error;
    if (ui.board !== kind) return; // switched tabs meanwhile
    ui.leadersStatus = data.length ? '' : kind === 'week' ? 'No scores yet this week. Play a game signed in and grab #1 👑' : 'No scores yet. Be the first legend 👑';
    ui.leaders = data;
  } catch { ui.leadersStatus = "Couldn't load the leaderboard. Check your connection."; }
  emit();
}

// ---- save the result when a game ends (once per game, signed-in players only)
export async function recordResult() {
  const note = (t: string) => { ui.end = { ...ui.end, saved: t }; emit(); };
  const me = S.net ? S.players.find((p) => p.id === ME.id) : S.players.find((p) => ACCT.v && p.uid === ACCT.v.id);
  const played = S.players.some((p) => p.passes > 0 || p.lives < S.lives);
  if (!played) return note('');
  if (!ACCT.v) return note('🏆 Sign in to save your scores and get on the leaderboard.');
  if (!me) return note('');
  if (S.recorded) return;
  S.recorded = true;
  const top = standings()[0];
  try {
    const { error } = await sb().from('game_results').insert({
      user_id: ACCT.v.id, mode: S.net ? 'online' : 'local', pack: (S.pack || S.song?.title || null)?.slice(0, 60),
      points: Math.min(5000, me.points || 0), lines: Math.min(200, me.passes || 0), players: S.players.length,
      won: S.players.length > 1 && top === me,
    });
    if (error) throw error;
    note(`✓ Saved to your profile · +${me.points || 0} points on the leaderboard`);
  } catch { S.recorded = false; note("Couldn't save this game's score."); }
}
