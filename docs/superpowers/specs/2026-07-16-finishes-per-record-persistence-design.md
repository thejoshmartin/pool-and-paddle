# Finishes per-record persistence (kill the co-editing clobber)

**Date:** 2026-07-16
**Status:** Approved design — ready for implementation plan
**Author:** Josh + Claude

## Problem

Finishes (the Design tab) persist as a single whole-payload, debounced (500 ms) `PUT`
of `{ items[], roomData{}, targetBudget, deletedIds[] }` to `finishes:<propertyId>`
(a Redis string blob). When Josh and Kerry edit at the same time, each client writes
its *entire* snapshot, so the last writer wins and silently overwrites the other's
concurrent changes — "nothing we did last night stuck."

Purchases already solved this by storing records in a Redis **hash** with targeted
single-record writes (`HSET`/`HDEL`). This project brings the same pattern to finishes.

> Note: a separate, already-fixed bug (`mergeFinishes` dropping the `item`/`category`
> fields on reload — commit `5498c76`) made the clobber look total. That is fixed
> independently; this project addresses the remaining true concurrent-write race.

## Goals

- Edits to **any two different things** by two people never overwrite each other:
  finish items, per-room furniture, room Miro URLs, budget, and deletions are all
  independently writable ("everything granular").
- Non-destructive saves. Same-field simultaneous edits resolve last-write-wins on
  *that one field only* (acceptable for a 2-person tool).
- No user-visible behavior or UI change. The Design tab looks and works the same.

## Non-goals (explicitly out of scope)

- **Live sync.** Users still only *see* each other's changes after a reload/refresh.
  Real-time refresh (poll/focus) or SSE push is a separate future project.
- **Same-field conflict merging** (Google-Docs-style / CRDT). Not worth it for two users.
- Any change to the `mergeTasks`/tasks persistence path.

## Data model

New Redis key **`finish-records:<propertyId>`** — a HASH. `?property=` scoped via
`scopedKey` (base key `finish-records` when the property is absent, matching the
existing tasks/finishes/purchases convention). The old `finishes:<propertyId>` **blob
is frozen as a backup and never written again** (nor deleted).

Every field is independently `HSET`/`HDEL`-able:

| Field pattern | Value |
|---|---|
| `item:<itemId>` | one finish item's saved record (the persisted subset of fields) |
| `item:<itemId>` = `{ id, __deleted: true }` | **tombstone** — a deleted *default* item (see below) |
| `furn:<roomId>:<furnId>` | one furniture item (roomId also stored in the value for safety) |
| `room:<roomId>` | that room's `{ miroUrl }` (furniture lives in `furn:*`, not here) |
| `budget` | the `targetBudget` scalar |
| `__migrated` | idempotency stamp written last by the auto-migration |

### Why tombstones for deletions

The ~161 default finish items are baked into app code (`DEFAULT_FINISH_ITEMS`).
"Deleting" a default cannot simply remove storage, because `mergeFinishes` would
re-add it from the catalogue on next load. Today a shared `deletedIds[]` array records
these — but a single shared array field re-introduces clobber (two people deleting two
different defaults would overwrite each other). So each deletion becomes its own field:
`item:<id> = { __deleted: true }`.

