import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

export default async function handler(req, res) {
  await redis.ping();
  return res.status(200).json({ ok: true });
}
