(async function () {
  const errorEl   = document.getElementById('error-msg');
  const wrapper   = document.getElementById('card-wrapper');

  // ── 1. Parse token from URL ─────────────────────────────────────────────
  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) {
    errorEl.textContent = 'Invalid overlay link.';
    return;
  }

  // ── 2. Resolve token → config ───────────────────────────────────────────
  let config;
  try {
    const res = await fetch(`/api/overlay/${encodeURIComponent(token)}`);
    if (res.status === 404) {
      errorEl.textContent = 'Invalid overlay link.';
      return;
    }
    config = await res.json();
    if (config.error) {
      errorEl.textContent = 'Overlay error: ' + config.error;
      return;
    }
  } catch {
    errorEl.textContent = 'Could not reach the server.';
    return;
  }

  const { mcsr_username, poll_interval } = config;

  // ── 3. Initial render ───────────────────────────────────────────────────
  let currentMatchCount = null;

  async function loadAndRender() {
    const data = await fetchPlayerStats(mcsr_username);
    renderCard(data);
    currentMatchCount = data?.statistics?.season?.playedMatches?.ranked ?? null;
  }

  try {
    await loadAndRender();
  } catch (err) {
    errorEl.textContent = 'Failed to load player: ' + err.message;
    return;
  }

  // ── 4. Polling ──────────────────────────────────────────────────────────
  const INTERVAL_MS = Math.max(10, poll_interval) * 1000;

  setInterval(async () => {
    try {
      const data = await fetchPlayerStats(mcsr_username);
      const newCount = data?.statistics?.season?.playedMatches?.ranked ?? null;

      if (newCount !== null && newCount !== currentMatchCount) {
        // Fade out → re-render → fade in
        wrapper.classList.add('fading');
        await new Promise(r => setTimeout(r, 420));
        renderCard(data);
        wrapper.classList.remove('fading');
        currentMatchCount = newCount;
      }
    } catch {
      // Silent: keep showing last known state
    }
  }, INTERVAL_MS);
})();
