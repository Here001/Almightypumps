// Cartoon backgrounds. Each draws the whole frame: world(g, W, H, t, gy, pan) where gy is the ground line
// and pan is a small sideways camera drift (far layers move less). All art is original and drawn in code.
import { INK } from "./kunle.js";

export function rnd(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const sky = (g, W, H, stops) => { const gr = g.createLinearGradient(0, 0, 0, H); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(-W, -H, W * 3, H * 3); };
const inked = (g, fill, path, w = 5) => { g.beginPath(); path(); g.fillStyle = fill; g.fill(); if (w) { g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke(); } };

function clouds(g, W, y, t, col, seed, s = 1) {
  const r = rnd(seed);
  for (let i = 0; i < 5; i++) {
    const x = ((r() * W * 1.6 + t * (12 + r() * 14)) % (W * 1.6)) - W * 0.3, cy = y + r() * 160 * s, w = (120 + r() * 160) * s;
    inked(g, col, () => { g.ellipse(x, cy, w, w * 0.28, 0, 0, Math.PI * 2); g.moveTo(x + w * 0.5, cy - w * 0.12); g.ellipse(x - w * 0.2, cy - w * 0.16, w * 0.45, w * 0.3, 0, 0, Math.PI * 2); }, 0);
  }
}

export const WORLDS = {
  // Dawn over a great granite dome rock with savanna grass (original shape, inspired by Nigeria's rock hills).
  rock(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#2B1846"], [0.38, "#B4436A"], [0.6, "#FF8A4C"], [0.78, "#FFD27A"]]);
    const sun = [W * 0.62 + pan * 0.1, gy - H * 0.26];
    g.fillStyle = "rgba(255,236,170,.35)"; g.beginPath(); g.arc(sun[0], sun[1], W * 0.26, 0, 7); g.fill();
    inked(g, "#FFE7A0", () => g.arc(sun[0], sun[1], W * 0.15, 0, 7), 0);
    clouds(g, W, H * 0.12, t, "rgba(255,190,160,.55)", 3);
    // far hills
    g.fillStyle = "#7A3B5C"; g.beginPath(); g.moveTo(-W, gy);
    for (let x = -W; x <= W * 2; x += 40) g.lineTo(x + pan * 0.2, gy - H * 0.12 - Math.sin(x * 0.006) * H * 0.04 - Math.sin(x * 0.017) * 18);
    g.lineTo(W * 2, gy); g.fill();
    // the dome rock
    const rx = W * 0.32 + pan * 0.35, ry = gy - H * 0.02, rw = W * 0.62, rh = H * 0.34;
    inked(g, "#5A2E45", () => { g.moveTo(rx - rw * 0.55, ry); g.bezierCurveTo(rx - rw * 0.5, ry - rh * 0.9, rx - rw * 0.15, ry - rh * 1.05, rx + rw * 0.08, ry - rh); g.bezierCurveTo(rx + rw * 0.38, ry - rh * 0.95, rx + rw * 0.55, ry - rh * 0.5, rx + rw * 0.6, ry); g.closePath(); }, 6);
    g.strokeStyle = "rgba(20,14,12,.35)"; g.lineWidth = 5; g.lineCap = "round";
    for (let i = 0; i < 7; i++) { const x = rx - rw * 0.35 + i * rw * 0.13; g.beginPath(); g.moveTo(x, ry - rh * (0.75 - Math.abs(i - 3) * 0.05)); g.quadraticCurveTo(x + 14, ry - rh * 0.4, x + 4, ry - 10); g.stroke(); }
    g.fillStyle = "rgba(255,170,120,.28)"; g.beginPath(); g.ellipse(rx + rw * 0.18, ry - rh * 0.72, rw * 0.16, rh * 0.18, -0.4, 0, 7); g.fill();
    // birds
    g.strokeStyle = INK; g.lineWidth = 4;
    for (let i = 0; i < 4; i++) { const bx = ((W * 0.1 + i * 90 + t * 60) % (W * 1.2)), by = H * 0.2 + i * 30 + Math.sin(t * 2 + i) * 10, f = Math.sin(t * 10 + i) * 8; g.beginPath(); g.moveTo(bx - 16, by - f); g.quadraticCurveTo(bx - 6, by - 6, bx, by); g.quadraticCurveTo(bx + 6, by - 6, bx + 16, by - f); g.stroke(); }
    // ground: rocky ledge and grass
    inked(g, "#3B2230", () => { g.moveTo(-W, gy - 6); g.lineTo(W * 2, gy - 6); g.lineTo(W * 2, H * 2); g.lineTo(-W, H * 2); g.closePath(); }, 6);
    g.fillStyle = "#4E2D3D"; g.fillRect(-W, gy - 6, W * 3, 26);
    const r = rnd(11);
    for (let i = 0; i < 70; i++) { const x = r() * W * 1.4 - W * 0.2 + pan * 1.2, h = 20 + r() * 50; g.strokeStyle = r() > 0.5 ? "#C9893A" : "#E0A84A"; g.lineWidth = 5; g.beginPath(); g.moveTo(x, gy + 14); g.quadraticCurveTo(x + 6, gy - h * 0.5, x + 14 + Math.sin(t * 2 + i) * 6, gy - h + 10); g.stroke(); }
  },

  // Lagos-style rooftop at dusk: skyline, cable bridge, water tanks.
  rooftop(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#140F2E"], [0.35, "#3E1F5E"], [0.62, "#C2406A"], [0.8, "#FF7A3D"]]);
    g.fillStyle = "rgba(255,255,255,.8)"; const r0 = rnd(5); for (let i = 0; i < 40; i++) { g.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i)); g.fillRect(r0() * W, r0() * H * 0.3, 3, 3); } g.globalAlpha = 1;
    g.fillStyle = "#FFD9A0"; g.beginPath(); g.arc(W * 0.2 + pan * 0.05, H * 0.2, 46, 0, 7); g.fill();
    // far skyline
    const far = rnd(21); g.fillStyle = "#2C1A4A";
    for (let x = -100; x < W + 100; x += 60 + far() * 40) { const h = H * (0.08 + far() * 0.16); g.fillRect(x + pan * 0.2, gy - H * 0.06 - h, 50 + far() * 40, h + H * 0.1); }
    // cable-stayed bridge
    const bx = W * 0.62 + pan * 0.3, by = gy - H * 0.1;
    g.strokeStyle = "#1C1236"; g.lineWidth = 12; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - H * 0.2); g.stroke();
    g.lineWidth = 3; for (let i = 1; i < 9; i++) { g.beginPath(); g.moveTo(bx, by - H * 0.19); g.lineTo(bx - i * 40, by); g.moveTo(bx, by - H * 0.19); g.lineTo(bx + i * 40, by); g.stroke(); }
    g.lineWidth = 10; g.beginPath(); g.moveTo(-W, by); g.lineTo(W * 2, by); g.stroke();
    // mid buildings with lit windows
    const mid = rnd(33);
    for (let x = -60; x < W + 100; x += 120 + mid() * 60) {
      const w = 100 + mid() * 50, h = H * (0.1 + mid() * 0.12), X = x + pan * 0.5;
      inked(g, "#21153A", () => g.rect(X, gy - h, w, h + 40), 4);
      for (let wy = gy - h + 18; wy < gy - 10; wy += 26) for (let wx = X + 12; wx < X + w - 16; wx += 24) if (mid() > 0.45) { g.fillStyle = mid() > 0.3 ? "#FFC86B" : "#FF8F4C"; g.fillRect(wx, wy, 12, 14); }
    }
    // rooftop floor and parapet
    inked(g, "#4A4560", () => g.rect(-W, gy, W * 3, H), 6);
    g.fillStyle = "#3A3550"; for (let x = -W; x < W * 2; x += 90) g.fillRect(x + pan, gy + 30, 4, H);
    inked(g, "#5B5675", () => g.rect(-W, gy - 26, W * 3, 26), 5);
    // black water tank on a stand (left)
    const tx = W * 0.06 + pan * 0.9;
    g.strokeStyle = INK; g.lineWidth = 8; g.beginPath(); g.moveTo(tx, gy - 26); g.lineTo(tx + 16, gy - 120); g.moveTo(tx + 110, gy - 26); g.lineTo(tx + 94, gy - 120); g.stroke();
    inked(g, "#222230", () => { g.roundRect(tx - 6, gy - 250, 122, 136, 24); }, 6);
    g.strokeStyle = "#3A3A50"; g.lineWidth = 6; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(tx - 4, gy - 250 + i * 34); g.lineTo(tx + 114, gy - 250 + i * 34); g.stroke(); }
    // satellite dish (right)
    const dx = W * 0.9 + pan * 0.9;
    inked(g, "#D8D4E4", () => { g.ellipse(dx, gy - 110, 52, 30, -0.6, 0, Math.PI * 2); }, 5);
    g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(dx, gy - 100); g.lineTo(dx + 6, gy - 26); g.stroke();
  },

  // Warm wooden training hall with paper windows, lanterns and an AP banner.
  dojo(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#3A2214"], [1, "#6B3E20"]]);
    for (let x = -W; x < W * 2; x += 70) { g.fillStyle = (Math.floor(x / 70) % 2) ? "#5E371D" : "#663D20"; g.fillRect(x + pan * 0.4, 0, 70, gy); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x + pan * 0.4, 0, 3, gy); }
    // paper windows
    for (const wx of [0.12, 0.62]) {
      const X = W * wx + pan * 0.4, Y = H * 0.22, w = W * 0.28, h = H * 0.22;
      inked(g, "#FFE2B0", () => g.rect(X, Y, w, h), 8);
      g.fillStyle = "rgba(255,180,90,.35)"; g.fillRect(X, Y, w, h);
      g.strokeStyle = "#3B2212"; g.lineWidth = 6; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(X + (w * i) / 4, Y); g.lineTo(X + (w * i) / 4, Y + h); g.stroke(); } for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(X, Y + (h * i) / 3); g.lineTo(X + w, Y + (h * i) / 3); g.stroke(); }
    }
    // hanging banner with the AP mark
    const bx = W * 0.5 + pan * 0.5, by = H * 0.08, sw = Math.sin(t * 1.6) * 0.02;
    g.save(); g.translate(bx, by); g.rotate(sw);
    inked(g, "#FF5A1F", () => { g.moveTo(-90, 0); g.lineTo(90, 0); g.lineTo(90, 230); g.lineTo(0, 200); g.lineTo(-90, 230); g.closePath(); }, 6);
    apMark(g, 0, 100, 140, "#F4F2EE", "#140E0C");
    g.fillStyle = "#3B2212"; g.fillRect(-110, -10, 220, 16);
    g.restore();
    // lanterns
    for (const lx of [0.08, 0.92]) { const X = W * lx + pan * 0.6, Y = H * 0.1 + Math.sin(t * 2 + lx * 9) * 6; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(X, 0); g.lineTo(X, Y); g.stroke(); g.fillStyle = "rgba(255,120,40,.25)"; g.beginPath(); g.arc(X, Y + 50, 110, 0, 7); g.fill(); inked(g, "#E8452A", () => g.ellipse(X, Y + 50, 40, 52, 0, 0, 7), 5); g.fillStyle = "#FFC83A"; g.fillRect(X - 30, Y + 44, 60, 10); }
    // floor
    inked(g, "#8A5530", () => g.rect(-W, gy, W * 3, H), 6);
    for (let x = -W; x < W * 2; x += 160) { g.strokeStyle = "#6E4224"; g.lineWidth = 4; g.beginPath(); g.moveTo(x + pan, gy); g.lineTo(x + pan - 300, H); g.stroke(); }
    g.fillStyle = "rgba(255,210,150,.12)"; g.beginPath(); g.ellipse(W * 0.45, gy + 60, W * 0.5, 60, 0, 0, 7); g.fill();
  },

  // Busy daytime street with a yellow city bus, kiosk and tangled power lines.
  street(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#4FB3E8"], [0.7, "#BDE6F5"]]);
    clouds(g, W, H * 0.08, t, "#FFFFFF", 7, 1.1);
    // buildings
    const r = rnd(44), cols = ["#F2B36B", "#E57B5A", "#8CC7A1", "#F4E3B5", "#C97B9E"];
    for (let x = -80; x < W + 120; x += 150 + r() * 40) {
      const w = 140 + r() * 30, h = H * (0.14 + r() * 0.1), X = x + pan * 0.4, c = cols[Math.floor(r() * cols.length)];
      inked(g, c, () => g.rect(X, gy - h - H * 0.06, w, h + H * 0.1), 5);
      g.fillStyle = "rgba(20,14,12,.7)"; for (let wy = gy - h - H * 0.06 + 22; wy < gy - H * 0.08; wy += 50) for (let wx = X + 16; wx < X + w - 30; wx += 44) g.fillRect(wx, wy, 24, 28);
    }
    // power poles and lines
    g.strokeStyle = INK; g.lineWidth = 10; for (const px of [0.15, 0.85]) { g.beginPath(); g.moveTo(W * px + pan * 0.6, gy); g.lineTo(W * px + pan * 0.6, H * 0.2); g.stroke(); }
    g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-50, H * 0.22 + i * 12); g.quadraticCurveTo(W * 0.5, H * 0.3 + i * 18 + Math.sin(t + i) * 4, W + 50, H * 0.21 + i * 10); g.stroke(); }
    // yellow bus with black stripes
    const bx = W * 0.55 + pan * 0.7 + Math.sin(t * 8) * 1, by = gy - 10;
    inked(g, "#FFC21A", () => { g.roundRect(bx - 230, by - 190, 460, 170, 26); }, 7);
    g.fillStyle = INK; g.fillRect(bx - 228, by - 80, 456, 14); g.fillRect(bx - 228, by - 56, 456, 8);
    g.fillStyle = "#9AD8F0"; for (let i = 0; i < 5; i++) { g.fillRect(bx - 210 + i * 86, by - 170, 70, 60); }
    for (const wx of [-140, 140]) { inked(g, "#2A2A33", () => g.arc(bx + wx, by - 16, 38, 0, 7), 6); g.fillStyle = "#AAA"; g.beginPath(); g.arc(bx + wx, by - 16, 14, 0, 7); g.fill(); }
    // kiosk with an umbrella (left)
    const kx = W * 0.08 + pan * 0.9;
    inked(g, "#13A3A0", () => g.rect(kx - 10, gy - 150, 150, 150), 6);
    inked(g, "#FF5A1F", () => { g.moveTo(kx - 60, gy - 170); g.quadraticCurveTo(kx + 65, gy - 300, kx + 190, gy - 170); g.closePath(); }, 6);
    g.fillStyle = "#F4F2EE"; g.fillRect(kx + 8, gy - 120, 114, 40);
    // road
    inked(g, "#55525E", () => g.rect(-W, gy, W * 3, H), 6);
    g.fillStyle = "#F4F2EE"; for (let x = -W; x < W * 2; x += 180) g.fillRect(x + pan * 1.2, gy + 80, 90, 12);
    g.fillStyle = "#77737F"; g.fillRect(-W, gy, W * 3, 22);
  },

  // Night market: string lights, stall canopies, warm glow.
  market(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#0B0F25"], [0.7, "#1E2350"]]);
    g.fillStyle = "#F4F2EE"; g.beginPath(); g.arc(W * 0.8 + pan * 0.05, H * 0.15, 60, 0, 7); g.fill();
    g.fillStyle = "#1E2350"; g.beginPath(); g.arc(W * 0.8 + 26 + pan * 0.05, H * 0.15 - 14, 54, 0, 7); g.fill();
    // stalls
    const cols = ["#FF5A1F", "#13A3A0", "#FFC83A", "#C2406A"];
    for (let i = -1; i < 5; i++) {
      const X = i * W * 0.3 + pan * 0.5, Y = gy - H * 0.17, w = W * 0.26;
      inked(g, "#2B2440", () => g.rect(X, Y, w, H * 0.17), 5);
      g.fillStyle = "rgba(255,200,110,.35)"; g.fillRect(X + 10, Y + 50, w - 20, H * 0.17 - 60);
      for (let s = 0; s < 6; s++) inked(g, s % 2 ? "#F4F2EE" : cols[(i + 4) % 4], () => { g.moveTo(X + (s * w) / 6, Y); g.lineTo(X + ((s + 1) * w) / 6, Y); g.quadraticCurveTo(X + ((s + 0.5) * w) / 6, Y + 50, X + (s * w) / 6, Y); }, 3);
      inked(g, cols[(i + 4) % 4], () => g.rect(X - 8, Y - 30, w + 16, 30), 4);
    }
    // string lights
    for (let row = 0; row < 2; row++) {
      g.strokeStyle = INK; g.lineWidth = 3; g.beginPath();
      const y0 = H * (0.16 + row * 0.1);
      for (let x = -40; x <= W + 40; x += 20) { const y = y0 + Math.sin((x / W) * Math.PI) * 70; if (x === -40) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      for (let x = 0; x <= W; x += 60) { const y = y0 + Math.sin((x / W) * Math.PI) * 70 + 10, on = 0.6 + 0.4 * Math.sin(t * 4 + x); g.fillStyle = `rgba(255,${180 + row * 40},90,${0.25 * on})`; g.beginPath(); g.arc(x, y, 26, 0, 7); g.fill(); g.fillStyle = row ? "#FFE08A" : "#FF9A4C"; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
    }
    inked(g, "#2A2140", () => g.rect(-W, gy, W * 3, H), 6);
    g.fillStyle = "rgba(255,170,90,.18)"; g.beginPath(); g.ellipse(W * 0.5, gy + 40, W * 0.6, 70, 0, 0, 7); g.fill();
  },

  // Brand finale: dark with an orange burst and halftone dots.
  brand(g, W, H, t, gy) {
    g.fillStyle = "#0E1016"; g.fillRect(-W, -H, W * 3, H * 3);
    const cx = W / 2, cy = H * 0.38;
    g.save(); g.translate(cx, cy); g.rotate(t * 0.15);
    for (let i = 0; i < 24; i++) { g.fillStyle = i % 2 ? "rgba(255,90,31,.16)" : "rgba(255,90,31,.06)"; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, Math.max(W, H) * 1.2, (i * Math.PI) / 12, ((i + 1) * Math.PI) / 12); g.fill(); }
    g.restore();
    halftone(g, W, H, "rgba(255,90,31,.22)", cx, cy);
    g.fillStyle = "#16141C"; g.fillRect(-W, gy, W * 3, H);
    g.fillStyle = "#FF5A1F"; g.fillRect(-W, gy, W * 3, 8);
  },
};

