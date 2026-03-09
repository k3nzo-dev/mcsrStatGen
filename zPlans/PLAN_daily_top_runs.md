# Daily Top 100 Runs — Claude Code Prompts

> Run these prompts sequentially in Claude Code. Each prompt builds on the previous one.
> Wait for each to fully complete and verify before running the next.

---

## Prompt 1: Database Schema

```
Add three new tables to `server/db.js` inside `initSchema()`. Use `CREATE TABLE IF NOT EXISTS` to be safe. Do NOT drop or modify any existing tables.

### Table 1: `daily_top_runs`
Stores the top 100 fastest completed runs for a given day (in CST timezone).

CREATE TABLE IF NOT EXISTS daily_top_runs (
  id            SERIAL PRIMARY KEY,
  match_id      INT UNIQUE NOT NULL,
  user_uuid     TEXT NOT NULL,
  nickname      TEXT NOT NULL,
  run_time      INT NOT NULL,          -- milliseconds
  date_cst      DATE NOT NULL,
  bastion_type  TEXT,
  seed_type     TEXT,
  timeline_json JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

### Table 2: `historical_stats`
Stores daily aggregated averages for graphing trends over time.

CREATE TABLE IF NOT EXISTS historical_stats (
  id                        SERIAL PRIMARY KEY,
  date_cst                  DATE UNIQUE NOT NULL,
  avg_run_time              INT,
  avg_splits_json           JSONB,
  bastion_distribution_json JSONB
);

### Table 3: `daily_fastest_splits`
Tracks the top 3 fastest individual split times for each split category, per day (CST).

CREATE TABLE IF NOT EXISTS daily_fastest_splits (
  id         SERIAL PRIMARY KEY,
  split_name TEXT NOT NULL,
  run_time   INT NOT NULL,             -- milliseconds
  match_id   INT NOT NULL,
  user_uuid  TEXT NOT NULL,
  nickname   TEXT NOT NULL,
  date_cst   DATE NOT NULL
);

Add these as a new `await pool.query(...)` block at the end of `initSchema()`, after the existing table definitions.
```

---

## Prompt 2: Background Polling Worker

```
Create a new file `server/workers/matchPoller.js`. This module will be imported and started from `server/index.js`.

### What it does:
It polls `https://api.mcsrranked.com/matches?count=50&type=2` every 2 minutes to find completed ranked matches and store the fastest ones in the database.

### Requirements:

1. **Export a `startMatchPoller(pool)` function** that takes the Postgres pool and starts a `setInterval` loop (every 2 minutes / 120000ms). Also run once immediately on startup.

2. **CST Date Helper**: Use `new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago' })` to calculate the current CST date as `YYYY-MM-DD`. Do NOT add any npm dependencies for this (no luxon, no moment).

3. **Polling logic** (runs every 2 min):
   a. Fetch `https://api.mcsrranked.com/matches?count=50&type=2` using `node-fetch` or the built-in `fetch` (Node 18+).
   b. Filter matches where `forfeited === false` and `result.time != null` and `result.uuid != null` (completed runs only).
   c. Skip matches whose `match_id` is already in `daily_top_runs`.
   d. For each qualifying match:
      - Check the current CST date.
      - Query `daily_top_runs` for the current `date_cst` to get the count and the slowest (max `run_time`).
      - If count < 100 OR `result.time < slowestRunTime`, this match qualifies.
      - For qualifying matches, fetch the full match detail from `https://api.mcsrranked.com/matches/{match_id}` to get timeline data.
      - Insert into `daily_top_runs` with: `match_id`, the winning player's `uuid` as `user_uuid`, their `nickname`, `result.time` as `run_time`, current CST date as `date_cst`, `bastionType`, `seedType`, and the timelines array as `timeline_json`.
      - If count was already >= 100, delete the row with the highest (slowest) `run_time` for that `date_cst`.

4. **Fastest Splits logic** (within the same loop, for matches that have timeline data):
   - Parse the timeline data to extract split times for the winning player. The split names to track are:
     - `'enter_nether'` — timeline type `'story.enter_the_nether'`
     - `'bastion'` — timeline type `'nether.find_bastion'`
     - `'fortress'` — timeline type `'nether.find_fortress'`
     - `'blind'` — timeline type `'projectelo.timeline.blind_travel'`
     - `'end_enter'` — timeline type `'story.enter_the_end'`
   - For each split found, query `daily_fastest_splits` for that `split_name` and current `date_cst`, ordered by `run_time ASC`.
   - If fewer than 3 rows exist, INSERT the new split.
   - If 3 rows exist and the new split time is faster than the slowest (3rd place), INSERT the new one and DELETE the slowest one.

