# Cashflow Live (React + Vite)

## Run locally
    npm install
    npm run dev

## Build for your hosting
    npm install
    npm run build

Upload everything inside the generated `dist/` folder to your hosting
(public_html, or any subfolder - paths are relative). No server needed.
Data is stored in the visitor's browser (localStorage).

## Layout
The app is responsive: on phones it shows one tab at a time with a bottom
navigation; on screens 960px wide or more it shows Live, Movements and
Plan side by side as a desktop dashboard.

## Accounts
Login and user management are built in (`src/auth.js`, `AuthScreen.jsx`, `Account.jsx`).
Accounts live in the browser's storage on each device: passwords are salted and hashed
(PBKDF2) and every user has their own data. The first account becomes the administrator.
Serve the site over HTTPS (the browser needs it for password hashing).
Accounts are NOT shared between devices; for that, replace the functions in `src/auth.js`
with calls to a server.
