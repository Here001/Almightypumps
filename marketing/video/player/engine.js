/* Almighty Pumps video engine.
 * Every frame is drawn from a time value: window.seek(seconds). Nothing animates on its own,
 * so the renderer can step through the video frame by frame and get the same picture every time.
 */
(() => {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const E = {
    out: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  const prog = (t, start, dur) => clamp((t - start) / dur);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let U = 10; // px per unit (1% of the shorter side), set on load

  /** Text with *stars* around orange words, split into word spans for animation. */
  function words(text) {
    let html = "";
    for (const part of String(text ?? "").split(/(\*[^*]+\*)/g)) {
      if (!part) continue;
      const hl = part.length > 2 && part.startsWith("*") && part.endsWith("*");
      const body = hl ? part.slice(1, -1) : part;
      for (const w of body.split(/(\s+)/)) {
        if (!w) continue;
        html += /^\s+$/.test(w) ? " " : `<span class="word${hl ? " hl" : ""}">${esc(w)}</span>`;
      }
    }
    return html;
  }

  function markSvg() {
    return `<svg class="mark" viewBox="0 0 200 200">
      <polygon class="tri" points="20,175 120,20 120,175" fill="#F4F2EE"/>
      <path class="bowl" d="M120 20 H145 A50 50 0 0 1 145 120 H120 Z M120 46 H145 A24 24 0 0 1 145 94 H120 Z" fill="#F4F2EE" fill-rule="evenodd"/>
      <polyline class="chev" pathLength="1" points="52,162 82,124 112,162" fill="none" stroke="#FF5A1F" stroke-width="13" stroke-linejoin="miter" stroke-dasharray="1 1"/>
    </svg>`;
  }
  const chevSvg = () => `<svg viewBox="40 110 84 64"><polyline pathLength="1" points="52,162 82,124 112,162" stroke-dasharray="1 1"/></svg>`;

  /** Fade + rise into place. k goes 0 → 1. */
  function rise(el, k, dist = 4, axis = "Y") {
    if (!el) return;
    el.style.opacity = k;
    el.style.transform = `translate${axis}(${((1 - k) * dist * U).toFixed(2)}px)`;
  }
  function stagger(els, t, start, gap, dur = 0.55, dist = 5) {
    els.forEach((el, i) => rise(el, E.out(prog(t, start + i * gap, dur)), dist));
  }
  function drawMark(svg, t, start) {
    const tri = svg.querySelector(".tri"), bowl = svg.querySelector(".bowl"), chev = svg.querySelector(".chev");
    const a = E.out(prog(t, start, 0.55)), b = E.out(prog(t, start + 0.18, 0.55)), c = E.inOut(prog(t, start + 0.45, 0.5));
    tri.style.opacity = a; tri.style.transform = `translateY(${(1 - a) * 30}px)`;
    bowl.style.opacity = b; bowl.style.transform = `translateX(${(1 - b) * -24}px)`;
    chev.style.strokeDashoffset = 1 - c;
  }

  /* ---------- Scene types ---------- */
  const SCENES = {
    logo(s) {
      const el = div("scene s-logo", `${markSvg()}<div class="wordmark">ALMIGHTY PUMPS</div>${s.tagline ? `<div class="tagline">${words(s.tagline)}</div>` : ""}`);
      const svg = el.querySelector("svg"), wm = el.querySelector(".wordmark"), tag = el.querySelectorAll(".tagline .word");
      return { el, update(t, d) {
        drawMark(svg, t, 0.1);
        svg.style.transform = `scale(${0.94 + 0.06 * (t / d)})`;
        const w = E.inOut(prog(t, 0.75, 0.7));
        wm.style.clipPath = `inset(0 ${(1 - w) * 100}% 0 0)`;
        wm.style.opacity = w > 0 ? 1 : 0;
        stagger([...tag], t, 1.25, 0.12);
      } };
    },
    headline(s) {
      const lines = (s.lines || []).map((l) => `<span class="line">${words(l)}</span>`).join("");
      const el = div("scene s-headline", `${s.kicker ? `<div class="kicker">${words(s.kicker)}</div>` : ""}<h1>${lines}</h1>${s.sub ? `<p class="sub">${words(s.sub)}</p>` : ""}`);
      const kick = el.querySelector(".kicker"), ws = [...el.querySelectorAll("h1 .word")], sub = el.querySelector(".sub");
      return { el, update(t) {
        rise(kick, E.out(prog(t, 0.05, 0.5)), 3);
        stagger(ws, t, 0.08, 0.07, 0.55, 7);
        rise(sub, E.out(prog(t, 0.35 + ws.length * 0.07, 0.6)), 3);
      } };
    },
    list(s) {
      const items = (s.items || []).map((it) => `<li>${chevSvg()}<div><div class="it">${words(it.title)}</div>${it.text ? `<div class="ix">${words(it.text)}</div>` : ""}</div></li>`).join("");
      const el = div("scene s-list", `${s.title ? `<div class="title">${words(s.title)}</div>` : ""}<ul>${items}</ul>`);
      const title = el.querySelector(".title"), lis = [...el.querySelectorAll("li")];
      const gap = Math.min(0.32, 2.2 / Math.max(1, lis.length));
      return { el, update(t) {
        rise(title, E.out(prog(t, 0, 0.45)), 3);
        lis.forEach((li, i) => {
          const st = 0.15 + i * gap;
          rise(li, E.out(prog(t, st, 0.6)), 8, "X");
          li.querySelector("polyline").style.strokeDashoffset = 1 - E.inOut(prog(t, st + 0.2, 0.45));
        });
      } };
    },
    steps(s) {
      const items = (s.steps || []).map((x, i) => `<li><span class="n">${i + 1}</span><span class="txt">${words(x)}</span></li>`).join("");
      const el = div("scene s-steps", `${s.title ? `<div class="title">${words(s.title)}</div>` : ""}<ol>${items}</ol>`);
      const title = el.querySelector(".title"), lis = [...el.querySelectorAll("li")];
      return { el, update(t) {
        rise(title, E.out(prog(t, 0, 0.45)), 3);
        lis.forEach((li, i) => {
          const st = 0.15 + i * 0.55;
          const n = li.querySelector(".n"), txt = li.querySelector(".txt");
          const k = prog(t, st, 0.5);
          n.style.opacity = k > 0 ? 1 : 0;
          n.style.transform = `scale(${E.back(k)})`;
          rise(txt, E.out(prog(t, st + 0.12, 0.55)), 5, "X");
        });
      } };
    },
    cta(s) {
      const el = div("scene s-cta", `${markSvg()}<h2>${words(s.title || "Create your free account")}</h2><div class="btn">${esc(s.button || "Sign up free")}</div><div class="url">${esc(s.url || "almightypumps.com")}</div>`);
      const svg = el.querySelector("svg"), ws = [...el.querySelectorAll("h2 .word")], btn = el.querySelector(".btn"), url = el.querySelector(".url");
      return { el, update(t) {
        drawMark(svg, t, 0.05);
        stagger(ws, t, 0.35, 0.07, 0.6, 6);
        const bk = prog(t, 0.6 + ws.length * 0.07, 0.5);
        btn.style.opacity = bk > 0 ? 1 : 0;
        const pulse = t > 2 ? 1 + 0.025 * Math.sin((t - 2) * 4) : 1;
        btn.style.transform = `scale(${(0.6 + 0.4 * E.back(bk)) * pulse})`;
        rise(url, E.out(prog(t, 0.9 + ws.length * 0.07, 0.5)), 3);
      } };
    },
  };

  function div(cls, html) { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; return d; }

  /* ---------- Timeline ---------- */
  const EXIT = 0.3; // seconds each scene takes to fade out before the next one
  let timeline = [], total = 0;

  window.loadAd = (ad, format) => {
    document.body.className = `f-${format}`;
    U = Math.min(innerWidth, innerHeight) / 100;
    const root = document.getElementById("scenes");
    root.innerHTML = "";
    timeline = []; total = 0;
    for (const s of ad.scenes) {
      const make = SCENES[s.type];
      if (!make) throw new Error(`Unknown scene type "${s.type}". Use one of: ${Object.keys(SCENES).join(", ")}`);
      const sc = make(s);
      root.appendChild(sc.el);
      const dur = Number(s.duration) || 3;
      timeline.push({ ...sc, type: s.type, start: total, dur, corner: !["logo", "cta"].includes(s.type) });
      total += dur;
    }
    window.duration = total;
    return total;
  };

  window.seek = (T) => {
    const glow = document.querySelector(".glow"), chev = document.querySelector(".bg-chevron"), cornerEl = document.querySelector(".corner-logo");
    glow.style.transform = `translate(-50%, -50%) scale(${1 + 0.06 * Math.sin(T * 0.9)})`;
    chev.style.transform = `translate(-50%, calc(-50% + ${(-T * 0.6).toFixed(2)}vmin)) rotate(${(-4 + T * 0.25).toFixed(2)}deg)`;

    // One scene at a time: each fades up and out in its last EXIT seconds, then the next one builds in.
    let idx = timeline.findIndex((s) => T < s.start + s.dur);
    if (idx < 0) idx = timeline.length - 1;
    let corner = 0;
    timeline.forEach((s, i) => {
      const on = i === idx;
      s.el.classList.toggle("on", on);
      if (!on) return;
      const t = T - s.start, last = i === timeline.length - 1;
      s.update(t, s.dur);
      const k = last ? 0 : E.inOut(prog(t, s.dur - EXIT, EXIT));
      s.el.style.opacity = 1 - k;
      s.el.style.transform = `translateY(${(-k * 3 * U).toFixed(2)}px)`;
      // Corner logo: shown on content scenes, hidden on the logo and call-to-action scenes.
      if (s.corner) {
        const fadeIn = timeline[i - 1]?.corner ? 1 : E.out(prog(t, 0, 0.4));
        const fadeOut = last || timeline[i + 1]?.corner ? 1 : 1 - k;
        corner = fadeIn * fadeOut;
      }
    });
    cornerEl.style.opacity = corner;
  };
})();
