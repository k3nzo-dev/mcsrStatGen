function scrollToGenerator() {
  document.getElementById('generator').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('hero-generate-btn')
  ?.addEventListener('click', scrollToGenerator);
document.getElementById('nav-get-started-btn')
  ?.addEventListener('click', scrollToGenerator);

// Tighten nav background on scroll
window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('nav-scrolled', window.scrollY > 10);
});

// ── Nav auth state ──────────────────────────────────────────────────────────

fetch('/api/me', { headers: { Accept: 'application/json' } })
  .then(r => (r.ok ? r.json() : null))
  .then(me => {
    if (!me) return;
    const btn = document.getElementById('nav-auth-btn');
    if (!btn) return;
    btn.textContent = 'Dashboard';
    btn.href = '/dashboard.html';
    btn.style.borderColor = 'var(--green)';
    btn.style.color = 'var(--green)';
  })
  .catch(() => {});

// ── Bootstrap ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  let currentData = null;
  let currentModules = null;

  const input = document.getElementById('username-input');
  const searchBtn = document.getElementById('search-btn');
  const cardWrapper = document.getElementById('card-wrapper');
  const downloadBtn = document.getElementById('download-btn');
  const dlError = document.getElementById('download-error');

  // Toggle checkboxes
  const togBastion = document.getElementById('toggle-bastion');
  const togSeed = document.getElementById('toggle-seed');
  const togSplits = document.getElementById('toggle-splits');

  // Populate dynamic hero stats (best-effort, non-blocking)
  loadHeroStats();

  // ── Rate limiter (10 searches / 60 s) ────────────────────────────────────
  const RATE_MAX = 10, RATE_WINDOW_MS = 60_000;
  const searchTimestamps = [];

  function checkRateLimit() {
    const now = Date.now();
    while (searchTimestamps.length && now - searchTimestamps[0] > RATE_WINDOW_MS) {
      searchTimestamps.shift();
    }
    if (searchTimestamps.length >= RATE_MAX) {
      return Math.ceil((RATE_WINDOW_MS - (now - searchTimestamps[0])) / 1000);
    }
    searchTimestamps.push(now);
    return 0; // OK
  }

  let isSearching = false;

  // ── Helpers ──────────────────────────────────────────────────────

  function getToggleState() {
    return {
      bastion: togBastion.checked,
      seed: togSeed.checked,
      splits: togSplits.checked,
    };
  }

  // ── Search ───────────────────────────────────────────────────────

  async function doSearch() {
    if (isSearching) return;

    const username = input.value.trim();

    const validationError = validateUsername(username);
    if (validationError) {
      setStatus('error', validationError);
      return;
    }

    const waitSecs = checkRateLimit();
    if (waitSecs > 0) {
      setStatus('error', `Too many searches. Please wait ${waitSecs} second${waitSecs !== 1 ? 's' : ''}.`);
      return;
    }

    setStatus('loading', 'Fetching player data…');
    cardWrapper.classList.add('hidden');
    dlError.classList.add('hidden');
    searchBtn.disabled = true;
    currentData = null;
    currentModules = null;
    isSearching = true;

    try {
      // 1. Fetch profile
      currentData = await fetchPlayerStats(username);

      // Record this player in the DB (fire-and-forget, non-blocking)
      fetch('/api/track-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentData.nickname }),
      }).catch(() => {});
      const playerUuid = currentData.uuid;

      // 2. Render the base card immediately
      setStatus('idle');
      renderCard(currentData);

      // 3. If any module is enabled, fetch match data
      const toggles = getToggleState();
      if (toggles.bastion || toggles.seed || toggles.splits) {
        setStatus('loading', 'Fetching match history…');

        const matches = await fetchRecentMatches(username);
        const modules = {};
        modules.lowData = !hasEnoughData(matches);

        // Bastion & Seed can be computed from the match list
        if (toggles.bastion) {
          modules.bastion = groupByBastion(matches, playerUuid);
        }
        if (toggles.seed) {
          modules.seed = groupBySeedType(matches, playerUuid);
        }

        // Splits require per-match detail fetches
        if (toggles.splits) {
          setStatus('loading', 'Loading split data (0/' + matches.length + ')…');
          const details = await fetchMatchesWithTimelines(matches, 10, (done, total) => {
            setStatus('loading', `Loading split data (${done}/${total})…`);
          });
          const splitsResult = computeSplits(details, playerUuid);
          if (splitsResult.length > 0) {
            modules.splits = splitsResult;
          }
        }

        currentModules = modules;
        setStatus('idle');
        renderDetailedStats(modules);
      } else {
        setStatus('idle');
      }
    } catch (err) {
      setStatus('error', err.message);
    } finally {
      searchBtn.disabled = false;
      isSearching = false;
    }
  }

  searchBtn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // ── Download ─────────────────────────────────────────────────────

  downloadBtn.addEventListener('click', async () => {
    if (!currentData) return;
    dlError.classList.add('hidden');
    try {
      await downloadCard(currentData, currentModules);
    } catch (err) {
      dlError.textContent = `Download failed: ${err.message}`;
      dlError.classList.remove('hidden');
    }
  });
});
