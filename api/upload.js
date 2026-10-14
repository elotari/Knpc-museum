// Issues short-lived tokens so the browser can upload images and videos straight to Vercel Blob.
import { handleUpload } from '@vercel/blob/client';
import { isAuthed, json } from './_lib.js';

export async function POST(request) {
  if (!(await isAuthed(request))) return json({ error: 'auth' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad-json' }, 400); }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/*', 'video/*'],
        maximumSizeInBytes: 1024 * 1024 * 1024, // 1 GB per file
        addRandomSuffix: true,
      }),
    });
    return json(result);
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 400);
  }
}
