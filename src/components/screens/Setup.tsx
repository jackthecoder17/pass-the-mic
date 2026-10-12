"use client";

import { S, ui, emit } from "@/game/store";
import {
  addPlayer, removePlayer, addMe, micTest, toSong, show, search, playPicked, addToPlaylist,
  removeFromPlaylist, startPlaylist, startPack, songBack,
} from "@/game/engine";
import { ACCT } from "@/game/accounts";
import { fmt } from "@/game/helpers";
import { Avatar } from "../Avatar";
import { scr } from "./Start";

const set = <K extends keyof typeof ui>(k: K, v: (typeof ui)[K]) => { ui[k] = v; emit(); };

export function Players() {
  const canAddMe = !!ACCT.v && !S.players.some((p) => p.uid === ACCT.v!.id);
  return (
    <section id="s-players" className={scr("players")}>
      <div className="topbar"><button className="back" type="button" id="playersBack" onClick={() => show("home")}>← Home</button></div>
      <h2>WHO&apos;S PLAYING?</h2>
      <form id="addForm" className="row" onSubmit={(e) => { e.preventDefault(); addPlayer(); }}>
        <input id="nameIn" placeholder="Player name" maxLength={14} autoComplete="off" enterKeyHint="done" value={ui.nameIn} onChange={(e) => set("nameIn", e.target.value)} />
        <button className="btn cream" type="submit">Add</button>
      </form>
      <button className={`btn ghost${canAddMe ? "" : " hidden"}`} id="addMe" type="button" onClick={addMe}>
        {canAddMe ? `+ Add me (${ACCT.v!.profile.display_name})` : ""}
      </button>
      <ul id="plist" className="crowd">
        {S.players.map((p, i) => (
          <li key={p.name}>
            <Avatar p={p} size="lg" />
            <span className="nm">{p.name}</span>
            <button className="rm" type="button" aria-label={`Remove ${p.name}`} onClick={() => removePlayer(i)}>✕</button>
          </li>
        ))}
        {S.players.length < 12 && <li className="empty"><span className="av lg">＋</span><span className="tag">{S.players.length ? "add another" : "add players above"}</span></li>}
      </ul>
      <div className="opts">
        <label>Lives
          <select id="livesSel" value={ui.livesSel} onChange={(e) => set("livesSel", e.target.value)}><option>1</option><option>2</option><option>3</option><option>5</option></select>
        </label>
        <label>Accent
          <select id="langSel" value={ui.langSel} onChange={(e) => set("langSel", e.target.value)}>
            <option value="en-US">🇺🇸 US</option><option value="en-GB">🇬🇧 UK</option><option value="en-NG">🇳🇬 Nigeria</option>
          </select>
        </label>
      </div>
      <div className="mic-test">
        <button className={`btn ghost${ui.micTest ? "" : " hidden"}`} id="micTest" type="button" onClick={micTest}>🎤 Test the mic</button>
        <p id="micOut" className="muted small">{ui.micOut}</p>
      </div>
      <p id="srWarn" className={`warn${ui.srWarn ? "" : " hidden"}`}>This browser can&apos;t listen to singing. Use Chrome or Safari. You can still play: the room will vote on every turn.</p>
      <button className="btn hot big push" id="toSong" disabled={!S.players.length} onClick={toSong}>PICK THE MUSIC →</button>
    </section>
  );
}

function addLabel(vid: string) {
  if (S.mine.some((m) => m.vid === vid)) return { text: <>✓<span className="lbl"> Added</span></>, on: true, disabled: true };
  const st = ui.addState[vid];
  if (st === "busy") return { text: <>⏳</>, on: false, disabled: true };
  if (st === "nolyrics") return { text: <>✗ No lyrics</>, on: false, disabled: true };
  return { text: <>+<span className="lbl"> Add</span></>, on: false, disabled: false };
}

export function Song() {
  const PACKS = ui.packs;
  const all = PACKS.packs.reduce((n, p) => n + p.songs.length, 0);
  const n = S.mine.length;
  const card = (key: string, emoji: string, name: string, blurb: string, tag: React.ReactNode) => (
    <button key={key} className="pack" type="button" data-pack={key} onClick={() => startPack(key)}>
      <span className="pe">{emoji}</span><b>{name}</b><span className="pb">{blurb}</span><span className="pt">{tag}</span>
    </button>
  );
  return (
    <section id="s-song" className={scr("song")}>
      <div className="topbar"><button className="back" type="button" id="songBack" onClick={songBack}>{ui.songBack}</button></div>
      <h2>PICK THE MUSIC</h2>
      <form id="searchForm" className="row" onSubmit={(e) => { e.preventDefault(); const q = ui.q.trim(); if (q) search(q); }}>
        <input id="q" placeholder="Search any song or artist…" autoComplete="off" enterKeyHint="search" value={ui.q} onChange={(e) => set("q", e.target.value)} />
        <button className="btn cream" type="submit">Search</button>
      </form>
      <p className="muted small">▶ Play one now, or <b>+ Add</b> a few to build your own playlist. Everyone can add their favourite.</p>
      <p id="searchStatus" className="status">{ui.searchStatus}</p>
      <ul id="results" className="results">
        {S.results.map((x) => {
          const add = addLabel(x.vid);
          return (
            <li className="res" key={x.vid}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {x.art ? <img src={x.art} alt="" loading="lazy" /> : <span className="noart">🎵</span>}
              <div className="ri"><b>{x.t}</b><span>{x.a}{x.album && x.album !== x.t ? " · " + x.album : ""} · {fmt(x.secs)}</span></div>
              <button className="chip" type="button" aria-label={`Play ${x.t}`} onClick={() => playPicked(x)}>▶<span className="lbl"> Play</span></button>
              <button className={`chip add${add.on ? " on" : ""}`} type="button" disabled={add.disabled} aria-label={`Add ${x.t} to playlist`} onClick={() => addToPlaylist(x)}>{add.text}</button>
            </li>
          );
        })}
      </ul>
      <p className="kicker">Or pick a vibe</p>
      <p className="muted small">Each song lasts one round, then the next one in the pack starts.</p>
      <p id="songStatus" className="status">{ui.songStatus}</p>
      <div id="packs" className="packs">
        {(PACKS.packs.length || PACKS.live.length) ? [
          card("mix", "🎲", "Mix Everything", "Every genre, shuffled", `${all} songs`),
          ...PACKS.live.map((p) => card(p.id, p.emoji, p.name, p.blurb, <><i className="live"></i>LIVE</>)),
          ...PACKS.packs.map((p) => card(p.id, p.emoji, p.name, p.blurb, `${p.songs.length} songs`)),
        ] : null}
      </div>
      <div id="tray" className={`tray${n ? "" : " hidden"}`}>
        <div className="tray-top"><b id="trayCount">{`🎶 Your playlist · ${n} song${n === 1 ? "" : "s"}`}</b><button className="btn hot" id="trayStart" type="button" onClick={startPlaylist}>START ▶</button></div>
        <div id="trayList" className="tray-list">
          {S.mine.map((m, i) => <span className="tchip" key={m.vid}>{m.t}<button type="button" aria-label={`Remove ${m.t}`} onClick={() => removeFromPlaylist(i)}>✕</button></span>)}
        </div>
      </div>
    </section>
  );
}
