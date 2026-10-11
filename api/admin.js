import { createClient } from "@supabase/supabase-js";
import { handle } from "./_admin.js";

const admin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // secret: server only
  { auth: { persistSession: false, autoRefreshToken: false } },
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
