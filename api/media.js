// Shared media library: records of files stored in Vercel Blob, plus text cards.
import { del } from '@vercel/blob';
import { guard, json, readJSON, writeJSON } from './_lib.js';

const KEY = 'knpc-museum:media';
const KINDS = ['image', 'video', 'text'];

export async function GET(request) {
  const denied = await guard(request);
  if (denied) return denied;
  return json({ ok: true, items: await readJSON(KEY, []) });
}

export async function POST(request) {
  const denied = await guard(request);
  if (denied) return denied;
  let r;
  try { r = await request.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400); }
  if (!r || typeof r.id !== 'string' || !KINDS.includes(r.kind)) return json({ ok: false, error: 'bad-data' }, 400);
  if (r.kind !== 'text' && (typeof r.url !== 'string' || !/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i.test(r.url))) {
    return json({ ok: false, error: 'bad-url' }, 400);
  }
  const rec = {
    id: r.id.slice(0, 64), kind: r.kind, name: String(r.name || '').slice(0, 120),
    url: r.kind === 'text' ? undefined : r.url, spec: r.kind === 'text' ? r.spec : undefined, at: Date.now(),
  };
  const list = (await readJSON(KEY, [])).filter((x) => x.id !== rec.id);
  list.push(rec);
  await writeJSON(KEY, list);
  return json({ ok: true, item: rec });
}

export async function DELETE(request) {
  const denied = await guard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get('id');
  const list = await readJSON(KEY, []);
  const rec = list.find((x) => x.id === id);
  if (!rec) return json({ ok: true });
  await writeJSON(KEY, list.filter((x) => x.id !== id));
  if (rec.url) { try { await del(rec.url); } catch { /* the record is gone either way */ } }
  return json({ ok: true });
}
