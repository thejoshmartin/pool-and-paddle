import { Redis } from '@upstash/redis';
import { del } from '@vercel/blob';
import { scopedKey, purchasesFromHash, blobIsReferenced } from './_scope.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// Purchases are stored as a Redis HASH per property (field = purchaseId, value = JSON).
// Every mutation is a TARGETED single-record op — never a whole-array write — so
// concurrent adds/edits/deletes from two devices can never drop each other's changes.
//   GET    → HGETALL           (returns an array; client sorts)
//   PUT    → HSET one field    (upsert a single purchase — add or edit)
//   DELETE → HDEL one field    (+ del() the record's receipt blobs so none are orphaned)
export default async function handler(req, res) {
  const key = scopedKey('purchases', req.query.property);
  if (key === null) {
    return res.status(400).json({ error: 'Invalid property id' });
  }

  if (req.method === 'GET') {
    const list = purchasesFromHash(await redis.hgetall(key)); // tolerant of one corrupt record
    return res.status(200).json(list);
  }

  if (req.method === 'PUT') {
    const purchase = req.body;
    if (!purchase || typeof purchase !== 'object' || typeof purchase.id !== 'string') {
      return res.status(400).json({ error: 'Expected a purchase object with a string id' });
    }
    await redis.hset(key, { [purchase.id]: JSON.stringify(purchase) });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Expected id' });
    }
    // Clean up receipt blobs so deleting a purchase never leaves orphaned files — but never
    // delete a blob another purchase (a sibling line of the same order) still references.
    const all = purchasesFromHash(await redis.hgetall(key));
    // A receipt filed from the Receipt Inbox is ALSO referenced by its inbox record — keep the blob while either holds it.
    const inbox = purchasesFromHash(await redis.hgetall(scopedKey('receipt-inbox', req.query.property)));
    const purchase = all.find((p) => p && p.id === id);
    const receipts = purchase && Array.isArray(purchase.receipts) ? purchase.receipts : [];
    for (const r of receipts) {
      if (r && r.pathname && !blobIsReferenced({ purchases: all, inbox, pathname: r.pathname, excludePurchaseId: id })) {
        try { await del(r.pathname); } catch (e) { /* best-effort cleanup */ }
      }
    }
    await redis.hdel(key, id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
