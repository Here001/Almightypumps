// Core: renderer, post-processing (bloom, chromatic aberration, grain, glitch, scanlines), maths helpers.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

export { THREE };
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const prog = (t, start, dur) => clamp((t - start) / dur);
export const E = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  out5: (t) => 1 - Math.pow(1 - t, 5),
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};
/** Seeded random numbers, so every render of a video is identical. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}
/** Smooth wobble for handheld-camera feel. */
export const wob = (T, f, seed = 0) => Math.sin(T * f + seed) * 0.6 + Math.sin(T * f * 2.31 + seed * 1.7) * 0.4;

export const BRAND = { bg: "#0E1016", fg: "#F4F2EE", accent: "#FF5A1F" };

/** GLSL noise shared by world shaders. */
export const GLSL_NOISE = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
  float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return v; }
`;

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uAberr: { value: 0.0015 }, uGrain: { value: 0.03 }, uVignette: { value: 0.55 },
    uGlitch: { value: 0 }, uScan: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uAberr, uGrain, uVignette, uGlitch, uScan, uFlash, uFade; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uGlitch > 0.001) {
        float band = floor(uv.y * 28.0);
        float r = h(vec2(band, floor(uTime * 24.0)));
        if (r < uGlitch * 0.55) uv.x += (h(vec2(band, floor(uTime * 24.0) + 3.0)) - 0.5) * 0.16 * uGlitch;
      }
      vec2 d = uv - 0.5;
      float ab = uAberr + uGlitch * 0.02;
      vec3 col = vec3(texture2D(tDiffuse, uv + d * ab).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * ab).b);
      col *= 1.0 - uVignette * dot(d, d) * 1.9;
      if (uScan > 0.001) col *= 1.0 - uScan * 0.22 * (0.5 + 0.5 * sin(uv.y * uRes.y * 0.9 - uTime * 30.0));
      col += (h(uv * uRes + fract(uTime * 7.31) * 100.0) - 0.5) * uGrain;
      col = mix(col, vec3(1.0, 0.97, 0.94), uFlash);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createStage(canvas, width, height) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const aspect = width / height;
  // Keep the same horizontal view on portrait screens, so 3D objects don't get cut off in 9:16.
  const vfov = aspect < 1 ? (2 * Math.atan(Math.tan((46 * Math.PI) / 360) / aspect) * 180) / Math.PI : 38;
  const camera = new THREE.PerspectiveCamera(vfov, aspect, 0.05, 400);

  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.75, 0.55, 0.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // FXAA instead of multisampling: smooth edges at a fraction of the cost in software rendering.
  const fxaa = new ShaderPass(FXAAShader);
  fxaa.material.uniforms.resolution.value.set(1 / width, 1 / height);
  composer.addPass(fxaa);
  const final = new ShaderPass(FinalShader);
  final.uniforms.uRes.value.set(width, height);
  composer.addPass(final);

  return { renderer, scene, camera, composer, bloom, final, width, height, aspect, portrait: aspect < 0.8, square: aspect >= 0.8 && aspect <= 1.25 };
}

/** A full-screen background drawn by a fragment shader (vUv 0..1, uniforms uTime, uAspect, uA (accent), uB (second colour)). */
export function bgQuad(fragment, uniforms = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAspect: { value: 1 }, uA: { value: new THREE.Color(BRAND.accent) }, uB: { value: new THREE.Color("#5B2BFF") }, uCam: { value: new THREE.Vector2() }, ...uniforms },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.99999, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime, uAspect; uniform vec3 uA, uB; uniform vec2 uCam; ${GLSL_NOISE}\n${fragment}`,
    depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

/** A soft round sprite texture for glowing particles. */
let dotTex;
export function dotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.75)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

/** An environment map with coloured light panels, so chrome reflects the world's colours. */
export function colourEnvironment(renderer, colours) {
  const env = new THREE.Scene();
  env.background = new THREE.Color("#08090d");
  const box = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: "#0b0c12", side: THREE.BackSide }));
  env.add(box);
  const panel = (color, intensity, pos, size, rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); env.add(m);
  };
  panel("#ffffff", 6, [0, 9, 0], [12, 3], [Math.PI / 2, 0, 0]);
  panel(colours[0], 5, [-9, 2, 2], [3, 10], [0, Math.PI / 2, 0]);
  panel(colours[1], 5, [9, 1, -2], [3, 10], [0, -Math.PI / 2, 0]);
  panel("#ffffff", 3, [0, 1, 9], [10, 2], [0, Math.PI, 0]);
  panel(colours[0], 2, [0, -9, 0], [14, 14], [-Math.PI / 2, 0, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}
