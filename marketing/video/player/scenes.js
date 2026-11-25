// Scene types. Each builds its overlay text (HTML) and its 3D objects, and draws itself for a local time t.
import { THREE, E, prog, clamp, lerp, wob, BRAND } from "./core.js";
import { makeLabel, makeCard, makeRing } from "./props.js";
import { makeIcon } from "./toon.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/** Text with *stars* → orange words; split into word spans (and optional letter spans) for animation. */
export function words(text, letters = false) {
  let html = "";
  for (const part of String(text ?? "").split(/(\*[^*]+\*)/g)) {
    if (!part) continue;
    const hl = part.length > 2 && part.startsWith("*") && part.endsWith("*");
    const body = hl ? part.slice(1, -1) : part;
    for (const w of body.split(/(\s+)/)) {
      if (!w) continue;
      if (/^\s+$/.test(w)) { html += " "; continue; }
      const inner = letters ? [...w].map((ch) => `<span class="l">${esc(ch)}</span>`).join("") : esc(w);
      html += `<span class="w${hl ? " hl" : ""}">${inner}</span>`;
    }
  }
  return html;
}
function div(cls, html) { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; return d; }
/** Fade, rise, de-blur and scale an element in. k: 0 → 1. */
function show(el, k, { y = 0, x = 0, blur = 0, scale = 1 } = {}) {
  if (!el) return;
  el.style.opacity = clamp(k);
  const s = lerp(scale, 1, k);
  el.style.transform = `translate(${(1 - k) * x}px, ${(1 - k) * y}px) scale(${s})`;
  el.style.filter = blur && k < 1 ? `blur(${(1 - k) * blur}px)` : "none";
}
const fmt = (ctx, portrait, square, wide) => (ctx.stage.portrait ? portrait : ctx.stage.square ? square : wide);

/** Shared camera helper: position + look-at + small handheld drift. */
function cam(ctx, T, pos, look = [0, 0, 0], drift = 1, roll = 0) {
  const c = ctx.stage.camera;
  c.position.set(pos[0] + wob(T, 0.5, 1) * 0.06 * drift, pos[1] + wob(T, 0.43, 2) * 0.05 * drift, pos[2]);
  c.lookAt(look[0], look[1], look[2]);
  c.rotateZ(roll + wob(T, 0.31, 3) * 0.004 * drift);
}

/** Project a 3D point to overlay pixels. */
function toScreen(ctx, v3) {
  ctx.stage.camera.updateMatrixWorld();
  const p = v3.clone().project(ctx.stage.camera);
  return [(p.x * 0.5 + 0.5) * ctx.stage.width, (-p.y * 0.5 + 0.5) * ctx.stage.height];
}

