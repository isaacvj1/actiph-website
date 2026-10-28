// Site settings. Nothing in here is secret: everyone can read this file.
window.ACTIPH_CONFIG = {
  // Promotion window in Malta time (CET, UTC+1 in winter). Before opensAt the
  // page shows a countdown; from closesAt it shows a "closed" popup. The entry
  // backend enforces the same dates, so changing them here alone opens nothing.
  opensAt: "2026-12-01T00:00:00+01:00",
  closesAt: "2027-02-01T00:00:00+01:00",

  // URL the entry form POSTs to (the submit-entry function, see SECURITY.md).
  // Leave empty to run in preview mode: the form works but nothing is saved.
  entryEndpoint: "",

  // Cloudflare Turnstile site key (public). When set, the form shows the
  // anti-bot check and the backend rejects entries without a valid token.
  turnstileSiteKey: "",
};
