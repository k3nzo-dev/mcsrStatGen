// ── Tab switching ────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        document.getElementById('forgot-section').style.display = 'none';
    });
});

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

// ── Sign In ──────────────────────────────────────────────────────────────
document.getElementById('signin-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errorEl = document.getElementById('signin-error');
    errorEl.textContent = '';
    const btn = e.target.querySelector('.submit-btn');

    const username = document.getElementById('signin-username').value.trim().toLowerCase();
    const password = document.getElementById('signin-password').value;

    if (!USERNAME_RE.test(username)) {
        errorEl.textContent = 'Invalid username format.';
        return;
    }
    if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        return;
    }

    btn.disabled = true;
    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (data.ok) {
            window.location.href = '/dashboard.html';
        } else {
            errorEl.textContent = data.error || 'Sign in failed.';
            btn.disabled = false;
        }
    } catch {
        errorEl.textContent = 'Server error. Please try again.';
        btn.disabled = false;
    }
});

// ── Forgot Password ─────────────────────────────────────────────────────
document.getElementById('forgot-link').addEventListener('click', e => {
    e.preventDefault();
    const section = document.getElementById('forgot-section');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('forgot-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msgEl = document.getElementById('forgot-msg');
    msgEl.textContent = '';
    msgEl.style.color = 'var(--green)';
    const btn = e.target.querySelector('.submit-btn');

    const email = document.getElementById('forgot-email').value.trim();
    if (!email) return;

    btn.disabled = true;
    try {
        const res = await fetch('/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ email }),
        });
        const data = await res.json();
        msgEl.textContent = data.message || 'If that email is registered, a reset link has been sent.';
    } catch {
        msgEl.style.color = '#dc2626';
        msgEl.textContent = 'Server error. Please try again.';
    }
    btn.disabled = false;
});

// ── Register ─────────────────────────────────────────────────────────────
document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errorEl = document.getElementById('register-error');
    errorEl.textContent = '';
    const btn = e.target.querySelector('.submit-btn');

    const username = document.getElementById('reg-username').value.trim().toLowerCase();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (!USERNAME_RE.test(username)) {
        errorEl.textContent = 'Username must be 3–20 characters (letters, numbers, underscores).';
        return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorEl.textContent = 'A valid email address is required.';
        return;
    }
    if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        return;
    }
    if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match.';
        return;
    }

    btn.disabled = true;
    try {
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ username, email, password }),
        });
        const data = await res.json();
        if (data.ok) {
            window.location.href = '/dashboard.html';
        } else {
            errorEl.textContent = data.error || 'Registration failed.';
            btn.disabled = false;
        }
    } catch {
        errorEl.textContent = 'Server error. Please try again.';
        btn.disabled = false;
    }
});
