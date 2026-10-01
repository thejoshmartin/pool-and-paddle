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

## Data model

New Redis key **`house-info:<propertyId>`** — a HASH, `?property=` scoped via the
existing `scopedKey` helper (base key `house-info` when the property is absent,
matching the tasks/finishes/purchases convention — in practice `activeProperty` is
always set today since migration already ran on prod). Field = item id, value =
JSON record. **Every mutation is a targeted single-record `HSET`/`HDEL`** — this is
a brand-new feature with no legacy data, so there is no migration step, just the
safe pattern from day one.

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
  updatedAt,       // ISO timestamp, set server-side on every write
  updatedBy,       // 'JM' | 'KM', from the pp_user cookie
}
```

```js
export const HOUSE_INFO_CATEGORIES = [
  "Utility", "Legal & Financial", "Access & Security", "Vendor & Service", "Other",
];
```

## Components

### API — `api/house-info.js` (new, modeled directly on `api/purchases.js`)

- **GET** `?property=` → `HGETALL house-info:<id>`; returns `Object.values(map)`
  parsed as JSON (array; client sorts/groups by category).
- **PUT** `?property=` — body is the full item object (`{ id, category, name, ... }`);
  validates `id`/`category`/`name` are non-empty strings and `category` is one of
  `HOUSE_INFO_CATEGORIES`, stamps `updatedAt`/`updatedBy` server-side (from the
  `pp_user` cookie, same as other routes read the logged-in user), then
  `HSET house-info:<id> { [id]: JSON.stringify(item) }`.
- **DELETE** `?property=&id=` → `HDEL house-info:<id>` that one field. No receipt
  blobs to clean up (unlike purchases).
- Auth: covered by the existing `middleware.js` matcher (`/api/:path*`) — no
  changes needed there.
- `api/backup.js` gains `house-info:*` hashes so full-snapshot backups stay
  complete (same treatment as `purchases:<id>`).

### Pure logic — `src/lib/house-info-logic.js` (new, unit-tested)

Mirrors the `purchases-logic.js` convention — constants + pure functions, no
React/browser APIs:

- `HOUSE_INFO_CATEGORIES` (above).
- `newHouseInfoId()` — `hi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`.
- `emptyHouseInfoItem()` — the blank-record shape for the add form.
- `matchesHouseInfoSearch(item, query)` — matches name/category/notes/accountNumber,
  mirroring `matchesFinishSearch`'s approach in `design-logic.js`.

### Client — `src/App.jsx` (new tab, 7th in nav)

- New tab **"House Info"**, placed after Purchases in the nav order (Dashboard,
  Tasks, Design, Purchases, House Info, Executive Brief, Podcast Intel).
- `HouseInfoView` component: list grouped by category (collapsible sections, same
  grouping affordance as Tasks-by-category), a free-text search box across
  name/category/notes/accountNumber (same pattern as Design's search box), and an
  add/edit form per item (inline, like Tasks — not a full modal) with fields:
  category (select), name, accountNumber, username, password, url, phone, notes.
- **Masked-by-default fields:** `accountNumber`, `password` render as `••••••••`
  until a per-row "reveal" toggle is clicked (client-side UI state only — no new
  access control, see Non-goals). Each of `accountNumber`/`username`/`password`
  gets a copy-to-clipboard button next to it.
- Mutations: add/edit → `PUT /api/house-info` with the full item (fire on save/blur,
  not per-keystroke — no debounce needed since each save is a deliberate action,
  not live-typed like Finishes' per-field autosave); delete → `DELETE
  /api/house-info?id=`.
- Load: `GET /api/house-info` into a `houseInfo` state array, gated by a
  `houseInfoServerLoaded` ref (same discipline as Purchases) so defaults/empty
  state never clobbers a slow server response. Reset the ref + use a per-run
  `isCancelled` guard on property switch, matching the existing fetch-effect
  pattern used by Tasks/Finishes/Purchases.
- **localStorage cache:** `house-info:<propertyId>` is a local-only read cache
  (display cache while the network round-trips), never the write path — same
  treatment as the Purchases cache. Its effect omits `activeProperty` from the dep
  array with the same eslint-disable + comment as the Tasks/Finishes caches, for
  the same reason (a bare property switch must not write the previous property's
  in-memory data under the new key).
- Mobile conventions from CLAUDE.md apply as normal: inputs ≥16px, `<button>` not
  `<div onClick>`, no invisible-overlay date inputs (none needed here), touch
  alternative for the reveal/copy affordances (not hover-only).

## Error handling

- Any PUT/DELETE failure → reuse the existing `setSyncError(...)` red-banner
  pattern already used by Tasks/Finishes/Purchases, cleared on next success.
- No offline queue (out of scope, consistent with the rest of the app) — a failed
  save leaves the local state as the user left it; they retry.

## Testing

- **Unit (`scripts/verify-logic.mjs`):** `newHouseInfoId` uniqueness/shape,
  `emptyHouseInfoItem` shape, `matchesHouseInfoSearch` across name/category/
  notes/accountNumber (case-insensitive, partial match).
- **Manual (post-deploy — `/api` needs a real deploy; `vite dev` can't reach
  Redis):** add an item in each category, reload and confirm it persists; edit and
  confirm `updatedAt`/`updatedBy` change; delete and confirm it's gone; reveal/copy
  a masked field; switch properties (once more than one exists) and confirm no
  cross-property leakage; confirm `api/backup.js` includes `house-info:*`.

## Rollback

Brand-new key/route/tab — rollback is simply reverting the commit(s); no data
migration to unwind since nothing existed before this.

## Open implementation details (decide in the plan, not blockers)

- Exact visual treatment of the category-grouped list (collapsible sections vs.
  flat list with a category filter chip row) — functionally equivalent, pick
  whichever reads cleaner once the form is laid out.
- `updatedBy` reads the `pp_user` cookie server-side (confirmed feasible: it's a
  plain, non-HttpOnly cookie set to `JM`/`KM` — see `middleware.js`). No existing
  `api/*.js` route currently parses cookies (only `middleware.js` does, via the
  Edge `Request` API); `api/house-info.js` needs its own small inline parse of
  `req.headers.cookie` (Vercel serverless routes get a plain Node-style `req`, not
  the Edge `Request` object `middleware.js` uses — don't copy `getCookie` verbatim).
