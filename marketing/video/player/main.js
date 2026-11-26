// Timeline: builds the worlds, props and scenes for an ad and draws any moment with window.seek(seconds).
import { THREE, createStage, colourEnvironment, clamp, BRAND } from "./core.js";
import { WORLDS } from "./worlds.js";
import { makeLogo, makeParticleLogo, makePhone, makeProjector } from "./props.js";
import { SCENES } from "./scenes.js";
import { makeToon } from "./toon.js";

let ctx, timeline = [], total = 0, clipCounts = {}, overlay;
const frameCache = new Map();
const TRANS = 0.24; // seconds each side of a cut that a transition effect lasts
const SOUND_FOR = { glitch: "glitch", flash: "impact", fade: "swell", whip: "whoosh", cut: "hit" };

async function loadFrame(clip, sec) {
  const n = clipCounts[clip]; if (!n) return null;
  const i = Math.min(n, Math.max(1, Math.floor(sec * 30) + 1));
  const key = `${clip}/${i}`;
  if (frameCache.has(key)) return frameCache.get(key);
  const img = new Image();
  img.src = `/out/.cache/frames/${encodeURIComponent(clip)}/${String(i).padStart(5, "0")}.jpg`;
  await img.decode();
  frameCache.set(key, img);
  if (frameCache.size > 90) frameCache.delete(frameCache.keys().next().value);
  return img;
}

window.loadAd = async (ad, format, opts = {}) => {
  document.body.className = `f-${format}`;
  await Promise.all(["600 64px Geist", "450 64px Geist", "700 64px 'Space Grotesk'", "500 64px 'Space Grotesk'"].map((f) => document.fonts.load(f)));
  const stage = createStage(document.getElementById("gl"), innerWidth, innerHeight);
  overlay = document.getElementById("ov");
  clipCounts = opts.clips || {};
  const props = { logo: makeLogo(), particles: makeParticleLogo(), phone: makePhone(), projector: makeProjector(), toon: makeToon() };
  for (const p of Object.values(props)) { p.visible = false; stage.scene.add(p); }
  stage.scene.add(new THREE.AmbientLight("#ffffff", 0.25));
  const key = new THREE.DirectionalLight("#ffffff", 1.4); key.position.set(3, 5, 6); stage.scene.add(key);
  ctx = { stage, props, ad, frame: loadFrame };

  const worlds = {};
  const cues = [];
  timeline = []; total = 0;
  for (const [i, s] of ad.scenes.entries()) {
    const make = SCENES[s.type];
    if (!make) throw new Error(`Unknown scene type "${s.type}". Use one of: ${Object.keys(SCENES).join(", ")}`);
    const wname = s.world || ad.world || "nebula";
    if (!WORLDS[wname]) throw new Error(`Unknown world "${wname}". Use one of: ${Object.keys(WORLDS).join(", ")}`);
    const pal = s.palette || ad.palette || [BRAND.accent, "#6B3BFF"];
    const wkey = `${wname}|${pal.join(",")}`;
    if (!worlds[wkey]) {
      const w = WORLDS[wname](stage, pal);
      w.group.visible = false; stage.scene.add(w.group);
      w.envTex = colourEnvironment(stage.renderer, w.env || pal);
      worlds[wkey] = w;
    }
    const sc = make(s, ctx);
    overlay.appendChild(sc.el);
    for (const o of sc.objects || []) o.visible = false;
    const dur = Number(s.duration) || 3;
    const transition = s.transition || ad.transition || "glitch";
    if (i > 0) cues.push({ t: total, type: SOUND_FOR[transition] || "whoosh" });
    for (const c of sc.cues || []) cues.push({ ...c, t: total + c.t });
    timeline.push({ ...sc, s, start: total, dur, world: worlds[wkey], transition });
    total += dur;
  }
  window.duration = total;
  return { duration: total, cues };
};

window.seek = async (T) => {
  const { stage, props } = ctx;
  let idx = timeline.findIndex((s) => T < s.start + s.dur);
  if (idx < 0) idx = timeline.length - 1;
  const cur = timeline[idx], next = timeline[idx + 1];
  const t = T - cur.start;

  for (const p of Object.values(props)) p.visible = false;
  for (const sc of timeline) { sc.el.classList.remove("on"); for (const o of sc.objects || []) o.visible = false; sc.world.group.visible = false; }
  cur.world.group.visible = true;
  stage.scene.environment = cur.world.envTex;
  stage.scene.fog = cur.world.fog || null;
  stage.scene.environmentRotation.set(0, 0, 0);

  if (cur.prepare) await cur.prepare(t);
  const fx = cur.update(t, cur.dur, T) || {};
  cur.world.update(T, stage.camera, fx.speed ?? cur.speed ?? 1);
  cur.el.classList.add("on");

  // Transitions around the cut into this scene and the cut out of it.
  let glitch = fx.glitch || 0, flash = fx.flash || 0, fade = 0, aberr = 0.0012, roll = 0;
  const apply = (type, k, dir) => {
    if (k <= 0) return;
    if (type === "glitch") { glitch = Math.max(glitch, k * 0.9); aberr += k * 0.012; }
    else if (type === "flash") flash = Math.max(flash, k * k * 0.9);
    else if (type === "fade") fade = Math.max(fade, Math.pow(k, 1.3));
    else if (type === "whip") { roll += dir * k * k * 0.35; aberr += k * 0.025; glitch = Math.max(glitch, k * 0.15); }
  };
  if (idx > 0) apply(cur.transition, 1 - t / TRANS, -1);
  if (next) apply(next.transition, 1 - (cur.dur - t) / TRANS, 1);
  const outK = next ? clamp((cur.dur - t) / 0.2) : 1;
  cur.el.style.opacity = outK;

  if (fx.shake) { stage.camera.position.x += Math.sin(T * 97) * 0.06 * fx.shake; stage.camera.position.y += Math.cos(T * 83) * 0.05 * fx.shake; }
  if (roll) stage.camera.rotateZ(roll);

  const u = stage.final.uniforms;
  u.uTime.value = T; u.uGlitch.value = clamp(glitch); u.uFlash.value = clamp(flash); u.uFade.value = clamp(fade);
  u.uScan.value = cur.scan || 0; u.uAberr.value = aberr;
  stage.bloom.strength = fx.bloom ?? 0.75;
  stage.composer.render();
};