export function halftone(g, W, H, col, cx, cy) {
  g.fillStyle = col;
  const step = 34, maxD = Math.hypot(W, H) * 0.6;
  for (let y = 0; y < H; y += step) for (let x = (y / step) % 2 ? step / 2 : 0; x < W; x += step) {
    const d = Math.hypot(x - cx, y - cy) / maxD, r = Math.max(0, d - 0.25) * 12;
    if (r > 0.6) { g.beginPath(); g.arc(x, y, Math.min(r, 13), 0, 7); g.fill(); }
  }
}

/** The AP monogram (same geometry as the website logo), centred at x,y with size s. */
export function apMark(g, x, y, s, glyph = "#F4F2EE", ink) {
  g.save(); g.translate(x - s / 2, y - s / 2); g.scale(s / 200, s / 200);
  const draw = () => { g.beginPath(); g.moveTo(20, 175); g.lineTo(120, 20); g.lineTo(120, 175); g.closePath(); g.moveTo(120, 20); g.lineTo(145, 20); g.arc(145, 70, 50, -Math.PI / 2, Math.PI / 2); g.lineTo(120, 120); g.closePath();
    g.moveTo(120, 94); g.lineTo(145, 94); g.arc(145, 70, 24, Math.PI / 2, -Math.PI / 2, true); g.lineTo(120, 46); g.closePath(); };
  if (ink) { draw(); g.lineWidth = 14; g.strokeStyle = ink; g.lineJoin = "round"; g.stroke(); }
  draw(); g.fillStyle = glyph; g.fill("evenodd");
  g.strokeStyle = "#FF5A1F"; g.lineWidth = 13; g.lineJoin = "miter"; g.lineCap = "butt"; g.beginPath(); g.moveTo(52, 162); g.lineTo(82, 124); g.lineTo(112, 162); g.stroke();
  g.restore();
}
