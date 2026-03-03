const express  = require('express');
const bcrypt   = require('bcrypt');
const passport = require('../auth');
const { pool } = require('../db');

const router = express.Router();

const isProduction = process.env.NODE_ENV === 'production'
                  || !!process.env.RAILWAY_ENVIRONMENT;

function safeError(err) {
  return isProduction ? 'Internal server error.' : err.message;
}

// ── Middleware ──────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  // API callers get JSON; page navigations get a redirect
  const wantsJson = (req.headers.accept || '').includes('application/json');
  if (wantsJson) return res.status(401).json({ error: 'Unauthorized' });
  res.redirect('/login.html');
}

async function requirePro(req, res, next) {
  try {
    const { rows } = await pool.query(
      "SELECT status FROM subscriptions WHERE user_id = $1 AND status = 'active'",
      [req.user.id]
    );
    if (rows.length) return next();
    res.status(403).json({ error: 'Pro subscription required.' });
  } catch {
    res.status(500).json({ error: 'Could not verify subscription.' });
  }
}

// ── Local auth routes ────────────────────────────────────────────────────────

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

router.post('/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !USERNAME_RE.test(username.toLowerCase().trim())) {
    return res.status(400).json({ error: 'Username must be 3–20 characters (letters, numbers, underscores).' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const normalized = username.toLowerCase().trim();
  try {
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE username = $1', [normalized]
    );
    if (existing.length) return res.status(409).json({ error: 'Username already taken.' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING *',
      [normalized, hash]
    );
    req.login(rows[0], err => {
      if (err) return res.status(500).json({ error: safeError(err) });
      res.json({ ok: true });
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return res.status(500).json({ error: safeError(err) });
    if (!user) return res.status(401).json({ error: info?.message ?? 'Invalid credentials.' });
    req.login(user, loginErr => {
      if (loginErr) return res.status(500).json({ error: safeError(loginErr) });
      res.json({ ok: true });
    });
  })(req, res, next);
});

// ── Google OAuth routes (only registered when credentials are set) ──────────

if (process.env.GOOGLE_CLIENT_ID) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    (_req, res) => res.redirect('/dashboard.html')
  );
}

// ── Dev login (disabled in production) ─────────────────────────────────────

if (!isProduction) {
  router.post('/dev-login', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (google_id, email, display_name)
         VALUES ('dev', 'dev@localhost', 'Dev User')
         ON CONFLICT (google_id) DO UPDATE
           SET display_name = EXCLUDED.display_name
         RETURNING *`
      );
      req.login(rows[0], err => {
        if (err) return res.status(500).json({ error: safeError(err) });
        res.json({ ok: true });
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });
}

// ── Logout ──────────────────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  req.logout(() => res.redirect('/login.html'));
});

module.exports = { router, requireAuth, requirePro };
