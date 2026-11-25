// Kung Fu Kunle: an original cartoon character for Almighty Pumps ads, drawn on a 2D canvas with a small bone rig.
// Angles are in degrees. Limbs use dir(a): 0 points down, 90 points forward (the way he faces), 180 points up.
// The torso uses t: 0 upright, positive leans forward. Knees bend with negative values, elbows with positive ones.

export const INK = "#140E0C";
export const COL = {
  skin: "#7A4A2E", skinDark: "#5C341F", skinLight: "#946042",
  hair: "#1A120F", gi: "#FF5A1F", giDark: "#D9440F", teal: "#13A3A0", yellow: "#FFC83A", cream: "#F4F2EE",
  pants: "#1E1F2A", pantsDark: "#14151D", sash: "#17171F", shoe: "#F4F2EE", sole: "#2A2A33",
};
const D = Math.PI / 180;
const dir = (a) => [Math.sin(a * D), Math.cos(a * D)];
const up = (a) => [Math.sin(a * D), -Math.cos(a * D)];
const add = (p, v, s = 1) => [p[0] + v[0] * s, p[1] + v[1] * s];
const L = { torso: 150, shoulder: 128, neck: 22, head: 58, uarm: 80, farm: 76, thigh: 98, shin: 98 };

/** Named poses. Missing values fall back to `stance`. */
export const POSES = {
  stance: { t: 4, h: 0, fa: 30, fe: 85, ba: -15, be: 95, ft: 26, fk: -18, bt: -24, bk: -10, fh: "fist", bh: "fist", face: "focus" },
  guard: { t: 8, h: -2, fa: 62, fe: 55, ba: 25, be: 105, ft: 42, fk: -48, bt: -40, bk: -20, fh: "open", bh: "fist", face: "focus" },
  windup: { t: -10, h: 4, fa: 205, fe: -25, ba: -40, be: 70, ft: 40, fk: -45, bt: -40, bk: -22, fh: "open", bh: "fist", face: "shout" },
  chop: { t: 22, h: 4, fa: 70, fe: 4, ba: -50, be: 110, ft: 52, fk: -62, bt: -46, bk: -14, fh: "open", bh: "fist", face: "shout" },
  punch: { t: 14, h: 0, fa: 92, fe: 0, ba: -25, be: 125, ft: 46, fk: -44, bt: -48, bk: -6, fh: "fist", bh: "fist", face: "shout" },
  punch2: { t: 16, h: 0, fa: 20, fe: 120, ba: 92, be: 0, ft: 46, fk: -44, bt: -48, bk: -6, fh: "fist", bh: "fist", face: "shout" },
  chamber: { t: -4, h: 0, fa: 40, fe: 60, ba: 30, be: 90, ft: 95, fk: -120, bt: -6, bk: -4, fh: "fist", bh: "fist", face: "focus" },
  kick: { t: -28, h: 8, fa: 60, fe: 70, ba: -70, be: 40, ft: 128, fk: -4, bt: -10, bk: -4, fh: "fist", bh: "open", face: "shout" },
  crane: { t: 0, h: -4, fa: 150, fe: -30, ba: -150, be: 30, ft: 86, fk: -118, bt: -2, bk: 0, fh: "open", bh: "open", face: "focus" },
  fly: { t: -12, h: 6, fa: 125, fe: 30, ba: -85, be: 60, ft: 100, fk: -2, bt: 30, bk: -150, fh: "fist", bh: "open", face: "shout" },
  land: { t: 18, h: -10, fa: 75, fe: 30, ba: -70, be: 30, ft: 82, fk: -135, bt: -55, bk: -100, fh: "open", bh: "open", face: "focus" },
  palm: { t: 10, h: 0, fa: 88, fe: 6, ba: 20, be: 110, ft: 46, fk: -50, bt: -44, bk: -10, fh: "open", bh: "fist", face: "shout" },
  thumb: { t: 0, h: -6, fa: 40, fe: 110, ba: -6, be: 12, ft: 16, fk: -6, bt: -14, bk: -4, fh: "thumb", bh: "fist", face: "wink" },
  salute: { t: 12, h: 8, fa: 62, fe: 96, ba: 62, be: 102, ft: 6, fk: -2, bt: -6, bk: -2, fh: "fist", bh: "open", face: "smile" },
  point: { t: 2, h: -4, fa: 120, fe: 6, ba: -10, be: 30, ft: 20, fk: -8, bt: -18, bk: -6, fh: "point", bh: "fist", face: "smile" },
};

