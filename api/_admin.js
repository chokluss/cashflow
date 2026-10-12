// Administrator actions. They run on the server with the service-role key, which can bypass the
// database rules, so every action first checks who is calling. The file starts with "_" so Vercel
// does not publish it as an endpoint by itself; api/admin.js calls it.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (status, error) => ({ status, body: { error } });
const ok = (extra = {}) => ({ status: 200, body: { ok: true, ...extra } });

function validate({ name, email, password }) {
  if (!String(name || "").trim()) return "Enter a name.";
  if (!EMAIL.test(String(email || "").trim())) return "Enter a valid email address.";
  if (!password || String(password).length < 8) return "Password must have at least 8 characters.";
  return null;
}

export async function handle(body = {}, authHeader = "", { admin }) {
  const { action } = body || {};
  const profiles = async () => (await admin.from("profiles").select("id,role")).data ?? [];
  const signupOpen = async () => (await admin.from("app_settings").select("allow_signup").eq("id", 1).maybeSingle()).data?.allow_signup ?? true;

  const createUser = async ({ name, email, password, role }) => {
    const { data, error } = await admin.auth.admin.createUser({
      email: String(email).trim().toLowerCase(), password, email_confirm: true, user_metadata: { name: String(name).trim() },
    });
    if (error) return fail(400, /already|registered|exists/i.test(error.message) ? "An account with this email already exists." : error.message);
    if (role === "admin") await admin.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
    return ok({ id: data.user.id });
  };

  // ---- public: create an account (the database makes the very first one an administrator) ----
  if (action === "signup") {
    const err = validate(body);
    if (err) return fail(400, err);
    if ((await profiles()).length > 0 && !(await signupOpen())) return fail(403, "Sign-up is closed. Ask an administrator for an account.");
    return createUser({ ...body, role: "user" });
  }

  // ---- everything else needs a signed-in user ----
  const token = String(authHeader || "").replace(/^Bearer\s+/i, "");
  const got = token ? await admin.auth.getUser(token) : null;
  const me = got?.data?.user;
  if (!me) return fail(401, "Please sign in again.");
  const all = await profiles();
  const mine = all.find((p) => p.id === me.id);
  const admins = all.filter((p) => p.role === "admin");

  if (action === "deleteSelf") {
    if (mine?.role === "admin" && admins.length < 2 && all.length > 1) return fail(400, "Make another user an administrator first.");
    const { error } = await admin.auth.admin.deleteUser(me.id); // cascades to the profile and the app data
    return error ? fail(400, error.message) : ok();
  }

  if (mine?.role !== "admin") return fail(403, "Only administrators can do this.");
  const target = all.find((p) => p.id === body.id);

  switch (action) {
    case "create": {
      const err = validate(body);
      return err ? fail(400, err) : createUser({ ...body, role: body.role === "admin" ? "admin" : "user" });
    }
    case "reset": {
      if (!target) return fail(404, "User not found.");
      if (!body.password || String(body.password).length < 8) return fail(400, "Password must have at least 8 characters.");
      const { error } = await admin.auth.admin.updateUserById(target.id, { password: body.password });
      return error ? fail(400, error.message) : ok();
    }
    case "role": {
      if (!target) return fail(404, "User not found.");
      const role = body.role === "admin" ? "admin" : "user";
      if (target.role === "admin" && role !== "admin" && admins.length < 2) return fail(400, "There must be at least one administrator.");
      await admin.from("profiles").update({ role }).eq("id", target.id);
      return ok();
    }
    case "remove": {
      if (!target) return fail(404, "User not found.");
      if (target.id === me.id) return fail(400, "Use “Delete my account” to remove yourself.");
      const { error } = await admin.auth.admin.deleteUser(target.id);
      return error ? fail(400, error.message) : ok();
    }
    case "settings":
      await admin.from("app_settings").upsert({ id: 1, allow_signup: !!body.allowSignup });
      return ok();
    default:
      return fail(400, "Unknown action.");
  }
}
