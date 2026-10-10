// Dev-only responsiveness audit: fills every screen with worst-case content and reports anything
// that spills past the viewport. Run in the console: await (await import('/design/audit.js')).audit()
export async function audit(only) {
  const $ = (s) => document.querySelector(s);
  const LONG = 'Oluwaseunfunmi'; // names are capped at 14 characters in the game
  const av = (c, f, size = 'sm') => `<span class="av ${size} c${c}">${f}</span>`;
  const words = 'Everybody go chop breakfast because I dey win by default supercalifragilistic'.split(' ');
  const board = `<div class="board-top"><div class="songname">🎵 TSHWALA BAM (REMIX) (FEAT. S.N.E) · TITOM, BURNA BOY &amp; YUPPE</div><button class="menu-btn">☰ Menu</button></div><div class="pl">${['John', 'Oluwaseunfunmi', 'Ada', 'Tunde', 'Chiamaka', 'Kemi', 'Babatunde'].map((n, i) => `<span class="pc ${i === 1 ? 'cur' : ''}">${av(i % 6 + 1, '😎')}<b>${n}</b><span class="hearts">❤️❤️❤️</span></span>`).join('')}</div>`;
  const fill = {
    lobby() { $('#roomCode').textContent = 'BZ7U'; $('#lobbyList').innerHTML = ['John', 'Oluwaseunfunmi Adebayo', 'Ada', 'Tunde', 'Chiamaka Okafor'].map((n, i) => `<li>${av(i % 6 + 1, '😎', 'lg ready')}${n}<span class="tag">ready</span></li>`).join('') + '<li class="empty"><span class="av lg">＋</span><span class="tag">invite</span></li>'; },
    players() { $('#plist').innerHTML = ['John', 'Oluwaseunfunmi', 'Ada', 'Tunde', 'Chiamaka', 'Kemi'].map((n, i) => `<li>${av(i % 6 + 1, '😎', 'lg')}${n}<button class="rm">✕</button></li>`).join(''); $('#addMe').classList.remove('hidden'); $('#addMe').textContent = '+ Add me (' + LONG + ')'; },
    song() { $('#tray').classList.remove('hidden'); $('#trayCount').textContent = '🎶 Your playlist · 7 songs'; $('#trayList').innerHTML = ['Tshwala Bam (Remix) (feat. S.N.E)', 'Last Last', 'Calm Down'].map((t) => `<span class="tchip">${t}<button>✕</button></span>`).join(''); },
    handoff() { $('#roundInfo').textContent = 'Round 12 · pass mark 75%'; $('#handSong').textContent = '🎵 Next song: Tshwala Bam (Remix) (feat. S.N.E) · TitoM, Burna Boy & Yuppe'; $('#handAv').innerHTML = av(2, '🤩', 'xl'); $('#handName').textContent = LONG; $('#handCount').classList.remove('hidden'); $('#handCount').textContent = 'Starting in 3…'; },
    listen() { $('#npTitle').textContent = 'Tshwala Bam (Remix) (feat. S.N.E)'; $('#npArtist').textContent = 'TitoM, Burna Boy & Yuppe · Amapiano & Street'; $('#kara .prev').textContent = 'Shayo oh, igbo-oh, shayo oh, igbo-oh, shayo oh'; $('#kara .cur').textContent = 'Supercalifragilisticexpialidocious everybody go chop breakfast tonight'; $('#kara .next').textContent = '🎤 · · ·'; $('#listenName').textContent = LONG.toUpperCase(); $('#upAv').innerHTML = av(2, '🤩'); },
    turn() { $('#turnAv').innerHTML = av(2, '🤩', 'xl'); $('#turnName').textContent = LONG + ' · your turn in'; $('#goTxt').textContent = 'SING!'; $('#cue').textContent = '“…Shayo oh, igbo-oh, shayo oh, igbo-oh, nothing to discuss”'; $('#chips').innerHTML = words.map((w) => `<span class="w ok" style="--len:${w.length}"><b>${w}</b></span>`).join(''); $('#heard').textContent = '👂 “everybody go chop breakfast because I day win by the fault”'; },
    reveal() { $('#revWho').textContent = LONG + ' · Round 12'; $('#scoreNum').textContent = '100%'; $('#stamp').className = 'stamp fail'; $('#stamp').style.animation = 'none'; $('#stamp').textContent = 'OUT'; $('#verdict').className = 'verdict fail'; $('#verdict').textContent = (LONG + ' IS OUT 💀').toUpperCase(); $('#revChips').innerHTML = words.map((w, i) => `<span class="w ${i % 3 ? 'ok' : 'miss'}" style="--len:${w.length}"><b>${w}</b></span>`).join(''); $('#revHeard').textContent = 'AI heard: “everybody go chop breakfast because I day win by the fault and many more words here”'; $('#contBtn').classList.remove('hidden'); $('#contBtn').textContent = 'NEXT: OLUWASEUNFUNMI ADEBAYO →  4'; $('#holdBtn').classList.remove('hidden'); $('#standings').innerHTML = [LONG, 'John', 'Ada'].map((n, i) => `<div class="st ${i ? '' : 'me'}">${av(i + 1, '😎')}<span class="nm">${n}</span>${i ? '' : '<span class="delta">+100</span>'}<span class="hearts">❤️❤️❤️❤️❤️</span><span class="pts">1240</span></div>`).join(''); $('#voteBox').classList.remove('hidden'); },
    end() { $('#endKicker').textContent = 'Mix Everything finished'; $('#endAv').innerHTML = '<span class="crown">👑</span>' + av(3, '🥳', 'xl'); $('#endTitle').textContent = LONG + ' wins!'; $('#rank').innerHTML = [LONG, 'John', 'Ada', 'Tunde'].map((n, i) => `<li><span class="pos">${i + 1}</span>${av(i + 1, '😎')}<span class="nm">${n}</span><span class="stt">❤️❤️❤️❤️❤️<br>12 lines · 1240 pts</span></li>`).join(''); $('#savedNote').textContent = '✓ Saved to your profile · +1240 points on the leaderboard'; ['#nextSong', '#again', '#endGame', '#newPlayers', '#endLeaders', '#endHome'].forEach((i) => $(i).classList.remove('hidden')); },
    profile() { $('#profAv').innerHTML = '<span class="av c2">🤩</span>'; $('#profStats').innerHTML = ['Games', 'Wins', 'Points', 'Lines'].map((l, i) => `<div><b>${[128, 57, '18,240', 913][i]}</b><span>${l}</span></div>`).join(''); $('#profName').value = LONG; $('#faces').innerHTML = ['😎', '🤩', '🥳', '😜', '🤠', '😏', '🥸', '🤓', '😇', '🤪', '😺', '🦁'].map((f) => `<button>${f}</button>`).join(''); $('#swatches').innerHTML = [1, 2, 3, 4, 5, 6].map((c) => `<button class="c${c}"></button>`).join(''); },
    leaders() { $('#leaders').innerHTML = [LONG, 'John Opeyemi', 'Ada', 'Tunde Bakare-Ogunleye'].map((n, i) => `<li><span class="pos">${i + 1}</span>${av(i + 1, '😎')}<span class="who2"><b>${n}</b><small>@${n.toLowerCase().replace(/[^a-z]/g, '_').slice(0, 20)} · 57 wins · 128 games</small></span><span class="pts">18240</span></li>`).join(''); $('#leadersSignin').classList.remove('hidden'); },
  };
  if (only) { // just stage one screen for a screenshot
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 's-' + only));
    const g = ['handoff', 'listen', 'turn', 'reveal'].includes(only);
    $('#board').classList.toggle('hidden', !g);
    if (g) $('#board').innerHTML = board;
    fill[only]?.();
    scrollTo(0, 0);
    await new Promise((r) => requestAnimationFrame(r));
    dispatchEvent(new Event('resize'));
    return only;
  }
  const W = document.documentElement.clientWidth, out = {};
  const offenders = (root) => [...root.querySelectorAll('*')].filter((e) => {
    if (e.closest('.pl') || e.closest('.tray-list') || e.closest('.logo-disc')) return false; // scrollers by design; spinning disc's rotated box
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.right > W + 0.5 || r.left < -0.5);
  }).map((e) => { const r = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} [${Math.round(r.left)}–${Math.round(r.right)}]`; });
  for (const id of ['home', 'online', 'lobby', 'players', 'song', 'handoff', 'listen', 'turn', 'reveal', 'end', 'signin', 'profile', 'leaders']) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 's-' + id));
    const inGame = ['handoff', 'listen', 'turn', 'reveal'].includes(id);
    $('#board').classList.toggle('hidden', !inGame);
    if (inGame) $('#board').innerHTML = board;
    fill[id]?.();
    await new Promise((r) => requestAnimationFrame(r));
    dispatchEvent(new Event('resize'));
    await new Promise((r) => setTimeout(r, 700));
    const bad = [...new Set([...offenders($('#s-' + id)), ...(inGame ? offenders($('#board')) : [])])];
    if (bad.length) out[id] = bad.slice(0, 6);
  }
  $('#menu').classList.remove('hidden');
  await new Promise((r) => setTimeout(r, 300));
  const m = offenders($('#menu'));
  if (m.length) out.menu = m.slice(0, 3);
  $('#menu').classList.add('hidden');
  return { W, ok: !Object.keys(out).length, problems: out };
}
