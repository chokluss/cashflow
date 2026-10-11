# Cashflow Live

A real-time money counter. Your salary and bills turn into a balance that grows second by second
between paydays, with debts, savings goals and a monthly history. Amounts are in Chilean pesos (CLP).

React + Vite front end, **Supabase (Postgres)** for accounts and data, deployed on **Vercel**.
Sign in from any device and see the same data.

## How it fits together
- **Browser**: the React app. It holds only the public Supabase key and the user's login session.
- **Supabase Auth**: accounts, passwords, password-reset emails.
- **Supabase Postgres**: `profiles` (name, email, role), `app_data` (one JSON document per user, with a version
  number), `app_settings`. Row Level Security makes each user able to read and write only their own rows.
- **`api/admin.js`** (Vercel function): the actions that need the secret key: create account, add users,
  reset passwords, change roles, delete users. It checks who is calling before doing anything.
- **`src/logic.js`**: all calculations (pure functions), unchanged by the backend.

## Setup
1. **Supabase project** (supabase.com, or Vercel > Storage > Supabase). In *SQL Editor* run `supabase/schema.sql` once.
2. **Auth settings** (Supabase > Authentication):
   - Turn **off public sign-ups** ("Allow new users to sign up"). Accounts are then created only through
     `/api/admin`, which respects the "Anyone can create an account" switch in the app.
   - *URL Configuration*: set **Site URL** to your Vercel address and add it to **Redirect URLs** (used by the reset link).
   - Password-reset emails need email sending; the built-in sender is very limited, so add your own SMTP for real use.
3. **Environment variables** (Vercel > Project > Settings > Environment Variables; also in `.env.local` for local work):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: public values (Supabase > Project Settings > API).
   - `SUPABASE_SERVICE_ROLE_KEY`: **secret**. Never prefix it with `VITE_`, never commit it. See `.env.example`.
4. **Deploy**: push to GitHub, import the repository in Vercel (framework: Vite). Redeploy after changing variables.
5. **Create the first account on the live site before sharing the address.** It becomes the administrator.
6. **Move existing data**: in the older version use the browser where your data lives. Open the new site, sign in,
   Plan > Backup > *Import data found in this browser*, or export a JSON file and import it.

## Run locally
    npm install
    npm run dev        # front end only (login and admin actions need the API)
    npm run dev:api    # `vercel dev`: front end + /api functions (install the Vercel CLI first)

## What it does
- **Live**: available balance for the pay cycle (restarts at 0 each cycle), projected balance at payday, total
  spending, money-speed dial, savings goals and debts.
- **Moves**: bills, purchases, extra income and debt payments (purchases and bills can be charged to a credit
  card). Loan installments appear automatically while a loan is active (skippable).
- **History**: one card per closed cycle; tap one for a read-only list of its movements.
- **Plan**: salary and payday, debts, goals, backup, data options.
- **Account** (profile picture): profile, password, delete account; administrators manage users.

## Saving and several devices
Changes are saved about a second after you stop editing, and when the tab is hidden. Each save carries a version
number; if another device saved in the meantime, the app shows "Your data was changed on another device. Reload"
instead of overwriting it.

## Security notes
- The anon key is public by design; protection comes from the Row Level Security rules in `supabase/schema.sql`.
  A user cannot change their own role or read other users' data.
- Closing a cycle runs in the browser when the app is opened, using the user's own data.
- Back up the database (Supabase offers scheduled backups on paid plans), and export your data now and then.
