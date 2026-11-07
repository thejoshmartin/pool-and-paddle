// The testable core of POST /api/receipt-extract (not a route — `_`-prefixed). All side effects come in as arguments, so
// `npm test` exercises the no-key / bad-blob / API-failure / retry paths with fakes and never touches the network.
import { extractReceipt } from './_extract.js';
import { redactCardNumbers } from '../src/lib/receipt-logic.js';

// Returns { status, body }. Extraction problems are NOT HTTP errors: they are saved on the record as
// `status: "needs-manual"` with a readable `error` and returned with status 200 ({ ok:false, record }), so the receipt
// stays safe in the inbox and Retry is just another call. Only a missing record (404) or an already filed/dismissed one (409)
// is an error response.
export async function processInboxRecord({ redis, key, inboxId, readBlob, createClient, apiKey, user, now, propertyId, defaultAddress }) {
  const raw = await redis.hget(key, inboxId);
  if (!raw) return { status: 404, body: { error: 'Inbox record not found' } };
  const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (record.status === 'filed' || record.status === 'dismissed') {
    return { status: 409, body: { error: `This receipt is already ${record.status}` } };
  }

  const save = async (patch) => {
    const next = { ...record, ...patch, updatedAt: now, updatedBy: user || null };
    await redis.hset(key, { [inboxId]: JSON.stringify(next) });
    return next;
  };
  const manual = async (error) => {
    const next = await save({ status: 'needs-manual', extraction: null, error: redactCardNumbers(error).slice(0, 400) });
    return { status: 200, body: { ok: false, record: next } };
  };

  try {
    if (!apiKey) {
      return await manual('ANTHROPIC_API_KEY is not set on the server. Add it in Vercel (server-side — not a VITE_ variable) and press Retry; you can also enter this purchase by hand.');
    }
    const receipt = record.receipt;
    if (!receipt || !receipt.pathname) return await manual('This inbox record has no uploaded file.');

    const base64 = await readBlob(receipt.pathname);
    if (!base64) return await manual('Could not read the uploaded file from storage. Try uploading it again.');

    let propertyAddress = defaultAddress;
    try {
      const registry = await redis.get('properties');
      const p = registry && Array.isArray(registry.properties) && registry.properties.find(x => x.id === propertyId);
      if (p && p.address) propertyAddress = p.address;
    } catch (e) { /* fall back to the default address */ }

    const client = createClient(apiKey);   // built only once we know there is a key and a file
    const result = await extractReceipt({ client, mediaType: String(receipt.contentType || '').toLowerCase(), base64, propertyAddress, now });
    if (!result.ok) return await manual(result.error);
    const next = await save({ status: 'extracted', extraction: result.extraction, error: null });
    return { status: 200, body: { ok: true, record: next } };
  } catch (e) {
    return await manual(`Extraction failed: ${String((e && e.message) || e)}`);
  }
}
