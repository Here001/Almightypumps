// 3D props: the AP logo (chrome / gold / hologram / particles), a phone playing app footage,
// holographic labels, a hologram projector, progress rings and glass cards.
import { THREE, BRAND, clamp, dotTexture, rng } from "./core.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const S = 0.012; // logo units per SVG unit (the SVG is 200 × 200)
const v = (x, y) => new THREE.Vector2((x - 107.5) * S, (97.5 - y) * S);

function logoShapes() {
  const tri = new THREE.Shape([v(20, 175), v(120, 20), v(120, 175)]);
  const c = v(145, 70);
  const p = new THREE.Shape();
  p.moveTo(v(120, 20).x, v(120, 20).y);
  p.lineTo(v(145, 20).x, v(145, 20).y);
  p.absarc(c.x, c.y, 50 * S, Math.PI / 2, -Math.PI / 2, true);
  p.lineTo(v(120, 120).x, v(120, 120).y);
  p.closePath();
  const hole = new THREE.Path();
  hole.moveTo(v(120, 46).x, v(120, 46).y);
  hole.lineTo(v(145, 46).x, v(145, 46).y);
  hole.absarc(c.x, c.y, 24 * S, Math.PI / 2, -Math.PI / 2, true);
  hole.lineTo(v(120, 94).x, v(120, 94).y);
  hole.closePath();
  p.holes.push(hole);
  // Chevron: a mitred stroke 13 units wide, as a polygon.
  const [a, b, d] = [v(52, 162), v(82, 124), v(112, 162)];
  const h = 6.5 * S;
  const n = (u, w) => { const dir = w.clone().sub(u).normalize(); return new THREE.Vector2(-dir.y, dir.x); };
  const n1 = n(a, b), n2 = n(b, d);
  const m = n1.clone().add(n2).normalize(); const ml = h / m.dot(n1);
  const chev = new THREE.Shape([
    a.clone().addScaledVector(n1, h), b.clone().addScaledVector(m, ml), d.clone().addScaledVector(n2, h),
    d.clone().addScaledVector(n2, -h), b.clone().addScaledVector(m, -ml), a.clone().addScaledVector(n1, -h),
  ]);
  return { white: [tri, p], chev };
}

