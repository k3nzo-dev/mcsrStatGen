// ── Global helpers used by inline onclick attrs ────────────────────────────

function scrollToGenerator() {
  document.getElementById('generator').scrollIntoView({ behavior: 'smooth' });
}

// Tighten nav background on scroll
window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('nav-scrolled', window.scrollY > 10);
});

// ── Bootstrap ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  let currentData = null;
  let currentModules = null;

  // ── Tracked players (persisted in localStorage) ──────────────────────
  const STORAGE_KEY = 'mcsr_tracked_players';
  const trackedPlayers = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  function updateTrackedCount() {
    document.getElementById('stat-players-tracked').textContent = trackedPlayers.size.toLocaleString();
  }
  function trackPlayer(name) {
    trackedPlayers.add(name.toLowerCase());
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...trackedPlayers]));
    updateTrackedCount();
  }
  updateTrackedCount();

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

  // ── Helpers ──────────────────────────────────────────────────────

  function anyModuleEnabled() {
    return togBastion.checked || togSeed.checked || togSplits.checked;
  }

  function getToggleState() {
    return {
      bastion: togBastion.checked,
      seed: togSeed.checked,
      splits: togSplits.checked,
    };
  }

  // ── Search ───────────────────────────────────────────────────────

  async function doSearch() {
    const username = input.value.trim();
    if (!username) return;

    setStatus('loading', 'Fetching player data…');
    cardWrapper.classList.add('hidden');
    dlError.classList.add('hidden');
    searchBtn.disabled = true;
    currentData = null;
    currentModules = null;

    try {
      // 1. Fetch profile
      currentData = await fetchPlayerStats(username);
      const playerUuid = currentData.uuid;

      // 2. Track + render the base card immediately
      trackPlayer(currentData.nickname);
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
