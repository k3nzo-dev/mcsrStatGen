// ── Constants ──────────────────────────────────────────────────────────────
const MCSR_API      = 'https://api.mcsrranked.com/users/';
const SKIN_BODY = 'https://mc-heads.net/body/';

// ELO tier thresholds (approximate; see wiki.mcsrranked.com for exact values)
// Ordered highest-first so Array.find() returns the correct tier.
const TIERS = [
  { name: 'Netherite', min: 1500, bg: '#1e0f0f', border: '#6b3030', badge: '#c09080' },
  { name: 'Diamond',   min: 1200, bg: '#071828', border: '#1a6080', badge: '#60d0f0' },
  { name: 'Emerald',   min: 1000, bg: '#071808', border: '#1a6020', badge: '#40c840' },
  { name: 'Gold',      min: 800,  bg: '#181400', border: '#705800', badge: '#f0c040' },
  { name: 'Iron',      min: 500,  bg: '#141414', border: '#484848', badge: '#b8b8b8' },
  { name: 'Coal',      min: 0,    bg: '#0e0e0e', border: '#2a2a2a', badge: '#686868' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function getTier(eloRate) {
  if (eloRate == null) return null;
  return TIERS.find(t => eloRate >= t.min) ?? TIERS[TIERS.length - 1];
}

/** Convert milliseconds → "m:ss.mmm" */
function formatTime(ms) {
  if (ms == null) return '--';
  const m  = Math.floor(ms / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  const ms3 = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0')}`;
}

/** Completion rate as a percentage string */
function pct(completions, played) {
  if (!played) return '0%';
  return Math.round((completions / played) * 100) + '%';
}

/** ISO 3166-1 alpha-2 → flag emoji (works in HTML; skipped in canvas) */
function flagEmoji(code) {
  if (!code) return '';
  return code.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))
  );
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── API fetch ──────────────────────────────────────────────────────────────

async function fetchPlayerStats(username) {
  const res = await fetch(`${MCSR_API}${encodeURIComponent(username)}`);

  // The API returns 400 for unknown players, so always try to parse the body
  // before deciding whether this is an error.
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`API error (HTTP ${res.status}).`);
  }

  if (json.status !== 'success') {
    throw new Error(json.error ?? `Player "${username}" not found.`);
  }
  return json.data;
}

// ── DOM card renderer ──────────────────────────────────────────────────────

