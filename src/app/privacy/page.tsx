import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "PRIVACY POLICY · Pass The Mic", description: "What Pass The Mic collects and why." };

export default function Page() {
  return (
    <>
      <div className="bg" aria-hidden="true"></div>
      <main className="doc">
      <Link className="back" href="/">← Pass The Mic</Link>
      <h1>PRIVACY POLICY</h1>
      <p className="small">Last updated October 10, 2026</p>
      <p>Pass The Mic is a sing-the-next-line party game. This page explains what we collect and why. Short version: only what the game needs, and we never sell anything.</p>
      <h3>Playing as a guest</h3>
      <p>You can play without an account. Player names you type stay on your device and in your game room. Nothing is stored on our servers about guests.</p>
      <h3>If you sign in with Google</h3>
      <ul>
      <li><b>From Google:</b> your name, email address and profile photo, used to create your account and profile. We only ask Google for basic profile information.</li>
      <li><b>Your profile:</b> display name, optional username, avatar choices and any photo you upload. Your name, username, photo and scores are shown publicly on leaderboards.</li>
      <li><b>Game results:</b> points, lines sung, wins and the music pack, used for your stats and the leaderboards.</li>
      </ul>
      <h3>Your voice</h3>
      <p>When it is your turn, the game records your singing so it can check the lyrics. The recording is sent to our speech-to-text provider (Groq, running OpenAI Whisper) or your browser&apos;s built-in speech recognition, only to turn it into text. <b>We do not store your recordings.</b> Online, the recognised words are shared live with the other players in your room.</p>
      <h3>Music and lyrics</h3>
      <p>Songs play through YouTube&apos;s embedded player, which is covered by <a href="https://policies.google.com/privacy" rel="noopener noreferrer">Google&apos;s privacy policy</a>. Lyrics come from LRCLIB.</p>
      <h3>Where data lives</h3>
      <p>Accounts, profiles, photos and results are stored with Supabase. The app is hosted on Vercel. On your device we keep small settings like lyric-sync adjustments and your name for online rooms.</p>
      <h3>Deleting your data</h3>
      <p>You can change or remove your photo and profile any time from your profile. To delete your account and all your results, contact us through the support email shown on the Google sign-in screen and we will remove it.</p>
      <h3>Children</h3>
      <p>Pass The Mic is not directed at children under 13, and we do not knowingly collect their personal information.</p>
      <h3>Changes</h3>
      <p>If this policy changes, we will update this page and the date above.</p>
      </main>
    </>
  );
}