- **Delete a default:** `HSET item:<id> = { id, __deleted:true }`. Vanishes from view as today.
- **Delete a user-created item:** `HDEL item:<id>` (no tombstone needed — it isn't a default).
- **Restore (if ever added):** `HDEL item:<id>` removes the tombstone.
- **On load:** tombstoned ids populate the existing `deletedFinishIds` state, which
  feeds the unchanged `mergeFinishes(saved, deletedIds, DEFAULT_FINISH_ITEMS)` call.

No UI or behavior change; purely the granular-safe storage representation of "deleted".

## Components

### API — `api/finish-records.js` (new, modeled on `api/purchases.js`)

- **GET** → `HGETALL finish-records:<id>`; returns the raw field map. Runs auto-migration first (below).
- **PUT** body `{ field, value }` → `HSET` that one field.
- **DELETE** `?field=<field>` → `HDEL` that one field.
- `?property=` scoped via `scopedKey`; `PP_REDIS_*` client, same as siblings.

`api/finishes.js` (old blob GET/PUT) is **left intact** so `backup.js` can still read
the frozen blob; the client simply stops writing to it. `api/backup.js` gains the new
`finish-records:*` hash so snapshots stay complete.

### Pure helpers — `src/lib/design-logic.js` (extend; unit-tested)

- `finishItemField(id)`, `furnitureField(roomId, furnId)`, `roomField(roomId)` — field-name builders.
- `tombstone(id)` — `{ id, __deleted: true }`.
- `partitionFinishFields(hgetall)` → `{ savedItems, deletedIds, roomData, targetBudget }`
  (decode a raw `HGETALL` map into the shapes the client already uses).
- `blobToFields(blob)` → the field map for migration (inverse of `partitionFinishFields`,
  operating on the legacy `{ items, roomData, targetBudget, deletedIds }` blob).

Keeping these pure and in the lib mirrors `mergeFinishes`/`buildRoomCopies` and makes
the encode/decode round-trip node-testable. The API route imports the field-name
builders + `blobToFields` from `src/lib/design-logic.js`; if Vercel's function bundler
cannot resolve the `src/` import from `api/`, fall back to duplicating those small pure
helpers into `api/_scope.js` (decide during implementation — confirm the import bundles).

### Client — `src/App.jsx` (write plumbing only; UI unchanged)

- **Remove** the debounced whole-array finishes save effect (currently ~App.jsx:4004).
  **Keep** the localStorage cache effect as a local read-cache only (exactly like purchases).
- Load path: GET `/api/finish-records` → `partitionFinishFields` → feed `savedItems` +
  `deletedIds` into the existing `mergeFinishes`; assemble `roomData`/`targetBudget`
  directly. Reset/guard with `finishesServerLoaded` + the per-run cancellation guard
  exactly as the current fetch effect does.
- Each mutation fires one targeted write, gated by `finishesServerLoaded`, with the
  existing `setSyncError(...)` handling. A small **per-field debounce (~400 ms, keyed by
  field name)** coalesces keystrokes so typing a name is one write, not one per key:

  | Action | Write |
  |---|---|
  | `updateItem(id, …)` | `HSET item:<id>` (per-field debounced) |
  | `addItem` / copy-to-rooms | `HSET item:<newId>` (N writes for N copies) |
  | `deleteItem` (user item) | `HDEL item:<id>` |
  | `deleteItem` (default) | `HSET item:<id>` = tombstone (+ `HSET` each unlinked child) |
  | furniture add/edit/delete/purchased | `HSET`/`HDEL furn:<roomId>:<fid>` |
  | Miro URL edit | `HSET room:<roomId>` |
  | budget edit | `HSET budget` |

## Migration — auto, server-side, idempotent

Inside GET `/api/finish-records`:

1. `HGETALL` the hash. If it has any fields (or `__migrated`), skip — return as-is.
2. Empty hash → check the legacy `finishes:<id>` blob. Absent → nothing to migrate,
   return empty (fresh property).
3. Blob present → acquire NX lock `finishes-hash-migration:lock`. Under the lock:
   `blobToFields(blob)` → `HSET` all fields (deletedIds become tombstones), then write
   `__migrated` **last**. Release lock.
4. **Never delete the blob.** It stays frozen as backup.

Idempotent and safe against interruption/concurrency (write-then-stamp, NX lock), the
same discipline as `api/migrate.js`. No modal, no user action — safe because there is a
single property and the source blob is preserved.

## Error handling

- Any targeted write failure → `setSyncError('Failed to save finishes')`, cleared on the
  next success — reuses the existing banner. No offline queue (out of scope); the local
  cache still holds the edit and a later successful write reconciles it.
- Migration lock contention → the loser skips and returns the (now-migrated) hash.

## Testing

- **Unit (`scripts/verify-logic.mjs`):**
  - `blobToFields` → `partitionFinishFields` round-trips a representative blob
    (items with edits, furniture across rooms, deleted defaults, budget).
  - Deleted defaults ↔ tombstones ↔ `deletedIds`.
  - Furniture fields regroup by room; `room:<id>` carries `miroUrl`; `budget` maps through.
  - Existing `mergeFinishes` tests continue to pass unchanged.
- **Manual (post-deploy — `/api` needs a real deploy; `vite dev` can't reach Redis):**
  two sessions edit *different* items and *different* furniture simultaneously → both
  persist; reload confirms. Delete then confirm a default stays deleted across reload.
  Verify a fresh (unmigrated) read migrates once and the blob is untouched.

## Rollback

The frozen `finishes:<id>` blob means we can revert the client to blob-`PUT`.
**Caveat:** edits made *after* migration live only in the hash, so a revert loses those
post-migration edits. Acceptable for a 2-person tool, stated here so it's a conscious call.

## Open implementation details (decide in the plan, not blockers)

- Confirm `api/finish-records.js` can import pure helpers from `src/lib/design-logic.js`
  under Vercel's bundler; else duplicate the small helpers into `api/_scope.js`.
- Exact per-field debounce interval (start 400 ms) and whether furniture/miro/budget
  writes debounce or fire immediately (they're low-frequency — likely immediate).
