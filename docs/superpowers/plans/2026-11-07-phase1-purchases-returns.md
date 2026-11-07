# Phase 1: Purchases Upgrades (trades, returns, reimbursements, receiving, order grouping, net cost) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Purchases tab ready for the whole-house stocking round and Sparrow's reimbursement/loan-draw flow: 5 new trades, return tracking with a Dashboard "Returns closing" list, receiving fields, order grouping with shared receipts, reimbursement tracking ("Due from Sparrow"), contractor-scope and funding-source handling, and net-of-refund cost everywhere totals appear.

**Architecture:** All new money/date/grouping logic is pure and lives in `src/lib/purchases-logic.js` (tested in `scripts/verify-logic.mjs`, including the three real fixtures from spec §3.7 inlined as numbers). Records stay in the existing `purchases:<id>` hash; `api/purchases.js` stores the body verbatim, so new fields need no server schema change. The one server change is making receipt blobs safe to share between purchases. Old records are normalized on load; nothing is migrated or rewritten.

**Tech Stack:** React 18 (single-file `src/App.jsx`, inline styles, `C` tokens), Vercel Node functions, Upstash Redis hash, Vercel Blob (private), plain-node assert tests.

**Spec:** `docs/superpowers/specs/2026-11-07-shopping-receipts-agent-spec.md` (Revision 6; §0 and §1 only). Phases 2 and 3 are NOT part of this plan, and the §2.9 agent file formats are untouched.

## Global Constraints

- Purchases stay a Redis **hash**: targeted single-record `HSET`/`HDEL` only. Never a whole-array PUT.
- No migration writes. Existing records get defaults in memory on load.
- Trades go 17 → 22: add `Small Appliances`, `Kitchen & Dining`, `Supplies & Consumables`, `Window Treatments`, `Closets & Shelving`.
- Status enum: `Ordered | Received | Installed | Return started | Returned`.
- New asset class `supplies`, label **"Supplies / expense (confirm with CPA)"**. Suggested: Small Appliances → 5-yr; Kitchen & Dining → 5-yr; Supplies & Consumables → `supplies`; Window Treatments → 5-yr; Closets & Shelving → 27.5-yr. Suggestions only, overridable. **`section` (§1245/§1250) stays blank, never guessed.**
- Allowance defaults: when `purchasedBy` is Josh or Kerry and trade is one of Small Appliances, Kitchen & Dining, Supplies & Consumables, Window Treatments, Furniture / FF&E, Decor & Styling, Linens & Soft Goods, Electronics / AV → "Not in Allowance / Owner FF&E". Closets & Shelving → "Shelving"; Electrical → "Electrical Fixtures"; Plumbing → "Plumbing Fixtures" (whoever paid). New allowance option **"Contractor scope (base contract)"**, the default when `purchasedBy` is Sparrow and no Exhibit B category applies. User can always override.
- Reimbursement fields: `reimbursable`, `reimbursedBy`, `reimbursementStatus` (`none | pending | requested | reimbursed`), `reimbursedAmount`, `reimbursedDate`, `drawNo`. A purchase whose vendor is in the reimbursable-vendor list (seed `["Minoan"]`) defaults to `reimbursable: true`, `reimbursedBy: "Sparrow (Contractor)"`, `reimbursementStatus: "pending"`.
- `fundingSource(p)`: `"Owner direct"` | `"Contract (reimbursed by Sparrow)"` | `"Contract (paid by Sparrow)"`.
- Marketplace/payment fields: `sourceVendor`, `fees`, `docType` (`receipt | invoice | statement | quote`), `paymentConfirmed`, `lienWaiverReceived`. Badge rules in Task 1.
- `netCost = totalPaid − (refundAmount || 0)`; stat cards, Exhibit B reconciliation and Cost Seg CSV use it. Fully `Returned` lines are excluded from Cost Seg groups and listed in a trailing "Returned (excluded)" block. The CSV gains a **`fundingSource`** column and the header note: "Contract-funded items are already inside the construction contract price; do not add them to basis a second time."
- "Returns closing": `returnByDate` within 14 days, status not `Returned`, `keepConfirmed` false.
- Receipts keep committing once on Save in `PurchaseForm`. Blob store stays Private. Receipt pathnames keep the shape `receipts/<propertyId>/<purchaseId>/<file>`.
- UI rules: inline styles + `C` tokens only; `<button>` not `<div onClick>`; native visible `<input type="date">`; focusable inputs ≥16px (`ppInput` already complies); touch targets ≥44px.
- Commit messages: imperative, 1–2 sentences, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Gate: `npm test` + `npm run build`, then Josh verifies persistence/receipts on a Vercel deploy. **Stop for Josh's sign-off before Phase 2.**

## Decisions made while planning (Josh: veto any of these)

