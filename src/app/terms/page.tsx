import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "TERMS OF SERVICE · Pass The Mic", description: "The terms for playing Pass The Mic." };

export default function Page() {
  return (
    <>
      <div className="bg" aria-hidden="true"></div>
      <main className="doc">
      <Link className="back" href="/">← Pass The Mic</Link>
      <h1>TERMS OF SERVICE</h1>
      <p className="small">Last updated October 10, 2026</p>
      <p>By playing Pass The Mic you agree to these terms. They are short because the game is simple.</p>
      <h3>Play nice</h3>
      <ul>
      <li>Use a name, username and photo that are not offensive, impersonating, or someone else&apos;s without permission.</li>
      <li>Do not try to cheat the leaderboards, overload the service, or interfere with other players&apos; games.</li>
      <li>We may remove content or accounts that break these rules.</li>
      </ul>
      <h3>Music and lyrics</h3>
      <p>Songs are played through YouTube&apos;s embedded player and remain the property of their owners. Lyrics come from LRCLIB. Pass The Mic does not host or sell music.</p>
      <h3>Scoring</h3>
      <p>Singing is scored automatically by speech recognition, which can make mistakes. Close calls go to a room vote. Scores and rankings are for fun, with no prizes or guarantees.</p>
      <h3>The service</h3>
      <p>Pass The Mic is provided as is, without warranties. Features may change or stop, and we are not liable for any loss from using the game.</p>
      <h3>Privacy</h3>
      <p>See our <Link href="/privacy">Privacy Policy</Link> for what we collect and why.</p>
      <h3>Changes</h3>
      <p>We may update these terms. Continuing to play after an update means you accept the new terms.</p>
      </main>
    </>
  );
}
