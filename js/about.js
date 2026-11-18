/* =========================================================
   About: scroll-driven Polaroid (Blender render + HTML portrait)

   Built like js/showcase.js (the laptop):
   - The render (images/about/{lg,sm}/frame_0001-0316.webp) is drawn onto a
     <canvas>; one GSAP timeline, scrubbed by ScrollTrigger, picks the frame.
     Scrolling back plays it backwards.
   - Canvas and portrait live in one "stage" in the render's own 1920x1080
     pixels, scaled and placed with a single transform, so the portrait
     stays locked to the Polaroid's photo area at any screen size.
   - The portrait is mapped onto the photo area's four measured corners
     with a CSS matrix3d (the print is turned very slightly).
   - The text is normal HTML beside the stage (below it on phones).

   Burn: the frames are the combined render, so the fire can't draw over
   the portrait. Instead the portrait fades and is wiped away from the
   bottom up while the fire climbs. (A layered version with base/fx/matte
   passes would replace updateBurn's job: matte as the portrait's mask, fx
   drawn on a second canvas above it.)

   Render facts (from the frames themselves)
     1-10    empty            100-134  Polaroid flies left, camera drops out
     10-45   camera rises     134-196  Polaroid still on the left (the hold)
     52-60   shutter + flash  196-262  bottom ignites, fire climbs
     62-100  print ejects     258-312  chars, breaks up, embers fade
                              312-316  empty
   The frames are cropped to where anything is ever visible (CROP).
   ========================================================= */
