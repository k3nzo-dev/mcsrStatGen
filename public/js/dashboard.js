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

document.getElementById('widget-username').addEventListener('input', () => {
    updateWidgetUrlDisplay();
    previewLoaded = false;
});

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

// ── Widget Customizer ────────────────────────────────────────────────────
const wcAccent = document.getElementById('wc-accent-color');
const wcAccentHex = document.getElementById('wc-accent-hex');
const wcTheme = document.getElementById('wc-theme');
const wcBastion = document.getElementById('wc-bastion');
const wcOverworld = document.getElementById('wc-overworld');
const wcSplits = document.getElementById('wc-splits');
const wcSaveBtn = document.getElementById('wc-save-btn');
const wcSaveStatus = document.getElementById('wc-save-status');
const wcPreview = document.getElementById('wc-preview-iframe');

let previewDebounce = null;
let previewLoaded = false;

// ── Iframe scaling via ResizeObserver ────────────────────────────────────
const WIDGET_BASE_WIDTH = 680;
let lastWidgetHeight = 300; // default until widget reports
let lastContainerWidth = 0;

const previewContainer = wcPreview.closest('.preview-container');

function updateIframeScale() {
    if (!previewContainer) return;
    const containerWidth = previewContainer.clientWidth;
    if (containerWidth <= 0) return;
    const fitScale = containerWidth / WIDGET_BASE_WIDTH;
    wcPreview.style.transform = 'scale(' + fitScale + ')';
    wcPreview.style.height = lastWidgetHeight + 'px';
    previewContainer.style.height = Math.ceil(lastWidgetHeight * fitScale) + 'px';
    lastContainerWidth = containerWidth;
}

const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const newWidth = entry.contentRect.width;
    // Only recalculate when width actually changes (avoid height-change loops)
    if (Math.abs(newWidth - lastContainerWidth) > 1) updateIframeScale();
});
if (previewContainer) resizeObserver.observe(previewContainer);

// Listen for height updates from widget iframe
window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (!e.data || e.data.type !== 'widget-height-update') return;
    lastWidgetHeight = e.data.height;
    updateIframeScale();
});

function showPreviewLoading() {
    let loader = document.getElementById('wc-preview-loader');
    if (!loader) {
        const container = wcPreview.parentElement;
        loader = document.createElement('div');
        loader.id = 'wc-preview-loader';
        loader.className = 'preview-loader';
        loader.innerHTML = '<div class="preview-spinner"></div>';
        container.appendChild(loader);
    }
    loader.style.display = '';
    const err = document.getElementById('wc-preview-error');
    if (err) err.style.display = 'none';
}

function hidePreviewLoading() {
    const loader = document.getElementById('wc-preview-loader');
    if (loader) loader.style.display = 'none';
}

function showPreviewError() {
    hidePreviewLoading();
    let errEl = document.getElementById('wc-preview-error');
    if (!errEl) {
        const container = wcPreview.parentElement;
        errEl = document.createElement('div');
        errEl.id = 'wc-preview-error';
        errEl.className = 'preview-error';
        errEl.textContent = 'Preview failed to load.';
        container.appendChild(errEl);
    }
    errEl.style.display = '';
}

wcPreview.addEventListener('load', () => {
    previewLoaded = true;
    hidePreviewLoading();
    updateIframeScale();
});
wcPreview.addEventListener('error', () => {
    previewLoaded = false;
    showPreviewError();
});

function getWidgetSettings() {
    return {
        accentColor: wcAccent.value,
        theme: wcTheme.value,
        showBastion: wcBastion.checked,
        showOverworld: wcOverworld.checked,
        showSplits: wcSplits.checked,
    };
}

function populateCustomizer(settings) {
    if (!settings) return;
    if (settings.accentColor) {
        wcAccent.value = settings.accentColor;
        wcAccentHex.textContent = settings.accentColor;
    }
    if (settings.theme) wcTheme.value = settings.theme;
    if (typeof settings.showBastion === 'boolean') wcBastion.checked = settings.showBastion;
    if (typeof settings.showOverworld === 'boolean') wcOverworld.checked = settings.showOverworld;
    if (typeof settings.showSplits === 'boolean') wcSplits.checked = settings.showSplits;
}

function refreshPreview() {
    const username = document.getElementById('widget-username').value.trim();
    if (!username || !currentWidgetToken) return;
    const settings = getWidgetSettings();

    if (previewLoaded && wcPreview.contentWindow) {
        // Instant update via postMessage (no iframe reload)
        wcPreview.contentWindow.postMessage({
            type: 'widget-settings-update',
            settings,
        }, location.origin);
    } else {
        // First load or username changed — full iframe load with spinner
        showPreviewLoading();
        const params = new URLSearchParams({
            token: currentWidgetToken,
            theme: settings.theme,
            accentColor: settings.accentColor,
            showBastion: settings.showBastion,
            showOverworld: settings.showOverworld,
            showSplits: settings.showSplits,
        });
        wcPreview.src = '/widget/' + encodeURIComponent(username) + '?' + params.toString();
    }
}

function schedulePreviewRefresh() {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(refreshPreview, 600);
}

wcAccent.addEventListener('input', () => {
    wcAccentHex.textContent = wcAccent.value;
    schedulePreviewRefresh();
});
wcTheme.addEventListener('change', schedulePreviewRefresh);
wcBastion.addEventListener('change', schedulePreviewRefresh);
wcOverworld.addEventListener('change', schedulePreviewRefresh);
wcSplits.addEventListener('change', schedulePreviewRefresh);

wcSaveBtn.addEventListener('click', async () => {
    wcSaveStatus.textContent = '';
    wcSaveStatus.style.color = '';
    wcSaveBtn.disabled = true;
    wcSaveBtn.textContent = 'Saving...';
    try {
        const data = await apiPut('/api/me/widget-settings', getWidgetSettings());
        if (data.error) {
            wcSaveStatus.textContent = data.error;
            wcSaveStatus.style.color = '#dc2626';
        } else {
            showToast('Widget settings saved!');
        }
    } catch (err) {
        wcSaveStatus.textContent = 'Failed: ' + err.message;
        wcSaveStatus.style.color = '#dc2626';
    }
    wcSaveBtn.disabled = false;
    wcSaveBtn.textContent = 'Save Widget Settings';
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

        // Toggle widget card and customizer based on Pro status
        if (isPro) {
            document.getElementById('widget-card-pro').style.display = '';
            document.getElementById('widget-card-free').style.display = 'none';
            document.getElementById('widget-customizer').style.display = '';
            // Populate customizer with saved settings
            populateCustomizer(me.widget_settings);
        } else {
            document.getElementById('widget-card-pro').style.display = 'none';
            document.getElementById('widget-card-free').style.display = '';
            document.getElementById('widget-customizer').style.display = 'none';
        }

        // Populate widget fields
        currentWidgetToken = me.widget_token || null;
        if (me.mcsr_username) {
            document.getElementById('widget-username').value = me.mcsr_username;
        }
        updateWidgetUrlDisplay();

        // Load live preview if Pro with username set
        if (isPro && me.mcsr_username) {
            refreshPreview();
        }
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
