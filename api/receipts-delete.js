import { Redis } from '@upstash/redis';
import { del } from '@vercel/blob';
import { scopedKey, parseReceiptPathname, purchasesFromHash, isReceiptReferenced } from './_scope.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// Delete a single receipt blob (used when a receipt is removed from a purchase, so no
// orphaned files are left behind). Auth is enforced upstream by middleware.js; we only
// accept well-formed receipt pathnames inside the receipts/ namespace. Best-effort.
//
// Several purchases (the lines of one order) can share a receipt, so the blob is only deleted
// when no OTHER purchase still references it. The optional body `purchaseId` is the purchase
// the receipt is being removed from — it is excluded from the check, because its own record
// may still list the path while the removal's save is in flight. If we cannot read Redis we
// fail safe and do NOT delete (an orphaned blob is harmless; a deleted shared receipt is not).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { pathname, purchaseId } = req.body || {};
  const parsed = parseReceiptPathname(pathname);
  if (!parsed) {
    return res.status(400).json({ error: 'Bad pathname' });
  }

  try {
    const purchases = purchasesFromHash(await redis.hgetall(scopedKey('purchases', parsed.propertyId)));
    if (isReceiptReferenced(purchases, pathname, typeof purchaseId === 'string' ? purchaseId : undefined)) {
      return res.status(200).json({ ok: true, kept: true });
    }
    await del(pathname);
  } catch (e) {
    // best-effort — a missing/failed blob delete (or an unreadable store) shouldn't block the UI
  }
  return res.status(200).json({ ok: true });
}
