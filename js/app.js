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

  const input       = document.getElementById('username-input');
  const searchBtn   = document.getElementById('search-btn');
  const cardWrapper = document.getElementById('card-wrapper');
  const downloadBtn = document.getElementById('download-btn');
  const dlError     = document.getElementById('download-error');

  // Populate dynamic hero stats (best-effort, non-blocking)
  loadHeroStats();

  // ── Search ───────────────────────────────────────────────────
  async function doSearch() {
    const username = input.value.trim();
    if (!username) return;

    setStatus('loading', 'Fetching player data…');
    cardWrapper.classList.add('hidden');
    dlError.classList.add('hidden');
    searchBtn.disabled = true;
    currentData = null;

    try {
      currentData = await fetchPlayerStats(username);
      setStatus('idle');
      renderCard(currentData);
    } catch (err) {
      setStatus('error', err.message);
    } finally {
      searchBtn.disabled = false;
    }
  }

  searchBtn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // ── Download ─────────────────────────────────────────────────
  downloadBtn.addEventListener('click', async () => {
    if (!currentData) return;
    dlError.classList.add('hidden');
    try {
      await downloadCard(currentData);
    } catch (err) {
      dlError.textContent = `Download failed: ${err.message}`;
      dlError.classList.remove('hidden');
    }
  });
});
