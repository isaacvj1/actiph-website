// Smooth scrolling, hero intro and scroll animations.
// Needs GSAP + ScrollTrigger; Lenis is optional. Only transform and opacity
// (plus a clip-path wipe) are animated, so everything stays on the GPU.
(() => {
  const root = document.documentElement;
  const { gsap, ScrollTrigger, Lenis } = window;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const showHero = () => root.classList.remove("intro-pending");

  if (!gsap || !ScrollTrigger) {
    showHero();
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  // Figma pixels at the current column width (same as --u in the CSS).
  const frame = document.querySelector(".frame");
  const u = (n) => (n * frame.clientWidth) / 1342;

  // ---------- Smooth scrolling ----------

  let lenis = null;
  if (Lenis && !reduceMotion) {
    lenis = new Lenis({ lerp: 0.1, anchors: false, autoRaf: false });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  window.actiphLenis = lenis;

  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const heroTitle = document.getElementById("hero-title");

  document.querySelectorAll('a[href="#top"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const focusTop = () => heroTitle.focus({ preventScroll: true });
      if (lenis) {
        lenis.scrollTo(0, { duration: 1.4, easing: easeInOutCubic, onComplete: focusTop });
      } else {
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        focusTop();
      }
    });
  });

  document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener("load", () => ScrollTrigger.refresh());

  // ---------- Reduced motion: gentle fades only ----------

  if (reduceMotion) {
    showHero();
    gsap.utils.toArray(".prizes, .how, .actions").forEach((el) => {
      gsap.from(el, { opacity: 0, duration: 0.4, ease: "none", scrollTrigger: { trigger: el, start: "top 90%", once: true } });
    });
    return;
  }

  const ease = "expo.out";

  // ---------- Hero intro (once, on load) ----------

  // Skip it if the 3s failsafe in index.html already revealed the hero.
  if (root.classList.contains("intro-pending")) {
    gsap.timeline({ defaults: { ease, duration: 1 } })
      .from(".hero__photo", { opacity: 0, scale: 1.06, transformOrigin: "50% 40%", duration: 1.8 }, 0)
      .from(".hero__header > *", { opacity: 0, y: -14, stagger: 0.08, duration: 0.9 }, 0.15)
      .from(".hero__win > span", { opacity: 0, yPercent: 30, filter: "blur(12px)", stagger: 0.09, duration: 1.1, clearProps: "filter" }, 0.3)
      .from(".hero__winners", { opacity: 0, y: 16, scale: 0.96, duration: 0.8 }, 0.65)
      .from(".hero__prizes li", { opacity: 0, y: 12, stagger: 0.07, duration: 0.8 }, 0.75)
      .from(".hero__cta-wrap", { opacity: 0, y: 16, scale: 0.95, duration: 0.8 }, 0.95)
      .from(".hero__bottle", { opacity: 0, xPercent: 12, rotation: 3, duration: 1.6 }, 0.6);
    showHero();
  }

  // ---------- Scroll depth ----------

  const scrub = (trigger, start = "top bottom", end = "bottom top") =>
    ({ trigger, start, end, scrub: true, invalidateOnRefresh: true });

  // The model drifts slower than the page; the bottle rolls slightly left.
  gsap.to(".hero__photo", { y: () => u(200), ease: "none", scrollTrigger: scrub(".hero", "top top") });
  gsap.fromTo(".hero__bottle", { x: () => u(40) }, { x: () => u(-40), ease: "none", scrollTrigger: scrub(".hero__bottle") });

  // Track photo moves inside its fade mask (the image has room above and below).
  gsap.fromTo(".track img", { y: () => u(-110) }, { y: () => u(110), ease: "none", scrollTrigger: scrub(".track") });

  // ---------- Prizes ----------

  gsap.timeline({ defaults: { ease }, scrollTrigger: { trigger: ".prizes__title", start: "top 88%", once: true } })
    .from(".prizes__title", { opacity: 0, y: 30, duration: 1 })
    .fromTo(".won", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9, clearProps: "clipPath" }, 0.3);

  gsap.set(".prize", { opacity: 0, y: () => Math.max(u(90), 32) });
  ScrollTrigger.batch(".prize", {
    start: "top 88%",
    once: true,
    onEnter: (items) => gsap.to(items, { opacity: 1, y: 0, stagger: 0.12, duration: 1.2, ease }),
  });

  const airpods = document.querySelector(".prize__card--airpods img");
  gsap.from(airpods, {
    opacity: 0,
    yPercent: 14,
    rotation: -12,
    scale: 0.85,
    duration: 1.4,
    delay: 0.3,
    ease,
    clearProps: "transform",
    scrollTrigger: { trigger: ".prize__card--airpods", start: "top 88%", once: true },
    onComplete: () => airpods.classList.add("is-floating"),
  });

  // ---------- How to enter ----------

  // The bottle stands up as it scrolls in, then the WIN sticker slaps on.
  gsap.fromTo(".bottle",
    { y: () => u(160), rotation: -8, scale: 0.92 },
    { y: 0, rotation: 0, scale: 1, ease: "none", scrollTrigger: { trigger: ".how", start: "top bottom", end: "top 30%", scrub: 0.6, invalidateOnRefresh: true } });

  gsap.from(".sticker", {
    opacity: 0,
    scale: 1.4,
    rotation: -20,
    duration: 0.6,
    ease: "back.out(1.5)",
    scrollTrigger: { trigger: ".bottle", start: "top 40%", once: true },
  });

  gsap.from(".how__title", { opacity: 0, y: 20, duration: 0.9, ease, scrollTrigger: { trigger: ".how__title", start: "top 90%", once: true } });

  gsap.set(".step__badge", { opacity: 0, scale: 0.75 });
  // Inner span: the outer .step__num is centred with CSS `translate`, which GSAP would override.
  gsap.set(".step__num > span", { opacity: 0, x: -24 });
  gsap.set(".step__text", { opacity: 0, y: 14 });
  ScrollTrigger.batch(".step", {
    start: "top 88%",
    once: true,
    onEnter: (steps) => {
      const pick = (sel) => steps.map((step) => step.querySelector(sel));
      gsap.timeline({ defaults: { ease, stagger: 0.12 } })
        .to(pick(".step__badge"), { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.4)" }, 0)
        .to(pick(".step__num > span"), { opacity: 1, x: 0, duration: 0.9 }, 0.12)
        .to(pick(".step__text"), { opacity: 1, y: 0, duration: 0.8 }, 0.2);
    },
  });

  gsap.from(".how__note", { opacity: 0, y: 10, duration: 0.9, ease, scrollTrigger: { trigger: ".how__note", start: "top 95%", once: true } });
  gsap.from(".actions", { opacity: 0, y: 24, duration: 0.9, ease, scrollTrigger: { trigger: ".actions", start: "top 95%", once: true } });
})();
