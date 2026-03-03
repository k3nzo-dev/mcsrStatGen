// ── Status area ────────────────────────────────────────────────────────────

function setStatus(state, message = '') {
  const area = document.getElementById('status-area');
  if (state === 'loading') {
    area.innerHTML = `<p class="status-loading">${escapeHtml(message) || 'Loading…'}</p>`;
  } else if (state === 'error') {
    area.innerHTML = `<p class="status-error">${escapeHtml(message)}</p>`;
  } else {
    area.innerHTML = '';
  }
}

// ── DOM card ───────────────────────────────────────────────────────────────

function renderCard(data) {
  const { nickname, eloRate, eloRank, uuid, statistics, country } = data;
  const tier = getTier(eloRate);
  const s = statistics.season;
  const t = statistics.total;

  const accent = tier?.accent ?? '#374151';
  const accentBg = tier?.accentBg ?? '#f3f4f6';

  const flag = country ? `<span class="mc-flag" title="${country.toUpperCase()}">${flagEmoji(country)}</span>` : '';
  const rankHtml = eloRank != null ? `<span class="mc-rank" style="color:${accent}">#${eloRank.toLocaleString()}</span>` : '';

  const eloHtml = eloRate != null
    ? `<div class="mc-elo-row">
         <span class="mc-elo" style="color:${accent}">${eloRate.toLocaleString()}</span>
         <span class="mc-elo-unit">ELO</span>
         ${tier ? `<span class="mc-tier-pill" style="color:${accent};background:${accentBg}">${tier.name}</span>` : ''}
       </div>`
    : `<div class="mc-elo-row"><span class="mc-elo" style="color:${accent}">—</span><span class="mc-elo-unit">Unranked</span></div>`;

  document.getElementById('card').innerHTML = `
    <div class="mc-card">
      <div class="mc-accent-bar" style="background:${accent}"></div>
      <div class="mc-body">

        <div class="mc-skin-panel">
          <img src="${SKIN_BASE}/${uuid}/200" alt="${escapeHtml(nickname)}'s skin">
        </div>

        <div class="mc-info">
          <div class="mc-header">
            <span class="mc-name">${flag}${escapeHtml(nickname)}</span>
            ${rankHtml}
          </div>

          ${eloHtml}

          <div class="mc-divider"></div>

          <div class="mc-stats-grid">
            <div class="mc-col">
              <div class="mc-col-label">Season</div>
              <div class="mc-wlcr">
                <span class="mc-w">W ${s.wins.ranked}</span>
                <span class="mc-l">L ${s.loses.ranked}</span>
                <span class="mc-cr">CR ${pct(s.completions.ranked, s.playedMatches.ranked)}</span>
              </div>
              <div class="mc-best"><span>Best</span>${formatTime(s.bestTime.ranked)}</div>
            </div>

            <div class="mc-col-divider"></div>

            <div class="mc-col">
              <div class="mc-col-label">Career</div>
              <div class="mc-wlcr">
                <span class="mc-w">W ${t.wins.ranked}</span>
                <span class="mc-l">L ${t.loses.ranked}</span>
                <span class="mc-cr">CR ${pct(t.completions.ranked, t.playedMatches.ranked)}</span>
              </div>
              <div class="mc-best"><span>Best</span>${formatTime(t.bestTime.ranked)}</div>
            </div>
          </div>
        </div>

      </div>
      <div class="mc-footer">
        <span>⏱ MCSR Ranked Stats</span>
        <span>mcsrranked.com</span>
      </div>
    </div>
  `;

  document.getElementById('card-wrapper').classList.remove('hidden');
}

// ── Detailed stats DOM rendering ──────────────────────────────────────────

/**
 * Render detailed stats sections below the stat card.
 * @param {Object} modules — { bastion, seed, splits, lowData }
 */
