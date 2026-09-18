type PasswordEmailInput = {
  appUrl: string;
  appName: string;
  fromName: string;
  name: string;
  email: string;
  organizationName: string;
  token: string;
  reason: "welcome" | "reset";
};

export function buildPasswordEmail(input: PasswordEmailInput) {
  const setupUrl = `${input.appUrl}/reset-password?token=${encodeURIComponent(input.token)}`;
  const title = input.reason === "welcome" ? `Welcome to ${input.appName}` : "Reset your password";
  const intro = input.reason === "welcome"
    ? `Your secure ${input.organizationName} workspace is ready.`
    : "A password reset was requested for your account.";
  const buttonLabel = input.reason === "welcome" ? "Set up my password" : "Reset my password";
  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.email);
  const safeOrganization = escapeHtml(input.organizationName);
  const safeAppName = escapeHtml(input.appName);
  const safeFromName = escapeHtml(input.fromName);
  const safeUrl = escapeHtml(setupUrl);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      body { margin: 0; padding: 0; background: #f5f7f8; color: #17211f; font-family: Arial, Helvetica, sans-serif; }
      .wrapper { width: 100%; background: #f5f7f8; padding: 24px 12px; }
      .card { width: 100%; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #dfe7e5; border-radius: 10px; }
      .content { padding: 32px 36px; }
      .muted { color: #5d6b68; }
      .link { color: #007bff; word-break: break-all; }
      .button { display: inline-block; background: #0f766e; border-radius: 6px; color: #ffffff !important; font-weight: 700; padding: 13px 22px; text-decoration: none; }
      @media only screen and (max-width: 640px) { .content { padding: 26px 22px !important; } }
      @media (prefers-color-scheme: dark) {
        body, .wrapper { background: #101917 !important; color: #f2f7f5 !important; }
        .card { background: #182320 !important; border-color: #31403c !important; }
        .muted { color: #b8c6c1 !important; }
        .link { color: #75b9ff !important; }
      }
    </style>
  </head>
  <body>
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(title)} for ${safeOrganization}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="wrapper">
      <tr><td>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="card">
          <tr><td align="center" style="padding:28px 24px 18px;">
            <a href="${escapeHtml(input.appUrl)}" target="_blank">
              <img src="https://cdn.cocoonmail.com/assets/ccnm-logo-light.png" width="200" alt="${safeAppName}" style="display:block;width:200px;max-width:100%;height:auto;border:0;">
            </a>
          </td></tr>
          <tr><td class="content">
            <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:700;">Hi ${safeName},</h1>
            <p style="margin:0 0 14px;font-size:16px;line-height:1.55;">${intro}</p>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.55;">Use the secure button below to activate your account and choose your password.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td><a class="button" href="${safeUrl}" target="_blank">${buttonLabel}</a></td></tr></table>
            <p class="muted" style="margin:0 0 18px;font-size:13px;line-height:1.55;">This one-time link expires in 24 hours.</p>
            <p class="muted" style="margin:0 0 8px;font-size:13px;line-height:1.55;"><strong>Email:</strong> ${safeEmail}</p>
            <p class="muted" style="margin:0 0 22px;font-size:13px;line-height:1.55;"><strong>Organization:</strong> ${safeOrganization}</p>
            <p class="muted" style="margin:0 0 18px;font-size:13px;line-height:1.55;">If the button does not work, copy and paste this secure link into your browser:</p>
            <p style="margin:0 0 24px;font-size:13px;line-height:1.55;"><a class="link" href="${safeUrl}" target="_blank">${safeUrl}</a></p>
            <p class="muted" style="margin:0 0 18px;font-size:13px;line-height:1.55;">If you did not request this account or reset, you can safely ignore this email.</p>
            <p class="muted" style="margin:0;font-size:13px;line-height:1.55;">Need help? Contact your organization administrator.</p>
          </td></tr>
          <tr><td align="center" style="padding:18px 24px 26px;border-top:1px solid #dfe7e5;">
            <p class="muted" style="margin:0 0 6px;font-size:12px;line-height:1.5;">Welcome to ${safeAppName}.</p>
            <p class="muted" style="margin:0;font-size:12px;line-height:1.5;"><strong>${safeFromName}</strong></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}
