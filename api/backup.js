import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// Full-data backup: reads every relevant key and returns one JSON document.
// Covers the legacy globals AND every per-property key, so it is a complete snapshot
// of current state at any time (this is the real forward disaster-recovery path — a
// redeploy only reverts code, not data). Auth is enforced upstream by middleware.js.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const registry = await redis.get('properties');

  const legacy = {
    tasks: await redis.get('tasks'),
    finishes: await redis.get('finishes'),
  };

  const perProperty = {};
  const ids = registry && Array.isArray(registry.properties)
    ? registry.properties.map((p) => p.id)
    : [];
  for (const id of ids) {
    perProperty[id] = {
      tasks: await redis.get(`tasks:${id}`),
      finishes: await redis.get(`finishes:${id}`),
      // finishes are ALSO stored as a per-record hash (field per item/furn/room/budget).
      finishRecords: await redis.hgetall(`finish-records:${id}`),
      // purchases are a Redis hash (field = purchaseId); hgetall returns the full record set.
      purchases: await redis.hgetall(`purchases:${id}`),
    };
  }

  const backup = {
    schema: 'pool-paddle-backup-v1',
    generatedAt: new Date().toISOString(),
    properties: registry ?? null,
    legacy,
    perProperty,
  };

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(backup);
}
