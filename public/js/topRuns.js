/* ── Top Runs Page Logic ──────────────────────────────────────────────────── */

const RANK_MEDALS = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];

const SPLIT_KEYS = ['enter_nether', 'bastion', 'fortress', 'blind', 'end_enter'];

const SPLIT_COLORS = {
  enter_nether: '#ff6b6b',
  bastion:      '#ffd93d',
  fortress:     '#6bcb77',
  blind:        '#4d96ff',
  end_enter:    '#9b59b6',
};

const SPLIT_LABELS = {
  enter_nether: 'Enter Nether',
  bastion:      'Bastion',
  fortress:     'Fortress',
  blind:        'Blind',
  end_enter:    'End Enter',
};


function formatTime(ms) {
  if (ms == null) return '--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ms3 = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0')}`;
}

// ── Chart instances (tracked for destroy/recreate) ──────────────────────────
let splitsChart = null;

// ── Nav scroll effect ───────────────────────────────────────────────────────
const nav = document.getElementById('tr-nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('nav-scrolled', window.scrollY > 8);
  });
}

// ── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchDailyTop(date) {
  const loading = document.getElementById('table-loading');
  const table = document.getElementById('top-runs-table');
  const tbody = document.getElementById('top-runs-tbody');
  const empty = document.getElementById('table-empty');

  loading.style.display = '';
  table.style.display = 'none';
  empty.style.display = 'none';

  try {
    const res = await fetch('/api/daily-top?date=' + encodeURIComponent(date));
    const json = await res.json();
    const rows = json.data || [];

    loading.style.display = 'none';

    if (rows.length === 0) {
      empty.style.display = '';
      return;
    }

    tbody.innerHTML = '';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="col-rank">' + (i + 1) + '</td>' +
        '<td>' + escapeHtml(r.nickname) + '</td>' +
        '<td class="col-time">' + formatTime(r.run_time) + '</td>' +
        '<td>' + formatLabel(r.bastion_type) + '</td>' +
        '<td>' + formatLabel(r.seed_type) + '</td>' +
        '<td>' + formatUTCTime(r.created_at) + '</td>';
      tbody.appendChild(tr);
    }
    table.style.display = '';
  } catch (err) {
    loading.style.display = 'none';
    empty.textContent = 'Failed to load runs.';
    empty.style.display = '';
    console.error('fetchDailyTop error:', err);
  }
}

async function fetchFastestSplits(date) {
  try {
    const res = await fetch('/api/daily-fastest-splits?date=' + encodeURIComponent(date));
    const json = await res.json();
    const data = json.data || {};

    for (const key of SPLIT_KEYS) {
      const card = document.getElementById('split-' + key);
      if (!card) continue;

      // Keep the header, replace the rest
      const header = card.querySelector('.split-card-name');
      card.innerHTML = '';
      card.appendChild(header);

      const entries = data[key];
      if (!entries || entries.length === 0) {
        const p = document.createElement('div');
        p.className = 'podium-empty';
        p.textContent = 'No data yet';
        card.appendChild(p);
        continue;
      }

      const ul = document.createElement('ul');
      ul.className = 'podium-list';
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const li = document.createElement('li');
        li.className = 'podium-item';
        li.innerHTML =
          '<span class="podium-rank">' + (RANK_MEDALS[i] || (i + 1)) + '</span>' +
          '<span class="podium-player">' + escapeHtml(e.nickname) + '</span>' +
          '<span class="podium-time">' + formatTime(e.run_time) + '</span>';
        ul.appendChild(li);
      }
      card.appendChild(ul);
    }
  } catch (err) {
    console.error('fetchFastestSplits error:', err);
  }
}

async function fetchHistoricalStats(days) {
  try {
    const res = await fetch('/api/historical-stats?days=' + days);
    const json = await res.json();
    const rows = (json.data || []).reverse(); // oldest first for chart x-axis

    renderSplitsChart(rows);
  } catch (err) {
    console.error('fetchHistoricalStats error:', err);
  }
}

// ── Chart renderers ─────────────────────────────────────────────────────────

function renderSplitsChart(rows) {
  if (splitsChart) { splitsChart.destroy(); splitsChart = null; }

  const labels = rows.map(r => r.date_cst ? r.date_cst.slice(5) : '');
  const datasets = SPLIT_KEYS.map(key => ({
    label: SPLIT_LABELS[key],
    data: rows.map(r => {
      const splits = r.avg_splits_json || {};
      return splits[key] != null ? +(splits[key] / 1000).toFixed(1) : null;
    }),
    borderColor: SPLIT_COLORS[key],
    backgroundColor: SPLIT_COLORS[key] + '22',
    tension: 0.3,
    pointRadius: 3,
    spanGaps: true,
  }));

  const ctx = document.getElementById('splits-chart').getContext('2d');
  splitsChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#e5e5fe', font: { size: 11 } } },
        tooltip: { enabled: true },
      },
      scales: {
        x: {
          ticks: { color: '#e5e5fe', font: { size: 10 } },
          grid: { color: 'rgba(229,229,254,0.1)' },
        },
        y: {
          ticks: {
            color: '#e5e5fe',
            font: { size: 10 },
            callback: function(v) { return v + 's'; },
          },
          grid: { color: 'rgba(229,229,254,0.1)' },
        },
      },
    },
  });
}


// ── Helpers ──────────────────────────────────────────────────────────────────

function formatLabel(val) {
  if (!val) return '—';
  return escapeHtml(val.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
}

function formatUTCTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return String(d.getUTCHours()).padStart(2, '0') + ':' +
    String(d.getUTCMinutes()).padStart(2, '0');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTodayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// ── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  const picker = document.getElementById('date-picker');
  const today = getTodayDate();
  picker.value = today;

  // Initial load — all three in parallel
  fetchDailyTop(today);
  fetchFastestSplits(today);
  fetchHistoricalStats(30);

  // Date picker changes daily data only
  picker.addEventListener('change', function() {
    const date = picker.value;
    if (!date) return;
    fetchDailyTop(date);
    fetchFastestSplits(date);
  });

  // Range selector changes historical charts only
  document.getElementById('range-selector').addEventListener('click', function(e) {
    const btn = e.target.closest('.range-btn');
    if (!btn) return;
    const days = parseInt(btn.dataset.days, 10);
    if (!days) return;

    // Update active state
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    fetchHistoricalStats(days);
  });
});
