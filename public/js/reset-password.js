const params = new URLSearchParams(window.location.search);
const token = params.get('token');

if (!token) {
  document.getElementById('reset-error').textContent = 'Missing reset token. Please use the link from your email.';
  document.querySelector('.submit-btn').disabled = true;
}

document.getElementById('reset-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errorEl = document.getElementById('reset-error');
  const successEl = document.getElementById('reset-success');
  errorEl.textContent = '';
  successEl.textContent = '';
  const btn = e.target.querySelector('.submit-btn');

  const password = document.getElementById('reset-password').value;
  const confirm = document.getElementById('reset-confirm').value;

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
    const res = await fetch('/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (data.ok) {
      successEl.textContent = 'Password reset! Redirecting to sign in...';
      setTimeout(() => { window.location.href = '/login.html'; }, 2000);
    } else {
      errorEl.textContent = data.error || 'Reset failed.';
      btn.disabled = false;
    }
  } catch {
    errorEl.textContent = 'Server error. Please try again.';
    btn.disabled = false;
  }
});
