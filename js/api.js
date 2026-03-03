const MCSR_API  = 'https://api.mcsrranked.com';
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
  const res  = await fetch(`${MCSR_API}/leaderboard?amount=${amount}`);
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
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
