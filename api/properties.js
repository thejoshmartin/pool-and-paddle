import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// The property registry:
//   { schemaVersion, activeId, properties: [{ id, name, address, inServiceDate }] }
// GET returns it (or null when the app has not been migrated yet).
// PUT overwrites it (used to edit property metadata, e.g. inServiceDate).
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const registry = await redis.get('properties');
    return res.status(200).json(registry ?? null);
  }

  if (req.method === 'PUT') {
    const registry = req.body;
    if (!registry || typeof registry !== 'object' || !Array.isArray(registry.properties)) {
      return res.status(400).json({ error: 'Expected { properties: [...] }' });
    }
    const props = registry.properties;
    if (!props.every((p) => p && typeof p.id === 'string' && p.id)) {
      return res.status(400).json({ error: 'Each property needs a non-empty string id' });
    }
    const ids = props.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: 'Duplicate property ids' });
    }
    await redis.set('properties', JSON.stringify(registry));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
