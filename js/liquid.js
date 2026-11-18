/* =========================================================
   "Let's talk" backdrop: liquid chrome (WebGL)

   A slowly flowing surface of dark mercury, shaded like polished chrome:
   - the surface is a height field: layered noise, domain-warped so it
     flows like liquid rather than scrolling
   - the liquid makes way for the cursor, like a finger drawn through
     water: the surface is pushed aside around it (a hollow with a slight
     raised rim), and the channel it leaves behind slowly closes back.
     Clicks and taps make a small splash of ripples.
     (Strengths are in part() and heightAt(); the trail in the JS below.)
   - the chrome orb sends a gentle ripple out every 3.6s, in time with its
     CSS sonar rings
   - shading: each point's tilt reflects a studio "softbox" overhead plus a
     key light, which is what makes it read as metal
   It stays dark behind the text and fades to black at the top and bottom.

   Performance: rendered at reduced resolution (liquid tolerates softness)
   and only animated while the section is on screen and the tab visible.
   Reduced motion: one still frame. No WebGL: the CSS background stays.
   ========================================================= */
(() => {
  const section = document.querySelector('.contact');
  if (!section) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'contact-liquid';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
  if (!gl) return;
  section.prepend(canvas);
  section.classList.add('has-liquid');

  // ---------- Shaders ----------
  const VERT = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;
  const RIPPLES = 10;   // click splashes
  const TRAIL = 12;     // recent cursor positions (the wake)
  const FRAG = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uMouse;      // in surface units (1 = section height), y up
    uniform float uMouseOn;   // 0..1, eased in/out as the cursor enters/leaves
    uniform vec2 uOrb;
    uniform vec3 uRip[${RIPPLES}];  // splashes: x, y, start time
    uniform vec3 uTrail[${TRAIL}];  // wake: x, y, time the cursor was there

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 3; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
      return v;
    }

    // Making way: the liquid at p is pushed outward, away from the cursor
    // and from where it just passed (so we sample the pattern from closer
    // in). The push grows smoothly from zero at the centre (it never flips
    // direction, so the surface can't fold): the middle simply calms and
    // stretches open, like water parting around a finger. The total push
    // stays below 1x so it never folds over. The wake heals as it ages.
    vec2 part(vec2 p) {
      vec2 d = p - uMouse;
      vec2 off = d * 0.6 * uMouseOn * exp(-dot(d, d) * 22.0);
      for (int i = 0; i < ${TRAIL}; i++) {
        vec3 tr = uTrail[i];
        float age = uTime - tr.z;
        if (age > 0.0 && age < 1.8) {
          vec2 e = p - tr.xy;
          // fresh points start weak (the cursor itself is already there),
          // then fade as the channel closes
          float w = smoothstep(0.0, 0.25, age) * exp(-age * 2.0);
          off += e * 0.22 * w * exp(-dot(e, e) * 30.0);
        }
      }
      return p - off;
    }

    float heightAt(vec2 p) {
      float t = uTime * 0.05;
      vec2 q = part(p) * 1.3;
      // domain warp: the noise is pushed around by more noise -> it flows
      vec2 w = vec2(fbm(q + vec2(t, -t * 0.7)), fbm(q + vec2(5.2 - t * 0.6, 1.3 + t)));
      float h = fbm(q * 1.1 + 1.6 * w + t * 0.4);

      // splashes from clicks / taps
      for (int i = 0; i < ${RIPPLES}; i++) {
        vec3 r = uRip[i];
        float age = uTime - r.z;
        if (age > 0.0 && age < 4.0) {
          float d = length(p - r.xy);
          h += 0.03 * exp(-age * 1.6) * exp(-d * 3.0) * sin(d * 38.0 - age * 9.0);
        }
      }
      // the orb's sonar
      float oa = mod(uTime, 3.6);
      float od = length(p - uOrb);
      h += 0.035 * exp(-oa * 1.2) * exp(-od * 2.8) * sin(od * 34.0 - oa * 8.0);

      // the hollow under the cursor, with the displaced liquid piled up
      // in a soft rim around it
      vec2 md = p - uMouse;
      float mr = length(md);
      h -= 0.06 * uMouseOn * exp(-mr * mr * 30.0);
      h += 0.03 * uMouseOn * exp(-pow(mr - 0.2, 2.0) * 260.0);
      return h;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uRes;
      vec2 p = gl_FragCoord.xy / uRes.y;
      float e = 1.5 / uRes.y;
      float h0 = heightAt(p);
      float dx = (heightAt(p + vec2(e, 0.0)) - h0) / e;
      float dy = (heightAt(p + vec2(0.0, e)) - h0) / e;
      vec3 n = normalize(vec3(-dx * 0.35, -dy * 0.35, 1.0));
      vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);

      // studio reflections: a broad softbox overhead, a thin horizon band,
      // and a key light from the upper left
      float softbox = smoothstep(0.18, 0.55, r.y) * smoothstep(0.95, 0.35, abs(r.x));
      float band = exp(-pow((r.y + 0.12) * 7.0, 2.0)) * 0.35;
      float spec = pow(max(dot(r, normalize(vec3(-0.35, 0.55, 0.75))), 0.0), 40.0);

      vec3 col = vec3(0.03, 0.033, 0.038)
               + vec3(0.62, 0.68, 0.74) * (softbox * 0.62 + band * 0.8)
               + vec3(0.9, 0.95, 1.0) * spec * 0.75;

      // keep it dark where the text sits, and a slim fade into black at
      // the top and bottom edges so it melts into the neighbouring sections
      vec2 c = (uv - vec2(0.5, 0.5)) * vec2(uRes.x / uRes.y, 1.0);
      col *= 1.0 - 0.62 * exp(-dot(c, c) * 2.2);
      col *= smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.9, uv.y);
      col = mix(vec3(0.0196), col, 0.92);   // settle toward the page's obsidian
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (err) {
    // Shader problem on this device: fall back to the CSS background
    canvas.remove();
    section.classList.remove('has-liquid');
    console.warn('Liquid backdrop disabled:', err.message);
    return;
  }
  gl.useProgram(program);

  // One triangle that covers the whole canvas
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name) => gl.getUniformLocation(program, name);
  const uRes = u('uRes'), uTime = u('uTime'), uMouse = u('uMouse'), uMouseOn = u('uMouseOn');
  const uOrb = u('uOrb'), uRip = u('uRip'), uTrail = u('uTrail');

  // ---------- Size: reduced resolution, capped ----------
  const RES_SCALE = 0.5;   // of the device pixels (the liquid is soft anyway)
  let W = 1, H = 1;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = section.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width * dpr * RES_SCALE));
    H = Math.max(1, Math.round(r.height * dpr * RES_SCALE));
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
    if (!running) draw();
  };

  // ---------- Cursor: dent + ripples ----------
  // Surface units: 1 = the section's height, origin bottom-left, y up
  const toSurface = (clientX, clientY) => {
    const r = section.getBoundingClientRect();
    return [(clientX - r.left) / r.height, (r.bottom - clientY) / r.height];
  };
  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, on: 0, target: 0 };
  const ripples = new Float32Array(RIPPLES * 3).fill(-100);
  let rippleIndex = 0;
  const trail = new Float32Array(TRAIL * 3).fill(-100);
  let trailIndex = 0, lastTrail = { x: -1, y: -1, t: 0 };
  const now = () => performance.now() / 1000;
  const start = now() - 10;   // start mid-flow, not from a blank pattern

  const addRipple = (x, y, t) => {
    ripples[rippleIndex * 3] = x;
    ripples[rippleIndex * 3 + 1] = y;
    ripples[rippleIndex * 3 + 2] = t;
    rippleIndex = (rippleIndex + 1) % RIPPLES;
  };
  const addTrail = (x, y, t) => {
    trail[trailIndex * 3] = x;
    trail[trailIndex * 3 + 1] = y;
    trail[trailIndex * 3 + 2] = t;
    trailIndex = (trailIndex + 1) % TRAIL;
    lastTrail = { x, y, t };
  };

  if (!reduceMotion) {
    section.addEventListener('pointermove', (e) => {
      const [x, y] = toSurface(e.clientX, e.clientY);
      mouse.tx = x;
      mouse.ty = y;
      mouse.target = 1;
      // drop a wake point every ~0.05 units of travel (at most every 40ms)
      const t = now() - start;
      if (Math.hypot(x - lastTrail.x, y - lastTrail.y) > 0.05 && t - lastTrail.t > 0.04) addTrail(x, y, t);
    });
    section.addEventListener('pointerleave', () => { mouse.target = 0; });
    // a tap or click makes a slightly bigger splash: two rings close together
    section.addEventListener('pointerdown', (e) => {
      const [x, y] = toSurface(e.clientX, e.clientY);
      const t = now() - start;
      addRipple(x, y, t);
      addRipple(x, y, t + 0.15);
    });
  }

  // ---------- Render loop ----------
  const orb = section.querySelector('.contact-orb');
  let running = false;
  let visible = false;
  let last = now();

  const draw = () => {
    const t = reduceMotion ? 12 : now() - start;
    const dt = Math.min(0.1, now() - last);
    last = now();
    // the dent eases after the cursor, and fades in/out
    const k = 1 - Math.exp(-dt * 10);
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    mouse.on += (mouse.target - mouse.on) * (1 - Math.exp(-dt * 4));

    if (orb) {
      const o = orb.getBoundingClientRect();
      const [ox, oy] = toSurface(o.left + o.width / 2, o.top + o.height / 2);
      gl.uniform2f(uOrb, ox, oy);
    }
    gl.uniform2f(uRes, W, H);
    gl.uniform1f(uTime, t);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.uniform1f(uMouseOn, mouse.on);
    gl.uniform3fv(uRip, ripples);
    gl.uniform3fv(uTrail, trail);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const loop = () => {
    if (!running) return;
    draw();
    requestAnimationFrame(loop);
  };
  const update = () => {
    const should = visible && !document.hidden && !reduceMotion;
    if (should && !running) {
      running = true;
      last = now();
      requestAnimationFrame(loop);
    } else if (!should) {
      running = false;
    }
  };

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    update();
  }).observe(section);
  document.addEventListener('visibilitychange', update);
  new ResizeObserver(resize).observe(section);
  resize();
  draw();
})();
