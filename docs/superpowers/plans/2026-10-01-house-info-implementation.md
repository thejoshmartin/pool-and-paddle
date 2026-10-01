# House Info Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 7th "House Info" tab that lets Josh and Kerry record and quickly find house reference data — utility accounts, Tax ID, insurance policies, access codes, vendor contacts, including real login credentials — with masked/reveal/copy fields on screen.

**Architecture:** New Redis HASH `house-info:<propertyId>` with targeted per-record `HSET`/`HDEL` (same discipline as Purchases), a new `api/house-info.js` route that server-side whitelists/validates every field before storing, a pure `src/lib/house-info-logic.js` module (constants + id/empty-item/search/sanitize helpers, unit-tested), and a new `HouseInfoView`/`HouseInfoForm` pair in `src/App.jsx` modeled on the existing `PurchasesView`/`PurchaseForm` pattern but without a localStorage cache or per-field autosave.

**Tech Stack:** React 18 (no router, single-file UI in `src/App.jsx`), Vercel serverless functions (`api/*.js`), Upstash Redis (`@upstash/redis`), plain Node `assert` test scripts (no test framework).

**Spec:** `docs/superpowers/specs/2026-10-01-house-info-design.md`

## Global Constraints

- Every mutation is a targeted single-record `HSET`/`HDEL` — never a whole-array/whole-blob PUT.
- `api/house-info.js` requires `?property=`; 400s if missing (no bare-key fallback, unlike tasks/finishes/purchases).
- `updatedAt`/`updatedBy` are always server-stamped and overwrite any client-supplied value; `updatedBy` is parsed from the verified `pp_session` cookie, never the unsigned `pp_user` cookie.
- No localStorage cache for House Info (credentials must not be cached client-side); a brief loading state replaces it.
- Credentials (`password`/`accountNumber`) are intentionally **not** redacted from `api/backup.js`'s full-snapshot download — a stated, conscious tradeoff, not an oversight.
- Form edits commit on an explicit Save action only — never per-field blur/autosave.
- The `url` field renders as a clickable link only when it starts with `http://` or `https://`; otherwise it renders as plain text.
- `HOUSE_INFO_CATEGORIES` = `["Utility", "Legal & Financial", "Access & Security", "Vendor & Service", "Other"]`.
- Mobile inputs stay ≥16px font-size (prevents iOS Safari auto-zoom); all clickable controls are `<button>`, never `<div onClick>`.
- `GET /api/house-info` responds with `Cache-Control: no-store` (the response carries credentials).

## Review Focus

- **"Add" enabled with no usable property** → `apiUrl()` omits `?property=`, the route 400s, but the UI's existing optimistic-update pattern would still show the item as "saved" until the next reload silently drops it. Fix: gate "Add" on `houseInfoLoaded && !!activeProperty`, not just `houseInfoLoaded`. (Task 3)
- **An item whose `category` isn't one of today's `HOUSE_INFO_CATEGORIES`** (a future category rename/removal) silently vanishing from the grouped view, because a naive render loop only iterates the known category list. Fix: a pure, unit-tested `groupHouseInfoByCategory()` that appends any category actually present in the data to the display order. (Task 1 test + Task 3 usage)
- **A failed `PUT` after the optimistic local update** — confirm the existing `syncError` banner actually fires and that a subsequent reload reflects the server's real (unsaved) state, not the optimistic one. (Task 3, manual checklist)
- **Copy-to-clipboard silently doing nothing** when `navigator.clipboard` is unavailable or the browser denies permission, leaving the user thinking the button is broken. Fix: fall back to `window.prompt` so the value is still accessible. (Task 3, manual checklist)
- **A `url` value like `javascript:alert(1)` saved via a future agent/API call that bypasses the form** — must render as inert plain text, not a clickable link, at render time (not just "well-behaved UI input"). (Task 3, manual checklist, tested explicitly with this exact string)

Two of the five (the unrecognized-category case and the no-active-property case) are defensive fixes for conditions that can't currently be reproduced against the live app: the API itself already rejects any category outside `HOUSE_INFO_CATEGORIES` (so no stored item can have an invalid one today — the fix only matters after a *future* category rename leaves old data behind), and `activeProperty` is always set in production since migration already ran. The category-grouping case still gets a real unit test (below) by extracting the grouping into a pure, testable function; the no-active-property case is a one-line, self-evidently-correct guard (`houseInfoLoaded && !!activeProperty`) verified by code review rather than a contrived manual step.

---

### Task 1: Pure logic — `src/lib/house-info-logic.js`

**Files:**
- Create: `src/lib/house-info-logic.js`
- Modify: `scripts/verify-logic.mjs`

**Interfaces:**
- Consumes: nothing (new module).
- Produces (used by Tasks 2 and 3):
  - `HOUSE_INFO_CATEGORIES: string[]`
  - `newHouseInfoId(): string`
  - `emptyHouseInfoItem(): { id, category, name, accountNumber, username, password, url, phone, notes, updatedAt, updatedBy }`
  - `matchesHouseInfoSearch(item, term): boolean`
  - `sanitizeHouseInfoItem(raw, { updatedAt, updatedBy }): { ok: true, item } | { ok: false, error: string }`
  - `groupHouseInfoByCategory(items): { order: string[], groups: { [category]: items[] } }`

- [ ] **Step 1: Write the failing tests**

Add this import alongside the existing ones near the top of `scripts/verify-logic.mjs` (do not remove the existing `design-logic.js`/`purchases-logic.js`/`_scope.js` imports):

```js
import {
  HOUSE_INFO_CATEGORIES, newHouseInfoId, emptyHouseInfoItem,
  matchesHouseInfoSearch, sanitizeHouseInfoItem, groupHouseInfoByCategory,
} from '../src/lib/house-info-logic.js';
```

Then append this block immediately before the final `console.log(\`\nAll ${passed} checks passed.\`);` line at the end of the file:

