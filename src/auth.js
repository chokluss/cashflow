// Local accounts: stored in THIS browser only (no server). Passwords are salted and hashed with
// PBKDF2 (WebCrypto, needs HTTPS or localhost) and never stored in clear text.
// Every user gets their own data space. To use a real backend later, replace the functions in this file.
import { KEY } from "./logic.js";

const USERS = "cashflow:users", SESSION = "cashflow:session", SETTINGS = "cashflow:settings", FAILS = "cashflow:fails", DATA = "cashflow:data:";
const ITER = 150000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const read = (k, store = localStorage) => { try { return JSON.parse(store.getItem(k)); } catch { return null; } };
const write = (k, v, store = localStorage) => store.setItem(k, JSON.stringify(v));
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const norm = (e) => String(e || "").trim().toLowerCase();
const users = () => read(USERS) || [];
const pub = (u) => (u ? { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt } : null);
const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

async function hash(pw, salt, iter = ITER) {
  if (!globalThis.crypto?.subtle) throw new Error("Login needs a secure connection (HTTPS).");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: unb64(salt), iterations: iter, hash: "SHA-256" }, key, 256));
}
const checkPw = (pw) => { if (!pw || pw.length < 8) throw new Error("Password must have at least 8 characters."); };
const adminOf = (id) => {
  const a = users().find((u) => u.id === id);
  if (a?.role !== "admin") throw new Error("Only administrators can do this.");
  return a;
};
const admins = (us) => us.filter((u) => u.role === "admin").length;
async function verify(id, pw) {
  const u = users().find((x) => x.id === id);
  if (!u || (await hash(pw, u.salt, u.iter)) !== u.hash) throw new Error("Wrong password.");
  return u;
}

export const getSettings = () => ({ allowSignup: true, ...(read(SETTINGS) || {}) });
export function setSettings(adminId, patch) { adminOf(adminId); write(SETTINGS, { ...getSettings(), ...patch }); }
export const listUsers = () => users().map(pub);

export function currentUser() {
  const s = read(SESSION, sessionStorage) || read(SESSION);
  return pub(users().find((u) => u.id === s?.userId));
}
export function logOut() { sessionStorage.removeItem(SESSION); localStorage.removeItem(SESSION); }

// byAdmin: an administrator creates the account (works even when public sign-up is off)
export async function signUp({ name, email, password, role = "user", byAdmin = false }) {
  name = String(name || "").trim(); email = norm(email);
  if (!name) throw new Error("Enter a name.");
  if (!EMAIL.test(email)) throw new Error("Enter a valid email address.");
  checkPw(password);
  const us = users(), first = us.length === 0;
  if (!first && !byAdmin && !getSettings().allowSignup) throw new Error("Sign-up is closed. Ask an administrator for an account.");
  if (us.some((u) => u.email === email)) throw new Error("An account with this email already exists.");
  const salt = newSalt();
  const user = {
    id: "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name, email,
    role: first ? "admin" : role === "admin" ? "admin" : "user", salt, iter: ITER, hash: await hash(password, salt), createdAt: Date.now(),
  };
  write(USERS, [...us, user]);
  if (first) { // adopt the data saved before accounts existed
    const legacy = localStorage.getItem(KEY);
    if (legacy) localStorage.setItem(DATA + user.id, legacy);
  }
  return pub(user);
}

export async function logIn(email, password, remember = true) {
  email = norm(email);
  const fails = read(FAILS) || {}, rec = fails[email];
  if (rec?.until > Date.now()) throw new Error(`Too many attempts. Try again in ${Math.ceil((rec.until - Date.now()) / 1000)} s.`);
  const u = users().find((x) => x.email === email);
  const ok = u && (await hash(password, u.salt, u.iter)) === u.hash;
  if (!ok) {
    const n = (rec?.n || 0) + 1;
    write(FAILS, { ...fails, [email]: { n, until: n >= 5 ? Date.now() + 30000 * Math.min(8, n - 4) : 0 } });
    throw new Error("Wrong email or password.");
  }
  delete fails[email]; write(FAILS, fails);
  logOut();
  write(SESSION, { userId: u.id }, remember ? localStorage : sessionStorage);
  return pub(u);
}

export function updateProfile(id, { name, email }) {
  const us = users(), me = us.find((u) => u.id === id);
  name = String(name || "").trim(); email = norm(email);
  if (!name) throw new Error("Enter a name.");
  if (!EMAIL.test(email)) throw new Error("Enter a valid email address.");
  if (us.some((u) => u.id !== id && u.email === email)) throw new Error("Another account already uses this email.");
  Object.assign(me, { name, email });
  write(USERS, us);
  return pub(me);
}

export async function changePassword(id, oldPw, newPw) {
  await verify(id, oldPw); checkPw(newPw);
  const us = users(), me = us.find((u) => u.id === id);
  me.salt = newSalt(); me.iter = ITER; me.hash = await hash(newPw, me.salt);
  write(USERS, us);
}

export async function resetPassword(adminId, targetId, newPw) {
  adminOf(adminId); checkPw(newPw);
  const us = users(), t = us.find((u) => u.id === targetId);
  if (!t) throw new Error("User not found.");
  t.salt = newSalt(); t.iter = ITER; t.hash = await hash(newPw, t.salt);
  write(USERS, us);
}

export function setRole(adminId, targetId, role) {
  adminOf(adminId);
  const us = users(), t = us.find((u) => u.id === targetId);
  if (!t) throw new Error("User not found.");
  if (t.role === "admin" && role !== "admin" && admins(us) < 2) throw new Error("There must be at least one administrator.");
  t.role = role === "admin" ? "admin" : "user";
  write(USERS, us);
}

function drop(us, id) {
  write(USERS, us.filter((u) => u.id !== id));
  localStorage.removeItem(DATA + id);
}
export function removeUser(adminId, targetId) {
  adminOf(adminId);
  if (adminId === targetId) throw new Error("Use “Delete my account” to remove yourself.");
  drop(users(), targetId);
}
export async function deleteAccount(id, password) {
  const me = await verify(id, password), us = users();
  if (me.role === "admin" && admins(us) < 2 && us.length > 1) throw new Error("Make another user an administrator first.");
  drop(us, id); logOut();
}

export const loadData = (id) => read(DATA + id);
export const saveData = (id, S) => { try { write(DATA + id, S); } catch {} };
