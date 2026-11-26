// More cartoon backgrounds for Kung Fu Kunle (all original, drawn in code). Same signature as worlds.js:
// world(g, W, H, t, gy, pan) with gy = ground line and pan = slow sideways camera drift.
import { INK } from "./kunle.js";
import { rnd } from "./worlds.js";

const TAU = Math.PI * 2;
const sky = (g, W, H, stops) => { const gr = g.createLinearGradient(0, 0, 0, H); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(-W, -H, W * 3, H * 3); };
const inked = (g, fill, path, w = 5) => { g.beginPath(); path(); g.fillStyle = fill; g.fill(); if (w) { g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke(); } };
const ground = (g, W, H, gy, fill, top) => { inked(g, fill, () => g.rect(-W, gy, W * 3, H * 2), 6); if (top) { g.fillStyle = top; g.fillRect(-W, gy + 3, W * 3, 22); } };
const glow = (g, x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
function hills(g, W, gy, h, col, seed, pan, amp = 1) {
  const r = rnd(seed); const f1 = 0.004 + r() * 0.004, f2 = 0.011 + r() * 0.01, ph = r() * 10;
  g.fillStyle = col; g.beginPath(); g.moveTo(-W, gy + 10);
  for (let x = -W; x <= W * 2; x += 30) g.lineTo(x + pan, gy - h - Math.sin(x * f1 + ph) * h * 0.45 * amp - Math.sin(x * f2 + ph) * h * 0.18 * amp);
  g.lineTo(W * 2, gy + 10); g.fill();
}
function tree(g, x, y, s, leaf, trunk = "#4A2A18") {
  inked(g, trunk, () => { g.moveTo(x - 12 * s, y); g.lineTo(x - 7 * s, y - 120 * s); g.lineTo(x + 7 * s, y - 120 * s); g.lineTo(x + 12 * s, y); g.closePath(); }, 4);
  inked(g, leaf, () => { g.arc(x, y - 150 * s, 62 * s, 0, TAU); g.moveTo(x - 30 * s, y - 120 * s); g.arc(x - 46 * s, y - 120 * s, 44 * s, 0, TAU); g.moveTo(x + 90 * s, y - 120 * s); g.arc(x + 46 * s, y - 120 * s, 44 * s, 0, TAU); }, 4);
}
function palm(g, x, y, s, t) {
  g.strokeStyle = INK; g.lineWidth = 26 * s; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 40 * s, y - 200 * s, x + 20 * s, y - 380 * s); g.stroke();
  g.strokeStyle = "#8A5A30"; g.lineWidth = 16 * s; g.stroke();
  const tx = x + 20 * s, ty = y - 380 * s;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI + (i / 6) * Math.PI + Math.sin(t * 1.5 + i) * 0.06, L = 170 * s;
    g.strokeStyle = INK; g.lineWidth = 22 * s; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - 40 * s, tx + Math.cos(a) * L, ty + Math.sin(a) * L + 50 * s); g.stroke();
    g.strokeStyle = i % 2 ? "#2E9E4F" : "#3DBB5E"; g.lineWidth = 13 * s; g.stroke();
  }
}

