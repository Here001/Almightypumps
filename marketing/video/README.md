# Almighty Pumps video maker

Makes short branded ad videos from a small text script. Same logo, colours (#0E1016 dark, #FF5A1F orange,
#F4F2EE off-white) and fonts (Geist, Space Grotesk wordmark) as the website. Each script renders as:

| Format | Size | Where it goes |
| --- | --- | --- |
| `9x16` | 1080 × 1920 | TikTok, Reels, Shorts, WhatsApp Status, Stories |
| `1x1` | 1080 × 1080 | Instagram/Facebook feed, X |
| `16x9` | 1920 × 1080 | YouTube, website, Google ads |

This folder is separate from the website: nothing here is deployed.

## Make videos

You need Node 18+ and ffmpeg (`brew install ffmpeg` on Mac, `winget install ffmpeg` on Windows). Once:

```
cd marketing/video
npm install
npx playwright install chromium
```

Then:

```
node render.mjs ads/brand.json                  # all three sizes → out/brand-9x16.mp4 etc.
node render.mjs ads/boost.json --formats 9x16   # one size
node render.mjs --all                           # every script in ads/
node render.mjs ads/brand.json --still 6        # a PNG of second 6 (quick look while editing)
node render.mjs ads/brand.json --music song.mp3 # add music (fades in and out)
```

Videos land in `marketing/video/out/` (not saved in git). A 20-second video takes about 40 seconds per size.
Without `--music` the video gets a silent sound track, because some apps refuse videos with no audio.
Only use music you have the rights to (TikTok/Instagram's own sound library is the safest: add it in the app).

## Write a new ad

Copy a file in `ads/`, change the words, render. A script is a list of scenes; each has a `type` and a
`duration` in seconds. Put `*stars*` around words to make them orange.

| type | fields |
| --- | --- |
| `logo` | `tagline` |
| `headline` | `kicker` (small orange line above), `lines` (1–3 big lines), `sub` (small text under) |
| `list` | `title`, `items` (each `title` + optional `text`; up to 5 fits every size) |
| `steps` | `title`, `steps` (3 short steps) |
| `cta` | `title`, `button`, `url` |

Keep lines short: about 20 characters per big line reads well on a phone. In 9:16 the top 13% and bottom 22%
are kept empty because TikTok/Reels put buttons and captions there.

Keep the claims true (no invented prices, customer numbers or reviews), the same rule as the website.

## How it works

`player/player.html` + `player/style.css` + `player/engine.js` draw one frame for any moment in time
(`window.seek(seconds)`); `render.mjs` opens that page in headless Chromium at each size, steps through the
video 30 frames a second, and pipes the pictures into ffmpeg (H.264 MP4, ready for every social app).
New scene types go in `SCENES` in `engine.js`. Fonts are bundled in `fonts/` (SIL Open Font License).
