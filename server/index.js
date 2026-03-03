require('dotenv').config();

const express    = require('express');
const path       = require('path');
const session    = require('express-session');
const PgSession  = require('connect-pg-simple')(session);
const passport   = require('./auth');
const { pool, initSchema } = require('./db');
const { router: authRouter } = require('./routes/auth');
const apiRouter  = require('./routes/api');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Stripe webhook (needs raw body — must come before express.json()) ────────
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (_req, res) => {
  // TODO: verify STRIPE_WEBHOOK_SECRET and handle events
  res.sendStatus(200);
});

// ── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Sessions ─────────────────────────────────────────────────────────────────
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  },
}));

// ── Passport ─────────────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ── Routers ───────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/api',  apiRouter);

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── Boot ──────────────────────────────────────────────────────────────────────
initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('[server] schema init failed:', err.message);
    // Still start even if DB is unavailable (e.g., dev without Postgres)
    app.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT} (no DB)`);
    });
  });
