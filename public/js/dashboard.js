// ── Nav scroll shadow ────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
    document.getElementById('db-nav')
        .classList.toggle('nav-scrolled', window.scrollY > 10);
});

// ── Toast ────────────────────────────────────────────────────────────────
const toast = document.getElementById('toast');
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
}

// ── API helpers ──────────────────────────────────────────────────────────
async function apiGet(path) {
    const res = await fetch(path, { headers: { Accept: 'application/json' } });
    if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
    return res.json();
}
async function apiPut(path, body) {
    const res = await fetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(body),
    });
    if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
    return res.json();
}
async function apiPost(path, body) {
    const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(body),
    });
    if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthorized'); }
    return res.json();
}

// ── Widget URL ───────────────────────────────────────────────────────────
let currentWidgetToken = null;

function widgetUrl(username, token) {
    if (!username || !token) return '';
    return `${window.location.origin}/widget/${encodeURIComponent(username)}?token=${token}`;
}

function updateWidgetUrlDisplay() {
    const username = document.getElementById('widget-username').value.trim();
    const urlDisplay = document.getElementById('widget-url-display');
    const copyBtn = document.getElementById('copy-widget-url-btn');
    const url = widgetUrl(username, currentWidgetToken);
    if (url) {
        urlDisplay.textContent = url;
        copyBtn.disabled = false;
    } else {
        urlDisplay.textContent = 'Enter your MCSR username above to generate your URL.';
        copyBtn.disabled = true;
    }
}

document.getElementById('widget-username').addEventListener('input', updateWidgetUrlDisplay);

// ── Save MCSR username ───────────────────────────────────────────────────
document.getElementById('save-username-btn').addEventListener('click', async () => {
    const errEl = document.getElementById('save-username-error');
    errEl.textContent = '';
    const username = document.getElementById('widget-username').value.trim();
    if (!username) { errEl.textContent = 'Please enter a username.'; return; }
    try {
        const data = await apiPut('/api/me/mcsr-username', { mcsr_username: username });
        if (data.error) { errEl.textContent = data.error; return; }
        showToast('Username saved!');
    } catch (err) {
        errEl.textContent = 'Failed: ' + err.message;
    }
});

// ── Copy widget URL ──────────────────────────────────────────────────────
document.getElementById('copy-widget-url-btn').addEventListener('click', () => {
    const url = document.getElementById('widget-url-display').textContent;
    navigator.clipboard.writeText(url).then(() => showToast('URL copied!'));
});

// ── Regenerate token ─────────────────────────────────────────────────────
document.getElementById('regen-token-btn').addEventListener('click', async () => {
    if (!confirm('Regenerate your widget token? This will break any existing OBS Browser Source links.')) return;
    try {
        const data = await apiPost('/api/me/regen-widget-token', {});
        if (data.error) { showToast('Error: ' + data.error); return; }
        currentWidgetToken = data.widget_token;
        updateWidgetUrlDisplay();
        showToast('Token regenerated — update your OBS source.');
    } catch (err) {
        showToast('Failed: ' + err.message);
    }
});

// ── Init ─────────────────────────────────────────────────────────────────
async function init() {
    // Show success toast if redirected from Stripe Checkout
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') === '1') {
        showToast('Welcome to Pro! Your subscription is active.');
        window.history.replaceState({}, '', '/dashboard.html');
    }

    try {
        const me = await apiGet('/api/me');
        const displayName = me.display_name || me.username || me.email || 'Speedrunner';
        document.getElementById('user-name').textContent = displayName;
        document.getElementById('db-welcome-name').textContent = displayName;

        const isPro = me.sub_status === 'active';
        const pastDue = me.sub_status === 'past_due';

        document.getElementById('plan-name').textContent = isPro ? 'Pro' : (pastDue ? 'Pro (past due)' : 'Free');
        document.getElementById('db-plan-badge').textContent = isPro ? '✦ Pro Plan' : (pastDue ? '✦ Pro (Past Due)' : '✦ Free Plan');

        // Show renewal date for active/past_due subscribers
        if ((isPro || pastDue) && me.current_period_end) {
            const renewDate = new Date(me.current_period_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            document.getElementById('plan-renew').textContent = ` (renews ${renewDate})`;
        }

        // Toggle upgrade vs manage billing button
        if (isPro || pastDue) {
            document.getElementById('upgrade-btn').style.display = 'none';
            document.getElementById('billing-btn').style.display = '';
        }

        // Past due warning
        if (pastDue) {
            document.getElementById('past-due-warning').style.display = '';
        }

        // Toggle widget card based on Pro status
        if (isPro) {
            document.getElementById('widget-card-pro').style.display = '';
            document.getElementById('widget-card-free').style.display = 'none';
        } else {
            document.getElementById('widget-card-pro').style.display = 'none';
            document.getElementById('widget-card-free').style.display = '';
        }

        // Populate widget fields
        currentWidgetToken = me.widget_token || null;
        if (me.mcsr_username) {
            document.getElementById('widget-username').value = me.mcsr_username;
        }
        updateWidgetUrlDisplay();
    } catch { return; }
}

// ── Upgrade button ───────────────────────────────────────────────────────
document.getElementById('upgrade-btn').addEventListener('click', () => {
    window.location.href = '/upgrade.html';
});

// ── Manage Billing button ─────────────────────────────────────────────────
async function openBillingPortal() {
    try {
        const data = await apiPost('/api/billing-portal', {});
        if (data.error) { showToast(data.error); return; }
        window.location.href = data.url;
    } catch (err) {
        showToast('Failed: ' + err.message);
    }
}
document.getElementById('billing-btn').addEventListener('click', openBillingPortal);
document.getElementById('update-payment-btn').addEventListener('click', openBillingPortal);

init();