export const SCENES = {
  /** Big punchy opening line: words slam in with glitch hits while the world rushes forward. */
  hook(s, ctx) {
    const el = div("sc s-hook", `<div class="txt pos-${s.position || "center"}">${s.kicker ? `<div class="kicker">${words(s.kicker)}</div>` : ""}<h1 class="big">${(s.lines || []).map((l) => `<span class="line">${words(l)}</span>`).join("")}</h1>${s.sub ? `<p class="sub">${words(s.sub)}</p>` : ""}</div>`);
    const ws = [...el.querySelectorAll("h1 .w")], kick = el.querySelector(".kicker"), sub = el.querySelector(".sub");
    const gap = Math.min(0.2, 1.2 / Math.max(1, ws.length));
    const hits = ws.map((_, i) => 0.12 + i * gap);
    return {
      el, speed: 2.2,
      cues: hits.map((t) => ({ t, type: "hit" })),
      update(t, d, T) {
        cam(ctx, T, [0, 0.2, lerp(9.5, 6.5, E.out(prog(t, 0, d)))], [0, 0, -10], 1.5, lerp(-0.06, 0, E.out(prog(t, 0, 1.2))));
        show(kick, E.out(prog(t, 0, 0.4)), { y: 20 });
        ws.forEach((w, i) => show(w, E.out5(prog(t, hits[i], 0.28)), { scale: 2.4, blur: 26 }));
        show(sub, E.out(prog(t, hits[hits.length - 1] + 0.3, 0.5)), { y: 24, blur: 8 });
        let glitch = 0; for (const h of hits) glitch = Math.max(glitch, Math.exp(-Math.max(0, t - h) * 14) * (t >= h ? 0.7 : 0));
        return { glitch, shake: glitch * 0.6 };
      },
    };
  },

  /** Particles fly in and lock into the 3D AP logo, which turns solid (chrome/gold/hologram) as light sweeps across. */
  logo(s, ctx) {
    const el = div("sc s-logo", `<div class="txt pos-bottom center"><div class="wordmark">ALMIGHTY PUMPS</div>${s.tagline ? `<p class="tagline">${words(s.tagline)}</p>` : ""}</div>`);
    const wm = el.querySelector(".wordmark"), tag = [...el.querySelectorAll(".tagline .w")];
    const { logo, particles } = ctx.props;
    const finish = s.finish || "chrome";
    const lock = 1.35;
    return {
      el, speed: 0.6, scan: finish === "holo" ? 0.6 : 0,
      cues: [{ t: 0, type: "riser", dur: lock }, { t: lock, type: "impact" }],
      update(t, d, T) {
        const ang = lerp(-0.75, 0.25, E.inOut(prog(t, 0, d)));
        const rad = fmt(ctx, 7.2, 6.4, 6.2);
        cam(ctx, T, [Math.sin(ang) * rad, 0.5 + 0.3 * Math.sin(t * 0.6), Math.cos(ang) * rad], [0, fmt(ctx, 0.9, 0.5, 0.35), 0], 0.8);
        particles.visible = t < lock + 0.6;
        particles.material.uniforms.uP.value = prog(t, 0, lock);
        particles.material.uniforms.uTime.value = T;
        particles.material.uniforms.uO.value = 1 - prog(t, lock, 0.5);
        particles.position.set(0, fmt(ctx, 0.9, 0.5, 0.35), 0);
        logo.visible = t > lock - 0.15;
        logo.setFinish(finish);
        logo.tick(T, prog(t, lock - 0.15, 0.3));
        logo.position.set(0, fmt(ctx, 0.9, 0.5, 0.35), 0);
        logo.rotation.set(0, Math.sin(t * 0.8) * 0.12, 0);
        const sc = lerp(0.92, 1, E.out(prog(t, lock - 0.15, 0.6)));
        logo.scale.setScalar(sc * fmt(ctx, 1.15, 1.0, 1.0));
        ctx.stage.scene.environmentRotation.set(0, lerp(-1.6, 1.2, E.inOut(prog(t, lock - 0.2, 1.6))), 0);
        const w = E.inOut(prog(t, lock + 0.15, 0.8));
        wm.style.clipPath = `inset(0 ${(1 - w) * 50}% 0 ${(1 - w) * 50}%)`; wm.style.opacity = w > 0 ? 1 : 0;
        wm.style.letterSpacing = `${lerp(0.5, 0.16, w)}em`;
        tag.forEach((x, i) => show(x, E.out(prog(t, lock + 0.6 + i * 0.1, 0.5)), { y: 18, blur: 10 }));
        const hit = t >= lock ? Math.exp(-(t - lock) * 9) : 0;
        return { flash: hit * 0.5, glitch: hit * 0.25, shake: hit * 0.8, bloom: 0.55 + hit * 0.6 };
      },
    };
  },

  /** A statement line revealed line by line, with an optional slowly turning 3D logo behind it. */
  headline(s, ctx) {
    const el = div("sc s-headline", `<div class="txt pos-${s.position || "center"} ${s.align || ""}">${s.kicker ? `<div class="kicker">${words(s.kicker)}</div>` : ""}<h1 class="big">${(s.lines || []).map((l) => `<span class="line"><span class="li">${words(l)}</span></span>`).join("")}</h1>${s.sub ? `<p class="sub">${words(s.sub)}</p>` : ""}</div>`);
    const kick = el.querySelector(".kicker"), lines = [...el.querySelectorAll(".li")], sub = el.querySelector(".sub");
    const { logo } = ctx.props;
    return {
      el, speed: 0.8,
      cues: [{ t: 0.1, type: "swoosh" }],
      update(t, d, T) {
        cam(ctx, T, [lerp(-0.8, 0.8, prog(t, 0, d)), lerp(0.6, 0.1, prog(t, 0, d)), 8], [0, 0, 0], 1);
        if (s.logo) {
          logo.visible = true; logo.setFinish(s.logo); logo.tick(T, 0.6);
          logo.position.set(fmt(ctx, 0, 1.6, 3.2), fmt(ctx, -3.4, -1.2, -0.2), -3); logo.scale.setScalar(fmt(ctx, 1.6, 1.6, 1.8));
          logo.rotation.set(0.1, t * 0.5 - 0.6, 0);
          ctx.stage.scene.environmentRotation.set(0, T * 0.3, 0);
        }
        show(kick, E.out(prog(t, 0, 0.45)), { y: 16 });
        lines.forEach((l, i) => { const k = E.out5(prog(t, 0.1 + i * 0.16, 0.6)); l.style.transform = `translateY(${(1 - k) * 110}%)`; l.style.opacity = k > 0 ? 1 : 0; });
        show(sub, E.out(prog(t, 0.4 + lines.length * 0.16, 0.6)), { y: 20, blur: 8 });
        return {};
      },
    };
  },

  /** A 3D phone playing a real app recording, with holographic labels popping out of it. */
  phone(s, ctx) {
    const el = div("sc s-phone", `<div class="txt pos-${fmt(ctx, "top", "top", "left")}">${s.kicker ? `<div class="kicker">${words(s.kicker)}</div>` : ""}<h2 class="mid">${words(s.title)}</h2>${s.sub ? `<p class="sub">${words(s.sub)}</p>` : ""}</div>`);
    const kick = el.querySelector(".kicker"), ws = [...el.querySelectorAll("h2 .w")], sub = el.querySelector(".sub");
    const { phone, projector } = ctx.props;
    const labels = (s.callouts || []).map((c) => { const m = makeLabel(typeof c === "string" ? { title: c } : c, fmt(ctx, 1.9, 2.1, 2.2)); m.visible = false; ctx.stage.scene.add(m); return m; });
    const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(BRAND.accent).multiplyScalar(2), transparent: true, toneMapped: false });
    const links = labels.map(() => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const l = new THREE.Line(g, lineMat.clone()); l.visible = false; ctx.stage.scene.add(l); return l; });
    const base = fmt(ctx, [0, -1.3, 0], [0, -1.15, 0], [2.0, -0.2, 0]);
    const from = s.from || 0, rate = s.rate || 1;
    const clipTime = (t) => from + t * rate;
    return {
      el, objects: [...labels, ...links], speed: 0.5,
      cues: [{ t: 0, type: "whoosh" }, ...labels.map((_, i) => ({ t: 0.9 + i * (s.every || 1.1), type: "pop" }))],
      async prepare(t) { phone.setFrame(s.clip ? await ctx.frame(s.clip, clipTime(t)) : null); },
      update(t, d, T) {
        cam(ctx, T, [base[0] * 0.3 + lerp(-0.6, 0.4, prog(t, 0, d)), base[1] + 0.4, fmt(ctx, 6.9, 9.4, 9.0)], [base[0] * 0.3, base[1] + fmt(ctx, 0.5, 0.7, 0.2), 0], 0.8);
        const k = E.out5(prog(t, 0, 0.9));
        phone.visible = true;
        phone.position.set(base[0], base[1] + (1 - k) * -6 + Math.sin(T * 1.1) * 0.06, base[2]);
        phone.rotation.set(lerp(0.9, 0.06, k) + Math.sin(T * 0.7) * 0.02, lerp(-1.2, fmt(ctx, -0.22, -0.22, -0.32), k) + Math.sin(T * 0.5) * 0.06, lerp(0.3, 0, k));
        phone.setGlare(prog(t, 0, d));
        if (s.holo !== false) { projector.visible = true; projector.position.set(base[0], base[1] - 2.9, 0); projector.scale.setScalar(1.15); projector.tick(T, k, 0); }
        labels.forEach((m, i) => {
          const st = 0.9 + i * (s.every || 1.1); const kk = E.back(prog(t, st, 0.45)); const on = t >= st;
          m.visible = on; links[i].visible = on;
          if (!on) return;
          const side = fmt(ctx, i % 2 ? 1 : -1, i % 2 ? 1 : -1, 1);
          const y = fmt(ctx, 1.4 - i * 1.25, 1.1 - i * 1.1, 1.5 - i * 1.2);
          const target = new THREE.Vector3(base[0] + side * fmt(ctx, 1.12, 1.65, 2.45), base[1] + y + Math.sin(T * 1.3 + i) * 0.05, fmt(ctx, 0.8, 1.0, 1.2));
          m.position.copy(target); m.scale.setScalar(clamp(kk, 0, 1.2)); m.material.opacity = clamp(prog(t, st, 0.25));
          m.lookAt(ctx.stage.camera.position);
          const anchor = new THREE.Vector3(base[0] + side * 0.95, target.y - 0.1, 0.2);
          const edge = target.clone().add(new THREE.Vector3(-side * fmt(ctx, 0.95, 1.05, 1.1) * clamp(kk, 0, 1), 0, 0));
          links[i].geometry.setFromPoints([anchor, anchor.clone().lerp(edge, E.out(prog(t, st, 0.3)))]);
          links[i].material.opacity = 0.9;
        });
        show(kick, E.out(prog(t, 0.2, 0.4)), { y: 16 });
        ws.forEach((w, i) => show(w, E.out(prog(t, 0.3 + i * 0.06, 0.5)), { y: 30, blur: 12 }));
        show(sub, E.out(prog(t, 0.6 + ws.length * 0.06, 0.5)), { y: 20 });
        return {};
      },
    };
  },

  /** Glass cards on a turning carousel, one service per card. */
  carousel(s, ctx) {
    const items = s.items || [];
    const el = div("sc s-carousel", `<div class="txt pos-top">${s.kicker ? `<div class="kicker">${words(s.kicker)}</div>` : ""}<h2 class="mid">${words(s.title)}</h2></div>`);
    const title = el.querySelector("h2"), kick = el.querySelector(".kicker");
    const R = fmt(ctx, 6.5, 6.5, 7.5);
    const ring = new THREE.Group(); ring.visible = false; ctx.stage.scene.add(ring);
    const cards = items.map((it, i) => { const c = makeCard({ ...it, tag: it.tag || String(i + 1).padStart(2, "0") }); ring.add(c); return c; });
    const n = Math.max(cards.length, 1); const step = fmt(ctx, 0.5, 0.42, 0.36);
    const hold = (dd) => (dd - 0.8) / n;
    return {
      el, objects: [ring], speed: 0.7,
      cues: items.map((_, i) => ({ t: 0.5 + i * 0.9, type: "tick" })).slice(0, 1).concat([{ t: 0, type: "whoosh" }]),
      update(t, d, T) {
        cam(ctx, T, [0, 0.5, fmt(ctx, 7.4, 8.2, 8.6)], [0, fmt(ctx, -0.7, -0.5, -0.4), 0], 0.6);
        ring.visible = true; ring.position.set(0, fmt(ctx, -0.9, -0.6, -0.5), -R + 1.2);
        const h = hold(d); const idx = clamp((t - 0.6) / h, 0, n - 1);
        const i0 = Math.floor(idx), f = idx - i0; const smooth = i0 + E.inOut(clamp((f - 0.55) / 0.45));
        ring.rotation.y = -smooth * step + (1 - E.out(prog(t, 0, 1))) * 1.2;
        cards.forEach((c, i) => {
          const a = i * step; c.position.set(Math.sin(a) * R, Math.sin(T * 0.9 + i) * 0.06, Math.cos(a) * R); c.rotation.y = a;
          const off = Math.abs(a - smooth * step); const focus = clamp(1 - off / step); c.visible = off < step * 2.6;
          c.scale.setScalar(fmt(ctx, 1.5, 1.05, 1.0) * lerp(0.75, 1.08, focus) * E.out(prog(t, i * 0.05, 0.6)));
          c.face.material.opacity = lerp(0.3, 1, focus);
        });
        show(kick, E.out(prog(t, 0, 0.4)), { y: 14 });
        show(title, E.out(prog(t, 0.1, 0.5)), { y: 24, blur: 10 });
        return { bloom: 0.8 };
      },
    };
  },

  /** Infographic: progress rings with counting numbers. Use real figures only. */
  stats(s, ctx) {
    const items = (s.items || []).slice(0, 3);
    const solo = items.length === 1, big = solo ? 1.75 : 1;
    const el = div(`sc s-stats${solo ? " solo" : ""}`, `<div class="txt pos-top">${s.kicker ? `<div class="kicker">${words(s.kicker)}</div>` : ""}<h2 class="mid">${words(s.title)}</h2></div>` +
      items.map((it) => `<div class="num"></div><div class="lab">${words(it.label || "")}</div>`).join(""));
    const title = el.querySelector("h2"), kick = el.querySelector(".kicker"), nums = [...el.querySelectorAll(".num")], labs = [...el.querySelectorAll(".lab")];
    const R = 0.9;
    const rings = items.map(() => { const r = makeRing(R); r.visible = false; ctx.stage.scene.add(r); return r; });
    const layout = (i) => {
      const n = items.length;
      if (n === 1) return [0, fmt(ctx, 0.2, -0.4, -0.3), 0];
      if (ctx.stage.portrait) return [0, 1.2 - i * 3.0, 0];
      return [(i - (n - 1) / 2) * fmt(ctx, 0, 2.55, 3.6), -0.2, 0];
    };
    return {
      el, objects: rings, speed: 0.4,
      cues: items.map((_, i) => ({ t: 0.4 + i * 0.35, type: "count", dur: 1.1 })),
      update(t, d, T) {
        cam(ctx, T, [lerp(0.3, -0.3, prog(t, 0, d)), 0.2, fmt(ctx, 12.5, 10.5, 9.5)], [lerp(0.3, -0.3, prog(t, 0, d)), fmt(ctx, -1.4, -0.4, -0.3), 0], 0.5);
        show(kick, E.out(prog(t, 0, 0.4)), { y: 14 });
        show(title, E.out(prog(t, 0.1, 0.5)), { y: 24, blur: 10 });
        items.forEach((it, i) => {
          const r = rings[i]; const st = 0.4 + i * 0.35; const k = E.out(prog(t, st, 1.2));
          r.visible = true; const p = layout(i); r.position.set(...p); r.scale.setScalar(big * E.back(prog(t, st - 0.1, 0.5)));
          r.rotation.set(Math.sin(T * 0.6 + i) * 0.12, Math.cos(T * 0.5 + i) * 0.15, 0);
          r.setProgress((it.ring ?? 1) * k);
          const [x, y] = toScreen(ctx, new THREE.Vector3(p[0], p[1], 0));
          const [, yb] = toScreen(ctx, new THREE.Vector3(p[0], p[1] - R * big - 0.12, 0));
          const num = nums[i], lab = labs[i];
          num.style.left = `${x}px`; num.style.top = `${y}px`; lab.style.left = `${x}px`; lab.style.top = `${yb}px`;
          const val = Number(it.value) || 0; const shown = it.static ? it.value : Number.isInteger(val) ? Math.round(val * k).toLocaleString("en-NG") : (val * k).toFixed(1);
          num.innerHTML = `${esc(it.prefix || "")}${esc(shown)}<small>${esc(it.suffix || "")}</small>`;
          num.style.opacity = E.out(prog(t, st, 0.4));
          show(lab, E.out(prog(t, st + 0.3, 0.5)), { y: 10 });
          lab.style.transform = `translate(-50%, 0) ${lab.style.transform}`;
        });
        return {};
      },
    };
  },

  /** A hologram of the logo projected from a glowing base, with scan lines across the frame. */
  hologram(s, ctx) {
    const el = div("sc s-holo", `<div class="txt pos-${fmt(ctx, "top", "left", "left")}">${s.kicker ? `<div class="kicker">${words(s.kicker)}</div>` : ""}<h1 class="big holo-text">${(s.lines || []).map((l) => `<span class="line">${words(l)}</span>`).join("")}</h1>${s.sub ? `<p class="sub">${words(s.sub)}</p>` : ""}</div>`);
    const kick = el.querySelector(".kicker"), ws = [...el.querySelectorAll("h1 .w")], sub = el.querySelector(".sub");
    const { logo, projector } = ctx.props;
    const base = fmt(ctx, [0, -3.6, 0], [2.0, -2.2, 0], [3.6, -2.0, 0]);
    return {
      el, speed: 0.4, scan: 0.8,
      cues: [{ t: 0.05, type: "glitch" }, { t: 0.3, type: "hum", dur: 2 }],
      update(t, d, T) {
        cam(ctx, T, [lerp(-1, 1, prog(t, 0, d)) + base[0] * 0.3, 0.6, fmt(ctx, 11, 9.5, 9)], [base[0] * 0.25, base[1] + fmt(ctx, 4.4, 2.2, 2.2), 0], 0.7);
        projector.visible = true; projector.position.set(...base); projector.scale.setScalar(1.3); projector.tick(T, E.out(prog(t, 0, 0.4)));
        const on = E.out(prog(t, 0.2, 0.6)); const flicker = t < 0.8 ? (Math.sin(t * 90) > 0 ? 1 : 0.3) : 1;
        logo.visible = true; logo.setFinish("holo"); logo.tick(T, on * flicker);
        logo.position.set(base[0], base[1] + 2.5 + Math.sin(T * 1.2) * 0.08, 0); logo.scale.setScalar(fmt(ctx, 1.9, 1.3, 1.25) * lerp(0.6, 1, on)); logo.rotation.set(0, Math.sin(T * 0.9) * 0.55, 0);
        show(kick, E.out(prog(t, 0.2, 0.4)), { y: 14 });
        ws.forEach((w, i) => { const k = E.out(prog(t, 0.3 + i * 0.07, 0.4)); show(w, k, { x: -20, blur: 14 }); w.style.opacity = k * (t < 0.3 + i * 0.07 + 0.4 && Math.sin(t * 70 + i) > 0.3 ? 0.4 : 1); });
        show(sub, E.out(prog(t, 0.5 + ws.length * 0.07, 0.5)), { y: 20 });
        return { glitch: Math.exp(-t * 8) * 0.6 };
      },
    };
  },

  /** Numbered steps joined by a glowing line that draws itself. */
  steps(s, ctx) {
    const list = s.steps || [];
    const el = div("sc s-steps", `<div class="txt pos-${fmt(ctx, "center", "center", "center")}">${s.kicker ? `<div class="kicker">${words(s.kicker)}</div>` : ""}<h2 class="mid">${words(s.title)}</h2><ol class="flow">${list.map((x, i) => `<li><span class="n">${i + 1}</span><span class="t">${words(x)}</span></li>`).join("")}</ol></div>`);
    const kick = el.querySelector(".kicker"), title = el.querySelector("h2"), lis = [...el.querySelectorAll("li")];
    const per = Math.min(0.75, 2.6 / Math.max(1, list.length));
    return {
      el, speed: 0.6,
      cues: list.map((_, i) => ({ t: 0.35 + i * per, type: "pop" })),
      update(t, d, T) {
        cam(ctx, T, [lerp(1, -1, prog(t, 0, d)), 0.4, 8], [0, 0, -4], 1);
        show(kick, E.out(prog(t, 0, 0.4)), { y: 14 });
        show(title, E.out(prog(t, 0.05, 0.5)), { y: 24, blur: 10 });
        lis.forEach((li, i) => {
          const st = 0.35 + i * per; show(li, E.out(prog(t, st, 0.5)), { x: -40, blur: 10 });
          li.querySelector(".n").style.transform = `scale(${E.back(prog(t, st, 0.45))})`;
          li.style.setProperty("--line", clamp(prog(t, st + 0.2, per)));
        });
        return {};
      },
    };
  },

  /** Closing call to action: chrome logo lands with a shock ring; button pulses. */
  cta(s, ctx) {
    const el = div("sc s-cta", `<div class="txt pos-bottom center"><h2 class="mid">${words(s.title || "Create your *free* account")}</h2><div class="btn">${esc(s.button || "Sign up free")}</div><div class="url">${esc(s.url || "almightypumps.com")}</div></div>`);
    const ws = [...el.querySelectorAll("h2 .w")], btn = el.querySelector(".btn"), url = el.querySelector(".url");
    const { logo } = ctx.props;
    const shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.02, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(BRAND.accent).multiplyScalar(3), transparent: true, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    shock.visible = false; ctx.stage.scene.add(shock);
    const land = 0.55;
    return {
      el, objects: [shock], speed: 0.5,
      cues: [{ t: 0, type: "whoosh" }, { t: land, type: "impact" }],
      update(t, d, T) {
        const y = fmt(ctx, 2.3, 1.15, 0.95);
        cam(ctx, T, [0, fmt(ctx, 0.7, 0.2, 0.1), lerp(7.4, 6.8, E.out(prog(t, 0, d)))], [0, fmt(ctx, 0.6, 0.1, 0.0), 0], 0.6);
        logo.visible = true; logo.setFinish(s.finish || "chrome"); logo.tick(T, 1);
        const k = E.out5(prog(t, 0, land));
        logo.position.set(0, y, lerp(-14, 0, k)); logo.rotation.set(0, lerp(Math.PI * 2.5, 0, k) + Math.sin(T) * 0.08, 0);
        logo.scale.setScalar(fmt(ctx, 1.25, 0.85, 0.8));
        ctx.stage.scene.environmentRotation.set(0, T * 0.6, 0);
        const sk = prog(t, land, 0.9); shock.visible = t > land && sk < 1; shock.position.set(0, y, 0); shock.scale.setScalar(0.5 + E.out(sk) * 6); shock.material.opacity = 1 - sk;
        ws.forEach((w, i) => show(w, E.out(prog(t, 0.6 + i * 0.06, 0.5)), { y: 30, blur: 12 }));
        const bk = prog(t, 0.9 + ws.length * 0.06, 0.5);
        btn.style.opacity = bk > 0 ? 1 : 0;
        btn.style.transform = `scale(${E.back(bk) * (t > 2 ? 1 + 0.03 * Math.sin((t - 2) * 5) : 1)})`;
        show(url, E.out(prog(t, 1.2 + ws.length * 0.06, 0.5)), { y: 14 });
        const hit = t >= land ? Math.exp(-(t - land) * 8) : 0;
        return { flash: hit * 0.4, shake: hit, bloom: 0.55 + hit * 0.6 };
      },
    };
  },
};