function renderDetailedStats(modules) {
  // Remove any previously rendered sections
  document.querySelectorAll('.mc-detail-section').forEach(el => el.remove());

  const card = document.querySelector('.mc-card');
  if (!card) return;

  // Insert before the footer
  const footer = card.querySelector('.mc-footer');

  if (modules.lowData) {
    const warn = document.createElement('div');
    warn.className = 'mc-detail-section';
    warn.innerHTML = `<div class="mc-low-data-warn">⚠️ Fewer than 10 matches — detailed stats may not be accurate.</div>`;
    card.insertBefore(warn, footer);
  }

  if (modules.bastion) {
    const section = document.createElement('div');
    section.className = 'mc-detail-section';
    section.innerHTML = `<h4>Bastion Breakdown</h4>` + renderBreakdownTable(modules.bastion);
    card.insertBefore(section, footer);
  }

  if (modules.seed) {
    const section = document.createElement('div');
    section.className = 'mc-detail-section';
    section.innerHTML = `<h4>Seed Breakdown</h4>` + renderBreakdownTable(modules.seed);
    card.insertBefore(section, footer);
  }

  if (modules.splits) {
    const section = document.createElement('div');
    section.className = 'mc-detail-section';
    section.innerHTML = `<h4>Splits</h4>` + renderSplitsHtml(modules.splits);
    card.insertBefore(section, footer);
  }
}

function renderBreakdownTable(rows) {
  let html = `<table class="mc-breakdown-table">
    <tr><th>Type</th><th>Record</th><th class="wr-bar-cell">Win Rate</th></tr>`;
  for (const r of rows) {
    html += `<tr>
      <td>${escapeHtml(r.type)}</td>
      <td><span style="color:#16a34a">W ${r.wins}</span> / ${r.total}</td>
      <td class="wr-bar-cell"><div class="mc-wr-bar">
        <div class="mc-wr-bar-track"><div class="mc-wr-bar-fill" style="width:${r.winRate}%"></div></div>
        <span class="mc-wr-bar-pct">${r.winRate}%</span>
      </div></td>
    </tr>`;
  }
  html += '</table>';
  return html;
}

function renderSplitsHtml(splits) {
  let html = '<div class="mc-splits-grid">';
  for (const s of splits) {
    html += `<div class="mc-split-item">
      <div class="mc-split-label">${escapeHtml(s.label)}</div>
      <div class="mc-split-time">${formatTime(s.avg)}</div>
    </div>`;
  }
  html += '</div>';
  return html;
}

// ── Canvas download ────────────────────────────────────────────────────────

/** Draw a rounded rectangle path (no fill/stroke — caller decides). */
function canvasRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {Object} data     — player profile data
 * @param {Object} [modules] — optional { bastion, seed, splits, lowData }
 */