5. **Midnight CST rollover**:
   - Track the last known CST date in a module-level variable.
   - On each poll, if the CST date has changed since the last poll:
     a. Query all rows from `daily_top_runs` for the *previous* date.
     b. Compute `avg_run_time` (average of all `run_time` values).
     c. Compute `avg_splits_json`: for each of the 5 split names, average all the timeline values across the runs that had that split.
     d. Compute `bastion_distribution_json`: count occurrences of each `bastion_type`.
     e. INSERT into `historical_stats` with the previous date.
     f. Update the tracked date variable to the new date.

6. **Error handling**: Wrap all fetch and DB calls in try/catch. Log errors with `console.error('[MatchPoller]', ...)` but never crash the process.

7. **Rate limiting**: Fetch match details sequentially (not in parallel) with a 200ms delay between each to respect the MCSR API rate limits. Use batches of 5 if needed.

### Then, in `server/index.js`:
After `initSchema()` completes successfully, import and call `startMatchPoller(pool)`:

```js
const { startMatchPoller } = require('./workers/matchPoller');
// ... after initSchema() ...
startMatchPoller(pool);
```

Refer to `PROJECT_ARCHITECTURE.md` for the existing project patterns and conventions.
```

---

## Prompt 3: API Endpoints

```
Add three new public GET endpoints to `server/routes/api.js`. These do NOT require authentication. Add appropriate rate limiting (similar to the existing `widgetLimiter` pattern — e.g., 60 requests per 15 min window).

### Endpoint 1: `GET /api/daily-top`
- Accepts optional query param `?date=YYYY-MM-DD`.
- If no date provided, default to the current CST date. Use `new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago' })` to determine it.
- Query `daily_top_runs` for that `date_cst`, ordered by `run_time ASC`.
- Return `{ data: [...rows] }`.

### Endpoint 2: `GET /api/historical-stats`
- Accepts optional `?days=30` (default 30, max 90).
- Query `historical_stats` ordered by `date_cst DESC`, limited to `days` rows.
- Return `{ data: [...rows] }`.

### Endpoint 3: `GET /api/daily-fastest-splits`
- Accepts optional `?date=YYYY-MM-DD` (defaults to current CST date).
- Query `daily_fastest_splits` for that `date_cst`, ordered by `split_name ASC, run_time ASC`.
- Return the data grouped by split_name, e.g.:
  ```json
  {
    "data": {
      "enter_nether": [{ "nickname": "...", "run_time": 12345, ... }, ...],
      "bastion": [...],
      ...
    }
  }
  ```

Keep the existing code style and error handling patterns (use `safeError(err)` for production). Place the new routes in the "Public" section of the router, before the "Authenticated" section.
```

---

## Prompt 4: Frontend HTML Page

```
Create `public/top-runs.html`. This is a new public page (no auth required).

### Design requirements:
- Use the existing `public/style.css` for all styling. Import it with `<link rel="stylesheet">`.
- Match the premium glassmorphism dark-mode aesthetic of the existing pages (`index.html`, `dashboard.html`).
- Use the Inter font (already loaded in style.css).
- Include `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>` for graphing.
- Include `<script src="/js/topRuns.js" defer></script>` for the page logic.

### Page structure:

1. **Header/Navigation**: A simple top bar with "MCSR Ranked Stats" title and links back to `/` (Home). Match the look of the headers on other pages.

2. **Date Picker**: A date input (type="date") defaulting to today, with an ID of `date-picker`. When changed, the page should re-fetch data for that date.

3. **Section: "Fastest Splits of the Day"** (id="fastest-splits-section"):
   - A responsive grid/flex layout with a card for each split type: Enter Nether, Bastion, Fortress, Blind/Exit, End Enter.
   - Each card shows the split name as a header and a podium-style top 3 list (rank, player name, formatted time).
   - Use the existing glassmorphism card style (background blur, subtle border, shadow).
   - Include a subtitle showing "Resets at midnight CST".

4. **Section: "Trends"** (id="trends-section"):
   - Two Chart.js `<canvas>` elements side by side (or stacked on mobile):
     - `<canvas id="splits-chart"></canvas>` — Line chart for average split times over days.
     - `<canvas id="bastion-chart"></canvas>` — Bar or Doughnut chart for bastion type distribution.
   - Include a time range selector (`7d / 14d / 30d`) to filter the historical data shown.

5. **Section: "Top 100 Daily Runs"** (id="top-runs-table-section"):
   - A styled `<table>` (id="top-runs-table") with columns: Rank, Player, Time, Bastion, Seed Type.
   - Add a loading spinner placeholder while data loads.

6. **Footer**: Simple footer matching the existing pages.

Make sure all interactive elements have unique IDs for the JS to hook into. Add a `<meta name="description">` tag: "Daily top 100 fastest MCSR Ranked runs, split leaderboards, and historical trends."
```

---

## Prompt 5: Frontend JavaScript

```
Create `public/js/topRuns.js`. This file handles all data fetching and rendering for `top-runs.html`.

