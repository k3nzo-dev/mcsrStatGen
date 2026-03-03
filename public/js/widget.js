(async function () {
  const errorEl = document.getElementById('error-msg');
  const wrapper = document.getElementById('card-wrapper');

  // ── 1. Parse username from path + token from query ──────────────────────
  const username = location.pathname.split('/').pop();
  const token    = new URLSearchParams(location.search).get('token');

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

  // ── 3. Initial render ───────────────────────────────────────────────────
  let currentMatchCount = null;

  async function loadAndRender() {
    const data = await fetchPlayerStats(username);
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
      const data = await fetchPlayerStats(username);
      const newCount = data?.statistics?.season?.playedMatches?.ranked ?? null;

      if (newCount !== null && newCount !== currentMatchCount) {
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
