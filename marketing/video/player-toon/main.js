// Cartoon ad player: Kung Fu Kunle. Draws any moment of an ad on a 2D canvas with window.seek(seconds).
// Scene types: intro, breaker (chop | kick | punches → esim | giftcard | airtime), escrow, outro.
import { drawKunle, poseAt, footDrop, POSES, ease, INK, COL } from "./kunle.js";
import { WORLDS, rnd, halftone, apMark } from "./worlds.js";

const cv = document.getElementById("c");
const out = cv.getContext("2d");
const buf = document.createElement("canvas");
const g = buf.getContext("2d"); // everything is drawn here, then copied to the screen (with camera shake)
let W, H, L, timeline = [], total = 0;
const CREAM = "#F4F2EE", ORANGE = "#FF5A1F";
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const D = Math.PI / 180;

const LAYOUT = {
  "9x16": (W, H) => ({ gy: H * 0.7, k: 1.0, cx: W * 0.28, px: W * 0.73, py: H * 0.475, tx: W / 2, ty: H * 0.15, ts: 100, tw: W * 0.88, capY: H * 0.748, cs: 40, ps: 1 }),
  "1x1": (W, H) => ({ gy: H * 0.82, k: 0.62, cx: W * 0.24, px: W * 0.72, py: H * 0.52, tx: W / 2, ty: H * 0.06, ts: 70, tw: W * 0.9, capY: H * 0.91, cs: 32, ps: 0.66 }),
  "16x9": (W, H) => ({ gy: H * 0.82, k: 0.64, cx: W * 0.3, px: W * 0.68, py: H * 0.5, tx: W / 2, ty: H * 0.06, ts: 74, tw: W * 0.8, capY: H * 0.91, cs: 32, ps: 0.7 }),
};

// ---------- text ----------
function parts(str) { return String(str).split("*").map((s, i) => ({ s, hot: i % 2 === 1 })).filter((p) => p.s); }
function wordsOf(line) { const out = []; for (const p of parts(line)) for (const w of p.s.split(/(\s+)/)) if (w.trim()) out.push({ w, hot: p.hot }); return out; }
function fit(lines, size, maxW, font) {
  let s = size;
  for (;;) { g.font = font(s); const widest = Math.max(...lines.map((l) => g.measureText(l.replace(/\*/g, "")).width)); if (widest <= maxW || s < 24) return s; s -= 4; }
}
/** Big comic title: thick ink outline, hard shadow, words pop in one by one. */
function title(lines, x, y, size, t, opts = {}) {
  if (t < 0) return 0;
  const font = (s) => `700 ${s}px 'Space Grotesk'`;
  // capitals for the comic look, except brand-style words like "eSIM"
  const up = lines.map((l) => (opts.upper === false ? l : l.split(" ").map((w) => (/^\*?[a-z]+[A-Z]/.test(w) ? w : w.toUpperCase())).join(" ")));
  const s = fit(up, size, L.tw, font);
  const out = opts.out ?? 99;
  let wi = 0;
  up.forEach((line, li) => {
    g.font = font(s);
    const ws = wordsOf(line), space = s * 0.32;
    const widths = ws.map((w) => g.measureText(w.w).width);
    let cx = x - (widths.reduce((a, b) => a + b, 0) + space * (ws.length - 1)) / 2;
    const ly = y + li * s * 1.02 + s * 0.8;
    ws.forEach((w, i) => {
      const at = (opts.delay || 0) + wi++ * 0.07, p = prog(t, at, at + 0.32), q = prog(t, out, out + 0.2);
      if (p > 0 && q < 1) {
        const sc = ease.back(p) * (1 - q), mx = cx + widths[i] / 2;
        g.save(); g.translate(mx, ly - s * 0.35); g.rotate((1 - p) * -0.25 + (li % 2 ? 0.015 : -0.015)); g.scale(sc, sc); g.translate(-mx, -(ly - s * 0.35));
        g.lineJoin = "round"; g.font = font(s);
        g.fillStyle = INK; g.fillText(w.w, cx + s * 0.06, ly + s * 0.08);
        g.lineWidth = s * 0.2; g.strokeStyle = INK; g.strokeText(w.w, cx, ly);
        g.fillStyle = w.hot ? ORANGE : CREAM; g.fillText(w.w, cx, ly);
        g.restore();
      }
      cx += widths[i] + space;
    });
  });
  return up.length * s * 1.02;
}
function small(text, x, y, size, t, col = CREAM, out = 99) {
  const p = prog(t, 0, 0.3), q = prog(t, out, out + 0.2); if (p <= 0 || q >= 1) return;
  g.save(); g.globalAlpha = p * (1 - q); g.font = `600 ${size}px Geist`; g.textAlign = "center";
  g.lineJoin = "round"; g.lineWidth = size * 0.28; g.strokeStyle = INK; g.strokeText(text, x, y + (1 - ease.out(p)) * 20);
  g.fillStyle = col; g.fillText(text, x, y + (1 - ease.out(p)) * 20); g.restore();
}
/** Subtitle box (English captions of the voiceover). */
function caption(text, t, dur) {
  if (!text) return;
  const p = prog(t, 0, 0.25), q = prog(t, dur - 0.15, dur); if (p <= 0) return;
  const size = L.cs; g.font = `600 ${size}px Geist`;
  const words = text.split(" "), lines = [""], maxW = W * 0.82;
  for (const w of words) { const tryL = lines[lines.length - 1] ? lines[lines.length - 1] + " " + w : w; if (g.measureText(tryL).width > maxW) lines.push(w); else lines[lines.length - 1] = tryL; }
  const lh = size * 1.3, bw = Math.max(...lines.map((l) => g.measureText(l).width)) + size * 1.4, bh = lines.length * lh + size * 0.7;
  const y = L.capY - bh / 2 + (1 - ease.out(p)) * 16;
  g.save(); g.globalAlpha = p * (1 - q);
  g.fillStyle = "rgba(14,16,22,.86)"; g.beginPath(); g.roundRect(W / 2 - bw / 2, y, bw, bh, size * 0.5); g.fill();
  g.fillStyle = CREAM; g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, W / 2, y + size * 0.35 + lh * (i + 0.5)));
  g.restore();
}

