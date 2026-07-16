# Pool & Paddle — Development Guide

## Project Overview
Luxury STR (short-term rental) command center for Josh & Kerry's beach house at 6401 Broward Street, St. Augustine, FL 32080. Single-page React app, **6 tabs**: Dashboard, Tasks, Design (finish selections), **Purchases** (what we actually bought), Executive Brief, Podcast Intel. Deployed on Vercel; Upstash Redis for shared state; private Vercel Blob for receipts.

> **Architecture note (2026-07):** the app grew a **multi-property foundation**, a full **Purchases** feature (with receipts + Exhibit B allowance reconciliation + Design→Purchase promote), and **cost-seg capture + CPA export**. This guide reflects that. If something here contradicts the code, the code wins — fix this file.

## URL Structure & Auth
- **Root** (`poolandpaddle.com/`) — branded "Coming Soon" placeholder (`public/coming-soon.html`)
- **Admin app** (`poolandpaddle.com/admin`) — the SPA, requires login
- **Login / Logout** (`/admin/login`, `/admin/logout`) — user selector (Josh/Kerry) + password
- **API** (`/api/*`) — protected, returns 401 JSON if unauthenticated
- **Auth cookies**: `pp_session` (HttpOnly, `USERNAME:hash`) + `pp_user` (JS-readable, `JM`|`KM`)
- **Access model**: a **2-person SHARED account** — Josh and Kerry both see *all* data. There is no per-user ownership; being logged in as JM/KM is the complete authorization model. (Don't add "property ownership" checks — there's nothing to segment.)
- **Local dev**: auth bypassed when no password env vars are set. `vite dev` does NOT run the `/api/*` functions and can't reach Redis/Blob — so runtime persistence + receipts can only be tested on a deploy. Verify logic with `npm test` + `npm run build`.

## Architecture
- **Single-file UI**: nearly everything is `src/App.jsx` (~4,000 lines) — all components/state/styling inline. **Exception:** pure, non-UI domain logic lives in `src/lib/purchases-logic.js` (purchase/cost-seg constants, `suggestAssetClass`, `buildCostSegCsv`, `emptyPurchase`, `fmtUSD`) so it's unit-testable in node. API routes share `api/_scope.js` (`scopedKey`, `migrateData`, `parseReceiptPathname`). Keep new *pure* helpers in these libs; keep UI/browser code in `App.jsx`.
- **No routing**: tab switching via `activeView` state.
- **Design tokens**: colors/fonts in the `C` object + `font` var at top of `App.jsx`. Use them — never hardcode colors. Accent: `C.mint`/`C.seafoam`.
- **Inline styles only**: no CSS files, no UI libraries.
- **Static data files**: `src/*.json` (podcast, exec-summary, tools, finishes) imported statically.

## Multi-property (the data is scoped per property)
- A **`properties` registry** in Redis: `{ schemaVersion:'v2', activeId, properties:[{ id, name, address, inServiceDate }] }`. Only one property exists today (`pp` = "Pool & Paddle"); the foundation supports N but there is **no "add property" UI yet**.
- Per-property Redis keys: `tasks:<id>`, `finishes:<id>`, `purchases:<id>`. The **legacy global keys `tasks`/`finishes` are kept forever as backup** (never deleted).
- `activeProperty` state (App). **When `activeProperty` is null (pre-migration), the app reads/writes the LEGACY global keys** — `apiUrl()`/`lsKey()`/`scopedKey()` omit the property → base key. Never emit `property=null`.
- **Migration** (`api/migrate.js`, one-time, server-side, backup-gated): a modal makes the owner download a full backup, then `POST /api/migrate` copies legacy → `:pp` **verbatim (incl. `deletedIds`)**. NX-locked + write-then-stamp (registry written last) → idempotent, safe against interruption/concurrency. Already run on prod.

## Persistence — CRITICAL rules (don't regress these)
- Redis is source of truth; **localStorage is a per-property cache**; server writes are gated by a `serverLoaded` ref so defaults never clobber server data on load.
- **Tasks & finishes**: whole-payload debounced (500 ms) PUT. Their SAVE effects **deliberately OMIT `activeProperty` from the dep array** (with an eslint-disable + comment). This is intentional: firing on a bare property switch would write the *previous* property's in-memory data under the *new* key. Do **not** "fix" this by adding `activeProperty`.
- **Fetch effects** reset the `serverLoaded` ref + use a per-run `isCancelled` guard (cleanup sets it) so an out-of-order resolution after a rapid property switch can't apply under the wrong key; on a switch they load that property's cache first.
- **Purchases**: stored as a Redis **HASH** (`purchases:<id>`, field = purchase id). Every mutation is a **targeted single-record op** — `PUT` = `HSET` one field (add/edit), `DELETE` = `HDEL` one field (+ `del()`s its receipt blobs). **Never** whole-array PUT purchases (that reintroduces a concurrency race). The localStorage purchases cache is local-only.
- **Merge functions**: `mergeTasks()` (in `App.jsx`) / `mergeFinishes()` (pure, in `src/lib/design-logic.js` — takes `(saved, deletedIds, defaults)`) reconcile saved data with defaults; user-created items (`userCreated:true`) appended after defaults; `ROOM_MIGRATION`/`migrateRoom()` remap old room ids. **`mergeFinishes` rebuilds each default item from the catalogue and copies back a whitelist of saved fields — that whitelist MUST include every user-editable field (`item` name, `category`, room, selection, price, qty, unit, url, notes, linkedTo, assignee, dueDate). A field missing from the whitelist silently reverts on reload** (see 2026-07 historical fix).

