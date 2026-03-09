# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

`mcsrStatGen` is a statistics generator for MCSR (Minecraft Speedrun) Ranked. It fetches and processes data from the MCSR Ranked API, and provides a monetized live OBS widget via Stripe.

## Allowed External APIs

The following domains are pre-approved for `WebFetch`:
- `mcsrranked.com`
- `api.mcsrranked.com`
- `docs.mcsrranked.com`
- `stripe.com`
- `api.stripe.com`
- `api.resend.com`

Consult `https://api.mcsrranked.com` or `https://docs.mcsrranked.com` to explore available endpoints before implementing data-fetching logic.

## Authentication & Email

- Users register with **username + email + password**. Passwords are hashed with bcrypt (12 rounds).
- Login uses Passport.js `LocalStrategy` (username + password).
- **Password resets** are handled via `server/email.js` using the **Resend** API. Reset tokens are SHA-256 hashed before storage and expire after 1 hour.
- The forgot-password endpoint always returns a generic success message to prevent email enumeration.

## Environment Variables

Key env vars required (see `.env.example`):
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — **must** be set in production
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
- `RESEND_API_KEY` — required for password reset emails to send
- `EMAIL_FROM` — sender address for reset emails
- `APP_URL` — base URL for reset email links (defaults to request host)

## Architecture Reference

For a complete overview of the project's architecture, tech stack, database schemas, and design patterns, read `PROJECT_ARCHITECTURE.md`. This is critical for understanding the Canvas UI logic, streaming widgets, and backend structure before making changes.

