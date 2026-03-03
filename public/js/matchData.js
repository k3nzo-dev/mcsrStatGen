// ── Match data processing ──────────────────────────────────────────────────
// Pure functions: no DOM, no fetch. Input → output only.

/**
 * Returns true if the player won the match.
 */
function didPlayerWin(match, playerUuid) {
    return match.result && match.result.uuid === playerUuid;
}

/**
 * Returns true when the match set is large enough for reliable stats.
 */
function hasEnoughData(matches) {
    return matches.length >= 10;
}

// ── Shared bucketing helper ─────────────────────────────────────────────────

/**
 * Group matches by a derived category key and compute win rates.
 *
 * @param {Object[]} matches
 * @param {string}   playerUuid
 * @param {Function} getKey       — (match) → raw category string
 * @param {Function} formatLabel  — (rawKey) → display string
 * @returns {{ type: string, wins: number, total: number, winRate: number }[]}
 *          Sorted by total games descending.
 */
function groupByCategory(matches, playerUuid, getKey, formatLabel) {
    const buckets = {};

    for (const m of matches) {
        const key = getKey(m);
        if (!buckets[key]) buckets[key] = { wins: 0, total: 0 };
        buckets[key].total++;
        if (didPlayerWin(m, playerUuid)) buckets[key].wins++;
    }

    return Object.entries(buckets)
        .map(([key, b]) => ({
            type: formatLabel(key),
            wins: b.wins,
            total: b.total,
            winRate: b.total ? Math.round((b.wins / b.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total);
}

// ── Module 1: Bastion Breakdown ────────────────────────────────────────────

/** Normalise API bastion strings to display names. */
function formatBastionName(raw) {
    const map = {
        TREASURE: 'Treasure',
        BRIDGE: 'Bridge',
        HOUSING: 'Housing',
        STABLES: 'Stables',
    };
    return map[raw?.toUpperCase()] || raw || 'Unknown';
}

function groupByBastion(matches, playerUuid) {
    return groupByCategory(
        matches, playerUuid,
        m => m.bastionType || m.seed?.nether || 'Unknown',
        formatBastionName
    );
}

// ── Module 2: Seed Type Breakdown ──────────────────────────────────────────

/** Normalise seed-type strings for display. */
function formatSeedName(raw) {
    if (!raw) return 'Unknown';
    // "RUINED_PORTAL" → "Ruined Portal"
    return raw
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

function groupBySeedType(matches, playerUuid) {
    return groupByCategory(
        matches, playerUuid,
        m => m.seedType || m.seed?.overworld || 'Unknown',
        formatSeedName
    );
}

// ── Module 3: Splits ───────────────────────────────────────────────────────

/**
 * Timeline type → split label mapping.
 * Order matters: this is the display order.
 */
const SPLIT_DEFS = [
    { label: 'Nether Entry', match: t => t === 'story.enter_the_nether' },
    { label: 'Bastion', match: t => t === 'nether.find_bastion' },
    { label: 'Fortress', match: t => t === 'nether.find_fortress' },
    { label: 'Blind / Exit', match: t => t === 'projectelo.timeline.blind_travel' },
    { label: 'End Enter', match: t => t === 'story.enter_the_end' },
    { label: 'Finish', match: () => false }, // handled separately via result.time
];

/**
 * Compute average split times from detailed match objects (with timelines).
 *
 * @param {Object[]} matchDetails — full match objects (from /matches/{id})
 * @param {string}   playerUuid
 * @returns {{ label: string, avg: number, count: number }[]}
 *          Only includes splits that appeared in at least one match.
 *          avg is in milliseconds.
 */
function computeSplits(matchDetails, playerUuid) {
    const sums = {};   // label → total ms
    const counts = {};   // label → number of data points

    for (const m of matchDetails) {
        if (!m.timelines) continue;

        // Filter timelines to this player only
        const playerTimelines = m.timelines.filter(t => t.uuid === playerUuid);

        for (const def of SPLIT_DEFS) {
            if (def.label === 'Finish') continue; // handled below

            const entry = playerTimelines.find(t => def.match(t.type));
            if (entry) {
                sums[def.label] = (sums[def.label] || 0) + entry.time;
                counts[def.label] = (counts[def.label] || 0) + 1;
            }
        }

        // Finish: use result.time when this player completed
        const completionEntry = (m.completions || []).find(c => c.uuid === playerUuid);
        if (completionEntry) {
            sums['Finish'] = (sums['Finish'] || 0) + completionEntry.time;
            counts['Finish'] = (counts['Finish'] || 0) + 1;
        } else if (m.result && m.result.uuid === playerUuid && m.result.time) {
            sums['Finish'] = (sums['Finish'] || 0) + m.result.time;
            counts['Finish'] = (counts['Finish'] || 0) + 1;
        }
    }

    // Build output in defined order, skipping splits with no data
    return SPLIT_DEFS
        .map(def => {
            const count = counts[def.label] || 0;
            if (count === 0) return null;
            return {
                label: def.label,
                avg: Math.round(sums[def.label] / count),
                count,
            };
        })
        .filter(Boolean);
}
