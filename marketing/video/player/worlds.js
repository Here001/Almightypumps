// Worlds: the 3D backgrounds. Each video (or each scene) picks one, so the ads don't all look the same.
// A world gets a palette [main, second] and returns { group, update(T, ctx) }.
import { THREE, bgQuad, dotTexture, rng, GLSL_NOISE } from "./core.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const col = (c) => new THREE.Color(c);
function setPal(mat, pal) { if (mat.uniforms?.uA) mat.uniforms.uA.value = col(pal[0]); if (mat.uniforms?.uB) mat.uniforms.uB.value = col(pal[1]); }

function dust(count, spread, color, size = 0.08, seed = 3) {
  const r = rng(seed), pos = new Float32Array(count * 3), rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos.set([(r() - 0.5) * spread[0], (r() - 0.5) * spread[1], -r() * spread[2] + 4], i * 3); rnd[i] = r(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: dotTexture() }, uC: { value: col(color) }, uSize: { value: size * 900 }, uRise: { value: 0.15 }, uSpan: { value: spread[1] } },
    vertexShader: /* glsl */ `attribute float aRnd; uniform float uTime, uSize, uRise, uSpan; varying float vA;
      void main(){ vec3 p = position; p.y = mod(p.y + uTime * uRise * (0.5 + aRnd) + uSpan * 0.5, uSpan) - uSpan * 0.5;
        p.x += sin(uTime * 0.3 + aRnd * 40.0) * 0.3; vA = 0.25 + 0.75 * fract(aRnd * 7.0 + uTime * 0.1 * aRnd);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = uSize * (0.3 + aRnd) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uC; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(uC * a * vA, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  return pts;
}

export const WORLDS = {
  /** Deep space nebula in the palette colours, with stars and floating dust. */
  nebula(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(/* glsl */ `void main(){
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.2 + uCam * 0.12; float t = uTime * 0.035;
      float n = fbm(p * 1.3 + vec2(t, -t * 0.7) + fbm(p * 2.1 - t) * 1.3);
      float n2 = fbm(p * 2.6 - vec2(t * 1.4, t) + 4.0);
      vec3 c = vec3(0.018, 0.02, 0.032) + uA * pow(n, 3.2) * 1.5 + uB * pow(n2, 3.5) * 1.1;
      vec2 gg = floor((vUv + uCam * 0.01) * vec2(uAspect, 1.0) * 220.0); float s = hash(gg);
      c += step(0.9965, s) * vec3(0.9) * (0.55 + 0.45 * sin(uTime * 2.5 + s * 80.0));
      gl_FragColor = vec4(c, 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    const d = dust(1400, [24, 16, 30], pal[0], 0.07); g.add(d);
    return { group: g, env: pal, update(T, c) { bg.material.uniforms.uTime.value = T; bg.material.uniforms.uAspect.value = ctx.aspect; bg.material.uniforms.uCam.value.set(c.position.x, c.position.y); d.material.uniforms.uTime.value = T; } };
  },

  /** Retro-future neon grid floor running to a striped sun on the horizon. */
  grid(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(/* glsl */ `void main(){
      float y = vUv.y; vec3 c = mix(vec3(0.02, 0.015, 0.04), vec3(0.06, 0.02, 0.07), smoothstep(0.2, 1.0, y));
      c += uB * 0.35 * exp(-abs(y - 0.42) * 9.0);
      vec2 sp = (vUv - vec2(0.5, 0.47)) * vec2(uAspect, 1.0); float r = length(sp);
      float sun = smoothstep(0.205, 0.2, r) * step(0.0, sp.y + 0.02);
      float stripes = step(0.5, fract((sp.y) * 34.0 + uTime * 0.4)) + step(0.09, sp.y);
      c = mix(c, mix(uA * 1.4, vec3(1.0, 0.85, 0.4) * 1.2, smoothstep(-0.02, 0.2, sp.y)), sun * clamp(stripes, 0.0, 1.0));
      c += uA * 0.25 * exp(-r * 5.0);
      gl_FragColor = vec4(c, 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: col(pal[0]) }, uB: { value: col(pal[1]) } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uA, uB; varying vec3 vW;
        void main(){ vec2 q = vW.xz * 0.7; q.y += uTime * 2.2; vec2 gr = abs(fract(q - 0.5) - 0.5) / fwidth(q);
          float line = 1.0 - min(min(gr.x, gr.y), 1.0); float dist = length(vW.xz); float fade = exp(-dist * 0.035);
          vec3 c = vec3(0.012, 0.01, 0.02) + mix(uA, uB, clamp(dist / 60.0, 0.0, 1.0)) * line * 2.2 * fade;
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.2; g.add(floor);
    const d = dust(500, [30, 10, 40], pal[1], 0.05, 9); g.add(d);
    return { group: g, env: pal, update(T) { bg.material.uniforms.uTime.value = T; bg.material.uniforms.uAspect.value = ctx.aspect; floor.material.uniforms.uTime.value = T; d.material.uniforms.uTime.value = T; } };
  },

  /** Liquid chrome blobs slowly morphing in a dark studio. */
  chrome(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(/* glsl */ `void main(){ vec2 p = (vUv - vec2(0.5, 0.6)) * vec2(uAspect, 1.0);
      vec3 c = mix(vec3(0.07, 0.075, 0.09), vec3(0.012, 0.013, 0.018), smoothstep(0.0, 0.9, length(p)));
      c += uB * 0.12 * exp(-length(p - vec2(0.35, 0.25)) * 3.0) + uA * 0.08 * exp(-length(p + vec2(0.4, 0.3)) * 3.0);
      gl_FragColor = vec4(c, 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    const blobs = [];
    const r = rng(11);
    const mat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 1, roughness: 0.06, envMapIntensity: 1.6 });
    for (let i = 0; i < 4; i++) {
      const geo = mergeVertices(new THREE.IcosahedronGeometry(1, 18));
      geo.userData.base = geo.attributes.position.array.slice();
      const m = new THREE.Mesh(geo, mat);
      const s = [1.6, 1.0, 0.7, 0.5][i];
      m.scale.setScalar(s);
      m.userData = { home: new THREE.Vector3((r() - 0.5) * 7, (r() - 0.5) * 6, -4 - r() * 5), seed: r() * 10 };
      g.add(m); blobs.push(m);
    }
    return { group: g, env: pal, update(T) {
      bg.material.uniforms.uAspect.value = ctx.aspect;
      for (const m of blobs) {
        const { home, seed } = m.userData; const base = m.geometry.userData.base; const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
          const k = 1 + 0.16 * Math.sin(x * 2.4 + T * 0.9 + seed) * Math.sin(y * 2.1 + T * 0.7) + 0.1 * Math.sin(z * 3.2 - T * 1.1 + seed);
          pos.setXYZ(i, x * k, y * k, z * k);
        }
        pos.needsUpdate = true; m.geometry.computeVertexNormals();
        m.position.set(home.x + Math.sin(T * 0.3 + seed) * 0.6, home.y + Math.cos(T * 0.25 + seed) * 0.5, home.z);
        m.rotation.set(T * 0.1 + seed, T * 0.13, 0);
      }
    } };
  },

  /** Night city flyover: towers with lit windows, a glowing road, haze. */
  city(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(/* glsl */ `void main(){ float y = vUv.y;
      vec3 c = mix(uA * 0.32 + vec3(0.03), vec3(0.01, 0.012, 0.03), smoothstep(0.25, 0.85, y)); c += uB * 0.1 * smoothstep(0.6, 1.0, y);
      gl_FragColor = vec4(c, 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    const wc = document.createElement("canvas"); wc.width = 64; wc.height = 128; const wg = wc.getContext("2d");
    const r = rng(21);
    wg.fillStyle = "#000"; wg.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) { const k = r(); if (k > 0.55) { wg.fillStyle = k > 0.9 ? "#FFE7C2" : k > 0.75 ? pal[0] : "#3A3F55"; wg.fillRect(x, y, 4, 5); } }
    const wtex = new THREE.CanvasTexture(wc); wtex.colorSpace = THREE.SRGBColorSpace; wtex.magFilter = THREE.NearestFilter;
    const N = 420;
    const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#0c0e15", roughness: 0.6, metalness: 0.4, emissive: "#ffffff", emissiveMap: wtex, emissiveIntensity: 1.6 }), N);
    const data = [];
    for (let i = 0; i < N; i++) { const side = i % 2 ? 1 : -1; data.push({ x: side * (3 + r() * 26), z: -r() * 160, w: 1 + r() * 2.5, d: 1 + r() * 2.5, h: 2 + Math.pow(r(), 2) * 22 }); }
    g.add(towers);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(4, 400), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: col(pal[0]) } },
      vertexShader: `varying vec2 vUv; varying float vZ; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vZ = w.z; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uA; varying vec2 vUv; varying float vZ; void main(){ float dash = step(0.5, fract(vZ * 0.25 + uTime * 3.0)) * step(abs(vUv.x - 0.5), 0.02);
        float edge = exp(-abs(abs(vUv.x - 0.5) - 0.48) * 120.0); float fade = exp(-abs(vZ) * 0.02);
        gl_FragColor = vec4((vec3(0.02) + uA * (dash * 1.5 + edge * 2.0)) * fade, 1.0); }`,
    }));
    road.rotation.x = -Math.PI / 2; road.position.y = -2.5; g.add(road);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#05060a", roughness: 0.4, metalness: 0.6 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -2.52; g.add(ground);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
    const amb = new THREE.HemisphereLight(pal[0], "#000000", 0.6); g.add(amb);
    return { group: g, env: pal, fog: new THREE.FogExp2(new THREE.Color(pal[0]).multiplyScalar(0.12), 0.022), update(T) {
      bg.material.uniforms.uAspect.value = ctx.aspect; road.material.uniforms.uTime.value = T;
      data.forEach((b, i) => {
        const z = ((b.z + T * 6) % 160 + 160) % 160 - 150;
        p3.set(b.x, -2.5 + b.h / 2, z); sc.set(b.w, b.h, b.d); m4.compose(p3, q, sc); towers.setMatrixAt(i, m4);
      });
      towers.instanceMatrix.needsUpdate = true;
    } };
  },

  /** Aurora curtains over a starry sky. */
  aurora(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(/* glsl */ `void main(){ vec2 p = vUv; float t = uTime * 0.12;
      vec3 c = mix(vec3(0.006, 0.01, 0.025), vec3(0.02, 0.03, 0.07), p.y);
      for (int i = 0; i < 3; i++) { float fi = float(i);
        float y = 0.5 + 0.13 * fi + 0.07 * sin(p.x * (2.5 + fi) + t * (1.0 + fi) + fi * 2.0) + 0.06 * fbm(vec2(p.x * 3.0 + t, fi * 4.0));
        float d = p.y - y; float band = d > 0.0 ? exp(-d * 5.0) : exp(d * 40.0);
        float rays = 0.45 + 0.55 * fbm(vec2(p.x * 38.0 + t * 2.0, fi * 7.0));
        c += mix(uB, uA, fi / 2.0) * band * rays * 0.55; }
      vec2 gg = floor(vUv * vec2(uAspect, 1.0) * 260.0); float s = hash(gg); c += step(0.997, s) * vec3(0.8) * smoothstep(0.3, 0.9, vUv.y) * (0.6 + 0.4 * sin(uTime * 3.0 + s * 90.0));
      c *= 0.85 + 0.15 * smoothstep(0.0, 0.4, vUv.y);
      gl_FragColor = vec4(c, 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    const d = dust(600, [26, 14, 26], "#ffffff", 0.04, 5); d.material.uniforms.uRise.value = -0.2; g.add(d);
    return { group: g, env: pal, update(T) { bg.material.uniforms.uTime.value = T; bg.material.uniforms.uAspect.value = ctx.aspect; d.material.uniforms.uTime.value = T; } };
  },

  /** Hyperspace: light streaks rushing past. */
  warp(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(`void main(){ vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0); vec3 c = vec3(0.01, 0.01, 0.018) + uB * 0.22 * exp(-length(p) * 4.0) + uA * 0.08 * exp(-length(p) * 1.5); gl_FragColor = vec4(c, 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    const N = 1600, r = rng(31), pos = new Float32Array(N * 6), aEnd = new Float32Array(N * 2), aRnd = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const a = r() * Math.PI * 2, rad = 1.2 + Math.pow(r(), 0.7) * 10, z = -r() * 150, k = r();
      pos.set([Math.cos(a) * rad, Math.sin(a) * rad, z, Math.cos(a) * rad, Math.sin(a) * rad, z], i * 6);
      aEnd.set([0, 1], i * 2); aRnd.set([k, k], i * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("aEnd", new THREE.BufferAttribute(aEnd, 1)); geo.setAttribute("aRnd", new THREE.BufferAttribute(aRnd, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSpeed: { value: 1 }, uA: { value: col(pal[0]) }, uB: { value: col(pal[1]) } },
      vertexShader: /* glsl */ `attribute float aEnd, aRnd; uniform float uTime, uSpeed; varying float vK; varying float vR;
        void main(){ vec3 p = position; float z = mod(p.z + uTime * 40.0 * uSpeed * (0.6 + aRnd), 150.0) - 145.0;
          p.z = z - aEnd * (0.4 + 6.0 * uSpeed) * (0.5 + aRnd); vK = aEnd; vR = aRnd;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform vec3 uA, uB; varying float vK; varying float vR; void main(){ vec3 c = mix(vec3(1.0), vR > 0.6 ? uA : uB, 0.6) * (1.0 - vK) * 2.0; gl_FragColor = vec4(c, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(geo, mat); lines.frustumCulled = false; g.add(lines);
    return { group: g, env: pal, update(T, c, speed = 1) { bg.material.uniforms.uAspect.value = ctx.aspect; mat.uniforms.uTime.value = T; mat.uniforms.uSpeed.value = speed; } };
  },

  /** Hologram room: hexagon floor with pulse waves, light pillars, rising sparks. */
  holoroom(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(`void main(){ vec3 c = mix(vec3(0.01, 0.012, 0.02), uB * 0.08 + vec3(0.02), smoothstep(0.2, 0.7, vUv.y)); gl_FragColor = vec4(c, 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: col(pal[0]) }, uB: { value: col(pal[1]) } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `uniform float uTime; uniform vec3 uA, uB; varying vec3 vW;
        vec2 hx(vec2 p){ const vec2 s = vec2(1.0, 1.7320508); vec2 a = mod(p, s) - s * 0.5; vec2 b = mod(p - s * 0.5, s) - s * 0.5; return dot(a, a) < dot(b, b) ? a : b; }
        void main(){ vec2 p = vW.xz * 0.9; vec2 h = hx(p); vec2 q = abs(h); float e = max(dot(q, normalize(vec2(1.0, 1.7320508))), q.x);
          float w = fwidth(e) * 1.5; float line = smoothstep(0.5 - w * 2.0, 0.5 - w * 0.5, e);
          float d = length(vW.xz); float pulse = exp(-abs(d - mod(uTime * 5.0, 40.0)) * 0.8);
          vec3 c = vec3(0.008) + mix(uA, uB, 0.5 + 0.5 * sin(d * 0.15)) * line * (0.35 + pulse * 2.0) * exp(-d * 0.06);
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.2; g.add(floor);
    const pillarMat = new THREE.ShaderMaterial({
      uniforms: { uC: { value: col(pal[1]) }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uC; uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.0) * (0.7 + 0.3 * sin(uTime * 3.0 + vUv.y * 20.0)); gl_FragColor = vec4(uC * a * 0.9, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const r = rng(41);
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 14, 24, 1, true), pillarMat);
      const side = i % 2 ? 1 : -1; p.position.set(side * (5 + r() * 10), 4.8, -4 - r() * 26); g.add(p);
    }
    const d = dust(900, [30, 12, 30], pal[0], 0.06, 13); d.material.uniforms.uRise.value = 0.6; g.add(d);
    return { group: g, env: pal, update(T) { bg.material.uniforms.uAspect.value = ctx.aspect; floor.material.uniforms.uTime.value = T; pillarMat.uniforms.uTime.value = T; d.material.uniforms.uTime.value = T; } };
  },

  /** An ocean of glowing points rolling in waves. */
  waves(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(`void main(){ vec3 c = mix(vec3(0.004, 0.006, 0.015), uB * 0.1 + vec3(0.01), smoothstep(0.3, 1.0, vUv.y)); gl_FragColor = vec4(c, 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    const n = 170, pos = new Float32Array(n * n * 3);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pos.set([(i / (n - 1) - 0.5) * 60, 0, -(j / (n - 1)) * 70 + 8], (i * n + j) * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: col(pal[0]) }, uB: { value: col(pal[1]) }, uMap: { value: dotTexture() } },
      vertexShader: /* glsl */ `uniform float uTime; varying float vH; varying float vD;
        void main(){ vec3 p = position; float h = sin(p.x * 0.25 + uTime * 0.9) * 0.7 + sin(p.z * 0.22 + uTime * 0.7) * 0.8 + sin((p.x + p.z) * 0.12 - uTime * 0.5) * 0.9;
          p.y = -2.4 + h; vH = h; vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z; gl_PointSize = 70.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uA, uB; uniform sampler2D uMap; varying float vH; varying float vD; void main(){ float a = texture2D(uMap, gl_PointCoord).a; vec3 c = mix(uB, uA, smoothstep(-1.5, 2.0, vH)) * (0.4 + 0.6 * smoothstep(-1.0, 2.2, vH)) * exp(-vD * 0.03) * 1.6; gl_FragColor = vec4(c * a, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; g.add(pts);
    return { group: g, env: pal, update(T) { bg.material.uniforms.uAspect.value = ctx.aspect; mat.uniforms.uTime.value = T; } };
  },

  /** Warm luxury: god rays and big soft bokeh lights. */
  gold(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(/* glsl */ `void main(){ vec2 p = (vUv - vec2(0.15, 1.05)) * vec2(uAspect, 1.0); float a = atan(p.y, p.x); float d = length(p);
      vec3 c = mix(vec3(0.05, 0.035, 0.02), vec3(0.01, 0.008, 0.008), smoothstep(0.0, 1.4, d));
      float rays = pow(fbm(vec2(a * 9.0, uTime * 0.12)), 2.5) * exp(-d * 1.1);
      c += uA * rays * 1.1; c += uB * 0.05 * exp(-length((vUv - vec2(0.8, 0.2)) * vec2(uAspect, 1.0)) * 3.0);
      gl_FragColor = vec4(c, 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    const d = dust(90, [22, 16, 20], pal[0], 0.9, 17); d.material.uniforms.uRise.value = 0.08; g.add(d);
    const d2 = dust(700, [20, 14, 20], "#FFE6B0", 0.05, 19); g.add(d2);
    return { group: g, env: [pal[0], "#FFF2D9"], update(T) { bg.material.uniforms.uTime.value = T; bg.material.uniforms.uAspect.value = ctx.aspect; d.material.uniforms.uTime.value = T; d2.material.uniforms.uTime.value = T; } };
  },

  /** Flying through a tunnel of glowing hexagon frames. */
  tunnel(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(`void main(){ vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0); gl_FragColor = vec4(vec3(0.006) + uA * 0.18 * exp(-length(p) * 6.0), 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    const rings = [];
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.035, 4, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 3 === 0 ? pal[0] : pal[1]).multiplyScalar(2.2), toneMapped: false }));
      m.rotation.z = Math.PI / 6; g.add(m); rings.push(m);
    }
    return { group: g, env: pal, update(T) {
      bg.material.uniforms.uAspect.value = ctx.aspect;
      rings.forEach((m, i) => { const z = ((i * 3.2 + T * 9) % 115) - 110; m.position.z = z; m.rotation.z = Math.PI / 6 + z * 0.012 + T * 0.05; const k = Math.min(1, (z + 110) / 20); m.material.color.setScalar(0).add(new THREE.Color(i % 3 === 0 ? pal[0] : pal[1]).multiplyScalar(2.2 * k)); });
    } };
  },

  /** Glossy floating cubes, some lit in the palette colours. */
  cubes(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(`void main(){ vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0); vec3 c = mix(vec3(0.05, 0.055, 0.07), vec3(0.01, 0.011, 0.016), smoothstep(0.0, 0.9, length(p))); gl_FragColor = vec4(c, 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    const N = 70, r = rng(51);
    const mesh = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 4, 0.12), new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0.55, roughness: 0.22, clearcoat: 1, envMapIntensity: 1.2 }), N);
    const data = [];
    for (let i = 0; i < N; i++) {
      data.push({ p: new THREE.Vector3((r() - 0.5) * 22, (r() - 0.5) * 18, -5 - r() * 22), s: 0.4 + r() * 1.3, rot: new THREE.Vector3(r(), r(), r()), sp: r() });
      const k = r(); mesh.setColorAt(i, new THREE.Color(k > 0.85 ? pal[0] : k > 0.72 ? pal[1] : "#1b1e27"));
    }
    g.add(mesh);
    const l1 = new THREE.PointLight(pal[0], 120, 40); l1.position.set(-6, 4, 2); const l2 = new THREE.PointLight(pal[1], 120, 40); l2.position.set(7, -3, 0); g.add(l1, l2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
    return { group: g, env: pal, update(T) {
      bg.material.uniforms.uAspect.value = ctx.aspect;
      data.forEach((d, i) => { e.set(d.rot.x * 6 + T * 0.2 * d.sp, d.rot.y * 6 + T * 0.15, d.rot.z * 6); q.setFromEuler(e); p3.copy(d.p); p3.y += Math.sin(T * 0.4 + d.sp * 9) * 0.5; sc.setScalar(d.s); m4.compose(p3, q, sc); mesh.setMatrixAt(i, m4); });
      mesh.instanceMatrix.needsUpdate = true;
    } };
  },

  /** Flowing silk gradient (clean, modern). */
  silk(ctx, pal) {
    const g = new THREE.Group();
    const bg = bgQuad(/* glsl */ `void main(){ vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 1.5; float t = uTime * 0.07;
      vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
      vec2 r = vec2(fbm(p + 2.6 * q + vec2(1.7, 9.2) + t * 1.4), fbm(p + 2.6 * q + vec2(8.3, 2.8) - t));
      float f = fbm(p + 2.6 * r);
      vec3 c = mix(vec3(0.015, 0.015, 0.025), uB * 0.5, clamp(f * f * 2.2, 0.0, 1.0));
      c = mix(c, uA * 0.85, clamp(length(q) * 0.55 * r.x, 0.0, 1.0) * 0.85);
      c *= 0.6 + 0.5 * f; c += pow(max(0.0, sin((p.x + p.y) * 5.0 + f * 9.0 + uTime * 0.5)), 14.0) * 0.1;
      gl_FragColor = vec4(c * 0.8, 1.0); }`);
    setPal(bg.material, pal); g.add(bg);
    return { group: g, env: pal, update(T) { bg.material.uniforms.uTime.value = T; bg.material.uniforms.uAspect.value = ctx.aspect; } };
  },

  /** Falling columns of Naira signs and digits (a "money data" look). */
  datarain(ctx, pal) {
    const g = new THREE.Group();
    const c = document.createElement("canvas"); c.width = 540; c.height = 960;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const bg = bgQuad(`uniform sampler2D uTex; void main(){ vec2 uv = vUv; vec3 t = texture2D(uTex, uv).rgb; vec3 c = vec3(0.01, 0.012, 0.018) + t * 1.4; gl_FragColor = vec4(c, 1.0); }`, { uTex: { value: tex } });
    setPal(bg.material, pal); g.add(bg);
    const gx = c.getContext("2d"); const cols = 30, rows = 40, r = rng(61); const glyphs = "₦0123456789₦AP₦%+";
    const speeds = Array.from({ length: cols }, () => 4 + r() * 9), offs = Array.from({ length: cols }, () => r() * rows);
    const main = new THREE.Color(pal[0]).getStyle(), second = new THREE.Color(pal[1]).getStyle();
    return { group: g, env: pal, update(T) {
      gx.fillStyle = "#000"; gx.fillRect(0, 0, 540, 960);
      gx.font = "600 22px 'Space Grotesk', monospace"; gx.textAlign = "center";
      const cw = 540 / cols, ch = 960 / rows;
      for (let i = 0; i < cols; i++) {
        const head = (offs[i] + T * speeds[i]) % (rows + 14);
        for (let j = 0; j < 14; j++) {
          const row = Math.floor(head) - j; if (row < 0 || row >= rows) continue;
          const a = j === 0 ? 1 : 0.7 * (1 - j / 14);
          const gi = Math.floor((Math.sin(i * 12.9 + row * 78.2 + Math.floor(T * 6) * (j === 0 ? 1 : 0)) * 43758.5) % glyphs.length + glyphs.length) % glyphs.length;
          gx.globalAlpha = a * 0.55; gx.fillStyle = j === 0 ? "#FFF4EC" : i % 4 === 0 ? second : main;
          gx.fillText(glyphs[gi], i * cw + cw / 2, row * ch + ch);
        }
      }
      gx.globalAlpha = 1; tex.needsUpdate = true;
    } };
  },
};

export const WORLD_NAMES = Object.keys(WORLDS);
