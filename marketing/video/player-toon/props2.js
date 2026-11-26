// Extra cartoon props for Kunle ads: product reveals (phone check, travel data, SMS code, parcel, wallet,
// verified seller, help chat, documents), the "wahala" blob and a crate to break, and a training scroll.
import { INK } from "./kunle.js";
import { apMark } from "./worlds.js";

const ORANGE = "#FF5A1F", CREAM = "#F4F2EE", TEAL = "#13A3A0", GOLD = "#FFC83A", DARK = "#0E1016";
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const back = (x) => { const c = 2.2; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

export function makeProps(g) {
  const inked = (fill, path, w = 6) => { g.beginPath(); path(); g.fillStyle = fill; g.fill(); if (w) { g.lineWidth = w; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke(); } };
  const text = (str, x, y, size, col = CREAM, weight = 700, font = "Geist", align = "center") => { g.font = `${weight} ${size}px ${font === "Geist" ? "Geist" : "'Space Grotesk'"}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = "middle"; g.fillText(str, x, y); };
  const phoneBody = (s) => { const w = 280 * s, h = 520 * s; inked("#1A1B24", () => g.roundRect(-w / 2, -h / 2, w, h, 40 * s), 7); g.fillStyle = DARK; g.beginPath(); g.roundRect(-w / 2 + 14 * s, -h / 2 + 14 * s, w - 28 * s, h - 28 * s, 30 * s); g.fill(); g.fillStyle = "#000"; g.beginPath(); g.roundRect(-30 * s, -h / 2 + 24 * s, 60 * s, 14 * s, 7 * s); g.fill(); return [w, h]; };
  const tick = (x, y, r, p) => { inked("#2ECC71", () => g.arc(x, y, r * back(clamp(p)), 0, TAU), 5); if (p > 0.4) { g.strokeStyle = "#fff"; g.lineWidth = r * 0.22; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath(); g.moveTo(x - r * 0.42, y); g.lineTo(x - r * 0.1, y + r * 0.32); g.lineTo(x + r * 0.45, y - r * 0.35); g.stroke(); } };

  const P = {
    // Phone check: the phone shows "Works" with a green tick.
    phonecheck(x, y, s, t, ready) {
      g.save(); g.translate(x, y); g.rotate(Math.sin(t * 2) * 0.03);
      const [, h] = phoneBody(s);
      text("Phone check", 0, -h / 2 + 80 * s, 24 * s, "#9AA0AE", 600);
      text("FREE", 0, -h / 2 + 118 * s, 36 * s, GOLD, 700, "SG");
      g.fillStyle = "#1E2130"; g.beginPath(); g.roundRect(-100 * s, -h / 2 + 150 * s, 200 * s, 44 * s, 10 * s); g.fill();
      text("IMEI  35 ••• ••• •••", 0, -h / 2 + 172 * s, 18 * s, CREAM, 600);
      tick(0, 30 * s, 70 * s, ready);
      if (ready > 0.6) text("Works!", 0, 140 * s, 40 * s, "#2ECC71", 700, "SG");
      g.restore();
    },
    // Travel data: a globe with a plane orbiting and a data badge.
    travel(x, y, s, t, ready) {
      g.save(); g.translate(x, y);
      const R = 150 * s;
      inked("#2E86DE", () => g.arc(0, 0, R, 0, TAU), 7);
      g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip(); g.fillStyle = "#3DBB5E";
      const o = (t * 40 * s) % (R * 2);
      for (const [cx, cy, rx, ry] of [[-60, -50, 70, 45], [50, 20, 60, 80], [-40, 80, 50, 30], [100, -80, 40, 30]]) for (const k of [-1, 0, 1]) { g.beginPath(); g.ellipse(cx * s + o + k * R * 2, cy * s, rx * s, ry * s, 0.3, 0, TAU); g.fill(); }
      g.restore();
      g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, R * 1.35, R * 0.45, -0.3, 0, TAU); g.stroke();
      const a = t * 1.6, px = Math.cos(a) * R * 1.35, py = Math.sin(a) * R * 0.45;
      g.save(); g.rotate(-0.3); g.translate(Math.cos(a) * R * 1.35, Math.sin(a) * R * 0.45); g.rotate(a + Math.PI / 2); g.scale(s, s);
      inked(CREAM, () => { g.ellipse(0, 0, 34, 8, 0, 0, TAU); }, 3); inked(ORANGE, () => { g.moveTo(-6, 0); g.lineTo(-18, -26); g.lineTo(-8, -26); g.lineTo(8, 0); g.closePath(); g.moveTo(-6, 0); g.lineTo(-18, 26); g.lineTo(-8, 26); g.lineTo(8, 0); g.closePath(); }, 3);
      g.restore();
      void px; void py;
      if (ready > 0) { g.save(); g.translate(0, R + 40 * s); g.scale(back(ready), back(ready)); inked(DARK, () => g.roundRect(-150 * s, -34 * s, 300 * s, 68 * s, 34 * s), 5); text("Travel data · instant", 0, 2 * s, 26 * s, CREAM, 700); g.restore(); }
      g.restore();
    },
    // SMS verification: a phone with a code message.
    sms(x, y, s, t, ready) {
      g.save(); g.translate(x, y); g.rotate(Math.sin(t * 2) * 0.03);
      const [w, h] = phoneBody(s);
      text("US number", 0, -h / 2 + 76 * s, 22 * s, "#9AA0AE", 600);
      text("+1 (•••) •••-••••", 0, -h / 2 + 110 * s, 22 * s, CREAM, 600);
      if (ready > 0) {
        g.save(); g.translate(0, -10 * s); g.scale(back(ready), back(ready));
        inked("#2A2D3E", () => { g.roundRect(-w / 2 + 30 * s, -60 * s, w - 60 * s, 150 * s, 20 * s); }, 4);
        text("Your code is", 0, -26 * s, 22 * s, "#C9CCD4", 600);
        const digits = "4 8 2 9 1 7"; const shown = Math.floor(clamp((ready - 0.3) / 0.6) * 11);
        text(digits.slice(0, shown), 0, 30 * s, 40 * s, GOLD, 700, "SG");
        g.restore();
      }
      g.fillStyle = ORANGE; g.beginPath(); g.roundRect(-100 * s, h / 2 - 96 * s, 200 * s, 54 * s, 14 * s); g.fill(); text("Copy code", 0, h / 2 - 69 * s, 22 * s, "#fff", 700);
      g.restore();
    },
    // Parcel with AP tape and a courier van.
    package(x, y, s, t, ready) {
      g.save(); g.translate(x, y);
      const vx = (1 - clamp(ready * 1.5)) * 400 * s;
      g.save(); g.translate(vx, 110 * s);
      inked(CREAM, () => { g.roundRect(-170 * s, -110 * s, 240 * s, 120 * s, 14 * s); }, 6); inked(ORANGE, () => { g.moveTo(70 * s, -80 * s); g.lineTo(130 * s, -80 * s); g.lineTo(165 * s, -30 * s); g.lineTo(165 * s, 10 * s); g.lineTo(70 * s, 10 * s); g.closePath(); }, 6);
      g.fillStyle = "#9AD8F0"; g.fillRect(92 * s, -70 * s, 36 * s, 34 * s);
      for (const wx of [-110, 110]) { inked("#2A2A33", () => g.arc(wx * s, 14 * s, 26 * s, 0, TAU), 5); }
      apMark(g, -50 * s, -50 * s, 70 * s, DARK);
      g.restore();
      g.save(); g.translate(0, -110 * s + Math.sin(t * 3) * 6 * s); g.rotate(-0.06);
      inked("#C98B4E", () => g.rect(-120 * s, -90 * s, 240 * s, 180 * s), 6);
      g.fillStyle = ORANGE; g.fillRect(-20 * s, -90 * s, 40 * s, 180 * s);
      inked(CREAM, () => g.rect(30 * s, 10 * s, 80 * s, 56 * s), 3); g.fillStyle = INK; for (let i = 0; i < 9; i++) g.fillRect(38 * s + i * 7 * s, 18 * s, (i % 3 ? 3 : 5) * s, 26 * s);
      g.restore();
      g.restore();
    },
    // Naira wallet with a card and coins popping out.
    wallet(x, y, s, t, ready) {
      g.save(); g.translate(x, y);
      for (let i = 0; i < 3; i++) { const p = clamp(ready * 1.4 - i * 0.2), cy = -120 * s - p * (90 + i * 30) * s, cx = (-70 + i * 70) * s; if (p > 0) { inked(GOLD, () => g.arc(cx, cy + Math.sin(t * 4 + i) * 6 * s, 30 * s, 0, TAU), 5); text("₦", cx, cy + Math.sin(t * 4 + i) * 6 * s + 2 * s, 30 * s, INK, 700, "SG"); } }
      g.save(); g.translate(30 * s, -70 * s - clamp(ready) * 50 * s); g.rotate(-0.12);
      inked(TEAL, () => g.roundRect(-120 * s, -70 * s, 240 * s, 140 * s, 16 * s), 5); g.fillStyle = GOLD; g.fillRect(-90 * s, -30 * s, 40 * s, 30 * s); text("NAIRA WALLET", 10 * s, 40 * s, 20 * s, CREAM, 700, "SG");
      g.restore();
      inked("#5B3A2A", () => g.roundRect(-160 * s, -60 * s, 320 * s, 190 * s, 26 * s), 6);
      inked("#734A35", () => g.roundRect(40 * s, 0, 140 * s, 70 * s, 20 * s), 5); inked(GOLD, () => g.arc(90 * s, 35 * s, 12 * s, 0, TAU), 3);
      g.restore();
    },
    // Shop stall with a "Verified seller" badge.
    seller(x, y, s, t, ready) {
      g.save(); g.translate(x, y);
      inked("#2B2440", () => g.rect(-160 * s, -60 * s, 320 * s, 200 * s), 6);
      for (let i = 0; i < 6; i++) inked(i % 2 ? CREAM : ORANGE, () => { g.moveTo(-170 * s + i * 56.6 * s, -110 * s); g.lineTo(-170 * s + (i + 1) * 56.6 * s, -110 * s); g.quadraticCurveTo(-170 * s + (i + 0.5) * 56.6 * s, -40 * s, -170 * s + i * 56.6 * s, -110 * s); }, 3);
      inked(ORANGE, () => g.rect(-180 * s, -150 * s, 360 * s, 44 * s), 5); text("MY SHOP", 0, -127 * s, 26 * s, "#fff", 700, "SG");
      g.fillStyle = "rgba(255,200,110,.35)"; g.fillRect(-140 * s, -30 * s, 280 * s, 150 * s);
      for (let i = 0; i < 3; i++) inked([TEAL, GOLD, CREAM][i], () => g.rect(-110 * s + i * 80 * s, 40 * s, 60 * s, 60 * s), 4);
      if (ready > 0) { g.save(); g.translate(110 * s, -170 * s); g.scale(back(ready), back(ready)); g.rotate(Math.sin(t * 3) * 0.05); tick(0, 0, 50 * s, 1); g.restore(); g.save(); g.translate(0, 190 * s); g.scale(back(ready), back(ready)); inked(DARK, () => g.roundRect(-150 * s, -32 * s, 300 * s, 64 * s, 32 * s), 5); text("Verified seller", 0, 2 * s, 28 * s, CREAM, 700); g.restore(); }
      g.restore();
    },
    // Help chat: a question and a reply bubble.
    chat(x, y, s, t, ready) {
      g.save(); g.translate(x, y);
      const bub = (bx, by, w, h, fill, tail, lines, col) => { inked(fill, () => { g.roundRect(bx - w / 2, by - h / 2, w, h, 26 * s); g.moveTo(bx + tail * w * 0.3, by + h / 2 - 2); g.lineTo(bx + tail * w * 0.42, by + h / 2 + 30 * s); g.lineTo(bx + tail * w * 0.12, by + h / 2 - 2); }, 5); lines.forEach((l, i) => text(l, bx, by + (i - (lines.length - 1) / 2) * 34 * s, 28 * s, col, 600)); };
      const p1 = clamp(ready * 2), p2 = clamp(ready * 2 - 1);
      if (p1 > 0) { g.save(); g.translate(0, -90 * s); g.scale(back(p1), back(p1)); bub(-30 * s, 0, 330 * s, 110 * s, CREAM, -1, ["My order is", "taking long?"], INK); g.restore(); }
      if (p2 > 0) { g.save(); g.translate(0, 90 * s); g.scale(back(p2), back(p2)); bub(30 * s, 0, 330 * s, 110 * s, ORANGE, 1, ["We're here.", "Let's sort it."], "#fff"); g.restore(); }
      g.restore();
    },
    // Free business documents: invoice, receipt, CV fanned out.
    docs(x, y, s, t, ready) {
      g.save(); g.translate(x, y);
      ["CV", "RECEIPT", "INVOICE"].forEach((name, i) => {
        const p = clamp(ready * 1.6 - i * 0.25), a = (i - 1) * 0.22 * p;
        g.save(); g.rotate(a); g.translate((i - 1) * 70 * s * p, 0);
        inked("#FFFFFF", () => g.rect(-120 * s, -160 * s, 240 * s, 320 * s), 5);
        g.fillStyle = i === 2 ? ORANGE : i === 1 ? TEAL : "#6B3BFF"; g.fillRect(-120 * s, -160 * s, 240 * s, 56 * s);
        text(name, 0, -132 * s, 26 * s, "#fff", 700, "SG");
        g.fillStyle = "#D5D8E0"; for (let r = 0; r < 6; r++) g.fillRect(-90 * s, -70 * s + r * 34 * s, (r % 3 === 2 ? 110 : 180) * s, 12 * s);
        g.restore();
      });
      if (ready > 0.7) { g.save(); g.translate(130 * s, -170 * s); g.rotate(-0.2); g.scale(back(clamp((ready - 0.7) / 0.3)), back(clamp((ready - 0.7) / 0.3))); inked(GOLD, () => g.arc(0, 0, 54 * s, 0, TAU), 5); text("FREE", 0, 2 * s, 28 * s, INK, 700, "SG"); g.restore(); }
      g.restore();
    },
  };

  // The "wahala" blob: an original purple problem-monster with a label on its belly.
  P.blob = (x, y, s, t, label, hitT) => {
    g.save();
    if (hitT >= 0) { g.translate(x + hitT * 1500 * s, y - hitT * 900 * s + hitT * hitT * 1200 * s); g.rotate(hitT * 12); const k = Math.max(0, 1 - hitT * 0.9); g.scale(k, k); }
    else { g.translate(x, y + Math.sin(t * 5) * 10 * s); g.scale(1 + Math.sin(t * 5) * 0.03, 1 - Math.sin(t * 5) * 0.03); }
    const R = 120 * s;
    inked("#7B3FC4", () => { g.moveTo(-R, R * 0.6); for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI, rr = R * (1 + (i % 2 ? 0.08 : -0.02) + Math.sin(t * 6 + i) * 0.03); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.95); } g.quadraticCurveTo(R * 1.05, R * 0.75, 0, R * 0.8); g.quadraticCurveTo(-R * 1.05, R * 0.75, -R, R * 0.6); }, 6);
    g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.ellipse(-R * 0.4, -R * 0.55, R * 0.25, R * 0.14, -0.5, 0, TAU); g.fill();
    for (const ex of [-0.32, 0.32]) { inked("#fff", () => g.ellipse(ex * R, -R * 0.32, R * 0.2, R * 0.24, 0, 0, TAU), 4); g.fillStyle = INK; g.beginPath(); g.arc(ex * R - R * 0.06, -R * 0.28, R * 0.1, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = 9 * s; g.lineCap = "round"; g.beginPath(); g.moveTo(ex * R - R * 0.2 * Math.sign(ex) * -1 - R * 0.14, -R * 0.62); g.lineTo(ex * R + R * 0.18 * Math.sign(ex) * -1 + R * 0.04, -R * 0.52); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 7 * s; g.beginPath(); g.moveTo(-R * 0.25, R * 0.02); g.quadraticCurveTo(0, -R * 0.1, R * 0.25, R * 0.02); g.stroke();
    if (label) { const fs = Math.min(40 * s, (R * 1.7) / (label.length * 0.55)); text(label.toUpperCase(), 0, R * 0.38, fs, CREAM, 700, "SG"); }
    g.restore();
  };

  // A crate on a brick pillar; breaks into four planks.
  P.crate = (x, y, s, label, hitT, groundY) => {
    const S = 190 * s;
    inked("#8D8A96", () => g.rect(x - 50 * s, y + S / 2, 100 * s, groundY - y - S / 2), 5);
    if (hitT < 0) {
      inked("#C98B4E", () => g.rect(x - S / 2, y - S / 2, S, S), 6);
      g.strokeStyle = "#7A4A22"; g.lineWidth = 8 * s; g.beginPath(); g.moveTo(x - S / 2, y - S / 2); g.lineTo(x + S / 2, y + S / 2); g.moveTo(x + S / 2, y - S / 2); g.lineTo(x - S / 2, y + S / 2); g.stroke();
      g.lineWidth = 5; g.strokeStyle = INK; g.strokeRect(x - S / 2 + 14 * s, y - S / 2 + 14 * s, S - 28 * s, S - 28 * s);
      if (label) { g.fillStyle = "rgba(244,242,238,.92)"; g.fillRect(x - S / 2 + 10 * s, y - 24 * s, S - 20 * s, 48 * s); const fs = Math.min(30 * s, (S * 0.9) / (label.length * 0.6)); text(label.toUpperCase(), x, y + 2 * s, fs, "#3A1A0A", 700, "SG"); }
      return;
    }
    for (let i = 0; i < 4; i++) {
      const dx = (i % 2 ? 1 : -1), dy = i < 2 ? -1 : 1;
      g.save(); g.translate(x + dx * (30 + hitT * 520) * s, y + dy * 20 * s - hitT * 300 * s + hitT * hitT * 2000 * s); g.rotate(dx * hitT * 7 + i);
      inked("#C98B4E", () => g.rect(-S / 2, -16 * s, S, 32 * s), 5); g.restore();
    }
  };

  // Training scroll with numbered steps.
  P.scroll = (x, y, w, h, s, open, heading, steps, t) => {
    const hh = h * clamp(open);
    g.save(); g.translate(x, y);
    inked("#F3E3C0", () => g.rect(-w / 2, -h / 2, w, hh), 5);
    g.save(); g.beginPath(); g.rect(-w / 2, -h / 2, w, hh); g.clip();
    text(heading, 0, -h / 2 + 56 * s, 44 * s, "#7A2E12", 700, "SG");
    g.strokeStyle = "rgba(122,46,18,.4)"; g.lineWidth = 3; g.beginPath(); g.moveTo(-w / 2 + 40 * s, -h / 2 + 92 * s); g.lineTo(w / 2 - 40 * s, -h / 2 + 92 * s); g.stroke();
    const rowH = (h - 130 * s) / steps.length;
    steps.forEach((st, i) => {
      const cy = -h / 2 + 120 * s + rowH * (i + 0.5), p = clamp((t - 0.6 - i * 0.45) / 0.3);
      if (p <= 0) return;
      g.save(); g.globalAlpha = p; g.translate((1 - back(p)) * -40 * s, 0);
      inked(ORANGE, () => g.arc(-w / 2 + 64 * s, cy, 30 * s, 0, TAU), 4); text(String(i + 1), -w / 2 + 64 * s, cy + 2 * s, 32 * s, "#fff", 700, "SG");
      // wrap the step text into at most two lines
      g.font = `600 ${36 * s}px Geist`; const maxW = w - 150 * s, words = st.split(" "), lines = [""];
      for (const wd of words) { const tr = lines[lines.length - 1] ? lines[lines.length - 1] + " " + wd : wd; if (g.measureText(tr).width > maxW && lines[lines.length - 1]) lines.push(wd); else lines[lines.length - 1] = tr; }
      lines.forEach((ln, j) => text(ln, -w / 2 + 110 * s, cy + (j - (lines.length - 1) / 2) * 42 * s, 36 * s, "#2A1A10", 600, "Geist", "left"));
      g.restore();
    });
    g.restore();
    for (const yy of [-h / 2, -h / 2 + hh]) { inked("#8A3A1A", () => g.roundRect(-w / 2 - 24 * s, yy - 16 * s, w + 48 * s, 32 * s, 16 * s), 5); inked(GOLD, () => { g.arc(-w / 2 - 24 * s, yy, 14 * s, 0, TAU); }, 3); inked(GOLD, () => { g.arc(w / 2 + 24 * s, yy, 14 * s, 0, TAU); }, 3); }
    g.restore();
  };
  return P;
}
