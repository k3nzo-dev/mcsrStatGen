#!/usr/bin/env node
/**
 * One-time script to set a user to Pro status.
 * Usage: node scripts/set-pro.js <username>
 * Requires DATABASE_URL in .env
 */
require('dotenv').config();
const { Pool } = require('pg');

const username = process.argv[2];
if (!username) {
  console.error('Usage: node scripts/set-pro.js <username>');
  process.exit(1);
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rowCount } = await pool.query(
      `INSERT INTO subscriptions (user_id, status)
       SELECT id, 'active' FROM users WHERE username = $1
       ON CONFLICT (user_id) DO UPDATE SET status = 'active'`,
      [username.toLowerCase()]
    );
    if (rowCount) {
      console.log(`Set ${username} to Pro (active).`);
    } else {
      console.error(`User "${username}" not found.`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
