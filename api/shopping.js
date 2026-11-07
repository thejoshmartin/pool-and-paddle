import { Redis } from '@upstash/redis';
import { scopedKey } from './_scope.js';
import { sanitizeShoppingField, isShoppingField } from '../src/lib/shopping-logic.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// pp_session is HttpOnly but carries `USERNAME:hash`; middleware.js has already verified it before
// this handler runs. Vercel parses req.cookies for the plain (req, res) signature used by every
// api/*.js file here (same mechanism as api/house-info.js).
function currentUser(req) {
  const session = req.cookies && req.cookies.pp_session;
  if (!session) return null;
  const sep = session.indexOf(':');
  return sep === -1 ? null : session.slice(0, sep);
}

// The Shopping list is a Redis HASH per property (`shopping:<id>`): fields `item:<id>`, `settings`,
// and `item:<id>` tombstones. Every mutation is a TARGETED single-field op — never a whole-hash
// write — so two devices can't drop each other's edits.
//   GET    → HGETALL           (raw field map; the client merges it with the bundled seed list)
//   PUT    → HSET one field    ({ field, value }, validated/typed by sanitizeShoppingField; the
//                               server stamps updatedAt/updatedBy)
//   DELETE → HDEL one field    (?field=)
// ?property= is REQUIRED (400 without): there is no legacy shopping data to fall back to, and a
// bare-key fallback would be invisible to api/backup.js (it only enumerates `shopping:<id>` per
// registered property).
export default async function handler(req, res) {
  const property = req.query.property;
  if (!property || typeof property !== 'string') {
    return res.status(400).json({ error: 'Missing property' });
  }
  const key = scopedKey('shopping', property);
  if (key === null) {
    return res.status(400).json({ error: 'Invalid property id' });
  }

  if (req.method === 'GET') {
    const map = await redis.hgetall(key);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(map || {});
  }

  if (req.method === 'PUT') {
    const { field, value } = req.body || {};
    const result = sanitizeShoppingField(field, value, {
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser(req),
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    await redis.hset(key, { [field]: JSON.stringify(result.value) });
    return res.status(200).json({ ok: true, value: result.value });
  }

  if (req.method === 'DELETE') {
    const field = req.query.field;
    if (!isShoppingField(field)) {
      return res.status(400).json({ error: 'Expected a valid field' });
    }
    await redis.hdel(key, field);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
