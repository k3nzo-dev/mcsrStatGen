# MCSR Ranked Stats — Architecture & Reference Guide

This document defines the core structure, functionality, and design patterns of the `mcsrStatGen` project. It serves as a unified reference point for future developments by human developers, Claude Code, and other AI assistants.

## 1. Project Overview
**MCSR Ranked Stats** is a full-stack web application designed for the Minecraft Speedrunning (MCSR) community. It allows users to:
1. Generate stylized, downloadable stat cards (PNG graphics) encompassing detailed stats like Elo, win rates, bastion breakdowns, and split times.
2. Create dynamic, auto-updating live stream overlays (widgets) for OBS.
3. Manage premium features via user accounts and Stripe subscriptions.

The application is hosted on **Railway**.

---

## 2. Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL (using `pg` driver)
- **Authentication:** Passport.js (Local username/password + email)
- **Email:** Resend API (password reset emails)
- **Payments:** Stripe API (Checkout, Billing Portal, Webhooks)
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (no framework)
- **Graphics/Images:** Native browser Canvas API

---

## 3. Directory Structure & File Purposes

### `server/` (Backend / REST API)
- **`index.js`**: Application entry point. Handles middleware, rate limiting, helmet security, express-sessions (backed by Postgres), Stripe raw webhooks, and static file serving.
- **`db.js`**: Manages the PostgreSQL connection pool. Contains `initSchema()` to define and migrate database tables (`users`, `subscriptions`, `overlay_configs`, `tracked_players`).
- **`auth.js`**: Configures Passport.js. Contains the logic for `LocalStrategy` (bcrypt hashing).
- **`email.js`**: Configures the Resend email transport. Exports `sendPasswordResetEmail(toEmail, resetLink)` for the password reset flow. Requires `RESEND_API_KEY` env var.
- **`routes/auth.js`**: Express router for `/auth/*` endpoints (login, register, logout, forgot-password, reset-password).
- **`routes/api.js`**: Express router for `/api/*` internal endpoints. Handles authenticated user profiles, widget token generation (`requirePro` gated), subscription management, Stripe product caching (`/api/pro-product`), and public site stats tracking.

### `scripts/` (CLI Utilities)
- **`set-pro.js`**: Utility script to manually grant Pro subscription status to a user via the database. Useful for beta testers or manual overrides.

### `public/` (Frontend UI)
- **`index.html`**: The public landing page. Contains the public stat card generator and dynamic "hero" stats showcasing total players tracked, top Elo, etc.
- **`dashboard.html`**: The post-login management dashboard. Users check their subscription plan and configure their OBS widget URL. Free users see a blurred preview and an upgrade CTA; Pro users get the full configurator.
- **`login.html`**: The authentication page (Sign up / Sign in). Registration requires email. Includes an inline "Forgot Password?" flow.
- **`reset-password.html`**: The password reset page. Users arrive here via the email reset link with a `?token=` param. Contains new-password and confirm-password fields.
- **`upgrade.html`**: The Premium checkout page containing Stripe product info and a 3-state CTA (Sign in / Subscribe / Manage billing).
- **`widget.html`** & **`overlay.html`**: Minimal HTML pages meant to be loaded directly as Browser Sources in OBS. They display the stats card and a live polling indicator.
- **`style.css`**: Global design system. Uses CSS variables for consistent glassmorphism, responsive grid layouts, MCSR tier colors, and premium drop-shadows.

