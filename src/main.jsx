import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthScreen, { RecoveryScreen } from "./AuthScreen.jsx";
import { currentUser, logOut, loadData } from "./auth.js";
import { supabase } from "./supabase.js";
import "./styles.css";

const Center = ({ children }) => <div className="authwrap"><div className="sub" style={{ textAlign: "center" }}>{children}</div></div>;

function Root() {
  const [user, setUser] = useState(undefined); // undefined = still checking the session
  const [loaded, setLoaded] = useState(null); // { data, rev } of the signed-in user
  const [loadErr, setLoadErr] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    currentUser().then(setUser).catch(() => setUser(null));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true); // opened the reset link from the email
      if (event === "SIGNED_OUT") setUser(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setLoaded(null); setLoadErr("");
    if (user) loadData(user.id).then(setLoaded).catch((e) => setLoadErr(e.message));
  }, [user?.id, attempt]);

  if (recovery) return <RecoveryScreen onDone={async () => { setRecovery(false); setUser(await currentUser()); }} />;
  if (user === undefined) return <Center>Loading…</Center>;
  if (!user) return <AuthScreen onAuth={setUser} />;
  if (loadErr) return <Center>Could not load your data: {loadErr}<br /><button className="linkb" onClick={() => setAttempt((n) => n + 1)}>Try again</button><button className="linkb" onClick={() => logOut()}>Log out</button></Center>;
  if (!loaded) return <Center>Loading your data…</Center>;
  // key = user id, so every user gets a fresh app state with their own data
  return <App key={user.id} user={user} setUser={setUser} onLogout={() => logOut().then(() => setUser(null))} initial={loaded} />;
}

createRoot(document.getElementById("root")).render(<Root />);
