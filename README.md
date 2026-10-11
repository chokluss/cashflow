# Cashflow Live

A real-time money counter. Your salary and bills turn into a balance that grows second by second
between paydays, with debts, savings goals and a monthly history. Amounts are in Chilean pesos (CLP).

Built with React + Vite. No server needed: everything is stored in the browser.

## Run locally
    npm install
    npm run dev

## Build and deploy
    npm install
    npm run build

Upload the contents of `dist/` to any static hosting (public_html or a subfolder; paths are relative).
Serve it over HTTPS: the browser needs it to hash passwords.

## What it does
- **Live**: available balance for the pay cycle (counts from payday, restarts at 0 each cycle), projected
  balance at payday, total spending, money-speed dial, savings goals and debts.
- **Moves**: bills (monthly), purchases, extra income and debt payments. Purchases and bills can be charged
  to a credit card. Loan installments appear automatically while a loan is active (and can be skipped).
- **History**: one card per closed cycle with income, spending and where the leftover went; tap one for a
  read-only list of its movements.
- **Plan**: salary and payday, debts (credit cards and loans), savings goals, data options.
- **Account** (tap the profile picture): profile, password, delete account; administrators manage users.

## Rules in short
- Money left at payday goes to the goals in order, then to a Savings item. A negative close is borrowed.
- A shortfall (income below bills + installments) creates the "Borrowed money" debt: no limit, no installments.
- Credit card and loan figures on the Live tab are monthly statuses: they change at payday or when you
  charge, prepay or pay a debt.

## Code map
- `src/logic.js`: all calculations (pure functions) and the example data.
- `src/auth.js`: local accounts (salted PBKDF2 hashes, sessions, roles). Replace its functions to use a real backend.
- `src/App.jsx`: the screens. `src/AuthScreen.jsx`, `src/Account.jsx`: login and account management.
- `src/styles.css`: styles (responsive: phone tabs, desktop dashboard).

## Notes
- Accounts and data live in each browser (localStorage). They are not shared between devices.
- The first account created becomes the administrator.
