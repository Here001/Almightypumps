# Almighty Pumps video maker

Makes short 3D ad videos from a small text script. It uses the website's logo, colours (#0E1016 dark,
#FF5A1F orange, #F4F2EE off-white) and fonts (Geist, plus Space Grotesk for the wordmark).

Each video is drawn in real 3D with three.js: a chrome, gold or hologram AP logo, particle effects, a
phone playing real app recordings, holograms, infographic rings and 13 different backgrounds ("worlds").
Glow, film grain, glitch cuts and synthesised sound effects are added on top. Each script renders as:

| Format | Size | Where it goes |
| --- | --- | --- |
| `9x16` | 1080 × 1920 | TikTok, Reels, Shorts, WhatsApp Status, Stories |
| `1x1` | 1080 × 1080 | Instagram/Facebook feed, X |
| `16x9` | 1920 × 1080 | YouTube, website, Google ads |

This folder is separate from the website, and nothing here is deployed. `ads/` holds 30 ready ad scripts.

## Make videos

You need Node 18+ and ffmpeg (`brew install ffmpeg` on Mac, `winget install ffmpeg` on Windows). Run this once:

```
cd marketing/video
npm install
npx playwright install chromium
```

Then:

```
node render.mjs ads/01-brand.json                    # all three sizes → out/01-brand-9x16.mp4 etc.
node render.mjs ads/09-escrow-chrome.json --formats 9x16
node render.mjs --all --formats 9x16                 # every script in ads/
node render.mjs ads/01-brand.json --still 2,6.5      # PNGs of those seconds (quick look while editing)
node render.mjs ads/01-brand.json --music song.mp3   # your music under the sound effects
node render.mjs ads/01-brand.json --fps 60 --scale 2 # smoother / sharper (much slower)
```

Videos are saved to `out/`, which is not kept in git. On a laptop with a graphics card a 15-second video
takes a minute or two per size. On a computer without one (software rendering) it takes about 0.7 seconds
per frame, so roughly 5 to 6 minutes per size.

Sound is made by `audio.mjs` from scratch (pad, beat, whooshes, hits, risers), so no licences are needed.
If you add `--music`, only use music you have the rights to.

**App recordings.** Phone scenes play screen recordings of the app. Put the `.mp4` files in `footage/`, or
point at another folder with `--footage <folder>`. If a file is missing, the phone shows a blank screen.

## Write a new ad

Copy a file in `ads/`, change the words and render it. A script has a `world` (background), a `palette`
(two colours), a `transition` (`glitch`, `flash`, `fade` or `whip`) and a list of `scenes`. Any scene can
set its own `world`, `palette` and `transition`. Put `*stars*` around words to make them orange.

| type | what it shows | fields |
| --- | --- | --- |
| `hook` | big words slamming in (first 2 seconds) | `lines` |
| `logo` | particles that lock into the 3D logo, plus the wordmark | `tagline`, `finish` (chrome, gold, holo, dark) |
| `headline` | big lines with a mask reveal | `kicker`, `lines`, `sub`, `logo` (finish behind) |
| `phone` | 3D phone playing an app recording, with callouts | `clip`, `from`, `rate`, `title`, `kicker`, `callouts`, `holo` |
| `carousel` | 3D cards turning past | `title`, `kicker`, `items` (each `title` + `text`) |
| `stats` | rings that fill while numbers count up | `title`, `kicker`, `items` (`value`, `label`, `prefix`, `suffix`, `ring` 0–1, `static`) |
| `hologram` | hologram logo on a projector, scan lines | `lines`, `kicker`, `sub` |
| `steps` | numbered steps joined by a glowing line | `title`, `kicker`, `steps` (3) |
| `cta` | logo lands with a shockwave, button and web address | `title`, `button`, `url`, `finish` |

Worlds: `nebula`, `grid`, `chrome`, `city`, `aurora`, `warp`, `holoroom`, `waves`, `gold`, `tunnel`,
`cubes`, `silk`, `datarain`.

Keep lines short: about 20 characters per big line reads well on a phone. In 9:16 the top 13% and bottom 21%
are left empty because TikTok and Reels put buttons and captions there.

Keep the claims true (no invented prices, customer numbers or reviews), the same rule as the website.

## Cartoon ads: Kung Fu Kunle

Scripts with `"player": "toon"` use a separate 2D cartoon player in `player-toon/` (no 3D, so it renders much
faster). Its star is Kunle, an original Nigerian kung fu character drawn in code (`kunle.js`: a small bone rig with
named poses such as guard, chop, kick, punch, palm, crane, fly, salute and thumb). There are 22 cartoon backgrounds:
`rock`, `rooftop`, `dojo`, `street`, `market`, `brand` (`worlds.js`) and `temple`, `forest`, `bamboo`, `waterfall`,
`beach`, `village`, `desert`, `bridge`, `neon`, `rain`, `airport`, `snow`, `cave`, `stadium`, `clouds`, `lagoon`
(`worlds2.js`). Extra props are in `props2.js`. `ads/31-kunle-heroes.json` is the long one; `ads/40-…` to `ads/59-…`
are a series of short ones, one background each.

| type | what happens | fields |
| --- | --- | --- |
| `intro` | Kunle arrives, title pops | `entry` (fly, drop, slide), `kicker`, `lines`, `caption` |
| `breaker` | he breaks a problem, the product appears | `attack` (chop, kick, punches, flykick, palm), `obstacle` (blob or crate; the default depends on the attack), `label`, `burst`, `reveal` (esim, giftcard, airtime, phonecheck, travel, sms, package, wallet, seller, chat, docs), `title`, `title2`, `badge`, `chips`, `caption` |
| `scroll` | he opens a training scroll with numbered steps | `title`, `heading`, `steps`, `caption` |
| `escrow` | money goes into a shield, he seals it | `title`, `title2`, `steps`, `burst`, `caption` |
| `outro` | logo slam, salute, button, web address and contacts | `title`, `button`, `url`, `contacts` ([{icon: mail or chat, text}]) |

Every scene also takes `world` and `duration`. `caption` is the English subtitle of the voiceover; `pidgin` (and
`vo` on the outro) are only kept for the voiceover script and are not drawn.

## How it works

`player/` is a web page that draws one frame for any moment in time (`window.seek(seconds)`):
`core.js` (renderer and effects), `worlds.js` (backgrounds), `props.js` (logo, phone, cards, rings),
`scenes.js` (scene types), `main.js` (timeline, transitions) and `overlay.css` (text). `render.mjs` serves
the folder locally, opens the page in headless Chromium at each size, steps through the video frame by
frame, and pipes the pictures and the sound into ffmpeg (H.264 MP4, ready for every social app).
