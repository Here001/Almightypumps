// "Tayo", the cartoon guide: a toon-shaded 3D figure with a headset who talks (mouth flaps), blinks and gestures.
// Also small toon icons (heart, chat, play, browser, search, gear, chart, calendar, code) that float around him.
import { THREE, BRAND, clamp, lerp, E } from "./core.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

let grad;
function gradientMap() {
  if (grad) return grad;
  const d = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
  grad = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  return grad;
}
const toon = (color, emissive) => new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...(emissive ? { emissive, emissiveIntensity: 1.2 } : {}) });
const OUTLINE = new THREE.ShaderMaterial({
  uniforms: { uW: { value: 0.022 } },
  vertexShader: `uniform float uW; void main(){ vec3 p = position + normal * uW; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  fragmentShader: `void main(){ gl_FragColor = vec4(0.02, 0.02, 0.035, 1.0); }`,
  side: THREE.BackSide,
});
/** A toon mesh with an ink outline. */
function part(geo, mat, outline = true) {
  const m = new THREE.Mesh(geo, mat);
  if (outline) { const o = new THREE.Mesh(geo, OUTLINE); o.raycast = () => {}; m.add(o); }
  return m;
}
const sphere = (r, w = 32, h = 24) => new THREE.SphereGeometry(r, w, h);
const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20);

const C = { skin: "#8A5A3C", skinDark: "#6E452D", hair: "#17120F", hoodie: "#353C50", pants: "#232734", shoe: "#F4F2EE", white: "#F7F5F0", pupil: "#141018", mouth: "#3A0F12", tongue: "#E0605A", accent: BRAND.accent };

/** An arm hanging from a shoulder pivot; returns { shoulder, elbow, hand }. */
function arm(side) {
  const shoulder = new THREE.Group();
  const upper = part(capsule(0.12, 0.42), toon(C.hoodie)); upper.position.y = -0.27; shoulder.add(upper);
  const elbow = new THREE.Group(); elbow.position.y = -0.52; shoulder.add(elbow);
  const fore = part(capsule(0.105, 0.36), toon(C.hoodie)); fore.position.y = -0.22; elbow.add(fore);
  const cuff = part(new THREE.CylinderGeometry(0.115, 0.115, 0.07, 20), toon(C.accent)); cuff.position.y = -0.43; elbow.add(cuff);
  const hand = new THREE.Group(); hand.position.y = -0.55; elbow.add(hand);
  const palm = part(sphere(0.13), toon(C.skin)); palm.scale.set(1, 1.05, 0.8); hand.add(palm);
  const thumb = part(capsule(0.045, 0.08), toon(C.skin)); thumb.position.set(side * -0.11, 0.03, 0.04); thumb.rotation.z = side * 0.7; hand.add(thumb);
  return { shoulder, elbow, hand, thumb };
}

export function makeToon() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  // Legs and shoes
  for (const sx of [-1, 1]) {
    const leg = part(capsule(0.14, 0.62), toon(C.pants)); leg.position.set(sx * 0.19, 0.55, 0); body.add(leg);
    const shoe = part(new RoundedBoxGeometry(0.3, 0.16, 0.44, 4, 0.07), toon(C.shoe)); shoe.position.set(sx * 0.2, 0.1, 0.07); body.add(shoe);
    const sole = part(new RoundedBoxGeometry(0.31, 0.05, 0.45, 2, 0.02), toon(C.accent), false); sole.position.set(sx * 0.2, 0.03, 0.07); body.add(sole);
  }
  // Torso (hoodie) with the AP chevron on the chest
  const torso = new THREE.Group(); torso.position.y = 1.0; body.add(torso);
  const chest = part(capsule(0.42, 0.42), toon(C.hoodie)); chest.position.y = 0.45; chest.scale.set(1, 1, 0.78); torso.add(chest);
  const pocket = part(new RoundedBoxGeometry(0.5, 0.18, 0.06, 3, 0.03), toon("#262B38"), false); pocket.position.set(0, 0.2, 0.33); torso.add(pocket);
  const chev = new THREE.Shape(); chev.moveTo(-0.13, -0.06); chev.lineTo(0, 0.08); chev.lineTo(0.13, -0.06); chev.lineTo(0.09, -0.06); chev.lineTo(0, 0.035); chev.lineTo(-0.09, -0.06);
  const badge = part(new THREE.ExtrudeGeometry(chev, { depth: 0.03, bevelEnabled: false }), toon(C.accent, C.accent), false); badge.position.set(0.17, 0.62, 0.31); badge.rotation.y = 0.25; torso.add(badge);
  const collar = part(new THREE.TorusGeometry(0.2, 0.06, 12, 32), toon(C.accent)); collar.rotation.x = Math.PI / 2; collar.position.y = 0.88; torso.add(collar);
  // Arms
  const L = arm(-1), R = arm(1);
  L.shoulder.position.set(-0.47, 0.78, 0); R.shoulder.position.set(0.47, 0.78, 0);
  torso.add(L.shoulder, R.shoulder);

  // Head
  const neck = new THREE.Group(); neck.position.y = 0.92; torso.add(neck);
  const neckM = part(new THREE.CylinderGeometry(0.12, 0.13, 0.16, 16), toon(C.skinDark)); neckM.position.y = 0.05; neck.add(neckM);
  const head = new THREE.Group(); head.position.y = 0.6; head.scale.setScalar(1.12); neck.add(head);
  const skull = part(sphere(0.5, 48, 36), toon(C.skin)); skull.scale.set(1, 1.04, 0.95); head.add(skull);
  // Hair: a bumpy cap
  const hairGeo = sphere(0.53, 48, 24); { const p = hairGeo.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.045 * Math.sin(v.x * 38) * Math.sin(v.y * 41) * Math.sin(v.z * 37); v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z); } hairGeo.computeVertexNormals(); }
  const hair = part(hairGeo, toon(C.hair)); hair.scale.set(1.04, 0.86, 1.0); hair.position.set(0, 0.2, -0.07); head.add(hair);
  for (const sx of [-1, 1]) { const ear = part(sphere(0.11), toon(C.skin)); ear.position.set(sx * 0.48, -0.02, 0); ear.scale.set(0.6, 1, 0.8); head.add(ear); }
  const nose = part(sphere(0.07), toon(C.skinDark)); nose.position.set(0, -0.06, 0.47); nose.scale.set(1.2, 0.9, 0.9); head.add(nose);
  // Eyes
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(sx * 0.18, 0.08, 0.41); head.add(eye);
    const ball = part(sphere(0.12), toon(C.white)); ball.scale.set(1, 1.15, 0.6); eye.add(ball);
    const pupil = new THREE.Mesh(sphere(0.065), new THREE.MeshBasicMaterial({ color: C.pupil })); pupil.position.z = 0.06; pupil.scale.set(1, 1.1, 0.5); eye.add(pupil);
    const glint = new THREE.Mesh(sphere(0.022), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false })); glint.position.set(0.025, 0.035, 0.09); eye.add(glint);
    const brow = part(capsule(0.025, 0.14), toon(C.hair), false); brow.rotation.z = Math.PI / 2 + sx * 0.12; brow.position.set(0, 0.2, 0.04); eye.add(brow);
    eyes.push({ eye, pupil, brow, sx });
  }
  // Mouth: a dark oval that opens, with a tongue and top teeth
  const mouth = new THREE.Group(); mouth.position.set(0, -0.24, 0.43); mouth.rotation.x = -0.15; head.add(mouth);
  const mouthIn = new THREE.Mesh(sphere(0.12, 32, 16), new THREE.MeshBasicMaterial({ color: C.mouth })); mouthIn.scale.set(1.25, 1, 0.35); mouth.add(mouthIn);
  const tongue = new THREE.Mesh(sphere(0.07, 24, 12), new THREE.MeshBasicMaterial({ color: C.tongue })); tongue.position.set(0, -0.05, 0.02); tongue.scale.set(1.3, 0.6, 0.4); mouth.add(tongue);
  const teeth = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.035, 0.03, 2, 0.012), new THREE.MeshBasicMaterial({ color: "#D9D4CB" })); teeth.position.set(0, 0.075, 0.035); mouth.add(teeth);
  const lip = part(new THREE.TorusGeometry(0.12, 0.018, 8, 40), toon(C.skinDark), false); lip.scale.set(1.25, 1, 1); mouth.add(lip);
  // Headset with an orange mic
  const band = part(new THREE.TorusGeometry(0.55, 0.03, 10, 48, Math.PI), toon("#2B2F3B")); band.position.y = 0.05; head.add(band);
  const cupMat = toon("#2B2F3B");
  for (const sx of [-1, 1]) { const cup = part(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 24), cupMat); cup.rotation.z = Math.PI / 2; cup.position.set(sx * 0.53, 0.0, 0); head.add(cup);
    const ring = part(new THREE.TorusGeometry(0.1, 0.015, 8, 24), toon(C.accent, C.accent), false); ring.rotation.y = Math.PI / 2; ring.position.set(sx * 0.575, 0, 0); head.add(ring); }
  const boom = part(new THREE.TorusGeometry(0.36, 0.014, 8, 32, 1.1), toon("#2B2F3B"), false); boom.position.set(0.5, -0.02, 0.05); boom.rotation.set(Math.PI / 2, 0, 0.9 + Math.PI); head.add(boom);
  const mic = part(sphere(0.045), toon(C.accent, C.accent)); mic.position.set(0.2, -0.27, 0.36); head.add(mic);

  // Ground glow
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.9, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.accent).multiplyScalar(1.6), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.005; root.add(disc);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.5, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; root.add(shadow);

  // Arm poses: [shoulder x, shoulder z, elbow x, elbow z] for screen-left arm (L) and screen-right arm (R).
  const POSES = {
    idle: { L: [0.05, -0.18, -0.15, 0], R: [0.05, 0.18, -0.15, 0] },
    wave: { L: [0.05, -0.18, -0.2, 0], R: [0, 2.5, 0, -0.5] },
    point: { L: [0.05, -0.18, -0.2, 0], R: [-0.3, 2.2, 0, 0.35] },
    pointUp: { L: [0.05, -0.18, -0.2, 0], R: [-0.2, 2.7, 0, 0.1] },
    present: { L: [-0.9, -0.75, -0.9, 0], R: [-0.9, 0.75, -0.9, 0] },
    thumbs: { L: [0.05, -0.18, -0.2, 0], R: [-1.0, 0.35, -1.5, 0] },
    explain: { L: [-0.5, -0.35, -1.3, 0], R: [-0.7, 0.4, -1.1, 0] },
    cheer: { L: [0, -2.6, 0, 0.25], R: [0, 2.6, 0, -0.25] },
  };
  const cur = { L: [...POSES.idle.L], R: [...POSES.idle.R] };
  const applyArm = (a, p) => { a.shoulder.rotation.set(p[0], 0, p[1]); a.elbow.rotation.set(p[2], 0, p[3]); };

  /** Draw a moment. talk 0..1 = how much he is speaking; gesture name and its blend 0..1; look = small head turn. */
  root.pose = (T, { talk = 0, gesture = "idle", from = "idle", k = 1, look = 0, hop = 0 } = {}) => {
    const g = POSES[gesture] || POSES.idle, f = POSES[from] || POSES.idle;
    for (const side of ["L", "R"]) for (let i = 0; i < 4; i++) cur[side][i] = lerp(f[side][i], g[side][i], k);
    // little life on top of the pose
    const wave = gesture === "wave" ? Math.sin(T * 9) * 0.45 * k : 0;
    const beat = Math.sin(T * 5.3) * 0.12 * talk;
    applyArm(L, [cur.L[0] + beat * 0.5, cur.L[1] - Math.sin(T * 1.7) * 0.03, cur.L[2] + beat, cur.L[3]]);
    applyArm(R, [cur.R[0] - beat * 0.5, cur.R[1] + Math.sin(T * 1.9) * 0.03, cur.R[2] - beat * 0.6, cur.R[3] + wave]);
    R.thumb.rotation.z = gesture === "thumbs" ? lerp(0.7, -0.6, k) : 0.7; R.thumb.position.y = gesture === "thumbs" ? lerp(0.03, 0.12, k) : 0.03;
    // body bob and sway
    const bob = Math.sin(T * 2.2) * 0.02 + Math.abs(Math.sin(T * 5.3)) * 0.02 * talk;
    body.position.y = bob + hop; torso.rotation.z = Math.sin(T * 1.1) * 0.03; torso.rotation.y = Math.sin(T * 0.7) * 0.06;
    head.rotation.set(Math.sin(T * 5.3) * 0.05 * talk + Math.sin(T * 0.9) * 0.03, look + Math.sin(T * 0.6) * 0.12, Math.sin(T * 1.3) * 0.05);
    // mouth: syllable-like flaps with short pauses
    const syl = Math.abs(Math.sin(T * 10.7)) * 0.65 + Math.abs(Math.sin(T * 6.3 + 1.2)) * 0.35;
    const pause = Math.sin(T * 1.9) * Math.sin(T * 2.9 + 0.5) > 0.55 ? 0.15 : 1;
    const open = clamp(talk * syl * pause);
    mouthIn.scale.y = lerp(0.12, 1.0, open); mouthIn.scale.x = lerp(1.35, 1.05, open);
    lip.scale.set(lerp(1.3, 1.08, open), lerp(0.12, 0.95, open), 1);
    tongue.visible = open > 0.35; teeth.visible = open > 0.2;
    // blink every ~2.6 s, eyes follow a little, brows lift when talking
    const bl = (T % 2.6) < 0.12 ? 0.1 : 1;
    for (const e of eyes) { e.eye.scale.y = bl; e.pupil.position.x = Math.sin(T * 0.8) * 0.02; e.brow.position.y = 0.2 + talk * 0.03 * Math.abs(Math.sin(T * 3.1)); }
    disc.material.opacity = 0.45 + 0.15 * Math.sin(T * 3);
  };
  root.pose(0);
  return root;
}

// ---------------------------------------------------------------- toon icons
function iconShape(kind) {
  const s = new THREE.Shape();
  if (kind === "heart") {
    s.moveTo(0, -0.42); s.bezierCurveTo(-0.15, -0.28, -0.5, -0.05, -0.5, 0.18); s.bezierCurveTo(-0.5, 0.42, -0.2, 0.5, 0, 0.28);
    s.bezierCurveTo(0.2, 0.5, 0.5, 0.42, 0.5, 0.18); s.bezierCurveTo(0.5, -0.05, 0.15, -0.28, 0, -0.42); return [s];
  }
  if (kind === "chat") {
    s.moveTo(-0.45, 0.35); s.lineTo(0.45, 0.35); s.quadraticCurveTo(0.55, 0.35, 0.55, 0.25); s.lineTo(0.55, -0.12); s.quadraticCurveTo(0.55, -0.22, 0.45, -0.22);
    s.lineTo(-0.12, -0.22); s.lineTo(-0.32, -0.42); s.lineTo(-0.3, -0.22); s.lineTo(-0.45, -0.22); s.quadraticCurveTo(-0.55, -0.22, -0.55, -0.12); s.lineTo(-0.55, 0.25); s.quadraticCurveTo(-0.55, 0.35, -0.45, 0.35); return [s];
  }
  if (kind === "play") { s.moveTo(-0.28, -0.38); s.lineTo(0.42, 0); s.lineTo(-0.28, 0.38); s.closePath(); return [s]; }
  if (kind === "gear") {
    const n = 8; for (let i = 0; i <= n * 4; i++) { const a = (i / (n * 4)) * Math.PI * 2; const r = (i % 4 < 2) ? 0.5 : 0.38; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); }
    const h = new THREE.Path(); h.absarc(0, 0, 0.16, 0, Math.PI * 2, true); s.holes.push(h); return [s];
  }
  if (kind === "pin") { s.absarc(0, 0.12, 0.32, Math.PI * 1.15, Math.PI * -0.15, true); s.lineTo(0, -0.48); s.closePath(); const h = new THREE.Path(); h.absarc(0, 0.12, 0.12, 0, Math.PI * 2, true); s.holes.push(h); return [s]; }
  return null;
}
const ICON_COL = { heart: "#FF4D6D", chat: "#2BB8FF", play: C.accent, gear: "#C9CCD4", pin: C.accent, browser: "#2BB8FF", search: C.accent, chart: "#36D399", calendar: C.accent, code: "#B38CFF", star: "#FFC23D", bell: "#FFC23D" };

/** A small toon icon. kinds: heart, chat, play, gear, pin, browser, search, chart, calendar, code */
export function makeIcon(kind) {
  const g = new THREE.Group();
  const col = ICON_COL[kind] || C.accent;
  const shapes = iconShape(kind);
  const ext = { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 3, curveSegments: 24 };
  if (shapes) { const geo = new THREE.ExtrudeGeometry(shapes, ext); geo.center(); g.add(part(geo, toon(col, kind === "heart" || kind === "play" ? col : undefined))); }
  if (kind === "chat") for (let i = -1; i <= 1; i++) { const d = part(sphere(0.06), toon("#ffffff"), false); d.position.set(i * 0.2, 0.06, 0.13); g.add(d); }
  if (kind === "play") { /* orange circle behind the triangle */ const c = part(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 40), toon("#1C1F29")); c.rotation.x = Math.PI / 2; c.position.z = -0.1; g.add(c); }
  if (kind === "browser") {
    g.add(part(new RoundedBoxGeometry(1.25, 0.9, 0.1, 4, 0.06), toon("#E9ECF2")));
    const bar = part(new RoundedBoxGeometry(1.25, 0.18, 0.12, 3, 0.05), toon(col), false); bar.position.y = 0.36; g.add(bar);
    [C.accent, "#FFC23D", "#36D399"].forEach((c, i) => { const d = new THREE.Mesh(sphere(0.035), new THREE.MeshBasicMaterial({ color: c })); d.position.set(-0.52 + i * 0.1, 0.36, 0.07); g.add(d); });
    const hero = part(new RoundedBoxGeometry(1.05, 0.28, 0.04, 2, 0.03), toon(C.accent), false); hero.position.set(0, 0.1, 0.06); g.add(hero);
    for (let i = 0; i < 3; i++) { const b = part(new RoundedBoxGeometry(0.3, 0.2, 0.04, 2, 0.03), toon("#B7BDCB"), false); b.position.set(-0.36 + i * 0.36, -0.22, 0.06); g.add(b); }
  }
  if (kind === "search") {
    const ring = part(new THREE.TorusGeometry(0.3, 0.08, 16, 40), toon(col)); ring.position.set(0.08, 0.1, 0); g.add(ring);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshBasicMaterial({ color: "#9FDcff", transparent: true, opacity: 0.35 })); glass.position.set(0.08, 0.1, 0); g.add(glass);
    const handle = part(capsule(0.07, 0.3), toon("#2B2F3B")); handle.position.set(-0.24, -0.25, 0); handle.rotation.z = -Math.PI / 4; g.add(handle);
  }
  if (kind === "chart") {
    [0.35, 0.55, 0.8].forEach((h, i) => { const b = part(new RoundedBoxGeometry(0.22, h, 0.22, 3, 0.04), toon(i === 2 ? C.accent : col)); b.position.set(-0.3 + i * 0.3, -0.4 + h / 2, 0); g.add(b); });
    const arrowShape = new THREE.Shape(); arrowShape.moveTo(-0.45, -0.05); arrowShape.lineTo(0.18, 0.4); arrowShape.lineTo(0.1, 0.48); arrowShape.lineTo(0.42, 0.55); arrowShape.lineTo(0.34, 0.25); arrowShape.lineTo(0.26, 0.33); arrowShape.lineTo(-0.38, -0.13); arrowShape.closePath();
    const ar = part(new THREE.ExtrudeGeometry(arrowShape, { depth: 0.06, bevelEnabled: false }), toon("#ffffff", "#ffffff"), false); ar.position.z = 0.14; g.add(ar);
  }
  if (kind === "calendar") {
    g.add(part(new RoundedBoxGeometry(0.95, 0.9, 0.12, 4, 0.08), toon("#E9ECF2")));
    const top = part(new RoundedBoxGeometry(0.95, 0.24, 0.14, 3, 0.06), toon(col), false); top.position.y = 0.33; g.add(top);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { const d = part(new RoundedBoxGeometry(0.18, 0.14, 0.04, 2, 0.03), toon(r === 0 && c === 1 ? C.accent : "#B7BDCB"), false); d.position.set(-0.26 + c * 0.26, 0.03 - r * 0.24, 0.07); g.add(d); }
  }
  if (kind === "code") {
    const lt = new THREE.Shape(); lt.moveTo(-0.1, 0.35); lt.lineTo(-0.45, 0); lt.lineTo(-0.1, -0.35); lt.lineTo(-0.02, -0.27); lt.lineTo(-0.29, 0); lt.lineTo(-0.02, 0.27); lt.closePath();
    const geo = new THREE.ExtrudeGeometry(lt, { ...ext, depth: 0.12 }); const a = part(geo, toon(col, col)); const b = part(geo, toon(col, col)); b.rotation.y = Math.PI; b.position.set(0.0, 0, 0.12); a.position.x = -0.08; b.position.x = 0.08; g.add(a, b);
    const sl = part(new RoundedBoxGeometry(0.08, 0.7, 0.12, 2, 0.03), toon("#ffffff"), false); sl.rotation.z = -0.35; g.add(sl);
  }
  if (kind === "star" || kind === "bell") { const geo = new THREE.OctahedronGeometry(0.4, 0); g.add(part(geo, toon(col, col))); }
  return g;
}
