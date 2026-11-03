// @ts-nocheck
/* 3D homepage effects, ported from the approved prototype.
   Libraries come from npm instead of CDNs and are exposed under the global
   names the original code expects. initLanding() returns a cleanup function. */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

export function initLanding() {
  window.gsap = gsap;
  window.ScrollTrigger = ScrollTrigger;
  window.Lenis = Lenis;
  var alive = true;
  var renderer = null;
  function cleanup() {
    alive = false;
    try { if (typeof mm !== "undefined" && mm) mm.revert(); } catch (e) {}
    try { ScrollTrigger.getAll().forEach(function (t) { t.kill(); }); } catch (e) {}
    try { if (lenis) lenis.destroy(); } catch (e) {}
    try { if (renderer) renderer.dispose(); } catch (e) {}
    window.removeEventListener("scroll", onScroll);
  }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Buy / Sell toggle ---------- */
  var market = document.getElementById('market');
  var bBuy = document.getElementById('mode-buy'), bSell = document.getElementById('mode-sell');
  function setMode(sell) {
    bBuy.setAttribute('aria-pressed', String(!sell));
    bSell.setAttribute('aria-pressed', String(sell));
    market.classList.toggle('sell-mode', sell);
    market.querySelectorAll('.trade').forEach(function (a) { a.textContent = sell ? 'Sell' : 'Buy'; });
  }
  bBuy.addEventListener('click', function () { setMode(false); });
  bSell.addEventListener('click', function () { setMode(true); });

  /* ---------- Glass specular highlight follows the pointer ---------- */
  var glasses = Array.prototype.slice.call(document.querySelectorAll('.glass'));
  var mouseX = 0, mouseY = 0, px = innerWidth / 2, py = innerHeight / 3, specQueued = false;
  function updateSpec() {
    specQueued = false;
    for (var i = 0; i < glasses.length; i++) {
      var r = glasses[i].getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) continue;
      glasses[i].style.setProperty('--mx', (px - r.left).toFixed(0) + 'px');
      glasses[i].style.setProperty('--my', (py - r.top).toFixed(0) + 'px');
    }
  }
  window.addEventListener('pointermove', function (e) {
    px = e.clientX; py = e.clientY;
    mouseX = (e.clientX / innerWidth - 0.5) * 2;
    mouseY = (e.clientY / innerHeight - 0.5) * 2;
    if (!specQueued) { specQueued = true; requestAnimationFrame(updateSpec); }
  }, { passive: true });

  /* ---------- WebGL world ---------- */
  var scrollP = 0;
  var canvas = document.getElementById('scene');
  var world = null;

  var NOISE = [
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){',
    ' const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    ' vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);',
    ' vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);',
    ' vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;',
    ' i=mod289(i);',
    ' vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
    ' float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;',
    ' vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);',
    ' vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);',
    ' vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);',
    ' vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));',
    ' vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    ' vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);',
    ' vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    ' p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;',
    ' vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;',
    ' return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}'
  ].join('\n');

  function startWorld() {
  var mark = function (n) { try { performance.mark('ap:' + n); } catch (e) {} };
  mark('world-start');
  try {
    if (!window.THREE) throw new Error('no three');
    var lite = window.innerWidth < 860 || window.matchMedia('(pointer: coarse)').matches;
    // Bloom post-processing renders into its own buffers, so canvas MSAA would be wasted work.
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
    var DPR = lite ? 1 : Math.min(window.devicePixelRatio || 1, 1.25);
    var CPR = lite ? 0.7 : Math.min(DPR, 1.0);
    var OCT = lite ? 3 : 4; // nebula noise octaves (was 5): the biggest per-pixel cost
    renderer.setPixelRatio(DPR);
    renderer.autoClear = false;

    /* Background nebula: full-screen domain-warped noise, palette shifts with scroll */
    var bgScene = new THREE.Scene();
    var bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var bgUniforms = { uTime: { value: 0 }, uScroll: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(0, 0) } };
    var bgMat = new THREE.ShaderMaterial({
      uniforms: bgUniforms, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'precision highp float;',
        'uniform float uTime; uniform float uScroll; uniform vec2 uRes; uniform vec2 uMouse; varying vec2 vUv;',
        NOISE,
        'float fbm(vec3 p){ float f=0.0; float a=0.5; for(int i=0;i<' + OCT + ';i++){ f+=a*snoise(p); p*=2.02; a*=0.5; } return f; }',
        'void main(){',
        '  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;',
        '  uv += uMouse * 0.04;',
        '  float t = uTime * 0.035;',
        '  vec3 p = vec3(uv * 1.3, t + uScroll * 3.0);',
        '  vec2 q = vec2(fbm(p), fbm(p + vec3(5.2, 1.3, 0.0)));',
        '  vec2 r = vec2(fbm(p + vec3(4.0*q, 0.0) + vec3(1.7, 9.2, t)), fbm(p + vec3(4.0*q, 0.0) + vec3(8.3, 2.8, -t)));',
        '  float f = fbm(p + vec3(3.5*r, 0.0));',
        '  vec3 orange = vec3(1.0, 0.38, 0.12);',
        '  vec3 violet = vec3(0.46, 0.22, 0.98);',
        '  vec3 cyan   = vec3(0.22, 0.85, 1.0);',
        '  vec3 gold   = vec3(1.0, 0.72, 0.2);',
        '  float s = uScroll;',
        '  vec3 cA = mix(mix(orange, cyan, smoothstep(0.1, 0.35, s)), mix(gold, orange, smoothstep(0.6, 0.95, s)), smoothstep(0.3, 0.65, s));',
        '  vec3 cB = mix(violet, mix(violet, cyan * 0.8, 0.5), smoothstep(0.2, 0.8, s));',
        '  vec3 col = vec3(0.012, 0.016, 0.035);',
        '  col = mix(col, cB * 0.55, clamp(length(q) * 0.9, 0.0, 1.0));',
        '  col = mix(col, cA * 0.95, clamp(f * f * 2.6, 0.0, 1.0));',
        '  col += cA * pow(clamp(r.x, 0.0, 1.0), 3.0) * 0.55;',
        '  float streak = smoothstep(0.02, 0.0, abs(uv.y + 0.18 * sin(uv.x * 1.4 + t * 6.0) - 0.05)) * 0.18;',
        '  col += cyan * streak;',
        '  float vig = smoothstep(1.35, 0.25, length(uv * vec2(0.8, 1.0)));',
        '  col *= mix(0.35, 1.0, vig);',
        '  col = pow(col, vec3(0.95));',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));

    /* Main 3D scene */
    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04050A, 0.028);
    var camera = new THREE.PerspectiveCamera(58, 1, 0.1, 250);
    camera.position.set(0, 0, 9);

    // Iridescent fresnel glass material (shared)
    function glassMat(tint, displace) {
      return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color(tint) }, uAmp: { value: displace ? 0.32 : 0.0 } },
        vertexShader: [
          'uniform float uTime; uniform float uAmp; varying vec3 vN; varying vec3 vV; varying float vD;',
          NOISE,
          'void main(){',
          '  vec3 pos = position;',
          '  float d = uAmp > 0.0 ? snoise(normal * 1.6 + vec3(uTime * 0.35)) : 0.0;',
          '  pos += normal * d * uAmp; vD = d;',
          '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
          '  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);',
          '  gl_Position = projectionMatrix * mv;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform float uTime; uniform vec3 uTint; varying vec3 vN; varying vec3 vV; varying float vD;',
          'void main(){',
          '  float fr = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.2);',
          '  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (fr * 0.9 + vD * 0.35 + vec3(0.0, 0.33, 0.67) + uTime * 0.04));',
          '  vec3 col = mix(uTint * 0.25, irid, fr * 0.85) + uTint * fr * 0.9;',
          '  col += vec3(1.0) * pow(fr, 6.0) * 0.9;',
          '  gl_FragColor = vec4(col, 0.18 + fr * 0.8);',
          '}'
        ].join('\n')
      });
    }

    // Hero orb: liquid glass blob with orbit rings
    var hero = new THREE.Group();
    var orbMat = glassMat(0xFF6A2B, true);
    var orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, lite ? 18 : 36), orbMat);
    hero.add(orb);
    var core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 24), new THREE.MeshBasicMaterial({ color: 0xFF8A4C }));
    hero.add(core);
    var halo = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 32), new THREE.MeshBasicMaterial({ color: 0xFF6A2B, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    hero.add(halo);
    var ringA = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: 0x5EE7FF }));
    ringA.rotation.x = Math.PI / 2.3; hero.add(ringA);
    var ringB = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.008, 8, 160), new THREE.MeshBasicMaterial({ color: 0xFF6A2B }));
    ringB.rotation.y = Math.PI / 3; ringB.rotation.x = 0.4; hero.add(ringB);
    // Orbiting satellites
    var sats = [];
    [0xFF6A2B, 0x60A5FA, 0x5EE7FF, 0x34D399, 0xFBBF24].forEach(function (c, k) {
      var s = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), new THREE.MeshBasicMaterial({ color: c }));
      s.userData = { r: 3.0 + (k % 2) * 0.6, sp: 0.25 + k * 0.05, off: k * 1.26 };
      hero.add(s); sats.push(s);
    });
    scene.add(hero);

    // Built in a second stage (after the first frame) so the page stays responsive.
    var shards = [], gates = [], shardMats = [], dustA = null, dustB = null, dustC = null, grid = null;
    function addExtras() {
    // Glass shards scattered along the flight path
    var shardTints = [0xFF6A2B, 0x5EE7FF, 0x8B5CF6, 0xFBBF24, 0x34D399];
    var geos = [new THREE.OctahedronGeometry(0.9, 0), new THREE.TorusGeometry(0.8, 0.28, 16, 40), new THREE.IcosahedronGeometry(0.9, 1), new THREE.TorusKnotGeometry(0.6, 0.2, 80, 10), new THREE.BoxGeometry(1.2, 1.2, 1.2)];
    var shardCount = lite ? 16 : 34, shardStep = 165 / shardCount;
    shardMats = shardTints.map(function (c) { return glassMat(c, false); });
    for (var s = 0; s < shardCount; s++) {
      var m = new THREE.Mesh(geos[s % geos.length], shardMats[s % shardMats.length]);
      var side = s % 2 ? 1 : -1;
      m.position.set(side * (3.5 + Math.random() * 7), (Math.random() - 0.5) * 9, -6 - s * shardStep - Math.random() * 2);
      var sc = 0.5 + Math.random() * 1.4; m.scale.setScalar(sc);
      m.userData = { rx: (Math.random() - 0.5) * 0.6, ry: (Math.random() - 0.5) * 0.6, fy: Math.random() * 6.28 };
      scene.add(m); shards.push(m);
    }

    // Light gates the camera flies through
    for (var g = 0; g < 7; g++) {
      var col = [0x5EE7FF, 0xFF6A2B, 0x8B5CF6][g % 3];
      var gate = new THREE.Mesh(new THREE.TorusGeometry(6 + (g % 2) * 1.5, 0.03, 6, 160), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
      gate.position.set(0, 0, -18 - g * 24);
      scene.add(gate); gates.push(gate);
    }

    // Particle dust (two layers)
    function dust(n, spread, depth, size, color, opacity) {
      var pos = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * spread;
        pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.6;
        pos[i * 3 + 2] = 12 - Math.random() * depth;
      }
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: size, color: color, transparent: true, opacity: opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
      scene.add(pts); return pts;
    }
    dustA = dust(lite ? 1100 : 3000, 60, 200, 0.05, 0xECEEF4, 0.75);
    dustB = dust(lite ? 260 : 650, 40, 200, 0.12, 0xFF8A4C, 0.6);
    dustC = dust(lite ? 200 : 500, 40, 200, 0.1, 0x5EE7FF, 0.55);

    // Ground grid for horizon depth
    grid = new THREE.GridHelper(400, 200, 0x5EE7FF, 0x152036);
    grid.position.y = -7; grid.material.transparent = true; grid.material.opacity = 0.22;
    scene.add(grid);

    }

    // Post-processing: bloom
    // Third stage: added once the scene is up; skipped if the device turned out to be slow.
    var composer = null, bloom = null, noBloom = false;
    function addBloom() {
    if (!noBloom && THREE.EffectComposer && THREE.UnrealBloomPass) {
      composer = new THREE.EffectComposer(renderer);
      var bgPass = new THREE.RenderPass(bgScene, bgCam);
      var mainPass = new THREE.RenderPass(scene, camera); mainPass.clear = false;
      bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.95, 0.65, 0.18);
      composer.addPass(bgPass); composer.addPass(mainPass); composer.addPass(bloom);
    }
    }

    function resize() {
      var w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      if (composer) { composer.setPixelRatio(CPR); composer.setSize(w, h); }
      camera.aspect = w / h; camera.updateProjectionMatrix();
      bgUniforms.uRes.value.set(w * DPR, h * DPR);
      if (composer) bgUniforms.uRes.value.set(w * CPR, h * CPR);
      var narrow = w < 860;
      hero.position.set(narrow ? 0 : 3.2, narrow ? 2.6 : 0.2, 0);
      hero.scale.setScalar(narrow ? 0.75 : 1);
    }
    resize();
    window.addEventListener('resize', resize);

    mark('world-built');
    var clock = new THREE.Clock();
    var camZ = 9, smoothP = 0, smx = 0, smy = 0, prevT = 0;
    // Adaptive quality: watch real frame times; if the device struggles, drop bloom and
    // resolution, then halve the frame rate. Keeps scrolling smooth on weaker phones.
    var perf = { n: 0, sum: 0, level: 0, skip: false, odd: false };
    function degrade() {
      perf.level++;
      if (perf.level === 1) { composer = null; noBloom = true; DPR = Math.min(DPR, 1); renderer.setPixelRatio(DPR); resize(); }
      else if (perf.level === 2) { DPR = 0.75; renderer.setPixelRatio(DPR); resize(); }
      else perf.skip = true;
    }
    var shown = false;
    function frame() {
      if (!alive) return;
      if (!reduce) requestAnimationFrame(frame);
      if (perf.skip && (perf.odd = !perf.odd)) return;
      var t = clock.getElapsedTime();
      var dt = Math.min(0.05, t - prevT); prevT = t;
      var k1 = 1 - Math.pow(0.0009, dt);   // frame-rate independent easing
      var k2 = 1 - Math.pow(0.02, dt);
      smoothP += (scrollP - smoothP) * k1;
      smx += (mouseX - smx) * k2; smy += (mouseY - smy) * k2;
      var p = smoothP;
      bgUniforms.uTime.value = t; bgUniforms.uScroll.value = p;
      bgUniforms.uMouse.value.set(smx, -smy);

      camZ = 9 - p * 175;
      camera.position.z = camZ;
      camera.position.x = smx * 1.1 + Math.sin(p * 9.0) * 1.6;
      camera.position.y = -smy * 0.7 + Math.cos(p * 7.0) * 0.8;
      camera.lookAt(camera.position.x * 0.4, camera.position.y * 0.3, camZ - 12);
      camera.rotation.z = Math.sin(p * 6.0) * 0.06;

      orbMat.uniforms.uTime.value = t;
      orb.rotation.y = t * 0.15; orb.rotation.x = t * 0.08;
      halo.scale.setScalar(1.0 + Math.sin(t * 2.0) * 0.08);
      ringA.rotation.z = t * 0.25; ringB.rotation.z = -t * 0.18;
      sats.forEach(function (s) { var a = t * s.userData.sp + s.userData.off; s.position.set(Math.cos(a) * s.userData.r, Math.sin(a * 1.3) * 0.8, Math.sin(a) * s.userData.r); });

      for (var i = 0; i < shards.length; i++) {
        var m = shards[i];
        m.rotation.x += m.userData.rx * 0.01; m.rotation.y += m.userData.ry * 0.01;
        m.position.y += Math.sin(t * 0.6 + m.userData.fy) * 0.003;
      }
      for (var sm = 0; sm < shardMats.length; sm++) shardMats[sm].uniforms.uTime.value = t;
      for (var k = 0; k < gates.length; k++) { gates[k].rotation.z = t * (k % 2 ? 0.1 : -0.1); }
      if (dustB) { dustB.rotation.z = t * 0.01; dustC.rotation.z = -t * 0.012; }
      if (grid) grid.position.z = camZ - (camZ % 2);

      if (composer) composer.render(); else { renderer.clear(); renderer.render(bgScene, bgCam); renderer.render(scene, camera); }
      if (!shown) { shown = true; canvas.classList.add('on'); mark('first-frame'); }
      // Frames 20-80 after start (shaders compiled by then) decide the quality level.
      perf.n++;
      if (perf.n > 20 && perf.level < 3) {
        perf.sum += dt;
        if (perf.n % 60 === 20) { if (perf.sum / 60 > 0.034) degrade(); perf.sum = 0; }
      }
    }
    requestAnimationFrame(frame); // first draw in its own task, after the build above
    world = { render: frame };
    // Stages 2 and 3 when the browser is idle; frame timing restarts so their one-off
    // shader compiles don't count against the device.
    var later = window.requestIdleCallback || function (cb) { return setTimeout(cb, 120); };
    later(function () {
      if (!alive) return;
      addExtras(); perf.n = 0; perf.sum = 0; mark('extras');
      later(function () { if (!alive) return; addBloom(); resize(); perf.n = 0; perf.sum = 0; mark('bloom'); }, { timeout: 1500 });
    }, { timeout: 1200 });
  } catch (err) {
    // No WebGL: the static gradient behind the canvas stays as the background.
    canvas.remove();
  }
  }

  /* Start the 3D world after the page is ready, so text and buttons appear and respond first.
     Very weak devices, data saver and "reduce motion" keep the gradient background instead. */
  var nav = navigator, conn = nav.connection || {};
  var weak = conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '') || (nav.deviceMemory && nav.deviceMemory <= 2) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2);
  if (reduce || weak) {
    canvas.remove();
  } else {
    var idle = window.requestIdleCallback || function (cb) { return setTimeout(cb, 200); };
    var go = function () {
      idle(function () {
        Promise.all([
          import("three"),
          import("three/examples/jsm/postprocessing/EffectComposer.js"),
          import("three/examples/jsm/postprocessing/RenderPass.js"),
          import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
        ]).then(function (m) {
          if (!alive) return;
          try { performance.mark('ap:three-loaded'); } catch (e) {}
          window.THREE = Object.assign({}, m[0], { EffectComposer: m[1].EffectComposer, RenderPass: m[2].RenderPass, UnrealBloomPass: m[3].UnrealBloomPass });
          setTimeout(function () { if (alive) startWorld(); }, 0); // build in a separate task from unpacking three.js
        }).catch(function () { canvas.remove(); });
      }, { timeout: 2500 });
    };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }

  /* ---------- Progress bar + active section links ---------- */
  var topBar = document.querySelector('.top');
  var ids = ['top', 'tools', 'escrow', 'market', 'growth', 'pricing', 'api', 'start'];
  var secEls = ids.map(function (id) { return document.getElementById(id === 'top' ? 'hero-title' : id); });
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a, .secnav a'));
  var activeId = '';
  function onScroll() {
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollP = Math.min(1, Math.max(0, window.scrollY / max));
    topBar.style.setProperty('--p', scrollP.toFixed(4));
    var mid = window.innerHeight * 0.45, cur = 'top';
    for (var i = 0; i < secEls.length; i++) { if (secEls[i] && secEls[i].getBoundingClientRect().top < mid) cur = ids[i]; }
    if (cur !== activeId) {
      activeId = cur;
      navLinks.forEach(function (a) { var on = a.getAttribute('href') === '#' + cur; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    }
    if (reduce && world) world.render();
    if (!specQueued) { specQueued = true; requestAnimationFrame(updateSpec); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Smooth scrolling and gliding section links ---------- */
  var lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.075, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
    lenis.on('scroll', onScroll);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    var target = id === 'top' ? document.body : document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    var headH = topBar.getBoundingClientRect().height;
    if (lenis) lenis.scrollTo(id === 'top' ? 0 : target, { offset: -headH - 8, duration: 1.6, easing: function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; } });
    else window.scrollTo({ top: id === 'top' ? 0 : target.getBoundingClientRect().top + window.scrollY - headH - 8, behavior: reduce ? 'auto' : 'smooth' });
  });

  /* ---------- Scroll choreography ---------- */
  if (reduce || !window.gsap || !window.ScrollTrigger) return cleanup;
  gsap.registerPlugin(ScrollTrigger);
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  gsap.to('#heroPanel', { y: -120, rotateX: 12, opacity: 0.35, transformPerspective: 1200, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1.2 } });

  var mm = gsap.matchMedia();
  mm.add('(min-width: 861px)', function () {
    var rail = document.getElementById('rail');
    var kits = gsap.utils.toArray('.kit');
    var dist = function () { return Math.max(0, rail.scrollWidth - window.innerWidth); };
    var tl = gsap.timeline({ scrollTrigger: { trigger: '#tools', start: 'top top', end: function () { return '+=' + (dist() + window.innerHeight * 0.4); }, pin: true, scrub: 1, invalidateOnRefresh: true } });
    tl.to(rail, { x: function () { return -dist(); }, ease: 'none' }, 0);
    kits.forEach(function (k) {
      gsap.fromTo(k, { rotateY: -30, z: -280, opacity: 0.4, transformPerspective: 1000 }, { rotateY: 0, z: 0, opacity: 1, ease: 'power2.out', scrollTrigger: { trigger: k, containerAnimation: tl, start: 'left 95%', end: 'left 55%', scrub: 1.2 } });
    });

    var steps = gsap.utils.toArray('.step');
    var bars = gsap.utils.toArray('#vc-prog i');
    var pill = document.getElementById('vc-pill'), note = document.getElementById('vc-note'), timer = document.getElementById('vc-timer');
    var states = [
      { pill: 'Locked', bg: '#1E3A8A', fg: '#BFDBFE', note: 'Funds locked in escrow', t: '—' },
      { pill: 'Shipped', bg: '#422006', fg: '#FDE68A', note: 'Seller delivered with proof', t: '—' },
      { pill: 'Inspecting', bg: '#1E3A8A', fg: '#BFDBFE', note: 'Buyer inspecting item', t: '47:59:12' },
      { pill: 'Released', bg: '#14532D', fg: '#BBF7D0', note: 'Seller paid. Trade complete.', t: 'Done' }
    ];
    var last = -1;
    function setStep(n) {
      if (n === last) return; last = n;
      steps.forEach(function (s, i) { s.classList.toggle('done', i < n); s.classList.toggle('on', i === n); });
      bars.forEach(function (b, i) { b.className = i < n ? 'done' : (i === n ? (n === 3 ? 'done' : 'on') : ''); });
      var st = states[n];
      pill.textContent = st.pill; pill.style.background = st.bg; pill.style.color = st.fg;
      note.textContent = st.note; timer.textContent = st.t;
    }
    var pinLen = window.innerHeight * 1.6;
    ScrollTrigger.create({ trigger: '#escrow', start: 'top top', end: '+=' + pinLen, pin: true, scrub: 1.2,
      onUpdate: function (self) { setStep(Math.min(3, Math.floor(self.progress * 4))); } });
    gsap.fromTo('#vault', { rotateY: -34, rotateX: 14, z: -220 }, { rotateY: -8, rotateX: 4, z: 0, ease: 'none', scrollTrigger: { trigger: '#escrow', start: 'top top', end: '+=' + pinLen, scrub: 1.2 } });
    return function () { setStep(2); };
  });

  gsap.fromTo('#market', { rotateX: 40, y: 90, scale: 0.9, opacity: 0.5, transformPerspective: 1600 }, { rotateX: 0, y: 0, scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: '.market-stage', start: 'top 95%', end: 'top 35%', scrub: 1.2 } });

  var count = document.getElementById('count'), meter = document.getElementById('meter');
  var o = { v: 120 };
  gsap.to(o, { v: 1000, ease: 'none', scrollTrigger: { trigger: '#growth', start: 'top 80%', end: 'bottom 40%', scrub: 1.2 },
    onUpdate: function () { count.textContent = Math.round(o.v).toLocaleString('en-NG'); meter.style.width = (o.v / 10).toFixed(1) + '%'; } });
  gsap.fromTo('#order', { rotateY: 26, rotateX: 10, z: -180, transformPerspective: 1200 }, { rotateY: -6, rotateX: 2, z: 0, ease: 'none', scrollTrigger: { trigger: '#growth', start: 'top 90%', end: 'center 50%', scrub: 1.2 } });

  gsap.utils.toArray('.tier').forEach(function (el, i) {
    gsap.fromTo(el, { y: 130, z: -220, rotateX: 26, opacity: 0.4, transformPerspective: 1000 }, { y: 0, z: 0, rotateX: 0, opacity: 1, ease: 'power2.out', scrollTrigger: { trigger: '.tiers', start: 'top ' + (95 - i * 6) + '%', end: 'top 45%', scrub: 1.2 } });
  });

  gsap.fromTo('#apicard', { rotateX: -22, y: 90, opacity: 0.5, transformPerspective: 1400 }, { rotateX: 0, y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: '#api', start: 'top 95%', end: 'top 45%', scrub: 1.2 } });
  gsap.fromTo('#rings', { scale: 0.4, rotate: -40 }, { scale: 1.15, rotate: 0, ease: 'none', scrollTrigger: { trigger: '#start', start: 'top bottom', end: 'bottom bottom', scrub: 1.2 } });
  return cleanup;
}
