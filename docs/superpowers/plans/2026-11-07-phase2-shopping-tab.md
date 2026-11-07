# Phase 2: Shopping Tab (list, quantities for 24, landed cost, agent export/import, Print for Kerry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Shopping** tab between Design and Purchases that seeds the whole-house list (sized for 24 guests), compares vendor candidates on total landed cost, tracks approvals/claims, promotes an item into a Purchase, round-trips with the research agent through the §2.9 export/results files, and prints a one-page list for Kerry.

**Architecture:** Same patterns as Purchases/Finishes. A Redis HASH `shopping:<propertyId>` (fields `item:<id>`, `settings`, tombstones) behind `api/shopping.js` (targeted single-field HSET/HDEL, `?property=` required, server-side whitelist sanitize + `updatedAt/updatedBy` stamp). All logic is pure in `src/lib/shopping-logic.js` and tested in `scripts/verify-logic.mjs`. Seed items live in `src/shopping-seed.json` and merge with saved edits like `mergeFinishes` (saved wins, seed fills the rest, user-created kept, tombstones hide deletions). UI is one `ShoppingView` in `src/App.jsx` (inline styles, `C` tokens).

**Tech Stack:** React 18 single-file SPA, Vercel Node functions, Upstash Redis hash, plain-node assert tests, Python 3 (stdlib `csv`) for the master-list parser.

**Spec:** `docs/superpowers/specs/2026-11-07-shopping-receipts-agent-spec.md` (Revision 6, §2 only). Phase 3 is NOT part of this plan. **The §2.9 export/results file formats must not change** (a separate research agent, `pool-paddle-shopping-research`, depends on them; its `references/output-format.md` maps its rows onto `pp-shopping-results/v1` exactly as §2.4/§2.9 describe, so building to the spec as written is compatible).

## Global Constraints

- Shopping data is a Redis **hash** `shopping:<propertyId>`; every write is a targeted single-field `HSET`/`HDEL`; never a whole-hash write. `?property=` **required** (400 without). Add `shopping:<id>` to `api/backup.js`.
- Field names validated by strict regex `^(item:sh-[a-z0-9-]+|settings)$`; tombstone value `{id, __deleted:true}`. Item id format `sh-<ts36>-<rand6>` (seed ids `sh-seed-<slug>`).
- Client cache: localStorage per property via `lsKey`; writes gated by a `serverLoaded` ref; fetch effect with an `isCancelled` guard and its save/cache effects omit `activeProperty` from deps exactly like Purchases/Finishes.
- Tab **Shopping** sits between Design and Purchases (`activeView === "shopping"`).
- Settings defaults (spec §2.2): `guestCount 24, bedrooms 5, bathrooms 5, mealsPerDay 3, washesPerDay 1, dishwashers 1, budgetTarget null, readyDate null, defaultTaxRate 0.065`, `vendorDefaults.amazon {name, transactionFeePct 0, holidayReturnBy "2027-01-31", note}`, `vendorDefaults.minoan {name, transactionFeePct 0.032, taxIncludesFees true, reimbursedBy "Sparrow (Contractor)", note}`, `reimbursableVendors ["Minoan"]`.
- Landed cost (§2.7): `merchandise = unitPrice × qtyToBuy − discount`; `fees = merchandise × transactionFeePct` (candidate value, else vendor default, else 0); `landedTotal = merchandise + shipping + fees + estTax`; blank `estTax` defaults to `defaultTaxRate × (merchandise + fees)` for vendors with `taxIncludesFees`, else `× merchandise`. `retailUnitPrice` is display-only; nothing ranks on percent off retail. Best Value is display-only; a human selects.
- Agent import rules (§2.9): reject wrong schema or mismatched `propertyId`; candidates dedupe on `vendor + (sku || url)` (a duplicate updates price/stock fields and `checkedAt`); new items land `proposed:true`, status `researching`; the agent can **never** set `status` (past shortlisted), `approvedBy`, `claimedBy`, `selectedCandidateId`, `qtyNeeded`/`qtyOverride`, or delete anything (those fields are ignored if present); preview then apply with one targeted HSET per touched item; **forward-compatible**: unknown fields on candidates and items are preserved, only a different major schema (`/v2`) is rejected; importing the same file twice changes nothing.
- Seed from `src/shopping-seed.json` (generated from the §2.6 tables); `scripts/parse-shopping-list.py` turns the master-list spreadsheet (exported to CSV) into the same file. Re-seeding never overwrites decisions already made.
- Landing a purchase from an item: **Mark purchased** pre-fills a Purchase (vendor, description, qty, unit price, trade from §2.5, allowance default, `returnByDate` from the candidate), item status → `ordered`, `purchaseIds` linked, ✓ shown; non-destructive like Design promote. Candidates from a reimbursable vendor show a **"Sparrow reimburses (loan)"** tag; it never changes landed cost or Best Value.
- Print for Kerry: approved + shortlisted items by category (item, qty, chosen vendor, landed total, return-by, notes); inline styles; the button calls `window.print()`; no new libraries.
- UI rules: inline styles + `C` tokens only; `<button>` not `<div onClick>`; inputs ≥16px (`ppInput`); touch targets ≥44px; native visible date inputs.
- Commit messages: imperative, 1–2 sentences, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Gate: `npm test` + `npm run build` + the SSR smoke render (`.superpowers/smoke.mjs` pattern), then Josh verifies persistence/import/print on a Vercel deploy. **Do not push or open a PR without Josh's OK.** Stop before Phase 3.

## Decisions made while planning (Josh: veto any)

