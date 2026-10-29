# Security: ActiPH × HYROX UK promotion

How entrants' personal data is protected, what was tested, and what has to be done before launch.

## In short

- The website itself holds no data and no secrets. It is plain files, and it can only load its own files plus Cloudflare's anti-bot check.
- Entries go to a database in a private area that the internet cannot reach. The public key that the website uses cannot read, list or change anything in it, not even the sticker codes.
- The only way in is one server function. It accepts nothing but a well-formed entry from the promotion's own website during the competition dates. It also has to pass Cloudflare's anti-bot check and stay within strict attempt limits.
- Only VJSCL staff with Supabase accounts (two-factor login required) can see entries, through the Supabase dashboard.
- Data is stored in the EU, raw IP addresses are never stored, and entries are deleted automatically after the retention period.

## How it fits together

```
Visitor's browser ──HTTPS──▶ Website (static files)
        │
        └─ entry form ──HTTPS──▶ submit-entry function (Supabase Edge Function)
                                   │  origin, size and field checks, Turnstile, IP hashing
                                   ▼
                                 public.submit_entry()  (only the function's service role may call it)
                                   │  dates, rate limits, claims the code once
                                   ▼
                                 promo schema: codes, entries, attempts, settings
                                 (not exposed to the API; RLS on, no policies)

VJSCL staff ──Supabase dashboard (2FA)──▶ promo.entries  (read, export for the draw)
```

## Controls

### Website
- Content-Security-Policy on both pages. Scripts, styles, fonts and images can come only from the site itself. Cloudflare Turnstile and the Supabase endpoint are the only outside sources. There are no inline scripts and no third-party tracking.
- Referrer policy `strict-origin-when-cross-origin`. Entry requests are sent with no cookies and no referrer.
- `config.js` holds only public values: the dates, the endpoint URL and the Turnstile site key.
- The countdown and closed popup are only for show. The server enforces the dates.
- GitHub Pages can't send security headers such as HSTS or clickjacking protection. For launch, use a host that applies the `_headers` file in this repo (Cloudflare Pages or Netlify), or put Cloudflare in front.

### Entry function (`supabase/functions/submit-entry`)
- Accepts only `POST` with JSON, at most 4 KB, from the origins in `ALLOWED_ORIGINS`.
- Checks every field again on the server: formats, lengths, the sport list, accepted terms. A hidden "honeypot" field catches simple bots.
- Requires a valid Cloudflare Turnstile token, optionally pinned to the promotion's hostnames, so each attempt has to pass a human check.
- Hashes the visitor's IP address with a secret key (HMAC-SHA256) and never stores the raw address.
- **Fails closed.** If its secrets are missing, it rejects every entry instead of running unprotected.
- Returns only a short result code. It never returns database errors, and it logs no personal data.

### Database (`supabase/migrations`)
- All data is in the `promo` schema. The public API doesn't expose it, and the `anon` and `authenticated` roles have no access to it at all.
- Row Level Security is on for every table with no policies, so even a mistaken grant returns nothing.
- `public.submit_entry()` is the single door in. It is `SECURITY DEFINER` with a fixed `search_path`, and only `service_role` can run it.
- Each code can be claimed exactly once, even when many people enter it at the same moment.
- Code-guessing limits:
  - per device: 5 wrong codes in 15 minutes, or 40 attempts in a day;
  - site-wide: 300 wrong codes in 10 minutes. This applies because IP addresses can be faked.
  - The limits live in `promo.settings`.
- New objects in the public schema are not exposed automatically (`auto_expose_new_tables = false`).
- Retention:
  - a nightly job deletes entries 6 months after closing, unless they won or agreed to marketing;
  - people who agreed to marketing are kept until they unsubscribe. Their entry records the tick-box wording they saw and when they agreed, as proof of consent;
  - it deletes attempt records after 30 days.

## Tested (locally, 28 Oct 2026)

| Attack or check | Result |
| --- | --- |
| Normal entry, then the same code again | Saved once, then "already entered" |
| Unknown code | Rejected |
| Hidden bot field filled, sport not in list, terms not accepted, 6 KB body, non-JSON, GET | All rejected before reaching the database |
| SQL injection in the name | Stored as plain text; tables unharmed |
| Request from another website | Refused (preflight 403, request 400) |
| Read entries or codes with the public key; call the claim function directly | Not found / schema not exposed / permission denied |
| 6 wrong codes from one device | Locked out after 5; its real codes are refused too until the lockout ends |
| Wrong codes from many faked IPs | Site-wide brake stops them once the limit is reached |
| 10 people claim one code at the same moment | Exactly 1 succeeds |
| Entry before opening or after closing | Rejected by the server |
| Missing, bad, or other-site Turnstile token | Rejected |
| IP-hash secret or Turnstile key missing | Function refuses everything |
| Stored data | No raw IPs; IP hashes are 64-character HMACs |
| Full entry through the website form | Saved correctly, with the confirmation shown |

## Before launch

1. **Supabase project.**
   - Create it in an EU region (e.g. Frankfurt).
   - In the organisation settings, require two-factor login for every member.
   - Invite only the VJSCL staff who need entry data. Use a read-only role where the plan allows it.
2. **Database.**
   - Run `supabase link --project-ref <ref>`, then `supabase db push`.
   - In the dashboard's project settings, check that only `public` and `graphql_public` are exposed.
3. **Sticker codes.** Import them into `promo.codes`, for example with `\copy promo.codes (code) from 'codes.csv' with (format csv)`. Keep the code list out of email and shared drives, and delete local copies afterwards.
4. **Cloudflare Turnstile.** Create a widget for `actiph.vjscl.com.mt` (and the preview domain while it's in use) to get a site key and a secret key.
5. **Secrets.** Never put these in the repo:
   ```
   supabase secrets set \
     ALLOWED_ORIGINS=https://actiph.vjscl.com.mt \
     TURNSTILE_HOSTNAMES=actiph.vjscl.com.mt \
     TURNSTILE_SECRET_KEY=<from Cloudflare> \
     IP_HASH_SECRET=$(openssl rand -base64 48)
   ```
6. **Deploy the function.** Run `supabase functions deploy submit-entry --no-verify-jwt`.
7. **Website settings.** In `assets/js/config.js`, set:
   - `entryEndpoint` to `https://<ref>.supabase.co/functions/v1/submit-entry`
   - `turnstileSiteKey` to the Cloudflare site key.
8. **Hosting.** Serve the site where the `_headers` file applies, point `actiph.vjscl.com.mt` at it, and remove the `noindex` tags.
9. **Check in production:**
   - make one test entry, then delete it;
   - confirm two different devices get different `ip_hash` values in `promo.attempts`;
   - confirm a request from another origin is refused.
10. **Sticker codes.** If they aren't printed yet, use at least 8 random characters. With 5 characters there are about 60 million possible codes, which makes guessing more practical than it should be.

Never share the service role key, the database password or `IP_HASH_SECRET`. If one leaks, rotate it in Supabase straight away.
