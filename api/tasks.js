import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const tasks = await redis.get('tasks');
    return res.status(200).json(tasks ?? null);
  }

  if (req.method === 'PUT') {
    const tasks = req.body;
    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: 'Expected array' });
    }
    await redis.set('tasks', JSON.stringify(tasks));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