```js
console.log('\nhouse-info-logic:');
{
  assert.deepEqual(HOUSE_INFO_CATEGORIES, ['Utility', 'Legal & Financial', 'Access & Security', 'Vendor & Service', 'Other']);
  ok('HOUSE_INFO_CATEGORIES has the 5 expected categories, in order');

  const id1 = newHouseInfoId();
  const id2 = newHouseInfoId();
  assert.match(id1, /^hi-[a-z0-9-]+$/);
  assert.notEqual(id1, id2);
  ok('newHouseInfoId() matches the expected shape and is unique per call');

  const item = emptyHouseInfoItem();
  const expectedKeys = ['id', 'category', 'name', 'accountNumber', 'username', 'password', 'url', 'phone', 'notes', 'updatedAt', 'updatedBy'];
  for (const k of expectedKeys) assert.ok(k in item, `missing field: ${k}`);
  assert.match(item.id, /^hi-[a-z0-9-]+$/);
  assert.equal(item.category, '');
  assert.equal(item.name, '');
  assert.equal(item.updatedAt, null);
  assert.equal(item.updatedBy, null);
  ok('emptyHouseInfoItem() has all expected fields with blank/null defaults');

  const fpl = { id: 'hi-1', category: 'Utility', name: 'FPL Electric', accountNumber: '12345', username: '', password: '', url: '', phone: '', notes: 'Call before 5pm', updatedAt: null, updatedBy: null };
  assert.equal(matchesHouseInfoSearch(fpl, ''), true);
  assert.equal(matchesHouseInfoSearch(fpl, 'fpl'), true);
  assert.equal(matchesHouseInfoSearch(fpl, 'UTILITY'), true);
  assert.equal(matchesHouseInfoSearch(fpl, '12345'), true);
  assert.equal(matchesHouseInfoSearch(fpl, 'before 5pm'), true);
  assert.equal(matchesHouseInfoSearch(fpl, 'insurance'), false);
  ok('matchesHouseInfoSearch() matches name/category/accountNumber/notes, case-insensitive; blank term matches all');

  const stamp = { updatedAt: '2026-10-01T00:00:00.000Z', updatedBy: 'JM' };
  const raw = {
    id: 'hi-abc123', category: 'Utility', name: 'FPL Electric',
    accountNumber: 98765, username: 'josh@example.com', password: 'hunter2',
    url: 'https://fpl.com', phone: '9045551234', notes: 'n',
    updatedAt: '2000-01-01T00:00:00.000Z', updatedBy: 'KM',   // client-supplied — must be overwritten
    evil: '<script>alert(1)</script>',                          // unknown field — must be dropped
  };
  const r1 = sanitizeHouseInfoItem(raw, stamp);
  assert.equal(r1.ok, true);
  assert.deepEqual(Object.keys(r1.item).sort(), ['accountNumber','category','id','name','notes','password','phone','updatedAt','updatedBy','url','username'].sort());
  assert.equal(r1.item.accountNumber, '98765');     // coerced to string
  assert.equal(r1.item.updatedAt, stamp.updatedAt); // server stamp wins
  assert.equal(r1.item.updatedBy, stamp.updatedBy); // server stamp wins
  assert.equal('evil' in r1.item, false);           // unknown field dropped
  ok('sanitizeHouseInfoItem() whitelists fields, coerces to strings, and always overwrites updatedAt/updatedBy with the server-provided stamp');

  assert.equal(sanitizeHouseInfoItem({ ...raw, id: 'not-valid-id' }, stamp).ok, false);
  assert.equal(sanitizeHouseInfoItem({ ...raw, id: 'HI-ABC' }, stamp).ok, false);
  ok('sanitizeHouseInfoItem() rejects an id that does not match /^hi-[a-z0-9-]+$/');

  assert.equal(sanitizeHouseInfoItem({ ...raw, category: 'Not A Real Category' }, stamp).ok, false);
  ok('sanitizeHouseInfoItem() rejects a category outside HOUSE_INFO_CATEGORIES');

  assert.equal(sanitizeHouseInfoItem({ ...raw, name: '' }, stamp).ok, false);
  assert.equal(sanitizeHouseInfoItem({ ...raw, name: '   ' }, stamp).ok, false);
  ok('sanitizeHouseInfoItem() rejects a blank/whitespace-only name');

  const items = [
    { id: 'a', category: 'Utility', name: 'FPL' },
    { id: 'b', category: 'Other', name: 'Spare key' },
    { id: 'c', category: 'Vintage Category', name: 'Old thing' }, // not in HOUSE_INFO_CATEGORIES
  ];
  const { order, groups } = groupHouseInfoByCategory(items);
  assert.deepEqual(order.slice(0, HOUSE_INFO_CATEGORIES.length), HOUSE_INFO_CATEGORIES);
  assert.deepEqual(order.slice(HOUSE_INFO_CATEGORIES.length), ['Vintage Category']);
  assert.equal(groups['Utility'].length, 1);
  assert.equal(groups['Other'].length, 1);
  assert.equal(groups['Vintage Category'].length, 1);
  assert.equal(groupHouseInfoByCategory([]).order.join(','), HOUSE_INFO_CATEGORIES.join(','));
  ok('groupHouseInfoByCategory() orders every known category first, then any unrecognized category present in the data, so an item can never silently disappear just because its category fell out of the official list');
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node scripts/verify-logic.mjs`
Expected: fails immediately with a module-not-found error for `../src/lib/house-info-logic.js` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/house-info-logic.js`:

```js
/**
 * Pure, non-UI logic for the House Info tab — no React, no browser APIs — so it can be
 * unit-tested in plain node (see scripts/verify-logic.mjs) and reused by App.jsx and
 * api/house-info.js.
 */

export const HOUSE_INFO_CATEGORIES = [
  "Utility", "Legal & Financial", "Access & Security", "Vendor & Service", "Other",
];

