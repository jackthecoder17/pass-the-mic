"use client";

import { S, ui, dom } from "@/game/store";
import {
  ready, skipSong, skipSong2, jumpToMyPart, nudgeSync, openSync, syncTo, closeSync, finishTurn, votePass, voteFail,
  continueGame, holdOn, WAVE_N, standings, nextSongFromEnd, endGame, playAgain, newPlayers, quitToHome, makeReel, openMenu,
} from "@/game/engine";
import { openLeaders } from "@/game/accounts";
import { Avatar } from "../Avatar";
import { FitText } from "../FitText";
import { scr } from "./Start";

const len = (d: string) => ({ "--len": Math.max(2, d.length) }) as React.CSSProperties;

// stable ref callbacks (a new function each render would make React detach/re-attach them every time)
const refTimer = (el: SVGCircleElement | null) => { dom.timerBar = el; };
const refWave = (el: HTMLDivElement | null) => { dom.wave = el; };
const refDial = (el: SVGCircleElement | null) => { dom.dialFg = el; };
const refScore = (el: HTMLElement | null) => { if (el && !el.textContent) el.textContent = "0%"; dom.scoreNum = el; };

// in-game scoreboard
export function Board() {
  const show = ["handoff", "listen", "turn", "reveal"].includes(ui.screen);
  return (
    <header id="board" className={`board${show ? "" : " hidden"}`}>
      <div className="board-top">
        <div className="songname">🎵 {S.song ? `${S.song.title} · ${S.song.artist}` : ""}</div>
        <button className="menu-btn" type="button" aria-label="Pause menu" onClick={openMenu}>☰ Menu</button>
      </div>
      <div className="pl">
        {S.players.map((p, i) => (
          <span key={p.id || p.name} className={`pc ${i === S.cur ? "cur" : ""} ${p.lives <= 0 || p.gone ? "out" : ""} ${S.net && p.id === S.net.me.id ? "me" : ""}`}>
            <Avatar p={p} size="sm" /><b>{p.name}</b>
            <span className="hearts">{p.gone ? "👋" : p.lives > 0 ? "❤️".repeat(p.lives) : "💀"}</span>
          </span>
        ))}
      </div>
    </header>
  );
}

export function Handoff() {
  const h = ui.hand;
  return (
    <section id="s-handoff" className={`${scr("handoff")} center`}>
      <p className="kicker" id="roundInfo">{h.round}</p>
      <p className="next-song" id="handSong">{h.song}</p>
      <div id="handAv" className="hand-av">{h.av && <Avatar p={h.av} size="xl" />}</div>
      <p className="muted" id="handLead">{h.lead}</p>
      <FitText id="handName" className="who" max={88}>{h.name}</FitText>
      <p className="muted small narrow" id="handHint">{h.hint}</p>
      <p className={`countin${h.count ? "" : " hidden"}`} id="handCount">{h.count}</p>
      <button className={`btn hot big${h.readyShow ? "" : " hidden"}`} id="readyBtn" disabled={h.readyDisabled} onClick={ready}>I&apos;M READY ▶</button>
      <button className={`btn ghost skip-song${h.skipShow ? "" : " hidden"}`} id="skipSongBtn" type="button" onClick={skipSong}>Don&apos;t know this one? Skip song ⏭</button>
    </section>
  );
}

