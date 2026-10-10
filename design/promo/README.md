# Promo video tools

Make a demo video of Pass The Mic with an original, copyright-free soundtrack.

```bash
# 1. run the app locally (from the project root)
node dev.mjs
# 2. one-time: install the headless-browser driver somewhere
mkdir -p /tmp/ptm-promo && (cd /tmp/ptm-promo && npm i puppeteer-core@22.15.0)
# 3. record the scripted demo (writes frames/, frames.ffconcat, marks.json)
PUPPETEER_FROM=/tmp/ptm-promo node record.mjs "$PWD/out"
# 4. compose a soundtrack synced to marks.json (audio.mjs = amapiano, audio2.mjs = Afro-house + sung hook)
node audio2.mjs "$PWD/out"
# 5. encode the vertical video (Twitter/Reels/TikTok)
cd out && ffmpeg -f concat -safe 0 -i frames.ffconcat -i soundtrack2.wav -vf "scale=1080:1920,fps=30,format=yuv420p" \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11" -c:v libx264 -crf 18 -c:a aac -b:a 192k -shortest -movflags +faststart demo.mp4
```

For the 4:5 LinkedIn layout, render `li-bg.html` / `mask.html` with `shots.mjs`, then overlay the frames
at (220,120) at 640x1138 with the mask (see git history for the exact ffmpeg command).
Uses Chrome at /Applications/Google Chrome.app and ffmpeg. Nothing here is deployed (design/ is in .vercelignore).
