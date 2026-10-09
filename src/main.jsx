import { useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthScreen from "./AuthScreen.jsx";
import { currentUser, logOut } from "./auth.js";
import "./styles.css";

function Root() {
  const [user, setUser] = useState(() => currentUser());
  if (!user) return <AuthScreen onAuth={setUser} />;
  // key = user id, so every user gets a fresh app state with their own data
  return <App key={user.id} user={user} setUser={setUser} onLogout={() => { logOut(); setUser(null); }} />;
}

createRoot(document.getElementById("root")).render(<Root />);
