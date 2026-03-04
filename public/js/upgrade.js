// ── Nav scroll shadow ──────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  document.getElementById('up-nav')
    .classList.toggle('nav-scrolled', window.scrollY > 10);
});

// ── Toast ──────────────────────────────────────────────────────────────
const toast = document.getElementById('toast');
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// ── Format price ───────────────────────────────────────────────────────
function formatPrice(amount, currency) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'usd',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

// ── API helpers ────────────────────────────────────────────────────────
async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Init ───────────────────────────────────────────────────────────────
async function init() {
  // Success toast from Stripe redirect
  const params = new URLSearchParams(window.location.search);
  if (params.get('upgraded') === '1') {
    showToast('Welcome to Pro! Your subscription is active.');
    window.history.replaceState({}, '', '/upgrade.html');
  }

  // Fetch auth + product info in parallel
  const [meRes, productRes] = await Promise.allSettled([
    fetch('/api/me', { headers: { Accept: 'application/json' } }).then(r => r.ok ? r.json() : null),
    fetch('/api/pro-product', { headers: { Accept: 'application/json' } }).then(r => r.ok ? r.json() : null),
  ]);

  const me = meRes.status === 'fulfilled' ? meRes.value : null;
  const product = productRes.status === 'fulfilled' ? productRes.value : null;

  // ── Nav auth button ────────────────────────────────────────────────
  const navBtn = document.getElementById('nav-auth-btn');
  if (me) {
    navBtn.textContent = 'Dashboard';
    navBtn.href = '/dashboard.html';
  }

  // ── Product info ───────────────────────────────────────────────────
  const priceEl = document.getElementById('product-price');
  const intervalEl = document.getElementById('product-interval');
  const nameEl = document.getElementById('product-name');
  const descEl = document.getElementById('product-desc');
  const heroSub = document.getElementById('hero-sub');

  const compareProPrice = document.getElementById('compare-pro-price');

  if (product) {
    nameEl.textContent = product.name || 'Pro Plan';
    const formattedPrice = formatPrice(product.price_amount, product.price_currency);
    priceEl.textContent = formattedPrice;
    if (compareProPrice) compareProPrice.textContent = formattedPrice + (product.interval ? '/' + product.interval : '');
    intervalEl.textContent = product.interval ? 'per ' + product.interval : '';
    if (product.description) {
      descEl.textContent = product.description;
      heroSub.textContent = product.description;
    } else {
      descEl.textContent = 'Unlock the full streaming experience with a live OBS overlay.';
    }
  } else {
    priceEl.textContent = '';
    if (compareProPrice) compareProPrice.textContent = '';
    descEl.textContent = 'Product details unavailable. Please try again later.';
  }

  // ── View switching: Free comparison vs Manage Subscription ─────────
  const freeView = document.getElementById('free-comparison');
  const manageView = document.getElementById('manage-view');
  const ctaBtn = document.getElementById('cta-btn');
  const manageBtn = document.getElementById('manage-billing-btn');

  const isPro = me && (me.sub_status === 'active' || me.sub_status === 'past_due');

  if (isPro) {
    // Show manage subscription view
    freeView.style.display = 'none';
    manageView.style.display = '';

    document.getElementById('manage-status').textContent = me.sub_status === 'active' ? 'Active' : 'Past Due';
    document.getElementById('manage-status').className = 'manage-status-badge ' + (me.sub_status === 'active' ? 'status-active' : 'status-past-due');

    if (me.current_period_end) {
      const renewDate = new Date(me.current_period_end).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
      document.getElementById('manage-renew-date').textContent = renewDate;
    } else {
      document.getElementById('manage-renew-row').style.display = 'none';
    }

    ctaBtn.textContent = "You're on Pro";
    ctaBtn.disabled = true;
    manageBtn.style.display = '';

    // Billing portal buttons
    var portalHandler = async () => {
      try {
        const data = await apiPost('/api/billing-portal', {});
        if (data.url) window.location.href = data.url;
        else showToast(data.error || 'Could not open billing portal.');
      } catch { showToast('Failed to open billing portal.'); }
    };
    manageBtn.addEventListener('click', portalHandler);
    document.getElementById('update-payment-btn').addEventListener('click', portalHandler);
    document.getElementById('cancel-sub-btn').addEventListener('click', portalHandler);
  } else {
    // Show free vs pro comparison
    freeView.style.display = '';
    manageView.style.display = 'none';

    if (!me) {
      // Not logged in
      ctaBtn.textContent = 'Sign In to Subscribe';
      ctaBtn.disabled = false;
      ctaBtn.addEventListener('click', () => {
        window.location.href = '/login.html';
      });
    } else {
      // Free user — subscribe
      ctaBtn.textContent = product ? 'Subscribe for ' + formatPrice(product.price_amount, product.price_currency) + '/' + (product.interval || 'month') : 'Subscribe Now';
      ctaBtn.disabled = false;
      ctaBtn.addEventListener('click', async () => {
        ctaBtn.disabled = true;
        ctaBtn.textContent = 'Redirecting...';
        try {
          const data = await apiPost('/api/subscribe', {});
          if (data.url) {
            window.location.href = data.url;
          } else {
            showToast(data.error || 'Something went wrong.');
            ctaBtn.disabled = false;
            ctaBtn.textContent = 'Subscribe Now';
          }
        } catch {
          showToast('Failed to start checkout.');
          ctaBtn.disabled = false;
          ctaBtn.textContent = 'Subscribe Now';
        }
      });
    }
  }
}

init();
