# Pass The Mic 🎤

The sing-the-next-line party game, with an AI referee.

Pick any song, pass one phone around. The music plays with lyrics on screen, then **suddenly cuts out** and the lyrics vanish. Whoever's holding the phone has to carry on singing from memory. The AI listens and scores how close they got. Miss it, and you lose a life. The last one singing wins.

## How it works

- **Lyrics:** time-synced lyrics from [LRCLIB](https://lrclib.net) (free, no key)
- **Music:** the YouTube embed, matched to the lyrics by track length (`api/yt.js`, no API key)
- **Listening:** the browser's built-in speech recognition (Chrome / Safari)
- **Scoring (`match.js`):** speech-to-text on singing is noisy, so lyrics aren't matched exactly. Words are aligned in order with fuzzy, sound-alike matching (`dey`≈`they`, `chop`≈`shop`, `'cause`≈`because`), and filler words count half
- **Fairness:** you get lives, not instant elimination. When the score lands in the grey zone, **the room votes**. Each round the sections get longer and the pass mark goes up (55% → 75%)

## Run locally

```bash
node dev.mjs
```

Open http://localhost:5174. Mic access needs localhost or HTTPS.

## Deploy

Static files plus one Vercel serverless function (`api/yt.js`). Run `vercel --prod`.
