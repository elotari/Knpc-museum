// The shared plan: every example wall, saved for the whole team.
import { guard, json, readJSON, writeJSON } from './_lib.js';

const KEY = 'knpc-museum:state'; // prefixed: the Redis database may be shared with other projects
const MAX_BYTES = 900 * 1024; // stays under Upstash's request size limit

export async function GET(request) {
  const denied = await guard(request);
  if (denied) return denied;
  const doc = await readJSON(KEY, { rev: 0, data: null, savedAt: 0 });
  const since = Number(new URL(request.url).searchParams.get('since') || -1);
  // cheap poll: nothing new since the client's revision
  if (since >= 0 && since === doc.rev) return json({ ok: true, rev: doc.rev, unchanged: true });
  return json({ ok: true, rev: doc.rev, savedAt: doc.savedAt, data: doc.data });
}

export async function PUT(request) {
  const denied = await guard(request);
  if (denied) return denied;
  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ ok: false, error: 'too-large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: 'bad-json' }, 400); }
  const data = body && body.data;
  if (!data || data.v !== 2 || !Array.isArray(data.examples) || !data.examples.length) {
    return json({ ok: false, error: 'bad-data' }, 400);
  }
  const cur = await readJSON(KEY, { rev: 0 });
  const doc = { rev: (cur.rev || 0) + 1, savedAt: Date.now(), data: { v: 2, examples: data.examples } };
  await writeJSON(KEY, doc);
  // last write wins; tell the client whether someone else saved in between
  return json({ ok: true, rev: doc.rev, overwrote: typeof body.baseRev === 'number' && body.baseRev !== cur.rev });
}
