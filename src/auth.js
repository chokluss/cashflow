// Accounts and data live in Supabase (Postgres). The browser only holds the public key and the user's session.
// Actions that need the secret key (creating users, resetting passwords, deleting users) go through /api/admin.
import { supabase } from "./supabase.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const checkPw = (pw) => { if (!pw || pw.length < 8) throw new Error("Password must have at least 8 characters."); };
const msg = (e) => (/invalid login credentials/i.test(e.message) ? "Wrong email or password." : e.message);

async function api(body, authed = true) {
  const headers = { "Content-Type": "application/json" };
  if (authed) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  let res;
  try { res = await fetch("/api/admin", { method: "POST", headers, body: JSON.stringify(body) }); }
  catch { throw new Error("Could not reach the server. Check your connection."); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "The request failed. (Locally, run the API with `vercel dev`.)");
  return j;
}

async function toUser(u) {
  const { data } = await supabase.from("profiles").select("name,role,created_at").eq("id", u.id).maybeSingle();
  return { id: u.id, email: u.email, name: data?.name || u.email, role: data?.role || "user", createdAt: data?.created_at };
}

/* ---------- session ---------- */
export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session ? toUser(data.session.user) : null;
}
export async function logIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password });
  if (error) throw new Error(msg(error));
  return toUser(data.user);
}
export const logOut = () => supabase.auth.signOut();

/* ---------- sign-up and recovery ---------- */
export const hasUsers = async () => (await supabase.rpc("has_users")).data === true;
export async function getSettings() {
  const { data } = await supabase.from("app_settings").select("allow_signup").eq("id", 1).maybeSingle();
  return { allowSignup: data?.allow_signup ?? true };
}
export const signUp = ({ name, email, password }) => api({ action: "signup", name, email, password }, false);
export async function requestPasswordReset(email) {
  if (!EMAIL.test(String(email).trim())) throw new Error("Enter a valid email address.");
  const { error } = await supabase.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), { redirectTo: window.location.origin });
  if (error) throw new Error(error.message);
}
export async function setNewPassword(pw) { // after opening the reset link
  checkPw(pw);
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) throw new Error(error.message);
}

/* ---------- my account ---------- */
export async function updateProfile(user, { name, email }) {
  name = String(name || "").trim(); email = String(email || "").trim().toLowerCase();
  if (!name) throw new Error("Enter a name.");
  if (!EMAIL.test(email)) throw new Error("Enter a valid email address.");
  const r = await supabase.from("profiles").update({ name }).eq("id", user.id);
  if (r.error) throw new Error(r.error.message);
  if (email !== user.email) { // Supabase may ask to confirm the new address by email
    const { error } = await supabase.auth.updateUser({ email });
    if (error) throw new Error(error.message);
  }
  return { ...user, name };
}
async function verify(user, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (error) throw new Error("Wrong password.");
}
export async function changePassword(user, oldPw, newPw) {
  await verify(user, oldPw); checkPw(newPw);
  const { error } = await supabase.auth.updateUser({ password: newPw });
  if (error) throw new Error(error.message);
}
export async function deleteAccount(user, password) {
  await verify(user, password);
  await api({ action: "deleteSelf" });
  await logOut();
}

/* ---------- administrators ---------- */
export async function listUsers() {
  const { data } = await supabase.from("profiles").select("id,name,email,role,created_at").order("created_at");
  return data ?? [];
}
export const createUser = (u) => api({ action: "create", ...u });
export const resetPassword = (id, password) => api({ action: "reset", id, password });
export const setRole = (id, role) => api({ action: "role", id, role });
export const removeUser = (id) => api({ action: "remove", id });
export const setSettings = (patch) => api({ action: "settings", ...patch });

/* ---------- the user's data: one JSON document ---------- */
// rev detects edits from another device: a save only works if nobody saved since we loaded
export async function loadData(id) {
  const got = await supabase.from("app_data").select("data,rev").eq("user_id", id).maybeSingle();
  if (got.error) throw new Error(got.error.message);
  if (got.data) return got.data;
  const made = await supabase.from("app_data").insert({ user_id: id, data: {}, rev: 1 }).select("data,rev").single();
  if (made.error) throw new Error(made.error.message);
  return made.data;
}
export async function saveData(id, S, rev) {
  const { data, error } = await supabase.from("app_data")
    .update({ data: S, rev: rev + 1, updated_at: new Date().toISOString() })
    .eq("user_id", id).eq("rev", rev).select("rev");
  if (error) throw new Error(error.message);
  if (!data.length) throw new Error("CONFLICT"); // someone saved in between
  return data[0].rev;
}
