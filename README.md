# ActiPH × HYROX UK campaign site

One-page promotion site for the ActiPH sticker campaign (6 winners: AirPods 5, HYROX UK tickets, 3 months of ActiPH). Built from the Figma file [ActipH Website](https://www.figma.com/design/OAFRFJI9S23qvPBKIXjNTx/ActipH-Website), frame "Frame 1".

It's plain HTML, CSS and JavaScript with no build step, so it can be hosted anywhere that serves static files (GitHub Pages, Vercel, Netlify, or a regular web host).

## Structure

```
index.html            the campaign page
terms.html            Terms & Conditions (placeholder until the approved text is supplied)
assets/css/styles.css all styles
assets/css/fonts-inline.css  Pragmatica inlined, loaded only when the page is opened from disk
assets/js/config.js   entry backend settings
assets/js/main.js     entry form behaviour
assets/js/motion.js   smooth scrolling, hero intro and scroll animations
assets/vendor/        GSAP 3.15.0 + ScrollTrigger (GSAP standard licence), Lenis 1.3.26 (MIT)
assets/img/           web-optimised images generated from Figma exports
assets/fonts/         Pragmatica web fonts (WOFF2, Latin subset)
figma-assets/         original Figma exports (only manifest.json is committed)
scripts/build-assets.sh  regenerates assets/img and assets/fonts
```

## Preview locally

```sh
python3 -m http.server 8765
```

Then open http://localhost:8765. Opening `index.html` straight from disk also works: browsers block font files on `file://` pages, so the page loads `fonts-inline.css` instead in that case.

## Motion

- Smooth scrolling uses Lenis on mouse wheels and trackpads; touch devices keep their native scrolling.
- The hero plays a one-off intro (under 2 seconds). Sections below animate in once as they scroll into view, and the model and track photos have subtle parallax.
- Only `transform`, `opacity` and one `clip-path` wipe are animated. Easing is a strong ease-out (`expo.out` in GSAP, `cubic-bezier(0.23, 1, 0.32, 1)` in CSS).
- With "reduce motion" turned on in the operating system, smooth scrolling, movement and parallax are off and sections just fade in.
- If the scripts fail to load, the hero still appears after 3 seconds and the rest of the page is visible as normal.

## Responsive behaviour

Desktop matches the Figma frame: the content column is 1342px wide at 1920px screens and scales down proportionally (every measurement is `calc(N * var(--u))`, where `--u` is one Figma pixel of the current column width). Text and buttons have minimum sizes, so they stay readable and tappable on phones. Below a 640px column width, the prizes, steps and bottom buttons stack into a single column.

## Updating assets from Figma

The designer is still working on the file. When something changes:

1. Re-export the changed layer from Figma into `figma-assets/` with the same file name. `figma-assets/manifest.json` lists the Figma node each file comes from.
2. Run `./scripts/build-assets.sh`. It needs `cwebp` (`brew install webp`), Python with `fonttools` and `brotli`, and the Pragmatica fonts installed in `~/Library/Fonts`.

## Hero grain

The model photo has a Figma Noise effect (grain) on its mask group. Figma's PNG export of that group flattens the transparent areas onto grey, so `figma-assets/hero-group.png` is rendered locally instead from Figma's SVG export of the group (`figma-assets/hero-group.svg`, which holds the fade mask and the noise filter) with the original photo put back in:

1. Re-export `hero-photo.png` (node 2:98) and `hero-group.svg` (node 2:101, SVG) from Figma if they changed.
2. Serve the project (`python3 -m http.server 8765`) and open `scripts/render-hero-group.html` in a browser window of exactly 1341 × 1994 at a device pixel ratio of 2.25.
3. Screenshot the `<svg>` with a transparent background and scale it down to 1341 × 1994 with a box filter. Rendering at 2.25× matches the grain strength Figma shows; at 1× the browser draws the noise much harder.
4. Save it as `figma-assets/hero-group.png` and run `./scripts/build-assets.sh`.

## Connecting the entry backend

The "Enter Code" form currently runs in **preview mode**: it validates input and shows a confirmation screen, but saves nothing. To go live, set `entryEndpoint` (and any `entryHeaders`, such as an API key) in `assets/js/config.js`.

The form sends `POST <entryEndpoint>` with this JSON body:

```json
{ "code": "AB12C", "name": "Maria Borg", "email": "maria@example.com", "phone": "+356 9912 3456",
  "sport": "Running", "sportOther": "", "terms": true, "website": "" }
```

`sport` is one of the dropdown options in `index.html`. When it is `"Other"`, `sportOther` holds what the person typed; otherwise it is empty.

The backend must respond with JSON:

- `{ "ok": true }` when the entry is accepted
- `{ "ok": false, "error": "<reason>" }` otherwise, where `<reason>` is one of `invalid_code`, `code_used`, `invalid_input`, `rate_limited` or `closed` (anything else shows a generic error)

The backend must:

- check the code against the list of codes printed on the stickers (case-insensitive) and mark it used in the same transaction, so a code can only be entered once
- never send the code list to the browser
- reject the request if the `website` honeypot field is not empty
- rate-limit attempts per IP address, because short codes can otherwise be guessed by trial and error
- store each entry with a timestamp, so entries can be exported for the draw or prize claims
- allow the site's domain via CORS

## Before launch

- Replace the placeholder in `terms.html` with the approved T&Cs and a privacy notice (the form collects personal data).
- Confirm VJSCL's Pragmatica licence covers web use. ParaType sells web licences separately from desktop licences.
- Confirm the licence for the Getty image used on the HYROX tickets card covers web use.