const HOUSE_INFO_ID_RE = /^hi-[a-z0-9-]+$/;
const HOUSE_INFO_STRING_FIELDS = ["accountNumber", "username", "password", "url", "phone", "notes"];

export function newHouseInfoId() {
  return `hi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyHouseInfoItem() {
  return {
    id: newHouseInfoId(), category: "", name: "", accountNumber: "",
    username: "", password: "", url: "", phone: "", notes: "",
    updatedAt: null, updatedBy: null,
  };
}

/**
 * True if `term` matches the item's name, category, notes, or account number.
 * Case-insensitive. A blank/whitespace-only term matches everything.
 */
export function matchesHouseInfoSearch(item, term) {
  const t = (term || "").trim().toLowerCase();
  if (!t) return true;
  const haystack = [item.name, item.category, item.notes, item.accountNumber]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(t);
}

/**
 * Validate + whitelist a client-submitted house-info item before it is stored. Only the
 * known fields survive (anything else, e.g. an unexpected extra key, is dropped); string
 * fields are coerced to strings; `updatedAt`/`updatedBy` are ALWAYS taken from `stamp`
 * (the server-computed values), never from `raw`, even if `raw` includes them.
 * Returns { ok: true, item } or { ok: false, error }.
 */
export function sanitizeHouseInfoItem(raw, stamp) {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Expected an item object" };
  if (typeof raw.id !== "string" || !HOUSE_INFO_ID_RE.test(raw.id)) {
    return { ok: false, error: "Invalid id" };
  }
  if (!HOUSE_INFO_CATEGORIES.includes(raw.category)) {
    return { ok: false, error: "Invalid category" };
  }
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    return { ok: false, error: "name is required" };
  }
  const item = { id: raw.id, category: raw.category, name: raw.name };
  for (const f of HOUSE_INFO_STRING_FIELDS) item[f] = String(raw[f] ?? "");
  item.updatedAt = stamp.updatedAt;
  item.updatedBy = stamp.updatedBy;
  return { ok: true, item };
}

/**
 * Group items by category for display. Returns { order, groups }: `order` lists every
 * category in HOUSE_INFO_CATEGORIES first, then any category actually present in `items`
 * that ISN'T in that list (sorted) — so an item never silently disappears from a grouped
 * view just because its category fell out of the current official list (e.g. after a
 * future category rename or removal).
 */
export function groupHouseInfoByCategory(items) {
  const groups = {};
  for (const item of items) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  const extra = Object.keys(groups).filter(c => !HOUSE_INFO_CATEGORIES.includes(c)).sort();
  const order = [...HOUSE_INFO_CATEGORIES, ...extra];
  return { order, groups };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node scripts/verify-logic.mjs`
Expected: `house-info-logic:` section prints all 9 `✓` lines, and the file ends with `All N checks passed.` (N = previous total + 9).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: both `verify-phase1-logic.mjs` and `verify-logic.mjs` pass with no failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/house-info-logic.js scripts/verify-logic.mjs
git commit -m "$(cat <<'EOF'
feat(house-info): add pure logic lib (id/empty-item/search/sanitize)

Unit-tested helpers for the new House Info tab, following the
purchases-logic.js/design-logic.js convention. sanitizeHouseInfoItem
whitelists fields and always overwrites updatedAt/updatedBy with the
server-provided stamp, since this record will hold credentials.
groupHouseInfoByCategory keeps an item visible even if its category
later falls out of HOUSE_INFO_CATEGORIES.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: API route — `api/house-info.js` + `api/backup.js` coverage

**Files:**
- Create: `api/house-info.js`
- Modify: `api/backup.js`

**Interfaces:**
- Consumes: `sanitizeHouseInfoItem` from `../src/lib/house-info-logic.js` (Task 1); `scopedKey` from `./_scope.js` (existing).
- Produces (used by Task 3):
  - `GET /api/house-info?property=<id>` → `200 [...items]` (array) with `Cache-Control: no-store`; `400` if `property` missing/invalid.
  - `PUT /api/house-info?property=<id>` body = raw item object → `200 { ok: true, item }` (the server-stamped item) or `400 { error }`.
  - `DELETE /api/house-info?property=<id>&id=<itemId>` → `200 { ok: true }` or `400 { error }`.
  - `api/backup.js`'s per-property snapshot gains a `houseInfo` field (raw `HGETALL` map).

This repo has no automated test harness for `api/*.js` routes (`vite dev` doesn't run them, and `npm test` only covers `src/lib/*`/`api/_scope.js` pure logic) — correctness here is verified by a syntax check now and the end-to-end manual checklist in Task 3 after deployment.

- [ ] **Step 1: Write `api/house-info.js`**

```js
import { Redis } from '@upstash/redis';
import { scopedKey } from './_scope.js';
import { sanitizeHouseInfoItem } from '../src/lib/house-info-logic.js';

const redis = new Redis({
  url: process.env.PP_REDIS_URL,
  token: process.env.PP_REDIS_TOKEN,
});

// pp_session is HttpOnly but NOT secret-free: its value is `USERNAME:hash`, and
// middleware.js has already verified it before this handler runs. Vercel's Node.js
// serverless runtime parses req.cookies automatically for the plain (req, res) handler
// signature used throughout this repo's api/*.js files (same mechanism that already
// populates req.query/req.body here — no manual Cookie-header parsing needed).
function currentUser(req) {
  const session = req.cookies && req.cookies.pp_session;
  if (!session) return null;
  const sep = session.indexOf(':');
  return sep === -1 ? null : session.slice(0, sep);
}

// House info is a Redis HASH per property (field = itemId, value = JSON) — same targeted-
// write discipline as purchases.js: GET = HGETALL, PUT = HSET one field, DELETE = HDEL one
// field, never a whole-array write. Unlike purchases.js, ?property= is REQUIRED (400s
// without it) — there is no legacy house-info data to fall back to a bare key for, and a
// bare-key fallback would be invisible to api/backup.js, which only enumerates
// `house-info:<id>` per registered property id. Every PUT is whitelisted/validated via
// sanitizeHouseInfoItem (not stored near-verbatim like purchases.js) because this record
// holds credentials and is meant to double as a future agent's data source.
export default async function handler(req, res) {
  const property = req.query.property;
  if (!property || typeof property !== 'string') {
    return res.status(400).json({ error: 'Missing property' });
  }
  const key = scopedKey('house-info', property);
  if (key === null) {
    return res.status(400).json({ error: 'Invalid property id' });
  }

  if (req.method === 'GET') {
    const map = await redis.hgetall(key);
    const list = map
      ? Object.values(map).map((v) => (typeof v === 'string' ? JSON.parse(v) : v))
      : [];
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(list);
  }

  if (req.method === 'PUT') {
    const result = sanitizeHouseInfoItem(req.body, {
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser(req),
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    await redis.hset(key, { [result.item.id]: JSON.stringify(result.item) });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, item: result.item });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Expected id' });
    }
    await redis.hdel(key, id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
```

- [ ] **Step 2: Syntax-check the new route**

Run: `node --check api/house-info.js`
Expected: no output (exit code 0).

- [ ] **Step 3: Add House Info to `api/backup.js`**

In `api/backup.js`, find this block inside the `for (const id of ids)` loop:

```js
    perProperty[id] = {
      tasks: await redis.get(`tasks:${id}`),
      finishes: await redis.get(`finishes:${id}`),
      // finishes are ALSO stored as a per-record hash (field per item/furn/room/budget).
      finishRecords: await redis.hgetall(`finish-records:${id}`),
      // purchases are a Redis hash (field = purchaseId); hgetall returns the full record set.
      purchases: await redis.hgetall(`purchases:${id}`),
    };
```

Replace it with:

```js
    perProperty[id] = {
      tasks: await redis.get(`tasks:${id}`),
      finishes: await redis.get(`finishes:${id}`),
      // finishes are ALSO stored as a per-record hash (field per item/furn/room/budget).
      finishRecords: await redis.hgetall(`finish-records:${id}`),
      // purchases are a Redis hash (field = purchaseId); hgetall returns the full record set.
      purchases: await redis.hgetall(`purchases:${id}`),
      // house info is a Redis hash (field = itemId); includes credentials verbatim — the
      // backup has always been a full, unmasked snapshot (see house-info design spec).
      houseInfo: await redis.hgetall(`house-info:${id}`),
    };
```

- [ ] **Step 4: Syntax-check the modified route**

Run: `node --check api/backup.js`
Expected: no output (exit code 0).

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: succeeds (these are server-only files Vite doesn't bundle, but this is the project's standard gate before every commit).

- [ ] **Step 6: Commit**

```bash
git add api/house-info.js api/backup.js
git commit -m "$(cat <<'EOF'
feat(house-info): add api/house-info.js route; back it up

New Redis-hash-backed route for the House Info tab: GET/PUT/DELETE
with targeted per-record writes, required ?property= (no legacy
bare-key fallback), and server-side field whitelisting via
sanitizeHouseInfoItem so updatedAt/updatedBy can never be spoofed by
the client. api/backup.js now includes the house-info hash per
property so full-snapshot backups stay complete.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: House Info tab — UI and data wiring in `src/App.jsx`

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `HOUSE_INFO_CATEGORIES`, `emptyHouseInfoItem`, `matchesHouseInfoSearch`, `groupHouseInfoByCategory` from `./lib/house-info-logic.js` (Task 1); `GET/PUT/DELETE /api/house-info` from Task 2; existing `apiUrl`, `C`, `font`, `ppInput`, `ppLabel`, `setSyncError`, `activeProperty` already in `App.jsx`.
- Produces: `HouseInfoView`/`HouseInfoForm` components; `saveHouseInfo`/`deleteHouseInfo` handlers; the `"house-info"` nav tab and view-switch branch. Nothing later in the plan consumes these (this is the last code task).

This app has no component-level test harness (no React Testing Library / Jest in `package.json`) — UI correctness here is verified by `npm run build` (the compile gate) plus the manual checklist in Step 9, exactly as the existing Purchases/Finishes tabs were verified (see their own specs' "Testing" sections).

- [ ] **Step 1: Add the import**

Find this line near the top of `src/App.jsx`:

```js
import { matchesFinishSearch, buildRoomCopies, mergeFinishes, finishItemField, furnitureField, roomField, tombstone, BUDGET_FIELD, partitionFinishFields } from "./lib/design-logic.js";
```

Add this line immediately after it:

```js
import { HOUSE_INFO_CATEGORIES, emptyHouseInfoItem, matchesHouseInfoSearch, groupHouseInfoByCategory } from "./lib/house-info-logic.js";
```

- [ ] **Step 2: Add `HouseInfoForm` and `HouseInfoView`**

Find the end of `PurchasesView` — this exact closing (immediately followed by the `MULTI-PROPERTY` section banner):

```js
      })}
    </div>
  );
}