async function downloadCard(data, modules) {
  const { nickname, eloRate, eloRank, uuid, statistics, country } = data;
  const tier = getTier(eloRate);
  const s = statistics.season;
  const t = statistics.total;

  const accent = tier?.accent ?? '#374151';
  const accentBg = tier?.accentBg ?? '#f3f4f6';

  await document.fonts.ready;

  // Load skin as blob → data URL (avoids CORS taint on canvas)
  let skinImg = null;
  const blob = await loadSkinBlob(uuid);
  if (blob) {
    const dataUrl = await blobToDataUrl(blob);
    skinImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  // ── Calculate dynamic height for modules ──────────────────────────────
  const BASE_H = 252;
  let extraH = 0;
  const MOD_HEADER_H = 28;    // section label
  const MOD_ROW_H = 22;    // one table row
  const MOD_PAD = 16;    // padding around section
  const WARN_H = 34;

  if (modules?.lowData) extraH += WARN_H;
  if (modules?.bastion) extraH += MOD_HEADER_H + MOD_PAD + modules.bastion.length * MOD_ROW_H + 12;
  if (modules?.seed) extraH += MOD_HEADER_H + MOD_PAD + modules.seed.length * MOD_ROW_H + 12;
  if (modules?.splits) extraH += MOD_HEADER_H + MOD_PAD + 52;

  // ── Canvas setup (3× for retina-quality output) ───────────────────────
  const SCALE = 3;
  const W = 680, H = BASE_H + extraH;
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  const RADIUS = 16;
  const SKIN_W = 140;
  const FOOTER_H = 32;
  const ACCENT_H = 5;
  const BODY_TOP = ACCENT_H;
  const BODY_BOT = H - FOOTER_H;
  const SX = SKIN_W + 24;  // stats text left edge

  // Clip entire canvas to rounded card shape
  canvasRoundRect(ctx, 0, 0, W, H, RADIUS);
  ctx.clip();

  // ── White background ──────────────────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // ── Accent bar ────────────────────────────────────────────────────────
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, ACCENT_H);

  // ── Skin panel ────────────────────────────────────────────────────────
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, BODY_TOP, SKIN_W, BODY_BOT - BODY_TOP);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(SKIN_W, BODY_TOP);
  ctx.lineTo(SKIN_W, BODY_BOT);
  ctx.stroke();

  if (skinImg) {
    const maxH = BODY_BOT - BODY_TOP - 20;
    const maxW = SKIN_W - 20;
    const ratio = skinImg.naturalWidth / skinImg.naturalHeight;
    let sH = maxH, sW = Math.round(maxH * ratio);
    if (sW > maxW) { sW = maxW; sH = Math.round(maxW / ratio); }
    const sX = Math.round((SKIN_W - sW) / 2);
    const sY = BODY_TOP + Math.round((BODY_BOT - BODY_TOP - sH) / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(skinImg, sX, sY, sW, sH);
  }


  // ── Player name + rank ────────────────────────────────────────────────
  ctx.textBaseline = 'alphabetic';

  const nameY = BODY_TOP + 33;
  ctx.fillStyle = '#1a1f2e';
  ctx.font = '700 15px Inter';
  ctx.textAlign = 'left';
  const nameText = (country ? flagEmoji(country) + ' ' : '') + nickname;
  ctx.fillText(nameText, SX, nameY);

  if (eloRank != null) {
    ctx.fillStyle = accent;
    ctx.font = '700 13px Inter';
    ctx.textAlign = 'right';
    ctx.fillText(`#${eloRank.toLocaleString()}`, W - 20, nameY);
  }

  // ── ELO + tier pill ───────────────────────────────────────────────────
  const eloY = BODY_TOP + 67;
  ctx.textAlign = 'left';

  const eloText = eloRate != null ? eloRate.toLocaleString() : '—';
  ctx.fillStyle = accent;
  ctx.font = '800 28px Inter';
  ctx.fillText(eloText, SX, eloY);

  const eloW = ctx.measureText(eloText).width;
  ctx.fillStyle = '#6b7280';
  ctx.font = '600 13px Inter';
  ctx.fillText('ELO', SX + eloW + 8, eloY);

  if (tier) {
    const pillTxt = tier.name;
    ctx.font = '600 10px Inter';
    const pillTxtW = ctx.measureText(pillTxt).width;
    const pillPadX = 10, pillH = 20, pillR = 10;
    const pillW = pillTxtW + pillPadX * 2;
    const pillX = SX + eloW + 8 + ctx.measureText('ELO').width + 12;
    const pillY = eloY - 16;

    ctx.fillStyle = accentBg;
    canvasRoundRect(ctx, pillX, pillY, pillW, pillH, pillR);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(pillTxt, pillX + pillPadX, pillY + pillH / 2);
    ctx.textBaseline = 'alphabetic';
  }

  // ── Divider below ELO row ─────────────────────────────────────────────
  const divY = BODY_TOP + 82;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(SX, divY); ctx.lineTo(W - 20, divY); ctx.stroke();

  // ── Season / Career stat columns ──────────────────────────────────────
  const COL2_X = Math.round(SX + (W - SX - 20) / 2 + 10); // second column
  const COL_DIV = COL2_X - 20; // vertical divider x

  // Vertical divider
  ctx.beginPath();
  ctx.moveTo(COL_DIV, divY + 8); ctx.lineTo(COL_DIV, BODY_BOT - 8); ctx.stroke();

  function drawStatCol(x, label, wins, losses, cr, best) {
    let cy = divY + 20;
    ctx.textAlign = 'left';

    // Section label
    ctx.fillStyle = '#6b7280';
    ctx.font = '600 9px Inter';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label.toUpperCase(), x, cy);
    cy += 22;

    // W / L / CR
    ctx.font = '700 13px Inter';
    ctx.fillStyle = '#16a34a';
    ctx.fillText(`W ${wins}`, x, cy);
    ctx.fillStyle = '#dc2626';
    ctx.fillText(`L ${losses}`, x + 70, cy);
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`CR ${cr}`, x + 138, cy);
    cy += 20;

    // Best time
    ctx.font = '500 10px Inter';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('Best', x, cy);
    ctx.fillStyle = '#1a1f2e';
    ctx.fillText(best, x + 30, cy);
  }

  drawStatCol(SX, 'Season',
    s.wins.ranked, s.loses.ranked,
    pct(s.completions.ranked, s.playedMatches.ranked),
    formatTime(s.bestTime.ranked));

  drawStatCol(COL2_X, 'Career',
    t.wins.ranked, t.loses.ranked,
    pct(t.completions.ranked, t.playedMatches.ranked),
    formatTime(t.bestTime.ranked));

  // ── Detailed stats modules on canvas ───────────────────────────────────
  let moduleY = BODY_BOT;

  function drawSectionDivider(y) {
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(W, y);
    ctx.stroke();
  }

  function drawModuleHeader(label, y) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, y, W, MOD_HEADER_H);
    drawSectionDivider(y);
    ctx.fillStyle = '#6b7280';
    ctx.font = '700 9px Inter';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label.toUpperCase(), 24, y + 18);
    return y + MOD_HEADER_H;
  }

  function drawBreakdownTable(rows, startY) {
    let y = startY;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, startY, W, rows.length * MOD_ROW_H + MOD_PAD + 12);

    // Column positions
    const colType = 24;
    const colRecord = 200;
    const colBarX = 340;
    const colBarW = 260;
    const colPctX = W - 24;

    // Header row
    ctx.font = '600 8px Inter';
    ctx.fillStyle = '#6b7280';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('TYPE', colType, y + 12);
    ctx.fillText('RECORD', colRecord, y + 12);
    ctx.fillText('WIN RATE', colBarX, y + 12);
    y += 18;

    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(colType, y); ctx.lineTo(W - 24, y); ctx.stroke();
    y += 4;

    for (const r of rows) {
      y += MOD_ROW_H - 4;

      // Type name
      ctx.font = '600 11px Inter';
      ctx.fillStyle = '#1a1f2e';
      ctx.textAlign = 'left';
      ctx.fillText(r.type, colType, y);

      // W / Total
      ctx.font = '600 11px Inter';
      ctx.fillStyle = '#16a34a';
      ctx.fillText(`W ${r.wins}`, colRecord, y);
      ctx.fillStyle = '#6b7280';
      ctx.fillText(`/ ${r.total}`, colRecord + ctx.measureText(`W ${r.wins} `).width, y);

      // Win rate bar
      const barH = 5, barTrackW = colBarW - 60;
      const barY = y - 4;
      ctx.fillStyle = '#e2e8f0';
      canvasRoundRect(ctx, colBarX, barY, barTrackW, barH, 3);
      ctx.fill();
      if (r.winRate > 0) {
        ctx.fillStyle = '#3a7d44';
        canvasRoundRect(ctx, colBarX, barY, Math.max(barTrackW * r.winRate / 100, 4), barH, 3);
        ctx.fill();
      }

      // Percentage
      ctx.fillStyle = '#2d6335';
      ctx.font = '700 11px Inter';
      ctx.textAlign = 'right';
      ctx.fillText(`${r.winRate}%`, colPctX, y);
      ctx.textAlign = 'left';

      y += 4;
    }

    return y + 8;
  }

  function drawSplits(splits, startY) {
    let y = startY;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, startY, W, 52 + MOD_PAD);

    const count = splits.length;
    const pad = 24;
    const gap = 10;
    const itemW = (W - pad * 2 - gap * (count - 1)) / count;

    for (let i = 0; i < count; i++) {
      const s = splits[i];
      const ix = pad + i * (itemW + gap);

      // Item background
      ctx.fillStyle = '#f8f9fb';
      canvasRoundRect(ctx, ix, y + 4, itemW, 44, 6);
      ctx.fill();

      // Label
      ctx.fillStyle = '#6b7280';
      ctx.font = '600 7px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(s.label.toUpperCase(), ix + itemW / 2, y + 18);

      // Time
      ctx.fillStyle = '#1a1f2e';
      ctx.font = '800 13px Inter';
      ctx.fillText(formatTime(s.avg), ix + itemW / 2, y + 38);
    }
    ctx.textAlign = 'left';

    return y + 52 + MOD_PAD;
  }

  // Move footer down to accommodate modules
  if (modules) {
    // Redraw body area below the original stats as white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, BODY_BOT, W, extraH);

    if (modules.lowData) {
      drawSectionDivider(moduleY);
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(24, moduleY + 4, W - 48, WARN_H - 8);
      canvasRoundRect(ctx, 24, moduleY + 4, W - 48, WARN_H - 8, 6);
      ctx.fill();
      ctx.fillStyle = '#92400e';
      ctx.font = '500 10px Inter';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠️  Fewer than 10 matches — detailed stats may not be accurate.', 36, moduleY + WARN_H / 2);
      ctx.textBaseline = 'alphabetic';
      moduleY += WARN_H;
    }

    if (modules.bastion) {
      moduleY = drawModuleHeader('Bastion Breakdown', moduleY);
      moduleY = drawBreakdownTable(modules.bastion, moduleY);
    }

    if (modules.seed) {
      moduleY = drawModuleHeader('Seed Breakdown', moduleY);
      moduleY = drawBreakdownTable(modules.seed, moduleY);
    }

    if (modules.splits) {
      moduleY = drawModuleHeader('Splits', moduleY);
      moduleY = drawSplits(modules.splits, moduleY);
    }
  }

  // ── Footer (at the bottom, after modules) ─────────────────────────────
  const footerTop = H - FOOTER_H;
  ctx.fillStyle = '#f8f9fb';
  ctx.fillRect(0, footerTop, W, FOOTER_H);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, footerTop); ctx.lineTo(W, footerTop); ctx.stroke();

  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 10px Inter';
  ctx.textBaseline = 'middle';
  const fMid = footerTop + FOOTER_H / 2;
  ctx.textAlign = 'left';
  ctx.fillText('⏱ MCSR Ranked Stats', SX, fMid);
  ctx.textAlign = 'right';
  ctx.fillText('mcsrranked.com', W - 20, fMid);

  // ── Download ──────────────────────────────────────────────────────────
  const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const objectUrl = URL.createObjectURL(pngBlob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${sanitizeFilename(nickname)}_mcsr_stats.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

// ── Hero stats ─────────────────────────────────────────────────────────────

async function loadHeroStats() {
  // Players tracked — from our own DB
  fetch('/api/site-stats')
    .then(r => r.json())
    .then(({ players_tracked }) => {
      if (typeof players_tracked === 'number') {
        document.getElementById('stat-players-tracked').textContent =
          players_tracked.toLocaleString();
      }
    })
    .catch(() => {});

  // Leaderboard-derived stats
  try {
    const lb = await fetchLeaderboard(150);

    const topElo = lb.users?.[0]?.eloRate;
    if (topElo) {
      document.getElementById('stat-top-elo').textContent = topElo.toLocaleString();
    }

    const countries = new Set(lb.users?.map(u => u.country).filter(Boolean));
    if (countries.size > 0) {
      document.getElementById('stat-countries').textContent = countries.size.toLocaleString();
    }

    const seasonNum = lb.season?.number;
    if (seasonNum) {
      document.getElementById('stat-season').textContent = seasonNum;
    }
  } catch {
    // Non-critical — dashed fallback stays in place
  }
}
