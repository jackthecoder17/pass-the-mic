"use client";

import { useEffect, useRef } from "react";
import { ui, dom, useGame } from "@/game/store";
import { boot, menuChange, menuClose, menuEnd, menuQuit, menuResume, menuSkip, shareReel, saveReel, closeReel } from "@/game/engine";
import { initOnline } from "@/game/online";
import { initAuth } from "@/game/accounts";
import { initMe } from "@/game/helpers";
import { Home, Online, Lobby } from "./screens/Start";
import { Players, Song } from "./screens/Setup";
import { Board, Handoff, Listen, Turn, Reveal, End } from "./screens/Play";
import { SignIn, Profile, Leaders } from "./screens/Account";

const refConfetti = (el: HTMLCanvasElement | null) => { dom.confetti = el; };
const refReel = (el: HTMLVideoElement | null) => { dom.reelVideo = el; };

function Menu() {
  const m = ui.menu;
  return (
    <div id="menu" className={`sheet${m.open ? "" : " hidden"}`} role="dialog" aria-modal="true" aria-labelledby="menuTitle">
      <div className="sheet-card">
        <p className="kicker" id="menuTitle">{m.title}</p>
        <button className={`btn hot big${m.resume ? "" : " hidden"}`} id="mResume" type="button" onClick={menuResume}>▶ RESUME</button>
        <button className={`btn ghost${m.skip ? "" : " hidden"}`} id="mSkip" type="button" onClick={menuSkip}>⏭ Skip this song</button>
        <button className={`btn ghost${m.change ? "" : " hidden"}`} id="mChange" type="button" onClick={menuChange}>🎵 Change music</button>
        <button className={`btn ghost${m.end ? "" : " hidden"}`} id="mEnd" type="button" onClick={menuEnd}>🏁 End game &amp; see results</button>
        <button className="btn ghost danger" id="mQuit" type="button" onClick={menuQuit}>{m.quit}</button>
        <button className={`btn ghost${m.close ? "" : " hidden"}`} id="mClose" type="button" onClick={menuClose}>Close menu</button>
      </div>
    </div>
  );
}

function ReelSheet() {
  const r = ui.reel;
  // start playing the reel as soon as it's ready
  useEffect(() => { if (r.open && !r.making && r.url) dom.reelVideo?.play().catch(() => {}); }, [r.open, r.making, r.url]);
  return (
    <div id="reelSheet" className={`sheet${r.open ? "" : " hidden"}`} role="dialog" aria-modal="true" aria-label="Highlight reel">
      <div className="sheet-card reel-card">
        <div id="reelMaking" className={`center-text${r.making ? "" : " hidden"}`}>
          <p className="kicker">Cutting your highlight reel 🎬</p>
          <p className="muted small">Keep this screen open, it takes about as long as the clips.</p>
          <div className="reel-bar"><i id="reelBar" style={{ transform: `scaleX(${r.progress})` }}></i></div>
        </div>
        <div id="reelReady" className={r.making ? "hidden" : ""}>
          <video id="reelVideo" ref={refReel} src={r.url || undefined} playsInline controls loop></video>
          <div className="row">
            <button className="btn hot" id="reelShare" type="button" onClick={shareReel}>📤 SHARE</button>
            <button className="btn ghost" id="reelSave" type="button" onClick={saveReel}>⬇ Save</button>
          </div>
        </div>
        <button className="btn ghost" id="reelClose" type="button" onClick={closeReel}>Close</button>
      </div>
    </div>
  );
}

export default function Game() {
  useGame();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    initMe();
    boot();
    initOnline();
    initAuth();
  }, []);

  return (
    <>
      <div className="bg" aria-hidden="true"></div>
      <canvas id="confetti" aria-hidden="true" ref={refConfetti}></canvas>
      {/* the music-cut moment: flash + STOP! */}
      <div id="cutFx" className="cut-fx" aria-hidden="true"><i className="flash"></i><b>STOP!</b></div>
      {/* YouTube player: positioned over whichever .tv-slot is on screen (moving an iframe would reload it) */}
      <div id="ytwrap" className="parked"><div id="yt"></div><span className="live-tag">LIVE</span></div>

      <main id="app">
        <Board />
        <Home />
        <Online />
        <Lobby />
        <Players />
        <Song />
        <Handoff />
        <Listen />
        <Turn />
        <Reveal />
        <End />
        <SignIn />
        <Profile />
        <Leaders />
      </main>

      <Menu />
      <ReelSheet />
      <div id="toast" className={`toast${ui.toast.show ? " show" : ""}`} role="status">{ui.toast.msg}</div>
    </>
  );
}