export const WORLDS2 = {
  // Hilltop temple at sunrise: curved roofs, red pillars, stone steps, lanterns, blossom trees.
  temple(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#FFB38A"], [0.5, "#FFD9B0"], [0.8, "#FFEBD0"]]);
    glow(g, W * 0.5, gy - H * 0.3, W * 0.5, "rgba(255,240,200,.9)");
    hills(g, W, gy - H * 0.06, H * 0.12, "#E9A7A0", 3, pan * 0.15); hills(g, W, gy - H * 0.02, H * 0.07, "#D98B8E", 4, pan * 0.3);
    const cx = W * 0.5 + pan * 0.4, base = gy - H * 0.05;
    inked(g, "#B9B0A6", () => g.rect(cx - W * 0.34, base - 30, W * 0.68, 40), 5);
    for (let lv = 0; lv < 2; lv++) {
      const w = W * (0.5 - lv * 0.14), y = base - 30 - lv * H * 0.11, h = H * 0.08;
      inked(g, "#F4E6D0", () => g.rect(cx - w * 0.4, y - h, w * 0.8, h), 5);
      g.fillStyle = "#C8362B"; for (let i = 0; i < 5; i++) { const px = cx - w * 0.36 + (i * w * 0.72) / 4; g.fillRect(px - 8, y - h, 16, h); }
      g.fillStyle = "#2A1A14"; g.fillRect(cx - 30, y - h * 0.8, 60, h * 0.8);
      inked(g, "#3B2A3E", () => { g.moveTo(cx - w * 0.62, y - h + 10); g.quadraticCurveTo(cx - w * 0.45, y - h - 6, cx - w * 0.3, y - h - 34); g.lineTo(cx + w * 0.3, y - h - 34); g.quadraticCurveTo(cx + w * 0.45, y - h - 6, cx + w * 0.62, y - h + 10); g.closePath(); }, 6);
    }
    g.fillStyle = "#FFC83A"; g.fillRect(cx - 8, base - 30 - H * 0.22 - 60, 16, 30);
    // steps
    for (let i = 0; i < 6; i++) { const w = W * (0.16 + i * 0.04); inked(g, i % 2 ? "#CFC6BB" : "#BDB3A8", () => g.rect(cx - w / 2, base + 10 + i * 14 - 10, w, 16), 3); }
    // blossom trees
    for (const [bx, s] of [[0.08, 1], [0.92, 0.9]]) { tree(g, W * bx + pan * 0.7, gy, s * 1.1, "#F59AB5"); }
    const r = rnd(9); for (let i = 0; i < 26; i++) { const x = (r() * W + t * 40 * (0.5 + r())) % W, y = (r() * H * 0.7 + t * 60 * (0.5 + r())) % (gy); g.fillStyle = "#F7B8CC"; g.beginPath(); g.ellipse(x, y, 7, 4, t + i, 0, TAU); g.fill(); }
    // lanterns
    for (const lx of [0.3, 0.7]) { const X = W * lx + pan * 0.4, Y = gy - H * 0.2 + Math.sin(t * 2 + lx * 7) * 4; inked(g, "#E8452A", () => g.ellipse(X, Y, 22, 28, 0, 0, TAU), 4); glow(g, X, Y, 70, "rgba(255,140,60,.35)"); }
    ground(g, W, H, gy, "#9C8E84", "#B3A69B");
  },

  // Deep rainforest: layered trees, vines, light shafts, ferns.
  forest(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#0F3B2E"], [0.6, "#1F6B45"], [1, "#2E8B57"]]);
    for (let i = 0; i < 4; i++) { g.save(); g.globalAlpha = 0.12 + 0.05 * Math.sin(t + i); g.fillStyle = "#FFF6C8"; g.beginPath(); const x = W * (0.15 + i * 0.25) + pan * 0.1; g.moveTo(x, -20); g.lineTo(x + 70, -20); g.lineTo(x + 260, gy); g.lineTo(x + 120, gy); g.fill(); g.restore(); }
    const layers = [["#174D36", 0.2, 120], ["#1C5E3F", 0.45, 150], ["#123D2B", 0.8, 190]];
    layers.forEach(([col, par, sp], li) => { const r = rnd(20 + li); for (let x = -200; x < W + 200; x += sp + r() * 80) { const X = x + pan * par, s = 0.9 + r() * 0.6 + li * 0.2; g.fillStyle = col; g.fillRect(X - 14 * s, gy - H * 0.55, 28 * s, H * 0.6); g.beginPath(); g.arc(X, gy - H * 0.55, 110 * s, 0, TAU); g.arc(X - 80 * s, gy - H * 0.5, 80 * s, 0, TAU); g.arc(X + 80 * s, gy - H * 0.5, 80 * s, 0, TAU); g.fill(); } });
    // vines
    const rv = rnd(31); g.strokeStyle = "#2F7A3E"; g.lineWidth = 7; for (let i = 0; i < 7; i++) { const x = rv() * W, l = H * (0.15 + rv() * 0.3); g.beginPath(); g.moveTo(x, -10); g.quadraticCurveTo(x + Math.sin(t + i) * 20, l * 0.6, x + 6, l); g.stroke(); g.fillStyle = "#43A04F"; for (let y = 30; y < l; y += 40) { g.beginPath(); g.ellipse(x + 10 + Math.sin(t + i) * 10 * (y / l), y, 12, 6, 0.6, 0, TAU); g.fill(); } }
    // fireflies
    const rf = rnd(5); for (let i = 0; i < 18; i++) { const x = (rf() * W + Math.sin(t + i) * 30), y = gy - rf() * H * 0.4 + Math.cos(t * 1.3 + i) * 20; glow(g, x, y, 16, `rgba(255,240,120,${0.4 + 0.4 * Math.sin(t * 3 + i)})`); }
    ground(g, W, H, gy, "#3A2A1A", "#4C3622");
    const rg = rnd(12); for (let i = 0; i < 16; i++) { const x = rg() * W * 1.3 - W * 0.15 + pan * 1.1, s = 0.7 + rg() * 0.7; g.fillStyle = i % 2 ? "#2E8B57" : "#3DA868"; for (let j = -3; j <= 3; j++) { g.beginPath(); g.ellipse(x + j * 14 * s, gy - 10 * s, 10 * s, 50 * s, j * 0.35, 0, TAU); g.fill(); } }
  },

  // Bamboo grove at night under a big moon.
  bamboo(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#0C1B2E"], [0.7, "#1D3A4F"]]);
    g.fillStyle = "#F6EFD2"; g.beginPath(); g.arc(W * 0.62 + pan * 0.05, H * 0.22, W * 0.2, 0, TAU); g.fill(); glow(g, W * 0.62, H * 0.22, W * 0.45, "rgba(246,239,210,.25)");
    [["#1F4A3A", 0.3, 0.7, 60], ["#2C6B4F", 0.6, 1, 90], ["#3E8E5E", 1, 1.3, 130]].forEach(([col, par, s, sp], li) => {
      const r = rnd(40 + li);
      for (let x = -100; x < W + 100; x += sp + r() * 60) {
        const X = x + pan * par + Math.sin(t * 0.8 + x) * 4 * s, w = 18 * s;
        g.fillStyle = col; g.fillRect(X - w / 2, -20, w, gy + 40);
        g.fillStyle = "rgba(0,0,0,.3)"; for (let y = 40 + r() * 80; y < gy; y += 110 * s) g.fillRect(X - w / 2 - 2, y, w + 4, 6);
        g.fillStyle = col; for (let y = 120; y < gy - 60; y += 260 * s) { g.beginPath(); g.ellipse(X + 30 * s, y, 34 * s, 7 * s, -0.4 + Math.sin(t + x) * 0.1, 0, TAU); g.fill(); }
      }
    });
    ground(g, W, H, gy, "#24352A", "#2F4636");
  },

  // Cliff waterfall with mist and a pool.
  waterfall(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#7FD3F0"], [0.7, "#D8F2FA"]]);
    hills(g, W, gy - H * 0.2, H * 0.12, "#7BB8A0", 8, pan * 0.1);
    const fx = W * 0.6 + pan * 0.3, fw = W * 0.22, top = gy - H * 0.52;
    inked(g, "#5E6B5A", () => { g.moveTo(fx - fw * 1.6, gy); g.lineTo(fx - fw * 1.4, top - 40); g.lineTo(fx - fw * 0.5, top - 60); g.lineTo(fx - fw * 0.5, gy); g.closePath(); g.moveTo(fx + fw * 0.5, gy); g.lineTo(fx + fw * 0.5, top - 50); g.lineTo(fx + fw * 1.7, top - 20); g.lineTo(fx + fw * 1.9, gy); g.closePath(); }, 6);
    g.fillStyle = "#3E8E5E"; g.beginPath(); g.ellipse(fx - fw * 1.0, top - 50, fw * 0.8, 40, 0, 0, TAU); g.ellipse(fx + fw * 1.1, top - 30, fw * 0.8, 40, 0, 0, TAU); g.fill();
    inked(g, "#5CC5EA", () => g.rect(fx - fw / 2, top - 55, fw, gy - top + 55), 5);
    g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 6; for (let i = 0; i < 9; i++) { const x = fx - fw / 2 + 10 + (i * (fw - 20)) / 8; const off = ((t * 900 + i * 137) % 260); for (let y = top - 50 + off - 260; y < gy; y += 260) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 90); g.stroke(); } }
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI, r = 40 + ((t * 60 + i * 20) % 50); g.fillStyle = "rgba(255,255,255,.7)"; g.beginPath(); g.arc(fx + Math.cos(a) * fw * 0.6, gy - 10 - Math.sin(a) * r * 0.5, 30, 0, TAU); g.fill(); }
    ground(g, W, H, gy, "#4F7A5A", "#5F8E68");
    inked(g, "#4CB6DE", () => g.ellipse(fx, gy + 70, fw * 1.6, 50, 0, 0, TAU), 5);
    tree(g, W * 0.1 + pan * 0.7, gy, 1.1, "#3E9E5E");
  },

  // Lagos-style beach at noon: sea, waves, palm trees.
  beach(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#38B6FF"], [0.55, "#A8E4FF"]]);
    g.fillStyle = "#FFF3B0"; g.beginPath(); g.arc(W * 0.8, H * 0.12, 60, 0, TAU); g.fill(); glow(g, W * 0.8, H * 0.12, 200, "rgba(255,250,200,.5)");
    const sea = gy - H * 0.16;
    g.fillStyle = "#1E8FD0"; g.fillRect(-W, sea, W * 3, H * 0.2);
    for (let row = 0; row < 4; row++) { g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 4; g.beginPath(); for (let x = -40; x < W + 40; x += 10) { const y = sea + 20 + row * 34 + Math.sin(x * 0.03 + t * 2 + row) * 5; if (x === -40) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
    // wave foam line
    inked(g, "#F4F2EE", () => { g.moveTo(-W, gy - 20); for (let x = -W; x < W * 2; x += 40) g.quadraticCurveTo(x + 20, gy - 40 + Math.sin(t * 3 + x) * 8, x + 40, gy - 20); g.lineTo(W * 2, gy + 10); g.lineTo(-W, gy + 10); g.closePath(); }, 4);
    ground(g, W, H, gy, "#F3D08A", "#F8DDA0");
    palm(g, W * 0.08 + pan * 0.8, gy, 1, t); palm(g, W * 0.9 + pan * 0.8, gy + 10, 0.85, t + 1);
    // beach umbrella
    const ux = W * 0.72 + pan; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(ux, gy + 40); g.lineTo(ux, gy - 190); g.stroke();
    for (let i = 0; i < 4; i++) inked(g, i % 2 ? "#F4F2EE" : "#FF5A1F", () => { g.moveTo(ux, gy - 220); g.lineTo(ux - 120 + i * 60, gy - 170); g.lineTo(ux - 60 + i * 60, gy - 170); g.closePath(); }, 4);
  },

  // Savanna village: round huts with thatch roofs and a baobab tree.
  village(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#FF9E4A"], [0.5, "#FFC870"], [0.8, "#FFE3A3"]]);
    g.fillStyle = "#FFF0C0"; g.beginPath(); g.arc(W * 0.25, gy - H * 0.2, 80, 0, TAU); g.fill();
    hills(g, W, gy - H * 0.03, H * 0.06, "#D88A3E", 6, pan * 0.2, 0.6);
    // baobab
    const bx = W * 0.8 + pan * 0.3;
    inked(g, "#7A5236", () => { g.moveTo(bx - 70, gy); g.quadraticCurveTo(bx - 50, gy - 200, bx - 40, gy - 330); g.lineTo(bx + 40, gy - 330); g.quadraticCurveTo(bx + 50, gy - 200, bx + 70, gy); g.closePath(); }, 6);
    g.strokeStyle = INK; g.lineWidth = 14; g.lineCap = "round"; for (const a of [-0.9, -0.4, 0.2, 0.7]) { g.beginPath(); g.moveTo(bx, gy - 320); g.lineTo(bx + Math.sin(a) * 160, gy - 320 - Math.cos(a) * 110); g.stroke(); }
    g.fillStyle = "#5C8A3A"; for (const a of [-0.9, -0.4, 0.2, 0.7]) { g.beginPath(); g.ellipse(bx + Math.sin(a) * 170, gy - 330 - Math.cos(a) * 120, 60, 30, 0, 0, TAU); g.fill(); }
    // huts
    for (const [hx, s] of [[0.12, 1], [0.42, 0.8], [0.6, 0.65]]) {
      const X = W * hx + pan * 0.5, w = 150 * s, h = 120 * s;
      inked(g, "#C77B47", () => g.rect(X - w / 2, gy - h, w, h), 5);
      g.fillStyle = "#2A1A14"; g.fillRect(X - 18 * s, gy - 70 * s, 36 * s, 70 * s);
      inked(g, "#E1B45A", () => { g.moveTo(X - w * 0.7, gy - h + 6); g.lineTo(X, gy - h - 120 * s); g.lineTo(X + w * 0.7, gy - h + 6); g.closePath(); }, 5);
      g.strokeStyle = "rgba(120,80,20,.5)"; g.lineWidth = 3; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(X, gy - h - 110 * s); g.lineTo(X + i * w * 0.2, gy - h + 4); g.stroke(); }
    }
    ground(g, W, H, gy, "#C9894E", "#D99A5C");
  },

  // Desert dunes in the heat with a camel caravan on the ridge.
  desert(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#FF8B3D"], [0.45, "#FFC36B"], [0.8, "#FFE7B5"]]);
    g.fillStyle = "#FFF4D6"; g.beginPath(); g.arc(W * 0.7 + pan * 0.05, H * 0.2, 90, 0, TAU); g.fill(); glow(g, W * 0.7, H * 0.2, 300, "rgba(255,240,200,.45)");
    hills(g, W, gy - H * 0.12, H * 0.08, "#E9A35C", 15, pan * 0.15, 1.2);
    // caravan silhouette
    const cx = ((t * 30) % (W * 1.4)) - W * 0.2; g.fillStyle = "#7A4A2A";
    for (let i = 0; i < 3; i++) { const X = cx - i * 90, Y = gy - H * 0.21 - Math.sin(X * 0.004) * 30; g.beginPath(); g.ellipse(X, Y, 30, 14, 0, 0, TAU); g.ellipse(X - 6, Y - 14, 12, 10, 0, 0, TAU); g.fill(); g.fillRect(X + 22, Y - 26, 6, 20); g.fillRect(X - 22, Y, 4, 22); g.fillRect(X + 18, Y, 4, 22); }
    hills(g, W, gy - H * 0.05, H * 0.06, "#F0B66E", 16, pan * 0.4, 1.3);
    // heat shimmer lines
    g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 3; for (let i = 0; i < 5; i++) { const y = gy - H * 0.05 - i * 30; g.beginPath(); for (let x = 0; x < W; x += 12) g.lineTo(x, y + Math.sin(x * 0.04 + t * 4 + i) * 4); g.stroke(); }
    ground(g, W, H, gy, "#F2C27F", "#F7D196");
    const r = rnd(4); g.fillStyle = "#D39A55"; for (let i = 0; i < 14; i++) { const x = r() * W * 1.3 + pan * 1.1, y = gy + 40 + r() * 200; g.beginPath(); g.ellipse(x, y, 40, 5, 0, 0, TAU); g.fill(); }
  },

  // Long lagoon bridge at sunset with traffic lights moving across.
  bridge(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#3A2A6E"], [0.45, "#E2607A"], [0.75, "#FFB066"]]);
    g.fillStyle = "#FFD08A"; g.beginPath(); g.arc(W * 0.3 + pan * 0.05, gy - H * 0.18, 70, 0, TAU); g.fill();
    // far skyline
    const r = rnd(8); g.fillStyle = "#4A2E5E"; for (let x = -100; x < W + 100; x += 50 + r() * 40) { const h = H * (0.03 + r() * 0.08); g.fillRect(x + pan * 0.2, gy - H * 0.16 - h, 40 + r() * 30, h); }
    // water
    g.fillStyle = "#5B3F7A"; g.fillRect(-W, gy - H * 0.16, W * 3, H);
    g.strokeStyle = "rgba(255,200,140,.5)"; g.lineWidth = 4; for (let i = 0; i < 10; i++) { const y = gy - H * 0.14 + i * 16, x = W * 0.3 + Math.sin(t * 2 + i) * 20; g.beginPath(); g.moveTo(x - 60 + i * 4, y); g.lineTo(x + 60 - i * 4, y); g.stroke(); }
    // bridge deck on pillars, sitting across the middle distance
    const by = gy - H * 0.1;
    for (let x = -60; x < W + 100; x += 160) { inked(g, "#2B2140", () => g.rect(x + pan * 0.5, by, 26, H * 0.1), 4); }
    inked(g, "#3A2E52", () => g.rect(-W, by - 26, W * 3, 30), 5);
    for (let i = 0; i < 14; i++) { const x = ((t * (i % 2 ? 260 : -220) + i * 170) % (W + 200) + W + 200) % (W + 200) - 100; g.fillStyle = i % 2 ? "#FFE08A" : "#FF5A5A"; g.beginPath(); g.arc(x, by - 14, 6, 0, TAU); g.fill(); }
    g.strokeStyle = "#2B2140"; g.lineWidth = 6; for (let x = -60; x < W + 60; x += 40) { g.beginPath(); g.moveTo(x + pan * 0.5, by - 26); g.lineTo(x + pan * 0.5, by - 46); g.stroke(); }
    // promenade where Kunle stands
    ground(g, W, H, gy, "#4C4560", "#5D5675");
    g.fillStyle = "#2B2140"; for (let x = -W; x < W * 2; x += 60) g.fillRect(x + pan, gy - 60, 8, 60); g.fillRect(-W, gy - 64, W * 3, 10);
  },

  // Neon city street at night (generic signs, no real brands).
  neon(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#07061A"], [0.8, "#1A1240"]]);
    const r = rnd(17);
    for (let x = -80; x < W + 120; x += 170 + r() * 40) {
      const w = 160 + r() * 30, h = H * (0.3 + r() * 0.2), X = x + pan * 0.4;
      inked(g, "#15122E", () => g.rect(X, gy - h, w, h), 4);
      for (let wy = gy - h + 30; wy < gy - 60; wy += 46) for (let wx = X + 18; wx < X + w - 26; wx += 34) if (r() > 0.5) { g.fillStyle = r() > 0.5 ? "#3A2E7A" : "#5E3FA0"; g.fillRect(wx, wy, 18, 22); }
    }
    const signs = [["OPEN 24/7", "#FF3FA4", 0.14, 0.27], ["NAIJA FOOD", "#33E1FF", 0.62, 0.2], ["PHONES", "#FFE14A", 0.4, 0.13], ["NO WAHALA", "#FF5A1F", 0.84, 0.3]];
    for (const [txt, col, sx, sy] of signs) {
      const on = Math.sin(t * 7 + sx * 20) > -0.85 ? 1 : 0.3, X = W * sx + pan * 0.5, Y = gy - H * sy;
      g.save(); g.font = "700 44px 'Space Grotesk'"; const w = g.measureText(txt).width + 40;
      g.fillStyle = "#0B0920"; g.fillRect(X - w / 2, Y - 36, w, 70); g.strokeStyle = col; g.lineWidth = 5; g.globalAlpha = on; g.strokeRect(X - w / 2, Y - 36, w, 70);
      g.shadowColor = col; g.shadowBlur = 24; g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, X, Y); g.restore();
    }
    ground(g, W, H, gy, "#1E1A36", "#2A2450");
    // reflections
    for (const [, col, sx] of signs) { g.fillStyle = col; g.globalAlpha = 0.18; g.fillRect(W * sx + pan * 0.5 - 60, gy + 30, 120, 140); g.globalAlpha = 1; }
  },

  // Rainy back street at night with puddles and a street lamp.
  rain(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#12182A"], [0.8, "#27344F"]]);
    const r = rnd(27);
    for (let x = -60; x < W + 100; x += 200 + r() * 40) { const w = 190, h = H * (0.32 + r() * 0.15), X = x + pan * 0.4; inked(g, "#1E2740", () => g.rect(X, gy - h, w, h), 4); for (let wy = gy - h + 30; wy < gy - 50; wy += 60) for (let wx = X + 20; wx < X + w - 30; wx += 50) { g.fillStyle = r() > 0.6 ? "#FFCF70" : "#2E3A5A"; g.fillRect(wx, wy, 30, 36); } }
    // lamp
    const lx = W * 0.85 + pan * 0.7; g.strokeStyle = INK; g.lineWidth = 12; g.beginPath(); g.moveTo(lx, gy); g.lineTo(lx, gy - H * 0.36); g.lineTo(lx - 60, gy - H * 0.36); g.stroke();
    glow(g, lx - 60, gy - H * 0.35, 260, "rgba(255,210,120,.35)"); inked(g, "#FFE08A", () => g.ellipse(lx - 60, gy - H * 0.35 + 14, 30, 14, 0, 0, TAU), 4);
    ground(g, W, H, gy, "#2A3148", "#343C58");
    for (const [px, pw] of [[0.3, 220], [0.7, 160]]) { g.fillStyle = "rgba(140,170,220,.35)"; g.beginPath(); g.ellipse(W * px + pan, gy + 90, pw, 22, 0, 0, TAU); g.fill(); const rp = ((t * 1.5) % 1); g.strokeStyle = `rgba(220,235,255,${1 - rp})`; g.lineWidth = 2; g.beginPath(); g.ellipse(W * px + pan, gy + 90, pw * 0.3 * rp + 10, 6 * rp + 2, 0, 0, TAU); g.stroke(); }
    g.strokeStyle = "rgba(190,210,255,.55)"; g.lineWidth = 3; const rr = rnd(99);
    for (let i = 0; i < 120; i++) { const x = (rr() * W * 1.2 + t * 300) % (W * 1.2) - W * 0.1, y = (rr() * H + t * 1600 * (0.8 + rr() * 0.4)) % H; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 8, y + 34); g.stroke(); }
  },

  // Airport apron at golden hour, a plane climbing out.
  airport(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#3C6FD6"], [0.55, "#FFB27A"], [0.8, "#FFD9A8"]]);
    const cl = rnd(3); for (let i = 0; i < 4; i++) { const x = (cl() * W + t * 20) % (W * 1.3) - W * 0.15, y = H * (0.08 + cl() * 0.15); g.fillStyle = "rgba(255,255,255,.8)"; g.beginPath(); g.ellipse(x, y, 120, 26, 0, 0, TAU); g.ellipse(x + 50, y - 14, 70, 26, 0, 0, TAU); g.fill(); }
    // plane climbing
    const p = (t * 0.12) % 1, px = lerp(-0.2, 1.2, p) * W, py = H * 0.34 - p * H * 0.2;
    g.save(); g.translate(px, py); g.rotate(-0.22); g.scale(1.2, 1.2);
    inked(g, "#F4F2EE", () => { g.ellipse(0, 0, 110, 18, 0, 0, TAU); }, 4);
    inked(g, "#FF5A1F", () => { g.moveTo(-90, -6); g.lineTo(-120, -50); g.lineTo(-100, -50); g.lineTo(-60, -6); g.closePath(); }, 4);
    inked(g, "#C9CCD4", () => { g.moveTo(-10, 4); g.lineTo(-50, 50); g.lineTo(-20, 50); g.lineTo(30, 4); g.closePath(); }, 4);
    g.fillStyle = "#2A3B6E"; for (let i = 0; i < 7; i++) g.fillRect(-50 + i * 18, -6, 9, 7);
    g.restore();
    // terminal
    const tx = pan * 0.4; inked(g, "#5A6B8C", () => { g.moveTo(-50 + tx, gy - H * 0.06); g.lineTo(-50 + tx, gy - H * 0.17); g.quadraticCurveTo(W * 0.5 + tx, gy - H * 0.26, W + 50 + tx, gy - H * 0.17); g.lineTo(W + 50 + tx, gy - H * 0.06); g.closePath(); }, 5);
    g.fillStyle = "#9FD2F5"; for (let x = 0; x < W; x += 60) g.fillRect(x + tx, gy - H * 0.15, 44, H * 0.07);
    // control tower
    const cx = W * 0.86 + pan * 0.5; inked(g, "#E6E1D8", () => g.rect(cx - 16, gy - H * 0.32, 32, H * 0.3), 4); inked(g, "#2A3B6E", () => g.rect(cx - 46, gy - H * 0.36, 92, 50), 4);
    ground(g, W, H, gy, "#59585F", "#6B6A72");
    g.fillStyle = "#FFE14A"; for (let x = -W; x < W * 2; x += 200) g.fillRect(x + pan * 1.2, gy + 100, 110, 12);
  },

  // Snowy mountain peak with falling snow (classic training spot).
  snow(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#6E8FD8"], [0.6, "#C8D8F5"], [0.85, "#EEF3FF"]]);
    const peak = (x, w, h, col) => inked(g, col, () => { g.moveTo(x - w, gy); g.lineTo(x, gy - h); g.lineTo(x + w, gy); g.closePath(); }, 5);
    peak(W * 0.2 + pan * 0.15, W * 0.4, H * 0.32, "#8EA2C8"); peak(W * 0.75 + pan * 0.2, W * 0.5, H * 0.42, "#7C91BC");
    for (const [x, w, h] of [[W * 0.2 + pan * 0.15, W * 0.4, H * 0.32], [W * 0.75 + pan * 0.2, W * 0.5, H * 0.42]]) inked(g, "#F4F7FF", () => { g.moveTo(x - w * 0.28, gy - h * 0.72); g.lineTo(x, gy - h); g.lineTo(x + w * 0.28, gy - h * 0.72); g.lineTo(x + w * 0.1, gy - h * 0.78); g.lineTo(x - w * 0.05, gy - h * 0.7); g.closePath(); }, 4);
    ground(g, W, H, gy, "#E8EEFA", "#FFFFFF");
    for (const tx of [0.06, 0.94]) { const X = W * tx + pan * 0.8; for (let i = 0; i < 3; i++) inked(g, i === 2 ? "#F4F7FF" : "#2F6B5A", () => { const s = 1 - i * 0.25; g.moveTo(X - 90 * s, gy - 60 - i * 80); g.lineTo(X, gy - 200 - i * 80); g.lineTo(X + 90 * s, gy - 60 - i * 80); g.closePath(); }, 4); }
    const r = rnd(61); g.fillStyle = "#fff"; for (let i = 0; i < 90; i++) { const x = (r() * W + Math.sin(t + i) * 30 + t * 30) % W, y = (r() * H + t * 120 * (0.5 + r())) % H; g.beginPath(); g.arc(x, y, 3 + r() * 5, 0, TAU); g.fill(); }
  },

  // Crystal cave lit by lanterns.
  cave(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#1A1030"], [1, "#2E1D4A"]]);
    glow(g, W * 0.5, gy - H * 0.2, W * 0.7, "rgba(140,90,255,.25)");
    // stalactites
    const r = rnd(71); g.fillStyle = "#120A22"; for (let x = -40; x < W + 40; x += 50 + r() * 40) { const h = 60 + r() * 220; g.beginPath(); g.moveTo(x + pan * 0.3, -10); g.lineTo(x + 20 + pan * 0.3, h); g.lineTo(x + 44 + pan * 0.3, -10); g.fill(); }
    // crystals
    for (const [cx, s, col] of [[0.1, 1.2, "#7A5CFF"], [0.88, 1, "#33E1FF"], [0.7, 0.6, "#FF5AC8"], [0.25, 0.5, "#33E1FF"]]) {
      const X = W * cx + pan * 0.7; glow(g, X, gy - 80 * s, 200 * s, "rgba(150,120,255,.35)");
      for (let i = -2; i <= 2; i++) inked(g, col, () => { const h = (180 - Math.abs(i) * 50) * s, x = X + i * 34 * s; g.moveTo(x - 18 * s, gy); g.lineTo(x - 12 * s + i * 8 * s, gy - h); g.lineTo(x + i * 10 * s, gy - h - 30 * s); g.lineTo(x + 12 * s + i * 8 * s, gy - h); g.lineTo(x + 18 * s, gy); g.closePath(); }, 4);
    }
    ground(g, W, H, gy, "#24173A", "#2E1F48");
    for (const lx of [0.35, 0.6]) { const X = W * lx + pan * 0.5, Y = H * 0.18 + Math.sin(t * 2 + lx * 9) * 5; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(X, 0); g.lineTo(X, Y); g.stroke(); glow(g, X, Y + 40, 120, "rgba(255,170,80,.45)"); inked(g, "#FF8A3D", () => g.ellipse(X, Y + 40, 28, 36, 0, 0, TAU), 4); }
  },

  // Football stadium at night: floodlights and a crowd.
  stadium(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#081028"], [0.5, "#16295A"]]);
    // stands
    inked(g, "#1E2A4E", () => { g.moveTo(-W, gy - H * 0.06); g.lineTo(-W, gy - H * 0.3); g.quadraticCurveTo(W * 0.5, gy - H * 0.4, W * 2, gy - H * 0.3); g.lineTo(W * 2, gy - H * 0.06); g.closePath(); }, 5);
    const r = rnd(5), cols = ["#FF5A1F", "#F4F2EE", "#13A3A0", "#FFC83A", "#2ECC71"];
    for (let i = 0; i < 380; i++) { const x = r() * W, y = gy - H * 0.08 - r() * H * 0.2 - Math.sin((x / W) * Math.PI) * H * 0.04, b = Math.sin(t * 6 + i) > 0.6 ? 6 : 0; g.fillStyle = cols[i % 5]; g.beginPath(); g.arc(x + pan * 0.3, y - b, 6, 0, TAU); g.fill(); }
    // floodlights
    for (const fx of [0.1, 0.9]) { const X = W * fx; g.strokeStyle = INK; g.lineWidth = 10; g.beginPath(); g.moveTo(X, gy - H * 0.3); g.lineTo(X, gy - H * 0.58); g.stroke(); inked(g, "#F4F2EE", () => g.rect(X - 50, gy - H * 0.63, 100, 50), 4); glow(g, X, gy - H * 0.6, 360, "rgba(255,255,230,.4)"); g.fillStyle = "rgba(255,255,230,.06)"; g.beginPath(); g.moveTo(X - 50, gy - H * 0.6); g.lineTo(W * 0.5 - 200, gy); g.lineTo(W * 0.5 + 200, gy); g.lineTo(X + 50, gy - H * 0.6); g.fill(); }
    // pitch
    ground(g, W, H, gy - H * 0.06, "#2E8B3E", null);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? "#2A8039" : "#33994A"; g.fillRect(-W, gy - H * 0.06 + i * 60, W * 3, 60); }
    g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 6; g.beginPath(); g.moveTo(-W, gy + 10); g.lineTo(W * 2, gy + 10); g.stroke(); g.beginPath(); g.ellipse(W * 0.5 + pan, gy + 150, 240, 60, 0, 0, TAU); g.stroke();
  },

  // Above the clouds on a floating rock with a little shrine.
  clouds(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#5B8CFF"], [0.6, "#B5D0FF"], [1, "#FFE6F0"]]);
    glow(g, W * 0.8, H * 0.15, 300, "rgba(255,250,220,.7)");
    const r = rnd(88);
    for (let i = 0; i < 9; i++) { const x = (r() * W * 1.4 + t * (10 + i * 3)) % (W * 1.4) - W * 0.2, y = H * (0.1 + r() * 0.5), s = 0.6 + r(); g.fillStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.ellipse(x, y, 160 * s, 40 * s, 0, 0, TAU); g.ellipse(x + 60 * s, y - 24 * s, 90 * s, 40 * s, 0, 0, TAU); g.ellipse(x - 70 * s, y - 10 * s, 70 * s, 30 * s, 0, 0, TAU); g.fill(); }
    // floating island under Kunle
    inked(g, "#6B4A3A", () => { g.moveTo(-W * 0.1, gy); g.lineTo(W * 1.1, gy); g.lineTo(W * 0.75, gy + H * 0.2); g.lineTo(W * 0.5, gy + H * 0.28); g.lineTo(W * 0.25, gy + H * 0.2); g.closePath(); }, 6);
    inked(g, "#4CAF50", () => g.rect(-W * 0.1, gy - 6, W * 1.2, 30), 5);
    // little shrine gate
    const sx = W * 0.88 + pan * 0.6; g.fillStyle = "#C8362B"; g.fillRect(sx - 70, gy - 220, 18, 220); g.fillRect(sx + 52, gy - 220, 18, 220);
    inked(g, "#C8362B", () => { g.moveTo(sx - 110, gy - 230); g.quadraticCurveTo(sx, gy - 250, sx + 110, gy - 230); g.lineTo(sx + 100, gy - 210); g.lineTo(sx - 100, gy - 210); g.closePath(); }, 4); g.fillRect(sx - 80, gy - 190, 160, 14);
    // birds
    g.strokeStyle = INK; g.lineWidth = 4; for (let i = 0; i < 3; i++) { const bx = (W * 0.2 + i * 80 + t * 50) % W, by = H * 0.25 + i * 26, f = Math.sin(t * 9 + i) * 8; g.beginPath(); g.moveTo(bx - 16, by - f); g.quadraticCurveTo(bx - 6, by - 6, bx, by); g.quadraticCurveTo(bx + 6, by - 6, bx + 16, by - f); g.stroke(); }
  },

  // Lagoon at dawn: calm water, fishing boats, a jetty.
  lagoon(g, W, H, t, gy, pan) {
    sky(g, W, H, [[0, "#6A7BC8"], [0.45, "#F7A6A0"], [0.7, "#FFD8B0"]]);
    g.fillStyle = "#FFE9C8"; g.beginPath(); g.arc(W * 0.55 + pan * 0.05, gy - H * 0.2, 75, 0, TAU); g.fill();
    hills(g, W, gy - H * 0.17, H * 0.03, "#7A6A9E", 2, pan * 0.15, 0.5);
    g.fillStyle = "#7F8FD0"; g.fillRect(-W, gy - H * 0.17, W * 3, H);
    g.strokeStyle = "rgba(255,230,200,.6)"; g.lineWidth = 4; for (let i = 0; i < 12; i++) { const y = gy - H * 0.15 + i * 14, x = W * 0.55 + Math.sin(t * 2 + i) * 16; g.beginPath(); g.moveTo(x - 80 + i * 5, y); g.lineTo(x + 80 - i * 5, y); g.stroke(); }
    // boats
    for (const [bx, s, sp] of [[0.25, 1, 12], [0.78, 0.7, -9]]) { const X = W * bx + Math.sin(t * 0.5) * sp + pan * 0.3, Y = gy - H * 0.1 + Math.sin(t * 2 + bx * 9) * 4; inked(g, "#7A3E1E", () => { g.moveTo(X - 120 * s, Y); g.quadraticCurveTo(X, Y + 40 * s, X + 120 * s, Y); g.closePath(); }, 4); g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.moveTo(X + 30 * s, Y - 6); g.lineTo(X + 80 * s, Y - 100 * s); g.stroke(); }
    // jetty Kunle stands on
    ground(g, W, H, gy, "#8A5A34", "#9E6A40");
    g.strokeStyle = "rgba(60,30,10,.5)"; g.lineWidth = 4; for (let x = -W; x < W * 2; x += 70) { g.beginPath(); g.moveTo(x + pan, gy); g.lineTo(x + pan, gy + 30); g.stroke(); }
    g.fillStyle = "#5A3A20"; for (let x = -W; x < W * 2; x += 200) g.fillRect(x + pan, gy + 30, 22, H);
  },
};
function lerp(a, b, p) { return a + (b - a) * p; }
