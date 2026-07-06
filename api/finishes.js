import { Redis } from '@upstash/redis';
import { scopedKey } from './_scope.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// No ?property= → legacy global key ('finishes'), so pre-migration / dismissed-migration
// clients keep working exactly as before.
export default async function handler(req, res) {
  const key = scopedKey('finishes', req.query.property);
  if (key === null) {
    return res.status(400).json({ error: 'Invalid property id' });
  }

  if (req.method === 'GET') {
    const data = await redis.get(key);
    return res.status(200).json(data ?? null);
  }

  if (req.method === 'PUT') {
    const data = req.body;
    if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
      return res.status(400).json({ error: 'Expected { items: [...], targetBudget: number|null }' });
    }
    await redis.set(key, JSON.stringify(data));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