// ---------- effects ----------
function burst(x, y, r, t, text, col = ORANGE) {
  const p = prog(t, 0, 0.22), q = prog(t, 0.55, 0.8); if (p <= 0 || q >= 1) return;
  const s = ease.back(p) * (1 - q * 0.3);
  g.save(); g.translate(x, y); g.scale(s, s); g.rotate(-0.12); g.globalAlpha = 1 - q;
  const star = (R, n = 14) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? R * 0.62 : R * (0.95 + ((i * 37) % 7) / 40); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); } g.closePath(); };
  star(r * 1.12); g.fillStyle = INK; g.fill();
  star(r); g.fillStyle = "#FFC83A"; g.fill();
  star(r * 0.78); g.fillStyle = col; g.fill();
  if (text) { g.font = `700 ${r * 0.48}px 'Space Grotesk'`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = r * 0.1; g.lineJoin = "round"; g.strokeStyle = INK; g.strokeText(text, 0, 0); g.fillStyle = CREAM; g.fillText(text, 0, 0); }
  g.restore();
}
function speedLines(x, y, t, seed, n = 26, len = 1) {
  const p = prog(t, 0, 0.35); if (p <= 0 || p >= 1) return;
  const r = rnd(seed + Math.floor(t * 30));
  g.save(); g.strokeStyle = `rgba(244,242,238,${0.7 * (1 - p)})`; g.lineCap = "round";
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, r0 = (140 + r() * 120) * L.k * (1 + p), r1 = r0 + (160 + r() * 260) * L.k * len; g.lineWidth = 3 + r() * 6; g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.stroke(); }
  g.restore();
}
function dust(x, y, t, seed, n = 9, spread = 1) {
  const p = prog(t, 0, 0.7); if (p <= 0 || p >= 1) return;
  const r = rnd(seed);
  for (let i = 0; i < n; i++) {
    const dir = i % 2 ? 1 : -1, sp = (60 + r() * 220) * spread * L.k, rad = (24 + r() * 30) * L.k * (0.6 + p);
    g.fillStyle = `rgba(240,228,210,${0.75 * (1 - p)})`; g.strokeStyle = `rgba(20,14,12,${0.6 * (1 - p)})`; g.lineWidth = 4;
    g.beginPath(); g.arc(x + dir * sp * ease.out(p), y - (10 + r() * 40) * L.k * p, rad, 0, 7); g.fill(); g.stroke();
  }
}
function confetti(x, y, t, seed, n = 40) {
  const p = prog(t, 0, 1.6); if (p <= 0 || p >= 1) return;
  const r = rnd(seed), cols = [ORANGE, "#FFC83A", "#13A3A0", CREAM, "#C2406A"];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6, v = (500 + r() * 700) * L.k, tt = p * 1.6;
    const px = x + Math.cos(a) * v * tt * 0.6, py = y + Math.sin(a) * v * tt * 0.6 + 900 * L.k * tt * tt * 0.5;
    g.save(); g.translate(px, py); g.rotate(tt * (6 + r() * 10)); g.globalAlpha = 1 - p * p; g.fillStyle = cols[i % cols.length]; g.fillRect(-9 * L.k, -5 * L.k, 18 * L.k, 10 * L.k); g.restore();
  }
}
function sparkle(x, y, s, t) {
  const tw = 0.6 + 0.4 * Math.sin(t * 9 + x);
  g.save(); g.translate(x, y); g.scale(s * tw, s * tw); g.fillStyle = "#FFE08A"; g.strokeStyle = INK; g.lineWidth = 3;
  g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? 6 : 22; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke(); g.restore();
}
function shakeFrom(hits, t, amp = 22) { let s = 0; for (const h of hits) if (t >= h) s += Math.exp(-(t - h) * 9) * amp; return s * L.k; }

