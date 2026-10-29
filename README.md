# ActiPH × HYROX UK campaign site

One-page promotion site for the ActiPH sticker campaign (6 winners: AirPods 5, HYROX UK tickets, 3 months of ActiPH). Built from the Figma file [ActipH Website](https://www.figma.com/design/OAFRFJI9S23qvPBKIXjNTx/ActipH-Website), frame "Frame 1".

It's plain HTML, CSS and JavaScript with no build step, so it can be hosted anywhere that serves static files (GitHub Pages, Vercel, Netlify, or a regular web host).

## Structure

```
index.html            the campaign page
terms.html            Terms & Conditions and Privacy Notice (draft; highlighted items to confirm)
404.html              shown for any address that doesn't exist
robots.txt, sitemap.xml  for search engines (take effect at the real domain)
favicon.ico           browser tab icon (more sizes in assets/img)
_config.yml           tells GitHub Pages to publish only the website, not the project files
assets/css/styles.css all styles
assets/css/fonts-inline.css  Pragmatica inlined, loaded only when the page is opened from disk
assets/js/config.js   competition dates, entry endpoint and Turnstile site key (all public)
assets/js/boot.js     runs before first paint: campaign state, file:// fonts, intro styles
assets/js/main.js     countdown, closed popup and entry form
assets/js/motion.js   smooth scrolling, hero intro and scroll animations
assets/vendor/        GSAP 3.15.0 + ScrollTrigger (GSAP standard licence), Lenis 1.3.26 (MIT)
assets/img/           web-optimised images generated from Figma exports
assets/fonts/         Pragmatica web fonts (WOFF2, Latin subset)
figma-assets/         original Figma exports (only manifest.json is committed)
scripts/build-assets.sh  regenerates assets/img (including the favicons) and assets/fonts
scripts/social-card.html source of assets/img/social-card.jpg, the image shown when the link is shared
supabase/             entry backend: database migration and the submit-entry function
SECURITY.md           how entrants' data is protected, what was tested, launch checklist
_headers              security headers for the production host
```

## Competition dates

The dates are in `assets/js/config.js` and, for the server, in `promo.settings` (see the migration). Before `opensAt` (1 December 2026, 00:00 Malta time) the hero shows a countdown instead of Enter Code. From `closesAt` (1 February 2027, 00:00) it shows "Competition closed" and a popup, once per visit. The page switches between states on its own while it's open.

To review a state before its date, add `?preview=upcoming`, `?preview=open` or `?preview=closed` to the URL. This changes only what the page shows; the server still enforces the real dates.

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

## Hero model

The model is Figma's "Mask group" 37:15: the photo `claire azzopardi-39 1` (node 37:2) clipped to Rectangle 22 and faded out by Rectangle 21's gradient. Figma's PNG export of the group flattens the transparent areas onto grey, so `build-assets.sh` applies the same masks itself (positions and gradient stops are noted in the script) to `figma-assets/hero-model-photo.png`. If the designer moves the photo or changes either mask, update those numbers in the script; if only the photo changes, re-export node 37:2 and rebuild.

## Connecting the entry backend

The "Enter Code" form runs in **preview mode** until `entryEndpoint` is set in `assets/js/config.js`: it validates input and shows a confirmation screen, but saves nothing.

The backend is in `supabase/`: a database migration and the `submit-entry` Edge Function. `SECURITY.md` explains how it protects the data and lists the deployment steps.

The form sends `POST <entryEndpoint>` with this JSON body:

```json
{ "code": "AB12C", "name": "Maria Borg", "email": "maria@example.com", "phone": "+356 9912 3456",
  "sport": "Running", "sportOther": "", "marketing": false, "terms": true, "website": "", "turnstileToken": "..." }
```

`sport` is one of the dropdown options in `index.html` (the function has the same list). When it is `"Other"`, `sportOther` holds what the person typed; otherwise it is empty. `marketing` is the optional, unticked-by-default consent to ActiPH news and offers. `website` is a hidden honeypot field.

The function answers `{ "ok": true }` or `{ "ok": false, "error": "<reason>" }`, where `<reason>` is one of `invalid_code`, `code_used`, `invalid_input`, `captcha`, `rate_limited`, `not_open`, `closed` or `default`.

To run the backend locally (needs Docker and the Supabase CLI): `supabase start`, add test codes to `promo.codes`, put `ALLOWED_ORIGINS`, `IP_HASH_SECRET` and `ALLOW_NO_CAPTCHA=true` in `supabase/functions/.env.local`, then `supabase functions serve --env-file supabase/functions/.env.local`. The local ports are 554xx so they don't clash with other local Supabase projects.

## Before launch

- Point the domain printed on the stickers, `actiph.vjscl.com.mt`, at the host. It doesn't resolve yet, so anyone typing it from a sticker today gets an error.
- Swap the preview address for the real one in the canonical links, share-image links, 404 page, robots.txt and sitemap:
  ```sh
  grep -rl 'https://isaacvj1.github.io/actiph-website/' index.html terms.html 404.html robots.txt sitemap.xml \
    | xargs sed -i '' 's#https://isaacvj1.github.io/actiph-website/#https://actiph.vjscl.com.mt/#g'
  ```
- Follow the launch checklist in `SECURITY.md` (Supabase project, codes, Turnstile, secrets, hosting with security headers).
- Confirm every highlighted item in `terms.html` (`<mark class="tbc">`), then remove the highlights and the draft notice. Have the Terms and Privacy Notice reviewed legally before launch.
- Confirm VJSCL's Pragmatica licence covers web use. ParaType sells web licences separately from desktop licences.
- Confirm the licence for the Getty image used on the HYROX tickets card covers web use.
