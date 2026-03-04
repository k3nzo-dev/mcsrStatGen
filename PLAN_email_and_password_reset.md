# Implementation Plan: Email Registration & Password Resets

## Overview
Add an email field to the registration process and implement a secure password reset flow using Resend.

---

## 1. Database Schema (`server/db.js`)
In `initSchema()`, add ALTER TABLE statements to:
- Add `reset_password_token TEXT` to the `users` table.
- Add `reset_password_expires TIMESTAMPTZ` to the `users` table.
- Add a UNIQUE constraint to the existing `email` column.

## 2. Dependencies
- Install `resend` via `npm install resend`.

## 3. Create `server/email.js` (NEW FILE)
- Configure a Resend client using env var: `RESEND_API_KEY`.
- Export `sendPasswordResetEmail(toEmail, resetLink)` that sends a styled HTML email.
- Gracefully skip sending if `RESEND_API_KEY` is not set.

## 4. Update `server/routes/auth.js`
- **`POST /register`:** Parse, validate, and store the `email` field alongside username/password.
- **`POST /forgot-password` (NEW):**
  - Look up user by email.
  - Generate a secure token via `crypto.randomBytes`, store it + 1-hour expiration in DB.
  - Send reset email with link: `https://<domain>/reset-password.html?token=<token>`.
  - Always return a generic success message (prevent user enumeration).
- **`POST /reset-password` (NEW):**
  - Verify token and expiration.
  - Hash new password with bcrypt, update `password_hash`.
  - Clear token/expiration fields.

## 5. Update `public/login.html`
- Add `<input type="email" id="reg-email">` (required) to the Register form.
- Add a "Forgot Password?" link below the Sign In submit button.

## 6. Update `public/js/login.js`
- Include `email` in the `POST /auth/register` payload.
- Handle "Forgot Password" click: show inline email input, POST to `/auth/forgot-password`, display feedback.

## 7. Create `public/reset-password.html` (NEW FILE)
- Styled to match `login.html` (same card, glassmorphism, `style.css` variables).
- Form with "New Password" and "Confirm Password" fields.
- Reads `?token=` from the URL.

## 8. Create `public/js/reset-password.js` (NEW FILE)
- Submit form to `POST /auth/reset-password` with token + new password.
- Show success/error messages; redirect to `/login.html` on success.

---

## Environment Variables Needed
```
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM="MCSR Ranked Stats <onboarding@resend.dev>"
APP_URL=http://localhost:3000
```

## Files Summary
| Action | File |
|--------|------|
| MODIFY | `server/db.js` |
| MODIFY | `server/routes/auth.js` |
| MODIFY | `public/login.html` |
| MODIFY | `public/js/login.js` |
| MODIFY | `package.json` |
| NEW    | `server/email.js` |
| NEW    | `public/reset-password.html` |
| NEW    | `public/js/reset-password.js` |
