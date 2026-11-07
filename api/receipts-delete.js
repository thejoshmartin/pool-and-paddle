import { Redis } from '@upstash/redis';
import { del } from '@vercel/blob';
import { scopedKey, parseReceiptPathname, purchasesFromHash, blobIsReferenced } from './_scope.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// Delete a single receipt blob (used when a receipt is removed from a purchase, so no
// orphaned files are left behind). Auth is enforced upstream by middleware.js; we only
// accept well-formed receipt pathnames inside the receipts/ namespace. Best-effort.
//
// A receipt blob can be shared by several purchases (the lines of one order) AND by its Receipt Inbox record (filing never
// copies the blob), so it is only deleted when no OTHER purchase and no OTHER inbox record still references it. The optional
// body `purchaseId` / `inboxId` is the one being edited/removed — excluded from the check, because its own record may still
// list the path while the removal's save is in flight. If we cannot read Redis we fail safe and do NOT delete (an orphaned
// blob is harmless; a deleted shared receipt is not).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { pathname, purchaseId, inboxId } = req.body || {};
  const parsed = parseReceiptPathname(pathname);
  if (!parsed) {
    return res.status(400).json({ error: 'Bad pathname' });
  }

  try {
    const purchases = purchasesFromHash(await redis.hgetall(scopedKey('purchases', parsed.propertyId)));
    const inbox = purchasesFromHash(await redis.hgetall(scopedKey('receipt-inbox', parsed.propertyId)));
    if (blobIsReferenced({
      purchases, inbox, pathname,
      excludePurchaseId: typeof purchaseId === 'string' ? purchaseId : undefined,
      excludeInboxId: typeof inboxId === 'string' ? inboxId : undefined,
    })) {
      return res.status(200).json({ ok: true, kept: true });
    }
    await del(pathname);
  } catch (e) {
    // best-effort — a missing/failed blob delete (or an unreadable store) shouldn't block the UI
  }
  return res.status(200).json({ ok: true });
}
