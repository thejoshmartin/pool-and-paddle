import { Redis } from '@upstash/redis';
import { migrateData } from './_scope.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// One-time migration of the legacy global keys into per-property keys. The algorithm
// (idempotent, NX-locked, write-then-stamp, legacy-never-touched) lives in _scope.js so
// it can be unit-tested with a mock Redis. See scripts/verify-phase1-logic.mjs.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const result = await migrateData(redis);
  const code = result.status === 'locked' ? 409 : 200;
  return res.status(code).json(result);
}