export function Listen() {
  const l = ui.listen, k = ui.kara;
  return (
    <section id="s-listen" className={scr("listen")}>
      <div className="deck">
        <div className="tv-slot" aria-hidden="true"></div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className={`vinyl${l.stopped ? " stopped" : ""}`} id="vinyl"><img id="vinylArt" alt="" src={l.art || undefined} /><span className="hole"></span></div>
        <div className="arm" aria-hidden="true"></div>
      </div>
      <div className="np"><b id="npTitle">{l.title}</b><small id="npArtist">{l.artist}</small></div>
      <div className="karaoke" id="kara">
        <p className="kl prev">{k.prev}</p>
        <p className={`kl cur${k.pop ? " pop" : ""}`} key={`kara${k.pop}`}>{k.cur}</p>
        <p className={`kl next${k.mystery ? " mystery" : ""}`}>{k.next}</p>
      </div>
      <div className="upnext">
        <span id="upAv">{l.av && <Avatar p={l.av} size="sm" />}</span>
        <div className="t">When the music stops<b><span id="listenName">{l.name}</span> TAKES OVER</b></div>
        <div className="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      </div>
      <div className="tools">
        <div className="sync">
          <button className="chip" id="syncBtn" type="button" onClick={openSync}>🎯 Fix sync</button>
          <button className="chip" type="button" aria-label="Lyrics are early" onClick={() => nudgeSync(-0.3)}>− 0.3s</button>
          <button className="chip" type="button" aria-label="Lyrics are late" onClick={() => nudgeSync(0.3)}>+ 0.3s</button>
          <span className="muted small" id="syncVal">{ui.syncVal}</span>
        </div>
        <div className="sync">
          <button className="chip" id="skipBtn" type="button" onClick={jumpToMyPart}>Jump to my part ⏩</button>
          <button className={`chip${l.skip2 ? "" : " hidden"}`} id="skipSongBtn2" type="button" onClick={skipSong2}>Skip song ⏭</button>
        </div>
      </div>
      {ui.syncPanel && (
        <div id="syncPanel" className="sync-panel">
          <p><b>Tap a line the moment the singer starts it</b></p>
          <div id="syncLines" className="sync-lines">
            {ui.syncPanel.map((x) => <button key={x.k} type="button" onClick={() => syncTo(x.k)}>{x.text}</button>)}
          </div>
          <button className="chip" id="syncClose" type="button" onClick={closeSync}>Cancel</button>
        </div>
      )}
    </section>
  );
}

export function Turn() {
  const t = ui.turn;
  return (
    <section id="s-turn" className={`${scr("turn")} center spot`}>
      <div className="ring" id="ring">
        <svg viewBox="0 0 132 132" aria-hidden="true"><circle className="bg" cx="66" cy="66" r="62" /><circle className="fg" id="timerBar" cx="66" cy="66" r="62" ref={refTimer} /></svg>
        <span id="turnAv">{t.av && <Avatar p={t.av} size="xl" />}</span>
      </div>
      <div className="who-sm" id="turnName">{t.name}</div>
      <FitText key={`go${ui.go.key}`} id="goTxt" className={ui.go.cls} max={76}>{ui.go.text}</FitText>
      <p className="cue" id="cue">{t.cue}</p>
      <div className="wave" id="wave" aria-hidden="true" ref={refWave}>
        {Array.from({ length: WAVE_N }, (_, i) => <i key={i}></i>)}
      </div>
      <div className="chips" id="chips">
        {ui.words.map((w, i) => (
          <span key={i} className={`w${i < ui.hint ? " hint" : ""}${ui.ok[i] ? " ok" : ""}`} style={len(w.d)}><b>{w.d}</b></span>
        ))}
      </div>
      <p className="heard" id="heard">{t.heard}</p>
      <button className={`btn ghost${t.doneHidden ? " hidden" : ""}`} id="doneBtn" type="button" disabled={t.doneDisabled} onClick={() => finishTurn()}>Done ✓</button>
    </section>
  );
}

