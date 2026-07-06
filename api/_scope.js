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
