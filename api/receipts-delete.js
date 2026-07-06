import { del } from '@vercel/blob';
import { parseReceiptPathname } from './_scope.js';

// Delete a single receipt blob (used when a receipt is removed from a purchase, so no
// orphaned files are left behind). Auth is enforced upstream by middleware.js; we only
// accept well-formed receipt pathnames inside the receipts/ namespace. Best-effort.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { pathname } = req.body || {};
  if (!parseReceiptPathname(pathname)) {
    return res.status(400).json({ error: 'Bad pathname' });
  }

  try {
    await del(pathname);
  } catch (e) {
    // best-effort — a missing/failed blob delete shouldn't block the UI
  }
  return res.status(200).json({ ok: true });
}
