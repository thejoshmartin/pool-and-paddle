# Pool & Paddle — Known issues & deferred decisions

Things we consciously accepted or skipped while building the multi-property / purchases /
cost-seg work (2026-07). None are blockers for a 2-person personal app; this list exists so
a future session doesn't re-discover or re-litigate them. Each: **severity · why deferred ·
how to fix if it ever matters.**

---

### 1. Optimistic updates have no rollback
**Low.** Purchase save/delete, receipt changes, and the property in-service-date write update
local state immediately and PUT in the background. On failure they set `syncError` (red
banner) but don't revert local state; on the next load the server value wins.
*Why:* matches the app-wide pattern (tasks/finishes do the same); the banner surfaces
failures. *Fix if needed:* snapshot prior state and restore it in the `.catch`, or add a
retry/queue.

### 2. `api/finishes.js` doesn't merge `deletedIds` tombstones (pre-existing)
**Low–medium.** The finishes payload is stored/returned whole and the client re-applies
`deletedIds` on load, but a concurrent whole-array PUT can overwrite another device's
`deletedIds` — so a finish deleted on one device can reappear if the other edits & saves
before syncing. This predates the 2026-07 work (inherent to the whole-array finishes save).
*Why deferred:* rare with 2 users; a proper fix is a behavior change best done on its own.
*Fix if needed:* on the finishes PUT, read the existing payload and **union** the incoming
`deletedIds` with the stored ones server-side (`api/finishes.js`), so deletions are never lost.

### 3. Orphaned receipt blob if the purchase-save fails right after upload
**Low.** Receipt upload (`api/receipts-upload`) succeeds → the client then PUTs the purchase
with the new receipt reference. If that PUT fails, the blob exists but no purchase references
it, and nothing cleans it up (full-purchase delete and single-receipt removal both `del()`
correctly; only this failure window orphans). *Why:* Blob storage is cheap; the window is
tiny. *Fix if needed:* a periodic reconcile job that `list()`s `receipts/` blobs and deletes
any not referenced by a purchase, or upload *after* the purchase PUT succeeds.

### 4. Concurrent edit of the *same* purchase record = last-write-wins
**Low.** Purchases are per-record (`HSET`), so two people editing *different* records never
collide. Two people editing the *same* record in the same moment → last write wins on that
one record. *Why:* acceptable for 2 users. *Fix if needed:* `ifMatch`/ETag optimistic
concurrency on the hash field.

### 5. No "add property #2" UI
**By design (for now).** The whole data model is per-property and the code supports N
properties, but there's no UI to create a second one — only `pp` exists. *Fix when wanted:*
an "Add property" action that appends to the `properties` registry (validate unique id) and
lets the switcher target it; the load/save effects already handle arbitrary `activeProperty`.

### 6. HEIC receipts aren't compressed
**Low.** iPhone HEIC/HEIF images bypass the canvas image compressor (browsers can't decode
HEIC to canvas) and upload raw, so a large HEIC can hit the ~2.5 MB server cap and be
rejected. Most iOS uploads arrive as JPEG, so this is rare. *Fix if needed:* a client-side
HEIC→JPEG decoder, or raise the cap + use Blob client-uploads (bypasses the 4.5 MB function
limit) for large files.

### 7. Cost-seg CSV quotes numeric fields
**Cosmetic.** `buildCostSegCsv` wraps every value in quotes (valid RFC-4180); cost/subtotal
numbers export as `"175"`. Spreadsheets handle it, but a picky importer might read them as
text. *Fix if trivial-value:* emit numeric fields unquoted.

---

## Registry write — hardened, not fully locked
`setPropertyInServiceDate` fetches the fresh registry and patches only the active property's
date before PUT (so it can't clobber other properties), and `api/properties.js` validates
string + unique ids. There is **no ETag/optimistic-locking** — deliberately skipped as
over-engineering for a 1-property, 2-user app. Revisit if a real multi-property, multi-editor
workflow ever materializes.

## Explicitly NOT done (scope discipline)
Splitting `App.jsx` into modules · a test framework (vitest) — pure-logic node scripts suffice ·
a receipt-cleanup cron · registry optimistic-locking. All would be over-engineering here.
