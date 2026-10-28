// Runs before the page is drawn (loaded without defer), so the right campaign
// state and intro styles apply on the first paint. No inline scripts, so the
// Content-Security-Policy can stay strict.
(function (d) {
  var root = d.documentElement;
  var config = window.ACTIPH_CONFIG || {};

  // Fonts can't load from disk (file://), so use the inlined copy there.
  if (location.protocol === "file:") {
    var link = d.createElement("link");
    link.rel = "stylesheet";
    link.href = "assets/css/fonts-inline.css";
    d.head.appendChild(link);
  }

  // Campaign state: "upcoming", "open" or "closed". ?preview=<state> lets
  // reviewers see each state; it only changes what the page shows.
  var now = Date.now();
  var state = now < Date.parse(config.opensAt) ? "upcoming"
    : now < Date.parse(config.closesAt) ? "open"
    : "closed";
  var preview = new URLSearchParams(location.search).get("preview");
  if (preview === "upcoming" || preview === "open" || preview === "closed") state = preview;
  root.dataset.campaign = state;

  // Hide the hero until the intro animation starts; never longer than 3s.
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("intro-pending");
    setTimeout(function () { root.classList.remove("intro-pending"); }, 3000);
  }
})(document);
