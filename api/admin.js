import { createClient } from "@supabase/supabase-js";
import { handle } from "./_admin.js";

const isJwt = (t) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t || "");
export const safeFetch = (fetchImpl) => (url, opts = {}) => {
  const headers = new Headers(opts.headers);
  const bearer = (headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (bearer && !isJwt(bearer)) headers.delete("Authorization");
  return fetchImpl(url, { ...opts, headers });
};

const admin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
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
