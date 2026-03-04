const express  = require('express');
const crypto   = require('crypto');
const bcrypt   = require('bcrypt');
const passport = require('../auth');
const { pool } = require('../db');
const { sendPasswordResetEmail } = require('../email');

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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  const { username, password, email } = req.body ?? {};
  if (!username || !USERNAME_RE.test(username.toLowerCase().trim())) {
    return res.status(400).json({ error: 'Username must be 3–20 characters (letters, numbers, underscores).' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  const trimmedEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }
  const normalized = username.toLowerCase().trim();
  try {
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE username = $1', [normalized]
    );
    if (existing.length) return res.status(409).json({ error: 'Username already taken.' });

    const { rows: emailExists } = await pool.query(
      'SELECT id FROM users WHERE email = $1', [trimmedEmail]
    );
    if (emailExists.length) return res.status(409).json({ error: 'Email already in use.' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING *',
      [normalized, hash, trimmedEmail]
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
    req.session.regenerate(regErr => {
      if (regErr) return res.status(500).json({ error: safeError(regErr) });
      req.login(user, loginErr => {
        if (loginErr) return res.status(500).json({ error: safeError(loginErr) });
        res.json({ ok: true });
      });
    });
  })(req, res, next);
});

// ── Dev login (disabled in production) ─────────────────────────────────────

if (!isProduction) {
  router.post('/dev-login', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (username, display_name)
         VALUES ('dev', 'Dev User')
         ON CONFLICT (username) DO UPDATE
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

// ── Forgot / Reset Password ─────────────────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body ?? {};
  // Always return generic success to prevent email enumeration
  const genericOk = { ok: true, message: 'If that email is registered, a reset link has been sent.' };

  if (!email || !EMAIL_RE.test(email.trim().toLowerCase())) {
    return res.json(genericOk);
  }

  try {
    const normalized = email.trim().toLowerCase();
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [normalized]);
    if (!rows.length) return res.json(genericOk);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3',
      [tokenHash, expires, rows[0].id]
    );

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const resetLink = `${appUrl}/reset-password.html?token=${token}`;

    try {
      await sendPasswordResetEmail(normalized, resetLink);
    } catch (mailErr) {
      console.error('[auth] failed to send reset email:', mailErr.message);
    }

    res.json(genericOk);
  } catch (err) {
    console.error('[auth] forgot-password error:', err.message);
    res.json(genericOk);
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body ?? {};

  if (!token || !password || password.length < 8) {
    return res.status(400).json({ error: 'Invalid token or password too short (min 8 characters).' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()',
      [tokenHash]
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
      [hash, rows[0].id]
    );

    // Invalidate all existing sessions for this user
    await pool.query(
      "DELETE FROM session WHERE sess::jsonb -> 'passport' ->> 'user' = $1",
      [String(rows[0].id)]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// ── Logout ──────────────────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  req.logout(() => res.redirect('/login.html'));
});

module.exports = { router, requireAuth, requirePro };
