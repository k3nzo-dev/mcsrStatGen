const passport      = require('passport');
const bcrypt        = require('bcrypt');
const LocalStrategy = require('passport-local').Strategy;
const { pool }      = require('./db');

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    done(null, rows[0] || false);
  } catch (err) {
    done(err);
  }
});

passport.use(new LocalStrategy(
  { usernameField: 'username', passwordField: 'password' },
  async (username, password, done) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM users WHERE username = $1', [username.toLowerCase().trim()]
      );
      const user = rows[0];
      if (!user || !user.password_hash) return done(null, false, { message: 'Invalid credentials.' });
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return done(null, false, { message: 'Invalid credentials.' });
      done(null, user);
    } catch (err) { done(err); }
  }
));

if (process.env.GOOGLE_CLIENT_ID) {
  const GoogleStrategy = require('passport-google-oauth20').Strategy;

  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email    = profile.emails?.[0]?.value ?? null;
        const avatar   = profile.photos?.[0]?.value ?? null;
        const { rows } = await pool.query(
          `INSERT INTO users (google_id, email, display_name, avatar_url)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (google_id) DO UPDATE
             SET email        = EXCLUDED.email,
                 display_name = EXCLUDED.display_name,
                 avatar_url   = EXCLUDED.avatar_url
           RETURNING *`,
          [profile.id, email, profile.displayName, avatar]
        );
        done(null, rows[0]);
      } catch (err) {
        done(err);
      }
    }
  ));
} else {
  console.warn('[auth] GOOGLE_CLIENT_ID not set — Google OAuth disabled.');
}

module.exports = passport;
