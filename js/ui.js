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
  const s    = statistics.season;
  const t    = statistics.total;

  const accent   = tier?.accent   ?? '#374151';
  const accentBg = tier?.accentBg ?? '#f3f4f6';

  const flag     = country ? `<span class="mc-flag" title="${country.toUpperCase()}">${flagEmoji(country)}</span>` : '';
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

// ── Canvas download ────────────────────────────────────────────────────────

/** Draw a rounded rectangle path (no fill/stroke — caller decides). */
function canvasRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

async function downloadCard(data) {
  const { nickname, eloRate, eloRank, uuid, statistics, country } = data;
  const tier = getTier(eloRate);
  const s    = statistics.season;
  const t    = statistics.total;

  const accent   = tier?.accent   ?? '#374151';
  const accentBg = tier?.accentBg ?? '#f3f4f6';

  await document.fonts.ready;

  // Load skin as blob → data URL (avoids CORS taint on canvas)
  let skinImg = null;
  const blob = await loadSkinBlob(uuid);
  if (blob) {
    const dataUrl = await blobToDataUrl(blob);
    skinImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  // ── Canvas setup (3× for retina-quality output) ───────────────────────
  const SCALE = 3;
  const W = 680, H = 252;
  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  const RADIUS     = 16;
  const SKIN_W     = 140;
  const FOOTER_H   = 32;
  const ACCENT_H   = 5;
  const BODY_TOP   = ACCENT_H;
  const BODY_BOT   = H - FOOTER_H;
  const SX         = SKIN_W + 24;  // stats text left edge

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

  // ── Footer ────────────────────────────────────────────────────────────
  ctx.fillStyle = '#f8f9fb';
  ctx.fillRect(0, BODY_BOT, W, FOOTER_H);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, BODY_BOT); ctx.lineTo(W, BODY_BOT); ctx.stroke();

  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 10px Inter';
  ctx.textBaseline = 'middle';
  const footerMid = BODY_BOT + FOOTER_H / 2;
  ctx.textAlign = 'left';
  ctx.fillText('⏱ MCSR Ranked Stats', SX, footerMid);
  ctx.textAlign = 'right';
  ctx.fillText('mcsrranked.com', W - 20, footerMid);

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
    const pillTxt  = tier.name;
    ctx.font = '600 10px Inter';
    const pillTxtW = ctx.measureText(pillTxt).width;
    const pillPadX = 10, pillH = 20, pillR = 10;
    const pillW    = pillTxtW + pillPadX * 2;
    const pillX    = SX + eloW + 8 + ctx.measureText('ELO').width + 12;
    const pillY    = eloY - 16;

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
  const COL2_X   = Math.round(SX + (W - SX - 20) / 2 + 10); // second column
  const COL_DIV  = COL2_X - 20; // vertical divider x

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

  // ── Download ──────────────────────────────────────────────────────────
  const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const objectUrl = URL.createObjectURL(pngBlob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${nickname}_mcsr_stats.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

// ── Hero stats ─────────────────────────────────────────────────────────────

async function loadHeroStats() {
  try {
    const lb = await fetchLeaderboard(1);
    const topElo = lb[0]?.eloRate;
    if (topElo) document.getElementById('stat-top-elo').textContent = topElo.toLocaleString();
  } catch {
    // Non-critical — static fallback stays in place
  }
}
