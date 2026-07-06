/**
 * Phase 1 logic check — no DB, no network. Exercises the REAL shared persistence
 * algorithm (api/_scope.js) against an in-memory mock Redis that emulates Upstash's
 * auto-deserialize + NX semantics. Run: node scripts/verify-phase1-logic.mjs
 */
import assert from 'node:assert/strict';
import { scopedKey, migrateData, DEFAULT_PROPERTY } from '../api/_scope.js';

let passed = 0;
function ok(name) { passed += 1; console.log(`  ✓ ${name}`); }

// Mock Redis: stores strings (as Upstash does after a JSON.stringify write); get()
// auto-parses JSON (as Upstash does); set supports { nx }. `throwOnSetKey` lets us
// simulate an interruption mid-migration.
function makeRedis(seed = {}, opts = {}) {
  const store = new Map();
  for (const [k, v] of Object.entries(seed)) store.set(k, JSON.stringify(v));
  let armed = opts.throwOnSetKey || null;
  return {
    store,
    async get(key) {
      if (!store.has(key)) return null;
      const raw = store.get(key);
      if (typeof raw !== 'string') return raw;
      try { return JSON.parse(raw); } catch (e) { return raw; }
    },
    async set(key, val, o) {
      if (armed && key === armed) { armed = null; throw new Error('simulated interruption'); }
      if (o && o.nx) {
        if (store.has(key)) return null;
        store.set(key, val);
        return 'OK';
      }
      store.set(key, val);
      return 'OK';
    },
    async del(key) { return store.delete(key) ? 1 : 0; },
  };
}

const LEGACY_TASKS = [{ id: 't1', task: 'x', done: false }];
const LEGACY_FINISHES = { items: [{ id: 'f1' }, { id: 'f2' }], targetBudget: 5000, roomData: { kitchen: {} }, deletedIds: ['f9'] };

console.log('scopedKey():');
assert.equal(scopedKey('tasks', undefined), 'tasks');            // no property → legacy
assert.equal(scopedKey('tasks', null), 'tasks');
assert.equal(scopedKey('tasks', ''), 'tasks');
ok('absent/empty property → legacy global key (the #4a fallback)');
assert.equal(scopedKey('tasks', 'pp'), 'tasks:pp');
assert.equal(scopedKey('finishes', 'pp'), 'finishes:pp');
ok('valid property → scoped key');
assert.equal(scopedKey('tasks', 'bad key!'), null);              // injection rejected
assert.equal(scopedKey('tasks', '../evil'), null);
assert.equal(scopedKey('tasks', 'UPPER'), null);
ok('invalid property id → null (rejected, caller 400s)');

console.log('migrateData() — fresh migration:');
{
  const redis = makeRedis({ tasks: LEGACY_TASKS, finishes: LEGACY_FINISHES });
  const res = await migrateData(redis);
  assert.equal(res.status, 'migrated');
  assert.deepEqual(await redis.get('tasks:pp'), LEGACY_TASKS);
  ok('tasks copied verbatim to tasks:pp');
  assert.deepEqual(await redis.get('finishes:pp'), LEGACY_FINISHES);
  ok('finishes copied verbatim to finishes:pp');
  assert.deepEqual((await redis.get('finishes:pp')).deletedIds, ['f9']);
  ok('deletedIds carried over → nothing deleted reappears');
  const reg = await redis.get('properties');
  assert.equal(reg.schemaVersion, 'v2');
  assert.equal(reg.activeId, 'pp');
  assert.deepEqual(reg.properties, [DEFAULT_PROPERTY]);
  ok('registry stamped with schemaVersion + activeId');
  assert.deepEqual(await redis.get('tasks'), LEGACY_TASKS);
  assert.deepEqual(await redis.get('finishes'), LEGACY_FINISHES);
  ok('legacy tasks/finishes untouched (they are the backup)');
  assert.equal(redis.store.has('migration:lock'), false);
  ok('migration lock released');
}

console.log('migrateData() — idempotency:');
{
  const redis = makeRedis({ tasks: LEGACY_TASKS, finishes: LEGACY_FINISHES });
  await migrateData(redis);
  const before = new Map(redis.store);
  const res2 = await migrateData(redis);
  assert.equal(res2.status, 'already');
  assert.equal(res2.properties.schemaVersion, 'v2');
  assert.deepEqual([...redis.store.keys()].sort(), [...before.keys()].sort());
  ok('second run is a no-op → "already", no duplication');
}

console.log('migrateData() — concurrent lock:');
{
  const redis = makeRedis({ tasks: LEGACY_TASKS, finishes: LEGACY_FINISHES });
  await redis.set('migration:lock', 'held', { nx: true, ex: 60 }); // another tab holds it
  const res = await migrateData(redis);
  assert.equal(res.status, 'locked');
  assert.equal(redis.store.has('tasks:pp'), false);
  assert.equal(redis.store.has('properties'), false);
  ok('lock held → "locked", no partial writes');
}

console.log('migrateData() — fresh install (no legacy data):');
{
  const redis = makeRedis({});
  const res = await migrateData(redis);
  assert.equal(res.status, 'migrated');
  assert.equal(redis.store.has('tasks:pp'), false);   // nothing to copy
  assert.equal(redis.store.has('finishes:pp'), false);
  assert.equal((await redis.get('properties')).schemaVersion, 'v2');
  ok('no legacy data → registry still stamped, no empty per-property keys');
}

console.log('migrateData() — interrupted then retried (write-then-stamp recovery):');
{
  const redis = makeRedis({ tasks: LEGACY_TASKS, finishes: LEGACY_FINISHES }, { throwOnSetKey: 'properties' });
  await assert.rejects(() => migrateData(redis), /simulated interruption/);
  assert.equal(redis.store.has('properties'), false);   // NOT stamped
  ok('interruption before stamp → no schemaVersion written');
  assert.equal(redis.store.has('migration:lock'), false);
  ok('lock released even on failure (finally)');
  const retry = await migrateData(redis);               // same store, retry
  assert.equal(retry.status, 'migrated');
  assert.deepEqual(await redis.get('tasks:pp'), LEGACY_TASKS);
  assert.equal((await redis.get('properties')).schemaVersion, 'v2');
  ok('retry recovers cleanly → idempotent, correct final state');
}

console.log(`\nAll ${passed} checks passed.`);