// ---------- props ----------
function inked(fill, path, w = 6) { g.beginPath(); path(); g.fillStyle = fill; g.fill(); g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke(); }
function board(x, y, w, h, label, ang = 0, half = 0) {
  // half: 0 whole, -1 left piece, 1 right piece
  g.save(); g.translate(x, y); g.rotate(ang);
  const x0 = half > 0 ? 0 : -w / 2, x1 = half < 0 ? 0 : w / 2;
  const jag = () => { for (let i = 0; i <= 6; i++) g.lineTo((i % 2 ? 10 : -10) * L.k, -h / 2 + (h * i) / 6); };
  g.beginPath(); g.moveTo(x0, -h / 2);
  if (half > 0) { g.lineTo(x1, -h / 2); g.lineTo(x1, h / 2); g.lineTo(0, h / 2); g.lineTo(0, -h / 2); g.closePath(); } else if (half < 0) { g.lineTo(x0, h / 2); g.lineTo(0, h / 2); g.lineTo(0, -h / 2); g.closePath(); } else g.rect(-w / 2, -h / 2, w, h);
  g.fillStyle = "#D49556"; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
  g.save(); g.clip(); g.strokeStyle = "rgba(110,60,25,.45)"; g.lineWidth = 3;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(-w / 2, -h / 2 + (h * i) / 4); g.bezierCurveTo(-w / 6, -h / 2 + (h * i) / 4 - 8, w / 6, -h / 2 + (h * i) / 4 + 8, w / 2, -h / 2 + (h * i) / 4); g.stroke(); }
  if (label) { const fs = Math.min(h * 0.42, (w * 0.9) / (label.length * 0.62)); g.font = `700 ${fs}px 'Space Grotesk'`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#3A1A0A"; g.fillText(label.toUpperCase(), 0, 2); }
  g.restore(); g.restore();
}
function blocks(x, y, s) { for (const dx of [-1, 1]) inked("#8D8A96", () => g.rect(x + dx * 150 * s - 40 * s, y - 90 * s, 80 * s, 90 * s)); }
function giftbox(x, y, s, ang, open = 0) {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
  inked("#13A3A0", () => g.rect(-70, -40, 140, 110));
  g.fillStyle = "#FFC83A"; g.fillRect(-12, -40, 24, 110);
  g.save(); g.translate(0, -40 - open * 60); g.rotate(-open * 0.8);
  inked("#0F8C8A", () => g.rect(-80, -30, 160, 34)); g.fillStyle = "#FFC83A"; g.fillRect(-12, -30, 24, 34);
  inked("#FFC83A", () => { g.ellipse(-26, -44, 26, 16, -0.4, 0, 7); g.moveTo(52, -44); g.ellipse(26, -44, 26, 16, 0.4, 0, 7); }, 5);
  g.restore(); g.restore();
}
function qr(x, y, s, seed) {
  const n = 21, c = s / n, r = rnd(seed);
  g.fillStyle = "#fff"; g.fillRect(x - c, y - c, s + 2 * c, s + 2 * c); g.fillStyle = "#111";
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const f = (a, b) => i >= a && i < a + 7 && j >= b && j < b + 7;
    if (f(0, 0) || f(14, 0) || f(0, 14)) { const a = i < 7 ? i : i - 14, b = j < 7 ? j : j - 14; const ring = Math.max(Math.abs(a - 3), Math.abs(b - 3)); if (ring !== 2) g.fillRect(x + i * c, y + j * c, c + 0.5, c + 0.5); continue; }
    if (r() > 0.52) g.fillRect(x + i * c, y + j * c, c + 0.5, c + 0.5);
  }
  g.fillStyle = "#0E1016"; g.fillRect(x + s / 2 - s * 0.14, y + s / 2 - s * 0.14, s * 0.28, s * 0.28); apMark(g, x + s / 2, y + s / 2, s * 0.24);
}
function phone(x, y, s, t, ready) {
  const w = 280 * s, h = 540 * s;
  g.save(); g.translate(x, y); g.rotate(Math.sin(t * 2) * 0.03);
  inked("#1A1B24", () => g.roundRect(-w / 2, -h / 2, w, h, 40 * s), 7);
  g.fillStyle = "#0E1016"; g.beginPath(); g.roundRect(-w / 2 + 14 * s, -h / 2 + 14 * s, w - 28 * s, h - 28 * s, 30 * s); g.fill();
  g.fillStyle = "#000"; g.beginPath(); g.roundRect(-30 * s, -h / 2 + 24 * s, 60 * s, 14 * s, 7 * s); g.fill();
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `600 ${22 * s}px Geist`; g.fillStyle = "#9AA0AE"; g.fillText("US phone line", 0, -h / 2 + 76 * s);
  g.font = `700 ${34 * s}px 'Space Grotesk'`; g.fillStyle = CREAM; g.fillText("eSIM", 0, -h / 2 + 114 * s);
  // SIM chip
  inked("#FFC83A", () => g.roundRect(-34 * s, -h / 2 + 140 * s, 68 * s, 52 * s, 8 * s), 3);
  g.strokeStyle = "#B8860B"; g.lineWidth = 2; g.beginPath(); g.moveTo(-34 * s, -h / 2 + 166 * s); g.lineTo(34 * s, -h / 2 + 166 * s); g.moveTo(0, -h / 2 + 140 * s); g.lineTo(0, -h / 2 + 192 * s); g.stroke();
  const qs = 170 * s * ease.back(ready);
  if (ready > 0) qr(-qs / 2, -h / 2 + 216 * s + (170 * s - qs) / 2, qs, 9);
  g.fillStyle = ORANGE; g.beginPath(); g.roundRect(-100 * s, h / 2 - 96 * s, 200 * s, 54 * s, 14 * s); g.fill();
  g.font = `700 ${22 * s}px Geist`; g.fillStyle = "#fff"; g.fillText("Install eSIM", 0, h / 2 - 69 * s);
  g.restore();
}
function giftCard(x, y, s, flip, t) {
  const w = 400 * s, h = 250 * s;
  g.save(); g.translate(x, y); g.rotate(-0.08 + Math.sin(t * 2) * 0.03); g.scale(Math.cos(flip * Math.PI * 4) * (1 - flip) + flip, 1);
  const gr = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); gr.addColorStop(0, ORANGE); gr.addColorStop(1, "#FFC83A");
  inked(gr, () => g.roundRect(-w / 2, -h / 2, w, h, 26 * s), 7);
  g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.moveTo(-w / 2, h * 0.1); g.lineTo(w * 0.1, -h / 2); g.lineTo(w * 0.3, -h / 2); g.lineTo(-w / 2, h * 0.32); g.fill();
  g.fillStyle = "#0E1016"; g.beginPath(); g.arc(-w / 2 + 62 * s, -h / 2 + 62 * s, 38 * s, 0, 7); g.fill(); apMark(g, -w / 2 + 62 * s, -h / 2 + 62 * s, 50 * s);
  g.textAlign = "left"; g.textBaseline = "middle"; g.font = `700 ${40 * s}px 'Space Grotesk'`; g.fillStyle = INK; g.fillText("GIFT CARD", -w / 2 + 30 * s, 30 * s);
  g.fillStyle = "rgba(14,16,22,.85)"; g.beginPath(); g.roundRect(-w / 2 + 30 * s, 62 * s, w - 60 * s, 46 * s, 10 * s); g.fill();
  g.font = `600 ${24 * s}px Geist`; g.fillStyle = CREAM; g.textAlign = "center"; g.fillText("CODE  ••••  ••••  ••••", 0, 86 * s);
  g.restore();
}
function signal(x, y, s, fill, t) {
  g.save(); g.translate(x, y);
  inked("#1A1B24", () => g.roundRect(-170 * s, -170 * s, 340 * s, 300 * s, 34 * s), 7);
  for (let i = 0; i < 4; i++) {
    const bh = (60 + i * 45) * s, bx = -120 * s + i * 64 * s, f = clamp(fill - i);
    g.fillStyle = "#2E3040"; g.beginPath(); g.roundRect(bx, 90 * s - bh, 44 * s, bh, 8 * s); g.fill();
    if (f > 0) { g.fillStyle = i < 3 ? ORANGE : "#FFC83A"; g.beginPath(); g.roundRect(bx, 90 * s - bh * ease.back(f), 44 * s, bh * ease.back(f), 8 * s); g.fill(); }
  }
  g.restore();
}
function chips(items, x, y, s, t) {
  const r = 1; let i = 0;
  const cols = 2, cw = 190 * s, ch = 62 * s;
  for (const it of items) {
    const p = prog(t, i * 0.12, i * 0.12 + 0.3); if (p <= 0) { i++; continue; }
    const cx = x + ((i % cols) - (cols - 1) / 2) * (cw + 16 * s), cy = y + Math.floor(i / cols) * (ch + 14 * s);
    g.save(); g.translate(cx, cy); g.scale(ease.back(p), ease.back(p));
    inked(CREAM, () => g.roundRect(-cw / 2, -ch / 2, cw, ch, ch / 2), 5);
    g.font = `700 ${28 * s}px 'Space Grotesk'`; g.fillStyle = INK; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(it, 0, 2 * s);
    g.restore(); i++;
  }
}
function shield(x, y, s, lock, glow, t) {
  g.save(); g.translate(x, y);
  if (glow > 0) { g.fillStyle = `rgba(255,200,80,${0.35 * glow})`; g.beginPath(); g.arc(0, 0, 250 * s * (1 + 0.05 * Math.sin(t * 6)), 0, 7); g.fill(); }
  const path = () => { g.moveTo(0, -190 * s); g.lineTo(160 * s, -130 * s); g.quadraticCurveTo(160 * s, 100 * s, 0, 200 * s); g.quadraticCurveTo(-160 * s, 100 * s, -160 * s, -130 * s); g.closePath(); };
  inked("#13A3A0", path, 8);
  g.save(); g.scale(0.8, 0.8); g.translate(0, -10 * s); inked("#0E7F7D", path, 0); g.restore();
  // padlock
  const ly = 10 * s - (1 - ease.back(lock)) * 40 * s;
  g.strokeStyle = INK; g.lineWidth = 26 * s; g.beginPath(); g.arc(0, ly - 30 * s, 46 * s, Math.PI, 0); g.stroke();
  g.strokeStyle = CREAM; g.lineWidth = 14 * s; g.stroke();
  inked("#FFC83A", () => g.roundRect(-70 * s, -30 * s, 140 * s, 110 * s, 16 * s), 7);
  g.font = `700 ${70 * s}px 'Space Grotesk'`; g.fillStyle = INK; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("₦", 0, 26 * s);
  g.restore();
}
function pill(text, x, y, s, t, col = ORANGE) {
  const p = prog(t, 0, 0.25); if (p <= 0) return;
  g.font = `700 ${32 * s}px Geist`; const w = g.measureText(text).width + 60 * s, h = 64 * s;
  g.save(); g.translate(x, y); g.scale(ease.back(p), ease.back(p));
  inked(col, () => g.roundRect(-w / 2, -h / 2, w, h, h / 2), 5);
  g.fillStyle = col === CREAM ? INK : "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 0, 2 * s);
  g.restore();
}