## API Routes (Vercel Serverless — `api/*.js`)
- `tasks.js`, `finishes.js` — GET/PUT, `?property=<id>` scoped (absent → legacy global key), via `scopedKey`.
- `properties.js` — GET/PUT the registry (validates string + unique ids).
- `migrate.js` — POST, one-time legacy→per-property migration (see above).
- `backup.js` — GET, full snapshot of every key (legacy + per-property + purchases hash). Wired to a **permanent "Download full backup"** button.
- `purchases.js` — GET (`HGETALL`) / PUT (`HSET`) / DELETE (`HDEL` + receipt-blob cleanup), `?property=` scoped.
- `receipts-upload.js` — POST, server-side upload to the **private** Blob store (base64 in, size/type capped, token stays server-side).
- `receipts-view.js` — GET `?pathname=`, streams a private receipt after validating the pathname shape AND that it's referenced by a real purchase (defense-in-depth).
- `receipts-delete.js` — POST, deletes one receipt blob (best-effort, on receipt removal).
- `keepalive.js` — weekly cron ping (auth-exempt) to prevent Upstash free-tier archival.
- `_scope.js` — shared pure helpers (not a route; `_`-prefixed).
- `middleware.js` — per-user auth (JM/KM), gates `/admin/*` + `/api/*` (except keepalive). Matcher `['/', '/admin', '/admin/:path*', '/api/:path*']`.

## Redis / Upstash
- DB `upstash-kv-citrine-cushion`. Uses `PP_REDIS_URL` + `PP_REDIS_TOKEN` (NOT `Redis.fromEnv()`; the old `KV_REST_API_*` integration vars point at a dead DB).
- **Keys**: `properties`, `tasks`/`finishes` (legacy backup), `tasks:<id>`/`finishes:<id>`, `purchases:<id>` (hash), `migration:lock` (transient).
- **Keepalive cron** (`vercel.json`): `/api/keepalive` Mondays 09:00 UTC — free tier deletes after 14 days idle.

