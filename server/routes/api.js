const express        = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool }       = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();

// ── Public ──────────────────────────────────────────────────────────────────

/** Returns which auth methods are available */
router.get('/auth-config', (_req, res) => {
  res.json({ googleEnabled: !!process.env.GOOGLE_CLIENT_ID, localEnabled: true });
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
router.post('/track-player', async (req, res) => {
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
router.get('/widget-verify', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

/** Public: resolve overlay token → config */
router.get('/overlay/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT mcsr_username, style, poll_interval FROM overlay_configs WHERE overlay_token=$1',
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Authenticated ───────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.google_id, u.email, u.display_name, u.avatar_url, u.created_at,
              u.username, u.widget_token, u.mcsr_username,
              s.status AS sub_status, s.current_period_end
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/me/mcsr-username', requireAuth, async (req, res) => {
  const { mcsr_username } = req.body ?? {};
  if (!mcsr_username || !/^[a-zA-Z0-9_]{1,16}$/.test(mcsr_username)) {
    return res.status(400).json({ error: 'Invalid username (1–16 alphanumeric/underscore chars).' });
  }
  try {
    await pool.query('UPDATE users SET mcsr_username=$1 WHERE id=$2', [mcsr_username, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/me/regen-widget-token', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE users SET widget_token=gen_random_uuid() WHERE id=$1 RETURNING widget_token',
      [req.user.id]
    );
    res.json({ widget_token: rows[0].widget_token });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

router.post('/subscribe', requireAuth, (_req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Payments not yet enabled.' });
  }
  // TODO: create Stripe checkout session
  res.status(501).json({ error: 'Not implemented.' });
});

module.exports = router;
