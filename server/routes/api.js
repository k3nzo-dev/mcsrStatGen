const express = require('express');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();

const isProduction = process.env.NODE_ENV === 'production'
  || !!process.env.RAILWAY_ENVIRONMENT;

function safeError(err) {
  return isProduction ? 'Internal server error.' : err.message;
}

// ── Pro check middleware ─────────────────────────────────────────────────────
async function requirePro(req, res, next) {
  try {
    const { rows } = await pool.query(
      "SELECT status FROM subscriptions WHERE user_id = $1 AND status = 'active'",
      [req.user.id]
    );
    if (!rows.length) return res.status(403).json({ error: 'Pro subscription required.' });
    next();
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
}

// ── Pro product cache ────────────────────────────────────────────────────────
let proProductCache = null;
let proProductCacheAt = 0;
const PRO_PRODUCT_TTL = 5 * 60 * 1000; // 5 minutes

// ── Public ──────────────────────────────────────────────────────────────────

/** Returns which auth methods are available */
router.get('/auth-config', (_req, res) => {
  res.json({ localEnabled: true });
});

/** Public: Stripe product info for the Pro plan */
router.get('/pro-product', async (_req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return res.status(503).json({ error: 'Payments not configured.' });
  }
  // Return cached if fresh
  if (proProductCache && Date.now() - proProductCacheAt < PRO_PRODUCT_TTL) {
    return res.json(proProductCache);
  }
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const price = await stripe.prices.retrieve(process.env.STRIPE_PRICE_ID, {
      expand: ['product'],
    });
    const product = price.product;
    proProductCache = {
      name: product.name,
      description: product.description || '',
      price_amount: price.unit_amount,
      price_currency: price.currency,
      interval: price.recurring?.interval || null,
    };
    proProductCacheAt = Date.now();
    res.json(proProductCache);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/** Site-wide stats (player count, etc.) */
router.get('/site-stats', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) AS count FROM tracked_players');
    res.json({ players_tracked: parseInt(rows[0].count, 10) });
  } catch {
    res.json({ players_tracked: 0 });
  }
});

/** Record a player search (upsert — increments count on repeat) */
const trackPlayerLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many requests.' },
});
router.post('/track-player', trackPlayerLimiter, async (req, res) => {
  const { username } = req.body ?? {};
  if (!username || typeof username !== 'string') return res.sendStatus(204);
  const normalized = username.toLowerCase().trim().slice(0, 40);
  try {
    await pool.query(
      `INSERT INTO tracked_players (username, search_count)
       VALUES ($1, 1)
       ON CONFLICT (username) DO UPDATE
         SET search_count = tracked_players.search_count + 1`,
      [normalized]
    );
  } catch { /* non-critical */ }
  res.sendStatus(204);
});

