import { Redis } from '@upstash/redis';
import { scopedKey } from './_scope.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// No ?property= → legacy global key ('tasks'), so pre-migration / dismissed-migration
// clients keep working exactly as before.
export default async function handler(req, res) {
  const key = scopedKey('tasks', req.query.property);
  if (key === null) {
    return res.status(400).json({ error: 'Invalid property id' });
  }

  if (req.method === 'GET') {
    const tasks = await redis.get(key);
    return res.status(200).json(tasks ?? null);
  }

  if (req.method === 'PUT') {
    const tasks = req.body;
    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: 'Expected array' });
    }
    await redis.set(key, JSON.stringify(tasks));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