// ---------- Kunle helpers ----------
const ghostCv = document.createElement("canvas"), gctx = ghostCv.getContext("2d");
function kunle(keys, t, x, time, opts = {}) {
  const saved = L.k; if (opts.k) L.k = opts.k;
  try { return kunleAt(keys, t, x, time, opts); } finally { L.k = saved; }
}
function kunleAt(keys, t, x, time, opts) {
  const p = poseAt(keys, t);
  const air = opts.air ? opts.air(t) : 0;
  const y = L.gy - footDrop(p) * L.k - air;
  // motion trail: draw two faded copies when he moves fast
  const prev = poseAt(keys, t - 0.05);
  const speed = ["fa", "fe", "ba", "ft", "fk", "t"].reduce((s, k) => s + Math.abs((p[k] || 0) - (prev[k] || 0)), 0);
  if (speed > 35) for (const [dt, a] of [[0.09, 0.2], [0.045, 0.35]]) {
    // each ghost is drawn alone on a scratch canvas, tinted orange, then laid over the scene
    const gp = poseAt(keys, t - dt);
    if (ghostCv.width !== W || ghostCv.height !== H) { ghostCv.width = W; ghostCv.height = H; }
    gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, W, H); gctx.setTransform(g.getTransform());
    drawKunle(gctx, gp, { x: (opts.xAt ? opts.xAt(t - dt) : x), y: L.gy - footDrop(gp) * L.k - (opts.air ? opts.air(t - dt) : 0), k: L.k, time });
    gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.globalCompositeOperation = "source-atop"; gctx.fillStyle = ORANGE; gctx.fillRect(0, 0, W, H); gctx.globalCompositeOperation = "source-over";
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = a; g.drawImage(ghostCv, 0, 0); g.restore();
  }
  drawKunle(g, p, { x, y, k: L.k, time });
  return { p, y };
}
/** Hand or foot position (canvas px) of a pose, used to put targets exactly where a strike lands. */
function reach(poseName, which, x) {
  const p = { ...POSES.stance, ...POSES[poseName] };
  const Dg = Math.PI / 180, dir = (a) => [Math.sin(a * Dg), Math.cos(a * Dg)], up = (a) => [Math.sin(a * Dg), -Math.cos(a * Dg)];
  const y0 = L.gy - footDrop(p) * L.k;
  if (which === "foot") { const a1 = p.ft, a2 = p.ft + p.fk; const kx = 10 + dir(a1)[0] * 98 + dir(a2)[0] * 98, ky = dir(a1)[1] * 98 + dir(a2)[1] * 98; return [x + kx * L.k, y0 + ky * L.k]; }
  const sh = [up(p.t)[0] * 128 + up(p.t + 90)[0] * 8, up(p.t)[1] * 128 + up(p.t + 90)[1] * 8];
  const a1 = p.fa - p.t, a2 = a1 + p.fe;
  return [x + (sh[0] + dir(a1)[0] * 80 + dir(a2)[0] * 96) * L.k, y0 + (sh[1] + dir(a1)[1] * 80 + dir(a2)[1] * 96) * L.k];
}

