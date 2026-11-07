import { Redis } from '@upstash/redis';
import { del } from '@vercel/blob';
import { scopedKey, purchasesFromHash, blobIsReferenced } from './_scope.js';
import { sanitizeInboxRecord } from '../src/lib/receipt-logic.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// pp_session carries `USERNAME:hash`; middleware.js has already verified it before this runs (same as api/house-info.js).
function currentUser(req) {
  const session = req.cookies && req.cookies.pp_session;
  if (!session) return null;
  const sep = session.indexOf(':');
  return sep === -1 ? null : session.slice(0, sep);
}

// The Receipt Inbox is a Redis HASH per property (`receipt-inbox:<id>`, field = inbox id, value = JSON record) — the same
// targeted single-record discipline as purchases / house info: GET = HGETALL, PUT = HSET one field, DELETE = HDEL one
// field, never a whole-hash write. ?property= is REQUIRED (400 without — there is no legacy data, and a bare-key fallback
// would be invisible to api/backup.js). Every PUT is whitelisted by sanitizeInboxRecord and stamped server-side.
export default async function handler(req, res) {
  const property = req.query.property;
  if (!property || typeof property !== 'string') {
    return res.status(400).json({ error: 'Missing property' });
  }
  const key = scopedKey('receipt-inbox', property);
  if (key === null) {
    return res.status(400).json({ error: 'Invalid property id' });
  }

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(purchasesFromHash(await redis.hgetall(key)));
  }

  if (req.method === 'PUT') {
    const result = sanitizeInboxRecord(req.body, { updatedAt: new Date().toISOString(), updatedBy: currentUser(req) });
    if (!result.ok) return res.status(400).json({ error: result.error });
    await redis.hset(key, { [result.record.id]: JSON.stringify(result.record) });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, record: result.record });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id || typeof id !== 'string' || !/^ri-[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Expected a valid id' });
    }
    // Remove the record, then delete its blob ONLY if nothing else references it: filing never copies the blob, so a
    // filed receipt's purchases (or another inbox record) may still hold the same pathname.
    const records = purchasesFromHash(await redis.hgetall(key));
    const record = records.find((r) => r && r.id === id);
    await redis.hdel(key, id);
    const pathname = record && record.receipt && record.receipt.pathname;
    if (pathname) {
      try {
        const purchases = purchasesFromHash(await redis.hgetall(scopedKey('purchases', property)));
        if (!blobIsReferenced({ purchases, inbox: records, pathname, excludeInboxId: id })) await del(pathname);
      } catch (e) { /* best-effort cleanup; an orphaned blob is harmless */ }
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