const HOLO_VERT = /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz);
  vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * mv; }`;
const HOLO_FRAG = /* glsl */ `uniform vec3 uC; uniform float uTime, uO; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  float scan = 0.55 + 0.45 * sin(vW.y * 70.0 - uTime * 9.0);
  float flick = 0.88 + 0.12 * sin(uTime * 41.0) * sin(uTime * 13.0);
  vec3 c = uC * (0.6 + f * 2.6) * scan * flick * uO; gl_FragColor = vec4(c, 1.0); }`;
export function holoMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(color) }, uTime: { value: 0 }, uO: { value: 1 } },
    vertexShader: HOLO_VERT, fragmentShader: HOLO_FRAG, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** The 3D AP monogram. finish: chrome | gold | holo | dark */
export function makeLogo() {
  const { white, chev } = logoShapes();
  const opts = { depth: 0.26, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.022, bevelSegments: 5, curveSegments: 64 };
  const gW = new THREE.ExtrudeGeometry(white, opts); gW.translate(0, 0, -0.13);
  const gC = new THREE.ExtrudeGeometry(chev, { ...opts, depth: 0.3 }); gC.translate(0, 0, -0.1);
  const mats = {
    chrome: new THREE.MeshPhysicalMaterial({ color: "#C9CBD2", metalness: 1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.9 }),
    gold: new THREE.MeshPhysicalMaterial({ color: "#E8A94E", metalness: 1, roughness: 0.22, clearcoat: 1, envMapIntensity: 1.0 }),
    dark: new THREE.MeshPhysicalMaterial({ color: "#1A1D26", metalness: 0.7, roughness: 0.3, clearcoat: 1, envMapIntensity: 1.2 }),
    holo: holoMaterial(BRAND.accent),
  };
  const chevMat = new THREE.MeshStandardMaterial({ color: BRAND.accent, emissive: BRAND.accent, emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.35 });
  const chevHolo = holoMaterial("#FFD2B8");
  const body = new THREE.Mesh(gW, mats.chrome);
  const mark = new THREE.Mesh(gC, chevMat);
  const group = new THREE.Group();
  group.add(body, mark);
  group.setFinish = (f) => {
    body.material = mats[f] || mats.chrome;
    mark.material = f === "holo" ? chevHolo : chevMat;
  };
  group.tick = (T, opacity = 1) => { for (const m of [mats.holo, chevHolo]) { m.uniforms.uTime.value = T; m.uniforms.uO.value = opacity; } };
  return group;
}

/** Points sampled from the logo artwork; they fly in from a cloud and lock into the logo shape. */
export function makeParticleLogo(count = 7000) {
  const c = document.createElement("canvas"); c.width = c.height = 400;
  const g = c.getContext("2d"); g.scale(2, 2);
  g.fillStyle = "#fff";
  g.fill(new Path2D("M20 175 L120 20 L120 175 Z"));
  g.fill(new Path2D("M120 20 H145 A50 50 0 0 1 145 120 H120 Z M120 46 H145 A24 24 0 0 1 145 94 H120 Z"), "evenodd");
  g.strokeStyle = "#f00"; g.lineWidth = 13; g.lineJoin = "miter";
  g.beginPath(); g.moveTo(52, 162); g.lineTo(82, 124); g.lineTo(112, 162); g.stroke();
  const data = g.getImageData(0, 0, 400, 400).data;
  const pts = [];
  for (let y = 0; y < 400; y += 2) for (let x = 0; x < 400; x += 2) {
    const i = (y * 400 + x) * 4;
    if (data[i + 3] > 128) pts.push([x / 2, y / 2, data[i + 1] < 100 ? 1 : 0]);
  }
  const r = rng(7);
  const start = new Float32Array(count * 3), target = new Float32Array(count * 3), col = new Float32Array(count), rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = pts[Math.floor(r() * pts.length)];
    const t = v(p[0] + (r() - 0.5) * 1.5, p[1] + (r() - 0.5) * 1.5);
    target.set([t.x, t.y, (r() - 0.5) * 0.25], i * 3);
    const th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1), rad = 3 + r() * 9;
    start.set([rad * Math.sin(ph) * Math.cos(th), rad * Math.sin(ph) * Math.sin(th), rad * Math.cos(ph) - 2], i * 3);
    col[i] = p[2]; rnd[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(target, 3));
  geo.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
  geo.setAttribute("aCol", new THREE.BufferAttribute(col, 1));
  geo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uP: { value: 0 }, uTime: { value: 0 }, uO: { value: 1 }, uSize: { value: 26 }, uMap: { value: dotTexture() }, uA: { value: new THREE.Color(BRAND.accent) } },
    vertexShader: /* glsl */ `attribute vec3 aStart; attribute float aCol, aRnd; uniform float uP, uTime, uSize; varying float vCol; varying float vA;
      void main(){ float k = clamp(uP * 1.5 - aRnd * 0.5, 0.0, 1.0); k = 1.0 - pow(1.0 - k, 3.0);
        vec3 p = mix(aStart, position, k);
        float sw = (1.0 - k) * 1.5; p.x += sin(uTime * 1.3 + aRnd * 30.0) * sw * 0.3; p.y += cos(uTime * 1.1 + aRnd * 20.0) * sw * 0.3;
        vCol = aCol; vA = 0.35 + 0.65 * k;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = uSize * (0.6 + aRnd * 0.8) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform vec3 uA; uniform float uO; varying float vCol; varying float vA;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); vec3 c = mix(vec3(1.0, 0.95, 0.9), uA * 1.6, vCol); gl_FragColor = vec4(c * t.a * vA * uO, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

/** A phone whose screen plays frames of an app recording (frames are loaded by the caller). */
export function makePhone() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.24, 4.62, 0.24, 8, 0.32),
    new THREE.MeshPhysicalMaterial({ color: "#20232C", metalness: 0.85, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.3 }));
  const tex = new THREE.Texture(); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.08, 4.46), new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uHas: { value: 0 }, uGlare: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D map; uniform float uHas, uGlare; varying vec2 vUv;
      float rr(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){ vec2 p = (vUv - 0.5) * vec2(2.08, 4.46); float d = rr(p, vec2(1.04, 2.23), 0.24); if (d > 0.0) discard;
        vec2 uv = vec2(0.5 + (vUv.x - 0.5) * 0.8287, vUv.y);
        vec3 c = uHas > 0.5 ? texture2D(map, uv).rgb * 1.18 : vec3(0.05, 0.055, 0.07);
        float gl = smoothstep(0.0, 0.02, 0.05 - abs(vUv.x + vUv.y * 0.6 - 0.2 - uGlare * 2.0)) * 0.18;
        c += gl; float island = rr(p - vec2(0.0, 2.0), vec2(0.34, 0.09), 0.09); if (island < 0.0) c = vec3(0.0);
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  screen.position.z = 0.122;
  group.add(body, screen);
  group.screenTex = tex;
  group.setFrame = (img) => { if (!img) { screen.material.uniforms.uHas.value = 0; return; } if (tex.image !== img) { tex.image = img; tex.needsUpdate = true; } screen.material.uniforms.uHas.value = 1; };
  group.setGlare = (k) => { screen.material.uniforms.uGlare.value = k; };
  return group;
}

