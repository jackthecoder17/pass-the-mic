# Pass The Mic 🎤

The sing-the-next-line party game, with an AI referee.

Pick any song, pass one phone around. The music plays with lyrics on screen, then **suddenly cuts out** and the lyrics vanish. Whoever's holding the phone has to carry on singing from memory. The AI listens and scores how close they got. Miss it, and you lose a life. The last one singing wins.

## Play online

Tap **🌍 Play online with friends**, create a room and share the 4-letter code or invite link. Everyone plays on their own phone:

- the **host's phone runs the game**: it picks the music, chooses who sings, keeps score and runs votes
- every phone **plays the music itself** and cuts out at the same lyric line
- the singer's phone listens; everyone else sees their words light up live
- close calls: everyone votes on their own phone, majority wins (ties go to the singer)
- dropped connection? You keep your lives and jump back in when you reconnect

Rooms use Supabase Realtime (broadcast + presence) in `src/lib/net.ts`; there are no database tables.

## Any song

Search YouTube Music's whole catalog (`/api/search`). Tap ▶ Play to play one song now, or + Add to build the room's own playlist. Each pick is checked for time-synced lyrics as it's added, so you know right away whether it's playable.

## Song packs

Pick a vibe: 🎲 Mix Everything, live charts (🔥 Nigeria, 🌍 Worldwide, 🇬🇭 Ghana), plus curated packs: Naija Anthems, Naija Throwbacks, Amapiano & Street, Gospel & Worship, Pop, R&B & Love Songs, Hip-Hop, Rock & Classics, 2000s Party and Movie & Disney. Each song lasts one round (everyone sings once), then the next song starts automatically.

Curated packs live in `scripts/songs.mjs`. After editing, run `npm run packs`: it keeps only songs that have synced lyrics **and** an official track whose length matches, then writes `public/packs.json`.

## How it works

- **Lyrics:** time-synced lyrics from [LRCLIB](https://lrclib.net) (free, no key)
- **Music:** the official album track from YouTube Music, played through the YouTube embed. Lyrics are matched to its exact length so the timing lines up (`src/lib/youtube.ts`, `src/lib/resolve.ts`, no API key)
- **Live charts:** Apple Music's public Top 50 feed per country (`/api/chart`)
- **Listening:** Whisper on Groq (`/api/transcribe`, needs `GROQ_API_KEY`), with the browser's own speech recognition for instant live words
- **Scoring (`src/lib/match.ts`):** strict about which words were sung, forgiving about spelling. Words are aligned in order; only exact matches, near-identical spellings and known Pidgin sound-alikes (`dey`≈`they`, `na`≈`now`) count, and filler words count half
- **Fairness:** you get lives, not instant elimination. When the score lands in the grey zone, **the room votes**. Each round the sections get longer and the pass mark goes up (65% → 80%)

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (auth, database, realtime) · Groq Whisper · YouTube IFrame API · Web Audio · Canvas + MediaRecorder (highlight reels) · installable PWA

The game engine lives in `src/game/` (state, game flow, online rooms, accounts, speech, reel); screens are React components in `src/components/`; the API routes are in `src/app/api/`.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5174. Mic access needs localhost or HTTPS. For AI scoring, put `GROQ_API_KEY` in `.env.local` (or run `vercel env pull .env.local`).

## Deploy

Vercel (`vercel.json` pins the Next.js framework). `GROQ_API_KEY` is set in the project's environment variables.
