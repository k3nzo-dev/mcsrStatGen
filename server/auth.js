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


module.exports = passport;