## Design & Purchases data models
- **Design item** (`finishes:<id>`): `id, category, room, item, contractorOptions[], selection, unitPrice, quantity, unit, url, notes, userCreated, linkedTo, assignee, dueDate`. Linked items (`linkedTo`) inherit selection/unitPrice/unit/url from the parent; `resolveItem()` resolves them. 11 trade categories, 20 rooms, ~161 default items. Per-room `roomData[roomId] = { miroUrl, furniture:[{ id,name,price,url,notes,purchased }] }`.
- **Promote** (non-destructive): "Mark as purchased" on a Design item (or a room-furniture item) creates a Purchase pre-filled from it and opens it on the Purchases tab; the design/furniture entry is never changed (a `finishItemId`/`furnitureId` links them; promoted items show a ✓).
- **Copy to rooms** (Design tab, expanded row): fan one finish item out to multiple rooms at once — **Independent copies** (standalone, `linkedTo:null`) or **Linked** children (`linkedTo` = root parent id, inheriting selection/price via `resolveItem`; copying from an already-linked child re-points to the root, never a 2-level chain). Pure logic (`buildRoomCopies`, plus the search matcher `matchesFinishSearch`) lives in `src/lib/design-logic.js`. The Design filter bar also has a **free-text search box** (matches item name/selection/notes/url).
- **Purchase** (`purchases:<id>` hash): mirrors the Excel tracker — `id, finishItemId, furnitureId, description, trade, room, vendor, invoiceNo, purchasedBy, ownerPurchased, paymentMethod, qty, unitPrice, tax, shipping, totalPaid, allowanceCategory, status, purchaseDate, receivedDate, placedInServiceDate, assetClass, section, warranty, warrantyTerm, registered, binderPocket, receipts:[{pathname,name,contentType,uploadedAt}], notes, userCreated`. Constants + `emptyPurchase()` in `src/lib/purchases-logic.js`.
- **Allowance reconciliation**: Exhibit B allowances ($446k across 11 categories, constants in the lib) vs. spend tagged per category, on the Purchases tab.
- **Cost-seg** (Phase 3): `assetClass` (auto-suggested from trade via `suggestAssetClass`, overridable), `placedInServiceDate` (defaults from the property's `inServiceDate`), `section` (§1245/1250, **blank by default — never guessed**). "Export Cost Seg CSV" (`buildCostSegCsv`) groups by asset class with subtotals; labeled "suggested — confirm with CPA."

## Receipts (private Vercel Blob)
- Store is **Private** (irreversible per-store) — required; `access:'private'` uploads/reads. Env: `BLOB_READ_WRITE_TOKEN` (server-side only). Upload is server-side (base64 → `put()`), so the token never reaches the client; **all images (incl. iPhone HEIC/HEIF) are converted to JPEG client-side** via canvas (Vercel functions have a 4.5 MB body limit); non-decodable images throw a `ReceiptUploadError` with an actionable message; PDFs pass through with a client size pre-check. `api/receipts-upload.js` accepts only `png/jpe?g/webp/gif + pdf` (no `heic/heif`). Pathnames: `receipts/<propertyId>/<purchaseId>/<file>`. Purchases store the **pathname**, not a public URL.
- **Mobile capture (`ReceiptUploader`, 2026-07):** TWO triggers — primary "Choose photo or file" (**no `capture`**, `multiple`) for library/Files/PDF, plus a separate "Take photo" (`capture="environment"`). Never put `capture` back on the primary trigger (it removes the library/PDF option on Android). Timeout + Retry on upload; `viewablePaths` gates view links to persisted receipts only (the view route 404s until the purchase references the pathname).
- **Deferred receipt commit in `PurchaseForm`** (new *and* edit): attaching/removing a receipt only mutates form state; the receipt array commits to Redis **once, on Save**. Do **not** persist receipts immediately from an open form — an earlier version did and it raced the field-edit Save, silently reverting edits (a same-record variant of the whole-array race). Uploaded-but-uncommitted blobs are reconciled on Save and on form teardown (unless a draft still holds them). The **saved expanded row** (not a form) still persists receipts immediately — that path never runs concurrently with an open edit form. See `docs/known-issues.md` → "2026-07 mobile pass".

## Setup / infra
Required env (all in Vercel; see `.env.example` for names): `PP_REDIS_URL`, `PP_REDIS_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `VITE_GOOGLE_MAPS_KEY`, `JM_PASSWORD`, `KM_PASSWORD`. Local `.env` typically has only the Maps key. Blob store must be **Private**.

## Build, test & deploy
```bash
npm run dev     # local dev at localhost:5173 (auth bypassed; no /api or Redis/Blob)
npm run build   # production build → dist/ (the compile gate; there is no lint step)
npm test        # node logic checks: scripts/verify-phase1-logic.mjs + verify-logic.mjs
git push        # main auto-deploys to Vercel
```
See `docs/known-issues.md` for consciously-deferred tradeoffs, and `docs/codebase-guide.md` for the deeper architecture reference.

## Conventions
- Commit messages: imperative mood, 1–2 sentence what+why. Co-author tag on commits.
- Assignees: JM = Josh Martin, KM = his wife Kerry.
- Date inputs: visible native `<input type="date">` — never the invisible-overlay (`opacity:0`) pattern (breaks in Safari).
- Clickable controls: `<button>`, not `<div onClick>` (divs can silently fail).
- Mobile: always give touch alternatives for hover-only UI. Keep focusable inputs **≥16px** (below that iOS Safari zooms the page on focus); never add `maximum-scale` to the viewport (breaks pinch-zoom / accessibility).
- Keep UI in `App.jsx` (inline styles, `C` tokens); only *pure* non-UI helpers go in `src/lib/` or `api/_scope.js`.

## Historical fixes (don't reintroduce)
- **2026-04-15**: Upstash free tier deleted the DB after 14 days idle → keepalive cron + explicit `PP_REDIS_*` vars.
- **2026-02-19**: stale-closure fetch effects; orphaned linked items on parent delete; silent save failures (→ red sync banner); cookie parsing; empty localStorage catch blocks.
- **2026-07**: property-switch clobber (fetch cancellation guard + save effects omit `activeProperty`); receipt `name`/`fileName` mismatch; promote double-fire guard. See git history + `docs/known-issues.md`.
- **2026-07 (finish name/category revert)**: `mergeFinishes` copied back only a whitelist of saved fields onto default items and **omitted `item` (name) and `category`** → renaming/recategorizing a *default* finish item saved to Redis but reverted to the catalogue value on the next load (and made the Design CSV export + concurrent edits look like "nothing saved"). Fixed by adding `item`/`category` to the whitelist; `mergeFinishes` extracted to `src/lib/design-logic.js` with a regression test. **Any new user-editable finish field must be added to the whitelist.** (Note: this is distinct from the still-open whole-array last-writer-wins race on simultaneous finishes edits — see `docs/known-issues.md`.)
- **2026-07 (mobile pass, PR #1)**: `capture="environment"` was on the only receipt input → Android couldn't pick an existing photo/PDF (fixed: two triggers, primary without `capture`); HEIC bypassed compression → size-rejected (fixed: all images → JPEG); immediate whole-record receipt persist from an open edit form raced the Save and could revert field edits (fixed: deferred commit-on-Save). Also: sub-16px inputs (iOS zoom), tiny touch targets, hover-only task delete on touch. **Don't reintroduce any of these.** See `docs/known-issues.md` → "2026-07 mobile pass".
