// Shared helpers for the API routes (files starting with "_" are not deployed as routes).

// Upstash Redis over its REST API. The Vercel Marketplace integration names the
// variables with a prefix (KV_ by default), so accept any *_REST_API_URL / *_REST_URL pair.
function redisEnv() {
  const env = process.env;
  const pairs = [
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  ];
  for (const [u, t] of pairs) if (env[u] && env[t]) return { url: env[u], token: env[t] };
  for (const k of Object.keys(env)) {
    const m = k.match(/^(.*)_REST_API_URL$/) || k.match(/^(.*)_REDIS_REST_URL$/);
    if (!m) continue;
    const token = env[`${m[1]}_REST_API_TOKEN`] || env[`${m[1]}_REDIS_REST_TOKEN`];
    if (token) return { url: env[k], token };
  }
  return null;
}

export const hasRedis = () => !!redisEnv();

export async function redis(...command) {
  const cfg = redisEnv();
  if (!cfg) throw new Error('no-db');
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `redis ${r.status}`);
  return j.result;
}

export async function readJSON(key, fallback) {
  const v = await redis('GET', key);
  if (v == null) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}
export const writeJSON = (key, value) => redis('SET', key, JSON.stringify(value));

// ---- shared password (optional: only enforced when SITE_PASSWORD is set) ----
export const AUTH_COOKIE = 'knpc_auth';

export async function passwordHash(pw) {
  const data = new TextEncoder().encode(`knpc-museum:${pw}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function isAuthed(request) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return true;
  return readCookie(request, AUTH_COOKIE) === (await passwordHash(pw));
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function guard(request) {
  if (!(await isAuthed(request))) return json({ ok: false, error: 'auth' }, 401);
  if (!hasRedis()) return json({ ok: false, error: 'no-db' }, 503);
  return null;
}
