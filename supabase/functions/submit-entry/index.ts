// The only public way to write promotion data. Validates the request, checks
// Cloudflare Turnstile, hashes the IP and calls public.submit_entry() with the
// service role. Never returns database errors or personal data.
//
// Secrets (supabase secrets set ...):
//   ALLOWED_ORIGINS       comma-separated site origins allowed to call this
//   IP_HASH_SECRET        random string used to hash IP addresses (32+ chars)
//   TURNSTILE_SECRET_KEY  Cloudflare Turnstile secret key
//   TURNSTILE_HOSTNAMES   comma-separated hostnames the token must come from
//   ALLOW_NO_CAPTCHA      "true" only for local testing without Turnstile
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const IP_HASH_SECRET = Deno.env.get("IP_HASH_SECRET") ?? "";
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
const TURNSTILE_HOSTNAMES = (Deno.env.get("TURNSTILE_HOSTNAMES") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ALLOW_NO_CAPTCHA = Deno.env.get("ALLOW_NO_CAPTCHA") === "true";
const MAX_BODY_BYTES = 4096;

// Must match the <option>s in index.html.
const SPORTS = new Set([
  "Running", "Gym / Weight Training", "HYROX / Functional Fitness", "CrossFit",
  "Cycling", "Swimming", "Football", "Other Team Sport", "Yoga / Pilates",
  "Combat Sports", "Walking / Hiking", "Other",
]);

const STATUS: Record<string, number> = {
  ok: 200, invalid_input: 400, invalid_code: 400, captcha: 400, code_used: 409,
  not_open: 403, closed: 403, rate_limited: 429, default: 500,
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function corsHeaders(origin: string): Record<string, string> {
  if (!ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function reply(result: string, origin: string): Response {
  const body = result === "ok" ? { ok: true } : { ok: false, error: result };
  return new Response(JSON.stringify(body), {
    status: STATUS[result] ?? 500,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length <= max ? v.trim() : null;

// Mirrors the form's checks; the database checks again.
function parseEntry(raw: Record<string, unknown>) {
  const code = text(raw.code, 16)?.toUpperCase().replace(/\s+/g, "");
  const name = text(raw.name, 100);
  const email = text(raw.email, 150);
  const phone = text(raw.phone, 20);
  const sport = text(raw.sport, 60);
  const sportOther = text(raw.sportOther ?? "", 60);
  const ok =
    code && /^[A-Z0-9-]{4,16}$/.test(code) &&
    name && name.length >= 2 &&
    email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    phone && /^[+\d\s()-]+$/.test(phone) && phone.replace(/\D/g, "").length >= 8 &&
    sport && SPORTS.has(sport) &&
    sportOther !== null && (sport === "Other" ? sportOther.length >= 2 : sportOther === "") &&
    raw.terms === true &&
    raw.website === "";  // honeypot: real people never fill it in
  const marketing = raw.marketing === true;  // optional; anything but true means no
  return ok ? { code, name, email, phone, sport, sportOther, marketing } : null;
}

async function hashIp(ip: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(IP_HASH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function captchaPasses(token: unknown, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return ALLOW_NO_CAPTCHA;
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const data = await res.json();
    if (data.success !== true) return false;
    // Reject tokens solved on some other site.
    return TURNSTILE_HOSTNAMES.length === 0 || TURNSTILE_HOSTNAMES.includes(data.hostname);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: allowedOrigin ? 204 : 403, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST" || !allowedOrigin) return reply("invalid_input", origin);
  if (!IP_HASH_SECRET || IP_HASH_SECRET.length < 32) {
    console.error("submit-entry: IP_HASH_SECRET missing or too short");
    return reply("default", origin);  // fail closed
  }
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) {
    return reply("invalid_input", origin);
  }

  const bodyText = await req.text();
  if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES) return reply("invalid_input", origin);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(bodyText);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error();
  } catch {
    return reply("invalid_input", origin);
  }

  const entry = parseEntry(raw);
  if (!entry) return reply("invalid_input", origin);

  const ip = req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? "";
  if (!(await captchaPasses(raw.turnstileToken, ip))) return reply("captcha", origin);

  const { data, error } = await supabase.rpc("submit_entry", {
    p_code: entry.code,
    p_name: entry.name,
    p_email: entry.email,
    p_phone: entry.phone,
    p_sport: entry.sport,
    p_sport_other: entry.sportOther,
    p_ip_hash: await hashIp(ip),
    p_marketing: entry.marketing,
  });
  if (error) {
    console.error("submit-entry: database error", error.code);  // no personal data in logs
    return reply("default", origin);
  }
  return reply(typeof data === "string" && data in STATUS ? data : "default", origin);
});
