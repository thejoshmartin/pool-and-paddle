# House Info tab (utility accounts, IDs, access codes, vendor contacts)

**Date:** 2026-10-01
**Status:** Approved design — ready for implementation plan
**Author:** Josh + Claude

## Problem

There is currently no in-app place to keep reference data about the house itself —
FPL (utility) account numbers, Tax ID / parcel ID, insurance policy numbers, alarm
and lockbox codes, wifi password, vendor contacts (pool service, pest control,
property manager), payment-portal URLs and logins. Today this lives scattered
across email/paper, so Josh and Kerry have to dig for it when they need it (e.g.
calling FPL, filing taxes, handing something to a contractor). The `properties`
registry (`{ id, name, address, inServiceDate }`) has no concept of this; the
Dashboard tab is a pure read-only stats rollup with no precedent for owning editable
records.

## Goals

- A dedicated place to record and quickly find house account/reference info,
  including actual login credentials (so it can double as the source of truth for
  a future Claude-agent integration that logs in / pays bills on your behalf).
- Fits the existing per-property, two-person-shared-account model and the
  concurrent-edit-safety discipline already established for Purchases/Finishes
  (targeted single-record writes — **never** a whole-array/whole-blob PUT).
- Sensitive fields (account numbers, passwords) are masked by default on screen,
  with reveal + copy-to-clipboard, so they're not exposed at a glance or on a
  screen-share.

## Non-goals (explicitly out of scope for this round)

