require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const passport = require('./auth');
const { pool, initSchema } = require('./db');
const { router: authRouter } = require('./routes/auth');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Environment detection ─────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production'
  || !!process.env.RAILWAY_ENVIRONMENT;

if (isProduction && !process.env.SESSION_SECRET) {
  console.warn('[server] WARNING: SESSION_SECRET not set — using insecure default.');
}

// Trust reverse proxy so secure cookies work over HTTPS
if (isProduction) app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // CSP is set per-page via <meta> tags
}));

// ── Stripe webhook (needs raw body — must come before express.json()) ────────
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!secret || !stripeKey) return res.sendStatus(200);

  const stripe = require('stripe')(stripeKey);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch (err) {
    console.error('[stripe webhook] signature verification failed:', err.message);
    return res.status(400).send('Webhook signature verification failed.');
  }

  // Respond immediately, process async
  res.sendStatus(200);

  (async () => {
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const userId = Number(session.metadata?.user_id);
          if (!userId) break;
          await pool.query(
            `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_sub_id, status, current_period_end)
             VALUES ($1, $2, $3, 'active', NULL)
             ON CONFLICT (user_id) DO UPDATE
               SET stripe_customer_id = EXCLUDED.stripe_customer_id,
                   stripe_sub_id      = EXCLUDED.stripe_sub_id,
                   status             = 'active'`,
            [userId, session.customer, session.subscription]
          );
          break;
        }
        case 'customer.subscription.updated': {
          const sub = event.data.object;
          await pool.query(
            `UPDATE subscriptions
             SET status = $1, current_period_end = to_timestamp($2)
             WHERE stripe_sub_id = $3`,
            [sub.status === 'active' ? 'active' : sub.status, sub.current_period_end, sub.id]
          );
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          await pool.query(
            `UPDATE subscriptions SET status = 'canceled' WHERE stripe_sub_id = $1`,
            [sub.id]
          );
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          if (invoice.subscription) {
            await pool.query(
              `UPDATE subscriptions SET status = 'past_due' WHERE stripe_sub_id = $1`,
              [invoice.subscription]
            );
          }
          break;
        }
      }
    } catch (err) {
      console.error('[stripe webhook] event processing error:', err.message);
    }
  })();
});

// ── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Sessions ─────────────────────────────────────────────────────────────────
const store = new PgSession({ pool, createTableIfMissing: true });
store.on('error', (err) => console.error('[session store]', err.message));

app.use(session({
  store,
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
  },
}));

// ── Passport ─────────────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ── Rate limiting for auth routes ────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,    // 15 minutes
  max: 20,                      // 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);

// ── CSRF Protection ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // Exclude Stripe webhooks since they come from Stripe, not a browser
    if (req.path === '/webhooks/stripe') return next();

    const requestedWith = req.get('X-Requested-With');
    if (requestedWith !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'CSRF verification failed' });
    }
  }
  next();
});

// ── Routers ───────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/api', apiRouter);

// ── Widget route ──────────────────────────────────────────────────────────────
app.get('/widget/:username', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/widget.html'))
);

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

module.exports = { isProduction };
