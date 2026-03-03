const MCSR_API = 'https://api.mcsrranked.com';
const SKIN_BASE = 'https://mc-heads.net/body';

/** Fetch full player profile from MCSR Ranked API */
async function fetchPlayerStats(username) {
  const res = await fetch(`${MCSR_API}/users/${encodeURIComponent(username)}`);

  let json;
  try { json = await res.json(); }
  catch { throw new Error(`API error (HTTP ${res.status}).`); }

  if (json.status !== 'success') {
    throw new Error(json.error ?? `Player "${username}" not found.`);
  }
  return json.data;
}

/** Fetch top N leaderboard entries */
async function fetchLeaderboard(amount = 1) {
  const res = await fetch(`${MCSR_API}/leaderboard?amount=${amount}`);
  const json = await res.json();
  if (json.status !== 'success') throw new Error('Could not load leaderboard.');
  return json.data;
}

/**
 * Fetch a player's body skin as a Blob.
 * Returns null (never throws) so callers can handle a missing skin gracefully.
 */
async function loadSkinBlob(uuid) {
  try {
    const res = await fetch(`${SKIN_BASE}/${uuid}/200`, { mode: 'cors' });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Blob → data-URL string (same-origin, safe for canvas export) */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Match data endpoints ──────────────────────────────────────────────────

/**
 * Fetch a player's recent ranked matches.
 * @param {string} username
 * @param {number} count — number of matches (max 100)
 * @returns {Object[]} array of match objects
 */
async function fetchRecentMatches(username, count = 100) {
  const res = await fetch(
    `${MCSR_API}/users/${encodeURIComponent(username)}/matches?type=2&count=${count}`
  );

  let json;
  try { json = await res.json(); }
  catch { throw new Error(`Match history API error (HTTP ${res.status}).`); }

  if (json.status !== 'success') {
    throw new Error(json.error ?? 'Could not load match history.');
  }
  return json.data;
}

/**
 * Fetch a single match's full detail (includes timelines).
 * Returns null on failure so a single bad match doesn't break the batch.
 */
async function fetchMatchDetail(matchId) {
  try {
    const res = await fetch(`${MCSR_API}/matches/${matchId}`);
    const json = await res.json();
    if (json.status !== 'success') return null;
    return json.data;
  } catch {
    return null;
  }
}

/**
 * Fetch full details (with timelines) for an array of matches,
 * in batches to respect rate limits.
 *
 * @param {Object[]} matches      — match objects from the list endpoint
 * @param {number}   batchSize    — parallel requests per batch
 * @param {Function} onProgress   — called with (completed, total)
 * @returns {Object[]} detail objects (nulls filtered out)
 */
async function fetchMatchesWithTimelines(matches, batchSize = 10, onProgress) {
  const ids = matches.map(m => m.id);
  const results = [];
  let completed = 0;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const details = await Promise.all(batch.map(id => fetchMatchDetail(id)));
    results.push(...details);
    completed += batch.length;
    if (onProgress) onProgress(completed, ids.length);
  }

  return results.filter(Boolean);
}
