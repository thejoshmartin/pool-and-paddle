import { Redis } from '@upstash/redis';
import { del } from '@vercel/blob';
import { scopedKey } from './_scope.js';

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
    const map = await redis.hgetall(key); // { id: purchaseObj|jsonString } or null
    const list = map
      ? Object.values(map).map((v) => (typeof v === 'string' ? JSON.parse(v) : v))
      : [];
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
    // Clean up receipt blobs so deleting a purchase never leaves orphaned files.
    const raw = await redis.hget(key, id);
    if (raw) {
      const purchase = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const receipts = Array.isArray(purchase.receipts) ? purchase.receipts : [];
      for (const r of receipts) {
        if (r && r.pathname) {
          try { await del(r.pathname); } catch (e) { /* best-effort cleanup */ }
        }
      }
    }
    await redis.hdel(key, id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
