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

### 3. Best-effort receipt-blob cleanup (a few tiny orphan/dangling windows)
**Low.** Receipt blobs upload to Blob immediately; the record referencing them commits
separately, and blob deletes are best-effort (`.catch(()=>{})`). Narrow windows remain:
(a) **remove-then-save PUT failure** — if a receipt *removal*'s record PUT fails (red sync
banner) but the blob DELETE already fired, the persisted record still references a deleted
blob → view 404s; (b) **restored-draft reload chains** — the new-form session-upload tracker
is seeded from a restored draft (covers the common reload→remove/cancel case), but an
upload made *after* a restore isn't re-seeded across a *second* reload, so it can leak;
(c) any leak is unreferenced storage, never data loss (the saved record is always correct).
*Why:* Blob storage is cheap; windows are tiny; matches the app-wide best-effort pattern.
*Fix if needed:* move receipt deletion server-side to run atomically after the `HSET`, and/or
a periodic reconcile job that `list()`s `receipts/` blobs and `del()`s any not referenced by
a purchase. (See "2026-07 mobile pass" below for the deferred receipt-commit model.)

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

### 6. HEIC receipts aren't compressed — ✅ RESOLVED (2026-07 mobile pass)
**Resolved.** `buildReceiptUpload` now routes *all* images (incl. HEIC/HEIF) through the
canvas compressor → JPEG, so nothing uploads raw. On browsers that can't decode HEIC to
canvas (mainly Android Chrome), it throws a `ReceiptUploadError` with an actionable message
("set iPhone camera to Most Compatible, or attach a screenshot/PDF") instead of a silent
size rejection; `api/receipts-upload.js` no longer accepts `heic/heif` (defense-in-depth).
Residual edge (Android + HEIC that can't be decoded client-side) is a clear error, not a
dead-end. Original workaround note kept for history.

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

## 2026-07 mobile pass (receipt capture + purchase logging on a phone)
Shipped in PR #1 (`mobile-receipt-capture`). Goal: log a purchase and attach a receipt from a
phone, take-a-photo **or** pick-an-existing-photo, as the primary flow. Driven by a full
mobile audit + 3 adversarial review rounds. Key design decisions worth not re-litigating:

- **Two capture triggers, not one.** The primary "🖼️ Choose photo or file" input has **no
  `capture` attribute** (so iOS/Android expose Library + Files + PDF and multi-select); a
  separate "📷 Take photo" input keeps `capture="environment"`. Do **not** put `capture` back
  on the primary trigger — it removes the library/PDF option on Android (the original bug).
- **HEIC→JPEG for all images** (see §6). Server rejects `heic/heif`.
- **Deferred receipt commit in the form.** In `PurchaseForm` (new *and* edit), attaching/
  removing a receipt only mutates form state; the receipt array commits to Redis **once, on
  Save** (`onSave(d)` → targeted `HSET`). This is deliberate: an earlier version persisted
  receipts immediately from an open edit form, which raced the field-edit Save and could
  silently revert edits (a same-record variant of the whole-array race CLAUDE.md forbids).
  **Do not reintroduce immediate whole-record persistence from an open form.** Blobs uploaded
  but never committed are cleaned up on Save (`orphaned` reconcile) and on form teardown
  (unmount effect), except when a draft still persists (so a reload can restore its receipts).
  The **saved expanded row** (not a form) still persists receipts immediately — that path
  never runs concurrently with an open edit form, so it's race-free.
- **`ReceiptUploader`** is one reusable component: `viewablePaths` (only persisted receipts
  render as view links; unsaved ones are plain labels, since `receipts-view` 404s until the
  purchase references them), `deferBlobDelete`, `onBlobUploaded` (feeds the session tracker).
- **iOS zoom:** every focusable input is ≥16px (below that, iOS Safari zooms the page on
  focus). If you add an input, keep it ≥16px. Do **not** add `maximum-scale` to the viewport.
- Other mobile bits: larger touch targets + confirm-before-remove-receipt, 1-per-row form
  fields on mobile, horizontal-scroll tab strip, touch-visible task delete, new-purchase
  draft auto-save + `overscroll-behavior-y: contain`, light body bg + `theme-color`.

## Explicitly NOT done (scope discipline)
Splitting `App.jsx` into modules · a test framework (vitest) — pure-logic node scripts suffice ·
a receipt-cleanup cron · registry optimistic-locking. All would be over-engineering here.
