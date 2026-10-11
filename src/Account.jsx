import { useEffect, useState } from "react";
import {
  updateProfile, changePassword, deleteAccount, listUsers, createUser, resetPassword, setRole, removeUser, getSettings, setSettings,
} from "./auth.js";

function useAction() {
  const [msg, setMsg] = useState(null);
  const run = async (fn, ok) => {
    try { await fn(); setMsg({ ok: true, text: ok }); return true; }
    catch (e) { setMsg({ ok: false, text: e.message }); return false; }
  };
  return [msg, run];
}
const Msg = ({ m }) => (m ? <div className="sub" style={{ marginTop: 8, color: m.ok ? "var(--pri)" : "var(--neg)" }}>{m.text}</div> : null);

export function AccountCard({ user, setUser, onLogout }) {
  const [p, setP] = useState({ name: user.name, email: user.email });
  const [pw, setPw] = useState({ old: "", next: "", again: "" });
  const [del, setDel] = useState("");
  const [m1, run1] = useAction();
  const [m2, run2] = useAction();
  const [m3, run3] = useAction();
  return (
    <div className="card">
      <div className="lbl">My account · {user.role === "admin" ? "Administrator" : "User"}</div>
      <label htmlFor="pn">Name</label>
      <input id="pn" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      <label htmlFor="pe">Email</label>
      <input id="pe" type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
      <button className="go sm" onClick={() => run1(async () => setUser(await updateProfile(user, p)), p.email.trim().toLowerCase() !== user.email ? "Saved. Check your email to confirm the new address." : "Profile saved.")}>Save profile</button>
      <Msg m={m1} />

      <div className="mini" style={{ marginTop: 18 }}>Change password</div>
      <input type="password" placeholder="Current password" autoComplete="current-password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} />
      <input type="password" placeholder="New password (8+ characters)" autoComplete="new-password" style={{ marginTop: 8 }} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
      <input type="password" placeholder="Repeat new password" autoComplete="new-password" style={{ marginTop: 8 }} value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
      <button className="go sm" onClick={() => run2(async () => {
        if (pw.next !== pw.again) throw new Error("The new passwords do not match.");
        await changePassword(user, pw.old, pw.next);
        setPw({ old: "", next: "", again: "" });
      }, "Password changed.")}>Change password</button>
      <Msg m={m2} />

      <button className="go sm" onClick={onLogout}>Log out</button>

      <div className="mini" style={{ marginTop: 18 }}>Delete my account</div>
      <div className="sub">Removes your account and all your data everywhere.</div>
      <input type="password" placeholder="Confirm with your password" style={{ marginTop: 8 }} value={del} onChange={(e) => setDel(e.target.value)} />
      <button className="go" style={{ background: "var(--neg)", color: "#fff", marginTop: 8 }}
        onClick={async () => { if (await run3(() => deleteAccount(user, del), "")) onLogout(); }}>Delete my account</button>
      <Msg m={m3} />
    </div>
  );
}

export function UsersCard({ user }) {
  const [users, setUsers] = useState(null);
  const [allow, setAllow] = useState(true);
  const [m, run] = useAction();
  const [resetFor, setResetFor] = useState(null);
  const [tmp, setTmp] = useState("");
  const [nu, setNu] = useState({ name: "", email: "", password: "", role: "user" });
  const refresh = async () => { setUsers(await listUsers()); setAllow((await getSettings()).allowSignup); };
  useEffect(() => { refresh().catch(() => setUsers([])); }, []);
  if (!users) return <div className="card"><div className="sub">Loading users…</div></div>;
  return (
    <div className="card">
      <div className="lbl">Users (administrator)</div>
      <label className="chk">
        <input type="checkbox" checked={allow} onChange={(e) => run(async () => { await setSettings({ allowSignup: e.target.checked }); setAllow(e.target.checked); }, "Saved.")} /> Anyone can create an account
      </label>
      {users.map((u) => (
        <div className="item" key={u.id}>
          <div style={{ fontWeight: 600 }}>{u.name}{u.id === user.id && " (you)"}</div>
          <div className="sub">{u.email} · {u.role === "admin" ? "Administrator" : "User"}</div>
          <div className="cols" style={{ marginTop: 8 }}>
            <button className="go sm" style={{ margin: 0 }} onClick={() => run(async () => { await setRole(u.id, u.role === "admin" ? "user" : "admin"); await refresh(); }, "Role updated.")}>
              {u.role === "admin" ? "Make user" : "Make admin"}
            </button>
            <button className="go sm" style={{ margin: 0 }} onClick={() => { setResetFor(resetFor === u.id ? null : u.id); setTmp(""); }}>Reset password</button>
          </div>
          {resetFor === u.id && (
            <div style={{ marginTop: 8 }}>
              <input placeholder="Temporary password (8+ characters)" value={tmp} onChange={(e) => setTmp(e.target.value)} />
              <button className="go sm" onClick={async () => { if (await run(() => resetPassword(u.id, tmp), `Password reset. Share “${tmp}” with ${u.name}.`)) setResetFor(null); }}>Set password</button>
            </div>
          )}
          {u.id !== user.id && (
            <button className="go sm" style={{ color: "var(--neg)" }} onClick={() => run(async () => { await removeUser(u.id); await refresh(); }, "User removed.")}>Remove user</button>
          )}
        </div>
      ))}
      <div className="mini" style={{ marginTop: 18 }}>Add a user</div>
      <input placeholder="Name" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
      <input placeholder="Email" type="email" style={{ marginTop: 8 }} value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
      <input placeholder="Temporary password (8+ characters)" style={{ marginTop: 8 }} value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
      <select style={{ marginTop: 8 }} value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
        <option value="user">User</option><option value="admin">Administrator</option>
      </select>
      <button className="go sm" onClick={async () => { if (await run(() => createUser(nu), "User added.")) { setNu({ name: "", email: "", password: "", role: "user" }); await refresh(); } }}>＋ Add user</button>
      <Msg m={m} />
    </div>
  );
}
