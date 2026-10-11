import { createClient } from "@supabase/supabase-js";

// The anon key is public by design: what a user may read or write is decided by the database rules (supabase/schema.sql).
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