export function Reveal() {
  const r = ui.rev, st = r.standings;
  return (
    <section id="s-reveal" className={`${scr("reveal")} center`}>
      <p className="kicker" id="revWho">{r.who}</p>
      <div className="verdict-wrap">
        <div className="dial">
          <svg viewBox="0 0 150 150" aria-hidden="true">
            <defs><linearGradient id="dg" x1="0" x2="1"><stop offset="0" stopColor="#ffc23d" /><stop offset="1" stopColor="#19e68c" /></linearGradient></defs>
            <circle className="bg" cx="75" cy="75" r="65" /><circle className="fg" id="dialFg" cx="75" cy="75" r="65" ref={refDial} />
          </svg>
          {/* the count-up writes this directly (60fps), so React never renders its text */}
          <b id="scoreNum" ref={refScore} />
        </div>
        <div className={ui.stamp.cls} id="stamp" key={`stamp${ui.stamp.key}`}>{ui.stamp.text}</div>
      </div>
      <div className={r.verdict.cls} id="verdict">{r.verdict.text}</div>
      <div className="chips flaps" id="revChips" key={`chips${r.key}`}>
        {r.words.map((w, i) => (
          <span key={i} className={`w${r.ok[i] ? " ok" : ""}${r.miss[i] ? " miss" : ""}${r.show ? " show" : ""}`} style={{ ...len(w.d), animationDelay: `${0.9 + i * 0.09}s` }}><b>{w.d}</b></span>
        ))}
      </div>
      <p className="heard" id="revHeard">{r.heard}</p>
      <div id="voteBox" className={`vote${r.vote ? "" : " hidden"}`}>
        <p>The AI can&apos;t decide. <b>The room decides:</b></p>
        <div className="row">
          <button className="btn pass" id="votePass" type="button" onClick={votePass}>👍 PASS</button>
          <button className="btn fail" id="voteFail" type="button" onClick={voteFail}>👎 FAIL</button>
        </div>
      </div>
      <button key={`cont${ui.cont.key}`} className={`btn hot big${ui.cont.hidden ? " hidden" : ""}${ui.cont.counting ? " counting" : ""}`} id="contBtn" type="button" onClick={continueGame}>{ui.cont.label}</button>
      <button className={`hold${ui.hold ? "" : " hidden"}`} id="holdBtn" type="button" onClick={holdOn}>✋ Hold on</button>
      <p className={`muted small${r.wait ? "" : " hidden"}`} id="waitHost">Waiting for the host to continue…</p>
      <div className="standings" id="standings">
        {st?.list.map((p) => (
          <div key={p.id || p.name} className={`st ${p === st.cur ? "me" : ""} ${p.lives <= 0 ? "out" : ""}`}>
            <Avatar p={p} size="sm" /><span className="nm">{p.name}</span>
            {p === st.cur && st.gain ? <span className="delta">+{st.gain}</span> : null}
            <span className="hearts">{p.lives > 0 ? "❤️".repeat(p.lives) : "💀"}</span><span className="pts">{p.points}</span>
          </div>
        ))}
      </div>
      <div className="replay-box">
        <p className="kicker">🔁 The real line</p>
        <div className="tv-slot wide" aria-hidden="true"></div>
      </div>
    </section>
  );
}

export function End() {
  const e = ui.end;
  return (
    <section id="s-end" className={`${scr("end")} center`}>
      <p className="kicker" id="endKicker">{e.kicker}</p>
      <div id="endAv" className="end-av">{e.top && <><span className="crown">👑</span><Avatar p={e.top} size="xl" /></>}</div>
      <FitText id="endTitle" className="who" max={88}>{e.title}</FitText>
      <ol className="rank" id="rank">
        {ui.screen === "end" && standings().map((p, i) => (
          <li key={p.id || p.name}>
            <span className="pos">{i + 1}</span><Avatar p={p} size="sm" /><span className="nm">{p.name}</span>
            <span className="stt">{p.lives > 0 ? "❤️".repeat(p.lives) : "💀"}<br />{p.passes} lines · {p.points} pts</span>
          </li>
        ))}
      </ol>
      <div className="col">
        <button className={`btn reel big${e.reel ? "" : " hidden"}`} id="reelBtn" type="button" onClick={makeReel}>🎬 MAKE HIGHLIGHT REEL</button>
        <p className={`muted small center-text${e.reel ? "" : " hidden"}`} id="reelNote">Made from the singing on this phone. Nothing is uploaded unless you share it.</p>
        <button className={`btn hot big${e.nextSong ? "" : " hidden"}`} id="nextSong" type="button" onClick={nextSongFromEnd}>NEXT SONG 🎵</button>
        <button className={`btn hot big${e.again ? "" : " hidden"}`} id="again" type="button" onClick={playAgain}>PLAY AGAIN 🔁</button>
        <button className={`btn ghost${e.endGame ? "" : " hidden"}`} id="endGame" type="button" onClick={() => endGame()}>End game</button>
        <button className={`btn ghost${e.newPlayers ? "" : " hidden"}`} id="newPlayers" type="button" onClick={newPlayers}>New players</button>
        <button className="btn ghost" id="endLeaders" type="button" onClick={() => openLeaders()}>🏆 Leaderboards</button>
        <button className="btn ghost" id="endHome" type="button" onClick={quitToHome}>{e.home}</button>
      </div>
      <p className="muted small" id="savedNote">{e.saved}</p>
    </section>
  );
}

