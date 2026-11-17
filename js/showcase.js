/* =========================================================
   Laptop showcase: scroll-driven Blender render + HTML screen

   How it works
   - The Blender animation (images/laptop/{lg,sm}/001-252.webp) is drawn
     onto a <canvas>; one GSAP timeline, scrubbed by ScrollTrigger, decides
     which frame shows. Scrolling back simply plays it backwards.
   - The laptop's blank display is covered by real HTML (.screen). Its four
     corners were measured from the render (SCREEN_QUAD below) and a CSS
     matrix3d maps the HTML onto them, so the content sits in the screen's
     exact perspective.
   - The picture and the project info appear together once the lid has
     stopped at its open position, change together project by project, and
     leave together before the lid starts to close.

   Render facts (from the frames themselves)
     1-12   empty          97-143  lid opens
     13-37  drops in       144-156 fully open, still  (the showcase hold)
     37-55  settles        157-199 lid closes (mirror of opening)
     55-95  slides right   217-247 rises out of frame
   ========================================================= */
(() => {
  const section = document.querySelector('.showcase');
  if (!section) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Without GSAP, or with reduced motion, the section stays in its static
  // form (see style.css): the project panels shown as a simple list.
  if (reduceMotion || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);
  document.documentElement.classList.add('has-showcase');

  // ---------- Render constants ----------
  const FRAME_COUNT = 252;
  const OPEN_FRAME = 144;            // first frame of the open hold
  const CLOSE_FRAME = 157;           // first frame of the closing motion
  const CROP = { w: 1320, h: 880 };  // frames are cropped to this box
  // Bounding box of the open laptop inside the cropped frame
  const OPEN_BOX = { x0: 340, x1: 1288, y0: 104, y1: 856, cx: 814, cy: 480 };
  const FLOOR_Y = 700;  // studio horizon, in cropped-frame pixels (behind the base)

  // Display corners [TL, TR, BR, BL] in cropped-frame pixels for the open,
  // still laptop (frames 144-156). The picture fills the glass inside the
  // silver frame: left, top and right edges are straight-line fits of the
  // frame's inner edge (the right edge 16px in, leaving a dark strip),
  // the bottom is the line where the chin begins.
  const SCREEN_QUAD = [594, 129, 1274, 164, 1225, 615, 547, 543];
  const SCREEN_W = 1280, SCREEN_H = 800;  // the HTML screen's own size before mapping

  // ---------- Timeline layout (1 unit = one viewport height of scroll) ----------
  const T_OPEN = 1.8;     // drop in, slide right, open
  const T_REVEAL = 0.35;  // picture + first project fade in once the lid has stopped
  const T_PROJECT = 0.85; // per project
  const T_HIDE = 0.35;    // last project + picture fade out before the lid closes
  const T_CLOSE = 1.5;    // close and rise out

  // ---------- Elements ----------
  const pin = section.querySelector('.showcase-pin');
  const stage = section.querySelector('.showcase-stage');
  const canvas = section.querySelector('.showcase-canvas');
  const ctx = canvas.getContext('2d');
  const screen = section.querySelector('.screen');
  const shots = [...section.querySelectorAll('.screen-shot')];
  const ambients = [...section.querySelectorAll('.showcase-ambient span')];  // screen light, per project
  const panels = [...section.querySelectorAll('.project-panel')];
  const intro = section.querySelector('.showcase-intro');
  const head = section.querySelector('.showcase-head');
  const glow = section.querySelector('.showcase-glow');
  const progress = section.querySelector('.showcase-progress');
  const counter = section.querySelector('.showcase-count');
  const PROJECTS = panels.length;

  // ---------- Layout: scale and place the render for this viewport ----------
  let isPortrait = false;
  const layout = () => {
    const vw = pin.clientWidth;
    const vh = pin.clientHeight;
    const gutter = Math.min(56, Math.max(16, vw * 0.04));
    const boxW = OPEN_BOX.x1 - OPEN_BOX.x0;
    const boxH = OPEN_BOX.y1 - OPEN_BOX.y0;
    isPortrait = vw < 820 || vw / vh < 1.1;
    section.classList.toggle('is-portrait', isPortrait);
    // The open laptop must stay clear of the section head (label, counter
    // and progress line), so measure where the head ends
    const headBottom = head.offsetTop + head.offsetHeight;
    let s, tx, ty;
    if (!isPortrait) {
      // Laptop on the right, info on the left; the laptop fills the space
      // between the head and the bottom edge, with breathing room
      const top = headBottom + Math.max(14, vh * 0.018);
      const bottom = vh - Math.max(10, vh * 0.012);
      // As large as the height allows, but always leave the info column at
      // least 480px (+40px gap) so titles stay on two lines
      const maxW = Math.min(0.62 * vw, vw - 2 * gutter - 480 - 40);
      s = Math.min((bottom - top) / boxH, maxW / boxW, 1.35);
      tx = vw - gutter - OPEN_BOX.x1 * s;
      ty = top + (bottom - top - boxH * s) / 2 - OPEN_BOX.y0 * s;
    } else {
      // Phones/tablets: laptop on top, info underneath
      s = Math.min((0.96 * vw) / boxW, (0.4 * vh) / boxH);
      tx = vw / 2 - OPEN_BOX.cx * s;
      ty = headBottom + 20 - OPEN_BOX.y0 * s;
    }
    // While it drops in, the closed laptop should sit centred under the
    // intro title; the render has it slightly right of centre, so shift it
    place.entranceShift = vw / 2 - (tx + ENTRANCE_CX * s);
    Object.assign(place, { s, tx, ty });
    placeStage(current || 1, true);
    section.style.setProperty('--laptop-left', `${tx + OPEN_BOX.x0 * s}px`);
    section.style.setProperty('--laptop-mid', `${ty + OPEN_BOX.cy * s}px`);
    // Studio backdrop: lit around the laptop's resting place, horizon just
    // behind the back of the laptop's base
    section.style.setProperty('--laptop-cx', `${tx + OPEN_BOX.cx * s}px`);
    section.style.setProperty('--floor-y', `${ty + FLOOR_Y * s}px`);
    section.style.setProperty('--laptop-bottom', `${ty + OPEN_BOX.y1 * s}px`);
    return s;
  };

  // The centring shift eases away in step with the render's own slide to
  // the right (progress measured from the frames, 50 -> 97), so the two
  // motions read as one
  const ENTRANCE_CX = 459;   // closed laptop's centre in the cropped frame
  const SLIDE_FROM = 50;
  const SLIDE = [0, .003, .003, .003, .009, .009, .015, .021, .034, .04, .052, .071, .089, .107, .129, .153,
    .184, .215, .252, .291, .334, .39, .454, .518, .577, .635, .684, .727, .77, .804, .837, .868, .893, .914,
    .933, .951, .963, .972, .979, .988, .994, .997, 1];
  const slideProgress = (f) => (f < SLIDE_FROM ? 0 : SLIDE[Math.min(f - SLIDE_FROM, SLIDE.length - 1)]);

  const place = { s: 1, tx: 0, ty: 0, entranceShift: 0 };
  let placedShift = null;
  const placeStage = (f, force) => {
    const shift = place.entranceShift * (1 - slideProgress(f));
    if (!force && shift === placedShift) return;
    placedShift = shift;
    stage.style.transform = `translate(${place.tx + shift}px, ${place.ty}px) scale(${place.s})`;
  };

  let current = 0;
  const initialScale = layout();

  // ---------- Frames: progressive loading ----------
  // Sharp set on large/high-density screens, light set elsewhere
  const useLarge = CROP.w * initialScale * Math.min(window.devicePixelRatio || 1, 2) > 900;
  const frameSrc = (i) => `images/laptop/${useLarge ? 'lg' : 'sm'}/${String(i).padStart(3, '0')}.webp`;
  const frames = new Array(FRAME_COUNT + 1);   // 1-based
  let canvasSized = false;

  // Coarse pass first (so scrubbing works almost immediately), then fill in
  const loadOrder = (() => {
    const seen = new Set();
    const order = [];
    const add = (i) => { if (i >= 1 && i <= FRAME_COUNT && !seen.has(i)) { seen.add(i); order.push(i); } };
    add(1); add(OPEN_FRAME);
    [24, 12, 6, 3, 1].forEach((step) => { for (let i = 1; i <= FRAME_COUNT; i += step) add(i); });
    return order;
  })();

  const loadFrames = () => {
    let next = 0;
    const worker = () => {
      if (next >= loadOrder.length) return;
      const i = loadOrder[next++];
      const img = new Image();
      img.decoding = 'async';
      img.src = frameSrc(i);
      const done = () => {
        frames[i] = img;
        // Size the canvas to the frames once (a new canvas defaults to 300x150)
        if (!canvasSized) {
          canvasSized = true;
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
        // Repaint if this is the frame (or a closer stand-in) we need right now
        if (Math.abs(i - current) < Math.abs((paintedFrom || 0) - current) || i === current) paint(current, true);
        worker();
      };
      img.onload = done;
      img.onerror = worker;   // skip a missing frame; neighbours stand in
    };
    for (let k = 0; k < 6; k++) worker();
  };

  // ---------- Canvas painting ----------
  let paintedFrom = 0;
  let topFade = null;
  const nearestLoaded = (f) => {
    for (let d = 0; d < FRAME_COUNT; d++) {
      if (frames[f - d]) return f - d;
      if (frames[f + d]) return f + d;
    }
    return 0;
  };
  const paint = (f, force) => {
    if (f === current && !force) return;
    current = f;
    const use = nearestLoaded(f);
    if (!use || (use === paintedFrom && !force)) return;
    paintedFrom = use;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(frames[use], 0, 0, w, h);
    // Fade the top edge so the laptop emerges from the dark instead of being
    // cut off at the frame's edge. (Done in the canvas itself: a CSS mask on
    // a scaled canvas makes browsers rasterise it blurry.)
    // ('destination-in' clears anything the fill doesn't cover, so the
    // gradient spans the whole canvas: clear at the top, solid from 14%.)
    if (!topFade) {
      topFade = ctx.createLinearGradient(0, 0, 0, h);
      topFade.addColorStop(0, 'rgba(0,0,0,0)');
      topFade.addColorStop(0.14, 'rgba(0,0,0,1)');
      topFade.addColorStop(1, 'rgba(0,0,0,1)');
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = topFade;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  };

  // ---------- Screen overlay: perspective mapping ----------
  // Solve the homography taking the screen rectangle to the measured quad
  const toMatrix3d = (q) => {
    const src = [[0, 0], [SCREEN_W, 0], [SCREEN_W, SCREEN_H], [0, SCREEN_H]];
    const A = [], b = [];
    src.forEach(([x, y], i) => {
      const X = q[i * 2], Y = q[i * 2 + 1];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
    });
    // Gaussian elimination
    for (let c = 0; c < 8; c++) {
      let p = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const k = A[r][c] / A[c][c];
        for (let j = c; j < 8; j++) A[r][j] -= k * A[c][j];
        b[r] -= k * b[c];
      }
    }
    const h = b.map((v, i) => v / A[i][i]);
    return `matrix3d(${h[0]},${h[3]},0,${h[6]},${h[1]},${h[4]},0,${h[7]},0,0,1,0,${h[2]},${h[5]},0,1)`;
  };
  screen.style.transform = toMatrix3d(SCREEN_QUAD);

  // The picture only exists on the open, still laptop; its fade in/out is
  // on the timeline, together with the project info
  let screenOn = null;
  const updateScreen = (f) => {
    const on = f >= OPEN_FRAME && f < CLOSE_FRAME;
    if (on === screenOn) return;
    screenOn = on;
    screen.style.visibility = on ? 'visible' : 'hidden';
  };

  // ---------- Counter + progress ----------
  let activeProject = -1;
  const setActive = (i) => {
    if (i === activeProject) return;
    activeProject = i;
    counter.textContent = String(i + 1).padStart(2, '0');
    panels.forEach((p, k) => p.toggleAttribute('inert', k !== i));
  };

  // ---------- The master timeline ----------
  const state = { frame: 1 };
  const projectsStart = T_OPEN + T_REVEAL;
  const projectsEnd = projectsStart + PROJECTS * T_PROJECT;
  const closeStart = projectsEnd + T_HIDE;
  const total = closeStart + T_CLOSE + 0.1;

  const render = () => {
    const f = Math.min(FRAME_COUNT, Math.max(1, Math.round(state.frame)));
    placeStage(f);
    paint(f);
    updateScreen(f);
    const t = tl.time();
    setActive(Math.min(PROJECTS - 1, Math.max(0, Math.floor((t - projectsStart + 0.15) / T_PROJECT))));
  };

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    onUpdate: render,
    scrollTrigger: {
      trigger: section,
      pin,
      start: 'top top',
      end: () => '+=' + Math.round(pin.clientHeight * total),
      scrub: 0.6,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });

  // Phase 1-3: drop in, slide right, open (the render does the motion)
  tl.to(state, { frame: OPEN_FRAME, duration: T_OPEN }, 0);
  // Intro title lifts away as the laptop drops through it
  tl.fromTo(intro, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -80, duration: 0.45, ease: 'power1.in' }, 0.1);
  // Section head and floor light arrive as the laptop settles on the right
  tl.fromTo(head, { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 1.0);
  tl.fromTo(glow, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 0.8);
  // Once the lid has stopped: the screen lights up and the first project's
  // info arrives, together
  tl.fromTo(screen, { opacity: 0 }, { opacity: 1, duration: T_REVEAL, ease: 'power1.out' }, T_OPEN);
  if (ambients[0]) tl.fromTo(ambients[0], { autoAlpha: 0 }, { autoAlpha: 1, duration: T_REVEAL, ease: 'power1.out' }, T_OPEN);
  tl.fromTo(panels[0], { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: T_REVEAL, ease: 'power2.out' }, T_OPEN);

  // Phase 4: the showcase. Laptop holds still; info and screen change together
  tl.fromTo(progress, { scaleX: 0 }, { scaleX: 1, duration: PROJECTS * T_PROJECT }, projectsStart);
  for (let i = 1; i < PROJECTS; i++) {
    const t = projectsStart + i * T_PROJECT;
    tl.to(panels[i - 1], { autoAlpha: 0, y: -30, duration: 0.28, ease: 'power2.in' }, t - 0.3);
    tl.fromTo(panels[i], { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' }, t - 0.04);
    tl.fromTo(shots[i], { autoAlpha: 0, scale: 1.05 }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'power2.out' }, t - 0.25);
    // the room's light shifts to the new project's colour
    if (ambients[i]) {
      tl.fromTo(ambients[i], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: 'power1.inOut' }, t - 0.25);
      tl.to(ambients[i - 1], { autoAlpha: 0, duration: 0.45, ease: 'power1.inOut' }, t - 0.25);
    }
    tl.set(shots[i - 1], { autoAlpha: 0 }, t + 0.21);
  }

  // Phase 5-6: close the lid, then rise out of view
  // The last project and the picture leave together, then the lid closes
  tl.to(panels[PROJECTS - 1], { autoAlpha: 0, y: -30, duration: T_HIDE, ease: 'power2.in' }, projectsEnd);
  tl.to(screen, { opacity: 0, duration: T_HIDE, ease: 'power1.in' }, projectsEnd);
  if (ambients[PROJECTS - 1]) tl.to(ambients[PROJECTS - 1], { autoAlpha: 0, duration: T_HIDE, ease: 'power1.in' }, projectsEnd);
  // (frame 157 looks like 143, so jumping from the 144-156 hold is seamless;
  // immediateRender:false keeps it from touching the frame until it starts)
  tl.fromTo(state, { frame: CLOSE_FRAME }, { frame: FRAME_COUNT, duration: T_CLOSE, immediateRender: false }, closeStart);
  tl.to(glow, { autoAlpha: 0, duration: 0.4 }, closeStart + 0.3);
  tl.to(head, { autoAlpha: 0, y: -12, duration: 0.3 }, closeStart + 0.9);

  // ---------- Start ----------
  gsap.set(shots.slice(1), { autoAlpha: 0 });
  gsap.set(panels.slice(1), { autoAlpha: 0 });
  setActive(0);
  render();

  const start = () => loadFrames();
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1200 });
  else setTimeout(start, 300);

  window.addEventListener('resize', () => { layout(); });
  ScrollTrigger.addEventListener('refreshInit', layout);

  // Used by smooth-scroll.js after a fade-and-jump: finish the scrub at once
  // so the laptop doesn't visibly fast-forward to the new scroll position
  window.showcaseSync = () => {
    const scrub = tl.scrollTrigger && tl.scrollTrigger.getTween();
    if (scrub) scrub.progress(1);
    render();
  };
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
