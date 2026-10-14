// Team password gate. Off unless the SITE_PASSWORD environment variable is set on Vercel.
import { next } from '@vercel/functions';
import { AUTH_COOKIE, passwordHash, readCookie } from './api/_lib.js';

export const config = { runtime: 'nodejs' };

const OPEN = ['/api/login', '/favicon.ico'];

export default async function middleware(request) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return next();
  const { pathname } = new URL(request.url);
  if (OPEN.includes(pathname)) return next();
  if (readCookie(request, AUTH_COOKIE) === (await passwordHash(pw))) return next();
  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ ok: false, error: 'auth' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(LOGIN_PAGE, { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

const LOGIN_PAGE = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>مخطط شاشات متحف KNPC</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
    background: #0b1018; color: #ece5d3; font: 15px/1.6 "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif; }
  form { width: min(360px, 100%); display: grid; gap: 12px; padding: 28px 24px; border: 1px solid #33405a; border-radius: 12px; background: #111825; }
  .mark { justify-self: start; font: 700 13px/1 ui-monospace, Menlo, monospace; letter-spacing: .14em; color: #241a08; background: #d9b46a; padding: 7px 8px 6px; border-radius: 4px; }
  h1 { margin: 0; font-size: 20px; color: #f2d394; }
  p { margin: 0; color: #8e98a9; font-size: 13.5px; }
  input { padding: 10px 12px; border-radius: 8px; border: 1px solid #33405a; background: #0b1018; color: inherit; font: inherit; }
  input:focus { outline: 2px solid #f2d394; outline-offset: 1px; }
  button { padding: 10px; border: 0; border-radius: 8px; background: #d9b46a; color: #241a08; font: inherit; font-weight: 700; cursor: pointer; }
  .err { color: #e8866a; min-height: 1.4em; }
</style></head>
<body>
<form id="f">
  <span class="mark">KNPC</span>
  <h1>مخطط شاشات المتحف</h1>
  <p>أدخل كلمة سر الفريق للمتابعة.</p>
  <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus aria-label="كلمة السر">
  <button type="submit">دخول</button>
  <div class="err" id="err" role="alert"></div>
</form>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('pw').value }) });
  if (r.ok) location.reload();
  else document.getElementById('err').textContent = 'كلمة السر غير صحيحة.';
});
</script>
</body></html>`;
