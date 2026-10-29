(() => {
  const config = window.ACTIPH_CONFIG || {};
  const isPreview = !config.entryEndpoint;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const easeOut = "cubic-bezier(0.23, 1, 0.32, 1)";
  const root = document.documentElement;

  const dialog = document.getElementById("entry");
  const form = dialog.querySelector(".entry__form");
  const done = dialog.querySelector(".entry__done");
  const doneTitle = done.querySelector(".entry__done-title");
  const doneText = done.querySelector(".entry__done-text");
  const status = form.querySelector(".entry__status");
  const submit = form.querySelector(".entry__submit");

  form.querySelector(".entry__preview").hidden = !isPreview;

  const ERRORS = {
    invalid_code: "We couldn't find that code. Check the sticker on your bottle and try again.",
    code_used: "That code has already been entered.",
    invalid_input: "Some details look wrong. Please check the form and try again.",
    captcha: "Please complete the security check and try again.",
    rate_limited: "Too many attempts. Please wait a few minutes and try again.",
    closed: "Entries for this promotion are now closed.",
    not_open: "Entries haven't opened yet.",
    network: "We couldn't reach the server. Check your connection and try again.",
    default: "Something went wrong. Please try again.",
  };

  // ---------- Campaign state: upcoming → open → closed ----------
  // boot.js sets the starting state on <html data-campaign>. These checks are
  // for display only; the backend enforces the same dates.

  const opensAt = Date.parse(config.opensAt);
  const closesAt = Date.parse(config.closesAt);
  const previewState = new URLSearchParams(location.search).get("preview");
  const campaign = () => root.dataset.campaign;
  const setCampaign = (state) => { root.dataset.campaign = state; };

  const malta = (ms, options) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Malta", ...options }).format(ms);
  const longDate = (ms) => malta(ms, { day: "numeric", month: "long", year: "numeric" });
  const time = (ms) => malta(ms, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  const NOTICES = {
    upcoming: {
      title: "Opening soon",
      text: `Entries open on ${longDate(opensAt)} at ${time(opensAt)} (Malta time). Keep your ActiPH bottle with its WIN sticker and come back then to enter your code.`,
    },
    closed: {
      title: "Competition closed",
      // closesAt is the first moment entries are refused, so show the day before it.
      text: `The ActiPH × HYROX UK competition closed on ${longDate(closesAt - 1000)}. Thank you to everyone who took part. Winners will be contacted directly by phone or email.`,
    },
  };

  const notice = document.getElementById("notice");
  function showNotice(kind) {
    const content = NOTICES[kind];
    if (!content || notice.open) return;
    if (dialog.open) dialog.close();
    notice.querySelector(".entry__title").textContent = content.title;
    notice.querySelector(".notice__text").textContent = content.text;
    window.actiphLenis?.stop();
    notice.showModal();
    notice.querySelector(".notice__ok").focus();
  }
  notice.querySelectorAll("[data-close-notice]").forEach((el) => el.addEventListener("click", () => notice.close()));
  notice.addEventListener("click", (event) => { if (event.target === notice) notice.close(); });
  notice.addEventListener("close", () => window.actiphLenis?.start());

  // Countdown until entries open.
  document.querySelector(".countdown__date").textContent = longDate(opensAt);
  const units = Object.fromEntries(
    [...document.querySelectorAll(".countdown__num")].map((el) => [el.dataset.unit, el])
  );
  const pad = (n) => String(n).padStart(2, "0");

  function tick() {
    const now = Date.now();
    if (campaign() === "upcoming") {
      const left = Math.max(0, Math.floor((opensAt - now) / 1000));
      units.days.textContent = pad(Math.floor(left / 86400));
      units.hours.textContent = pad(Math.floor(left / 3600) % 24);
      units.minutes.textContent = pad(Math.floor(left / 60) % 60);
      units.seconds.textContent = pad(left % 60);
      if (left === 0 && !previewState) setCampaign("open");
    } else if (campaign() === "open" && now >= closesAt && !previewState) {
      setCampaign("closed");
      showNotice("closed");
    }
    setTimeout(tick, 1000 - (now % 1000) + 5);  // next whole second
  }
  tick();

  // Tell visitors the competition is over, once per visit.
  if (campaign() === "closed") {
    let seen = false;
    try { seen = sessionStorage.getItem("actiph-closed-seen") === "1"; } catch {}
    if (!seen || previewState) showNotice("closed");
    try { sessionStorage.setItem("actiph-closed-seen", "1"); } catch {}
  }

  // ---------- Entry form: open / close ----------

  function openEntry() {
    if (campaign() !== "open") {
      showNotice(campaign());
      return;
    }
    if (dialog.open) return;
    showForm();
    window.actiphLenis?.stop();
    dialog.showModal();
    loadCaptcha();
    form.elements.code.focus();
  }

  function showForm() {
    done.hidden = true;
    form.hidden = false;
  }

  document.querySelectorAll("[data-open-entry]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      openEntry();
    });
  });

  dialog.querySelectorAll("[data-close-entry]").forEach((el) => {
    el.addEventListener("click", () => dialog.close());
  });

  // Clicking the dimmed backdrop closes the dialog.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    window.actiphLenis?.start();
    if (!done.hidden) {
      form.reset();
      showForm();
    }
    if (location.hash === "#enter") {
      history.replaceState(null, "", location.pathname + location.search);
    }
  });

  // Links and QR codes can point straight at the form: actiph.vjscl.com.mt/#enter
  if (location.hash === "#enter") openEntry();
  window.addEventListener("hashchange", () => {
    if (location.hash === "#enter") openEntry();
  });

  // ---------- Anti-bot check (Cloudflare Turnstile) ----------
  // Only used when a site key is set and the backend is connected.

  const captchaBox = form.querySelector(".entry__captcha");
  const useCaptcha = Boolean(config.turnstileSiteKey) && !isPreview;
  let captchaRequested = false;
  let captchaWidget = null;
  let captchaToken = "";

  function loadCaptcha() {
    if (!useCaptcha || captchaRequested) return;
    captchaRequested = true;
    captchaBox.hidden = false;
    const render = () => {
      captchaWidget = window.turnstile.render(captchaBox, {
        sitekey: config.turnstileSiteKey,
        theme: "light",
        callback: (token) => { captchaToken = token; },
        "expired-callback": () => { captchaToken = ""; },
        "error-callback": () => { captchaToken = ""; },
      });
    };
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }

  function resetCaptcha() {
    if (captchaWidget !== null) window.turnstile.reset(captchaWidget);
    captchaToken = "";
  }

  // ---------- Validation ----------

  const codeInput = form.elements.code;
  codeInput.addEventListener("input", () => {
    const start = codeInput.selectionStart;
    codeInput.value = codeInput.value.toUpperCase().replace(/\s+/g, "");
    codeInput.setSelectionRange(start, start);
  });

  const rules = {
    code: (v) => (/^[A-Z0-9-]{4,16}$/.test(v) ? "" : "Enter the code exactly as it appears on the sticker."),
    name: (v) => (v.length >= 2 ? "" : "Enter your full name."),
    email: (v, el) => (v && el.validity.valid && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Enter a valid email address."),
    phone: (v) => (v.replace(/\D/g, "").length >= 8 && /^[+\d\s()-]+$/.test(v) ? "" : "Enter a valid mobile number."),
    sport: (v) => (v ? "" : "Choose the sport or activity you practise."),
    sportOther: (v) => (form.elements.sport.value !== "Other" || v.length >= 2 ? "" : "Tell us which sport or activity."),
    terms: (_, el) => (el.checked ? "" : "Please confirm your age and accept the Terms & Conditions to enter."),
  };

  function setError(name, message) {
    const el = form.elements[name];
    el.setAttribute("aria-invalid", message ? "true" : "false");
    document.getElementById(`f-${name}-err`).textContent = message;
  }

  function validate() {
    let firstInvalid = null;
    for (const [name, rule] of Object.entries(rules)) {
      const el = form.elements[name];
      const message = rule(el.value.trim(), el);
      setError(name, message);
      if (message && !firstInvalid) firstInvalid = el;
    }
    return firstInvalid;
  }

  // "Other" reveals a text box for the sport.
  const sportOtherField = document.getElementById("f-sport-other-field");
  const toggleSportOther = () => {
    const isOther = form.elements.sport.value === "Other";
    sportOtherField.hidden = !isOther;
    if (!isOther) setError("sportOther", "");
  };
  form.elements.sport.addEventListener("change", toggleSportOther);
  form.addEventListener("reset", () => setTimeout(toggleSportOther));

  // Clear a field's error as soon as it's corrected.
  form.addEventListener("input", (event) => {
    const name = event.target.name;
    if (rules[name] && event.target.getAttribute("aria-invalid") === "true") {
      setError(name, rules[name](event.target.value.trim(), event.target));
    }
  });

  // ---------- Submit ----------

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";

    if (campaign() !== "open") {
      showNotice(campaign());
      return;
    }

    const firstInvalid = validate();
    if (firstInvalid) {
      firstInvalid.focus();
      shake(firstInvalid);
      return;
    }

    if (useCaptcha && !captchaToken) {
      status.textContent = ERRORS.captcha;
      return;
    }

    const data = {
      code: codeInput.value.trim(),
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      sport: form.elements.sport.value,
      sportOther: form.elements.sport.value === "Other" ? form.elements.sportOther.value.trim() : "",
      marketing: form.elements.marketing.checked,  // optional, unticked by default
      terms: true,
      website: form.elements.website.value, // honeypot: real people leave this empty
      turnstileToken: captchaToken,
    };

    submit.setAttribute("aria-busy", "true");
    submit.disabled = true;
    try {
      if (isPreview) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        showDone(
          "Preview only",
          "The form works, but this entry wasn't saved because the entry system isn't connected yet."
        );
      } else {
        const result = await send(data);
        if (result.ok) {
          const firstName = data.name.split(/\s+/)[0];
          showDone(
            "Code entered!",
            `Thanks, ${firstName}. Your code ${data.code} has been entered. Keep your receipt, bottle and sticker safe: you'll need all three to claim a prize.`
          );
        } else {
          status.textContent = ERRORS[result.error] || ERRORS.default;
          if (result.error === "invalid_code" || result.error === "code_used") {
            setError("code", " ");
            codeInput.focus();
            shake(codeInput);
          }
          if (result.error === "closed" && !previewState) setCampaign("closed");
        }
      }
    } finally {
      if (useCaptcha) resetCaptcha();  // each token is single-use
      submit.removeAttribute("aria-busy");
      submit.disabled = false;
    }
  });

  async function send(data) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(config.entryEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok) return { ok: true };
      return { ok: false, error: body.error || (response.status === 429 ? "rate_limited" : "default") };
    } catch {
      return { ok: false, error: "network" };
    } finally {
      clearTimeout(timer);
    }
  }

  // Crossfade form → confirmation. A little blur blends the two states.
  async function showDone(title, text) {
    doneTitle.textContent = title;
    doneText.textContent = text;
    if (!reduceMotion) {
      await form.animate(
        [{ opacity: 1, filter: "blur(0)" }, { opacity: 0, filter: "blur(4px)" }],
        { duration: 160, easing: "ease-out" }
      ).finished.catch(() => {});
    }
    form.hidden = true;
    done.hidden = false;
    done.focus();
    done.animate(
      reduceMotion
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: "translateY(8px)", filter: "blur(4px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
      { duration: 320, easing: easeOut }
    );
  }

  // Small horizontal shake to point at the field that needs attention.
  function shake(el) {
    if (reduceMotion) return;
    el.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(5px)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 320, easing: "ease-out" }
    );
  }
})();
