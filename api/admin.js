import { createClient } from "@supabase/supabase-js";
import { handle } from "./_admin.js";

// The new secret keys (sb_secret_...) are not JWTs. Some supabase-js versions also send the key in the
// "Authorization: Bearer" header, and Supabase then rejects it ("Invalid JWT"). This wrapper drops the
// Authorization header when it does not hold a real JWT, so only the "apikey" header carries the key.
// User tokens (real JWTs, used by auth.getUser) are left untouched.
const isJwt = (t) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t || "");
export const safeFetch = (fetchImpl) => (url, opts = {}) => {
  const headers = new Headers(opts.headers);
  const bearer = (headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (bearer && !isJwt(bearer)) headers.delete("Authorization");
  return fetchImpl(url, { ...opts, headers });
};

const admin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // secret key (sb_secret_...) or the legacy service_role key: server only
  { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: safeFetch(fetch) } },
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const r = await handle(req.body, req.headers.authorization, { admin });
    res.status(r.status).json(r.body);
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
}