const ease = {
  linear: (x) => x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  back: (x) => { const c = 2.2; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
  snap: (x) => 1 - Math.pow(1 - x, 6),
};
export { ease };

/** Pose at time t from keys [{t, pose: "name" | {...}, ease?}]. */
export function poseAt(keys, t) {
  const get = (k) => (typeof k.pose === "string" ? { ...POSES.stance, ...POSES[k.pose], ...(k.with || {}) } : { ...POSES.stance, ...k.pose });
  if (t <= keys[0].t) return get(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i].t) {
      const a = get(keys[i - 1]), b = get(keys[i]);
      const p = (ease[keys[i].ease || "back"])((t - keys[i - 1].t) / (keys[i].t - keys[i - 1].t));
      const out = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const va = a[k] ?? b[k], vb = b[k] ?? a[k];
        out[k] = typeof va === "number" && typeof vb === "number" ? va + (vb - va) * p : p < 0.35 ? va : vb;
      }
      return out;
    }
  }
  return get(keys[keys.length - 1]);
}

function joints(p) {
  const hip = [0, 0];
  const neck = add(hip, up(p.t), L.torso);
  const sh = add(hip, up(p.t), L.shoulder);
  const head = add(neck, up(p.t + p.h), L.neck + L.head * 0.82);
  const arm = (a, e, off) => {
    const s = add(sh, up(p.t + 90), off);
    const a1 = a - p.t, el = add(s, dir(a1), L.uarm), a2 = a1 + e, hand = add(el, dir(a2), L.farm);
    return { s, el, hand, a1, a2 };
  };
  const leg = (th, kn, off) => {
    const h = add(hip, [1, 0], off), knee = add(h, dir(th), L.thigh), a2 = th + kn, ankle = add(knee, dir(a2), L.shin);
    return { h, knee, ankle, a1: th, a2 };
  };
  return { hip, neck, sh, head, fArm: arm(p.fa, p.fe, 8), bArm: arm(p.ba, p.be, -10), fLeg: leg(p.ft, p.fk, 10), bLeg: leg(p.bt, p.bk, -10) };
}

/** Lowest point of the feet relative to the hip, so callers can stand him on the ground. */
export function footDrop(p) {
  const j = joints(p);
  return Math.max(j.fLeg.ankle[1], j.bLeg.ankle[1]) + 14;
}

function seg(g, a, b, r0, r1) {
  const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
  g.moveTo(a[0] + Math.cos(th + Math.PI / 2) * r0, a[1] + Math.sin(th + Math.PI / 2) * r0);
  g.arc(a[0], a[1], r0, th + Math.PI / 2, th + Math.PI * 1.5);
  g.arc(b[0], b[1], r1, th - Math.PI / 2, th + Math.PI / 2);
  g.closePath();
}
function limb(g, parts, fill, ink = 6) {
  g.fillStyle = INK; g.beginPath();
  for (const [a, b, r0, r1] of parts) { seg(g, a, b, r0 + ink, r1 + ink); }
  g.fill();
  g.fillStyle = fill;
  for (const [a, b, r0, r1, f] of parts) { g.fillStyle = f || fill; g.beginPath(); seg(g, a, b, r0, r1); g.fill(); }
}
function blob(g, fill, path, ink = 6) {
  g.beginPath(); path(); g.lineJoin = "round"; g.lineWidth = ink * 2; g.strokeStyle = INK; g.stroke(); g.fillStyle = fill; g.fill();
}

function hand(g, at, ang, kind, shade) {
  g.save(); g.translate(at[0], at[1]); g.rotate(-ang * D);
  const skin = shade ? COL.skinDark : COL.skin;
  if (kind === "open" || kind === "point") {
    // flat hand along the forearm: palm and straight fingers
    blob(g, skin, () => { g.roundRect(-15, -6, 30, kind === "point" ? 30 : 42, 12); });
    if (kind === "open") { g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-4, 20); g.lineTo(-4, 34); g.moveTo(5, 20); g.lineTo(5, 34); g.stroke(); }
    else blob(g, skin, () => { g.roundRect(-5, 16, 10, 32, 5); }, 4);
    blob(g, skin, () => { g.ellipse(13, 10, 6, 10, -0.5, 0, Math.PI * 2); }, 4);
  } else {
    blob(g, skin, () => { g.arc(0, 10, 17, 0, Math.PI * 2); });
    g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-9, 18); g.quadraticCurveTo(0, 22, 9, 18); g.stroke();
    if (kind === "thumb") blob(g, skin, () => { g.roundRect(8, -16, 12, 26, 6); }, 4);
  }
  g.restore();
}