### Utility:
Include a `formatTime(ms)` function that converts milliseconds to `m:ss.sss` format (same logic as in `app.js`):
```js
function formatTime(ms) {
  if (ms == null) return '--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ms3 = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0')}`;
}
```

### On DOMContentLoaded:
1. Determine the default date (today in browser local time, or read from the date picker).
2. Call all three fetch functions in parallel: `fetchDailyTop(date)`, `fetchFastestSplits(date)`, `fetchHistoricalStats(30)`.
3. Render each section.

### `fetchDailyTop(date)`:
- `GET /api/daily-top?date=${date}`
- Render the table in `#top-runs-table`. Each row: rank number, player nickname, formatted time, bastion type, seed type.
- If no data, show a "No runs recorded yet for this date" message.

### `fetchFastestSplits(date)`:
- `GET /api/daily-fastest-splits?date=${date}`
- For each split category, populate the corresponding card in `#fastest-splits-section`.
- Show rank (🥇🥈🥉), player name, and formatted time.
- If a split has no data, show "No data yet".

### `fetchHistoricalStats(days)`:
- `GET /api/historical-stats?days=${days}`
- **Splits Line Chart** (`#splits-chart`):
  - X axis: dates (labels).
  - One line per split type (Enter Nether, Bastion, Fortress, Blind, End Enter) showing the average time in seconds (divide ms by 1000 for readability).
  - Use these colors (matching the dark theme): 
    - Enter Nether: `#ff6b6b`
    - Bastion: `#ffd93d`
    - Fortress: `#6bcb77`
    - Blind/Exit: `#4d96ff`
    - End Enter: `#9b59b6`
  - Set Chart.js options: dark background (`transparent`), white grid lines at 10% opacity, white axis labels, enable tooltips.
  
- **Bastion Distribution Chart** (`#bastion-chart`):
  - Use a Doughnut chart.
  - Sum up the bastion distributions across the selected date range.
  - Colors: Treasure `#ffd93d`, Bridge `#ff6b6b`, Housing `#6bcb77`, Stables `#4d96ff`.
  - White legend text.

### Date picker change handler:
- Listen to `#date-picker` `change` event.
- Re-fetch `fetchDailyTop` and `fetchFastestSplits` with the new date.
- Do NOT re-fetch historical stats (those are date-range based, not single-day).

### Time range selector:
- Listen to clicks on the `7d / 14d / 30d` buttons.
- Re-fetch `fetchHistoricalStats` with the selected number of days.
- Destroy and re-create the Chart instances (call `.destroy()` before creating new ones to avoid canvas reuse errors).

Follow the same vanilla JS patterns used in the rest of the project. No frameworks, no build steps.
```

---

## Prompt 6: Navigation & Polish

```
1. In `public/index.html`, add a navigation link to `/top-runs.html` with text "Daily Top Runs". Place it in the header/nav area (look at the existing page structure and add it in a logical location).

2. In `public/style.css`, add any styles needed for the top-runs page. At minimum:
   - `.splits-grid` — a CSS Grid or Flexbox layout for the fastest splits cards (responsive: 5 columns on desktop, 2-3 on tablet, 1 on mobile).
   - `.split-card` — glassmorphism card style matching `.card-inner` or similar existing patterns.
   - `.podium-list` — simple ordered list with rank styling.
   - `.top-runs-table` — styled table with alternating row colors, matching the dark theme.
   - `.chart-container` — flex container for the two charts, responsive (side-by-side on desktop, stacked on mobile).
   - `.range-btn` — small pill-style buttons for the 7d/14d/30d selectors.
   - `.range-btn.active` — highlighted state for the currently selected range.

   Use existing CSS variables from `:root` wherever possible. Do not hardcode colors that already exist as variables.

3. Make sure the page is fully responsive. Test widths: 1440px, 1024px, 768px, 375px.
```

---

## Prompt 7: Testing & Verification

```
1. Start the dev server with `npm run dev` and verify:
   - The new tables are created on startup (check the server logs, no errors from initSchema).
   - The match poller starts and logs its first poll (you should see console output like "[MatchPoller] Polled X matches, Y qualified").
   - Navigate to `http://localhost:<port>/top-runs.html` and verify:
     - The page loads without console errors.
     - The date picker defaults to today.
     - The fastest splits section shows "No data yet" cards (since polling just started).
     - The charts render empty gracefully (no crashes).
     - The top 100 table shows a "No runs recorded yet" message.
   - Wait 2-3 minutes for the poller to run, then refresh. Verify data starts appearing.

2. Test the API endpoints directly:
   - `curl http://localhost:<port>/api/daily-top` — should return `{ data: [...] }`
   - `curl http://localhost:<port>/api/daily-fastest-splits` — should return grouped splits
   - `curl http://localhost:<port>/api/historical-stats?days=7` — should return `{ data: [...] }` (may be empty initially)

3. Fix any issues found during testing.
```