// ---------- scenes ----------
const SCENES = {
  intro(s) {
    const land = 0.75;
    const keys = [{ t: 0, pose: "fly" }, { t: land, pose: "fly", ease: "linear" }, { t: land + 0.08, pose: "land", with: { sq: 1 }, ease: "out" }, { t: 1.25, pose: "guard" }, { t: 2.1, pose: "guard" }, { t: 2.45, pose: "crane" }];
    const xAt = (t) => L.cx - (1 - ease.out(prog(t, 0, land))) * W * 0.55;
    const air = (t) => (t < land ? Math.sin(prog(t, 0, land) * Math.PI * 0.5 + Math.PI * 0.5) * H * 0.55 : 0);
    return {
      cues: [{ t: 0.05, type: "whoosh" }, { t: land, type: "impact" }, { t: 0.95, type: "pop" }, { t: 1.1, type: "pop" }, { t: 2.35, type: "swoosh" }],
      draw(t, T) {
        if (t < land) speedLines(L.cx, L.gy - 300 * L.k, (t % 0.3), 5, 18, 1.4);
        kunle(keys, t, xAt(t), T, { air, xAt });
        dust(L.cx, L.gy, t - land, 3, 12, 1.4);
        const h = title(s.lines, L.tx, L.ty + 60 * L.ps, L.ts * 1.25, t - 0.85);
        small(s.kicker, L.tx, L.ty + 10 * L.ps, 38 * L.ps, t - 0.8);
        return { shake: shakeFrom([land], t, 30) };
      },
    };
  },
  breaker(s) {
    const attack = s.attack || "chop";
    const hitAt = attack === "chop" ? 1.25 : attack === "kick" ? 1.0 : 0.9;
    const hits = attack === "punches" ? [0.9, 1.12, 1.36] : [hitAt];
    const last = hits[hits.length - 1];
    const keys = attack === "chop"
      ? [{ t: 0, pose: "guard" }, { t: 0.85, pose: "guard" }, { t: 1.08, pose: "windup", ease: "out" }, { t: hitAt, pose: "chop", ease: "snap" }, { t: 1.7, pose: "chop" }, { t: 2.1, pose: "point", ease: "out" }, { t: 3.0, pose: "point" }, { t: 3.3, pose: "thumb" }]
      : attack === "kick"
        ? [{ t: 0, pose: "guard" }, { t: 0.55, pose: "guard" }, { t: 0.82, pose: "chamber", ease: "out" }, { t: hitAt, pose: "kick", ease: "snap" }, { t: 1.5, pose: "kick" }, { t: 1.9, pose: "guard", ease: "out" }, { t: 2.6, pose: "point" }, { t: 3.4, pose: "thumb" }]
        : [{ t: 0, pose: "guard" }, { t: 0.7, pose: "guard" }, { t: 0.9, pose: "punch", ease: "snap" }, { t: 1.12, pose: "punch2", ease: "snap" }, { t: 1.36, pose: "punch", ease: "snap" }, { t: 1.8, pose: "punch" }, { t: 2.2, pose: "guard", ease: "out" }, { t: 3.0, pose: "thumb" }];
    const strikePose = attack === "chop" ? "chop" : attack === "kick" ? "kick" : "punch";
    let hit;
    return {
      cues: [{ t: 0.2, type: "pop" }, ...(attack === "chop" ? [{ t: 0.3, type: "whoosh" }, { t: 0.72, type: "hit" }] : [{ t: 0.3, type: "whoosh" }]), ...hits.map((h) => ({ t: h - 0.08, type: "swoosh" })), ...hits.map((h, i) => ({ t: h, type: i === hits.length - 1 ? "impact" : "hit" })), { t: last + 0.5, type: "riser", dur: 0.5 }, { t: last + 0.9, type: "pop" }, { t: last + 1.2, type: "pop" }],
      draw(t, T) {
        hit = hit || reach(strikePose, attack === "kick" ? "foot" : "hand", L.cx);
        const [hx, hy] = hit, k = L.k;
        // the obstacle, before it breaks
        if (attack === "chop") {
          const by = hy + 24 * k;
          const drop = ease.back(prog(t, 0.25, 0.7));
          if (t < hitAt) { blocks(hx, L.gy, k); board(hx, lerp(-200, by, drop), 360 * k, 64 * k, s.label); }
          else { blocks(hx, L.gy, k); const q = t - hitAt; for (const side of [-1, 1]) board(hx + side * (20 + q * 380) * k, by + (q * 300 + q * q * 1800) * k, 360 * k, 64 * k, s.label, side * q * 5, side); }
        } else if (attack === "kick") {
          // a gift box tossed in from the right meets the kick
          const p = prog(t, 0.2, hitAt);
          if (t < hitAt) giftbox(lerp(W + 200 * k, hx + 60 * k, p), hy - Math.sin(p * Math.PI) * 260 * k + 20 * k, k * 1.1, -p * 4);
          else { const q = t - hitAt; giftbox(hx + 60 * k + q * 900 * k, hy + q * q * 2600 * k - q * 400 * k, k * 1.1, q * 9, clamp(q * 4)); confetti(hx + 60 * k, hy, q, 8); }
        } else {
          const bx = hx + 70 * k, by = hy + 6 * k;
          const cracks = hits.filter((h) => t >= h).length;
          const slide = ease.out(prog(t, 0.15, 0.55));
          if (t < last) { g.save(); g.translate(lerp(W + 300 * k, bx, slide), by); g.rotate(Math.PI / 2); board(0, 0, 330 * k, 70 * k, s.label); g.restore();
            if (cracks) { g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.moveTo(bx - 30 * k, by - 40 * k); g.lineTo(bx + 10 * k, by); g.lineTo(bx - 20 * k, by + (cracks > 1 ? 60 : 20) * k); g.stroke(); } }
          else { const q = t - last; for (const side of [-1, 1]) { g.save(); g.translate(bx + q * 600 * k, by + side * (20 + q * 200) * k + q * q * 1600 * k); g.rotate(Math.PI / 2 + side * q * 4); board(0, 0, 330 * k, 70 * k, s.label, 0, side); g.restore(); } }
          // a stand under the board
          if (t < last) { g.fillStyle = INK; g.fillRect(lerp(W + 300 * k, bx, slide) - 8 * k, by + 165 * k, 16 * k, L.gy - by - 165 * k); }
        }
        kunle(keys, t, L.cx, T);
        hits.forEach((h, i) => { speedLines(hx, hy, t - h, 30 + i, 22); });
        burst(hx + 40 * k, hy - 150 * k, 130 * k, t - last, s.burst || "KIA!");
        if (hits.length > 1) hits.slice(0, -1).forEach((h, i) => burst(hx + (i ? 90 : -10) * k, hy - (100 + i * 60) * k, 80 * k, t - h, ["POW!", "BAM!"][i] || ""));
        // the reveal
        const rp = prog(t, last + 0.35, last + 0.95);
        if (rp > 0) {
          const rx = lerp(hx, L.px, ease.out(rp)), ry = lerp(hy, L.py, ease.back(rp)), sc = L.ps * lerp(0.3, 1, ease.back(rp));
          if (s.reveal === "esim") phone(rx, ry, sc, T, prog(t, last + 0.9, last + 1.3));
          else if (s.reveal === "giftcard") giftCard(rx, ry - 60 * L.ps, sc, ease.out(rp), T);
          else if (s.reveal === "airtime") { signal(rx, ry - 80 * L.ps, sc, prog(t, last + 0.6, last + 1.6) * 4, T); chips(s.chips || [], L.px, L.py + 160 * L.ps, L.ps * 0.95, t - last - 1.2); }
          if (rp >= 1) for (let i = 0; i < 4; i++) sparkle(L.px + Math.cos(i * 1.7 + T) * 200 * L.ps, L.py + Math.sin(i * 2.3 + T) * 260 * L.ps, L.ps, T);
          if (s.badge) pill(s.badge, L.px, L.py + (s.reveal === "esim" ? 330 : 140) * L.ps, L.ps, t - last - 1.3, CREAM);
        }
        const swap = last + 0.7;
        title(s.title, L.tx, L.ty, L.ts, t - 0.1, { out: swap - 0.1 });
        title(s.title2 || [], L.tx, L.ty, L.ts, t - swap);
        if (s.kicker) small(s.kicker, L.tx, L.ty - 26 * L.ps, 34 * L.ps, t - 0.1, ORANGE);
        const flash = Math.max(...hits.map((h) => (t >= h ? Math.exp(-(t - h) * 30) : 0)));
        return { shake: shakeFrom(hits, t, attack === "punches" ? 14 : 30), flash: flash * 0.7 };
      },
    };
  },
  escrow(s) {
    const strike = 1.0;
    const keys = [{ t: 0, pose: "crane" }, { t: 0.75, pose: "crane" }, { t: strike, pose: "palm", ease: "snap" }, { t: 1.6, pose: "palm" }, { t: 2.0, pose: "guard", ease: "out" }, { t: 3.2, pose: "guard" }, { t: 3.6, pose: "crane" }];
    const steps = s.steps || [];
    return {
      cues: [{ t: 0.15, type: "pop" }, { t: 0.4, type: "whoosh" }, { t: strike, type: "impact" }, { t: 1.4, type: "pop" }, ...steps.map((_, i) => ({ t: 2.0 + i * 0.85, type: "tick" }))],
      draw(t, T) {
        const k = L.k, sx = L.px, sy = L.py + 40 * L.ps;
        // money bag drops into the shield before it locks
        const bp = prog(t, 0.35, 0.85);
        shield(sx, sy, L.ps, prog(t, strike, strike + 0.3), prog(t, strike, strike + 0.4), T);
        if (bp < 1) { g.save(); g.translate(sx, lerp(-200, sy, ease.inOut(bp))); g.scale(L.ps, L.ps); inked("#C9A45A", () => { g.ellipse(0, 0, 70, 80, 0, 0, 7); }); g.font = "700 70px 'Space Grotesk'"; g.fillStyle = INK; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("₦", 0, 6); g.restore(); }
        kunle(keys, t, L.cx, T);
        speedLines(sx, sy, t - strike, 77, 28);
        burst(sx + 120 * L.ps, sy - 230 * L.ps, 120 * L.ps, t - strike, s.burst || "SAFE!", "#13A3A0");
        // steps under the shield, one at a time
        const i = Math.min(steps.length - 1, Math.floor((t - 2.0) / 0.85));
        if (t >= 2.0 && steps.length) { pill(steps[i], sx, sy + 270 * L.ps, L.ps * 0.92, (t - 2.0) - i * 0.85, i === steps.length - 1 ? ORANGE : CREAM); for (let j = 0; j < steps.length; j++) { g.fillStyle = j <= i ? ORANGE : "rgba(244,242,238,.35)"; g.beginPath(); g.arc(sx + (j - (steps.length - 1) / 2) * 34 * L.ps, sy + 330 * L.ps, 9 * L.ps, 0, 7); g.fill(); } }
        const swap = 1.4;
        title(s.title, L.tx, L.ty, L.ts, t - 0.1, { out: swap - 0.1 });
        title(s.title2 || [], L.tx, L.ty, L.ts, t - swap);
        return { shake: shakeFrom([strike], t, 26), flash: t >= strike ? Math.exp(-(t - strike) * 30) * 0.6 : 0 };
      },
    };
  },
  outro(s) {
    const keys = [{ t: 0, pose: "guard" }, { t: 0.5, pose: "salute", ease: "out" }, { t: 2.4, pose: "salute" }, { t: 2.8, pose: "thumb" }];
    return {
      cues: [{ t: 0.3, type: "impact" }, { t: 0.9, type: "pop" }, { t: 1.4, type: "pop" }, { t: 1.7, type: "tick" }],
      draw(t, T) {
        const ly = L.ty + 150 * L.ps, lp = prog(t, 0.1, 0.4);
        // shockwave ring
        const rq = prog(t, 0.3, 0.9); if (rq > 0 && rq < 1) { g.strokeStyle = `rgba(255,90,31,${1 - rq})`; g.lineWidth = 18 * (1 - rq) + 2; g.beginPath(); g.arc(W / 2, ly, 120 * L.ps + rq * W * 0.6, 0, 7); g.stroke(); }
        if (lp > 0) { const sc = lerp(3, 1, ease.out(lp)); g.save(); g.globalAlpha = lp; g.translate(W / 2, ly); g.scale(sc, sc); g.fillStyle = "#0E1016"; g.beginPath(); g.roundRect(-110 * L.ps, -110 * L.ps, 220 * L.ps, 220 * L.ps, 44 * L.ps); g.fill(); g.lineWidth = 6; g.strokeStyle = ORANGE; g.stroke(); apMark(g, 0, 0, 170 * L.ps); g.restore(); }
        const wp = prog(t, 0.5, 0.8);
        if (wp > 0) { g.save(); g.globalAlpha = wp; g.font = `700 ${50 * L.ps}px 'Space Grotesk'`; g.textAlign = "center"; g.fillStyle = CREAM; g.letterSpacing = `${6 * L.ps}px`; g.fillText("ALMIGHTY PUMPS", W / 2, ly + 175 * L.ps); g.restore(); }
        title(s.title, L.tx, ly + 215 * L.ps, L.ts * 0.9, t - 0.85);
        kunle(keys, t, W > H ? L.cx : L.cx * 0.9, T, { k: L.k * (W > H ? 1 : 0.78) });
        const bp = prog(t, 1.3, 1.55);
        if (bp > 0) {
          const bx = W > H ? W * 0.68 : W / 2, by = W > H ? L.gy - 160 * L.ps : L.capY - 40 * L.ps;
          pill(s.button || "Create free account", bx, by, L.ps * 1.25, t - 1.3);
          small(s.url || "almightypumps.com", bx, by + 90 * L.ps, 40 * L.ps, t - 1.5);
        }
        return { shake: shakeFrom([0.3], t, 20) };
      },
    };
  },
};