### `public/js/` (Frontend Logic)
- **`api.js`**: Handles external API interactions (fetching from `api.mcsrranked.com`) and internal endpoints. Handles rate-limiter batching.
- **`data.js`**: Static lookup maps for tier URLs, rank colors, and formatting utilities.
- **`matchData.js`**: Pure data-processing layer. Calculates win rates by `bastionType` and `seedType`, and computes average `splits` from match timelines.
- **`ui.js`**: Contains DOM manipulation for rendering detailed stats modules AND the highly complex `downloadCard()` function, which draws the DOM elements onto an HTML Canvas to export as a `.png`.
- **`app.js`**: The main controller for `index.html`. Wires the search inputs, toggle switches, and delegates to `ui.js` and `matchData.js`.
- **`widget.js`** / **`overlay.js`**: Handles the logic for `widget.html` and `overlay.html`. Authenticates the token, fetches initial data, and implements a `setInterval` loop to seamlessly fade and refresh the card when data changes during a live stream.
- **`upgrade.js`**: Handles Stripe checkout session creation, fetch calls to `/api/pro-product`, and dynamic CTA state management on the upgrade page.
- **`reset-password.js`**: Handles the password reset form — reads the token from the URL, submits the new password to `POST /auth/reset-password`, and redirects to login on success.

---

## 4. Key Workflows & Data Flow

### Stat Card Generation (`app.js` -> `ui.js`)
1. User enters a name in `index.html`.
2. `api.fetchPlayerStats` gets base profile data.
3. If deep stats (Splits/Bastions) are toggled, `api.fetchRecentMatches` and `api.fetchMatchesWithTimelines` are called (batched to respect rate limits).
4. `matchData.js` processes the raw data into structured averages.
5. DOM is updated via `ui.js`.
6. When "Download Graphic" is clicked, `ui.downloadCard` maps fonts, avatars, and text coordinates onto a virtual `<canvas>`, resizing its height dynamically based on which modules are enabled, and triggers a PNG download.

### Live OBS Widget (`dashboard.html` -> `widget.html`)
1. Authenticated user saves their MCSR username in the Dashboard.
2. The server (`/api/me/mcsr-username`) saves this and issues a unique permanent `widget_token`.
3. The user pastes `https://.../widget/[USERNAME]?token=[TOKEN]` into OBS.
4. `widget.js` verifies the token, renders the card, and checks the player's ranked match count every `X` seconds. If the match count changes, it silently fetches the new stats and gently cross-fades the DOM to prevent jarring visual flashes on stream.

### Password Reset (`login.html` -> email -> `reset-password.html`)
1. User clicks "Forgot Password?" on the Sign In tab.
2. User enters their email; frontend POSTs to `/auth/forgot-password`.
3. Server generates a secure token (`crypto.randomBytes`), hashes it with SHA-256, stores the hash + 1-hour expiration in the `users` table.
4. Server sends a reset email via Resend containing a link with the raw token.
5. User clicks the link, lands on `reset-password.html?token=...`.
6. User submits a new password; frontend POSTs to `/auth/reset-password`.
7. Server verifies the token hash and expiration, updates `password_hash`, clears the token, and invalidates all existing sessions for that user.

---

## 5. Instructions for AI Assistants (Claude Code / Gemini)

When modifying this repository, strictly adhere to the following rules:

1. **Frontend Simplicity**: Keep the frontend Vanilla JS. Do not introduce modern JS frameworks (React/Vue/etc.) or build steps (Webpack/Vite) unless specifically requested by the user. 
2. **Canvas Integrity**: If you alter the DOM layout or CSS of the stat card, **you MUST update `js/ui.js`** in the `downloadCard()` function. The canvas graphic is manually drawn on 2D context; it does not automatically capture the HTML DOM. X/Y coordinates must be recalculated if layouts change.
3. **Database Migrations**: `server/db.js` handles schema definition via `CREATE TABLE IF NOT EXISTS` at boot. If you need to add a column, write an `ALTER TABLE` statement or a migration block inside `initSchema()` to safely handle existing tables. Do not destructively drop tables.
4. **CSS Variables**: Check `style.css` for existing `:root` variables (colors, spacing, shadows) before hardcoding hex values. Maintain the existing typography (Inter) and premium UI aesthetic (glassmorphism/shadows).
5. **API FetchLimits**: The external `api.mcsrranked.com` has rate limits. Heaviest calls (like fetching 100 timeline details for splits) are batched inside `fetchMatchesWithTimelines()`. Do not circumvent this batching.