/** Public: verify widget token */
const widgetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests.' },
});
router.get('/widget-verify', widgetLimiter, async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required' });
  try {
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE widget_token=$1',
      [token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invalid token.' });
    res.json({ valid: true, poll_interval: 30 });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/** Public: fetch widget settings by token */
router.get('/widget-settings-public', widgetLimiter, async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required' });
  try {
    const { rows } = await pool.query(
      'SELECT widget_settings FROM users WHERE widget_token=$1',
      [token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invalid token.' });
    res.json({ widget_settings: rows[0].widget_settings || {} });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

/** Public: resolve overlay token → config */
const overlayLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: { error: 'Too many requests.' },
});
router.get('/overlay/:token', overlayLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT oc.mcsr_username, oc.style, oc.poll_interval, u.widget_settings
       FROM overlay_configs oc
       JOIN users u ON u.id = oc.user_id
       WHERE oc.overlay_token=$1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// ── Daily Top Runs (public) ──────────────────────────────────────────────────
const dailyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests.' },
});

const cstFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getCSTDate() {
  const parts = cstFormatter.formatToParts(new Date());
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

router.get('/daily-top', dailyLimiter, async (req, res) => {
  try {
    const date = req.query.date || getCSTDate();
    const { rows } = await pool.query(
      'SELECT * FROM daily_top_runs WHERE date_cst = $1 ORDER BY run_time ASC',
      [date]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/historical-stats', dailyLimiter, async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
    const { rows } = await pool.query(
      'SELECT * FROM historical_stats ORDER BY date_cst DESC LIMIT $1',
      [days]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/daily-fastest-splits', dailyLimiter, async (req, res) => {
  try {
    const date = req.query.date || getCSTDate();
    const { rows } = await pool.query(
      'SELECT * FROM daily_fastest_splits WHERE date_cst = $1 ORDER BY split_name ASC, run_time ASC',
      [date]
    );
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.split_name]) grouped[row.split_name] = [];
      grouped[row.split_name].push(row);
    }
    res.json({ data: grouped });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// ── Authenticated ───────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.avatar_url, u.created_at,
              u.username, u.widget_token, u.mcsr_username, u.widget_settings,
              s.status AS sub_status, s.current_period_end
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.put('/me/mcsr-username', requireAuth, requirePro, async (req, res) => {
  const { mcsr_username } = req.body ?? {};
  if (!mcsr_username || !/^[a-zA-Z0-9_]{1,16}$/.test(mcsr_username)) {
    return res.status(400).json({ error: 'Invalid username (1–16 alphanumeric/underscore chars).' });
  }
  try {
    await pool.query('UPDATE users SET mcsr_username=$1 WHERE id=$2', [mcsr_username, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// ── Widget settings (Pro only) ───────────────────────────────────────────
const ALLOWED_WIDGET_KEYS = new Set(['theme', 'accentColor', 'showLivePing', 'showFullStats', 'scale']);

router.put('/me/widget-settings', requireAuth, requirePro, async (req, res) => {
  try {
    const raw = req.body ?? {};
    // Only allow known keys
    const settings = {};
    for (const key of ALLOWED_WIDGET_KEYS) {
      if (key in raw) settings[key] = raw[key];
    }
    // Validate specific fields
    if (settings.theme && !['dark', 'light', 'glass'].includes(settings.theme)) {
      return res.status(400).json({ error: 'Invalid theme.' });
    }
    if (settings.accentColor && !/^#[0-9a-fA-F]{6}$/.test(settings.accentColor)) {
      return res.status(400).json({ error: 'Invalid accent color.' });
    }
    if (settings.scale !== undefined) {
      const s = Number(settings.scale);
      if (isNaN(s) || s < 0.5 || s > 2.0) {
        return res.status(400).json({ error: 'Scale must be between 0.5 and 2.0.' });
      }
      settings.scale = s;
    }
    if ('showLivePing' in settings) settings.showLivePing = !!settings.showLivePing;
    if ('showFullStats' in settings) settings.showFullStats = !!settings.showFullStats;

    await pool.query('UPDATE users SET widget_settings=$1 WHERE id=$2', [JSON.stringify(settings), req.user.id]);
    res.json({ ok: true, widget_settings: settings });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post('/me/regen-widget-token', requireAuth, requirePro, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE users SET widget_token=gen_random_uuid() WHERE id=$1 RETURNING widget_token',
      [req.user.id]
    );
    res.json({ widget_token: rows[0].widget_token });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.get('/overlay-configs', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM overlay_configs WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post('/overlay-configs', requireAuth, async (req, res) => {
  const { mcsr_username, style = 'card', poll_interval = 30 } = req.body;
  if (!mcsr_username) return res.status(400).json({ error: 'mcsr_username required' });
  try {
    const token = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO overlay_configs (user_id, mcsr_username, overlay_token, style, poll_interval)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, mcsr_username, token, style, poll_interval]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.put('/overlay-configs/:id', requireAuth, async (req, res) => {
  const { mcsr_username, style, poll_interval } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE overlay_configs
       SET mcsr_username  = COALESCE($1, mcsr_username),
           style          = COALESCE($2, style),
           poll_interval  = COALESCE($3, poll_interval)
       WHERE id=$4 AND user_id=$5
       RETURNING *`,
      [mcsr_username, style, poll_interval, req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.delete('/overlay-configs/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM overlay_configs WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// ── Billing rate limiter ─────────────────────────────────────────────────────
const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many billing requests. Try again later.' },
});

router.post('/subscribe', requireAuth, billingLimiter, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return res.status(503).json({ error: 'Payments not yet enabled.' });
  }
  try {
    // Reject if already active
    const { rows: subRows } = await pool.query(
      "SELECT status FROM subscriptions WHERE user_id = $1 AND status = 'active'",
      [req.user.id]
    );
    if (subRows.length) {
      return res.status(400).json({ error: 'You already have an active subscription.' });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Find or create Stripe customer
    let { rows: userRows } = await pool.query(
      'SELECT s.stripe_customer_id, u.username, u.email FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id WHERE u.id = $1',
      [req.user.id]
    );
    const user = userRows[0];
    let customerId = user?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user?.email || undefined,
        metadata: { user_id: String(req.user.id), username: user?.username || '' },
      });
      customerId = customer.id;
      // Upsert subscription row with customer ID
      await pool.query(
        `INSERT INTO subscriptions (user_id, stripe_customer_id, status)
         VALUES ($1, $2, 'free')
         ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = $2`,
        [req.user.id, customerId]
      );
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${origin}/dashboard.html?upgraded=1`,
      cancel_url: `${origin}/dashboard.html`,
      metadata: { user_id: String(req.user.id) },
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

router.post('/billing-portal', requireAuth, billingLimiter, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Payments not yet enabled.' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({ error: 'No billing account found.' });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const origin = `${req.protocol}://${req.get('host')}`;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard.html`,
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

module.exports = router;