function shoe(g, ankle, shin, shade) {
  // flat on the ground when standing, turning with the shin on big kicks
  const w = Math.min(1, Math.max(0, (Math.abs(shin) - 25) / 70)), f = 90 + shin * w;
  g.save(); g.translate(ankle[0], ankle[1]); g.rotate((90 - f) * D);
  // shoe points "forward" relative to the shin: along +x in this frame
  blob(g, shade ? "#D9D6CF" : COL.shoe, () => { g.moveTo(-14, -10); g.lineTo(30, -6); g.quadraticCurveTo(46, 0, 42, 12); g.lineTo(-16, 12); g.quadraticCurveTo(-22, 0, -14, -10); });
  g.fillStyle = COL.sole; g.fillRect(-16, 8, 58, 6);
  g.strokeStyle = COL.gi; g.lineWidth = 5; g.beginPath(); g.moveTo(-6, 2); g.lineTo(16, -4); g.stroke();
  g.restore();
}

function ankara(g, w, h) {
  // Geometric wax-print style pattern (original): rows of circles, diamonds and dots.
  g.fillStyle = COL.gi; g.fillRect(-w, -h, w * 2, h * 2);
  for (let y = -h, r = 0; y < h; y += 34, r++) {
    for (let x = -w + (r % 2) * 22; x < w; x += 44) {
      g.fillStyle = COL.giDark; g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 10, y); g.lineTo(x, y + 12); g.lineTo(x - 10, y); g.fill();
      g.fillStyle = COL.teal; g.beginPath(); g.arc(x + 22, y + 17, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = COL.yellow; g.beginPath(); g.arc(x + 22, y + 17, 3.5, 0, Math.PI * 2); g.fill();
    }
  }
}

/** Draw Kunle. pose from poseAt(); x,y = hip position; k = scale; flip = face left; time for idle motion. */
export function drawKunle(g, pose, { x, y, k = 1, flip = false, time = 0, ghost = 0, tint } = {}) {
  const p = { ...pose };
  const breathe = Math.sin(time * 3.2) * 1.5;
  const j = joints(p);
  g.save();
  g.translate(x, y); g.scale(flip ? -k : k, k);
  if (p.sq) g.scale(1 + p.sq * 0.12, 1 - p.sq * 0.12);
  if (ghost) g.globalAlpha = ghost;

  // headband tails (behind everything)
  const knot = add(j.head, up(p.t + p.h - 80), L.head * 0.98);
  const knotY = add(knot, up(p.t + p.h), -4);
  for (let i = 0; i < 2; i++) {
    const wave = Math.sin(time * 9 + i * 1.7) * 14, len = 70 + i * 16;
    g.strokeStyle = INK; g.lineCap = "round"; g.lineWidth = 22;
    const ex = knotY[0] - len, ey = knotY[1] + 18 + i * 18 + wave;
    g.beginPath(); g.moveTo(knotY[0], knotY[1]); g.quadraticCurveTo(knotY[0] - len * 0.5, knotY[1] - 10 + wave * 0.5 + i * 10, ex, ey); g.stroke();
    g.strokeStyle = i ? COL.giDark : COL.gi; g.lineWidth = 11; g.stroke();
  }

  // back arm
  limb(g, [[j.bArm.s, j.bArm.el, 17, 15, COL.giDark], [j.bArm.el, j.bArm.hand, 14, 12, COL.skinDark]], COL.giDark);
  hand(g, j.bArm.hand, j.bArm.a2, p.bh, true);
  // legs
  for (const [lg, shade] of [[j.bLeg, true], [j.fLeg, false]]) {
    limb(g, [[lg.h, lg.knee, 23, 20], [lg.knee, lg.ankle, 20, 17]], shade ? COL.pantsDark : COL.pants);
    shoe(g, lg.ankle, lg.a2, shade);
  }

  // torso
  g.save(); g.translate(0, breathe * 0.3); g.rotate(p.t * D);
  const torso = () => { g.moveTo(-40, 14); g.quadraticCurveTo(-52, -70, -46, -120); g.quadraticCurveTo(-40, -146, 0, -148); g.quadraticCurveTo(44, -146, 50, -118); g.quadraticCurveTo(54, -70, 40, 14); g.closePath(); };
  g.beginPath(); torso(); g.lineWidth = 12; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke();
  g.save(); g.beginPath(); torso(); g.clip(); ankara(g, 70, 170);
  g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(-60, -160, 26, 190);
  // V neck and trim
  g.fillStyle = COL.skin; g.beginPath(); g.moveTo(-6, -150); g.lineTo(14, -104); g.lineTo(34, -150); g.fill();
  g.strokeStyle = COL.teal; g.lineWidth = 7; g.beginPath(); g.moveTo(-8, -150); g.lineTo(14, -102); g.lineTo(36, -150); g.stroke();
  g.restore();
  // sash with the AP chevron on the knot
  blob(g, COL.sash, () => { g.moveTo(-46, -14); g.lineTo(48, -16); g.lineTo(46, 12); g.lineTo(-44, 14); g.closePath(); }, 5);
  blob(g, COL.sash, () => { g.moveTo(26, 0); g.lineTo(44, 40 + Math.sin(time * 7) * 4); g.lineTo(32, 44); g.lineTo(18, 6); g.closePath(); }, 4);
  g.strokeStyle = COL.gi; g.lineWidth = 6; g.lineJoin = "miter"; g.beginPath(); g.moveTo(14, 8); g.lineTo(24, -6); g.lineTo(34, 8); g.stroke();
  g.restore();

  // neck + head
  g.save(); g.translate(0, breathe * 0.5);
  limb(g, [[add(j.neck, up(p.t), -14), add(j.neck, up(p.t + p.h), 22), 17, 16]], COL.skin, 5);
  drawHead(g, j.head, p.t + p.h, p.face, time);
  g.restore();

  // front arm
  limb(g, [[j.fArm.s, j.fArm.el, 18, 16, COL.gi], [j.fArm.el, j.fArm.hand, 15, 13, COL.skin]], COL.gi);
  // sleeve cuff
  g.save(); g.translate(j.fArm.el[0], j.fArm.el[1]); g.rotate(-j.fArm.a1 * D); g.fillStyle = COL.teal; g.fillRect(-17, -9, 34, 8); g.restore();
  hand(g, j.fArm.hand, j.fArm.a2, p.fh, false);

  if (tint) { g.globalCompositeOperation = "source-atop"; g.fillStyle = tint; g.fillRect(-400, -500, 800, 900); }
  g.restore();
}

