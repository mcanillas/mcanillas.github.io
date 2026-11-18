/* =========================================================
   Smooth scrolling (Lenis), kept in sync with GSAP ScrollTrigger
   - Skipped entirely for visitors who prefer reduced motion.
   - In-page links (#projects, #about ...) glide via Lenis, except when the
     trip would cross the pinned laptop showcase: gliding through it would
     fast-forward the whole animation, so instead the page dims, jumps,
     and fades back in. "Back to top" does a slower, calmer version that
     glides the last stretch as the page fades back in.
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

  // Options (all optional; the defaults are the quick version):
  //   out / hold / in  fade-out, time held dark, fade-in (ms)
  //   settle           land this many px below the target, then glide the
  //                    rest of the way as the page fades back in
  //   glide            how long that final glide takes (s)
  //   fadeEase         timing curve for both fades (default: the site's ease)
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  let jumping = false;
  const jumpTo = (target, opts = {}) => {
    if (jumping) return;
    const { out = FADE_MS, hold = 0, in: fadeIn = FADE_MS, settle = 0, glide = 1.6, fadeEase = '' } = opts;
    jumping = true;
    fade.style.transitionTimingFunction = fadeEase;
    fade.style.transitionDuration = `${out}ms`;
    fade.classList.add('is-on');
    setTimeout(() => {
      const y = target.getBoundingClientRect().top + window.scrollY;
      lenis.scrollTo(y + settle, { immediate: true, force: true });
      // Let ScrollTrigger see the new position, then finish the showcase's
      // scrub instantly so it doesn't replay frames behind the fade
      requestAnimationFrame(() => {
        if (window.ScrollTrigger) ScrollTrigger.update();
        if (window.showcaseSync) window.showcaseSync();
        requestAnimationFrame(() => {
          fade.style.transitionDuration = `${fadeIn}ms`;
          fade.classList.remove('is-on');
          if (settle) lenis.scrollTo(y, { duration: glide, easing: easeOutCubic, force: true });
          setTimeout(() => {
            fade.style.transitionDuration = '';
            fade.style.transitionTimingFunction = '';
            jumping = false;
          }, fadeIn);
        });
      });
    }, out + hold);
  };

  // "Back to top" takes its time: a slow fade to black, a short hold, then
  // the page fades back in while gliding the last stretch up to the top
  const TOP_JUMP = { out: 650, hold: 150, in: 900, glide: 1.8, fadeEase: 'cubic-bezier(0.45, 0, 0.55, 1)' };
  const TOP_GLIDE = 2.2;   // s, when the top is near enough to just glide

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
    const toTop = hash === '#top';
    if (crossesShowcase(window.scrollY, to)) {
      // (the settle stretch stays inside the hero, above any pinned section)
      jumpTo(target, toTop ? { ...TOP_JUMP, settle: Math.round(window.innerHeight * 0.55) } : {});
    } else {
      lenis.scrollTo(target, toTop
        ? { duration: TOP_GLIDE, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) }
        : { duration: 1.4 });
    }
  });

  // Pause scrolling whenever the contact dialog is open, however it opened
  const dialog = document.getElementById('contact-dialog');
  if (dialog) {
    new MutationObserver(() => (dialog.open ? lenis.stop() : lenis.start()))
      .observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }
})();
