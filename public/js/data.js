// ── Tier definitions ───────────────────────────────────────────────────────
// Ordered highest-first so Array.find() short-circuits correctly.
const TIERS = [
  { name: 'Netherite', min: 1500, accent: '#7c3aed', accentBg: '#f5f3ff' },
  { name: 'Diamond',   min: 1200, accent: '#2563eb', accentBg: '#dbeafe' },
  { name: 'Emerald',   min: 1000, accent: '#16a34a', accentBg: '#dcfce7' },
  { name: 'Gold',      min: 800,  accent: '#d97706', accentBg: '#fffbeb' },
  { name: 'Iron',      min: 500,  accent: '#64748b', accentBg: '#f1f5f9' },
  { name: 'Coal',      min: 0,    accent: '#374151', accentBg: '#f3f4f6' },
];

function getTier(eloRate) {
  if (eloRate == null) return null;
  return TIERS.find(t => eloRate >= t.min) ?? TIERS[TIERS.length - 1];
}

/** Milliseconds → "m:ss.mmm" */
function formatTime(ms) {
  if (ms == null) return '--';
  const m   = Math.floor(ms / 60000);
  const s   = Math.floor((ms % 60000) / 1000);
  const ms3 = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0')}`;
}

/** completions / played → "63%" */
function pct(completions, played) {
  if (!played) return '0%';
  return Math.round((completions / played) * 100) + '%';
}

/** ISO 3166-1 alpha-2 → flag emoji */
function flagEmoji(code) {
  if (!code) return '';
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))
  );
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Minecraft usernames: 3–16 chars, letters/digits/underscores only
const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

function validateUsername(username) {
  if (!username)            return 'Please enter a username.';
  if (username.length < 3)  return 'Username must be at least 3 characters.';
  if (username.length > 16) return 'Username must be 16 characters or fewer.';
  if (!USERNAME_RE.test(username))
                            return 'Username can only contain letters, numbers, and underscores.';
  return null; // valid
}

function sanitizeFilename(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}
