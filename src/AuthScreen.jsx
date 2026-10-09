import { useState } from "react";
import { signUp, logIn, listUsers, getSettings } from "./auth.js";

export default function AuthScreen({ onAuth }) {
  const first = listUsers().length === 0;
  const allow = getSettings().allowSignup;
  const [mode, setMode] = useState(first ? "signup" : "login");
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "", remember: true });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const up = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const signup = mode === "signup";

  const submit = async () => {
    setErr("");
    if (signup && f.password !== f.confirm) return setErr("The passwords do not match.");
    setBusy(true);
    try {
      if (signup) await signUp(f);
      onAuth(await logIn(f.email, f.password, f.remember));
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="authwrap" onKeyDown={(e) => e.key === "Enter" && !busy && submit()}>
      <div className="card authbox">
        <h1>Cashflow Live</h1>
        <div className="sub">
          {first ? "Create the first account — it becomes the administrator." : signup ? "Create your account" : "Sign in to your account"}
        </div>
        {signup && (<><label htmlFor="an">Name</label><input id="an" autoComplete="name" value={f.name} onChange={up("name")} /></>)}
        <label htmlFor="ae">Email</label>
        <input id="ae" type="email" autoComplete="email" value={f.email} onChange={up("email")} />
        <label htmlFor="ap">Password</label>
        <input id="ap" type="password" autoComplete={signup ? "new-password" : "current-password"} value={f.password} onChange={up("password")} />
        {signup && (<><label htmlFor="ap2">Confirm password</label><input id="ap2" type="password" autoComplete="new-password" value={f.confirm} onChange={up("confirm")} /></>)}
        <label className="chk"><input type="checkbox" checked={f.remember} onChange={up("remember")} /> Stay signed in on this device</label>
        {err && <div className="sub err">{err}</div>}
        <button className="go" disabled={busy} onClick={submit}>{busy ? "…" : signup ? "Create account" : "Sign in"}</button>
        {!first && (signup
          ? <button className="linkb" onClick={() => { setMode("login"); setErr(""); }}>I already have an account</button>
          : allow
          ? <button className="linkb" onClick={() => { setMode("signup"); setErr(""); }}>Create an account</button>
          : <div className="sub" style={{ marginTop: 12 }}>New accounts are created by an administrator.</div>)}
        <div className="sub" style={{ marginTop: 14, fontSize: 11 }}>Accounts are stored on this device only.</div>
      </div>
    </div>
  );
}
