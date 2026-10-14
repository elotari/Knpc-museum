// Checks the shared team password and remembers it in a cookie for 30 days.
import { AUTH_COOKIE, json, passwordHash } from './_lib.js';

export async function POST(request) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return json({ ok: true });
  let given = '';
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) given = ((await request.json().catch(() => ({}))).password) || '';
  else given = (await request.formData().catch(() => new FormData())).get('password') || '';
  if (String(given) !== pw) return json({ ok: false, error: 'wrong-password' }, 401);
  const cookie = `${AUTH_COOKIE}=${await passwordHash(pw)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie } });
}
