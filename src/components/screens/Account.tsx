"use client";

import { ui, emit } from "@/game/store";
import { show } from "@/game/engine";
import { FACES } from "@/game/helpers";
import { ACCT, googleSignIn, openLeaders, pickColor, pickFace, removePhoto, saveProfileForm, signOut, uploadPhoto } from "@/game/accounts";
import { Avatar } from "../Avatar";
import { scr } from "./Start";

const set = <K extends keyof typeof ui>(k: K, v: (typeof ui)[K]) => { ui[k] = v; emit(); };
const home = () => show("home");

export function SignIn() {
  return (
    <section id="s-signin" className={scr("signin")}>
      <div className="topbar"><button className="back" type="button" onClick={home}>← Back</button></div>
      <div className="signin">
        <div className="logo-disc static" aria-hidden="true"><span>🎤</span></div>
        <h2>SIGN IN</h2>
        <p className="muted">Save your scores, get on the leaderboards, and put your own face in the game.</p>
        <button className="btn google big" id="googleBtn" type="button" onClick={googleSignIn}>
          <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
          Continue with Google
        </button>
        <p className="status" id="signinStatus">{ui.signinStatus}</p>
        <p className="muted small">No account needed to play. Guests can always jump straight in.</p>
      </div>
    </section>
  );
}

export function Profile() {
  const d = ui.draft, st = ui.stats;
  return (
    <section id="s-profile" className={scr("profile")}>
      <div className="topbar"><button className="back" type="button" onClick={home}>← Home</button></div>
      <div className="prof-head">
        <div className="prof-av" id="profAv"><Avatar p={{ photo: d.avatar_url, c: d.color, f: d.face, name: ui.profName }} /></div>
        <div className="row center-row">
          <label className="btn ghost small-btn" htmlFor="photoIn">📷 Change photo</label>
          <input type="file" id="photoIn" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; uploadPhoto(f); }} />
          <button className={`btn ghost small-btn${d.avatar_url ? "" : " hidden"}`} id="photoDel" type="button" onClick={removePhoto}>Remove</button>
        </div>
      </div>
      <div className="stats" id="profStats">
        {st && <>
          <div><b>{st.games}</b><span>Games</span></div><div><b>{st.wins}</b><span>Wins</span></div>
          <div><b>{st.points}</b><span>Points</span></div><div><b>{st.lines}</b><span>Lines</span></div>
        </>}
      </div>
      <label className="field">Display name
        <input id="profName" maxLength={24} autoComplete="nickname" value={ui.profName} onChange={(e) => set("profName", e.target.value)} />
      </label>
      <label className="field">Username
        <div className="at"><span>@</span><input id="profUser" maxLength={20} autoComplete="off" autoCapitalize="none" placeholder="optional" value={ui.profUser} onChange={(e) => set("profUser", e.target.value)} /></div>
      </label>
      <div className="field"><span>Avatar when there&apos;s no photo</span>
        <div className="faces" id="faces">
          {FACES.map((f) => <button key={f} type="button" className={f === d.face ? "on" : ""} aria-label={`Avatar ${f}`} onClick={() => pickFace(f)}>{f}</button>)}
        </div>
        <div className="swatches" id="swatches">
          {[1, 2, 3, 4, 5, 6].map((c) => <button key={c} type="button" className={`c${c} ${c === d.color ? "on" : ""}`} aria-label={`Colour ${c}`} onClick={() => pickColor(c)} />)}
        </div>
      </div>
      <p className="status" id="profStatus">{ui.profStatus}</p>
      <button className="btn hot big" id="profSave" type="button" disabled={ui.profSaving} onClick={saveProfileForm}>SAVE PROFILE</button>
      <button className="btn ghost danger" id="signOut" type="button" onClick={signOut}>Sign out</button>
    </section>
  );
}

export function Leaders() {
  const me = ACCT.v;
  return (
    <section id="s-leaders" className={scr("leaders")}>
      <div className="topbar"><button className="back" type="button" onClick={home}>← Home</button></div>
      <h2>LEADERBOARDS</h2>
      <div className="tabs" role="tablist">
        <button className={`tab${ui.board === "week" ? " on" : ""}`} type="button" role="tab" onClick={() => openLeaders("week")}>This week</button>
        <button className={`tab${ui.board === "all" ? " on" : ""}`} type="button" role="tab" onClick={() => openLeaders("all")}>All time</button>
      </div>
      <ol className="leaders" id="leaders">
        {ui.leaders.map((r, i) => (
          <li key={r.id} className={me && r.id === me.id ? "me" : ""} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
            <span className="pos">{i + 1}</span><Avatar p={{ photo: r.avatar_url, c: r.color, f: r.face, name: r.display_name }} size="sm" />
            <span className="who2">
              <b>{r.display_name}{me && r.id === me.id ? " (you)" : ""}</b>
              <small>{r.username ? "@" + r.username + " · " : ""}{r.wins} win{r.wins === 1 ? "" : "s"} · {r.games} game{r.games === 1 ? "" : "s"}</small>
            </span>
            <span className="pts">{r.points}</span>
          </li>
        ))}
      </ol>
      <p className="status center-text" id="leadersStatus">{ui.leadersStatus}</p>
      <button className={`btn hot big push${me ? " hidden" : ""}`} id="leadersSignin" type="button" onClick={() => show("signin")}>SIGN IN TO GET ON THE BOARD</button>
    </section>
  );
}
