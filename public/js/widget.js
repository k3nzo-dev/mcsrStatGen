(async function () {
  const errorEl = document.getElementById('error-msg');
  const wrapper = document.getElementById('card-wrapper');

  // ── 1. Parse username from path + token from query ──────────────────────
  const username = location.pathname.split('/').pop();
  const params   = new URLSearchParams(location.search);
  const token    = params.get('token');

  if (!username || !token) {
    errorEl.textContent = 'Invalid widget link.';
    return;
  }

  // ── 2. Verify token with server ─────────────────────────────────────────
  let poll_interval;
  try {
    const res = await fetch(`/api/widget-verify?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      errorEl.textContent = 'Invalid widget link.';
      return;
    }
    ({ poll_interval } = await res.json());
  } catch {
    errorEl.textContent = 'Could not reach the server.';
    return;
  }

  // ── 3. Resolve widget settings ──────────────────────────────────────────
  // Priority: URL params (from dashboard preview) > server-stored settings
  function getSettings() {
    const settings = {
      theme: 'light',
      accentColor: '#10b981',
      showBastion: true,
      showOverworld: true,
      showSplits: false,
    };

    // URL param overrides (for live preview in dashboard)
    if (params.has('theme')) settings.theme = params.get('theme');
    if (params.has('accentColor')) settings.accentColor = params.get('accentColor');
    if (params.has('showBastion')) settings.showBastion = params.get('showBastion') === 'true';
    if (params.has('showOverworld')) settings.showOverworld = params.get('showOverworld') === 'true';
    if (params.has('showSplits')) settings.showSplits = params.get('showSplits') === 'true';

    return settings;
  }

  // Fetch server-stored settings as fallback (only if no URL overrides)
  let serverSettings = null;
  if (!params.has('theme') && !params.has('accentColor')) {
    try {
      const res = await fetch(`/api/widget-settings-public?token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json();
        serverSettings = data.widget_settings || {};
      }
    } catch { /* use defaults */ }
  }

  function resolveSettings() {
    const defaults = getSettings();
    if (serverSettings && !params.has('theme')) {
      // Merge server settings as base, URL params override
      return {
        theme: serverSettings.theme || defaults.theme,
        accentColor: serverSettings.accentColor || defaults.accentColor,
        showBastion: typeof serverSettings.showBastion === 'boolean' ? serverSettings.showBastion : defaults.showBastion,
        showOverworld: typeof serverSettings.showOverworld === 'boolean' ? serverSettings.showOverworld : defaults.showOverworld,
        showSplits: typeof serverSettings.showSplits === 'boolean' ? serverSettings.showSplits : defaults.showSplits,
      };
    }
    return defaults;
  }

  // ── 4. Apply settings to DOM ────────────────────────────────────────────
  function applySettings(settings) {
    // Accent color
    document.documentElement.style.setProperty('--accent', settings.accentColor);
    document.documentElement.style.setProperty('--green', settings.accentColor);

    // Theme class on .mc-card
    const card = document.querySelector('.mc-card');
    if (card) {
      card.classList.remove('theme-dark', 'theme-light', 'theme-glass');
      card.classList.add('theme-' + settings.theme);
    }

    // Accent bar color
    const accentBar = document.querySelector('.mc-accent-bar');
    if (accentBar) {
      accentBar.style.background = `linear-gradient(90deg, ${settings.accentColor}, ${settings.accentColor}88)`;
    }

    // Win rate bar fills
    document.querySelectorAll('.mc-wr-bar-fill').forEach(el => {
      el.style.background = settings.accentColor;
    });
  }

  // ── 5. Initial render ───────────────────────────────────────────────────
  let currentMatchCount = null;
  const settings = resolveSettings();
  let currentSettings = { ...settings };

  function notifyParentHeight() {
    if (window.parent === window) return;
    const rect = wrapper.getBoundingClientRect();
    window.parent.postMessage({
      type: 'widget-height-update',
      height: rect.height,
    }, location.origin);
  }

  async function loadAndRender() {
    const data = await fetchPlayerStats(username);
    renderCard(data);
    currentMatchCount = data?.statistics?.season?.playedMatches?.ranked ?? null;

    // Fetch and render detailed stats based on toggle settings
    if (currentSettings.showBastion || currentSettings.showOverworld || currentSettings.showSplits) {
      try {
        const matches = await fetchRecentMatches(username);
        const modules = {};
        modules.lowData = !hasEnoughData(matches);
        const playerUuid = data.uuid;

        if (currentSettings.showBastion) {
          modules.bastion = groupByBastion(matches, playerUuid);
        }
        if (currentSettings.showOverworld) {
          modules.seed = groupBySeedType(matches, playerUuid);
        }
        if (currentSettings.showSplits) {
          const details = await fetchMatchesWithTimelines(matches, 10);
          const splitsResult = computeSplits(details, playerUuid);
          if (splitsResult.length > 0) {
            modules.splits = splitsResult;
          }
        }

        renderDetailedStats(modules);
      } catch { /* keep base card if match data fails */ }
    }

    // Apply settings after render (renderCard + detailed stats rebuild the DOM)
    applySettings(currentSettings);
    notifyParentHeight();
  }

  try {
    await loadAndRender();
  } catch (err) {
    errorEl.textContent = 'Failed to load player: ' + err.message;
    return;
  }

  // ── 6. Listen for postMessage from dashboard preview ────────────────────

  window.addEventListener('message', async (e) => {
    if (e.origin !== location.origin) return;
    if (!e.data || e.data.type !== 'widget-settings-update') return;

    const newSettings = e.data.settings;
    const needsRebuild =
      newSettings.showBastion !== currentSettings.showBastion ||
      newSettings.showOverworld !== currentSettings.showOverworld ||
      newSettings.showSplits !== currentSettings.showSplits;
    Object.assign(currentSettings, newSettings);

    if (needsRebuild) {
      try { await loadAndRender(); } catch { /* keep last state */ }
    } else {
      applySettings(currentSettings);
      notifyParentHeight();
    }
  });

  // ── 7. Polling ──────────────────────────────────────────────────────────
  const INTERVAL_MS = Math.max(10, poll_interval) * 1000;

  setInterval(async () => {
    try {
      const data = await fetchPlayerStats(username);
      const newCount = data?.statistics?.season?.playedMatches?.ranked ?? null;

      if (newCount !== null && newCount !== currentMatchCount) {
        wrapper.classList.add('fading');
        await new Promise(r => setTimeout(r, 420));
        renderCard(data);
        applySettings(currentSettings);
        wrapper.classList.remove('fading');
        currentMatchCount = newCount;
        notifyParentHeight();
      }
    } catch {
      // Silent: keep showing last known state
    }
  }, INTERVAL_MS);
})();