/** Text on a glassy card, as a texture (used for floating labels and carousel cards). */
export function cardTexture({ title, text = "", tag = "", w = 1024, h = 300, big = false }) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  const r = Math.min(56, h * 0.2);
  const rect = (x, y, ww, hh, rad) => { g.beginPath(); g.roundRect(x, y, ww, hh, rad); };
  rect(4, 4, w - 8, h - 8, r);
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "rgba(28,31,42,0.92)"); grad.addColorStop(1, "rgba(14,16,22,0.88)");
  g.fillStyle = grad; g.fill();
  g.lineWidth = 5; g.strokeStyle = "rgba(255,90,31,0.95)"; g.stroke();
  // chevron mark
  const cx = big ? 90 : 78, cy = big ? 110 : h / 2;
  g.strokeStyle = BRAND.accent; g.lineWidth = big ? 16 : 13; g.lineJoin = "miter";
  g.beginPath(); g.moveTo(cx - 28, cy + 16); g.lineTo(cx, cy - 18); g.lineTo(cx + 28, cy + 16); g.stroke();
  g.fillStyle = BRAND.fg; g.textBaseline = "middle";
  const fit = (s, size, maxW, weight = 600) => { let fs = size; do { g.font = `${weight} ${fs}px Geist, sans-serif`; fs -= 2; } while (g.measureText(s).width > maxW && fs > 20); };
  if (big) {
    if (tag) { g.font = "600 44px 'Space Grotesk', sans-serif"; g.fillStyle = BRAND.accent; g.fillText(tag, w - 40 - g.measureText(tag).width, 112); }
    g.fillStyle = BRAND.fg; fit(title, 76, w - 80, 650); g.fillText(title, 40, h * 0.52);
    if (text) { g.fillStyle = "#B9BCC6"; fit(text, 46, w - 80, 450); g.fillText(text, 40, h * 0.72); }
  } else {
    fit(title, text ? 74 : 84, w - 170, 620); g.fillText(title, 140, text ? h * 0.38 : h / 2 + 4);
    if (text) { g.fillStyle = "#B9BCC6"; fit(text, 52, w - 170, 450); g.fillText(text, 140, h * 0.7); }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export function makeLabel(opts, width = 2.2) {
  const tex = cardTexture(opts);
  const h = width * (tex.image.height / tex.image.width);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h), new THREE.MeshBasicMaterial({ map: tex, color: 0xb8b8b8, transparent: true, depthWrite: false, toneMapped: false }));
  return m;
}

