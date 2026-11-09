/*!
 * Almighty Pumps template effects: 3D hero background, 3D tilt and scroll reveal. No libraries, ~5 KB.
 * - Any group with the block style "Moving 3D background" (class is-style-hero-3d) gets floating 3D shapes drawn
 *   in the theme colours behind its content.
 * - Cards and "Soft shadow" images tilt in 3D under the mouse (computers only).
 * - Headings, cards and images slide in as they scroll into view.
 * Respects "reduce motion", data saver and low-memory phones (shapes are drawn once, still).
 * License: GPLv2 or later. (C) Almighty Pumps.
 */
(function () {
	'use strict';
	var doc = document.documentElement;
	var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	var conn = navigator.connection || {};
	var lite = reduce || conn.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2);
	var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

	/* ---------------- 3D shapes (tiny software renderer on a 2D canvas) ---------------- */
	var PHI = (1 + Math.sqrt(5)) / 2;
	var MESHES = {
		cube: {
			v: [[-0.62, -0.62, -0.62], [0.62, -0.62, -0.62], [0.62, 0.62, -0.62], [-0.62, 0.62, -0.62], [-0.62, -0.62, 0.62], [0.62, -0.62, 0.62], [0.62, 0.62, 0.62], [-0.62, 0.62, 0.62]],
			f: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]]
		},
		octa: {
			v: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
			f: [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]
		},
		ico: {
			v: [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]],
			f: [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
		}
	};
	// Normalise ico to radius ~1.
	MESHES.ico.v = MESHES.ico.v.map(function (p) { var l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });

	var LIGHT = (function () { var l = [-0.45, -0.65, -0.6], n = Math.hypot(l[0], l[1], l[2]); return [l[0] / n, l[1] / n, l[2] / n]; })();

	function hexToRgb(c) {
		c = (c || '').trim();
		var m = /^#?([0-9a-f]{6})$/i.exec(c);
		if (m) { var n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
		m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c);
		return m ? [+m[1], +m[2], +m[3]] : [79, 70, 229];
	}
	function cssColor(name, fallback) {
		var v = getComputedStyle(doc).getPropertyValue('--wp--preset--color--' + name);
		return hexToRgb(v || fallback);
	}

	function rotate(p, a) {
		var x = p[0], y = p[1], z = p[2], c, s, t;
		c = Math.cos(a[0]); s = Math.sin(a[0]); t = y * c - z * s; z = y * s + z * c; y = t;
		c = Math.cos(a[1]); s = Math.sin(a[1]); t = x * c + z * s; z = -x * s + z * c; x = t;
		c = Math.cos(a[2]); s = Math.sin(a[2]); t = x * c - y * s; y = x * s + y * c; x = t;
		return [x, y, z];
	}

	function Scene(host) {
		var canvas = document.createElement('canvas');
		canvas.className = 'ap-3d-canvas';
		canvas.setAttribute('aria-hidden', 'true');
		host.insertBefore(canvas, host.firstChild);
		var ctx = canvas.getContext('2d');
		var colors = [cssColor('primary', '#4F46E5'), cssColor('accent', '#10B981'), cssColor('primary-dark', '#4338CA'), cssColor('tint', '#EEF0FF')];
		var kinds = ['ico', 'cube', 'octa', 'ico', 'octa', 'cube', 'ico'];
		// Shapes sit mostly on the right and edges so text on the left stays easy to read.
		var spots = [[0.5, 0.14, 0.9], [0.95, 0.16, 0.7], [0.56, 0.9, 0.6], [0.93, 0.88, 0.8], [0.04, 0.08, 0.35], [0.74, 0.07, 0.45], [0.36, 0.95, 0.4]];
		var shapes = spots.map(function (s, i) {
			return {
				mesh: MESHES[kinds[i % kinds.length]], x: s[0], y: s[1], depth: s[2], size: 0.018 + s[2] * 0.026,
				color: colors[i % 3], rot: [Math.random() * 6, Math.random() * 6, Math.random() * 6],
				spin: [0.15 + Math.random() * 0.25, 0.2 + Math.random() * 0.3, 0.05 + Math.random() * 0.1], phase: Math.random() * 6
			};
		});
		var w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), mouse = [0, 0], target = [0, 0], running = false, last = 0, raf = 0;

		function size() {
			var r = host.getBoundingClientRect();
			w = r.width; h = r.height;
			canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		function draw(time) {
			ctx.clearRect(0, 0, w, h);
			var t = time / 1000, faces = [], unit = Math.min(w, h * 1.6), small = w < 700;
			mouse[0] += (target[0] - mouse[0]) * 0.05; mouse[1] += (target[1] - mouse[1]) * 0.05;
			shapes.forEach(function (sh, si) {
				var a = [sh.rot[0] + t * sh.spin[0], sh.rot[1] + t * sh.spin[1], sh.rot[2] + t * sh.spin[2]];
				var r = unit * sh.size * (small ? 0.8 : 1);
				var cx = w * sh.x + mouse[0] * 30 * sh.depth, cy = h * sh.y + Math.sin(t * 0.8 + sh.phase) * 12 + mouse[1] * 24 * sh.depth;
				if (sh.x < 0.46 && sh.y > 0.15 && sh.y < 0.9) { return; } // keep the text area clear
				if (small && sh.y > 0.2 && sh.y < 0.85) { return; }
				var pts = sh.mesh.v.map(function (p) {
					var q = rotate(p, a), persp = 5 / (5 + q[2]);
					return [cx + q[0] * r * persp, cy + q[1] * r * persp, q[2], q];
				});
				sh.mesh.f.forEach(function (f) {
					var p0 = pts[f[0]], p1 = pts[f[1]], p2 = pts[f[2]];
					var area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
					if (area >= 0) { return; } // back face
					var u = [p1[3][0] - p0[3][0], p1[3][1] - p0[3][1], p1[3][2] - p0[3][2]];
					var v = [p2[3][0] - p0[3][0], p2[3][1] - p0[3][1], p2[3][2] - p0[3][2]];
					var n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
					var nl = Math.hypot(n[0], n[1], n[2]) || 1;
					var light = Math.max(0, -(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / nl);
					var z = 0; f.forEach(function (i) { z += pts[i][2]; });
					faces.push({ pts: f.map(function (i) { return pts[i]; }), z: z / f.length - sh.depth * 10, light: light, color: sh.color, alpha: 0.28 + sh.depth * 0.5 });
				});
			});
			faces.sort(function (a, b) { return b.z - a.z; });
			faces.forEach(function (f) {
				var k = 0.55 + f.light * 0.6, c = f.color;
				ctx.beginPath();
				f.pts.forEach(function (p, i) { if (i) { ctx.lineTo(p[0], p[1]); } else { ctx.moveTo(p[0], p[1]); } });
				ctx.closePath();
				ctx.fillStyle = 'rgba(' + Math.min(255, c[0] * k | 0) + ',' + Math.min(255, c[1] * k | 0) + ',' + Math.min(255, c[2] * k | 0) + ',' + f.alpha.toFixed(2) + ')';
				ctx.fill();
				ctx.strokeStyle = 'rgba(255,255,255,' + (0.12 + f.light * 0.2).toFixed(2) + ')';
				ctx.lineWidth = 1;
				ctx.stroke();
			});
		}

		function loop(time) {
			if (!running) { return; }
			if (time - last > 30) { draw(time); last = time; } // ~30 fps is plenty for slow shapes
			raf = requestAnimationFrame(loop);
		}
		function start() { if (!running && !lite) { running = true; raf = requestAnimationFrame(loop); } }
		function stop() { running = false; cancelAnimationFrame(raf); }

		size();
		draw(4000);
		if (lite) { return; }
		window.addEventListener('resize', function () { size(); draw(performance.now()); });
		if (finePointer) {
			host.addEventListener('pointermove', function (e) {
				var r = host.getBoundingClientRect();
				target = [((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2];
			});
		}
		if ('IntersectionObserver' in window) {
			new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { start(); } else { stop(); } }); }).observe(host);
		} else { start(); }
		document.addEventListener('visibilitychange', function () { if (document.hidden) { stop(); } else { start(); } });
	}

	/* ---------------- 3D tilt ---------------- */
	function tilt(el) {
		el.addEventListener('pointermove', function (e) {
			var r = el.getBoundingClientRect();
			var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
			el.style.transform = 'perspective(900px) rotateX(' + (-y * 7).toFixed(2) + 'deg) rotateY(' + (x * 9).toFixed(2) + 'deg) translateZ(6px)';
		});
		el.addEventListener('pointerleave', function () { el.style.transform = ''; });
	}

	/* ---------------- scroll reveal ---------------- */
	function reveal(nodes) {
		if (reduce || !('IntersectionObserver' in window)) { return; }
		doc.classList.add('ap-motion');
		var io = new IntersectionObserver(function (es) {
			es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
		}, { rootMargin: '0px 0px -8% 0px' });
		nodes.forEach(function (n) {
			var sibs = n.parentElement ? Array.prototype.indexOf.call(n.parentElement.children, n) : 0;
			n.classList.add('ap-reveal');
			n.style.transitionDelay = Math.min(sibs, 5) * 70 + 'ms';
			io.observe(n);
		});
	}

	function init() {
		Array.prototype.forEach.call(document.querySelectorAll('.is-style-hero-3d'), function (el) { new Scene(el); });
		if (finePointer && !reduce) {
			Array.prototype.forEach.call(document.querySelectorAll('.is-style-card, .is-style-soft-shadow'), tilt);
		}
		reveal(Array.prototype.slice.call(document.querySelectorAll('main .wp-block-heading, main .is-style-card, main .wp-block-image, main .wp-block-buttons, main .ap-post')));
	}
	if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
