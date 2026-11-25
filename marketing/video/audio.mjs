// Sound design, synthesised from scratch (no samples, no licences needed): a dark pad, an optional beat,
// and hits / whooshes / risers / impacts placed on the video's cues. Returns a 48 kHz stereo WAV buffer.

const SR = 48000;

function rng(seed = 1) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; }; }

export function renderAudio({ duration, cues = [], bpm = 100, beat = true, key = 45, seed = 1, padLevel = 1 }) {
  const n = Math.ceil((duration + 0.5) * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const noise = rng(seed * 7919);
  const add = (i, v, pan = 0) => { if (i >= 0 && i < n) { L[i] += v * (1 - Math.max(0, pan)); R[i] += v * (1 + Math.min(0, pan)); } };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Pad: minor chord, softly detuned, slow filter movement, fades in and out.
  const chord = [key, key + 7, key + 12, key + 15, key + 19];
  let lp = 0, lp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const [j, m] of chord.entries()) {
      const f = hz(m);
      for (const det of [-0.12, 0.12]) { const ph = 2 * Math.PI * f * (1 + det / 100) * t; v += (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph)) * (j === 0 ? 0.6 : 0.35); }
    }
    const cut = 0.02 + 0.015 * Math.sin(t * 0.35);
    lp += cut * (v - lp); lp2 += cut * (lp - lp2);
    const env = Math.min(1, t / 1.2) * Math.min(1, Math.max(0, duration + 0.3 - t) / 1.5);
    const val = lp2 * 0.045 * env * padLevel;
    L[i] += val * (1 + 0.15 * Math.sin(t * 0.7)); R[i] += val * (1 - 0.15 * Math.sin(t * 0.7));
  }

  // Beat: kick on every beat, hats on off-beats, sub on 1 and 3. Starts after the first second.
  if (beat) {
    const spb = 60 / bpm;
    for (let b = 0, t0 = 0.95; t0 < duration - 0.6; b++, t0 += spb) {
      kick(t0, 0.55);
      hat(t0 + spb / 2, 0.08, 0.25);
      if (b % 2 === 1) hat(t0 + spb * 0.75, 0.05, -0.25);
      if (b % 4 === 0) sub(t0, spb * 1.8, hz(key - 12), 0.22);
    }
  }

  for (const c of cues) {
    const p = (noise() * 0.5);
    switch (c.type) {
      case "hit": kick(c.t, 0.8); snap(c.t, 0.35, p); break;
      case "impact": boom(c.t, 1.0); snap(c.t, 0.5, 0); break;
      case "riser": riser(c.t, c.dur || 1.2, 0.35); break;
      case "whoosh": whoosh(c.t, 0.55, 0.4, p); break;
      case "swoosh": whoosh(c.t, 0.4, 0.22, p); break;
      case "swell": whoosh(c.t - 0.25, 0.5, 0.3, 0); break;
      case "glitch": glitch(c.t, 0.22, 0.3); break;
      case "pop": blip(c.t, 0.25, p); break;
      case "tick": blip(c.t, 0.15, p); break;
      case "count": for (let k = 0; k < (c.dur || 1) / 0.07; k++) tickClick(c.t + k * 0.07, 0.1 * (1 - k * 0.04), p); break;
      case "hum": hum(c.t, c.dur || 1.5, 0.05); break;
      default: whoosh(c.t, 0.4, 0.25, p);
    }
  }

  // Short room reverb on everything, soft clip, normalise.
  for (const ch of [L, R]) {
    const d1 = Math.floor(SR * 0.037), d2 = Math.floor(SR * 0.053), d3 = Math.floor(SR * 0.079);
    const buf = Float32Array.from(ch);
    for (let i = d3; i < n; i++) ch[i] += 0.22 * buf[i - d1] + 0.16 * buf[i - d2] + 0.12 * buf[i - d3] + 0.25 * ch[i - d3] * 0.5;
  }
  let peak = 1e-6;
  for (let i = 0; i < n; i++) { L[i] = Math.tanh(L[i] * 1.2); R[i] = Math.tanh(R[i] * 1.2); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const gain = 0.89 / peak;
  const out = Buffer.alloc(44 + n * 4);
  out.write("RIFF", 0); out.writeUInt32LE(36 + n * 4, 4); out.write("WAVE", 8); out.write("fmt ", 12);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28);
  out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { out.writeInt16LE(Math.round(L[i] * gain * 32767), 44 + i * 4); out.writeInt16LE(Math.round(R[i] * gain * 32767), 46 + i * 4); }
  return out;

  function kick(t0, amp) {
    const s = Math.floor(t0 * SR); let ph = 0;
    for (let i = 0; i < SR * 0.4; i++) { const t = i / SR; const f = 45 + 110 * Math.exp(-t * 28); ph += (2 * Math.PI * f) / SR; const v = Math.sin(ph) * Math.exp(-t * 9) * amp; add(s + i, v); }
  }
  function sub(t0, dur, f, amp) {
    const s = Math.floor(t0 * SR);
    for (let i = 0; i < SR * dur; i++) { const t = i / SR; add(s + i, Math.sin(2 * Math.PI * f * t) * amp * Math.min(1, t * 30) * Math.exp(-t * 1.6)); }
  }
  function hat(t0, amp, pan) {
    const s = Math.floor(t0 * SR); let prev = 0;
    for (let i = 0; i < SR * 0.05; i++) { const x = noise(); const hp = x - prev; prev = x; add(s + i, hp * amp * Math.exp(-i / SR * 90), pan); }
  }
  function snap(t0, amp, pan) {
    const s = Math.floor(t0 * SR); let lpv = 0;
    for (let i = 0; i < SR * 0.18; i++) { const x = noise(); lpv += 0.3 * (x - lpv); add(s + i, (x - lpv * 0.5) * amp * Math.exp(-i / SR * 28), pan); }
  }
  function boom(t0, amp) {
    const s = Math.floor(t0 * SR); let ph = 0, lpv = 0;
    for (let i = 0; i < SR * 1.6; i++) {
      const t = i / SR; const f = 28 + 70 * Math.exp(-t * 6); ph += (2 * Math.PI * f) / SR;
      const x = noise(); lpv += 0.04 * (x - lpv);
      add(s + i, (Math.sin(ph) * 0.9 * Math.exp(-t * 2.4) + lpv * 1.6 * Math.exp(-t * 3.5)) * amp);
    }
  }
  function riser(t0, dur, amp) {
    const s = Math.floor(t0 * SR); let lpv = 0, ph = 0;
    for (let i = 0; i < SR * dur; i++) {
      const k = i / (SR * dur); const x = noise(); lpv += (0.01 + 0.25 * k * k) * (x - lpv);
      ph += (2 * Math.PI * (180 + 900 * k * k)) / SR;
      add(s + i, (lpv * 0.9 + Math.sin(ph) * 0.12) * amp * k * k, Math.sin(k * 12) * 0.3);
    }
  }
  function whoosh(t0, dur, amp, pan) {
    const s = Math.floor(t0 * SR); let a = 0, b = 0;
    for (let i = 0; i < SR * dur; i++) {
      const k = i / (SR * dur); const x = noise(); const c = 0.02 + 0.3 * Math.sin(Math.PI * k);
      a += c * (x - a); b += c * 0.5 * (a - b);
      add(s + i, (a - b) * amp * 2.2 * Math.sin(Math.PI * k), pan * (k * 2 - 1));
    }
  }
  function glitch(t0, dur, amp) {
    const s = Math.floor(t0 * SR); let hold = 0;
    for (let i = 0; i < SR * dur; i++) { if (i % 300 === 0) hold = noise() * (Math.floor(i / 1200) % 2 ? 1 : 0.3); const f = 220 * (1 + Math.floor(i / 2400)); add(s + i, (hold * 0.6 + Math.sign(Math.sin((2 * Math.PI * f * i) / SR)) * 0.25) * amp * (1 - i / (SR * dur))); }
  }
  function blip(t0, amp, pan) {
    const s = Math.floor(t0 * SR); let ph = 0;
    for (let i = 0; i < SR * 0.12; i++) { const t = i / SR; ph += (2 * Math.PI * (900 + 900 * t * 8)) / SR; add(s + i, Math.sin(ph) * amp * Math.exp(-t * 30), pan); }
  }
  function tickClick(t0, amp, pan) {
    const s = Math.floor(t0 * SR);
    for (let i = 0; i < SR * 0.01; i++) add(s + i, Math.sin((2 * Math.PI * 3200 * i) / SR) * amp * (1 - i / (SR * 0.01)), pan);
  }
  function hum(t0, dur, amp) {
    const s = Math.floor(t0 * SR);
    for (let i = 0; i < SR * dur; i++) { const t = i / SR; const e = Math.min(1, t * 4) * Math.min(1, (dur - t) * 4); add(s + i, (Math.sin(2 * Math.PI * 110 * t) + 0.5 * Math.sin(2 * Math.PI * 220 * t) + 0.3 * Math.sin(2 * Math.PI * 330 * t)) * amp * e); }
  }
}
