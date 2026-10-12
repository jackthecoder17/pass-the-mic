"use client";

import Link from "next/link";
import { S, ui, emit } from "@/game/store";
import { startOnePhone, install, quitToHome, show } from "@/game/engine";
import { openOnline, createRoom, joinRoom, shareRoom, readyUp, lobbyStart } from "@/game/online";
import { ACCT, acctClick, openLeaders } from "@/game/accounts";
import { ME, dress } from "@/game/helpers";
import { Avatar } from "../Avatar";

export const scr = (id: string) => `screen${ui.screen === id ? " active" : ""}`;
const set = <K extends keyof typeof ui>(k: K, v: (typeof ui)[K]) => { ui[k] = v; emit(); };

export function Home() {
  const a = ACCT.v;
  return (
    <section id="s-home" className={scr("home")}>
      <div className="home-top">
        <button className="chip" id="leadersBtn" type="button" onClick={() => openLeaders()}>🏆 Leaderboards</button>
        <button className={`acct${a ? "" : " out"}`} id="acctBtn" type="button" onClick={acctClick}>
          <span id="acctAv">{a && <Avatar p={{ photo: a.profile.avatar_url, c: a.profile.color, f: a.profile.face, name: a.profile.display_name }} size="xs" />}</span>
          <span id="acctName">{a ? a.profile.display_name.split(" ")[0] : "Sign in"}</span>
        </button>
      </div>
      <div className="hero">
        <div className="logo-wrap">
          <div className="logo-disc" aria-hidden="true"><span>🎤</span></div>
          <h1 className="logo">PASS<br />THE <span>MIC</span></h1>
        </div>
        <p className="tag">When the music stops, <b>you sing the next line.</b> Miss it, lose a life. The AI is listening 👂</p>
        <div className="col">
          <button className="btn hot big" id="startBtn" onClick={startOnePhone}>📱 Play on one phone</button>
          <button className="btn ghost big" id="onlineBtn" onClick={openOnline}>🌍 Play online with friends</button>
        </div>
        <button className={`install${ui.install ? "" : " hidden"}`} id="installBtn" type="button" onClick={install}>📲 Install the app</button>
        <p className={`install-tip${ui.iosTip ? "" : " hidden"}`} id="iosTip">📲 Install it: tap <b>Share</b> <span aria-hidden="true">⎋</span> then <b>Add to Home Screen</b></p>
        <ol className="how">
          <li><span>🎵</span><div><b>The song plays</b> with lyrics on screen</div></li>
          <li><span>⏸️</span><div><b>It suddenly cuts out</b> and the lyrics vanish</div></li>
          <li><span>🎤</span><div><b>You carry on singing</b> from memory</div></li>
          <li><span>💀</span><div><b>Miss it, lose a life.</b> Last one singing wins.</div></li>
        </ol>
        <p className="legal"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></p>
      </div>
    </section>
  );
}

export function Online() {
  return (
    <section id="s-online" className={scr("online")}>
      <div className="topbar"><button className="back" type="button" id="onlineBack" onClick={() => show("home")}>← Home</button></div>
      <h2>PLAY ONLINE</h2>
      <p className="muted small">Everyone plays on their own phone, wherever they are. Tip: jump on a WhatsApp call so you can hear each other sing 😂</p>
      <label className="field">Your name
        <input id="myName" placeholder="Your name" maxLength={14} autoComplete="nickname" value={ui.myName} onChange={(e) => set("myName", e.target.value)} />
      </label>
      <button className="btn hot big" id="createRoom" type="button" onClick={createRoom}>✨ Create a room</button>
      <div className="or"><span>or join a friend</span></div>
      <form id="joinForm" className="row" onSubmit={(e) => { e.preventDefault(); joinRoom(); }}>
        <input id="joinCode" placeholder="CODE" maxLength={4} autoComplete="off" autoCapitalize="characters" className="code-in" value={ui.joinCode} onChange={(e) => set("joinCode", e.target.value)} />
        <button className="btn cream" type="submit">Join</button>
      </form>
      <p id="onlineStatus" className="status">{ui.onlineStatus}</p>
    </section>
  );
}

export function Lobby() {
  const host = !!S.net?.host;
  const members = ui.lobbyMembers;
  return (
    <section id="s-lobby" className={scr("lobby")}>
      <div className="topbar"><button className="back" type="button" id="lobbyBack" onClick={quitToHome}>← Leave room</button></div>
      <div className="ticket">
        <div className="lbl">ROOM CODE</div>
        <div className="code" id="roomCode">{ui.roomCode}</div>
        <div className="perf"></div>
        <button className="inv" id="shareRoom" type="button" onClick={shareRoom}>📲 Invite the squad</button>
      </div>
      <p className="kicker" id="lobbyCount">{`Who's in · ${members.length}`}</p>
      <ul id="lobbyList" className="crowd">
        {members.map((m, i) => (
          <li key={m.id}>
            <Avatar p={dress({ photo: m.photo, c: m.c, f: m.f, name: m.name }, i)} size="lg" extra={m.ready ? "ready" : ""} />
            <span className="nm">{m.name}</span>
            {m.id === ME.id && <span className="tag">(you)</span>}
            <span className={`tag ${m.host ? "" : m.ready ? "ok" : ""}`}>{m.host ? "👑 host" : m.ready ? "ready" : "getting ready…"}</span>
          </li>
        ))}
        <li className="empty"><span className="av lg">＋</span><span className="tag">invite</span></li>
      </ul>
      <div className="opts">
        <label id="livesWrap" className={host ? "" : "hidden"}>Lives
          <select id="lobbyLives" value={ui.lobbyLives} onChange={(e) => set("lobbyLives", e.target.value)}><option>1</option><option>2</option><option>3</option><option>5</option></select>
        </label>
        <label>Your accent
          <select id="lobbyLang" value={ui.lobbyLang} onChange={(e) => { set("lobbyLang", e.target.value); S.lang = e.target.value; }}>
            <option value="en-US">🇺🇸 US</option><option value="en-GB">🇬🇧 UK</option><option value="en-NG">🇳🇬 Nigeria</option>
          </select>
        </label>
      </div>
      <button className={`btn ghost${ui.readyOn ? " on" : ""}`} id="readyUp" type="button" onClick={readyUp}>
        {ui.readyOn ? "✓ Ready! Sound and mic are on" : "🎧 Tap when ready (turns on sound + mic)"}
      </button>
      <p id="lobbyStatus" className="status center-text">{ui.lobbyStatus}</p>
      <button className={`btn hot big push${host ? "" : " hidden"}`} id="lobbyStart" type="button" onClick={lobbyStart}>🎵 PICK THE MUSIC</button>
    </section>
  );
}
