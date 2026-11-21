import { createHash } from "node:crypto";
import { staffPublicResetScript } from "./staff-public-reset-script";
import { staffPublicResetStyle } from "./staff-public-reset-style";

const hash = (value: string) => createHash("sha256").update(value).digest("base64");

export const staffPublicResetContentSecurityPolicy = [
  "default-src 'none'",
  `script-src 'sha256-${hash(staffPublicResetScript)}'`,
  `style-src 'sha256-${hash(staffPublicResetStyle)}'`,
  "connect-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "img-src 'none'",
].join("; ");

export function staffPublicResetDocument() {
  return `<!doctype html>
<html lang="en" dir="ltr" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Reset your VAYLET password</title>
<script>${staffPublicResetScript}</script>
<style>${staffPublicResetStyle}</style>
</head>
<body>
<main>
<article aria-labelledby="reset-title">
  <div class="tools">
    <button type="button" id="reset-language">EN / العربية</button>
    <button type="button" id="reset-theme">Dark mode</button>
  </div>
  <p class="brand">VAYLET</p>
  <h1 id="reset-title" data-copy="title">Reset your VAYLET password</h1>
  <p class="muted" data-copy="intro">Choose a new password for your existing account.</p>
  <p class="muted" id="reset-missing" hidden data-copy="missing"></p>
  <form id="reset-form" autocomplete="off" hidden novalidate>
    <p class="muted" id="reset-policy" data-copy="policy">Use 15–128 characters with no line breaks.</p>
    <div class="field">
      <label for="reset-password" data-copy="password">New password</label>
      <input id="reset-password" type="password" autocomplete="new-password" aria-describedby="reset-policy" required>
    </div>
    <div class="field">
      <label for="reset-confirm" data-copy="confirmPassword">Confirm new password</label>
      <input id="reset-confirm" type="password" autocomplete="new-password" required>
    </div>
    <p id="reset-feedback" role="alert" aria-live="polite"></p>
    <button class="primary" type="submit" id="reset-submit" data-copy="submit">Reset password</button>
  </form>
  <div id="reset-complete" hidden role="status">
    <p data-copy="done">Your password was changed. Sign in again with your new password.</p>
    <a href="/" class="sign-in" id="reset-sign-in" data-copy="signIn">Sign in</a>
  </div>
  <div id="reset-unknown" hidden role="status">
    <p data-copy="unknown">The server did not confirm the result. Try signing in with your new password. If that fails, request a new link from your company administrator.</p>
    <a href="/" class="sign-in" id="reset-unknown-sign-in" data-copy="signIn">Sign in</a>
  </div>
</article>
</main>
</body>
</html>`;
}
