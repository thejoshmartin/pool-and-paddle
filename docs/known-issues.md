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

### 2. Whole-array finishes save = concurrent-edit clobber — ✅ RESOLVED (2026-07 per-record hash)
**Was Low–medium, now closed.** The finishes payload used to be stored/returned whole, so a
concurrent whole-array PUT could overwrite another device's edits and `deletedIds` — a finish
deleted or renamed on one device could be lost if the other saved before syncing. **Resolved:**
finishes now persist as a per-record Redis **hash** (`finish-records:<id>`), one independently
-writable field per item/furniture/room/budget, with deletions as `item:<id>` tombstones. Edits
to *different* units can no longer clobber each other. See the **Finishes** bullet in
`CLAUDE.md` → Persistence, and the design/plan docs under `docs/superpowers/`.

Two conscious caveats remain (not bugs):
- **No live sync (out of scope).** Two people still only *see* each other's saved changes after
  a reload — non-destructive saves were the goal, not real-time updates. A poll/focus refresh or
  SSE push is a separate future project. Same-field simultaneous edits still resolve last-writer
  -wins on *that one field only* (fine for 2 people; not CRDT merging).
- **Rollback caveat.** The legacy `finishes:<id>` blob is frozen as backup and the one-time
  server-side migration never deletes it — but edits made *after* migration live only in the
  hash, so reverting the client to the old blob-PUT would lose post-migration edits.

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

## 2026-11 Phase 1 purchases upgrade (returns, reimbursements, order grouping)
Consciously chosen behavior — don't re-litigate without Josh:
- `netCost` is clamped at 0; `refundAmount` means money actually back in hand (net of restocking fee); `restockingFee` and `returnShippingCost` are recorded but do **not** change `netCost`.
- Setting a purchase to `Returned` pre-fills `refundAmount` with `totalPaid` (editable); a Returned line with no refund shows a "refund not recorded" chip, and its net cost stays at the full amount until a refund is entered.
- "Returns closing" lists only windows that have not yet closed (today through +14 days); `Return started` stays listed.
- "Due from Sparrow" is summed on net cost where `reimbursable` and status ≠ `reimbursed`; `reimbursedAmount` is informational (partial reimbursements aren't subtracted).
- The reimbursable-vendor list is a code constant (`DEFAULT_REIMBURSABLE_VENDORS`, seed Minoan) until Phase 2's settings exist; reimbursement defaults are not applied when Sparrow paid.
- Contractor-scope default for Sparrow-paid items covers the trades with no Exhibit B equivalent (Small Appliances, Kitchen & Dining, Supplies & Consumables, Window Treatments, Furniture / FF&E, Decor & Styling, Linens & Soft Goods, Electronics / AV, Paint, Decking, Doors, Drywall, Other). Trades that do have an equivalent (Flooring, Kitchens, Countertops, Appliances, …) get no automatic category, and any Sparrow-paid purchase outside every Exhibit B category is still listed on the contractor-scope line so it is never invisible.
- The payment badge appears only for `docType` statement/quote and clears only via the explicit checkbox (`paymentConfirmed`, or `lienWaiverReceived` when Sparrow paid) — attaching a file does not clear it.
- "Add line to this order" persists the new line immediately (like Design promote), so it can exist with a blank description until edited.
- Receipt blobs can be shared by several purchases; `receipts-delete` fails safe (keeps the blob) if it can't read Redis, which can leave an orphan blob (harmless) — same best-effort stance as known issue #3.
- Receipt routes check shared references by reading the purchases hash (`HGETALL`) — `receipts-view` tries a single `HGET` of the uploader's record first; fine at this scale, and one corrupt record is skipped rather than breaking the property. A removal in one tab racing another line's unsaved save could still orphan-delete a blob (needs seconds of overlap; not seen in practice).
- The Returned (excluded) CSV block lists every Returned line with a "Net not refunded" column; those lines are not part of cost-seg basis even if only partly refunded (a restocking fee is an expense, not basis) — confirm with the CPA.

## 2026-11 Phase 2 Shopping tab
Consciously chosen behavior — don't re-litigate without Josh:
- The server sanitizer validates every known field but **preserves unknown fields** on items, candidates and settings (so additive research-agent fields survive a save); only `__proto__`/`constructor`/`prototype` are dropped and a record is capped at 100 KB.
- `qtyNeeded` on a stored item is never authoritative — `computeQty` recomputes on read and the export bundle writes it fresh.
- Best Value treats unknown stock (`inStock` null) as in stock and a missing delivery ETA as OK when a need-by is set; `restockingPct` is a fraction (a value above 1 is read as a percent); `targetPrice` and the over-target warning are per unit.
- Agent import never changes `status` (adding candidates does not advance it), appends notes once, takes `flaggedAt` from the file's `generatedAt` (so re-importing is a no-op), and adds a repeat new item's candidates to the existing proposed item instead of duplicating it. Price/stock refreshes never overwrite `qtyToBuy`/`packSize`/identity fields or blank out a known value. Update entries' unknown fields are copied only when they don't collide with a known item field and aren't delete-like.
- Approve needs a selected candidate; selecting a candidate on a researching item moves it to shortlisted; un-approving returns it to shortlisted.
- Research tools exported to the agent = Smart Home & Security, Guest Experience, Operations & Cleaning (the spec says "procurement-relevant" without a list).
- Print for Kerry uses a new window (pop-ups must be allowed) because the project forbids stylesheets, which an in-page `@media print` would need.
- `scripts/parse-shopping-list.py` reads a CSV export of the master-list tab and could not be validated against the real master list (not yet supplied); it ships with a sample fixture and a unit test, and rejects a bad row with its row number.
- Shopping edits are disabled until the saved list has loaded for a real property (so seed defaults can never overwrite saved data); there is no live sync between devices (same as the rest of the app).
- The Purchases form's reimbursement default reads `settings.reimbursableVendors`; the legacy-record default in `normalizePurchase` still uses the code constant because settings are not loaded at that point.
- Selecting a different candidate (or deleting the selected one) on an approved item clears the approval — a different pick was never approved. A purchased state is based on LIVE linked purchases, so deleting a promoted purchase frees the item to be marked purchased again (its status stays `ordered` until you change it).
- Known limits left as-is: dismissing an agent-proposed item deletes it, so re-importing the same file brings it back (with a new id); when the master list replaces the §2.6 seed, any edited `sh-seed-*` records from the old seed that aren't in the new one stay as extra items (they carry your decisions, so they are not silently dropped); an agent price re-check can change the price of an already-approved candidate (allowed by the spec; there is no "price changed since approval" badge yet); the shopping localStorage cache is written on every change (server writes are the gated ones).
- With no `pp_user` cookie (auth bypassed on local dev / unprotected previews) the Shopping tab still renders, but Approve and "I'm buying this" are disabled.