// ─── MULTI-PROPERTY (Phase 1) ────────────────────────────────────────────────
```

Replace it with (inserting the two new components and a section banner between `PurchasesView`'s closing and the `MULTI-PROPERTY` banner):

```js
      })}
    </div>
  );
}

// ─── HOUSE INFO ──────────────────────────────────────────────────────────────
// House reference data (utility accounts, IDs, access codes, vendor contacts) — including
// real login credentials. Persisted server-side as a Redis hash (one field per item) via
// /api/house-info, same targeted-write discipline as Purchases. Deliberately NO localStorage
// cache (unlike Purchases/Tasks/Finishes): caching plaintext credentials client-side is a new
// exposure that outlives logout, so this tab just shows a brief loading state instead. See
// docs/superpowers/specs/2026-10-01-house-info-design.md for the full design rationale.

function HouseInfoForm({ initial, onSave, onCancel, isMobile }) {
  const [d, setD] = useState(initial);
  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  // No draft-recovery to localStorage here (unlike PurchaseForm) — this form can hold a
  // plaintext password, and persisting that to localStorage is exactly the new exposure
  // the design spec rules out.
  const canSave = !!d.category && !!(d.name || "").trim();
  const field = (label, node) => (
    <div style={{ flex: 1, minWidth: isMobile ? "100%" : 160 }}><label style={ppLabel}>{label}</label>{node}</div>
  );
  return (
    <div style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Category", (
          <select style={ppInput} value={d.category} onChange={e => set({ category: e.target.value })}>
            <option value="">—</option>
            {HOUSE_INFO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ))}
        {field("Name", <input autoFocus style={ppInput} value={d.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. FPL Electric" />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Account / policy #", <input style={ppInput} value={d.accountNumber} onChange={e => set({ accountNumber: e.target.value })} />)}
        {field("Phone", <input style={ppInput} value={d.phone} onChange={e => set({ phone: e.target.value })} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Username", <input style={ppInput} value={d.username} onChange={e => set({ username: e.target.value })} />)}
        {field("Password", <input type="password" style={ppInput} value={d.password} onChange={e => set({ password: e.target.value })} autoComplete="new-password" />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Login / payment URL", <input style={ppInput} value={d.url} onChange={e => set({ url: e.target.value })} placeholder="https://…" />)}
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={ppLabel}>Notes</label>
        <textarea style={{ ...ppInput, minHeight: 60, resize: "vertical" }} value={d.notes} onChange={e => set({ notes: e.target.value })} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => onSave(d)} disabled={!canSave} style={{ padding: "12px 18px", minHeight: 44, borderRadius: 8, border: "none", background: canSave ? C.mint : C.border, color: C.white, fontFamily: font, fontSize: 15, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed" }}>Save</button>
        <button onClick={onCancel} style={{ padding: "12px 18px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.textSecondary, fontFamily: font, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

function HouseInfoView({ houseInfo, loaded, onSave, onDelete }) {
  const [editingId, setEditingId] = useState(null);   // id | "new" | null
  const [expandedId, setExpandedId] = useState(null);
  const [query, setQuery] = useState("");
  const [revealedFields, setRevealedFields] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Falls back to window.prompt if the Clipboard API is unavailable or denied (e.g. a
  // non-HTTPS context or a browser permission block), so "Copy" never silently does nothing.
  const copyToClipboard = (text, key) => {
    const done = () => { setCopiedKey(key); setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => window.prompt("Copy:", text));
    } else {
      window.prompt("Copy:", text);
    }
  };

  const copyBtnStyle = { background: "none", border: "none", color: C.mint, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 6px", minHeight: 28 };

  // Shared renderer for both masked (accountNumber/password) and plain (username/phone)
  // fields — maskable controls whether a Reveal/Hide toggle is shown.
  const fieldRow = (itemId, field, label, value, maskable) => {
    if (!value) return null;
    const key = `${itemId}:${field}`;
    const revealed = !maskable || !!revealedFields[key];
    return (
      <div key={field} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.textMuted, minWidth: 90 }}>{label}:</span>
        <span style={{ fontSize: 13, color: C.charcoal, fontFamily: maskable && revealed ? "monospace" : font }}>{revealed ? value : "••••••••"}</span>
        {maskable && (
          <button type="button" onClick={() => setRevealedFields(prev => ({ ...prev, [key]: !prev[key] }))} style={copyBtnStyle}>{revealed ? "Hide" : "Reveal"}</button>
        )}
        <button type="button" onClick={() => copyToClipboard(value, key)} style={copyBtnStyle}>{copiedKey === key ? "Copied!" : "Copy"}</button>
      </div>
    );
  };

  // Only http(s) values render as a clickable link — a saved javascript:-scheme (or any
  // other) value always renders as inert plain text, regardless of how it got there.
  const urlRow = (itemId, value) => {
    if (!value) return null;
    const isLink = /^https?:\/\//i.test(value);
    const key = `${itemId}:url`;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.textMuted, minWidth: 90 }}>Link:</span>
        {isLink
          ? <a href={value} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: C.mint, wordBreak: "break-all" }}>{value}</a>
          : <span style={{ fontSize: 13, color: C.charcoal, wordBreak: "break-all" }}>{value}</span>}
        <button type="button" onClick={() => copyToClipboard(value, key)} style={copyBtnStyle}>{copiedKey === key ? "Copied!" : "Copy"}</button>
      </div>
    );
  };

  const filtered = useMemo(() => {
    const list = houseInfo.filter(item => matchesHouseInfoSearch(item, query));
    return [...list].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [houseInfo, query]);

  // groupHouseInfoByCategory (unit-tested in Task 1) orders every known category first, then
  // any category actually present in the data that isn't in today's HOUSE_INFO_CATEGORIES
  // (e.g. after a future category rename) — so an item never silently disappears just
  // because its category fell out of the official list.
  const { order: categoryOrder, groups: grouped } = useMemo(() => groupHouseInfoByCategory(filtered), [filtered]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.charcoal, margin: 0 }}>House Info</h2>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "4px 0 0" }}>Accounts, IDs, access codes & vendor contacts · {houseInfo.length} saved</p>
        </div>
        {editingId !== "new" && (
          <button
            onClick={() => { setEditingId("new"); setExpandedId(null); }}
            disabled={!loaded}
            style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: loaded ? C.mint : C.border, color: C.white, fontFamily: font, fontSize: 14, fontWeight: 700, cursor: loaded ? "pointer" : "not-allowed" }}
          >+ Add item</button>
        )}
      </div>

      {!loaded && <p style={{ color: C.textMuted, fontSize: 14, textAlign: "center", padding: 32 }}>Loading…</p>}

      {editingId === "new" && (
        <HouseInfoForm
          initial={emptyHouseInfoItem()}
          onSave={(item) => { onSave(item); setEditingId(null); setExpandedId(item.id); }}
          onCancel={() => setEditingId(null)}
          isMobile={isMobile}
        />
      )}

      {loaded && houseInfo.length > 0 && (
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search house info…" style={{ ...ppInput, marginBottom: 16, maxWidth: 320 }} />
      )}

      {loaded && houseInfo.length === 0 && editingId !== "new" && (
        <p style={{ color: C.textMuted, fontSize: 14, textAlign: "center", padding: 32 }}>Nothing saved yet. Click "+ Add item" to log your first account, ID, or access code.</p>
      )}

      {loaded && categoryOrder.map(category => {
        const items = grouped[category] || [];
        if (items.length === 0) return null;
        return (
          <div key={category} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary, textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 10px" }}>{category}</h3>
            {items.map(item => {
              const isOpen = expandedId === item.id;
              const isEditing = editingId === item.id;
              return (
                <div key={item.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
                  <button onClick={() => { setExpandedId(isOpen ? null : item.id); setEditingId(null); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.charcoal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{item.updatedBy ? `Updated by ${item.updatedBy}` : ""}</div>
                    </div>
                  </button>
                  {isOpen && !isEditing && (
                    <div style={{ padding: "0 16px 16px" }}>
                      {fieldRow(item.id, "accountNumber", "Account #", item.accountNumber, true)}
                      {fieldRow(item.id, "username", "Username", item.username, false)}
                      {fieldRow(item.id, "password", "Password", item.password, true)}
                      {fieldRow(item.id, "phone", "Phone", item.phone, false)}
                      {urlRow(item.id, item.url)}
                      {item.notes && <p style={{ fontSize: 13, color: C.textMuted, marginTop: 8 }}>{item.notes}</p>}
                      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <button onClick={() => setEditingId(item.id)} style={{ padding: "10px 18px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.charcoal, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => { if (window.confirm(`Delete "${item.name}"?`)) { onDelete(item.id); setExpandedId(null); } }} style={{ padding: "10px 18px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.ocean, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                      </div>
                    </div>
                  )}
                  {isOpen && isEditing && (
                    <div style={{ padding: "0 16px 16px" }}>
                      <HouseInfoForm
                        initial={item}
                        onSave={(updated) => { onSave(updated); setEditingId(null); }}
                        onCancel={() => setEditingId(null)}
                        isMobile={isMobile}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── MULTI-PROPERTY (Phase 1) ────────────────────────────────────────────────
```

- [ ] **Step 3: Add state + fetch effect in `App()`**

Find this line in `App()`:

```js
  const [purchases, setPurchases] = useState(() => loadPurchasesFromCache(activeProperty));
  const purchasesServerLoaded = useRef(false);
  const purchasesFirstRun = useRef(true);
```

Add immediately after it:

```js
  const [houseInfo, setHouseInfo] = useState([]);
  const [houseInfoLoaded, setHouseInfoLoaded] = useState(false);
```

Then find the end of the purchases fetch effect:

```js
  // Fetch purchases for the active property (same load discipline as tasks/finishes).
  useEffect(() => {
    purchasesServerLoaded.current = false;
    let cancelled = false;
    if (purchasesFirstRun.current) {
      purchasesFirstRun.current = false;
    } else {
      setPurchases(loadPurchasesFromCache(activeProperty));
    }
    fetch(apiUrl('/api/purchases', activeProperty))
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        purchasesServerLoaded.current = true;
        if (Array.isArray(data)) setPurchases(data);
      })
      .catch(() => { if (!cancelled) purchasesServerLoaded.current = true; });
    return () => { cancelled = true; };
  }, [activeProperty]);
```

Add immediately after it:

```js

  // Fetch house info for the active property. api/house-info.js REQUIRES ?property= and
  // 400s without it (there's no legacy data to fall back to), so pre-migration
  // (activeProperty === null) there is nothing to fetch — show an empty, "loaded" list
  // rather than calling an endpoint guaranteed to fail. No localStorage cache to seed from
  // (see the HOUSE INFO section banner above `HouseInfoView`).
  useEffect(() => {
    if (!activeProperty) { setHouseInfo([]); setHouseInfoLoaded(true); return; }
    setHouseInfoLoaded(false);
    let cancelled = false;
    fetch(apiUrl('/api/house-info', activeProperty))
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data)) setHouseInfo(data);
        setHouseInfoLoaded(true);
      })
      .catch(() => { if (!cancelled) setHouseInfoLoaded(true); });
    return () => { cancelled = true; };
  }, [activeProperty]);
```

- [ ] **Step 4: Add `saveHouseInfo`/`deleteHouseInfo` handlers**

Find:

```js
  const changePurchaseReceipts = (id, receipts) => {
    const target = purchases.find(p => p.id === id);
    if (target) savePurchase({ ...target, receipts });
  };
```

Add immediately after it:

```js

  // House info — per-record server mutations (HSET/HDEL one field via api/house-info.js),
  // never a whole-array write. The PUT response carries the server-stamped item (real
  // updatedAt/updatedBy), so a successful save reconciles local state with it immediately
  // instead of waiting for the next reload.
  const saveHouseInfo = (item) => {
    setHouseInfo(prev => (prev.some(h => h.id === item.id)
      ? prev.map(h => (h.id === item.id ? item : h))
      : [...prev, item]));
    fetch(apiUrl('/api/house-info', activeProperty), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    }).then(async (r) => {
      if (!r.ok) { setSyncError('Failed to save house info'); return; }
      setSyncError(null);
      const body = await r.json().catch(() => null);
      if (body && body.item) {
        setHouseInfo(prev => prev.map(h => (h.id === body.item.id ? body.item : h)));
      }
    }).catch(() => setSyncError('Unable to reach server'));
  };
  const deleteHouseInfo = (id) => {
    setHouseInfo(prev => prev.filter(h => h.id !== id));
    const base = apiUrl('/api/house-info', activeProperty);
    const url = base + (activeProperty ? '&' : '?') + 'id=' + encodeURIComponent(id);
    fetch(url, { method: 'DELETE' })
      .then(r => { if (!r.ok) setSyncError('Failed to delete house info'); else setSyncError(null); })
      .catch(() => setSyncError('Unable to reach server'));
  };
  const houseInfoReady = houseInfoLoaded && !!activeProperty;
```

- [ ] **Step 5: Add the nav tab**

Find:

```js
            {[
              { key: "dashboard", label: "Dashboard" },
              { key: "tasks", label: "Tasks" },
              { key: "design", label: "Design" },
              { key: "purchases", label: "Purchases" },
              { key: "summary", label: "Brief" },
              { key: "podcast", label: "Podcast" },
            ].map(v => (
```

Replace with:

```js
            {[
              { key: "dashboard", label: "Dashboard" },
              { key: "tasks", label: "Tasks" },
              { key: "design", label: "Design" },
              { key: "purchases", label: "Purchases" },
              { key: "house-info", label: "House Info" },
              { key: "summary", label: "Brief" },
              { key: "podcast", label: "Podcast" },
            ].map(v => (
```

- [ ] **Step 6: Add the view-switch branch**

Find:

```js
      {activeView === "purchases" && <PurchasesView purchases={purchases} activeProperty={activeProperty} onSave={savePurchase} onDelete={deletePurchase} onReceiptsChange={changePurchaseReceipts} focusPurchaseId={focusPurchaseId} onFocusHandled={handlePurchaseFocusCleared} propertyInServiceDate={activeInServiceDate} onSetInServiceDate={setPropertyInServiceDate} />}
```

Add immediately after it:

```js
      {activeView === "house-info" && <HouseInfoView houseInfo={houseInfo} loaded={houseInfoReady} onSave={saveHouseInfo} onDelete={deleteHouseInfo} />}
```

- [ ] **Step 7: Run the build**

Run: `npm run build`
Expected: succeeds with no errors (this is the project's only compile gate — there is no lint step).

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all checks pass (unaffected by this task, but confirms nothing else broke).

- [ ] **Step 9: Manual checklist (post-deploy — `vite dev` can't reach Redis or run `/api/*`)**

Push this branch (or deploy a preview) and, against the deployed URL, confirm:

1. "House Info" appears as a 7th nav tab, between Purchases and Brief.
2. With no items yet, "+ Add item" is disabled while the tab first loads, then enabled.
3. Add one item per category (all 5): fill Category + Name, optionally the other fields, Save. Each appears under its category heading, grouped and sorted by name.
4. Reload the page — all 5 items persist, each shows "Updated by JM" or "Updated by KM" (whichever user is logged in).
5. Edit an item: open it, click Edit, change a field, click Save — confirm the change persists after reload, and that navigating away *without* clicking Save (Cancel, or switching tabs) does **not** persist the in-progress edit.
6. On an item with an account number and password set: confirm both render masked (`••••••••`) by default, "Reveal" shows the real value, "Hide" re-masks it, and "Copy" copies the value (paste it somewhere to confirm) — or, if clipboard access is blocked by the browser, confirm the `window.prompt` fallback still shows the value.
7. Set `url` to `https://example.com` — confirm it renders as a clickable link. Edit it to `javascript:alert(1)` and confirm it renders as **plain, non-clickable text**, not a link.
8. Delete an item, confirm the browser `confirm()` prompt appears, confirm it disappears after confirming and stays gone after reload.
9. Search box: type a term matching only one item's name/category/notes/account-number — confirm only that item (and its category heading) remains visible; clear the search — confirm everything reappears.
10. Open your browser's DevTools → Application → Local Storage for this site, and confirm there is **no** `house-info`-prefixed key (unlike `pool-paddle-purchases-v1`, which should still be present) — i.e. nothing from this tab is cached client-side.
11. Open DevTools → Network, reload the House Info tab, inspect the `/api/house-info` response headers — confirm `Cache-Control: no-store` is present.
12. Click "Download full backup" (Header) and confirm the downloaded JSON includes a `houseInfo` object for the active property with your saved items (including their account numbers/passwords in plain text — this is the accepted, documented tradeoff).
13. Temporarily break connectivity (e.g. DevTools → Network → offline), attempt to save an edit, confirm the red "Failed to save house info" / "Unable to reach server" banner appears; go back online, retry the save, confirm the banner clears and the edit persists on reload.
14. With your browser's session cookies (copy them from DevTools → Application → Cookies), run `curl -H "Cookie: pp_session=...; pp_user=..." https://<your-deploy>/api/house-info` (no `?property=`) and confirm it returns `400`.
15. *(Not currently testable — there is no "add property" UI yet, per CLAUDE.md's multi-property section.)* Once a second property exists, confirm house info added under one property never appears under another.

- [ ] **Step 10: Commit**

```bash
git add src/App.jsx
git commit -m "$(cat <<'EOF'
feat(house-info): add the House Info tab (UI + data wiring)

New 7th nav tab backed by /api/house-info: category-grouped list,
free-text search, inline add/edit with explicit-Save commit (no
per-field autosave), masked/reveal/copy for account numbers and
passwords, http(s)-only link rendering, and no localStorage cache
(credentials must not be cached client-side). "Add" stays disabled
until the initial load resolves AND a property is active, so a save
attempt can never silently fail against a route that requires
?property=.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Documentation — `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing (doc-only).
- Produces: nothing consumed by other tasks (this is the last task).

- [ ] **Step 1: Update the tab count**

Find:

```
Luxury STR (short-term rental) command center for Josh & Kerry's beach house at 6401 Broward Street, St. Augustine, FL 32080. Single-page React app, **6 tabs**: Dashboard, Tasks, Design (finish selections), **Purchases** (what we actually bought), Executive Brief, Podcast Intel. Deployed on Vercel; Upstash Redis for shared state; private Vercel Blob for receipts.
```

Replace with:

```
Luxury STR (short-term rental) command center for Josh & Kerry's beach house at 6401 Broward Street, St. Augustine, FL 32080. Single-page React app, **7 tabs**: Dashboard, Tasks, Design (finish selections), **Purchases** (what we actually bought), **House Info** (utility accounts, IDs, access codes, vendor contacts), Executive Brief, Podcast Intel. Deployed on Vercel; Upstash Redis for shared state; private Vercel Blob for receipts.
```

- [ ] **Step 2: Add the API route bullet and update the backup bullet**

Find:

```
- `backup.js` — GET, full snapshot of every key (legacy + per-property + `finish-records` + purchases hashes). Wired to a **permanent "Download full backup"** button.
- `purchases.js` — GET (`HGETALL`) / PUT (`HSET`) / DELETE (`HDEL` + receipt-blob cleanup), `?property=` scoped.
```

Replace with:

```
- `backup.js` — GET, full snapshot of every key (legacy + per-property + `finish-records` + purchases + `house-info` hashes). Wired to a **permanent "Download full backup"** button.
- `purchases.js` — GET (`HGETALL`) / PUT (`HSET`) / DELETE (`HDEL` + receipt-blob cleanup), `?property=` scoped.
- `house-info.js` — GET (`HGETALL`) / PUT (`HSET`, server-whitelists fields via `sanitizeHouseInfoItem` and stamps `updatedAt`/`updatedBy`) / DELETE (`HDEL`). `?property=` is **required** (400s without it — unlike every other route here, there's no legacy data to fall back to). Response sets `Cache-Control: no-store` (carries credentials).
```

- [ ] **Step 3: Add the Redis key**

Find:

```
- **Keys**: `properties`, `tasks`/`finishes` (legacy backup), `tasks:<id>`, `finishes:<id>` (frozen legacy blob backup), `finish-records:<id>` (hash — live finishes), `purchases:<id>` (hash), `migration:lock` / `finishes-hash-migration:lock:<key>` (transient).
```

Replace with:

```
- **Keys**: `properties`, `tasks`/`finishes` (legacy backup), `tasks:<id>`, `finishes:<id>` (frozen legacy blob backup), `finish-records:<id>` (hash — live finishes), `purchases:<id>` (hash), `house-info:<id>` (hash), `migration:lock` / `finishes-hash-migration:lock:<key>` (transient).
```

- [ ] **Step 4: Add a House Info persistence bullet and data-model section**

Find the end of the Finishes bullet in the "Persistence — CRITICAL rules" section:

```
- **Finishes**: stored as a Redis **HASH** (`finish-records:<id>`) with one field per editable unit — `item:<id>`, `furn:<roomId>:<furnId>`, `room:<roomId>`, `budget`, and `item:<id>` **deletion tombstones** (`{id,__deleted:true}`). Every mutation is a **targeted single-field `HSET`/`HDEL`** (never a whole-array PUT) so concurrent edits can't clobber. Item writes are debounced per field (400 ms) and flushed on hide/unload (`keepalive`); a delete/tombstone cancels any pending write to the same field first. Load = `HGETALL` → `partitionFinishFields` → `mergeFinishes`. The legacy `finishes:<id>` blob is **frozen as backup** and read only by a one-time, idempotent, server-side migration (`migrateFinishesToHash` in `_scope.js`, run on first GET; never deletes the blob). Pure encode/decode helpers (`blobToFields`/`partitionFinishFields`/field builders) live in `src/lib/design-logic.js`. The route is `api/finish-records.js` (GET/PUT-field/DELETE-field); the localStorage finishes cache is local-only. **Never** reintroduce a whole-array PUT of finishes.
```

Add immediately after it:

```
- **House Info**: stored as a Redis **HASH** (`house-info:<id>`, field = item id). Every mutation is a **targeted single-record op** — `PUT` = `HSET` one field (add/edit, server-validates/whitelists via `sanitizeHouseInfoItem` and **always** overwrites `updatedAt`/`updatedBy` with a server-computed stamp), `DELETE` = `HDEL` one field. **Never** whole-array PUT (same discipline as Purchases). `api/house-info.js` **requires** `?property=` (400s without it — no bare-key fallback, since there's no legacy data). **No localStorage cache** — unlike every other tab, caching this data client-side would persist plaintext credentials past logout, so the tab shows a loading state instead.
```

Find the `## Design & Purchases data models` heading, then its closing blank line before the next `##` heading (`## Receipts (private Vercel Blob)`). Add a new section immediately before `## Receipts (private Vercel Blob)`:

```
## House Info data model
- **House info item** (`house-info:<id>` hash, field = item id, value = JSON record): `id, category, name, accountNumber, username, password, url, phone, notes, updatedAt, updatedBy`. `category` ∈ `HOUSE_INFO_CATEGORIES` (`src/lib/house-info-logic.js`: Utility, Legal & Financial, Access & Security, Vendor & Service, Other).
- **Deliberately NOT like Purchases/Tasks/Finishes:** no localStorage cache (would persist plaintext credentials client-side past logout), and credentials are masked-by-default in the UI (display only, not real access control — same shared JM/KM trust model as the rest of the app). Credentials are **not** redacted from the full-backup download — a stated, conscious tradeoff. See `docs/superpowers/specs/2026-10-01-house-info-design.md` for full rationale.

```

(Leave the trailing blank line before `## Receipts (private Vercel Blob)` so the heading spacing matches the rest of the file.)

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: document the House Info tab in CLAUDE.md

Tab count, api/house-info.js, the house-info:<id> Redis key, its
persistence discipline, and its data model — matching how Purchases
and Finishes are already documented.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
