// Shared, pure persistence logic for the multi-property model (Phase 1).
// The leading underscore keeps Vercel from treating this file as an API route.
// Kept dependency-free (no Redis instantiation) so it is unit-testable with a mock.

// The one default property. Existing global data becomes "Pool & Paddle."
export const DEFAULT_PROPERTY = {
  id: 'pp',
  name: 'Pool & Paddle',
  address: '6401 Broward St, St. Augustine, FL 32080',
  inServiceDate: null,
};

// Resolve the Redis key for a request. No property → legacy global key (so pre-migration
// or dismissed-migration clients keep working). Property ids are restricted to [a-z0-9-]
// to prevent key injection; an invalid id returns null (caller should 400).
export function scopedKey(base, property) {
  if (property === undefined || property === null || property === '') return base;
  if (!/^[a-z0-9-]+$/.test(property)) return null;
  return `${base}:${property}`;
}

// Receipt blob pathnames are `receipts/<propertyId>/<purchaseId>/<file>`. Parse + validate
// (rejects traversal, wrong prefix, and extra path levels). Returns { propertyId, purchaseId }
// or null. Callers must ALSO confirm the pathname is referenced by a real purchase before
// serving — this only validates shape.
export function parseReceiptPathname(pathname) {
  if (typeof pathname !== 'string') return null;
  const m = pathname.match(/^receipts\/([a-z0-9-]+)\/([a-z0-9-]+)\/[^/]+$/);
  if (!m) return null;
  return { propertyId: m[1], purchaseId: m[2] };
}

// One-time migration of legacy globals → per-property keys. Runs server-side against a
// redis-like client ({ get, set(key,val,{nx,ex}), del }). Safety properties:
//   - Idempotent: re-reads untouched legacy keys and overwrites, so a retry is a no-op.
//   - Lock-guarded (NX): only one caller migrates; others get { status: 'locked' }.
//   - Write-then-stamp: the registry (with schemaVersion) is written LAST, so an
//     interrupted run leaves no stamp and simply retries next time.
//   - Legacy keys are never written or deleted — they remain the backup.
//   - The entire finishes object (including deletedIds) copies verbatim, so nothing
//     already-deleted reappears.
// One-time migration of a legacy finishes BLOB (`finishes:<id>`) → the per-record
// HASH (`finish-records:<id>`). Mirrors migrateData's safety model:
//   - Idempotent: a `__migrated` stamp short-circuits re-runs.
//   - Lock-guarded (NX): only one caller migrates; a loser returns { status:'locked' }.
//   - Write-then-stamp: fields written first, `__migrated` last, so an interrupted
//     run leaves no stamp and simply retries.
//   - The legacy blob is never written or deleted — it stays as the frozen backup.
// `toFields` is injected (the pure blobToFields from src/lib/design-logic.js) so this
// module stays dependency-free and unit-testable with a mock redis.
export async function migrateFinishesToHash(redis, { key, legacyKey, toFields }) {
  const stamped = await redis.hget(key, '__migrated');
  if (stamped) return { status: 'already' };

  const legacy = await redis.get(legacyKey);
  if (!legacy || !Array.isArray(legacy.items)) return { status: 'empty' };

  const lockKey = `finishes-hash-migration:lock:${key}`;
  const lock = await redis.set(lockKey, String(Date.now()), { nx: true, ex: 60 });
  if (lock !== 'OK') return { status: 'locked' };

  try {
    // Re-check under the lock. Abort if the hash already has ANY content field — not just
    // the __migrated stamp. The content batch below is a single (atomic) HSET, so the
    // presence of any item:/furn:/room:/budget field means a prior run already wrote the
    // full content. Re-running toFields(legacy) here would clobber edits the user made
    // between an interrupted run (fields written, stamp not yet) and this retry.
    const current = await redis.hgetall(key);
    if (current && Object.keys(current).some((f) => f !== '__migrated')) {
      if (!current.__migrated) await redis.hset(key, { __migrated: '1' }); // finish the stamp
      return { status: 'already' };
    }

    const fields = toFields(legacy);
    const toWrite = {};
    for (const [f, v] of Object.entries(fields)) toWrite[f] = JSON.stringify(v);
    if (Object.keys(toWrite).length > 0) await redis.hset(key, toWrite);
    await redis.hset(key, { __migrated: '1' });
    return { status: 'migrated' };
  } finally {
    await redis.del(lockKey);
  }
}

export async function migrateData(redis) {
  const existing = await redis.get('properties');
  if (existing && existing.schemaVersion) {
    return { status: 'already', properties: existing };
  }

  const lock = await redis.set('migration:lock', String(Date.now()), { nx: true, ex: 60 });
  if (lock !== 'OK') {
    return { status: 'locked' };
  }

  try {
    const registryNow = await redis.get('properties');
    if (registryNow && registryNow.schemaVersion) {
      return { status: 'already', properties: registryNow };
    }

    const pid = DEFAULT_PROPERTY.id;
    const legacyTasks = await redis.get('tasks');
    const legacyFinishes = await redis.get('finishes');

    if (legacyTasks != null) {
      await redis.set(`tasks:${pid}`, JSON.stringify(legacyTasks));
    }
    if (legacyFinishes != null) {
      await redis.set(`finishes:${pid}`, JSON.stringify(legacyFinishes));
    }

    const registry = {
      schemaVersion: 'v2',
      activeId: pid,
      properties: [DEFAULT_PROPERTY],
    };
    await redis.set('properties', JSON.stringify(registry));

    return { status: 'migrated', properties: registry };
  } finally {
    await redis.del('migration:lock');
  }
}