/** The cartoon guide talks: a speech bubble fills in word by word while his mouth moves and he gestures.
 *  fields: lines (bubble text), gesture or gestures (wave, point, pointUp, present, thumbs, explain, cheer), icons, enter, kicker */
SCENES.talk = function talk(s, ctx) {
  const text = Array.isArray(s.lines) ? s.lines.join(" ") : s.lines || s.say || "";
  const side = fmt(ctx, "top", "right", "right");
  const el = div(`sc s-talk bub-${side}`, `<div class="bubble">${s.kicker ? `<div class="kicker">${words(s.kicker)}</div>` : ""}<p class="say">${words(text)}</p></div>`);
  const bubble = el.querySelector(".bubble"), ws = [...el.querySelectorAll(".say .w")], kick = el.querySelector(".kicker");
  const { toon } = ctx.props;
  const icons = (s.icons || []).map((k) => { const m = makeIcon(k); m.visible = false; ctx.stage.scene.add(m); return m; });
  const gestures = s.gestures || [s.gesture || "explain"];
  const base = fmt(ctx, [0, -4.9, 0], [-1.9, -2.9, 0], [-3.4, -2.6, 0]);
  const size = fmt(ctx, 2.05, 1.65, 1.6);
  return {
    el, objects: icons, speed: 0.5,
    cues: [{ t: 0.05, type: "pop" }, ...icons.map((_, i) => ({ t: 0.5 + i * 0.35, type: "tick" }))],
    update(t, d, T) {
      const push = E.inOut(prog(t, 0, d));
      cam(ctx, T, [base[0] * 0.25 + lerp(-0.4, 0.4, push), fmt(ctx, -0.6, -0.2, 0), fmt(ctx, lerp(10.2, 9.4, push), lerp(9.6, 9, push), lerp(9.6, 9, push))], [base[0] * 0.25, fmt(ctx, -1.0, -0.4, -0.3), 0], 0.6);
      toon.visible = true;
      const enter = s.enter ? E.back(prog(t, 0, 0.5)) : 1;
      toon.position.set(...base); toon.scale.setScalar(size * clamp(enter, 0.001, 2));
      toon.rotation.y = fmt(ctx, 0, 0.25, 0.3) + (s.enter ? (1 - E.out(prog(t, 0, 0.6))) * -2.4 : 0);
      const talkStart = 0.3, talkEnd = d - 0.35;
      const talk = clamp(prog(t, talkStart, 0.15) * (1 - prog(t, talkEnd, 0.2)));
      const seg = d / gestures.length; const gi = Math.min(gestures.length - 1, Math.floor(t / seg)); const gt = t - gi * seg;
      toon.pose(T, { talk, gesture: gestures[gi], from: gi ? gestures[gi - 1] : "idle", k: E.out(prog(gt, 0.05, 0.45)), look: fmt(ctx, 0, 0.15, 0.2), hop: s.enter ? Math.max(0, Math.sin(clamp(t / 0.5) * Math.PI)) * 0.25 : 0 });
      // speech bubble: pops, then words appear in time with the talking
      const bk = E.back(prog(t, 0.05, 0.4));
      bubble.style.opacity = clamp(prog(t, 0.05, 0.15)); bubble.style.transform = `scale(${clamp(bk, 0, 1.2)})`;
      show(kick, E.out(prog(t, 0.15, 0.3)), { y: 10 });
      const span = Math.max(0.3, (talkEnd - talkStart) * 0.55);
      ws.forEach((w, i) => { const st = talkStart + (i / Math.max(1, ws.length)) * span; show(w, E.out(prog(t, st, 0.18)), { y: 12, blur: 6 }); });
      // icons float in an arc around his head
      icons.forEach((m, i) => {
        const st = 0.5 + i * 0.35; const k = E.back(prog(t, st, 0.45));
        m.visible = t > st;
        const sd = i % 2 ? 1 : -1, row = Math.floor(i / 2);
        const x = base[0] + sd * fmt(ctx, 2.75 + row * 0.15, 2.0, 2.2), y = base[1] + size * fmt(ctx, 2.6, 2.4, 2.4) - row * fmt(ctx, 1.55, 1.2, 1.2) + Math.sin(T * 1.6 + i) * 0.1;
        const a = sd * 0.5;
        m.position.set(x, y, 0.8 + Math.cos(a) * 0.4);
        m.scale.setScalar(clamp(k, 0, 1.3) * fmt(ctx, 0.85, 0.7, 0.7));
        m.rotation.set(Math.sin(T * 0.9 + i) * 0.25, Math.sin(T * 1.2 + i * 2) * 0.5, Math.sin(T * 0.7 + i) * 0.1);
      });
      return { bloom: 0.6 };
    },
  };
};