function drawHead(g, c, ang, face, time) {
  g.save(); g.translate(c[0], c[1]); g.rotate(ang * D);
  const R = L.head;
  // back ear
  blob(g, COL.skin, () => { g.ellipse(-20, 6, 12, 15, 0, 0, Math.PI * 2); }, 5);
  // head shape: big round cranium and a strong jaw
  const shape = () => { g.moveTo(-R * 0.86, -R * 0.2); g.quadraticCurveTo(-R * 0.9, -R * 1.02, 0, -R * 1.02); g.quadraticCurveTo(R * 0.96, -R, R * 0.98, -R * 0.15); g.quadraticCurveTo(R * 1.04, R * 0.55, R * 0.5, R * 0.86); g.quadraticCurveTo(0, R * 1.02, -R * 0.58, R * 0.62); g.quadraticCurveTo(-R * 0.9, R * 0.3, -R * 0.86, -R * 0.2); g.closePath(); };
  blob(g, COL.skin, shape);
  g.save(); g.beginPath(); shape(); g.clip();
  g.fillStyle = COL.skinDark; g.beginPath(); g.ellipse(-R * 0.9, R * 0.1, R * 0.45, R * 1.1, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = COL.skinLight; g.beginPath(); g.ellipse(R * 0.45, -R * 0.45, R * 0.22, R * 0.14, -0.4, 0, Math.PI * 2); g.fill();
  // hair: high-top fade
  g.fillStyle = "#2A1D17"; g.fillRect(-R, -R * 0.62, R * 0.7, R * 0.8);
  g.restore();
  blob(g, COL.hair, () => { g.moveTo(-R * 0.86, -R * 0.4); g.lineTo(-R * 0.92, -R * 1.62); g.quadraticCurveTo(-R * 0.9, -R * 1.78, -R * 0.7, -R * 1.78); g.lineTo(R * 0.74, -R * 1.72); g.quadraticCurveTo(R * 0.92, -R * 1.7, R * 0.9, -R * 1.5); g.lineTo(R * 0.86, -R * 0.62); g.quadraticCurveTo(0, -R * 0.78, -R * 0.86, -R * 0.4); g.closePath(); });
  g.strokeStyle = "#3A2A22"; g.lineWidth = 3; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-R * 0.7 + i * R * 0.34, -R * 1.66); g.lineTo(-R * 0.72 + i * R * 0.34, -R * 1.0); g.stroke(); }
  // headband with AP orange and a teal stripe
  blob(g, COL.gi, () => { g.moveTo(-R * 0.9, -R * 0.56); g.lineTo(R * 0.92, -R * 0.82); g.lineTo(R * 0.94, -R * 0.56); g.lineTo(-R * 0.88, -R * 0.3); g.closePath(); }, 5);
  g.strokeStyle = COL.teal; g.lineWidth = 4; g.beginPath(); g.moveTo(-R * 0.88, -R * 0.43); g.lineTo(R * 0.93, -R * 0.69); g.stroke();
  // knot
  blob(g, COL.giDark, () => { g.ellipse(-R * 0.92, -R * 0.44, 11, 14, 0.3, 0, Math.PI * 2); }, 4);
  // eyes
  const blink = (Math.sin(time * 1.3) > 0.985) ? 0.15 : 1;
  const eye = (x, y, s, closed) => {
    if (closed || blink < 1) { g.strokeStyle = INK; g.lineWidth = 5; g.lineCap = "round"; g.beginPath(); g.moveTo(x - 10 * s, y); g.quadraticCurveTo(x, y + 7, x + 10 * s, y); g.stroke(); return; }
    blob(g, "#fff", () => { g.ellipse(x, y, 10 * s, 13, 0, 0, Math.PI * 2); }, 3);
    g.fillStyle = INK; g.beginPath(); g.ellipse(x + 3.5 * s, y + 1, 5.5 * s, 7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(x + 5 * s, y - 2, 2, 0, Math.PI * 2); g.fill();
  };
  eye(R * 0.18, -R * 0.12, 0.85, false);
  eye(R * 0.62, -R * 0.12, 1, face === "wink");
  // brows: thick, angled down to the middle when focused
  const angry = face === "focus" || face === "shout";
  g.strokeStyle = INK; g.lineCap = "round"; g.lineWidth = 9;
  g.beginPath(); g.moveTo(R * 0.02, angry ? -R * 0.42 : -R * 0.46); g.lineTo(R * 0.34, angry ? -R * 0.32 : -R * 0.46); g.stroke();
  g.beginPath(); g.moveTo(R * 0.46, angry ? -R * 0.34 : -R * 0.48); g.lineTo(R * 0.86, angry ? -R * 0.46 : -R * 0.5); g.stroke();
  // nose
  g.lineWidth = 4; g.beginPath(); g.moveTo(R * 0.86, R * 0.02); g.quadraticCurveTo(R * 1.0, R * 0.2, R * 0.82, R * 0.26); g.stroke();
  // beard (chin)
  blob(g, COL.hair, () => { g.moveTo(R * 0.1, R * 0.62); g.quadraticCurveTo(R * 0.5, R * 0.6, R * 0.8, R * 0.5); g.quadraticCurveTo(R * 0.7, R * 0.98, R * 0.36, R * 0.96); g.quadraticCurveTo(R * 0.12, R * 0.9, R * 0.1, R * 0.62); g.closePath(); }, 3);
  // mouth
  g.lineWidth = 5; g.strokeStyle = INK;
  if (face === "shout") {
    blob(g, "#3A0F0B", () => { g.moveTo(R * 0.34, R * 0.36); g.lineTo(R * 0.86, R * 0.32); g.quadraticCurveTo(R * 0.8, R * 0.78, R * 0.52, R * 0.74); g.quadraticCurveTo(R * 0.34, R * 0.66, R * 0.34, R * 0.36); g.closePath(); }, 3);
    g.fillStyle = "#fff"; g.fillRect(R * 0.4, R * 0.35, R * 0.42, 7);
  } else if (face === "smile" || face === "wink") {
    blob(g, "#fff", () => { g.moveTo(R * 0.32, R * 0.34); g.quadraticCurveTo(R * 0.6, R * 0.4, R * 0.88, R * 0.28); g.quadraticCurveTo(R * 0.74, R * 0.64, R * 0.5, R * 0.6); g.quadraticCurveTo(R * 0.36, R * 0.54, R * 0.32, R * 0.34); g.closePath(); }, 3);
  } else {
    g.beginPath(); g.moveTo(R * 0.44, R * 0.44); g.quadraticCurveTo(R * 0.64, R * 0.38, R * 0.82, R * 0.42); g.stroke();
  }
  // front ear hint (3/4 view: only the back ear shows, so nothing here)
  g.restore();
}
