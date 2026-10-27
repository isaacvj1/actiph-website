(() => {
  const config = window.ACTIPH_CONFIG || {};
  const isPreview = !config.entryEndpoint;

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
    rate_limited: "Too many attempts. Please wait a few minutes and try again.",
    closed: "Entries for this promotion are now closed.",
    network: "We couldn't reach the server. Check your connection and try again.",
    default: "Something went wrong. Please try again.",
  };

  // ---------- Open / close ----------

  function openEntry() {
    if (dialog.open) return;
    showForm();
    dialog.showModal();
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
    terms: (_, el) => (el.checked ? "" : "Please accept the Terms & Conditions to enter."),
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

    const firstInvalid = validate();
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const data = {
      code: codeInput.value.trim(),
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      terms: true,
      website: form.elements.website.value, // honeypot: real people leave this empty
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
          }
        }
      }
    } finally {
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
        headers: { "Content-Type": "application/json", ...(config.entryHeaders || {}) },
        body: JSON.stringify(data),
        signal: controller.signal,
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

  function showDone(title, text) {
    doneTitle.textContent = title;
    doneText.textContent = text;
    form.hidden = true;
    done.hidden = false;
    done.focus();
  }
})();
