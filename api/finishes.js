import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const data = await redis.get('finishes');
    return res.status(200).json(data ?? null);
  }

  if (req.method === 'PUT') {
    const data = req.body;
    if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
      return res.status(400).json({ error: 'Expected { items: [...], targetBudget: number|null }' });
    }
    await redis.set('finishes', JSON.stringify(data));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
