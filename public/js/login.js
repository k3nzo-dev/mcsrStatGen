// ── Tab switching ────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
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

// ── Register ─────────────────────────────────────────────────────────────
document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errorEl = document.getElementById('register-error');
    errorEl.textContent = '';
    const btn = e.target.querySelector('.submit-btn');

    const username = document.getElementById('reg-username').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (!USERNAME_RE.test(username)) {
        errorEl.textContent = 'Username must be 3–20 characters (letters, numbers, underscores).';
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
            body: JSON.stringify({ username, password }),
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