// ---------- timeline ----------
window.loadAd = async (ad, format) => {
  await Promise.all(["700 64px 'Space Grotesk'", "600 64px Geist", "700 64px Geist"].map((f) => document.fonts.load(f)));
  W = cv.width = buf.width = innerWidth; H = cv.height = buf.height = innerHeight;
  L = LAYOUT[format](W, H);
  timeline = []; total = 0;
  const cues = [];
  for (const [i, s] of ad.scenes.entries()) {
    const make = SCENES[s.type]; if (!make) throw new Error(`Unknown scene type "${s.type}". Use: ${Object.keys(SCENES).join(", ")}`);
    if (!WORLDS[s.world]) throw new Error(`Unknown world "${s.world}". Use: ${Object.keys(WORLDS).join(", ")}`);
    const sc = make(s);
    const dur = Number(s.duration) || 4;
    if (i > 0) cues.push({ t: total - 0.12, type: "whoosh" });
    for (const c of sc.cues || []) cues.push({ ...c, t: total + c.t });
    timeline.push({ ...sc, s, start: total, dur });
    total += dur;
  }
  return { duration: total, cues };
};

const WIPE = 0.2;
function drawScene(sc, T) {
  const t = T - sc.start;
  g.save();
  const pan = Math.sin(T * 0.4) * 30 - t * 14;
  WORLDS[sc.s.world](g, W, H, T, L.gy, pan);
  const fx = sc.draw(t, T) || {};
  g.restore();
  caption(sc.s.caption, t, sc.dur);
  return fx;
}
window.seek = async (T) => {
  let idx = timeline.findIndex((s) => T < s.start + s.dur); if (idx < 0) idx = timeline.length - 1;
  const cur = timeline[idx];
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
  // camera: gentle push-in
  const t = T - cur.start, z = 1.03 + 0.03 * Math.sin(t * 0.6);
  g.save(); g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-W / 2, -H / 2);
  const fx = drawScene(cur, T);
  g.restore();
  if (fx.flash) { g.fillStyle = `rgba(255,248,230,${fx.flash})`; g.fillRect(0, 0, W, H); }
  vignette();
  // slash wipe into the next scene and out of the previous one
  const next = timeline[idx + 1];
  if (next && T > next.start - WIPE) slash(prog(T, next.start - WIPE, next.start), false);
  if (idx > 0 && T < cur.start + WIPE) slash(prog(T, cur.start, cur.start + WIPE), true);
  // camera shake from hits: copy the frame with a small offset
  const sh = fx.shake || 0;
  out.fillStyle = "#000"; out.fillRect(0, 0, W, H);
  out.drawImage(buf, Math.sin(T * 91) * sh, Math.cos(T * 77) * sh);
};
function slash(k, reveal) {
  const sl = W * 0.35, pos = lerp(-W * 0.5, W * 1.5, ease.inOut(k));
  const edge = (y) => pos + (y / H - 0.5) * sl;
  const band = (off, col) => {
    g.beginPath();
    if (!reveal) { g.moveTo(-W, 0); g.lineTo(edge(0) - off, 0); g.lineTo(edge(H) - off, H); g.lineTo(-W, H); }
    else { g.moveTo(W * 2, 0); g.lineTo(edge(0) + off, 0); g.lineTo(edge(H) + off, H); g.lineTo(W * 2, H); }
    g.closePath(); g.fillStyle = col; g.fill();
  };
  band(0, INK); band(18, ORANGE); band(48, INK); band(66, "#0E1016");
}
function vignette() {
  const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.35)"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
