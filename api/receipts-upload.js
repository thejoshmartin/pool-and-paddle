import { put } from '@vercel/blob';

// Server-side receipt upload to the PRIVATE Blob store. The client sends the file as
// base64 JSON; we decode and put() it with the static BLOB_READ_WRITE_TOKEN (auto-read
// from env) so the token never leaves the server. Auth is enforced upstream by middleware.
//
// Vercel Functions have a 4.5 MB request-body limit; the client compresses images before
// upload, and we cap raw size at 2.5 MB (base64 stays well under the limit).
const MAX_BYTES = 2.5 * 1024 * 1024;
// The client converts every image (including iPhone HEIC/HEIF) to JPEG before upload, so
// only universally-viewable types are ever stored. We deliberately do NOT accept heic/heif
// here — an unconverted HEIC won't render in Android Chrome, so rejecting it (rather than
// storing an unviewable receipt) is the safer contract.
const ALLOWED_TYPE = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/i;
const SAFE_SEG = /^[a-z0-9-]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { propertyId, purchaseId, name, contentType, dataBase64 } = req.body || {};

  if (typeof propertyId !== 'string' || !SAFE_SEG.test(propertyId) ||
      typeof purchaseId !== 'string' || !SAFE_SEG.test(purchaseId)) {
    return res.status(400).json({ error: 'Invalid ids' });
  }
  if (typeof contentType !== 'string' || !ALLOWED_TYPE.test(contentType)) {
    return res.status(400).json({ error: 'Unsupported file type (images or PDF only)' });
  }
  if (typeof dataBase64 !== 'string' || !dataBase64) {
    return res.status(400).json({ error: 'Missing file data' });
  }

  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length === 0) return res.status(400).json({ error: 'Empty file' });
  if (buffer.length > MAX_BYTES) {
    return res.status(413).json({ error: 'File too large (max ~2.5 MB — please use a smaller or compressed file)' });
  }

  const extMatch = typeof name === 'string' ? name.match(/\.[a-z0-9]+$/i) : null;
  const ext = extMatch ? extMatch[0].toLowerCase() : '';
  const base = `receipt${ext}`.replace(/[^a-z0-9.\-_]/gi, '');
  const pathname = `receipts/${propertyId}/${purchaseId}/${base}`;

  const blob = await put(pathname, buffer, {
    access: 'private',
    contentType,
    addRandomSuffix: true, // unique pathname per upload; avoids overwrite collisions
  });

  return res.status(200).json({
    pathname: blob.pathname,
    name: typeof name === 'string' ? name : base,
    contentType,
  });
}
