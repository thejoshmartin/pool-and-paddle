import { Redis } from '@upstash/redis';
import { scopedKey, migrateFinishesToHash } from './_scope.js';
import { blobToFields, MIGRATED_FIELD } from '../src/lib/design-logic.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// Finishes are stored as a Redis HASH per property (`finish-records:<id>`), one field
// per editable unit (item:/furn:/room:/budget + deletion tombstones). Every mutation is a
// TARGETED single-field op — never a whole-array write — so concurrent edits from two
// devices can't drop each other's changes.
//   GET    → run one-time blob→hash migration, then HGETALL (raw field map)
//   PUT    → HSET one field   ({ field, value })
//   DELETE → HDEL one field   (?field=)
// Only these field shapes are accepted (defense-in-depth against key injection).
// item/furniture id segments allow [A-Za-z0-9-] (permissive so no valid id is ever
// rejected — today's ids are lowercase, but the class won't reject a future mixed-case id);
// room-id segments are [a-z0-9-] to match the real kebab room ids (incl. digit-first like
// `3rd-floor-bath`). None of these ids contain a colon, so the field parses unambiguously.
const FIELD_RE = /^(item:[A-Za-z0-9-]+|furn:[a-z0-9-]+:[A-Za-z0-9-]+|room:[a-z0-9-]+|budget)$/;

export default async function handler(req, res) {
  const key = scopedKey('finish-records', req.query.property);
  const legacyKey = scopedKey('finishes', req.query.property);
  if (key === null || legacyKey === null) {
    return res.status(400).json({ error: 'Invalid property id' });
  }

  if (req.method === 'GET') {
    try {
      await migrateFinishesToHash(redis, { key, legacyKey, toFields: blobToFields });
    } catch (e) { /* migration is best-effort; a partial/failed run retries next GET */ }
    const map = await redis.hgetall(key); // { field: objectOrString } | null
    if (map) delete map[MIGRATED_FIELD];
    return res.status(200).json(map || {});
  }

  if (req.method === 'PUT') {
    const { field, value } = req.body || {};
    if (typeof field !== 'string' || !FIELD_RE.test(field)) {
      return res.status(400).json({ error: 'Expected a valid { field, value }' });
    }
    await redis.hset(key, { [field]: JSON.stringify(value) });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const field = req.query.field;
    if (typeof field !== 'string' || !FIELD_RE.test(field)) {
      return res.status(400).json({ error: 'Expected a valid field' });
    }
    await redis.hdel(key, field);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