(() => {
  const section = document.querySelector('.about');
  if (!section) return;

  // Without GSAP the section stays in its plain form (see style.css)
  if (!window.gsap || !window.ScrollTrigger) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  gsap.registerPlugin(ScrollTrigger);
  document.documentElement.classList.add('has-about');
  section.classList.toggle('is-static', reduceMotion);

  // ---------- Render constants (render pixels, 1920x1080, origin top-left) ----------
  const FRAME_COUNT = 316;
  const HOLD_FRAME = 134;    // Polaroid settles on the left
  const BURN_FRAME = 196;    // bottom edge ignites
  const STATIC_FRAME = 180;  // shown when motion is reduced
  const RENDER = { w: 1920, h: 1080 };
  const CROP = { x: 256, y: 24, w: 1192, h: 1056 };      // frames are cropped to this box
  const POLAROID = { x0: 329, y0: 242, x1: 707, y1: 839 };
  const TEXT_X = 787;                                    // free space for the text starts here
  // Photo area corners [TL, TR, BR, BL] during the hold
  const PHOTO_QUAD = [356.89, 284.5, 676.25, 283.81, 678.86, 711.32, 359.52, 714.10];
  const PHOTO_W = 460, PHOTO_H = 620;                    // the portrait element before mapping
  const CAMERA_CX = 960;                                 // camera rises centred in the render
  const FLASH_FRAME = 55;                                // shutter fires (render flash: 54-57)
  const FLASH_AT = { x: 990, y: 805 };                   // the camera's flash window at that moment
  const POLAROID_CX = (POLAROID.x0 + POLAROID.x1) / 2;
  const HORIZON_Y = 950;                                 // studio floor line, behind the camera body
  const ACTION_X1 = 1210;                              // right edge of anything clearly visible
  const ACTION_Y0 = 100;                                 // top edge of anything clearly visible

  // ---------- Timeline layout (1 unit = one viewport height of scroll) ----------
  const T_INTRO = 1.6;   // 1 -> 134: camera rises, prints, Polaroid flies left
  const T_HOLD = 2.4;    // 134 -> 196: portrait develops, text arrives (reading time)
  const T_BURN = 1.6;    // 196 -> 316: burns away, ends on an empty frame
  const HOLD_AT = T_INTRO;
  const BURN_AT = T_INTRO + T_HOLD;
  const total = BURN_AT + T_BURN + 0.1;
  const burnTime = (f) => BURN_AT + ((f - BURN_FRAME) / (FRAME_COUNT - BURN_FRAME)) * T_BURN;

  // ---------- Elements ----------
  const pin = section.querySelector('.about-pin');
  const stage = section.querySelector('.about-stage');
  const canvas = section.querySelector('.about-canvas');
  const ctx = canvas.getContext('2d');
  const photo = section.querySelector('.about-photo');
  const portrait = photo.querySelector('img');
  const sheen = section.querySelector('.about-sheen');
  const glow = section.querySelector('.about-glow');
  const firelight = section.querySelector('.about-firelight');
  const firespill = section.querySelector('.about-firespill');
  const backdrop = section.querySelector('.about-backdrop');
  const word = section.querySelector('.about-word');          // "WHO AM I?": title, then backdrop
  const wordDim = word.querySelector('.showcase-word-dim');
  const wordChrome = word.querySelector('.showcase-word-chrome');

  // ---------- "WHO AM I?" (same system as the laptop's "PROJECTS") ----------
  // Spans the screen at the top (a little lower in height than PROJECTS, to
  // stay clear of the text); starts smaller, centred, as the title
  let wordRatio = 0;   // rendered width per px of font-size
  const wordStart = { scale: 0.45, y: 0 };
  const fitWord = (vw, vh, gutter, portrait) => {
    if (!wordRatio) {
      word.style.setProperty('--word-size', '100px');
      wordRatio = word.offsetWidth / 100;
      word.style.removeProperty('--word-size');
      if (!wordRatio) return;
    }
    const size = Math.min((vw - 2 * gutter) / wordRatio, (vh * 0.32) / 0.86);
    const top = Math.max(16, vh * 0.04);
    section.style.setProperty('--word-size', `${size}px`);
    section.style.setProperty('--word-top', `${top}px`);
    const width = size * wordRatio;
    const height = size * 0.86;
    wordStart.scale = Math.min(1, (portrait ? vw * 0.74 : Math.min(vw * 0.4, 680)) / width);
    wordStart.y = vh / 2 - (top + height / 2);
  };

  // Chrome until the Polaroid ignites, fire while it burns, embers at the end
  const WORD_CHROME = '#e4e9ee';
  const WORD_FIRE = '#ff7a2a';
  const WORD_EMBER = '#c8401a';
  let wordTint = null;
  const setWordTint = (c) => {
    if (c === wordTint) return;
    wordTint = c;
    section.style.setProperty('--word-tint', c);
  };
  const flashWash = section.querySelector('.about-flash');
  const flashBloom = section.querySelector('.about-flash-bloom');
  const copy = [...section.querySelectorAll('.about-lead, .about-body, .skills')];
  const text = section.querySelector('.about-text');

  // ---------- Layout: scale and place the render for this viewport ----------
  let isPortrait = false;
  const place = { s: 1, tx: 0, ty: 0, entranceShift: 0 };
  const layout = () => {
    const vw = pin.clientWidth;
    // (static mode sets the pin's min-height itself, so measure the window)
    const vh = reduceMotion ? window.innerHeight : pin.clientHeight;
    const gutter = Math.min(56, Math.max(16, vw * 0.04));
    isPortrait = vw < 820 || vw / vh < 1.1;
    section.classList.toggle('is-portrait', isPortrait);
    fitWord(vw, vh, gutter, isPortrait);
    let s, tx, ty, shift = 0;
    if (!isPortrait) {
      // The full render height fills the screen (the camera rises from the
      // bottom edge), centred so the camera comes up mid-screen; the text
      // takes the free space right of the Polaroid
      s = vh / RENDER.h;
      tx = (vw - RENDER.w * s) / 2;
      ty = 0;
      const left = tx + TEXT_X * s;
      section.style.setProperty('--copy-left', `${left}px`);
      section.style.setProperty('--copy-width', `${Math.min(620, vw - gutter - left)}px`);
      section.style.setProperty('--copy-mid', `${ty + ((POLAROID.y0 + POLAROID.y1) / 2) * s}px`);
    } else {
      // Phones/tablets: zoom to the action, Polaroid against the left
      // gutter, text underneath it
      const top = Math.max(24, vh * 0.04);
      s = Math.min(
        (vw - 2 * gutter) / (ACTION_X1 - POLAROID.x0),
        (vh * 0.5 - top - 20) / (POLAROID.y1 - ACTION_Y0),
      );
      tx = gutter - POLAROID.x0 * s;
      ty = top - ACTION_Y0 * s;
      // The camera should still rise centred; that offset eases away as the
      // Polaroid flies to the left
      shift = vw / 2 - (tx + CAMERA_CX * s);
      section.style.setProperty('--copy-top', `${ty + POLAROID.y1 * s + 22}px`);
    }
    // When it starts burning, the Polaroid glides to the middle of the screen
    const centerShift = vw / 2 - (tx + POLAROID_CX * s);
    Object.assign(place, { s, tx, ty, entranceShift: shift, centerShift });
    placeStage(stageFrame, true);
    // Studio light behind the resting Polaroid, firelight under it
    const pcx = tx + ((POLAROID.x0 + POLAROID.x1) / 2) * s;
    section.style.setProperty('--polaroid-x', `${pcx}px`);
    section.style.setProperty('--polaroid-y', `${ty + ((POLAROID.y0 + POLAROID.y1) / 2) * s}px`);
    section.style.setProperty('--polaroid-w', `${(POLAROID.x1 - POLAROID.x0) * s}px`);
    section.style.setProperty('--horizon-y', `${ty + HORIZON_Y * s}px`);
    // Where the flash fires on screen (the camera is still centred then)
    section.style.setProperty('--flash-x', `${tx + shift + FLASH_AT.x * s}px`);
    section.style.setProperty('--flash-y', `${ty + FLASH_AT.y * s}px`);
    // Phones: soften the render's bottom edge, which sits mid-screen there
    fadeFrom = isPortrait ? 0.8 : 1;
    bottomFade = null;
    if (reduceMotion) {
      // Static: the section grows to fit the text instead of pinning
      pin.style.minHeight = isPortrait ? `${text.offsetTop + text.offsetHeight + 64}px` : '';
    }
    if (paintedFrom) paint(current, true);
    return s;
  };

  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  // The stage moves twice (both follow the scroll smoothly, so they take
  // the unrounded frame):
  // - the Polaroid's flight to the left (100 -> 134) eases away the phone
  //   centring offset, and the studio key light moves from camera to Polaroid
  // - as the bottom edge ignites (194 -> 214, while the text fades out) the
  //   whole stage glides so the burning Polaroid is centred on screen
  //   (200 -> 220, once the text has left, so they never overlap)
  const CENTER_FROM = 200, CENTER_TO = 220;   // starts slowly, after the text is mostly gone
  let stageFrame = 1;
  let placedP = null, placedQ = null;
  const placeStage = (f, force) => {
    stageFrame = f;
    const p = smooth((f - 100) / (HOLD_FRAME - 100));
    const q = smooth((f - CENTER_FROM) / (CENTER_TO - CENTER_FROM));
    if (!force && p === placedP && q === placedQ) return;
    placedP = p;
    placedQ = q;
    const x = place.tx + place.entranceShift * (1 - p) + (place.centerShift || 0) * q;
    stage.style.transform = `translate(${x}px, ${place.ty}px) scale(${place.s})`;
    const subject = CAMERA_CX + (POLAROID_CX - CAMERA_CX) * p;
    section.style.setProperty('--key-x', `${x + subject * place.s}px`);
  };

  // ---------- Canvas painting ----------
  let current = 0;
  let paintedFrom = 0;
  let fadeFrom = 1;
  let bottomFade = null;
  const frames = new Array(FRAME_COUNT + 1);   // 1-based
  let canvasSized = false;

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
    // Nothing loaded yet: keep whatever is on the canvas
    if (!use || (use === paintedFrom && !force)) return;
    paintedFrom = use;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(frames[use], 0, 0, w, h);
    if (fadeFrom < 1) {
      // Fade the bottom edge out (in the canvas itself: a CSS mask on a
      // scaled canvas rasterises blurry)
      if (!bottomFade) {
        bottomFade = ctx.createLinearGradient(0, 0, 0, h);
        bottomFade.addColorStop(0, 'rgba(0,0,0,1)');
        bottomFade.addColorStop(fadeFrom, 'rgba(0,0,0,1)');
        bottomFade.addColorStop(1, 'rgba(0,0,0,0)');
      }
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = bottomFade;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  // ---------- Portrait: perspective mapping onto the photo area ----------
  // Solve the homography taking the portrait rectangle to the measured quad
  // (same method as the laptop screen)
  const toMatrix3d = (q, W, H) => {
    const src = [[0, 0], [W, 0], [W, H], [0, H]];
    const A = [], b = [];
    src.forEach(([x, y], i) => {
      const X = q[i * 2], Y = q[i * 2 + 1];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
    });
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
  photo.style.transform = toMatrix3d(PHOTO_QUAD, PHOTO_W, PHOTO_H);

  // ---------- Frames: progressive loading ----------
  const initialScale = layout();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Light set on small screens, low-memory devices, or when the render is
  // shown small enough that the sharp set wouldn't be noticed
  const useSmall = window.innerWidth < 768
    || (navigator.deviceMemory && navigator.deviceMemory <= 4)
    || CROP.w * initialScale * dpr <= 650;
  const frameSrc = (i) => `images/about/${useSmall ? 'sm' : 'lg'}/frame_${String(i).padStart(4, '0')}.webp`;

  // The intro (1-140) first, then the rest; each part coarse-to-fine so
  // scrubbing works almost immediately
  const loadOrder = (() => {
    const seen = new Set();
    const order = [];
    const add = (i) => { if (i >= 1 && i <= FRAME_COUNT && !seen.has(i)) { seen.add(i); order.push(i); } };
    if (reduceMotion) { add(STATIC_FRAME); return order; }
    add(1); add(HOLD_FRAME); add(STATIC_FRAME); add(BURN_FRAME);
    const pass = (from, to) => [24, 12, 6, 3, 1].forEach((step) => { for (let i = from; i <= to; i += step) add(i); });
    pass(1, 140);
    pass(141, FRAME_COUNT);
    return order;
  })();

  let loadingStarted = false;
  const loadFrames = () => {
    if (loadingStarted) return;
    loadingStarted = true;
    let next = 0;
    const worker = () => {
      if (next >= loadOrder.length || destroyed) return;
      const i = loadOrder[next++];
      const img = new Image();
      img.decoding = 'async';
      img.src = frameSrc(i);
      img.onload = () => {
        if (destroyed) return;
        frames[i] = img;
        // Size the canvas to the frames once (a new canvas defaults to 300x150)
        if (!canvasSized) {
          canvasSized = true;
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
        // Repaint if this is the frame (or a closer stand-in) we need right now
        if (i === current || Math.abs(i - current) < Math.abs((paintedFrom || 0) - current)) paint(current, true);
        worker();
      };
      img.onerror = worker;   // skip a missing frame; neighbours stand in
    };
    for (let k = 0; k < 6; k++) worker();
  };

  // ---------- Camera flash ----------
  // Played in real time (not scrubbed) so it pops like a real flash however
  // fast the page is scrolled: a hard spike, then a soft fall-off
  const flash = gsap.timeline({ paused: true })
    .fromTo(flashWash, { autoAlpha: 0 }, { autoAlpha: 0.8, duration: 0.05, ease: 'power2.out' }, 0)
    .to(flashWash, { autoAlpha: 0, duration: 0.75, ease: 'power2.out' }, 0.08)
    .fromTo(flashBloom, { autoAlpha: 0, scale: 0.35 }, { autoAlpha: 1, scale: 1, duration: 0.06, ease: 'power2.out' }, 0)
    .to(flashBloom, { autoAlpha: 0, scale: 1.3, duration: 0.6, ease: 'power2.out' }, 0.09);

  let lastFrame = 1;
  const checkFlash = (f) => {
    // Fires when scrolling forward through the click; not when scrolling
    // back, and not when the page jumps far past it (e.g. reload lower down)
    if (lastFrame < FLASH_FRAME && f >= FLASH_FRAME && f - FLASH_FRAME < 30) flash.restart();
    lastFrame = f;
  };

  let destroyed = false;
  const state = { frame: reduceMotion ? STATIC_FRAME : 1 };
  const render = () => {
    const f = Math.min(FRAME_COUNT, Math.max(1, Math.round(state.frame)));
    placeStage(Math.min(FRAME_COUNT, Math.max(1, state.frame)));
    paint(f);
    if (!reduceMotion) checkFlash(f);
    setWordTint(f >= 272 ? WORD_EMBER : f >= 198 ? WORD_FIRE : WORD_CHROME);
  };

  // Re-measure the word once its font has loaded (and re-read the timeline's
  // start values, which depend on it)
  gsap.set(word, { xPercent: -50 });
  if (document.fonts) {
    document.fonts.load('100px Anton').then(() => {
      wordRatio = 0;
      if (reduceMotion) layout(); else ScrollTrigger.refresh();
    }).catch(() => {});
  }

  // ---------- Reduced motion: a still frame, portrait and text, no scrub ----------
  if (reduceMotion) {
    gsap.set(photo, { autoAlpha: 1 });
    gsap.set([glow, backdrop], { autoAlpha: 1 });
    gsap.set(wordChrome, { autoAlpha: 0 });   // the word rests in the backdrop
    gsap.set([firelight, firespill], { autoAlpha: 0 });
    render();
    loadFrames();
    window.addEventListener('resize', layout);
    return;
  }

  // ---------- The master timeline ----------
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

  // Frames: intro, hold, burn (the hold is still, so it just spans the scroll)
  tl.fromTo(state, { frame: 1 }, { frame: HOLD_FRAME, duration: T_INTRO }, 0);
  tl.fromTo(state, { frame: HOLD_FRAME }, { frame: BURN_FRAME, duration: T_HOLD, immediateRender: false }, HOLD_AT);
  tl.fromTo(state, { frame: BURN_FRAME }, { frame: FRAME_COUNT, duration: T_BURN, immediateRender: false }, BURN_AT);

  // The studio set lights up as the camera fades in (frames 10-20), dims
  // while the fire takes over, and is dark again by the final empty frame
  const introTime = (f) => ((f - 1) / (HOLD_FRAME - 1)) * T_INTRO;
  tl.fromTo(backdrop, { autoAlpha: 0 }, { autoAlpha: 1, duration: introTime(20) - introTime(8), ease: 'power1.out' }, introTime(8));
  tl.to(backdrop, { autoAlpha: 0.25, duration: burnTime(240) - burnTime(205), ease: 'power1.inOut' }, burnTime(205));
  tl.to(backdrop, { autoAlpha: 0, duration: burnTime(312) - burnTime(285) }, burnTime(285));

  // "WHO AM I?" starts as the chrome title in the empty opening frames, then
  // grows up into the backdrop as the camera rises; it leaves with the embers
  tl.fromTo(word,
    { y: () => wordStart.y, scale: () => wordStart.scale },
    { y: 0, scale: 1, duration: 0.75, ease: 'power2.inOut' }, 0.06);
  tl.fromTo(wordDim, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45, ease: 'power1.inOut' }, 0.2);
  tl.fromTo(wordChrome, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.45, ease: 'power1.inOut' }, 0.32);
  tl.to(word, { autoAlpha: 0, y: -40, duration: burnTime(312) - burnTime(288), ease: 'power1.in' }, burnTime(288));

  // Soft studio light gathers behind the Polaroid as it settles
  tl.fromTo(glow, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power1.out' }, HOLD_AT - 0.35);

  // The portrait develops like an instant photo: out of the print's dark
  // grey, colourless and flat, slowly into full colour; a gloss passes once
  tl.fromTo(photo, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'power1.out' }, HOLD_AT + 0.05);
  tl.fromTo(portrait,
    { filter: 'brightness(0.35) saturate(0) contrast(0.8)' },
    { filter: 'brightness(1) saturate(1) contrast(1)', duration: 1.1, ease: 'power1.out' },
    HOLD_AT + 0.05);
  tl.fromTo(sheen, { xPercent: -130 }, { xPercent: 130, duration: 0.9, ease: 'power1.inOut' }, HOLD_AT + 0.7);

  // Name and intro rise in alongside
  tl.fromTo(copy, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.14 }, HOLD_AT + 0.25);

  // The burn: text leaves as the edge ignites (196-207). The portrait is
  // wiped away from the bottom, following the flame tips (measured from the
  // frames: they reach the photo's bottom edge at 219 and its top by 264),
  // and what's left fades as the paper chars (236-258)
  tl.to(copy, { autoAlpha: 0, y: -16, duration: burnTime(207) - BURN_AT, ease: 'power1.out' }, BURN_AT);
  tl.fromTo(photo, { '--burn': '0%' }, { '--burn': '114%', duration: burnTime(264) - burnTime(219) }, burnTime(219));
  tl.to(photo, { autoAlpha: 0, duration: burnTime(258) - burnTime(236), ease: 'power1.in' }, burnTime(236));
  tl.to(glow, { autoAlpha: 0, duration: 0.5 }, BURN_AT + 0.1);
  // Firelight: kindles with the ignition, is at full strength once the
  // flames climb, rises with them (and the burning pieces) up the print,
  // then dies with the embers. The floor spill stays on the floor.
  const fire = [firelight, firespill];
  tl.fromTo(fire, { autoAlpha: 0 }, { autoAlpha: 1, duration: burnTime(228) - burnTime(197), ease: 'power1.in' }, burnTime(197));
  tl.fromTo(firelight, { y: 0 }, { y: -360, duration: burnTime(295) - burnTime(212), ease: 'power1.inOut' }, burnTime(212));
  tl.to(fire, { autoAlpha: 0, duration: burnTime(312) - burnTime(282), ease: 'power1.in' }, burnTime(282));

  // ---------- Start ----------
  render();

  // Begin loading while the laptop section is finishing (about two screens
  // before this section arrives), or at once if the page opens further down
  const preload = ScrollTrigger.create({
    trigger: section,
    start: () => `top bottom+=${Math.round(window.innerHeight * 2)}`,
    onEnter: loadFrames,
    onEnterBack: loadFrames,
    onLeave: loadFrames,
    invalidateOnRefresh: true,
  });
  if (preload.progress > 0) loadFrames();

  window.addEventListener('resize', () => { layout(); });
  ScrollTrigger.addEventListener('refreshInit', layout);

  // Frees everything if the section is ever removed from the page
  window.aboutDestroy = () => {
    destroyed = true;
    preload.kill();
    tl.scrollTrigger && tl.scrollTrigger.kill();
    tl.kill();
    flash.kill();
    ScrollTrigger.removeEventListener('refreshInit', layout);
    frames.length = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
})();
