# Finishes Per-Record Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Design-tab finishes from a whole-array debounced `PUT` to a per-record Redis hash so two people editing simultaneously never overwrite each other.

**Architecture:** A new Redis hash `finish-records:<propertyId>` holds every editable unit as an independently-writable, namespaced field (`item:<id>`, `furn:<roomId>:<furnId>`, `room:<roomId>`, `budget`; deletions are `item:<id>` tombstones). The client fires one targeted `HSET`/`HDEL` per edit instead of a whole-array write. A one-time, idempotent, server-side migration converts the existing frozen `finishes:<id>` blob into the hash on first read. Pure encode/decode helpers live in `src/lib/design-logic.js`; the migration helper lives in `api/_scope.js`. No UI or behavior change; live sync (seeing each other's edits without reload) is explicitly out of scope.

**Tech Stack:** React (single-file `src/App.jsx`), Vercel serverless functions (`api/*.js`), Upstash Redis (`@upstash/redis`), node test scripts (`scripts/verify-logic.mjs`, run via `npm test`).

**Spec:** `docs/superpowers/specs/2026-07-16-finishes-per-record-persistence-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/design-logic.js` | Pure field encode/decode: field-name builders, `partitionFinishFields` (hash→state), `blobToFields` (legacy blob→hash) | Modify (append) |
| `api/_scope.js` | `migrateFinishesToHash(redis, {key, legacyKey, toFields})` — idempotent, lock-guarded migration (mock-testable, mirrors `migrateData`) | Modify (append) |
| `api/finish-records.js` | New route: GET (run migration → `HGETALL`), PUT (`HSET` one field), DELETE (`HDEL` one field) | Create |
| `api/backup.js` | Add `finish-records:<id>` hash to the snapshot | Modify |
| `src/App.jsx` | Parent-owned per-record write helpers; new hash load path; remove whole-array save; thread write callbacks into `DesignView` and wire each mutation | Modify |
| `scripts/verify-logic.mjs` | Unit tests for the pure helpers + the migration helper | Modify (append) |
| `CLAUDE.md`, `docs/known-issues.md` | Document the new model + the closed race | Modify |

**Key constraint on colon parsing:** room ids (`kitchen-upstairs`, `3rd-floor-bath`), furniture ids (`furn<ts>`), and item ids (`t1`, `uf<ts>`) are all colon-free, so `prefix:...` fields parse unambiguously. `furn:<roomId>:<furnId>` is parsed by splitting the remainder on its **last** colon (robust even though neither part contains one today).

---

## Task 1: Pure field encode/decode helpers

**Files:**
- Modify: `src/lib/design-logic.js` (append below `buildRoomCopies`)
- Test: `scripts/verify-logic.mjs` (append)

- [ ] **Step 1: Write the failing tests**

Append to `scripts/verify-logic.mjs`, just before the final `console.log(\`\nAll ${passed} checks passed.\`);` line. Also extend the design-logic import at the top of the file to:

```js
import {
  matchesFinishSearch, buildRoomCopies, mergeFinishes, migrateRoom,
  finishItemField, furnitureField, roomField, tombstone,
  BUDGET_FIELD, MIGRATED_FIELD, partitionFinishFields, blobToFields,
} from '../src/lib/design-logic.js';
```

Test block to append:

```js
console.log('finish field helpers:');
{
  assert.equal(finishItemField('t42'), 'item:t42');
  assert.equal(furnitureField('kitchen-upstairs', 'furn9'), 'furn:kitchen-upstairs:furn9');
  assert.equal(roomField('bunk-room'), 'room:bunk-room');
  assert.equal(BUDGET_FIELD, 'budget');
  assert.deepEqual(tombstone('t42'), { id: 't42', __deleted: true });
  ok('field-name builders + tombstone');
}

console.log('blobToFields() → partitionFinishFields() round-trip:');
{
  const blob = {
    items: [
      { id: 't1', category: 'flooring', room: 'kitchen-upstairs', item: 'LVP', selection: 'Coretec', unitPrice: 5, quantity: 100, unit: 'sqft', userCreated: false },
      { id: 'uf7', category: 'plumbing', room: 'guest-bath', item: 'Custom faucet', userCreated: true, linkedTo: null, contractorOptions: ['A'] },
    ],
    deletedIds: ['t99'],
    roomData: {
      'kitchen-upstairs': { miroUrl: 'https://miro/x', furniture: [ { id: 'furn1', name: 'Stool', price: 40, purchased: false } ] },
      'guest-bath': { miroUrl: '', furniture: [] },
    },
    targetBudget: 446000,
  };

  const fields = blobToFields(blob);
  // Upstash hgetall returns already-parsed objects; simulate that (values are objects, not strings).
  assert.deepEqual(fields['item:t1'].item, 'LVP');
  assert.deepEqual(fields['item:t99'], { id: 't99', __deleted: true });
  assert.equal(fields['furn:kitchen-upstairs:furn1'].name, 'Stool');
  assert.deepEqual(fields['room:kitchen-upstairs'], { miroUrl: 'https://miro/x' });
  assert.equal(fields[BUDGET_FIELD], 446000);
  ok('blobToFields emits item/furn/room/budget + deletion tombstones');

  const parsed = partitionFinishFields(fields);
  assert.equal(parsed.savedItems.length, 2);                       // tombstone NOT a saved item
  assert.deepEqual(parsed.deletedIds, ['t99']);
  assert.equal(parsed.savedItems.find(i => i.id === 'uf7').userCreated, true);
  assert.equal(parsed.roomData['kitchen-upstairs'].miroUrl, 'https://miro/x');
  assert.equal(parsed.roomData['kitchen-upstairs'].furniture[0].name, 'Stool');
  assert.equal(parsed.targetBudget, 446000);
  ok('partitionFinishFields splits items/deletions/roomData/budget');

  // String values (Upstash may return raw strings) parse too.
  const asStrings = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]));
  const parsed2 = partitionFinishFields(asStrings);
  assert.equal(parsed2.savedItems.length, 2);
  assert.deepEqual(parsed2.deletedIds, ['t99']);
  ok('partitionFinishFields tolerates string-encoded field values');

  // Unknown/reserved fields ignored.
  const parsed3 = partitionFinishFields({ ...fields, [MIGRATED_FIELD]: '1', 'weird:thing': 'x' });
  assert.equal(parsed3.savedItems.length, 2);
  ok('partitionFinishFields ignores __migrated and unknown prefixes');

  // Empty map → empty everything.
  const empty = partitionFinishFields({});
  assert.deepEqual(empty.savedItems, []);
  assert.deepEqual(empty.deletedIds, []);
  assert.deepEqual(empty.roomData, {});
  assert.equal(empty.targetBudget, null);
  ok('empty hash → empty partition');

  // Null/undefined map → empty partition (never throws).
  assert.deepEqual(partitionFinishFields(null).savedItems, []);
  ok('null hash → empty partition');
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `finishItemField is not a function` (or an import error) from `verify-logic.mjs`.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/design-logic.js`:

```js
/* ── Per-record finish hash: field encoding/decoding ──────────────────────────
 * Finishes persist as a Redis HASH (`finish-records:<propertyId>`) with one
 * independently-writable field per editable unit, so concurrent edits to
 * different units never overwrite each other. Field layout:
 *   item:<itemId>              → a finish item's saved record
 *   item:<itemId> {__deleted}  → tombstone for a deleted DEFAULT item
 *   furn:<roomId>:<furnId>     → one furniture item
 *   room:<roomId>              → { miroUrl }
 *   budget                     → the targetBudget scalar
 *   __migrated                 → idempotency stamp (ignored on decode)
 * Room/furniture/item ids are colon-free, so `prefix:...` parses unambiguously.
 */
export const BUDGET_FIELD = 'budget';
export const MIGRATED_FIELD = '__migrated';

export function finishItemField(id) { return `item:${id}`; }
export function furnitureField(roomId, furnId) { return `furn:${roomId}:${furnId}`; }
export function roomField(roomId) { return `room:${roomId}`; }
export function tombstone(id) { return { id, __deleted: true }; }

// Legacy blob { items, roomData, targetBudget, deletedIds } → { field: value } map.
// Values are plain objects/scalars; the caller JSON-stringifies before HSET.
export function blobToFields(blob) {
  const fields = {};
  const b = blob || {};
  for (const item of Array.isArray(b.items) ? b.items : []) {
    if (item && item.id != null) fields[finishItemField(item.id)] = item;
  }
  for (const id of Array.isArray(b.deletedIds) ? b.deletedIds : []) {
    fields[finishItemField(id)] = tombstone(id);
  }
  const rooms = b.roomData && typeof b.roomData === 'object' ? b.roomData : {};
  for (const [roomId, rd] of Object.entries(rooms)) {
    const data = rd || {};
    fields[roomField(roomId)] = { miroUrl: data.miroUrl || '' };
    for (const furn of Array.isArray(data.furniture) ? data.furniture : []) {
      if (furn && furn.id != null) fields[furnitureField(roomId, furn.id)] = furn;
    }
  }
  if (b.targetBudget != null) fields[BUDGET_FIELD] = b.targetBudget;
  return fields;
}

// Raw HGETALL map ({ field: objectOrJsonString }) → the shapes App state uses.
export function partitionFinishFields(map) {
  const out = { savedItems: [], deletedIds: [], roomData: {}, targetBudget: null };
  if (!map || typeof map !== 'object') return out;
  const val = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  const ensureRoom = (roomId) => {
    if (!out.roomData[roomId]) out.roomData[roomId] = { miroUrl: '', furniture: [] };
    return out.roomData[roomId];
  };
  for (const [field, raw] of Object.entries(map)) {
    if (field === MIGRATED_FIELD) continue;
    if (field === BUDGET_FIELD) { out.targetBudget = val(raw); continue; }
    if (field.startsWith('item:')) {
      const rec = val(raw);
      if (rec && rec.__deleted) out.deletedIds.push(rec.id != null ? rec.id : field.slice(5));
      else if (rec) out.savedItems.push(rec);
      continue;
    }
    if (field.startsWith('room:')) {
      const roomId = field.slice(5);
      ensureRoom(roomId).miroUrl = (val(raw) || {}).miroUrl || '';
      continue;
    }
    if (field.startsWith('furn:')) {
      const rest = field.slice(5);
      const idx = rest.lastIndexOf(':');
      if (idx < 0) continue;
      const roomId = rest.slice(0, idx);
      ensureRoom(roomId).furniture.push(val(raw));
      continue;
    }
    // unknown prefix → ignore
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all new "finish field helpers" / "round-trip" / "partitionFinishFields" checks green, existing checks still pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design-logic.js scripts/verify-logic.mjs
git commit -m "feat(design): pure field encode/decode helpers for finishes hash

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Server-side migration helper (mock-testable)

**Files:**
- Modify: `api/_scope.js` (append)
- Test: `scripts/verify-logic.mjs` (append)

- [ ] **Step 1: Write the failing test**

Append to `scripts/verify-logic.mjs` (before the final summary line). Add `migrateFinishesToHash` to the existing `api/_scope.js` import:

```js
import { scopedKey, parseReceiptPathname, migrateFinishesToHash } from '../api/_scope.js';
```

Test block:

```js
console.log('migrateFinishesToHash():');
{
  // Minimal mock redis backing store.
  function mockRedis(initial = {}) {
    const store = { ...initial };     // string keys → value; hash keys → object
    return {
      store,
      async hget(key, field) { return (store[key] || {})[field] ?? null; },
      async hgetall(key) { return store[key] ? { ...store[key] } : null; },
      async get(key) { return store[key] ?? null; },
      async set(key, val, opts) {
        if (opts && opts.nx && key in store) return null;
        store[key] = val; return 'OK';
      },
      async hset(key, obj) { store[key] = { ...(store[key] || {}), ...obj }; return 1; },
      async del(key) { delete store[key]; return 1; },
    };
  }

  const blob = { items: [{ id: 't1', item: 'LVP' }], deletedIds: ['t9'], roomData: {}, targetBudget: 100 };
  const redis = mockRedis({ 'finishes:pp': blob });
  const toFields = blobToFields;

  const r1 = await migrateFinishesToHash(redis, { key: 'finish-records:pp', legacyKey: 'finishes:pp', toFields });
  assert.equal(r1.status, 'migrated');
  assert.equal(JSON.parse(redis.store['finish-records:pp']['item:t1']).item, 'LVP');
  assert.deepEqual(JSON.parse(redis.store['finish-records:pp']['item:t9']), { id: 't9', __deleted: true });
  assert.equal(redis.store['finish-records:pp']['__migrated'], '1');
  assert.equal('finishes:pp' in redis.store, true);          // blob NEVER deleted
  ok('migrates the blob into the hash, stamps __migrated, keeps the blob');

  const r2 = await migrateFinishesToHash(redis, { key: 'finish-records:pp', legacyKey: 'finishes:pp', toFields });
  assert.equal(r2.status, 'already');                          // idempotent
  ok('second run is a no-op (already stamped)');

  const fresh = mockRedis({});                                 // no legacy blob
  const r3 = await migrateFinishesToHash(fresh, { key: 'finish-records:new', legacyKey: 'finishes:new', toFields });
  assert.equal(r3.status, 'empty');
  assert.equal('finish-records:new' in fresh.store, false);
  ok('no legacy blob → nothing migrated');
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `migrateFinishesToHash is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `api/_scope.js`:

```js
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
    const again = await redis.hget(key, '__migrated');
    if (again) return { status: 'already' };

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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS — the three `migrateFinishesToHash` checks green.

- [ ] **Step 5: Commit**

```bash
git add api/_scope.js scripts/verify-logic.mjs
git commit -m "feat(api): idempotent blob→hash migration helper for finishes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: New `api/finish-records.js` route

**Files:**
- Create: `api/finish-records.js`

No node unit test (route handlers here — like `purchases.js`/`finishes.js` — are verified by build + manual deploy; the logic they call is already unit-tested in Tasks 1–2).

- [ ] **Step 1: Create the route**

Create `api/finish-records.js`:

```js
import { Redis } from '@upstash/redis';
import { scopedKey, migrateFinishesToHash } from './_scope.js';
import { blobToFields, MIGRATED_FIELD } from '../src/lib/design-logic.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// Finishes are stored as a Redis HASH per property (`finish-records:<id>`), one field
// per editable unit (item:/furn:/room:/budget + deletion tombstones). Every mutation is a
// TARGETED single-field op — never a whole-array write — so concurrent edits from two
// devices can't drop each other's changes.
//   GET    → run one-time blob→hash migration, then HGETALL (raw field map)
//   PUT    → HSET one field   ({ field, value })
//   DELETE → HDEL one field   (?field=)
// Only these field shapes are accepted (defense-in-depth against key injection):
const FIELD_RE = /^(item:[A-Za-z0-9-]+|furn:[a-z0-9-]+:[A-Za-z0-9-]+|room:[a-z0-9-]+|budget)$/;

export default async function handler(req, res) {
  const key = scopedKey('finish-records', req.query.property);
  const legacyKey = scopedKey('finishes', req.query.property);
  if (key === null || legacyKey === null) {
    return res.status(400).json({ error: 'Invalid property id' });
  }

  if (req.method === 'GET') {
    try {
      await migrateFinishesToHash(redis, { key, legacyKey, toFields: blobToFields });
    } catch (e) { /* migration is best-effort; a partial/failed run retries next GET */ }
    const map = await redis.hgetall(key); // { field: objectOrString } | null
    if (map) delete map[MIGRATED_FIELD];
    return res.status(200).json(map || {});
  }

  if (req.method === 'PUT') {
    const { field, value } = req.body || {};
    if (typeof field !== 'string' || !FIELD_RE.test(field)) {
      return res.status(400).json({ error: 'Expected a valid { field, value }' });
    }
    await redis.hset(key, { [field]: JSON.stringify(value) });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const field = req.query.field;
    if (typeof field !== 'string' || !FIELD_RE.test(field)) {
      return res.status(400).json({ error: 'Expected a valid field' });
    }
    await redis.hdel(key, field);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: `✓ built` with no error. (Confirms the `../src/lib/design-logic.js` import resolves. If Vercel later fails to bundle this cross-dir import at deploy time, fall back: copy `blobToFields`/`MIGRATED_FIELD` into `api/_scope.js` and import from there instead — the unit tests move with them.)

- [ ] **Step 3: Commit**

```bash
git add api/finish-records.js
git commit -m "feat(api): finish-records route (per-field HSET/HDEL + migration)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Include the new hash in backups

**Files:**
- Modify: `api/backup.js:26-33`

- [ ] **Step 1: Add the hash to the per-property snapshot**

In `api/backup.js`, change the `perProperty[id]` block:

```js
  for (const id of ids) {
    perProperty[id] = {
      tasks: await redis.get(`tasks:${id}`),
      finishes: await redis.get(`finishes:${id}`),
      // finishes are ALSO stored as a per-record hash (field per item/furn/room/budget).
      finishRecords: await redis.hgetall(`finish-records:${id}`),
      // purchases are a Redis hash (field = purchaseId); hgetall returns the full record set.
      purchases: await redis.hgetall(`purchases:${id}`),
    };
  }
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add api/backup.js
git commit -m "feat(api): include finish-records hash in full backup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Parent-owned per-record write helpers (App.jsx)

**Files:**
- Modify: `src/App.jsx` — add helpers next to the purchases write handlers (after `deletePurchase`, ~line 4116); extend the `design-logic` import (line 11).

These live in `App()` (the parent) because they need `apiUrl`, `activeProperty`, `finishesServerLoaded`, and `setSyncError`. Item writes are **debounced per field** (400 ms) via a ref-held timer map so typing a name is one `HSET`, not one per keystroke; a flush drains pending timers on teardown. Furniture/room/budget edits are discrete (blur / click / Enter), so they write immediately.

- [ ] **Step 1: Extend the design-logic import**

`src/App.jsx` line 11 becomes:

```js
import { matchesFinishSearch, buildRoomCopies, mergeFinishes, finishItemField, furnitureField, roomField, tombstone, BUDGET_FIELD, partitionFinishFields } from "./lib/design-logic.js";
```

- [ ] **Step 2: Add the write helpers**

In `App()`, immediately after the `deletePurchase`/`changePurchaseReceipts` block (~line 4120), add. The debounce keeps a parallel **pending-value** map (not just timer ids) so a hide/unload flush can deliver the last un-fired keystroke:

```js
  // ── Finishes — per-record server mutations (HSET/HDEL one field), never a whole-array
  // write. finishesServerLoaded gates writes so loading defaults/cache never persists.
  const finishFieldTimers = useRef({});   // field → setTimeout id (debounce)
  const finishFieldPending = useRef({});  // field → latest value awaiting its write

  const putFinishField = (field, value) => {
    if (!finishesServerLoaded.current) return;
    fetch(apiUrl('/api/finish-records', activeProperty), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    }).then(r => { if (!r.ok) setSyncError('Failed to save finishes'); else setSyncError(null); })
      .catch(() => setSyncError('Unable to reach server'));
  };

  const deleteFinishField = (field) => {
    if (!finishesServerLoaded.current) return;
    const base = apiUrl('/api/finish-records', activeProperty);
    const url = base + (activeProperty ? '&' : '?') + 'field=' + encodeURIComponent(field);
    fetch(url, { method: 'DELETE' })
      .then(r => { if (!r.ok) setSyncError('Failed to save finishes'); else setSyncError(null); })
      .catch(() => setSyncError('Unable to reach server'));
  };

  // Debounced field write (coalesces rapid keystrokes on the same field).
  const putFinishFieldDebounced = (field, value) => {
    finishFieldPending.current[field] = value;
    if (finishFieldTimers.current[field]) clearTimeout(finishFieldTimers.current[field]);
    finishFieldTimers.current[field] = setTimeout(() => {
      delete finishFieldTimers.current[field];
      delete finishFieldPending.current[field];
      putFinishField(field, value);
    }, 400);
  };

  // Fire any still-pending debounced writes immediately (tab hidden / page unload).
  const flushFinishFields = () => {
    for (const id of Object.values(finishFieldTimers.current)) clearTimeout(id);
    const pending = finishFieldPending.current;
    finishFieldTimers.current = {};
    finishFieldPending.current = {};
    for (const [field, value] of Object.entries(pending)) putFinishField(field, value);
  };

  // Typed callbacks passed to DesignView (kept here so all server I/O lives in the parent).
  const writeFinishItem = (item) => putFinishFieldDebounced(finishItemField(item.id), item);
  const tombstoneFinishItem = (id) => putFinishField(finishItemField(id), tombstone(id));
  const removeFinishItem = (id) => deleteFinishField(finishItemField(id));
  const writeFurniture = (roomId, furn) => putFinishField(furnitureField(roomId, furn.id), furn);
  const removeFurniture = (roomId, furnId) => deleteFinishField(furnitureField(roomId, furnId));
  const writeRoomMeta = (roomId, meta) => putFinishField(roomField(roomId), meta);
  const writeBudget = (val) => putFinishField(BUDGET_FIELD, val);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushFinishFields(); };
    window.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', flushFinishFields);
    return () => {
      window.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', flushFinishFields);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: `✓ built`. (Helpers exist but aren't wired to `DesignView` yet — that's Task 7. `putFinishField`/`writeFinishItem` etc. are defined-but-unused; the build does not fail on unused vars.)

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(design): parent-owned per-record finish write helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Load from the hash; stop the whole-array save

**Files:**
- Modify: `src/App.jsx` — finishes fetch effect (~lines 3923-3951) and finishes save effect (~lines 4001-4025).

- [ ] **Step 1: Point the load path at the hash**

Replace the finishes fetch effect body (the `fetch(apiUrl('/api/finishes', ...))...` chain). New effect:

```js
  // Fetch finishes for the active property from the per-record HASH (server migrates the
  // legacy blob → hash on first read). Same cancellation discipline as tasks/purchases.
  useEffect(() => {
    finishesServerLoaded.current = false;
    let cancelled = false;
    if (finishesFirstRun.current) {
      finishesFirstRun.current = false;
    } else {
      const cached = loadFinishesFromCache(activeProperty);
      setDeletedFinishIds(cached.deletedIds);
      setFinishes(cached.finishes);
      setTargetBudget(cached.targetBudget);
      setRoomData(cached.roomData);
    }
    fetch(apiUrl('/api/finish-records', activeProperty))
      .then(r => r.json())
      .then(map => {
        if (cancelled) return;
        finishesServerLoaded.current = true;
        const { savedItems, deletedIds, roomData: rd, targetBudget: tb } = partitionFinishFields(map);
        // Only apply server data when the hash actually has records (a brand-new property
        // returns {} → keep defaults, exactly like the old `items.length > 0` guard).
        if (savedItems.length > 0 || deletedIds.length > 0 || Object.keys(rd).length > 0 || tb != null) {
          setDeletedFinishIds(deletedIds);
          setFinishes(mergeFinishes(savedItems, deletedIds, DEFAULT_FINISH_ITEMS));
          setRoomData(rd);
          if (tb != null) setTargetBudget(tb);
        }
      })
      .catch(() => { if (!cancelled) finishesServerLoaded.current = true; });
    return () => { cancelled = true; };
  }, [activeProperty]);
```

- [ ] **Step 2: Reduce the save effect to a local cache only**

Replace the finishes save effect (~4001-4025) with a cache-only version (drop the `setTimeout`/`fetch` PUT — per-record writes now handle the server):

```js
  // Cache finishes to localStorage (LOCAL read-cache only — server writes are per-record
  // via the write helpers, never a whole-array PUT). activeProperty omitted from deps for
  // the same reason as the tasks save effect.
  useEffect(() => {
    const payload = { items: finishes, targetBudget, roomData, deletedIds: deletedFinishIds };
    try {
      localStorage.setItem(lsKey(LS_FINISHES, activeProperty), JSON.stringify(payload));
    } catch (e) { console.warn('localStorage save failed:', e.name); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishes, targetBudget, roomData, deletedFinishIds]);
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: `✓ built`. The app now loads from the hash and no longer whole-array-PUTs finishes. (Edits won't persist to the server until Task 7 wires the writes — do NOT deploy between Task 6 and Task 7.)

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(design): load finishes from per-record hash; drop whole-array PUT

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Wire every mutation to a targeted write

**Files:**
- Modify: `src/App.jsx` — `DesignView` prop list (line 1692) + its call site (~line 4235); mutation functions inside `DesignView` (`updateItem`, `cycleAssignee`, `setItemDueDate`, `addItem`, `createRoomCopies`, `deleteItem`, `addFurnitureItem`, `updateFurnitureItem`, `deleteFurnitureItem`); the two Miro-URL edit sites; the two budget-commit sites.

`DesignView` receives the write callbacks as new props and calls them alongside the existing `setFinishes`/`setRoomData`. Every write sends the **full** record (so no field is dropped on reload — the merge whitelist fix and user-item fields both rely on the whole object).

- [ ] **Step 1: Add the callbacks to the DesignView signature**

Line 1692 — append the new props:

```js
function DesignView({ finishes, setFinishes, targetBudget, setTargetBudget, roomData, setRoomData, focusItemId, deletedFinishIds, setDeletedFinishIds, onPromote, promotedFinishIds, onPromoteFurniture, promotedFurnitureIds, writeFinishItem, tombstoneFinishItem, removeFinishItem, writeFurniture, removeFurniture, writeRoomMeta, writeBudget }) {
```

- [ ] **Step 2: Pass them at the call site**

~Line 4235 — append to the `<DesignView ... />` props:

```jsx
      {activeView === "design" && <DesignView finishes={finishes} setFinishes={setFinishes} targetBudget={targetBudget} setTargetBudget={setTargetBudget} roomData={roomData} setRoomData={setRoomData} focusItemId={focusItemSource === "design" ? focusItemId : null} deletedFinishIds={deletedFinishIds} setDeletedFinishIds={setDeletedFinishIds} onPromote={promoteFinishItem} promotedFinishIds={promotedFinishIds} onPromoteFurniture={promoteFurnitureItem} promotedFurnitureIds={promotedFurnitureIds} writeFinishItem={writeFinishItem} tombstoneFinishItem={tombstoneFinishItem} removeFinishItem={removeFinishItem} writeFurniture={writeFurniture} removeFurniture={removeFurniture} writeRoomMeta={writeRoomMeta} writeBudget={writeBudget} />}
```

- [ ] **Step 3: Wire the item mutations**

Replace `updateItem`, `cycleAssignee`, `setItemDueDate` (~1851-1880) so each writes the resulting record:

```js
  const updateItem = (id, updates) => {
    setFinishes(prev => prev.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, ...updates };
      writeFinishItem(next);
      return next;
    }));
  };

  const deleteItem = (id) => {
    const item = finishes.find(i => i.id === id);
    if (item && !item.userCreated) {
      setDeletedFinishIds(prev => [...prev, id]);
      tombstoneFinishItem(id);          // default → tombstone field
    } else {
      removeFinishItem(id);             // user item → HDEL
    }
    setFinishes(prev => prev
      .filter(item => item.id !== id)
      .map(item => {
        if (item.linkedTo === id) {
          const next = { ...item, linkedTo: null };
          writeFinishItem(next);        // persist each unlinked child
          return next;
        }
        return item;
      }));
    setConfirmDelete(null);
  };

  const cycleAssignee = (id) => {
    const cycle = [null, "JM", "KM"];
    setFinishes(prev => prev.map(item => {
      if (item.id !== id) return item;
      const idx = cycle.indexOf(item.assignee);
      const next = { ...item, assignee: cycle[(idx + 1) % cycle.length] };
      writeFinishItem(next);
      return next;
    }));
  };

  const setItemDueDate = (id, date) => {
    setFinishes(prev => prev.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, dueDate: date || null };
      writeFinishItem(next);
      return next;
    }));
  };
```

- [ ] **Step 4: Wire add / copy-to-rooms**

Replace the `setFinishes` calls in `addItem` (~1869) and `createRoomCopies` (~1896) so new records are written:

```js
  const addItem = () => {
    if (!newItem.item.trim()) return;
    const created = {
      id: "uf" + Date.now(),
      category: newItem.category,
      room: newItem.room,
      item: newItem.item.trim(),
      contractorOptions: [],
      selection: "",
      unitPrice: null,
      quantity: null,
      unit: "ea",
      url: "",
      notes: "",
      assignee: null,
      dueDate: null,
      userCreated: true,
    };
    setFinishes(prev => [...prev, created]);
    writeFinishItem(created);
    setNewItem({ item: "", category: FINISH_CATEGORIES[0].id, room: FINISH_ROOMS[0].id });
    setShowAddForm(false);
  };
```

```js
  const createRoomCopies = (source) => {
    if (copyRooms.length === 0) return;
    const copies = buildRoomCopies({ source, roomIds: copyRooms, mode: copyMode, idBase: Date.now() });
    setFinishes(prev => [...prev, ...copies]);
    copies.forEach(writeFinishItem);
    setCopyToast(`Copied to ${copies.length} room${copies.length !== 1 ? "s" : ""}`);
    setCopyPanelId(null);
    setCopyRooms([]);
  };
```

- [ ] **Step 5: Wire the furniture mutations**

Replace `addFurnitureItem`, `updateFurnitureItem`, `deleteFurnitureItem` (~1920-1949):

```js
  const addFurnitureItem = (roomId) => {
    if (!newFurniture.name.trim()) return;
    const rd = getRoomData(roomId);
    const furn = {
      id: "furn" + Date.now(),
      name: newFurniture.name.trim(),
      price: newFurniture.price ? parseFloat(newFurniture.price) : null,
      url: newFurniture.url || "",
      notes: newFurniture.notes || "",
      purchased: false,
    };
    updateRoomData(roomId, { furniture: [...rd.furniture, furn] });
    writeFurniture(roomId, furn);
    setNewFurniture({ name: "", price: "", url: "", notes: "" });
    setShowAddFurniture(null);
  };

  const updateFurnitureItem = (roomId, furnId, updates) => {
    const rd = getRoomData(roomId);
    const next = rd.furniture.map(f => f.id === furnId ? { ...f, ...updates } : f);
    updateRoomData(roomId, { furniture: next });
    const updated = next.find(f => f.id === furnId);
    if (updated) writeFurniture(roomId, updated);
  };

  const deleteFurnitureItem = (roomId, furnId) => {
    const rd = getRoomData(roomId);
    updateRoomData(roomId, { furniture: rd.furniture.filter(f => f.id !== furnId) });
    removeFurniture(roomId, furnId);
  };
```

- [ ] **Step 6: Wire the Miro-URL and budget commits**

Both Miro-URL commit sites (~2266 `onKeyDown` Enter, ~2269 `onBlur`) currently call `updateRoomData(groupId, { miroUrl: miroInput.trim() })`. Add a write right after each:

```jsx
                        if (e.key === "Enter") { updateRoomData(groupId, { miroUrl: miroInput.trim() }); writeRoomMeta(groupId, { miroUrl: miroInput.trim() }); setEditingMiroRoom(null); }
```
```jsx
                      onBlur={() => { updateRoomData(groupId, { miroUrl: miroInput.trim() }); writeRoomMeta(groupId, { miroUrl: miroInput.trim() }); setEditingMiroRoom(null); }}
```

Both budget commit sites (~2073 Enter, ~2080 blur) call `setTargetBudget(val)`. Add `writeBudget(val)` right after each:

```jsx
                  if (e.key === "Enter") {
                    const val = budgetInput.trim() ? parseFloat(budgetInput) : null;
                    setTargetBudget(val);
                    writeBudget(val);
                    setEditingBudget(false);
                  }
```
```jsx
                onBlur={() => {
                  const val = budgetInput.trim() ? parseFloat(budgetInput) : null;
                  setTargetBudget(val);
                  writeBudget(val);
                  setEditingBudget(false);
                }}
```

- [ ] **Step 7: Verify tests + build**

Run: `npm test && npm run build`
Expected: all checks pass; `✓ built`.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx
git commit -m "feat(design): fire per-record writes on every finish/furniture mutation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Docs + manual verification

**Files:**
- Modify: `CLAUDE.md` (Persistence section + Design data-model note), `docs/known-issues.md`.

- [ ] **Step 1: Update CLAUDE.md**

In the **Persistence — CRITICAL rules** section, replace the tasks-&-finishes whole-payload rule with a note that finishes are now per-record. Add after the Purchases bullet:

```markdown
- **Finishes**: stored as a Redis **HASH** (`finish-records:<id>`) with one field per editable unit — `item:<id>`, `furn:<roomId>:<furnId>`, `room:<roomId>`, `budget`, and `item:<id>` **deletion tombstones** (`{id,__deleted:true}`). Every mutation is a **targeted single-field `HSET`/`HDEL`** (never a whole-array PUT) so concurrent edits can't clobber. Item writes are debounced per field (400 ms) + flushed on hide/unload. Load = `HGETALL` → `partitionFinishFields` → `mergeFinishes`. The legacy `finishes:<id>` blob is **frozen as backup** and read only by a one-time, idempotent, server-side migration (`migrateFinishesToHash` in `_scope.js`, run on first GET). Pure encode/decode helpers live in `src/lib/design-logic.js`. **Tasks** still use the whole-payload debounced PUT.
```

Update the **Persistence** line that says "Tasks & finishes: whole-payload debounced (500 ms) PUT..." to read **"Tasks: whole-payload..."** (finishes no longer applies). Keep the `activeProperty`-omitted-from-deps note for the tasks save effect.

- [ ] **Step 2: Update docs/known-issues.md**

Add an entry noting the finishes concurrent-edit race is **closed** (per-record hash), that live-sync remains out of scope (reload to see others' edits), and the rollback caveat (post-migration edits live only in the hash).

- [ ] **Step 3: Final full check**

Run: `npm test && npm run build`
Expected: all checks pass; `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/known-issues.md
git commit -m "docs: finishes now per-record hash (concurrent-edit race closed)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual verification (post-deploy — `/api` + Redis need a real deploy)**

Push to `main`, wait for Vercel, then on the live `/admin` app:

1. **Migration:** first Design-tab load still shows all existing items/rooms/furniture/budget (blob migrated into the hash). In Upstash, `finish-records:pp` now exists with `item:*`/`room:*`/`furn:*`/`budget`/`__migrated`; `finishes:pp` is unchanged.
2. **Persistence:** rename a default item → reload → new name sticks. Edit selection/price → reload → sticks.
3. **Non-clobber (the actual goal):** two browsers (you + Kerry, or two profiles). In A edit item X; in B edit a *different* item Y (and a furniture item in some room). Reload both → **both** edits present. Previously one wiped the other.
4. **Delete/restore:** delete a default item → reload → stays gone (tombstone). Delete a user-created item → reload → gone.
5. **Furniture + budget:** add/toggle/delete furniture and change the budget → reload → all persist.
6. **Backup:** click "Download full backup" → JSON includes `perProperty.pp.finishRecords`.

---

## Self-Review

**Spec coverage:**
- Data model (hash, namespaced fields, tombstones) → Tasks 1, 3. ✓
- `api/finish-records.js` GET/PUT/DELETE → Task 3. ✓
- `api/finishes.js` left intact (not touched); `backup.js` gains the hash → Task 4. ✓
- Pure helpers in `design-logic.js` → Task 1. ✓
- Client: remove whole-array save, per-record writes at every mutation, per-field debounce, load via partition → Tasks 5, 6, 7. ✓
- Auto server-side idempotent migration, blob never deleted → Tasks 2, 3. ✓
- Error handling via existing `setSyncError` banner → Task 5. ✓
- Testing (round-trip, tombstones, furniture regroup, budget, migration idempotency) → Tasks 1, 2; manual → Task 8. ✓
- Rollback caveat documented → Task 8. ✓
- Open item (cross-dir import from `api/` → `src/lib/`) → called out with fallback in Task 3 Step 2. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows complete, final code (Task 5's debounce uses a single pending-value implementation — no sketch/rewrite).

**Type consistency:** Field builders (`finishItemField`/`furnitureField`/`roomField`/`BUDGET_FIELD`/`tombstone`) and `partitionFinishFields`/`blobToFields` names are identical across Tasks 1, 2, 3, 5, 6. Write callbacks (`writeFinishItem`/`tombstoneFinishItem`/`removeFinishItem`/`writeFurniture`/`removeFurniture`/`writeRoomMeta`/`writeBudget`) are defined in Task 5 and consumed with the same names/arity in Task 7. `migrateFinishesToHash(redis, {key, legacyKey, toFields})` signature matches between Tasks 2 and 3.
