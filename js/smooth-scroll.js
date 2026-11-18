/* =========================================================
   Smooth scrolling (Lenis), kept in sync with GSAP ScrollTrigger
   - Skipped entirely for visitors who prefer reduced motion.
   - In-page links (#projects, #about ...) glide via Lenis, except when the
     trip would cross the pinned laptop showcase: gliding through it would
     fast-forward the whole animation, so instead the page dims, jumps,
     and fades back in.
   - Scrolling is paused while the contact pop-up is open.
   ========================================================= */
(() => {
  if (!window.Lenis || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  window.lenis = lenis;

  // Hold scrolling while the preloader covers the page
  if (document.documentElement.classList.contains('is-loading')) {
    lenis.stop();
    document.addEventListener('preloader:done', () => lenis.start(), { once: true });
  }

  if (window.gsap && window.ScrollTrigger) {
    // One clock for both: GSAP's ticker drives Lenis, Lenis updates ScrollTrigger
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  // ---------- Fade-and-jump across the showcase ----------
  const showcase = document.querySelector('.showcase');
  const fade = document.body.appendChild(document.createElement('div'));
  fade.className = 'page-fade';
  fade.setAttribute('aria-hidden', 'true');
  const FADE_MS = 280;

  // Would scrolling from `from` to `to` pass through more than one screen
  // of the pinned showcase?
  const crossesShowcase = (from, to) => {
    if (!showcase || !document.documentElement.classList.contains('has-showcase')) return false;
    const top = showcase.getBoundingClientRect().top + window.scrollY;
    const end = top + showcase.offsetHeight - window.innerHeight;
    const overlap = Math.min(Math.max(from, to), end) - Math.max(Math.min(from, to), top);
    return overlap > window.innerHeight;
  };

  let jumping = false;
  const jumpTo = (target) => {
    if (jumping) return;
    jumping = true;
    fade.classList.add('is-on');
    setTimeout(() => {
      lenis.scrollTo(target, { immediate: true, force: true });
      // Let ScrollTrigger see the new position, then finish the showcase's
      // scrub instantly so it doesn't replay frames behind the fade
      requestAnimationFrame(() => {
        if (window.ScrollTrigger) ScrollTrigger.update();
        if (window.showcaseSync) window.showcaseSync();
        requestAnimationFrame(() => {
          fade.classList.remove('is-on');
          jumping = false;
        });
      });
    }, FADE_MS);
  };

  // In-page anchor links
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;   // e.g. "Contact" opens the pop-up instead
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    const target = hash === '#' ? null : document.querySelector(hash);
    if (!target) return;
    e.preventDefault();
    const to = target.getBoundingClientRect().top + window.scrollY;
    if (crossesShowcase(window.scrollY, to)) jumpTo(target);
    else lenis.scrollTo(target, { duration: 1.4 });
  });

  // Pause scrolling whenever the contact dialog is open, however it opened
  const dialog = document.getElementById('contact-dialog');
  if (dialog) {
    new MutationObserver(() => (dialog.open ? lenis.stop() : lenis.start()))
      .observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }
})();