- **External sharing** (a PDF/print export or a limited-access link for a
  contractor/property manager/CPA who shouldn't get full admin login). Deferred —
  revisit if actually needed; for now Josh/Kerry read it off-screen or copy it by
  hand.
- **Agent/MCP read access.** Not building any agent-facing endpoint now. The
  structured, flat schema here is chosen so that's an easy follow-on later, but
  nothing agent-facing ships in this project.
- **Field-level encryption at rest, or any access control finer than the existing
  JM/KM login.** Masking in the UI is a display courtesy, not new security — same
  all-or-nothing trust model as the rest of the app (CLAUDE.md: "2-person SHARED
  account... no per-user ownership"). An encryption key would have to live
  somewhere the server can reach anyway (same boundary as `BLOB_READ_WRITE_TOKEN`
  today), so it wouldn't meaningfully change the risk — and nothing else in this
  app encrypts stored data beyond what Redis/Blob already provide.
- **Audit history** beyond a simple `updatedAt`/`updatedBy` stamp per record.
- **A localStorage read-cache**, unlike Purchases/Tasks/Finishes. Caching plaintext
  credentials client-side would be a new exposure beyond Redis (and it outlives
  logout — `/admin/logout` only clears cookies, not localStorage) for a feature that
  isn't typed character-by-character the way Tasks/Design are, so the responsiveness
  win doesn't justify it. The tab shows a brief loading state on first load instead.
- **Keeping credentials out of "Download full backup."** The backup already
  contains full unmasked financial data (purchases, tasks); this extends that same
  existing tradeoff to credentials rather than inventing a new one. Stated here
  explicitly so it's a conscious call, not an oversight — revisit if Josh/Kerry
  decide the downloaded JSON (which can land in Downloads/iCloud) should redact
  `password`/`accountNumber`.

## Data model

New Redis key **`house-info:<propertyId>`** — a HASH. Field = item id, value = JSON
record. **Every mutation is a targeted single-record `HSET`/`HDEL`** — this is a
brand-new feature with no legacy data, so there is no migration step, just the safe
pattern from day one.

Unlike tasks/finishes/purchases, **this route requires `?property=`** and 400s if
it's missing, rather than falling back to an unscoped bare `house-info` key. Those
older routes fall back to a bare key for pre-migration/legacy compatibility; there
is no legacy house-info data to be compatible with, and a bare-key fallback would
silently create data `api/backup.js` never looks at (it only enumerates
`house-info:<id>` for each registered property id).

Item shape — one flat, generic record (no bespoke fields per category, so it
covers utilities/legal/access/vendors without over-modeling):

```js
{
  id,              // hi-<timestamp36>-<rand6>, same pattern as newPurchaseId()
  category,        // one of HOUSE_INFO_CATEGORIES (below)
  name,            // "FPL Electric", "Homeowners Insurance", "Front Gate Code", "Pool Service"
  accountNumber,   // account #, policy #, parcel ID, lockbox/gate code — whatever fits
  username,
  password,
  url,             // login / payment-portal URL
  phone,
  notes,
  updatedAt,       // ISO timestamp, set server-side on every write — client value ignored
  updatedBy,       // 'JM' | 'KM' | null, parsed server-side from the pp_session cookie — client value ignored
}
```

`updatedBy` reads `pp_session` (format `USERNAME:hash`, already verified by
`middleware.js` before the route runs), **not** `pp_user` — `pp_user` is a plain,
unsigned cookie the client could change, while `pp_session`'s username has already
passed `validateSession`. `req.cookies.pp_session` is available directly: Vercel's
Node.js serverless function runtime parses `req.cookies`/`req.query`/`req.body`
automatically for the plain `(req, res)` handler signature these routes already use
(no manual `Cookie`-header parsing needed, unlike `middleware.js`'s Edge `Request`,
which is a different runtime). In local dev (no password env vars, auth bypassed),
`pp_session` is absent — `updatedBy` is simply `null` in that case.

```js
export const HOUSE_INFO_CATEGORIES = [
  "Utility", "Legal & Financial", "Access & Security", "Vendor & Service", "Other",
];
```

## Components

### API — `api/house-info.js` (new, modeled directly on `api/purchases.js`)

- **GET** `?property=` (required) → `HGETALL house-info:<id>`; returns
  `Object.values(map)` parsed as JSON (array; client sorts/groups by category).
  Sets `Cache-Control: no-store` (this response carries credentials — same header
  `api/backup.js` already sets for the same reason).
- **PUT** `?property=` (required) — body is the full item object
  (`{ id, category, name, ... }`). Unlike `purchases.js` (which stores `req.body`
  close to verbatim), this route **whitelists fields server-side** before storing,
  since the record holds secrets and is meant to double as a future agent's data
  source: validates `id` matches `/^hi-[a-z0-9-]+$/`, `category` is one of
  `HOUSE_INFO_CATEGORIES`, `name` is a non-empty string; builds a fresh object from
  only the known fields (coerced to strings), **always overwriting** any
  `updatedAt`/`updatedBy` the client sent with server-stamped values (see Data
  model). `HSET house-info:<id> { [id]: JSON.stringify(item) }`, then responds
  `{ ok: true, item }` (the stamped item) so the client can update its own state
  immediately instead of waiting for a reload to see the real `updatedAt`/`updatedBy`.
- **DELETE** `?property=&id=` (both required) → `HDEL house-info:<id>` that one
  field. No receipt blobs to clean up (unlike purchases).
- Auth: covered by the existing `middleware.js` matcher (`/api/:path*`) — no
  changes needed there.
- `api/backup.js` gains `houseInfo: await redis.hgetall(\`house-info:${id}\`)` per
  property id, alongside the existing `tasks`/`finishes`/`finishRecords`/`purchases`
  hashes it already collects in that loop.

### Pure logic — `src/lib/house-info-logic.js` (new, unit-tested)

Mirrors the `purchases-logic.js` convention — constants + pure functions, no
React/browser APIs:

- `HOUSE_INFO_CATEGORIES` (above).
- `newHouseInfoId()` — `hi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`.
- `emptyHouseInfoItem()` — the blank-record shape for the add form.
- `matchesHouseInfoSearch(item, query)` — matches name/category/notes/accountNumber,
  mirroring `matchesFinishSearch`'s approach in `design-logic.js`.

### Client — `src/App.jsx` (new tab, 7th in nav)

- New tab **"House Info"**, placed after Purchases in the nav order (nav labels are
  the short form used in `App.jsx`'s nav array: Dashboard, Tasks, Design, Purchases,
  House Info, Brief, Podcast).
- `HouseInfoView` component: list grouped by category (collapsible sections, same
  grouping affordance as Tasks-by-category), a free-text search box across
  name/category/notes/accountNumber (same pattern as Design's search box), and an
  add/edit form per item (inline, like Tasks — not a full modal) with fields:
  category (select), name, accountNumber, username, password, url, phone, notes.
- **Masked-by-default fields:** `accountNumber`, `password` render as `••••••••`
  until a per-row "reveal" toggle is clicked (client-side UI state only — no new
  access control, see Non-goals). Each of `accountNumber`/`username`/`password`
  gets a copy-to-clipboard button next to it. The `url` field only renders as a
  clickable link when it starts with `http://` or `https://` (otherwise shown as
  plain text) — guards against a `javascript:`-scheme value executing on click. (The
  existing finish/furniture `url` links in Design have this same gap; not fixing
  those here, out of scope, but not repeating it in new code.)
- **Mutations commit on an explicit Save, not per-field blur.** An open add/edit
  form only mutates local form state; the full item is sent in one `PUT` when Save
  is clicked — the same deferred-commit discipline `PurchaseForm` uses for receipts,
  and for the same reason: multiple overlapping per-blur PUTs from one open form can
  resolve out of order and silently revert an earlier field edit (CLAUDE.md's
  "2026-07 mobile pass" fix). Delete → `DELETE /api/house-info?id=`, fired
  immediately (same as Purchases' saved-row delete, which isn't behind an open form).
- Load: `GET /api/house-info` into a `houseInfo` state array on mount and on
  property switch, with the same per-run `isCancelled` guard used by the
  Tasks/Finishes/Purchases fetch effects (so an out-of-order resolution after a
  rapid property switch can't apply under the wrong property). Note: Purchases'
  `purchasesServerLoaded` ref is set but never actually read anywhere in `App.jsx` —
  it isn't a real guard today, so house-info should **not** copy it as if it were
  load-bearing. The actual risk it would have addressed — the initial GET resolving
  *after* the user has already added an item from the empty-list UI, and the GET's
  `setHouseInfo(data)` wiping that just-added item from view — is handled instead by
  disabling the "Add" control until the initial GET settles (loading indicator in
  its place).
- **No localStorage cache** (see Non-goals) — the tab shows a brief loading state on
  first load/property-switch instead of an instant cached render.
- Mobile conventions from CLAUDE.md apply as normal: inputs ≥16px, `<button>` not
  `<div onClick>`, no invisible-overlay date inputs (none needed here), touch
  alternative for the reveal/copy affordances (not hover-only).

## Error handling

- Any PUT/DELETE failure → reuse the existing `setSyncError(...)` red-banner
  pattern already used by Tasks/Finishes/Purchases, cleared on next success.
- No offline queue (out of scope, consistent with the rest of the app) — a failed
  save leaves the local state as the user left it; they retry.

## Testing

- **Unit (`scripts/verify-logic.mjs`):** `newHouseInfoId` uniqueness/shape (matches
  `/^hi-[a-z0-9-]+$/`), `emptyHouseInfoItem` shape, `matchesHouseInfoSearch` across
  name/category/notes/accountNumber (case-insensitive, partial match).
- **Manual (post-deploy — `/api` needs a real deploy; `vite dev` can't reach
  Redis):** add an item in each category, reload and confirm it persists; edit and
  confirm `updatedAt`/`updatedBy` change to the real server-stamped values (not
  whatever the client sent); delete and confirm it's gone; reveal/copy a masked
  field; confirm a `url` without `http(s)://` renders as plain text, not a link;
  open an edit form, change a field, and confirm closing/navigating away without
  clicking Save does not persist it; switch properties (once more than one exists)
  and confirm no cross-property leakage and GET without `?property=` 400s; confirm
  `api/backup.js` includes `houseInfo` per property and the response has
  `Cache-Control: no-store`.

## Rollback

Brand-new key/route/tab — rollback is simply reverting the commit(s); no data
migration to unwind since nothing existed before this.

## Open implementation details (decide in the plan, not blockers)

- Exact visual treatment of the category-grouped list (collapsible sections vs.
  flat list with a category filter chip row) — functionally equivalent, pick
  whichever reads cleaner once the form is laid out.
- CLAUDE.md needs updating alongside this feature: tab count (now 7), the API
  routes list, the Redis keys list, and the `backup.js` coverage description.
