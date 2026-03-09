/**
 * Match Poller — polls MCSR Ranked API every 2 minutes for completed matches,
 * stores the top 100 fastest runs per day (UTC), tracks fastest splits,
 * and rolls up historical stats at midnight UTC.
 */

const POLL_INTERVAL = 120_000; // 2 minutes
const API_BASE = 'https://api.mcsrranked.com';
const FETCH_DELAY = 200; // ms between sequential detail fetches

const SPLIT_MAP = {
  'story.enter_the_nether':             'enter_nether',
  'nether.find_bastion':                'bastion',
  'nether.find_fortress':               'fortress',
  'projectelo.timeline.blind_travel':   'blind',
  'story.enter_the_end':                'end_enter',
};

// ── UTC Date Helper ──────────────────────────────────────────────────────────
function getUTCDate() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ── Main ─────────────────────────────────────────────────────────────────────
function startMatchPoller(pool) {
  let lastDateUTC = getUTCDate();

  async function poll() {
    try {
      const todayUTC = getUTCDate();

      // ── Midnight rollover ────────────────────────────────────────────────
      if (todayUTC !== lastDateUTC) {
        await rolloverDay(pool, lastDateUTC);
        lastDateUTC = todayUTC;
      }

      // ── Fetch recent matches ─────────────────────────────────────────────
      const data = await fetchJSON(`${API_BASE}/matches?count=50&type=2`);
      const matches = Array.isArray(data?.data) ? data.data : [];

      // Filter to completed, non-forfeited matches with a result
      const completed = matches.filter(m =>
        m.forfeited === false &&
        m.result?.time != null &&
        m.result?.uuid != null
      );

      if (completed.length === 0) return;

      // Check which match IDs we already have
      const matchIds = completed.map(m => m.id);
      const { rows: existing } = await pool.query(
        `SELECT match_id FROM daily_top_runs WHERE match_id = ANY($1)`,
        [matchIds]
      );
      const existingIds = new Set(existing.map(r => r.match_id));

      const newMatches = completed.filter(m => !existingIds.has(m.id));
      if (newMatches.length === 0) return;

      // Get current board state for today
      const { rows: boardRows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt, MAX(run_time) AS slowest
         FROM daily_top_runs WHERE date_cst = $1`,
        [todayUTC]
      );
      let boardCount = boardRows[0].cnt;
      let slowest = boardRows[0].slowest;

      // Process matches sequentially to respect rate limits
      for (const match of newMatches) {
        const runTime = match.result.time;

        // Does this match qualify?
        if (boardCount >= 100 && runTime >= slowest) continue;

        try {
          // Fetch full match detail for timeline data
          const detail = await fetchJSON(`${API_BASE}/matches/${match.id}`);
          await sleep(FETCH_DELAY);

          const matchData = detail?.data || detail;
          const timelines = matchData?.timelines || null;
          const bastionType = matchData?.bastionType || null;
          const seedType = matchData?.seedType || matchData?.seed_type || null;

          // Find the winning player's nickname
          const winnerUuid = match.result.uuid;
          let nickname = winnerUuid;
          const members = matchData?.members || matchData?.players || [];
          for (const member of members) {
            if (member.uuid === winnerUuid) {
              nickname = member.nickname || member.name || winnerUuid;
              break;
            }
          }

          // Insert into daily_top_runs
          await pool.query(
            `INSERT INTO daily_top_runs
               (match_id, user_uuid, nickname, run_time, date_cst, bastion_type, seed_type, timeline_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (match_id) DO NOTHING`,
            [match.id, winnerUuid, nickname, runTime, todayUTC, bastionType, seedType,
             timelines ? JSON.stringify(timelines) : null]
          );

          // If board was full, remove the slowest
          if (boardCount >= 100) {
            await pool.query(
              `DELETE FROM daily_top_runs
               WHERE id = (
                 SELECT id FROM daily_top_runs
                 WHERE date_cst = $1
                 ORDER BY run_time DESC
                 LIMIT 1
               )`,
              [todayUTC]
            );
            // Re-query slowest after deletion
            const { rows: updated } = await pool.query(
              `SELECT MAX(run_time) AS slowest FROM daily_top_runs WHERE date_cst = $1`,
              [todayUTC]
            );
            slowest = updated[0].slowest;
          } else {
            boardCount++;
            if (runTime > (slowest || 0)) slowest = runTime;
          }

          // ── Fastest splits ───────────────────────────────────────────────
          if (Array.isArray(timelines)) {
            await processSplits(pool, timelines, winnerUuid, nickname, match.id, todayUTC);
          }
        } catch (err) {
          console.error('[MatchPoller] error processing match', match.id, err.message);
        }
      }
    } catch (err) {
      console.error('[MatchPoller] poll error:', err.message);
    }
  }

  // Run immediately, then every 2 minutes
  poll();
  setInterval(poll, POLL_INTERVAL);
  console.log('[MatchPoller] started (polling every 2 min)');
}

// ── Fastest Splits ───────────────────────────────────────────────────────────
async function processSplits(pool, timelines, winnerUuid, nickname, matchId, dateUTC) {
  // Extract split times for the winning player
  for (const event of timelines) {
    const splitName = SPLIT_MAP[event.type || event.timeline];
    if (!splitName) continue;

    // Only count the winner's events
    if (event.uuid !== winnerUuid) continue;

    const splitTime = event.time;
    if (splitTime == null) continue;

    try {
      const { rows } = await pool.query(
        `SELECT id, run_time FROM daily_fastest_splits
         WHERE split_name = $1 AND date_cst = $2
         ORDER BY run_time ASC`,
        [splitName, dateUTC]
      );

      if (rows.length < 3) {
        await pool.query(
          `INSERT INTO daily_fastest_splits
             (split_name, run_time, match_id, user_uuid, nickname, date_cst)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [splitName, splitTime, matchId, winnerUuid, nickname, dateUTC]
        );
      } else if (splitTime < rows[rows.length - 1].run_time) {
        // Faster than the 3rd-place entry — insert and remove the slowest
        await pool.query(
          `INSERT INTO daily_fastest_splits
             (split_name, run_time, match_id, user_uuid, nickname, date_cst)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [splitName, splitTime, matchId, winnerUuid, nickname, dateUTC]
        );
        await pool.query(
          `DELETE FROM daily_fastest_splits WHERE id = $1`,
          [rows[rows.length - 1].id]
        );
      }
    } catch (err) {
      console.error('[MatchPoller] split error:', splitName, err.message);
    }
  }
}

// ── Midnight Rollover ────────────────────────────────────────────────────────
async function rolloverDay(pool, previousDate) {
  try {
    console.log('[MatchPoller] midnight rollover for', previousDate);

    const { rows: runs } = await pool.query(
      `SELECT run_time, timeline_json, bastion_type FROM daily_top_runs WHERE date_cst = $1`,
      [previousDate]
    );

    if (runs.length === 0) return;

    // Average run time
    const avgRunTime = Math.round(
      runs.reduce((sum, r) => sum + r.run_time, 0) / runs.length
    );

    // Average splits
    const splitTotals = {};
    const splitCounts = {};
    for (const run of runs) {
      if (!Array.isArray(run.timeline_json)) continue;
      for (const event of run.timeline_json) {
        const splitName = SPLIT_MAP[event.type || event.timeline];
        if (!splitName || event.time == null) continue;
        splitTotals[splitName] = (splitTotals[splitName] || 0) + event.time;
        splitCounts[splitName] = (splitCounts[splitName] || 0) + 1;
      }
    }
    const avgSplitsJson = {};
    for (const name of Object.keys(splitTotals)) {
      avgSplitsJson[name] = Math.round(splitTotals[name] / splitCounts[name]);
    }

    // Bastion distribution
    const bastionDist = {};
    for (const run of runs) {
      const bt = run.bastion_type || 'unknown';
      bastionDist[bt] = (bastionDist[bt] || 0) + 1;
    }

    await pool.query(
      `INSERT INTO historical_stats
         (date_cst, avg_run_time, avg_splits_json, bastion_distribution_json)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (date_cst) DO NOTHING`,
      [previousDate, avgRunTime, JSON.stringify(avgSplitsJson), JSON.stringify(bastionDist)]
    );

    console.log('[MatchPoller] rollover complete:', runs.length, 'runs aggregated');
  } catch (err) {
    console.error('[MatchPoller] rollover error:', err.message);
  }
}

module.exports = { startMatchPoller };
