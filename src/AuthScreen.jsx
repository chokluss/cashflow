import { useEffect, useState } from "react";
import { signUp, logIn, hasUsers, getSettings, requestPasswordReset, setNewPassword } from "./auth.js";

export default function AuthScreen({ onAuth }) {
  const [info, setInfo] = useState(null); // { first, allow }
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([hasUsers(), getSettings()])
      .then(([has, s]) => { setInfo({ first: !has, allow: s.allowSignup }); if (!has) setMode("signup"); })
      .catch(() => setInfo({ first: false, allow: true }));
  }, []);

  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const signup = mode === "signup";

  const submit = async () => {
    setErr(""); setNote("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        await requestPasswordReset(f.email);
        setNote("If that email has an account, we sent a link to reset the password.");
        setBusy(false);
        return;
      }
      if (signup) {
        if (f.password !== f.confirm) throw new Error("The passwords do not match.");
        await signUp(f);
      }
      onAuth(await logIn(f.email, f.password));
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  if (!info) return <div className="authwrap"><div className="sub">Loading…</div></div>;

  return (
    <div className="authwrap" onKeyDown={(e) => e.key === "Enter" && !busy && submit()}>
      <div className="card authbox">
        <h1>Cashflow Live</h1>
        <div className="sub">
          {info.first ? "Create the first account — it becomes the administrator."
            : mode === "forgot" ? "Enter your email and we'll send a reset link."
            : signup ? "Create your account" : "Sign in to your account"}
        </div>
        {signup && (<><label htmlFor="an">Name</label><input id="an" autoComplete="name" value={f.name} onChange={up("name")} /></>)}
        <label htmlFor="ae">Email</label>
        <input id="ae" type="email" autoComplete="email" value={f.email} onChange={up("email")} />
        {mode !== "forgot" && (<>
          <label htmlFor="ap">Password</label>
          <input id="ap" type="password" autoComplete={signup ? "new-password" : "current-password"} value={f.password} onChange={up("password")} />
        </>)}
        {signup && (<><label htmlFor="ap2">Confirm password</label><input id="ap2" type="password" autoComplete="new-password" value={f.confirm} onChange={up("confirm")} /></>)}
        {err && <div className="sub err">{err}</div>}
        {note && <div className="sub" style={{ color: "var(--pri)", marginTop: 8 }}>{note}</div>}
        <button className="go" disabled={busy} onClick={submit}>{busy ? "…" : mode === "forgot" ? "Send reset link" : signup ? "Create account" : "Sign in"}</button>
        {mode === "login" && <button className="linkb" onClick={() => { setMode("forgot"); setErr(""); }}>Forgot your password?</button>}
        {!info.first && (mode === "login"
          ? (info.allow ? <button className="linkb" onClick={() => { setMode("signup"); setErr(""); }}>Create an account</button>
                        : <div className="sub" style={{ marginTop: 12 }}>New accounts are created by an administrator.</div>)
          : <button className="linkb" onClick={() => { setMode("login"); setErr(""); setNote(""); }}>Back to sign in</button>)}
      </div>
    </div>
  );
}

// shown after opening the link from the password-reset email
export function RecoveryScreen({ onDone }) {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState("");
  const go = async () => {
    try {
      if (pw !== again) throw new Error("The passwords do not match.");
      await setNewPassword(pw);
      onDone();
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="authwrap" onKeyDown={(e) => e.key === "Enter" && go()}>
      <div className="card authbox">
        <h1>Choose a new password</h1>
        <label htmlFor="rp">New password (8+ characters)</label>
        <input id="rp" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <label htmlFor="rp2">Repeat it</label>
        <input id="rp2" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        {err && <div className="sub err">{err}</div>}
        <button className="go" onClick={go}>Save password</button>
      </div>
    </div>
  );
}
