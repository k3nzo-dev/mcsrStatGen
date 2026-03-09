const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS widget_settings JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMPTZ;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_unique
      ON subscriptions (user_id);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
      ON users (email) WHERE email IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tracked_players (
      username     TEXT PRIMARY KEY,
      first_seen   TIMESTAMPTZ DEFAULT NOW(),
      search_count INT DEFAULT 1
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_top_runs (
      id            SERIAL PRIMARY KEY,
      match_id      INT UNIQUE NOT NULL,
      user_uuid     TEXT NOT NULL,
      nickname      TEXT NOT NULL,
      run_time      INT NOT NULL,
      date_cst      DATE NOT NULL,
      bastion_type  TEXT,
      seed_type     TEXT,
      timeline_json JSONB,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS historical_stats (
      id                        SERIAL PRIMARY KEY,
      date_cst                  DATE UNIQUE NOT NULL,
      avg_run_time              INT,
      avg_splits_json           JSONB,
      bastion_distribution_json JSONB
    );

    CREATE TABLE IF NOT EXISTS daily_fastest_splits (
      id         SERIAL PRIMARY KEY,
      split_name TEXT NOT NULL,
      run_time   INT NOT NULL,
      match_id   INT NOT NULL,
      user_uuid  TEXT NOT NULL,
      nickname   TEXT NOT NULL,
      date_cst   DATE NOT NULL
    );
  `);
}

module.exports = { pool, initSchema };