/** Glass card for the carousel. */
export function makeCard(opts) {
  const group = new THREE.Group();
  const slab = new THREE.Mesh(new RoundedBoxGeometry(2.0, 2.6, 0.07, 4, 0.16),
    new THREE.MeshPhysicalMaterial({ color: "#151821", metalness: 0.4, roughness: 0.2, clearcoat: 1, envMapIntensity: 1.1 }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.92, 2.52), new THREE.MeshBasicMaterial({ map: cardTexture({ ...opts, w: 760, h: 1000, big: true }), color: 0xb8b8b8, transparent: true, toneMapped: false }));
  face.position.z = 0.04;
  group.add(slab, face);
  group.face = face;
  return group;
}

/** Hologram projector: glowing rings on the floor and a cone of light. */
export function makeProjector() {
  const group = new THREE.Group();
  const add = (geo, color, op) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.rotation.x = -Math.PI / 2; group.add(m); return m; };
  const rings = [add(new THREE.RingGeometry(1.0, 1.04, 96), "#FF7A45", 0.9), add(new THREE.RingGeometry(1.25, 1.27, 6), "#FF5A1F", 0.8), add(new THREE.RingGeometry(1.5, 1.52, 96, 1, 0, 4.6), "#FFB08F", 0.7), add(new THREE.CircleGeometry(0.98, 64), "#FF5A1F", 0.18)];
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 0.95, 3.6, 64, 1, true), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uO: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uTime, uO; varying vec2 vUv; float h(float x){ return fract(sin(x * 91.7) * 4375.5); }
      void main(){ float a = (1.0 - vUv.y); float streak = 0.6 + 0.4 * h(floor(vUv.x * 90.0) + floor(uTime * 6.0));
        gl_FragColor = vec4(vec3(1.0, 0.45, 0.2) * pow(1.0 - vUv.y, 1.8) * streak * 0.5 * uO, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  cone.position.y = 1.8;
  group.add(cone);
  group.tick = (T, o = 1, coneO = 1) => {
    rings[0].rotation.z = T * 0.4; rings[1].rotation.z = -T * 0.25; rings[2].rotation.z = T * 0.7;
    rings.forEach((r, i) => (r.material.opacity = [0.9, 0.8, 0.7, 0.18][i] * o));
    cone.material.uniforms.uTime.value = T; cone.material.uniforms.uO.value = o * coneO; cone.visible = coneO > 0;
  };
  return group;
}

/** A progress ring for infographics. */
export function makeRing(radius = 1) {
  const group = new THREE.Group();
  const track = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.03, 8, 128), new THREE.MeshBasicMaterial({ color: "#2A2E3A", toneMapped: false }));
  const arcMat = new THREE.MeshStandardMaterial({ color: BRAND.accent, emissive: BRAND.accent, emissiveIntensity: 1.5, side: THREE.DoubleSide });
  const arc = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.07, 12, 160, 0.001), arcMat);
  arc.rotation.z = Math.PI / 2; arc.scale.x = -1; // start at 12 o'clock, go clockwise
  const tick = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), new THREE.MeshBasicMaterial({ color: "#FFE2D4", toneMapped: false }));
  group.add(track, arc, tick);
  let last = -1;
  group.setProgress = (k) => {
    k = clamp(k, 0.001, 1);
    if (Math.abs(k - last) > 0.002) { arc.geometry.dispose(); arc.geometry = new THREE.TorusGeometry(radius, 0.07, 12, 160, k * Math.PI * 2); last = k; }
    const a = Math.PI / 2 - k * Math.PI * 2; tick.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
  };
  return group;
}
