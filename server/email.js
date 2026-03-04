const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendPasswordResetEmail(toEmail, resetLink) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping password reset email.');
    return;
  }

  const from = process.env.EMAIL_FROM || 'MCSR Ranked Stats <onboarding@resend.dev>';

  await resend.emails.send({
    from,
    to: toEmail,
    subject: 'Reset your password — MCSR Ranked Stats',
    html: `
      <div style="font-family:'Inter',sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px">
        <h2 style="color:#1a1a2e;margin:0 0 16px">Reset your password</h2>
        <p style="color:#555;font-size:14px;line-height:1.6">
          You requested a password reset for your MCSR Ranked Stats account.
          Click the button below within <strong>1 hour</strong> to set a new password.
        </p>
        <a href="${resetLink}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#3a7d44;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px">
          Reset Password
        </a>
        <p style="color:#999;font-size:12px;line-height:1.5">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetEmail };
