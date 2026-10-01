import { Redis } from '@upstash/redis';
import { scopedKey } from './_scope.js';
import { sanitizeHouseInfoItem } from '../src/lib/house-info-logic.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// pp_session is HttpOnly but NOT secret-free: its value is `USERNAME:hash`, and
// middleware.js has already verified it before this handler runs. Vercel's Node.js
// serverless runtime parses req.cookies automatically for the plain (req, res) handler
// signature used throughout this repo's api/*.js files (same mechanism that already
// populates req.query/req.body here — no manual Cookie-header parsing needed).
function currentUser(req) {
  const session = req.cookies && req.cookies.pp_session;
  if (!session) return null;
  const sep = session.indexOf(':');
  return sep === -1 ? null : session.slice(0, sep);
}

// House info is a Redis HASH per property (field = itemId, value = JSON) — same targeted-
// write discipline as purchases.js: GET = HGETALL, PUT = HSET one field, DELETE = HDEL one
// field, never a whole-array write. Unlike purchases.js, ?property= is REQUIRED (400s
// without it) — there is no legacy house-info data to fall back to a bare key for, and a
// bare-key fallback would be invisible to api/backup.js, which only enumerates
// `house-info:<id>` per registered property id. Every PUT is whitelisted/validated via
// sanitizeHouseInfoItem (not stored near-verbatim like purchases.js) because this record
// holds credentials and is meant to double as a future agent's data source.
export default async function handler(req, res) {
  const property = req.query.property;
  if (!property || typeof property !== 'string') {
    return res.status(400).json({ error: 'Missing property' });
  }
  const key = scopedKey('house-info', property);
  if (key === null) {
    return res.status(400).json({ error: 'Invalid property id' });
  }

  if (req.method === 'GET') {
    const map = await redis.hgetall(key);
    const list = map
      ? Object.values(map).map((v) => (typeof v === 'string' ? JSON.parse(v) : v))
      : [];
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(list);
  }

  if (req.method === 'PUT') {
    const result = sanitizeHouseInfoItem(req.body, {
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser(req),
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    await redis.hset(key, { [result.item.id]: JSON.stringify(result.item) });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, item: result.item });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Expected id' });
    }
    await redis.hdel(key, id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
