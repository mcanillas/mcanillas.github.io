/* =========================================================
   "Let's talk": magnetic chrome button

   As the cursor nears the button, the words lean gently toward it and the
   chrome orb is pulled harder (and swells a little), easing back when the
   cursor moves away. The pull fades smoothly with distance, so nothing
   jumps. A chrome ring also trails the cursor in this section and is
   pulled onto the orb, wrapping it, as the cursor gets close. The chrome shine following the cursor and the orb's hover fill
   are handled elsewhere (index.html script, style.css).

   Mouse/trackpad only; skipped on touch screens and for reduced motion.
   ========================================================= */
(() => {
  const link = document.querySelector('.contact-link');
  if (!link || !window.gsap) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const section = link.closest('.contact') || document.body;
  const text = link.querySelector('.contact-text');
  const orb = link.querySelector('.contact-orb');

  const WORDS_PULL = { x: 0.06, y: 0.1 };  // fraction of the cursor offset the words follow
  const ORB_PULL = 0.3;                    // the orb follows more
  const ORB_SWELL = 0.12;                  // up to +12% size at full pull
  const REACH = 1.15;                      // pull reaches ~1.15x the button's width

  // Smooth followers (GSAP quickTo: each call retargets the same tween)
  const follow = (el, prop, duration) => gsap.quickTo(el, prop, { duration, ease: 'power3.out' });
  const textX = follow(text, 'x', 0.9);
  const textY = follow(text, 'y', 0.9);
  const orbX = follow(orb, 'x', 0.6);
  const orbY = follow(orb, 'y', 0.6);
  // (quickTo needs scaleX/scaleY: it can't drive the combined 'scale')
  const orbScaleX = follow(orb, 'scaleX', 0.6);
  const orbScaleY = follow(orb, 'scaleY', 0.6);
  const orbScale = (v) => { orbScaleX(v); orbScaleY(v); };

  const smooth = (t) => t * t * (3 - 2 * t);

  section.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    // Measured from the button's resting box (its children move, it doesn't)
    const r = link.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const reach = Math.max(r.width, 360) * REACH;
    const pull = smooth(Math.max(0, 1 - Math.hypot(dx, dy) / reach));

    textX(dx * WORDS_PULL.x * pull);
    textY(dy * WORDS_PULL.y * pull);

    // The orb is pulled toward the cursor from its own resting centre
    const ox = e.clientX - (r.left + orb.offsetLeft + orb.offsetWidth / 2);
    const oy = e.clientY - (r.top + orb.offsetTop + orb.offsetHeight / 2);
    orbX(ox * ORB_PULL * pull);
    orbY(oy * ORB_PULL * pull);
    orbScale(1 + ORB_SWELL * pull);
  });

  const release = () => {
    textX(0); textY(0);
    orbX(0); orbY(0); orbScale(1);
  };
  section.addEventListener('pointerleave', release);
  window.addEventListener('blur', release);

  // ---------- Cursor ring: pulled onto the orb ----------
  // A thin chrome ring trails the cursor inside this section (the real
  // cursor stays visible). Near the orb the ring is drawn toward the orb's
  // centre, more strongly the closer it gets, and grows to wrap it.
  const RING = 36;               // px, the ring's own size (style.css)
  const LOCK_REACH = 3.2;        // the pull starts at ~3.2x the orb's radius
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  ring.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ring);

  const ringX = follow(ring, 'x', 0.35);
  const ringY = follow(ring, 'y', 0.35);
  const ringScaleX = follow(ring, 'scaleX', 0.45);
  const ringScaleY = follow(ring, 'scaleY', 0.45);
  const ringScale = (v) => { ringScaleX(v); ringScaleY(v); };
  const pointer = { x: 0, y: 0 };
  let ringActive = false;

  // Re-aimed every frame while showing, because the orb itself keeps
  // gliding (magnet) after the mouse stops: the ring tracks where the orb
  // actually is, not where it was at the last mouse move
  const aim = () => {
    const o = orb.getBoundingClientRect();   // includes the orb's own pull and swell
    const ocx = o.left + o.width / 2;
    const ocy = o.top + o.height / 2;
    const radius = o.width / 2;
    const d = Math.hypot(pointer.x - ocx, pointer.y - ocy);
    const lock = smooth(Math.min(1, Math.max(0, 1 - (d - radius) / (radius * (LOCK_REACH - 1)))));
    ringX(pointer.x + (ocx - pointer.x) * lock);
    ringY(pointer.y + (ocy - pointer.y) * lock);
    ringScale(1 + ((o.width + 16) / RING - 1) * lock);
    ring.classList.toggle('is-locked', lock > 0.6);
  };

  // ---------- Idle: the ring drifts over to "Let's talk" ----------
  // (A page can't move the real mouse pointer, so the ring does it.) When
  // the mouse rests in this section, an invisible "virtual pointer" glides
  // from the cursor to the orb; the ring follows it, the normal pull takes
  // over near the orb, and once there it docks and glows. Any real mouse
  // movement cancels it and the ring glides back to the cursor.
  const IDLE_MS = 1500;          // rest this long before the ring drifts
  let idleTimer = 0;
  let drift = null;
  const dock = () => {
    if (!ringActive) return;
    release();                   // the words and orb settle back to rest
    const o = orb.getBoundingClientRect();
    drift = gsap.to(pointer, {
      x: o.left + o.width / 2,
      y: o.top + o.height / 2,
      duration: 1.3,
      ease: 'power2.inOut',
      onComplete: () => ring.classList.add('is-docked'),
    });
  };
  const undock = () => {
    clearTimeout(idleTimer);
    if (drift) { drift.kill(); drift = null; }
    ring.classList.remove('is-docked');
  };

  section.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    undock();
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    idleTimer = setTimeout(dock, IDLE_MS);
    if (!ringActive) {
      // first appearance: start at the cursor instead of flying in from 0,0
      ringActive = true;
      gsap.set(ring, { x: pointer.x, y: pointer.y });
      ring.classList.add('is-on');
      gsap.ticker.add(aim);
    }
  });

  const hideRing = () => {
    undock();
    if (!ringActive) return;
    ringActive = false;
    gsap.ticker.remove(aim);
    ring.classList.remove('is-on', 'is-locked');
    ringScale(1);
  };
  section.addEventListener('pointerleave', hideRing);
  window.addEventListener('blur', hideRing);
  // The pop-up covers the page: hide the ring while it's open
  link.addEventListener('click', hideRing);
})();