1. **Server whitelist vs forward-compat.** `sanitizeShoppingItem`/`Candidate`/`Settings` validate and type every known field but **preserve unknown keys** (except `__proto__`/`constructor`/`prototype`) with a 100 KB per-record cap, so additive agent fields survive a save (§2.1 and §2.9 both hold).
2. `qtyNeeded` stored on an item is never authoritative: `computeQty(item, settings)` is recomputed on read and written fresh into the export bundle.
3. `mealsCovered` groups items by a new item field `dishType` (e.g. "Dinner plates"); the seed sets it on indoor/outdoor pairs. Only items with `usesPerGuestPerDay` count. Owned quantity (once an item has linked non-Returned purchases) replaces `qtyNeeded`. Levels: **green** total/guests ≥ uses ÷ washesPerDay (covers a full day); **amber** ≥ uses ÷ mealsPerDay (covers one meal); **red** below that.
4. `bestValue`: `inStock !== false` counts as in stock (an unknown stock status doesn't disqualify); a missing `deliveryEta` is allowed when `needBy` is set. Ties: lower `returnExposure`, then earlier `deliveryEta`.
5. `restockingPct` is a fraction (0.15 = 15%); a value > 1 is read as a percent. `targetPrice` and the over-target warning are per unit (`unitPrice ÷ packSize`). `qtyToBuy` is packs; per-unit price = landed ÷ (qtyToBuy × packSize).
6. Warning "not open stock" fires for Dinnerware / Flatware / Glassware & Drinkware candidates unless `openStock === true`. The 72-hour stale-price warning applies only Nov 20–Dec 2 of the current year.
7. `forecastSpend` = Σ selected-candidate `landedTotal` for items with no linked purchase and status ≠ `returned` (no selected candidate → 0) + Σ `netCost` of linked purchases.
8. Agent results never change `status`; adding candidates does not auto-advance it. Agent `notes` are appended once to the item's notes as `[agent <generatedAt date>] …` (skipped if already present, so a re-import is a no-op). `agentFlag.flaggedAt` takes the file's `generatedAt`, not "now", so re-importing is idempotent. New items from the agent are deduped against existing items by normalized `name|category` (a repeat adds candidates instead of a duplicate). Unknown categories from the agent land as `Other`.
9. Export `research.tools` = entries of `tools-data.json` in categories Smart Home & Security, Guest Experience, Operations & Cleaning (spec says "procurement-relevant"; no list given). `research.episodes` per §2.9.
10. Extra optional item fields the research agent's skill reads (`qualityTier`, `requirements`, `kerryDecides`) are additive: supported by the pass-through, shown in the expanded item when present, and set by the master-list parser.
11. **Print** opens a new window with generated inline-styled HTML and calls `print()` on it (an app-wide `@media print` would need a stylesheet, which the project forbids). `buildPrintHtml` is pure and escapes every value.
12. The Purchases form's reimbursement default now reads `settings.reimbursableVendors` (Phase 1's constant becomes the fallback); `normalizePurchase`'s legacy-record default still uses the constant because settings aren't loaded at that point.
13. Purchases gain one field, `shoppingItemId` (default `null`), for the two-way link; `CLAUDE.md` data model updated.
14. Seed quantities follow the §2.6 tables as guest-based rules where the table scales with guests (plates, mugs, glasses, flatware: multiplier × guests, rounded up) and `fixed` where it doesn't (serving pieces, kids' cups, steak knives, appliances), so 24 → 20 guests recomputes rule-based quantities but never overrides. Linens/bath seed rows carry `qtyOverride` placeholders per the spec.
15. `parse-shopping-list.py` reads a **CSV export** of the Master List tab (no spreadsheet library dependency) with forgiving header aliases; it can't be validated against the real master list until Josh supplies it, so it ships with a sample fixture and a `--check` mode.

## Review Focus

1. **Idempotent import:** the same results file applied twice produces zero touched items; a file that tries to set `status`, `approvedBy`, `claimedBy`, `selectedCandidateId`, `qtyOverride` changes none of them (Task 7).
2. **Legacy/blank data:** `landedTotal`, `bestValue`, `candidateWarnings`, `computeQty`, `forecastSpend` and `mealsCovered` never throw on items with missing/`null`/string numbers or empty candidate lists (Tasks 1–2).
3. **Seed merge safety:** re-seeding or editing an item never loses a saved edit, resurrects a tombstoned item, or duplicates a user-created item (Task 1).
4. **Server sanitizer:** hostile or malformed fields (bad field name, oversized record, `__proto__` key, wrong id/field mismatch, non-array candidates) are rejected or neutralized, not stored (Tasks 1, 3).
5. **Print safety:** item names/notes containing `<script>` or `&` are escaped in the printed HTML (Task 8).

---

## File Structure

| File | Change |
|---|---|
| `src/lib/shopping-logic.js` | **New.** Constants, ids, empty records, `computeQty`, `mealsCovered`, sanitizers, field helpers + `mergeShopping`, cost logic, warnings, `forecastSpend`, `buildPurchaseFromShopping`, export/import (`buildExportBundle`, `validateResults`, `mergeResults`), `buildPrintHtml` |
| `src/shopping-seed.json` | **New.** Seed items (generated) |
| `scripts/build-shopping-seed.mjs` | **New.** Generates the seed from the §2.6 tables |
| `scripts/parse-shopping-list.py`, `scripts/fixtures/shopping-list-sample.csv` | **New.** Master-list CSV → seed JSON |
| `api/shopping.js` | **New.** GET / PUT-field / DELETE-field |
| `api/backup.js` | Add `shopping` hash |
| `src/lib/purchases-logic.js` | `shoppingItemId` default |
| `src/App.jsx` | Header tab, state/persistence, `ShoppingView`, Mark purchased, Purchases form vendor list, export/import/print wiring |
| `scripts/verify-logic.mjs` | New sections per task |
| `CLAUDE.md`, `docs/known-issues.md` | Document the Shopping tab |

---

