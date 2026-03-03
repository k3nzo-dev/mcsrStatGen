const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      google_id    TEXT UNIQUE,
      email        TEXT,
      display_name TEXT,
      avatar_url   TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id                   SERIAL PRIMARY KEY,
      user_id              INTEGER REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id   TEXT,
      stripe_sub_id        TEXT,
      status               TEXT DEFAULT 'free',
      current_period_end   TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS overlay_configs (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
      mcsr_username TEXT,
      overlay_token UUID UNIQUE DEFAULT gen_random_uuid(),
      style         TEXT DEFAULT 'card',
      poll_interval INT DEFAULT 30,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username      TEXT UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS widget_token  UUID UNIQUE DEFAULT gen_random_uuid();
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mcsr_username TEXT;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tracked_players (
      username     TEXT PRIMARY KEY,
      first_seen   TIMESTAMPTZ DEFAULT NOW(),
      search_count INT DEFAULT 1
    );
  `);
}

module.exports = { pool, initSchema };