function renderCard(data) {
  const { nickname, eloRate, eloRank, uuid, statistics, country } = data;

  const tier   = getTier(eloRate);
  const skinUrl = `${SKIN_BODY}${uuid}/200`;

  const s = statistics.season;
  const t = statistics.total;

  // Tier-coloured ELO display
  const eloColor    = tier ? tier.badge  : '#666680';
  const borderColor = tier ? tier.border : '#2a2a40';
  const bgColor     = tier ? tier.bg     : '#12121e';

  const tierBadge = tier
    ? `<span class="tier-badge" style="color:${tier.badge};border-color:${tier.badge}55;background:${tier.badge}18">${tier.name}</span>`
    : '';

  const eloLine = eloRate != null
    ? `<div class="elo-display" style="color:${eloColor}">${eloRate.toLocaleString()} ${tierBadge}</div>`
    : `<div class="elo-display unranked">UNRANKED</div>`;

  const rankLine = eloRank != null
    ? `<div class="rank-display">Rank #${eloRank.toLocaleString()}</div>`
    : '';

  const flag = country ? `<span class="country-flag" title="${country.toUpperCase()}">${flagEmoji(country)}</span>` : '';

  document.getElementById('card').innerHTML = `
    <div class="card-inner" style="border-color:${borderColor};background:${bgColor}">
      <div class="card-skin">
        <img id="skin-img"
             src="${skinUrl}"
             alt="${escapeHtml(nickname)}'s Minecraft skin">
      </div>
      <div class="card-stats">
        <div class="player-name">${flag}${escapeHtml(nickname)}</div>
        ${eloLine}
        ${rankLine}

        <div class="stats-divider"></div>
        <div class="stats-section-label">Season</div>
        <div class="stats-row">
          <span class="stat-item wins">W ${s.wins.ranked}</span>
          <span class="stat-item losses">L ${s.loses.ranked}</span>
          <span class="stat-item cr">CR ${pct(s.completions.ranked, s.playedMatches.ranked)}</span>
        </div>
        <div class="stats-row">
          <span class="stat-label">Best</span>
          <span class="stat-value">${formatTime(s.bestTime.ranked)}</span>
        </div>

        <div class="stats-divider"></div>
        <div class="stats-section-label">Career</div>
        <div class="stats-row">
          <span class="stat-item wins">W ${t.wins.ranked}</span>
          <span class="stat-item losses">L ${t.loses.ranked}</span>
          <span class="stat-item cr">CR ${pct(t.completions.ranked, t.playedMatches.ranked)}</span>
        </div>
        <div class="stats-row">
          <span class="stat-label">Best</span>
          <span class="stat-value">${formatTime(t.bestTime.ranked)}</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('card-wrapper').classList.remove('hidden');
}

// ── Canvas download ────────────────────────────────────────────────────────

async function downloadCard(data) {
  const { nickname, eloRate, eloRank, uuid, statistics, country } = data;

  const tier = getTier(eloRate);
  const s = statistics.season;
  const t = statistics.total;

  const bgColor     = tier ? tier.bg     : '#12121e';
  const borderColor = tier ? tier.border : '#2a2a40';
  const badgeColor  = tier ? tier.badge  : '#666680';

  // ── Load assets before touching canvas ──────────────────────
  await document.fonts.ready;

  // Fetch the skin as a blob and convert to a data URL so the canvas
  // never sees a cross-origin image (data URLs are same-origin).
  let skinImg = null;
  try {
    const skinUrl = `${SKIN_BODY}${uuid}/200`;
    const res = await fetch(skinUrl, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    skinImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  } catch {
    // Skin unavailable (CORS from file:// origin, or network error).
    // The card will be drawn without the skin panel.
  }

  // ── Set up canvas ────────────────────────────────────────────
  const SCALE = 3; // 3× → 1860×810 px output
  const W = 620, H = 270;
  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE); // all drawing coords stay the same

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Outer border (3 px)
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

  // Header bar
  ctx.fillStyle = borderColor;
  ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = '9px "Press Start 2P"';
  ctx.textBaseline = 'middle';
  ctx.fillText('MCSR RANKED STATS', 14, 15);

  // ── Skin panel (only if skin loaded) ─────────────────────────
  const skinPanelW = skinImg ? 140 : 0;

  if (skinImg) {
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 30, skinPanelW, H - 30);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(skinPanelW, 30);
    ctx.lineTo(skinPanelW, H);
    ctx.stroke();

    const skinH = H - 30 - 24;
    const skinW = Math.round(skinH * (skinImg.naturalWidth / skinImg.naturalHeight));
    const skinX = Math.round((skinPanelW - skinW) / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(skinImg, skinX, 42, skinW, skinH);
  }

  // ── Stats text ───────────────────────────────────────────────
  const sx = skinPanelW + 18; // stats x origin
  let y = 50;

  // Player name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px "Press Start 2P"';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(nickname, sx, y);
  y += 26;

  // ELO
  if (eloRate != null) {
    ctx.fillStyle = badgeColor;
    ctx.font = '20px "Press Start 2P"';
    ctx.fillText(`${eloRate.toLocaleString()} ELO`, sx, y);
    y += 20;
    if (tier) {
      ctx.font = '8px "Press Start 2P"';
      ctx.fillText(tier.name.toUpperCase(), sx, y);
      y += 16;
    }
  } else {
    ctx.fillStyle = '#666680';
    ctx.font = '11px "Press Start 2P"';
    ctx.fillText('UNRANKED', sx, y);
    y += 20;
  }

  if (eloRank != null) {
    ctx.fillStyle = '#666680';
    ctx.font = '8px "Press Start 2P"';
    ctx.fillText(`Rank #${eloRank.toLocaleString()}`, sx, y);
    y += 16;
  }

  // Divider
  ctx.fillStyle = borderColor;
  ctx.fillRect(sx, y, W - sx - 16, 1);
  y += 12;

  // Stat helper: two-column label + values
  function statBlock(label, wins, losses, cr, best) {
    ctx.fillStyle = '#555566';
    ctx.font = '7px "Press Start 2P"';
    ctx.fillText(label, sx, y);
    y += 14;

    ctx.font = '9px "Press Start 2P"';
    ctx.fillStyle = '#4ccc70';
    ctx.fillText(`W ${wins}`, sx, y);
    ctx.fillStyle = '#cc4444';
    ctx.fillText(`L ${losses}`, sx + 90, y);
    ctx.fillStyle = '#aaaacc';
    ctx.fillText(`CR ${cr}`, sx + 175, y);
    y += 14;

    ctx.fillStyle = '#555566';
    ctx.font = '7px "Press Start 2P"';
    ctx.fillText('Best', sx, y);
    ctx.fillStyle = '#cccccc';
    ctx.fillText(best, sx + 38, y);
    y += 18;
  }

  statBlock(
    'SEASON',
    s.wins.ranked, s.loses.ranked,
    pct(s.completions.ranked, s.playedMatches.ranked),
    formatTime(s.bestTime.ranked)
  );

  ctx.fillStyle = borderColor;
  ctx.fillRect(sx, y - 4, W - sx - 16, 1);
  y += 8;

  statBlock(
    'CAREER',
    t.wins.ranked, t.loses.ranked,
    pct(t.completions.ranked, t.playedMatches.ranked),
    formatTime(t.bestTime.ranked)
  );

  // ── Trigger download ─────────────────────────────────────────
  // toBlob + createObjectURL is more reliable than toDataURL across browsers
  // (data URLs can be blocked after async operations lose the gesture context).
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${nickname}_mcsr_stats.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  let currentData = null;

  const input       = document.getElementById('username-input');
  const searchBtn   = document.getElementById('search-btn');
  const loading     = document.getElementById('loading');
  const errorMsg    = document.getElementById('error-msg');
  const cardWrapper = document.getElementById('card-wrapper');
  const downloadBtn = document.getElementById('download-btn');
  const dlError     = document.getElementById('download-error');

  async function doSearch() {
    const username = input.value.trim();
    if (!username) return;

    // Reset UI
    loading.classList.remove('hidden');
    errorMsg.classList.add('hidden');
    cardWrapper.classList.add('hidden');
    dlError.classList.add('hidden');
    searchBtn.disabled = true;
    currentData = null;

    try {
      currentData = await fetchPlayerStats(username);
      renderCard(currentData);
    } catch (err) {
      errorMsg.textContent = err.message;
      errorMsg.classList.remove('hidden');
    } finally {
      loading.classList.add('hidden');
      searchBtn.disabled = false;
    }
  }

  searchBtn.addEventListener('click', doSearch);

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

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
