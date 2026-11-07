import { Redis } from '@upstash/redis';
import { get } from '@vercel/blob';
import Anthropic from '@anthropic-ai/sdk';
import { scopedKey, DEFAULT_PROPERTY } from './_scope.js';
import { processInboxRecord } from './_extract-record.js';

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

// POST { property, inboxId } — read one uploaded receipt from the PRIVATE Blob store, have Claude extract its line items,
// validate, and store the result on the inbox record. ANTHROPIC_API_KEY is server-side env only (never a VITE_ name).
// All the logic lives in api/_extract-record.js (unit-tested with fakes); extraction problems are saved as `needs-manual`
// with a readable error, never a 500.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { property, inboxId } = req.body || {};
  if (typeof property !== 'string' || !/^[a-z0-9-]+$/.test(property) || typeof inboxId !== 'string' || !/^ri-[a-z0-9-]+$/.test(inboxId)) {
    return res.status(400).json({ error: 'Invalid property or inbox id' });
  }

  try {
    const { status, body } = await processInboxRecord({
      redis,
      key: scopedKey('receipt-inbox', property),
      inboxId,
      readBlob: async (pathname) => {
        const blob = await get(pathname, { access: 'private' });
        if (!blob || blob.statusCode !== 200) return null;
        return Buffer.from(await new Response(blob.stream).arrayBuffer()).toString('base64');
      },
      // 120 s per attempt and one retry: a hang turns into "needs-manual" instead of a stuck spinner.
      createClient: (apiKey) => new Anthropic({ apiKey, timeout: 120000, maxRetries: 1 }),
      apiKey: process.env.ANTHROPIC_API_KEY,
      user: currentUser(req),
      now: new Date().toISOString(),
      propertyId: property,
      defaultAddress: DEFAULT_PROPERTY.address,
    });
    return res.status(status).json(body);
  } catch (e) {
    return res.status(500).json({ error: 'Could not save the extraction result' });
  }
}
