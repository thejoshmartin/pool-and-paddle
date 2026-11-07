import { Redis } from '@upstash/redis';
import { get } from '@vercel/blob';
import { scopedKey, parseReceiptPathname, purchasesFromHash, isReceiptReferenced } from './_scope.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// Serve a private receipt to a logged-in user.
//
// Access model: Pool & Paddle is a two-person SHARED account (Josh + Kerry). Both users
// intentionally see all properties and all data — there is no per-user ownership, so being
// authenticated as JM/KM (enforced by middleware.js) is the complete authorization model.
// This route ALSO validates, defense-in-depth (never trust the matcher alone):
//   1. the pathname is well-formed (receipts/<propId>/<purchaseId>/<file>, no traversal);
//   2. the pathname is actually referenced by SOME purchase in that property (several purchases —
//      the lines of one order — may share a receipt, so the uploader's id in the path is not
//      authoritative) — so a logged-in user cannot enumerate arbitrary blobs or reach another
//      property's receipts.
// Then it streams the file from the private store via get() (token auto-read from env).
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const pathname = req.query.pathname;
  const parsed = parseReceiptPathname(pathname);
  if (!parsed) return res.status(400).json({ error: 'Bad pathname' });

  // Confirm the pathname is referenced by a real purchase in this property. Fast path: the
  // uploader's own record (id is in the path) usually still references it — one HGET. Otherwise
  // (shared receipts, or that purchase was deleted) scan the property's purchases.
  const key = scopedKey('purchases', parsed.propertyId);
  let referenced = false;
  try {
    const direct = await redis.hget(key, parsed.purchaseId);
    if (direct) referenced = isReceiptReferenced([typeof direct === 'string' ? JSON.parse(direct) : direct], pathname);
  } catch (e) { /* fall through to the full scan */ }
  if (!referenced) {
    referenced = isReceiptReferenced(purchasesFromHash(await redis.hgetall(key)), pathname);
  }
  if (!referenced) return res.status(404).json({ error: 'Not found' });

  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200) return res.status(404).json({ error: 'Not found' });

  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.status(200).send(buffer);
}