### Task 1: Shopping model, quantities, sanitizers, seed merge (pure)

**Files:** Create `src/lib/shopping-logic.js`; Test `scripts/verify-logic.mjs`.

**Interfaces — produces** (exported):
- Constants: `SHOPPING_CATEGORIES` (the 19 names in §2.5's table, in that order: Small Appliances, Cookware & Bakeware, Dinnerware, Flatware, Glassware & Drinkware, Serveware & Entertaining, Kitchen Tools & Utensils, Food Storage, Bar & Coffee, Outdoor / Pool Dining, Linens & Towels, Bath, Cleaning & Laundry, Supplies & Consumables, Game Room & Recreation, Furniture, Electronics & Tech, Safety & First Aid, Other), `CATEGORY_TO_TRADE` (§2.5 mapping to Purchase trades), `ITEM_PRIORITIES = ["launch-critical","launch","nice-to-have"]`, `ITEM_STATUSES = ["researching","shortlisted","approved","ordered","received","kept","returned"]`, `ZONES = ["indoor","outdoor","both"]`, `VENDOR_TYPES = ["amazon","minoan","retail","restaurant-supply","other"]`, `AGENT_ACTIONS = ["buy-now","wait-for-sale","needs-review"]`, `TIERS = ["best-value","upgrade"]`, `NON_GLASS_CATEGORIES = ["Outdoor / Pool Dining"]`, `OPEN_STOCK_CATEGORIES = ["Dinnerware","Flatware","Glassware & Drinkware"]`, `DEFAULT_SHOPPING_SETTINGS` (Global Constraints values).
- `newShoppingItemId(): string` (`sh-<ts36>-<rand6>`), `newCandidateId(): string` (`c-<ts36>-<rand6>`), `emptyShoppingItem(): object` (every §2.3 field with defaults: `zone:"both"`, `usesPerGuestPerDay:null`, `dishType:""`, `qtyRule:{basis:"fixed",multiplier:1,fixedQty:1}`, `qtyOverride:null`, `priority:"launch"`, `status:"researching"`, `candidates:[]`, `selectedCandidateId:null`, `approvedBy:null`, `approvedAt:null`, `claimedBy:null`, `needBy:null`, `targetPrice:null`, `episodes:[]`, `finishItemId:null`, `agentFlag:{action:null,reason:"",flaggedAt:null}`, `suggestedQty:null`, `proposed:false`, `purchaseIds:[]`, `notes:""`, `userCreated:true`, `updatedAt:null`, `updatedBy:null`, plus `name:""`, `category:"Other"`, `room:""`, `qtyNeeded:0`), `emptyCandidate(): object` (every §2.4 field, ids via `newCandidateId`, `source:"JM"`).
- `normalizeShoppingItem(item): object` (= `{ ...emptyShoppingItem(), ...item }` keeping saved `candidates` array/defaults for nested `agentFlag`, no mutation).
- `computeQty(item, settings): number`: `qtyOverride` (non-null) wins; else by `qtyRule.basis`: guests/bedrooms/bathrooms → `ceil(multiplier × settings.<count>)` (guard float noise with `− 1e-9`), `fixed` → `fixedQty`; invalid/missing → 0.
- `mealsCovered(items, settings, purchases?): Array<{ dishType, total, perGuest, needFullDay, needOneMeal, level: "full-day"|"one-meal"|"short" }>` per Decision 3.
- `sanitizeShoppingItem(raw, stamp): {ok:true,item}|{ok:false,error}`, `sanitizeCandidate(raw): object|null`, `sanitizeShoppingSettings(raw): {ok:true,settings}|{ok:false,error}`, `sanitizeShoppingField(field, value, stamp): {ok:true,value}|{ok:false,error}` (field regex, tombstones, id↔field match, size cap) — all per Decision 1; `updatedAt/updatedBy` always from `stamp`.
- `shoppingItemField(id): string`, `SHOPPING_SETTINGS_FIELD = "settings"`, `isShoppingField(field): boolean`, `partitionShoppingFields(map): { itemsById, deletedIds: string[], settings: object|null }` (parses JSON strings or objects; tombstones go to `deletedIds`).
- `mergeShopping({ itemsById, deletedIds, settings }, seedItems): { items, settings }`: each seed item not deleted → `{ ...seedItem, ...saved }` when a saved record exists else the seed item; then saved items absent from the seed and not deleted (user-created) appended; every item run through `normalizeShoppingItem`; settings = `DEFAULT_SHOPPING_SETTINGS` overlaid with saved (per-vendor shallow merge for `vendorDefaults`).

- [ ] **Step 1: Branch.** `git checkout -b phase2-shopping` from `phase1-purchases-returns` (done); commit this plan (`docs: add Phase 2 shopping tab plan`).
- [ ] **Step 2: Write failing tests** (new section in `scripts/verify-logic.mjs`):
  - `SHOPPING_SETTINGS`: `DEFAULT_SHOPPING_SETTINGS.guestCount === 24`, `defaultTaxRate === 0.065`, `vendorDefaults.minoan.transactionFeePct === 0.032`, `reimbursableVendors` deep-equals `["Minoan"]`; `CATEGORY_TO_TRADE['Dinnerware'] === 'Kitchen & Dining'`, `['Bath'] === 'Linens & Soft Goods'`, `['Furniture'] === 'Furniture / FF&E'`, `['Cleaning & Laundry'] === 'Supplies & Consumables'`, `['Electronics & Tech'] === 'Electronics / AV'`, `['Safety & First Aid'] === 'Other'`; every category has a trade that is in `PURCHASE_TRADES`.
  - `computeQty`: `{qtyRule:{basis:'guests',multiplier:1.5}}` → 36 at 24 guests and 30 at 20; with `qtyOverride: 40` → 40 at both; `{basis:'fixed',fixedQty:10}` → 10; `{basis:'bathrooms',multiplier:3}` → 15; `{basis:'guests',multiplier:1.25}` at 24 → 30 (no float drift); `computeQty({}, DEFAULT)` → 0 and never throws; string numbers work.
  - `mealsCovered`: two `Dinner plates` items (indoor guests×1.5, outdoor guests×1.25, `usesPerGuestPerDay:2`) at 24 guests → total 66, level `full-day`; indoor alone (36) → `one-meal`; a 12-piece set → `short`; items without `usesPerGuestPerDay` are skipped; an item with linked non-Returned purchases (`purchaseIds` → `purchases` qty 70) counts 70 instead of its computed quantity; guests 20 recomputes.
  - Sanitizers: valid item round-trips with `updatedAt/updatedBy` from the stamp (a raw `updatedBy:'X'` is overwritten); invalid id, blank name, invalid category/status/priority → `ok:false`; unknown top-level key `agentExtra:{a:1}` and unknown candidate key `futureField:'x'` are preserved; `__proto__` key is dropped; a record over 100 KB → `ok:false`; `candidates` not an array → `ok:false`. `sanitizeShoppingSettings`: guestCount 0 or 201 rejected, `defaultTaxRate: 0.3` rejected, `reimbursableVendors` non-array rejected, unknown settings key preserved. `sanitizeShoppingField`: `'item:sh-abc-123'` with matching id OK; mismatched id → error; `'item:../x'`, `'foo'`, `'item:SH-1'` → error; `{id:'sh-seed-x', __deleted:true}` accepted as tombstone and returned as exactly `{id, __deleted:true}`; `'settings'` validates via the settings sanitizer. `isShoppingField` agrees.
  - `partitionShoppingFields`/`mergeShopping` with a 3-item seed: no saved → items equal seed; saved edit of `sh-seed-a` (`status:'approved'`) wins while untouched seed items remain; tombstone for `sh-seed-b` hides it (and a saved record for the same id does not resurrect it); a user-created `sh-user-1` is appended once and not duplicated; settings merge keeps `vendorDefaults.amazon` when only `minoan.note` is saved; Review Focus 3.
- [ ] **Step 3: Run `npm test`.** Expected: FAIL (missing module).
- [ ] **Step 4: Implement** the Interfaces block in `src/lib/shopping-logic.js`. Import `PURCHASE_TRADES` only in tests; the lib itself must stay free of browser APIs.
- [ ] **Step 5: Run `npm test`.** Expected: pass.
- [ ] **Step 6: Commit.** `feat(shopping): add shopping model, quantity rules, sanitizers and seed merge logic`

---

### Task 2: Landed cost, best value, warnings, forecast (pure)

**Files:** Modify `src/lib/shopping-logic.js`; Test `scripts/verify-logic.mjs`.

**Interfaces — consumes:** Task 1 constants/`computeQty`; `netCost`, `round2`-equivalent from `purchases-logic.js` (import `netCost`). **Produces:**
- `merchandise(c): number`, `vendorDefaultFor(c, settings): object|null` (by `vendorType` `amazon`/`minoan`, else a case-insensitive match of `c.vendor` against `vendorDefaults[*].name`), `feesFor(c, settings): number`, `taxFor(c, settings): number`, `landedTotal(c, settings): number` (all rounded to cents, Global Constraints formula), `perUnit(c, settings): number`, `returnExposure(c): number`.
- `bestValue(item, settings): object|null` (the winning candidate or null; Decision 4).
- `candidateWarnings(c, item, settings, nowISO): Array<{ code: "return-before-ready"|"over-target"|"not-open-stock"|"stale-price", text: string }>` (Decisions 5–6; texts: "Return window closes before the house is ready — can't test in the house before returns close", "Unit price is above the target price", "Not confirmed open stock — a broken piece may not be re-buyable", "Price last checked more than 72 hours ago").
- `forecastSpend(items, purchases, settings): { planned: number, committed: number, forecast: number }` (Decision 7).

- [ ] **Step 1: Write failing tests:**
  - Fixture B: candidate `{vendorType:'minoan', unitPrice:535.41, qtyToBuy:1, shipping:0, transactionFeePct:0.032386}` with `DEFAULT_SHOPPING_SETTINGS` → `merchandise 535.41`, `feesFor 17.34`, `taxFor 35.93` (6.5% of goods + fee), `Math.abs(landedTotal − 588.67) <= 0.01`. Same candidate without `transactionFeePct` uses the Minoan default 0.032 → fees 17.13, tax on goods+fees. An Amazon candidate (`unitPrice 100, qtyToBuy 2, shipping 5, discount 10`) → merchandise 190, fees 0, tax `0.065 × 190 = 12.35`, landed 207.35; explicit `estTax: 0` is honored (landed 195); blank `estTax: null`/`''` defaults.
  - `returnExposure`: `freeReturns:true` → 0; `{returnShippingCost:12, restockingPct:0.15, unitPrice:100, qtyToBuy:1}` → 27; `restockingPct: 15` (percent) → 27.
  - `perUnit`: landed 207.35 with `qtyToBuy 2`, `packSize 3` → 34.56 (÷6, rounded).
  - `bestValue`: Amazon ($100, free shipping, inStock, free returns) vs Minoan (cheaper merchandise $90 but 3.2% fee + $15 shipping) picks the lower **landed** total, not the lower sticker price; an out-of-stock (`inStock:false`) cheaper candidate is skipped; `inStock` unknown still counts; `deliveryEta` after `needBy` excluded, missing eta allowed; equal landed totals break on lower `returnExposure`, then earlier `deliveryEta`; no candidates → `null`; never mutates the item; `retailUnitPrice` has no effect.
  - `candidateWarnings`: `returnByDate '2026-12-01'` with `readyDate '2026-12-15'` → `return-before-ready`; no readyDate → none; `unitPrice 50, packSize 2` vs `targetPrice 20` → `over-target` (25 > 20), `targetPrice 25` → none; Dinnerware with `openStock:false` and `null` → `not-open-stock`, `true` → none, Small Appliances → none; `checkedAt` 100 hours before `nowISO '2026-11-25T12:00:00Z'` → `stale-price`, 10 hours → none, and the same 100-hour gap on `'2026-10-10'` → none (outside Nov 20–Dec 2).
  - `forecastSpend`: item A (no purchase, selected candidate landed 100) + item B (linked to purchase netCost 20 after refund, selected candidate landed 500 ignored) + item C (no purchase, no selected candidate) + item D (`returned`, selected 300) → `planned 100`, `committed 20`, `forecast 120`; `forecastSpend([], [])` → zeros; bare items don't throw (Review Focus 2).
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the functions.
- [ ] **Step 4: Run `npm test`.** Expected: pass.
- [ ] **Step 5: Commit.** `feat(shopping): add landed cost, best value, warnings and spend forecast logic`

---

### Task 3: Shopping API, backup, field helpers wiring

**Files:** Create `api/shopping.js`; Modify `api/backup.js`; Test `scripts/verify-logic.mjs` (route-adjacent pure checks only).

**Interfaces — consumes:** `sanitizeShoppingField`, `isShoppingField` (Task 1), `scopedKey`. **Produces:** `GET /api/shopping?property=` → `{ field: value }` map (parsed objects, `Cache-Control: no-store` not needed), `PUT` body `{ field, value }` → sanitized single `HSET` (response `{ ok:true, value }` with the stamped value), `DELETE ?field=` → single `HDEL`.

- [ ] **Step 1: Write failing tests** for the route-facing rules in `sanitizeShoppingField` that Task 1 left unpinned: an item whose `candidates` contain a non-object entry is rejected; a candidate keeps unknown fields; `value` of `null`/array/string for an item field → error; Review Focus 4's hostile cases (`field: 'item:sh-a:b'`, 1,000-char field name, `__proto__`) rejected.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL only if Task 1's sanitizer missed a case; otherwise the tests pass immediately and are kept as regression pins (note it in the ledger).
- [ ] **Step 3: `api/shopping.js`** modeled on `api/house-info.js` and `api/finish-records.js`: `?property=` required (400), `scopedKey('shopping', property)`, `currentUser(req)` from `req.cookies.pp_session`, GET → `hgetall` (parse values, tolerate a corrupt value by skipping it), PUT → `sanitizeShoppingField(field, value, { updatedAt, updatedBy })` then `hset` of `JSON.stringify(result.value)`, DELETE → validate with `isShoppingField` then `hdel`.
- [ ] **Step 4: `api/backup.js`:** add `shopping: await redis.hgetall(\`shopping:${id}\`)` to each property's snapshot.
- [ ] **Step 5: Run `npm test`, `node --check api/shopping.js api/backup.js`, `npm run build`.** Expected: pass / no syntax errors / builds.
- [ ] **Step 6: Commit.** `feat(shopping): add the shopping hash API and include it in the full backup`

---

### Task 4: Seed data and master-list parser

**Files:** Create `scripts/build-shopping-seed.mjs`, `src/shopping-seed.json` (generated, committed), `scripts/parse-shopping-list.py`, `scripts/fixtures/shopping-list-sample.csv`; Test `scripts/verify-logic.mjs`.

**Interfaces — produces:** `src/shopping-seed.json` = `{ "generatedFrom": "§2.6 tables", "items": [Item…] }` where each item is `emptyShoppingItem()`-shaped with `userCreated:false`, id `sh-seed-<slug>`, `category`, `room`, `zone`, `dishType`, `usesPerGuestPerDay`, `qtyRule`, `priority`, `notes` (the table's "Why"), `qtyOverride` placeholders for bath/bed linens. Contents (all from §2.6): the dishware/drinkware table as separate indoor/outdoor items (Dinner plates, Salad / dessert plates, All-purpose bowls, Coffee mugs, Everyday tumblers, Wine glasses, Juice / small glasses, Kids' cups with lids, Serving platters, Serving bowls, Serving utensils; categories Dinnerware / Glassware & Drinkware / Serveware & Entertaining; outdoor items in `Outdoor / Pool Dining` and `zone:"outdoor"`), the six flatware pieces (`zone:"both"`, category Flatware), the 13 small-appliance rows (category Small Appliances, `zone` per row, counts from the table; the blender is two items, indoor 1 and outdoor 1; the ice maker and drink dispensers outdoor), and Bath-towel / bed-linen placeholder rows with `qtyOverride` set (bath towel sets and bed linen sets, value 0 = "Josh to set").
- Rules per Decision 14: plates/bowls indoor 1.5×guests (36), outdoor 1.25×guests (30); coffee mugs 1.5× (36); tumblers indoor 1.5× (36), outdoor 2× (48); wine glasses 1.25× each zone (30/30); juice glasses 1× (24); kids' cups fixed 12 outdoor; serving platters fixed 6/4, serving bowls 8/4, serving utensils 16/8; flatware dinner forks 3× (72), salad forks 2× (48), dinner knives 2× (48), steak knives fixed 24, teaspoons 3× (72), soup spoons 1.5× (36); `usesPerGuestPerDay` as in the table (blank for fixed rows).
- `scripts/parse-shopping-list.py`: `python3 scripts/parse-shopping-list.py <master-list.csv> [--out src/shopping-seed.json] [--check]`. Reads a CSV export of the Master List tab. Header aliases (case-insensitive): ID/Item ID, Item/Name, Category, Room, Zone, Final qty/Qty/Quantity, Quality tier, Requirements, Kerry decides, Priority, Notes, Uses per guest per day. Maps to the same item shape (quantity rows → `qtyRule:{basis:"fixed",fixedQty:<Final qty>}` unless a numeric multiplier column is present; `qualityTier`, `requirements`, `kerryDecides` kept as additive item fields), slugifies missing ids to `sh-seed-<slug>`, rejects rows with no name or an invalid category (prints the row number), and `--check` validates without writing.

- [ ] **Step 1: Write failing tests** against the committed seed: ids unique and matching `/^sh-seed-[a-z0-9-]+$/`; every item passes `sanitizeShoppingItem` and has a category in `SHOPPING_CATEGORIES`; `computeQty` at the default 24 guests gives exactly: Dinner plates indoor 36 / outdoor 30, Everyday tumblers indoor 36 / outdoor 48, Coffee mugs 36, Dinner forks 72, Steak knives 24, Serving platters 6 and 4, drip coffee makers 2; at 20 guests Dinner plates indoor becomes 30 while a `qtyOverride` item stays put; `mealsCovered(seed, DEFAULT)` rates Dinner plates, Salad / dessert plates and All-purpose bowls `full-day` (66 ≥ 2×24), and Everyday tumblers `full-day` (84 ≥ 2.5×24); every `Outdoor / Pool Dining` item has `zone:'outdoor'`; no seed item is `proposed` and none is pre-approved.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL (no seed file).
- [ ] **Step 3: Write `scripts/build-shopping-seed.mjs`** (data tables inline, imports `emptyShoppingItem`/`newCandidateId` not needed) and run `node scripts/build-shopping-seed.mjs` to generate `src/shopping-seed.json`.
- [ ] **Step 4: Write `scripts/parse-shopping-list.py` + sample CSV** (5–6 rows incl. one with quality tier / requirements / Kerry-decides). Run `python3 scripts/parse-shopping-list.py scripts/fixtures/shopping-list-sample.csv --out /tmp/pp-sample-seed.json --check` and then without `--check`; confirm the output items pass the same shape rules by loading them in a small node check (document the command in the commit message).
- [ ] **Step 5: Run `npm test`.** Expected: pass.
- [ ] **Step 6: Commit.** `feat(shopping): generate the seed list from the §2.6 tables and add the master-list CSV parser`

---

### Task 5: State, persistence and the Shopping tab shell

**Files:** Modify `src/App.jsx`.

**Interfaces — consumes:** Tasks 1–4. **Produces** (in `App`): state `shopping = { items, settings }`, `shoppingLoaded`, `shoppingLoadError`; handlers `saveShoppingItem(item)`, `removeShoppingItem(id)` (tombstone for a seed id, HDEL for a user-created id), `saveShoppingSettings(settings)`; a `ShoppingView` component stub receiving `{ shopping, loaded, canEdit, onSaveItem, onRemoveItem, onSaveSettings, purchases }`; header nav entry `{ key: "shopping", label: "Shopping" }` between Design and Purchases; `LS_SHOPPING = "pool-paddle-shopping-v1"` cache.

- [ ] **Step 1: Read** the existing purchases fetch/cache/save effects and the finishes per-field debounced writers (`putFinishFieldDebounced`, `flushFinishFields`) and copy their structure.
- [ ] **Step 2: Implement** with scoped, guarded edits (anchor every `str.index` after the relevant function start; assert replaced spans are small; assert the top-level function inventory only gains `ShoppingView`; assert < 15 original lines removed): load effect (reset `serverLoaded`, `isCancelled` guard, cache first, then `fetch(apiUrl('/api/shopping', activeProperty))` only when `activeProperty` is set; response → `partitionShoppingFields` → `mergeShopping(…, SHOPPING_SEED.items)`); cache write effect omitting `activeProperty` from deps and gated by the loaded ref; per-field debounced writer (400 ms, flushed on `visibilitychange`/`pagehide` with `keepalive`) identical in behavior to the finishes writer; `syncError` banner on failure; the `ShoppingView` stub renders the heading, item count and a loading/empty state.
- [ ] **Step 3: Run `npm test`, `npm run build`** and the SSR smoke render (extend `.superpowers/smoke.mjs` to render `ShoppingView` with the seed and assert the heading and item count). Expected: pass.
- [ ] **Step 4: Commit.** `feat(shopping): add the Shopping tab shell with per-property persistence and seed merge`

---

### Task 6: ShoppingView — list, candidates, approvals, settings

**Files:** Modify `src/App.jsx` (replace the stub; insert the full component before the `// ─── HOUSE INFO` banner via a spliced block, not by regex over large ranges).

**Interfaces — consumes:** all pure functions in Tasks 1–2. **Produces:** the working Shopping tab UI per §2.8 except Mark purchased, export/import and print (Tasks 7–9).

- [ ] **Step 1: Implement** `ShoppingView`: stat cards (Items, Approved, Ordered, **Forecast vs budget** with a "Set target" prompt until `budgetTarget` is set); a **meals-covered** strip of badges (green/amber/red per `mealsCovered`); group-by (category | status), filters (status, category, priority, agent flag, claimed by, vendor) and search; item rows with quantity (computed vs override), priority/status chips, a "non-glass" badge on Outdoor / Pool Dining plus the §2.5 outdoor-materials checklist in the expanded item; expanded item with: candidate table side by side (vendor, landed total, per-unit, return-by, return exposure, delivery, in stock, source, checked at, "Sparrow reimburses (loan)" tag for reimbursable vendors, Best Value badge, warning badges), Select candidate, Approve (stamps JM/KM from `getCurrentUser()` and `approvedAt`), Claim / unclaim, Open link, qty override, status select, notes, target price, need-by, add/edit/delete candidate form (all §2.4 manual fields), delete item (confirm), agent proposal **Keep / Dismiss** pair for `proposed:true` items (Keep clears `proposed`, Dismiss removes the item); add custom item form; a collapsible **Settings** panel for every §2.2 setting (including vendor defaults and reimbursable vendors). Use `<button>`s, ≥44px targets, `ppInput` (≥16px) and `C` tokens; item edits call `onSaveItem` with the full updated item.
- [ ] **Step 2: Extend the SSR smoke test** to render `ShoppingView` with seed items plus a hand-built item with two candidates (Amazon vs Minoan) and assert: the stat cards, a "covers a full day" badge for Dinner plates, the expanded-view strings only appear once an item is expanded (render the candidate table through the exported pure functions instead), and the Forecast card shows the formatted total.
- [ ] **Step 3: Run `npm test`, `npm run build`, smoke.** Expected: pass.
- [ ] **Step 4: Commit.** `feat(shopping): build the Shopping tab list, candidate comparison, approvals and settings`

---

### Task 7: Mark purchased (promote) and the Purchases link

**Files:** Modify `src/lib/purchases-logic.js` (default `shoppingItemId: null`), `src/lib/shopping-logic.js`, `src/App.jsx`, `scripts/verify-logic.mjs`.

**Interfaces — produces:** `buildPurchaseFromShopping(item, candidate, settings): object` in `shopping-logic.js` (a normalized purchase draft: `description` = item name, `vendor`, `sourceVendor`, `room`, `trade` = `CATEGORY_TO_TRADE[category] || "Other"`, `qty` = `qtyToBuy`, `unitPrice`, `shipping`, `fees` = `feesFor`, `tax` = `taxFor`, `totalPaid` = `landedTotal`, `allowanceCategory` = `defaultAllowanceFor(trade, "") || NOT_IN_ALLOWANCE`, reimbursement defaults from `reimbursementDefaultsFor(vendor, "", settings.reimbursableVendors)`, `returnByDate` = candidate `returnByDate` else the Amazon `holidayReturnBy` default for amazon-type candidates else `""`, `returnPolicyNote` from `returnWindowDays`, `assetClass` = `suggestAssetClass(trade)`, `shoppingItemId` = item id, `notes` = promoted-from text + url); App `promoteShoppingItem(item, candidateId)`; `PurchasesView`/`PurchaseForm` accept `reimbursableVendors`.

- [ ] **Step 1: Write failing tests:** fixture-B-like Minoan candidate for a Furniture item → trade `Furniture / FF&E`, `vendor 'Minoan'`, `reimbursable true`, `reimbursementStatus 'pending'`, `totalPaid` within $0.01 of 588.67, `allowanceCategory NOT_IN_ALLOWANCE`, `shoppingItemId` = item id, `returnByDate ''`; an Amazon candidate with no return date → `returnByDate '2027-01-31'`; a candidate's own `returnByDate` wins; an item in `Electrical`-mapped category is not applicable (categories map to Kitchen & Dining etc.); `emptyPurchase().shoppingItemId === null` and `normalizePurchase({})` has it; no candidate selected → the builder returns `null`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the builder, the `purchaseDefaults` field, `promoteShoppingItem` in `App` (guard against double-fire like `promoteFinishItem`: if the item already has a live linked purchase, just open it; otherwise `savePurchase(draft)`, update the item with `status:"ordered"`, `selectedCandidateId`, `purchaseIds:[...,draft.id]`, `setFocusPurchaseMode("edit")`, focus the purchase), the **Mark purchased** button and "✓ purchased" chip in `ShoppingView`, and wire `settings.reimbursableVendors` into the Purchases form's `reimbursementDefaultsFor(..., vendors)` calls (fallback to the constant).
- [ ] **Step 4: Run `npm test`, `npm run build`, smoke.** Expected: pass.
- [ ] **Step 5: Commit.** `feat(shopping): promote a shopping item to a pre-filled Purchase with a two-way link`

---

### Task 8: Agent export/import and Print for Kerry

**Files:** Modify `src/lib/shopping-logic.js`, `src/App.jsx`, `scripts/verify-logic.mjs`.

**Interfaces — produces** (exported, pure):
- `buildExportBundle({ items, settings, propertyId, podcast, tools, now }): object` → exactly the §2.9 shape (`schema:"pp-shopping-export/v1"`, `exportedAt`, `propertyId`, `settings`, `items` with fresh `qtyNeeded`, `research.episodes` filtered per §2.9 to `{ep,title,keyInsight,tags}`, `research.tools` per Decision 9). **Do not alter the field names or schema string.**
- `validateResults(json, propertyId): { ok:true } | { ok:false, error }` (major version must be 1; `propertyId` must match; arrays shaped).
- `mergeResults(items, results, settings, idGen?): { touched: object[], changes: Array<{ kind:"update"|"new", itemId, name, addedCandidates: number, updatedCandidates: number, flag: string|null, suggestedQty: number|null, noteAdded: boolean }>, skipped: string[] }` per the Global Constraints and Decision 8 (never mutates inputs; `touched` contains only items that actually changed).
- `buildPrintHtml(items, settings, now): string` (approved + shortlisted items grouped by category; item, qty via `computeQty`, chosen (selected) vendor, landed total, return-by, notes; every dynamic value HTML-escaped; inline styles only).

- [ ] **Step 1: Write failing tests:**
  - `buildExportBundle`: schema string and key set exact (`schema, exportedAt, propertyId, settings, items, research`); `research.episodes` contains only critical/high, non-gimmick episodes in the three categories and only the four fields; `research.tools` only the three categories; items carry `qtyNeeded` recomputed (change guestCount → export changes); a tombstone-free item list; unknown item fields are kept.
  - `validateResults`: wrong schema, `/v2`, missing arrays, and a mismatched `propertyId` rejected; `pp-shopping-results/v1` and a `/v1`-prefixed minor-compatible shape accepted.
  - `mergeResults` (Review Focus 1): a file adding two candidates to an item → one touched item with both candidates, ids assigned, `source` default `"agent"`; the file also containing `status:'approved'`, `approvedBy:'JM'`, `claimedBy:'KM'`, `selectedCandidateId:'x'`, `qtyOverride:99`, `qtyNeeded:5` on updates and on a new item → none applied; applying the same file to the result again → `touched` empty and `changes` empty; a duplicate candidate (same vendor + sku, different URL) updates price/stock fields and `checkedAt` but keeps the existing id/selection; a duplicate by `vendor + url` (no sku) also dedupes; `agentFlag` set with `flaggedAt` = `generatedAt`; `suggestedQty` stored but `qtyOverride` untouched; agent notes appended once; a new item lands `proposed:true`, `status 'researching'`, unknown category → `Other`, its re-import adds candidates to the existing proposed item (no duplicate); unknown fields on candidates/items/updates are preserved; an `itemId` that doesn't exist lands in `skipped`; inputs unmodified (deep-frozen fixtures).
  - `buildPrintHtml`: only approved and shortlisted items appear, grouped under category headings; an item named `<script>alert(1)</script> & Co` renders as escaped text; totals use the selected candidate's `landedTotal`; an item with no selected candidate shows "—" for vendor and total; includes the date; contains no external resource references (Review Focus 5).
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: UI wiring in `ShoppingView`:** **Export for agent** (downloads `pp-shopping-export-<YYYY-MM-DD>.json` built from `podcast-data.json`/`tools-data.json`); **Import agent results** (file input → parse → `validateResults` → a preview modal listing each change, with Apply / Cancel; Apply writes one `onSaveItem` per `touched` item, i.e. one targeted HSET each, then shows a summary and any `skipped`); **Print for Kerry** (opens a new window with `buildPrintHtml(...)` and calls `print()` on it; popup-blocked → alert explaining). Buttons are `<button>`s ≥44px.
- [ ] **Step 5: Run `npm test`, `npm run build`, smoke** (smoke additionally exercises `buildExportBundle`/`mergeResults`/`buildPrintHtml` end to end with the seed). Expected: pass.
- [ ] **Step 6: Commit.** `feat(shopping): add agent export/import with a safe merge and a printable list for Kerry`

---

### Task 9: Docs, full verification, hand-off

**Files:** Modify `CLAUDE.md` (7→8 tabs, Shopping data model/API/persistence rules, new files, Phase 2 decisions), `docs/known-issues.md`.

- [ ] **Step 1: Update docs.** Add the Shopping tab to the project overview/tab list, the `api/shopping.js` route, the `shopping:<id>` key, a "Shopping data model" section (item/candidate/settings fields, seed merge, import rules, forward-compat), the master-list parser, and decisions 1–15 that matter to future work under known-issues.
- [ ] **Step 2: Full gate.** `npm test`, `npm run build`, `node .superpowers/smoke.mjs`; confirm `git status` clean after.
- [ ] **Step 3: Commit.** `docs: document the Shopping tab, agent import/export and seed list`
- [ ] **Step 4: Hand-off (do not push/PR without Josh's OK).** Preview-deploy checklist (spec §2.11 plus the surfaces tests can't reach):
  1. Shopping tab appears between Design and Purchases, seeded with the §2.6 list; Dinner plates show 36 indoor / 30 outdoor at 24 guests and the meals-covered badge is green.
  2. Change guest count to 20: rule-based quantities recompute, an item with a quantity override does not; the change persists after reload and appears on the other device after reload.
  3. Add an Amazon and a Minoan candidate to one item with different shipping/returns: landed totals, return exposure and **Best Value** are right; the Minoan candidate shows "Sparrow reimburses (loan)"; selecting/approving/claiming persists (JM/KM stamp).
  4. **Mark purchased** creates a correctly pre-filled Purchase (Minoan → reimbursable/pending, trade from the category map, Amazon return-by defaults to 2027-01-31); both link, the item shows ✓, status → ordered.
  5. Export for agent downloads a file matching §2.9; importing a results file shows a preview, adds candidates and proposals without touching approvals/claims/selections, and importing the same file twice changes nothing.
  6. Print for Kerry opens a clean one-page list (approved + shortlisted) that saves as PDF.
  7. Backup JSON contains `shopping` for the property.
  Then ask Josh whether to push and open the PR; **stop before Phase 3.**

---

## Self-Review (spec §2 coverage)

- 2.1 storage/API/backup/cache → T3, T5; 2.2 settings → T1 (defaults/sanitize), T6 (panel); 2.3/2.4 item + candidate → T1, T6; 2.5 categories/trade map/non-glass/outdoor checklist → T1, T6; 2.6 quantities, 2.6a meals-covered → T1, T4 (seed), T6 (badges); 2.7 landed/best value/warnings → T2; 2.8 UI (stat cards, group/filter/search, expanded item, actions, Keep/Dismiss, buttons) → T6, T7, T8; 2.9 agent interface (export, results, import rules, forward-compat) → T8; 2.10 print → T8; 2.11 acceptance (guest count recompute → T1/T4 tests, Best Value → T2, idempotent import → T8, Mark purchased two-way → T7, backup → T3); 2.12 seed + parser + merge → T1, T4.
- Signatures consistent across tasks: `computeQty(item, settings)`, `landedTotal(c, settings)`, `bestValue(item, settings)`, `mergeShopping({itemsById, deletedIds, settings}, seedItems)`, `buildPurchaseFromShopping(item, candidate, settings)`, `mergeResults(items, results, settings, idGen)`.