1. `netCost` is clamped at 0.
2. `refundAmount` is money actually back in hand (net of restocking fee). `restockingFee` and `returnShippingCost` are recorded but do not change `netCost`.
3. Setting status `Returned` pre-fills `refundAmount` with `totalPaid` when blank (editable); a Returned line with no refund shows a "refund not recorded" chip.
4. "Returns closing" lists only windows not yet closed (today through today+14); `Return started` stays listed.
5. "Add line to this order" button (not in the spec) is the way order groups get created in Phase 1: assigns `orderGroupId` (`og-<ts36>-<rand6>`), source becomes `lineNo` 1 if it had none, clones order-level fields (vendor, invoice #, paid by, payment method, purchase date, docType, reimbursement flags with status reset to `pending`/`none`) and **shares the same receipt pathnames by reference**.
6. The "Returned (excluded)" CSV block lists every `Returned` purchase.
7. `settings.reimbursableVendors` is a Phase 2 setting that doesn't exist yet. Phase 1 uses an exported constant `DEFAULT_REIMBURSABLE_VENDORS = ["Minoan"]`; the logic functions take the list as an optional parameter so Phase 2 can pass the setting. Not editable in the UI until then. Vendor match is case-insensitive, trimmed.
8. Reimbursement defaults are not applied when Sparrow paid (nothing to reimburse).
9. Contractor-scope default for Sparrow-paid items applies only to the 8 trades with no Exhibit B equivalent (the same list as the owner rule); Sparrow-paid Flooring, Kitchens, etc. get no automatic category (user picks). Spec names only three trade→category defaults and I did not invent more.
10. The payment badge is shown only for `docType` statement/quote (spec wording). It clears only when the explicit box is checked (`paymentConfirmed`, or `lienWaiverReceived` when Sparrow paid); attaching a file does not clear it.
11. "Due from Sparrow" is summed on `netCost` where `reimbursable` and status ≠ `reimbursed` (spec-literal); `reimbursedAmount` is informational.
12. Contractor-scope spend is shown on its own reconciliation line and is **not** charged against the $446,000 pool; "Reimbursed, no Exhibit B category" **is** charged against it (spec §3a).
13. Exhibit B reconciliation `Remaining` = allowance − (Paid by Sparrow + Reimbursed to owner + Owner direct), same as today's behavior of counting every purchase tagged to the category.
14. A trade filter is added to the Purchases list (spec says "forms and filters"; none existed).
15. The cost-seg CSV note is a second preamble line, so the existing test that reads row index 2 is updated to find the first data row.

## Review Focus

1. **Legacy records missing every new field** never throw in `netCost`, `fundingSource`, `reimbursementsDue`, `allowanceCredits`, `allowancePool`, `returnsClosingSoon`, `groupByOrder`, `summarizePurchases`, `paymentBadge` (Tasks 1–3).
2. **Float cents:** sums like 7096.80 + 588.67 must print exactly $7,685.47 (round to cents in every aggregate) (Task 2).
3. **Date edges for Returns closing:** today and today+14 included; today+15, yesterday, `""`, garbage excluded (Task 3).
4. **Shared receipt lifecycle:** deleting one of two sharing purchases keeps the blob; deleting the last referencing one removes it; a removal racing its own unsaved PUT still deletes (Task 4).
5. **Reimbursable + returned:** a fully refunded reimbursable purchase contributes $0 to "Due from Sparrow", and a reimbursable item in an Exhibit B category counts as "Reimbursed to owner", never as an owner-paid credit (Task 2).

---

## File Structure

| File | Change |
|---|---|
| `src/lib/purchases-logic.js` | Constants, defaults/normalize, `netCost`, `defaultAllowanceFor`, `reimbursementDefaultsFor`, `paymentBadge`, `summarizePurchases`, `fundingSource`, `reimbursementsDue`, `allowanceCredits`, `allowancePool`, date helpers, `returnsClosingSoon`, `groupByOrder`, `newOrderGroupId`, updated `buildCostSegCsv` |
| `scripts/verify-logic.mjs` | New sections (incl. inline fixtures A/B/C); update the exact-key list in the `emptyPurchase()` test; adjust the `buildCostSegCsv` row-index/amount assertions |
| `api/_scope.js` | Pure `purchasesFromHash`, `isReceiptReferenced` |
| `api/receipts-view.js`, `api/purchases.js` (DELETE), `api/receipts-delete.js` | Reference-aware blob handling |
| `src/App.jsx` | `PurchaseForm`, `PurchasesView`, `ReceiptUploader` (delete call), `Dashboard`, `App` (normalize on load, deep-link mode, add-line) |
| `CLAUDE.md`, `docs/known-issues.md` | Document new fields/rules |

---

### Task 1: Purchase model, defaults, net cost, payment badge (pure)

**Files:** Modify `src/lib/purchases-logic.js`; Test `scripts/verify-logic.mjs` (new section + update `emptyPurchase()` expected-key list).

**Interfaces — produces** (all exported from `src/lib/purchases-logic.js`):
- `PURCHASE_TRADES` (22; the five new trades go before `Other`, which stays last), `PURCHASE_STATUSES`, `DELIVERED_TO_OPTIONS = ["Home","Storage","Property","Other"]`, `REIMBURSEMENT_STATUSES = ["none","pending","requested","reimbursed"]`, `DOC_TYPES = ["receipt","invoice","statement","quote"]`, `ASSET_CLASSES` (adds `"supplies"`), `CONTRACTOR_SCOPE = "Contractor scope (base contract)"`, `DEFAULT_REIMBURSABLE_VENDORS = ["Minoan"]`, `EXHIBIT_B_NAMES` (array of the 11 `ALLOWANCE_CATEGORIES` names).
- `assetClassLabel(c: string): string`.
- `defaultAllowanceFor(trade: string, purchasedBy: string): string | null`: precedence: (1) Josh/Kerry + the 8 owner trades → `NOT_IN_ALLOWANCE`; (2) trade Closets & Shelving → `"Shelving"`, Electrical → `"Electrical Fixtures"`, Plumbing → `"Plumbing Fixtures"` for any payer; (3) `purchasedBy === CONTRACTOR_PURCHASER` and trade in the 8 owner trades → `CONTRACTOR_SCOPE`; else `null`.
- `reimbursementDefaultsFor(vendor: string, purchasedBy: string, vendors?: string[]): { reimbursable: boolean, reimbursedBy: string, reimbursementStatus: string }`: matching vendor and not Sparrow-paid → `{true, "Sparrow (Contractor)", "pending"}`; otherwise `{false, "", "none"}`.
- `purchaseDefaults(): object` (every field except `id`), `emptyPurchase()`, `normalizePurchase(p: object): object` (= `{ ...purchaseDefaults(), ...p }`, no mutation).
- `netCost(p): number` (clamped ≥ 0, rounded to cents), `paymentBadge(p): null | "Unpaid / no proof of payment" | "Contractor-paid: confirm in draw"`, `summarizePurchases(purchases): { total, owner, contractor, byTrade }` (sums `netCost`; **no `byAllowance`**, which moves to `allowancePool` in Task 2).
- New fields/defaults: `returnByDate:""`, `returnPolicyNote:""`, `refundAmount:null`, `refundDate:""`, `restockingFee:null`, `returnShippingCost:null`, `keepConfirmed:false`, `inspected:false`, `inspectedDate:""`, `deliveredTo:""`, `orderGroupId:null`, `lineNo:null`, `reimbursable:false`, `reimbursedBy:""`, `reimbursementStatus:"none"`, `reimbursedAmount:null`, `reimbursedDate:""`, `drawNo:""`, `sourceVendor:""`, `fees:null`, `docType:""`, `paymentConfirmed:false`, `lienWaiverReceived:false`.

- [ ] **Step 1: Branch.** `git checkout -b phase1-purchases-returns`; commit the spec and this plan (`docs: add shopping/receipts/agent spec rev 6 and Phase 1 plan`).
- [ ] **Step 2: Write failing tests** in `scripts/verify-logic.mjs` (before the final "All N checks passed" line) and update the `emptyPurchase()` expected-key array to all 35 keys:
  - `PURCHASE_TRADES.length === 22`, includes the five new trades, last entry `'Other'`; `PURCHASE_STATUSES` deep-equals `["Ordered","Received","Installed","Return started","Returned"]`; `ASSET_CLASSES` includes `"supplies"`.
  - `suggestAssetClass`: Small Appliances `'5-yr'`, Kitchen & Dining `'5-yr'`, Supplies & Consumables `'supplies'`, Window Treatments `'5-yr'`, Closets & Shelving `'27.5-yr'`; `assetClassLabel('supplies') === 'Supplies / expense (confirm with CPA)'`, `assetClassLabel('5-yr') === '5-yr'`.
  - `defaultAllowanceFor`: each of the 8 owner trades with `'Josh'` and `'Kerry'` → `NOT_IN_ALLOWANCE`; `('Closets & Shelving','Sparrow (Contractor)') === 'Shelving'` and with `'Josh'` also `'Shelving'`; `('Electrical','Josh') === 'Electrical Fixtures'`; `('Plumbing','Sparrow (Contractor)') === 'Plumbing Fixtures'`; `('Window Treatments','Sparrow (Contractor)') === CONTRACTOR_SCOPE`; `('Small Appliances','Sparrow (Contractor)') === CONTRACTOR_SCOPE`; `('Flooring','Sparrow (Contractor)') === null`; `('Appliances','Josh') === null`; `('Small Appliances','') === null`; `('','Josh') === null`.
  - `reimbursementDefaultsFor('Minoan','Josh')` → `{reimbursable:true, reimbursedBy:'Sparrow (Contractor)', reimbursementStatus:'pending'}`; `(' minoan ','Kerry')` same; `('Amazon','Josh')` → `{false,'','none'}`; `('Minoan','Sparrow (Contractor)')` → `{false,'','none'}`; `('Wayfair','Josh',['Wayfair'])` → reimbursable true.
  - `emptyPurchase()` carries every new default above and `section === ''`; `normalizePurchase({id:'pur-old', description:'x', totalPaid:10, refundAmount:5})` keeps those values, has every `purchaseDefaults()` key, input unchanged; `normalizePurchase({})` does not throw.
  - `netCost`: `{totalPaid:120, refundAmount:100}` → 20; `{totalPaid:40}` → 40; `{}` → 0; `{totalPaid:50, refundAmount:80}` → 0; `{totalPaid:'12.5'}` → 12.5.
  - `paymentBadge`: `{docType:'statement', paymentConfirmed:false, purchasedBy:'Josh'}` → `'Unpaid / no proof of payment'`; same with `paymentConfirmed:true` → `null`; `{docType:'quote', purchasedBy:'Kerry'}` → unpaid badge; `{docType:'statement', purchasedBy:'Sparrow (Contractor)', lienWaiverReceived:false}` → `'Contractor-paid: confirm in draw'`; with `lienWaiverReceived:true` → `null`; `{docType:'receipt'}` → `null`; `{}` → `null`.
  - `summarizePurchases`: `[{totalPaid:40, ownerPurchased:true, trade:'Small Appliances'}, {totalPaid:1000, ownerPurchased:false, trade:'Appliances'}, {totalPaid:120, refundAmount:100, ownerPurchased:true, trade:'Linens & Soft Goods'}]` → `total 1060`, `owner 60`, `contractor 1000`, `byTrade['Linens & Soft Goods'] === 20`; `summarizePurchases([{}])` does not throw.
- [ ] **Step 3: Run `npm test`.** Expected: FAIL (missing exports / key list).
- [ ] **Step 4: Implement** the Interfaces block in `src/lib/purchases-logic.js`. Extend `ASSET_CLASS_BY_TRADE`. Round money with a small local `round2` helper.
- [ ] **Step 5: Run `npm test`.** Expected: all checks pass.
- [ ] **Step 6: Commit.** `feat(purchases): add trades, return/receiving/reimbursement/payment fields, net cost and allowance/reimbursement defaults`

---

### Task 2: Funding source, Due from Sparrow, allowance credits, allowance pool (pure)

**Files:** Modify `src/lib/purchases-logic.js`; Test `scripts/verify-logic.mjs`.

**Interfaces — consumes:** `netCost`, `EXHIBIT_B_NAMES`, `CONTRACTOR_SCOPE`, `NOT_IN_ALLOWANCE`, `ALLOWANCE_CATEGORIES`, `EXHIBIT_B_TOTAL` (Task 1 / existing). **Produces:**
- `fundingSource(p): "Owner direct" | "Contract (reimbursed by Sparrow)" | "Contract (paid by Sparrow)"`: `!p.ownerPurchased` → paid by Sparrow; else `p.reimbursable` → reimbursed by Sparrow; else Owner direct.
- `reimbursementsDue(purchases): { total: number, purchases: object[] }`: `reimbursable` and `reimbursementStatus !== 'reimbursed'`, total = sum of `netCost` rounded to cents.
- `allowanceCredits(purchases): { total: number, purchases: object[] }`: `ownerPurchased`, **not** `reimbursable`, `allowanceCategory` in `EXHIBIT_B_NAMES`, `netCost > 0`.
- `allowancePool(purchases, allowances?): { rows: Array<{ name, allowance, paidBySparrow, reimbursedToOwner, ownerDirect, spent, remaining, pct }>, contractorScope: { total, purchases }, reimbursedNoCategory: { total, purchases }, poolTotal, poolCharged, poolRemaining }`. `rows` has one entry per allowance (default `ALLOWANCE_CATEGORIES`), splitting purchases tagged to that category by `fundingSource`; `spent` is the three summed, `remaining = allowance − spent`, `pct` rounded. `reimbursedNoCategory`: `reimbursable` and category not in `EXHIBIT_B_NAMES`. `contractorScope`: category `=== CONTRACTOR_SCOPE`. `poolTotal = EXHIBIT_B_TOTAL` (sum of allowances), `poolCharged = sum(row.spent) + reimbursedNoCategory.total`, `poolRemaining = poolTotal − poolCharged`. All sums rounded to cents.

- [ ] **Step 1: Write failing tests**, with inline fixtures (amounts are each line's "Total paid" from spec §3.7):
  - Helper in the test builds purchases as `{...emptyPurchase(), vendor, purchasedBy, ownerPurchased, trade, totalPaid, allowanceCategory: defaultAllowanceFor(trade, purchasedBy), ...reimbursementDefaultsFor(vendor, purchasedBy)}`.
  - **Fixture A** (Minoan, Josh): Plumbing 119.82; Electrical 1512.23, 3066.99, 848.59, 1023.45, 525.72. **Fixture B** (Minoan, Josh): Furniture / FF&E 216.46, 200.27, 171.94. After building all nine: `reimbursementsDue(all).total === 7685.47`; `allowancePool(all)` row `Electrical Fixtures` has `reimbursedToOwner === 6976.98`, `paidBySparrow === 0`, `ownerDirect === 0`; row `Plumbing Fixtures` `reimbursedToOwner === 119.82`; `reimbursedNoCategory.total === 588.67`; `allowanceCredits(all).total === 0`; every one has `fundingSource === 'Contract (reimbursed by Sparrow)'`; `poolCharged === 7685.47`. Mark the six fixture-A purchases `reimbursementStatus:'reimbursed'` → `reimbursementsDue(...).total === 588.67`.
  - **Fixture C** (First Coast, Sparrow, `ownerPurchased:false`): ten `Closets & Shelving` lines 525, 3525, 1300, 1350, 465, 280, 280, 280, 250, 1000; one `Window Treatments` line 9732. Row `Shelving`: `paidBySparrow === 9255`, `remaining === 1245`; `contractorScope.total === 9732`; `allowanceCredits(fixtureC).total === 0`; `reimbursementsDue(fixtureC).total === 0`; `fundingSource` is `'Contract (paid by Sparrow)'` for all; `poolCharged === 9255`.
  - Owner-direct credit: a Josh-paid, non-reimbursable `Plumbing` purchase of 100 → `allowanceCredits.total === 100`, row `Plumbing Fixtures` `ownerDirect === 100`. The $40 Kerry toaster (`Small Appliances`) leaves row `Appliances` `spent === 0` and `remaining === 25000`.
  - Review Focus 5: a reimbursable Minoan purchase `totalPaid:120, refundAmount:120` contributes 0 to `reimbursementsDue`. Review Focus 1: every function accepts `[{}]` and `[]` without throwing.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit.** `feat(purchases): add funding source, Due from Sparrow, allowance credits and allowance pool logic`

---

### Task 3: Returns-closing, order grouping, cost-seg CSV (pure)

**Files:** Modify `src/lib/purchases-logic.js`; Test `scripts/verify-logic.mjs` (including updating the existing `buildCostSegCsv` assertions).

**Interfaces — consumes:** `netCost`, `fundingSource`. **Produces:**
- `localISODate(d?: Date): string` (local-date `YYYY-MM-DD`); `daysBetween(fromISO, toISO): number | null` (null if either is not valid `YYYY-MM-DD`).
- `returnsClosingSoon(purchases, todayISO, days = 14): object[]`: valid `returnByDate` with `0 <= daysBetween(today, returnByDate) <= days`, `status !== 'Returned'`, `!keepConfirmed`; ascending by `returnByDate`, ties in input order.
- `newOrderGroupId(): string` (`og-<ts36>-<rand6>`).
- `groupByOrder(purchases): Array<{ kind:'single', purchase } | { kind:'order', orderGroupId, purchases, subtotal }>`: entry sits at the first member's input position; an order's purchases sort by `lineNo` ascending, those without `lineNo` after numbered ones in input order; `subtotal` = sum of `netCost`; one-member groups emit `single`.
- `buildCostSegCsv(purchases): { csv, count }`: uses `netCost`; excludes `status === 'Returned'` from groups and `count`; adds a **"Funding Source"** column (value `fundingSource(p)`); a second preamble line `Contract-funded items are already inside the construction contract price; do not add them to basis a second time.`; header column "Cost Basis (net of refunds)"; class order map gains `supplies: 5`; trailing `Returned (excluded)` block (description, vendor, invoice #, paid, refund) only when at least one `Returned` purchase exists.

- [ ] **Step 1: Write failing tests:** `localISODate(new Date(2026,10,13)) === '2026-11-13'`; `daysBetween('2026-11-13','2026-11-27') === 14`, `('2026-11-13','nope') === null`, `('', '2026-11-13') === null`. `returnsClosingSoon` with today `'2026-11-13'` returns, in order, `returnByDate` `'2026-11-13'`, `'2026-11-20'` (status `'Return started'`), `'2026-11-27'`; excludes `'2026-11-28'`, `'2026-11-12'`, status `Returned`, `keepConfirmed:true`, `''`, `'garbage'`, bare `{id:'old'}` (no throw). `groupByOrder` on `[s1, a1{og-1,lineNo 2,totalPaid 10}, s2, a0{og-1,lineNo 1,totalPaid 30,refundAmount 5}, lone{og-2}]` → `[single s1, order og-1 {purchases [a0,a1], subtotal 35}, single s2, single lone]`; members without `lineNo` keep input order after numbered ones. `newOrderGroupId()` matches `/^og-[a-z0-9]+-[a-z0-9]{6}$/`, two calls differ. `buildCostSegCsv`: a `5-yr` line `totalPaid:120, refundAmount:100` exports `"20"` with group subtotal and grand total 20; a `Returned` line (class + date set) is absent from groups/grand total/`count` and its description appears after a `Returned (excluded)` row; no Returned → no block; a `supplies` group appears after the `27.5-yr` group; a `Return started` line with partial refund stays at net; the CSV contains the contract-funded note and a `"Funding Source"` header, and a Minoan-style line (`ownerPurchased:true, reimbursable:true`) shows `Contract (reimbursed by Sparrow)`. Update the existing tests deliberately: find the first data row instead of `body[2]`, and keep the `"175"` grand-total assertion working under the new column layout.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the functions and CSV changes (reuse the existing `esc`/`blanks` helpers; widen `blanks` to the new column count).
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit.** `feat(purchases): add returns-closing, order grouping and net-cost cost-seg export with funding source` (mention the deliberately updated cost-seg assertions).

---

### Task 4: Shared-receipt safety on the server

**Files:** Modify `api/_scope.js`, `api/receipts-view.js`, `api/purchases.js`, `api/receipts-delete.js`, `src/App.jsx` (the two client `fetch("/api/receipts-delete", …)` calls in `ReceiptUploader.removeReceipt` and `PurchaseForm.deleteBlobs`); Test `scripts/verify-logic.mjs`.

**Interfaces — produces** in `api/_scope.js`: `purchasesFromHash(map: object | null): object[]` (parses string/object values; `null` → `[]`); `isReceiptReferenced(purchases: object[], pathname: string, excludePurchaseId?: string): boolean` (true if any purchase other than `excludePurchaseId` has a `receipts[]` entry with that `pathname`; tolerates missing `receipts` and `null` entries). `receipts-delete` body gains optional `purchaseId` (excluded from the check).

- [ ] **Step 1: Write failing tests.** A and B both reference `receipts/pp/pur-a/r.pdf`: `isReceiptReferenced([A,B], path, 'pur-a') === true`; excluding `'pur-b'` → `true`; `isReceiptReferenced([A], path, 'pur-a') === false` (last reference gone; also the removal-race case where A's stored record still lists the path); unreferenced path → `false`; records with `receipts: undefined`, `[null]`, or absent don't throw. `purchasesFromHash(null)` → `[]`; mixed JSON-string and object values parse.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement the two helpers.**
- [ ] **Step 4: `api/receipts-view.js`:** require `isReceiptReferenced(purchasesFromHash(await redis.hgetall(scopedKey('purchases', parsed.propertyId))), pathname)`; keep shape validation and the 404.
- [ ] **Step 5: `api/purchases.js` DELETE:** read the whole hash once; `del()` only the deleted purchase's receipt pathnames with `isReceiptReferenced(list, pathname, id) === false`; then `hdel`. Keep best-effort try/catch.
- [ ] **Step 6: `api/receipts-delete.js`:** derive `propertyId` from `parseReceiptPathname`; skip the delete (respond `{ ok:true, kept:true }`) if referenced by any purchase other than body `purchaseId`; on Redis failure do **not** delete and still respond `{ ok:true }`.
- [ ] **Step 7: Client:** both `receipts-delete` calls send `purchaseId` (the prop in `ReceiptUploader`; `d.id` in `PurchaseForm`).
- [ ] **Step 8: Run `npm test` and `npm run build`.** Expected: pass / build succeeds.
- [ ] **Step 9: Commit.** `fix(receipts): never delete or hide a receipt blob that another purchase still references`

---

### Task 5: Purchase form, list, stats and reconciliation UI

**Files:** Modify `src/App.jsx` (imports; `loadPurchasesFromCache` ~3160; purchases fetch effect in `App`; `PurchaseForm`; `PurchasesView`).

**Interfaces — consumes:** Task 1–3 exports. **Produces:** the Purchases tab surfaces everything.

- [ ] **Step 1: Normalize on load** in `loadPurchasesFromCache` and in the purchases server-fetch `.then`, via `normalizePurchase`. No write-back.
- [ ] **Step 2: Form** (existing `field`/`set`/`ppInput` pattern; refs track "user touched" per area so defaults never override a manual choice):
  - Status select uses the 5 statuses; choosing `Returned` with blank `refundAmount` also sets `refundAmount: d.totalPaid`.
  - Asset class option labels use `assetClassLabel`.
  - Allowance: `allowanceTouched` ref; in the Trade and Paid-by `onChange`s, include `allowanceCategory` in the same patch when untouched and `defaultAllowanceFor(nextTrade, nextPaidBy)` is non-null. The Allowance select gains the `CONTRACTOR_SCOPE` option.
  - Reimbursement group: "Sparrow reimburses" checkbox (`reimbursable`; turning on sets `reimbursedBy` Sparrow and status `pending` if status was `none`, turning off resets to `none`), status select (`REIMBURSEMENT_STATUSES`; choosing `reimbursed` with blank `reimbursedAmount` pre-fills `netCost`), reimbursed amount, reimbursed date, draw #. A `reimbursementTouched` ref; the Vendor and Paid-by `onChange`s apply `reimbursementDefaultsFor(vendor, purchasedBy)` only while untouched.
  - Marketplace/payment group: Source vendor (text), Fees ($, also added to the existing `computedTotal`), Document type (blank + `DOC_TYPES`), "Payment confirmed" checkbox, and, when Paid by is Sparrow, "Lien waiver received" checkbox instead.
  - Returns group (Return-by date, policy note, refund amount, refund date, restocking fee, return shipping cost, "Decided to keep") and Receiving group (Inspected, Inspected date, Delivered to).
- [ ] **Step 3: Stats and reconciliation.** `useMemo(summarizePurchases)`, `reimbursementsDue`, `allowanceCredits`, `allowancePool` in `PurchasesView`. Cards: add **"Due from Sparrow"** (click toggles a `dueFilter`, showing a dismissible "Showing: due from Sparrow" chip and filtering the list to `reimbursementsDue(...).purchases`) and **"Owner-paid allowance items"** (`allowanceCredits.total`); rename "Total spent" → "Total spent (net of refunds)". Rebuild the Exhibit B table from `allowancePool(...).rows` with columns Category, Allowance, Paid by Sparrow, Reimbursed to owner, Owner direct, Remaining, % used; add rows/lines below it for **"Contractor scope (base contract)"** (total, with a note to confirm each is in the contract price) and **"Reimbursed, no Exhibit B category"**, and a pool summary line "$446,000 vs. charged {poolCharged}, remaining {poolRemaining}".
- [ ] **Step 4: List.** Row amount shows `fmtUSD(netCost(p))` with a muted `paid X · refunded Y` line when refunded; status badge when not `Ordered`; "refund not recorded" chip for `Returned` with null `refundAmount`; `paymentBadge(p)` chip when non-null; funding-source chip text from `fundingSource(p)`. Add a Trade filter `<select>` beside the search box (all trades present in `PURCHASE_TRADES`). Expanded read-only block adds the return, receiving, reimbursement (status, amount, draw #), source vendor, fees and doc-type lines when present. A **Keep** `<button>` (44px) shows when `p.returnByDate && !p.keepConfirmed && p.status !== 'Returned'` and calls `onSave({ ...p, keepConfirmed: true })`.
- [ ] **Step 5: Run `npm test` and `npm run build`.** Expected: pass / build succeeds. Then `npm run dev` and check the Purchases tab renders without console errors (data can't load locally).
- [ ] **Step 6: Commit.** `feat(purchases): surface returns, reimbursements, payment status and the funding-split allowance reconciliation`

---

### Task 6: Order grouping UI and "Add line to this order"

**Files:** Modify `src/App.jsx` (`PurchasesView` list render; `App` handler and prop).

**Interfaces — consumes:** `groupByOrder`, `newOrderGroupId`, `netCost`, `savePurchase`, `emptyPurchase`. **Produces:** `PurchasesView` prop `onAddLine: (source: object) => void`; `App.addLineToOrder(source)`.

- [ ] **Step 1: Handler.** `addLineToOrder(source)`: if `source.orderGroupId` is missing, `savePurchase({ ...source, orderGroupId: newOrderGroupId(), lineNo: 1 })`; then new line = `{ ...emptyPurchase(), vendor, invoiceNo, purchasedBy, ownerPurchased, paymentMethod, purchaseDate, docType, sourceVendor, reimbursable, reimbursedBy` from source, `reimbursementStatus: source.reimbursable ? 'pending' : 'none'`, `orderGroupId`, `lineNo` = 1 + max `lineNo` in that group, `receipts: source.receipts` (same objects), `placedInServiceDate: activeInServiceDate }`; `savePurchase(newLine)`; `setFocusPurchaseId(newLine.id)`; `setActiveView("purchases")`.
- [ ] **Step 2: Render grouped.** Extract the per-purchase card body into `renderPurchase(p)`; render `groupByOrder(filtered)`: `single` → `renderPurchase`; `order` → wrapper with header "Order · {vendor} · {invoiceNo || 'no invoice #'} · {n} lines · subtotal {fmtUSD(subtotal)}" containing the cards. Keep the existing sort of `filtered`.
- [ ] **Step 3: Button.** "Add line to this order" `<button>` (44px) in the expanded actions row; wire `onAddLine={addLineToOrder}`.
- [ ] **Step 4: Run `npm test` and `npm run build`.** Expected: pass / build succeeds.
- [ ] **Step 5: Commit.** `feat(purchases): group purchases by order and add "Add line to this order" with shared receipts`

---

### Task 7: Dashboard "Returns closing" and purchase deep link

**Files:** Modify `src/App.jsx` (`Dashboard`; `PurchasesView` focus effect; `App`: `handlePurchaseFocusCleared`, Dashboard render).

**Interfaces — consumes:** `returnsClosingSoon`, `localISODate`, `daysBetween`, `netCost`. **Produces:** `Dashboard` props `purchases`, `onOpenPurchase(id)`; `PurchasesView` prop `focusPurchaseMode: 'edit' | 'view'`.

- [ ] **Step 1: Deep-link mode.** `focusPurchaseMode` state in `App` (default `'edit'`; promote paths unchanged). `openPurchase(id)` sets mode `'view'`, `setFocusPurchaseId(id)`, `setActiveView('purchases')`. `handlePurchaseFocusCleared` resets mode to `'edit'`. In the `PurchasesView` focus effect, always set `expandedId`; set `editingId` only in `'edit'` mode.
- [ ] **Step 2: Dashboard section.** Pass `purchases` and `onOpenPurchase` to `Dashboard`. Between Action Items and "Task Progress by Category", render a "Returns closing" card **only when** `returnsClosingSoon(purchases, localISODate(), 14)` is non-empty. Each row is a `<button>`: description, vendor, "today" / "{n} days left", net cost; click → `onOpenPurchase(p.id)`.
- [ ] **Step 3: Run `npm test` and `npm run build`.** Expected: pass / build succeeds.
- [ ] **Step 4: Commit.** `feat(dashboard): list purchases whose return window closes within 14 days with a deep link`

---

### Task 8: Docs, full verification, hand-off

**Files:** Modify `CLAUDE.md` (Purchase data model with all new fields; 22 trades; statuses; asset class `supplies`; reimbursement/funding-source model; shared-receipt rule and the three routes' behavior), `docs/known-issues.md` (decisions 1–3, 6–13 as chosen behavior; "Add line" persists immediately like promote).

- [ ] **Step 1: Update both docs.** Do not describe Phases 2–3 as shipped.
- [ ] **Step 2: Full gate.** `npm test` (all checks pass) and `npm run build` (succeeds).
- [ ] **Step 3: Commit.** `docs: document Phase 1 returns, reimbursements, net cost and shared receipts`
- [ ] **Step 4: Hand-off (do not push or open the PR without Josh's OK).** Give Josh this preview-deploy checklist (spec §1.3):
  1. New trades appear in the form and the trade filter; asset class auto-suggests; section stays blank.
  2. A $40 Kerry toaster (Small Appliances) leaves Exhibit B Appliances remaining at $25,000.
  3. Both Minoan orders (fixtures A and B) paid by Josh: reimbursable/pending by default; "Due from Sparrow" shows **$7,685.47**; lighting under Electrical Fixtures as Reimbursed to owner; beds under "Reimbursed, no Exhibit B category"; "Owner-paid allowance items" $0.
  4. Marking fixture A reimbursed (draw # entered) drops "Due from Sparrow" to $588.67.
  5. Cost Seg CSV shows `Contract (reimbursed by Sparrow)` for every Minoan line and the contract-funded note.
  6. First Coast (fixture C) as Sparrow: closets in Shelving as Paid by Sparrow ($9,255 of $10,500, $1,245 left), shades under "Contractor scope (base contract)", both show "Contractor-paid: confirm in draw", neither counts as an owner-paid credit.
  7. $120 paid with $100 refund shows $20 in the row, cards, allowance table and CSV; a Returned purchase leaves the Cost Seg groups and appears in the excluded block.
  8. Two lines sharing one receipt: delete one, the receipt still opens from the other.
  9. A purchase with a return-by ≤14 days out appears on the Dashboard; clicking opens it expanded; **Keep** removes it.
  10. Old purchases load unchanged and nothing is rewritten.
  Then `git push -u origin phase1-purchases-returns`, `gh pr create` (body ends with the Claude Code attribution line) and **stop for sign-off before Phase 2**.

---

## Self-Review (spec §1 coverage, Revision 6)

- 1.1.1 trades (22) → T1; .2 asset classes → T1/T5; .3 allowance defaults + Contractor scope → T1 (logic), T5 (form + reconciliation line); .3a reimbursements, funding source, Due from Sparrow, credits, pool → T1 (fields/defaults), T2 (logic), T5 (cards/table); .3b marketplace/payment fields + badges → T1 (`paymentBadge`), T5; .4 order grouping + shared receipts → T3, T4, T6; .5 returns → T1, T5; .6 receiving → T1, T5; .7 net cost + CSV (`fundingSource`, note) → T1, T3, T5; .8 Dashboard + Keep → T5 (Keep), T7; .9 backward compatibility → T1, T5.
- 1.2 pure functions all present and tested: `suggestAssetClass`, `defaultAllowanceFor`, `fundingSource`, `reimbursementsDue`, `allowanceCredits`, `allowancePool`, `netCost`, `returnsClosingSoon`, `groupByOrder`, `buildCostSegCsv`.
- 1.3 acceptance: every bullet has a unit test (T1–T3 with fixtures A/B/C inlined) or a line in the T8 preview checklist.
- Consistency: `summarizePurchases` loses `byAllowance` (T1) and Task 5 reads allowance data only from `allowancePool` (T2).
