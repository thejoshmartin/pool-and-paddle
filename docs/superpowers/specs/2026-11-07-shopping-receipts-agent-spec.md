# Pool & Paddle: Shopping List, Receipt Inbox & Research Agent Interface

Spec for Claude Code. Written 2026-11-07. Owner: Josh (JM). Save to `docs/superpowers/specs/` and work it as brainstorm → plan → build, **one phase per PR, with Josh's sign-off before the next phase starts.**

**Revision 2 (2026-11-07), from three real receipts:** Minoan transaction fees and the observed tax base; the brand vendor behind each Minoan line; two new trades (Window Treatments, Closets & Shelving); owner-paid allowance credits; statement vs. paid receipt; ambiguity flags for handwritten receipts; real fixtures with expected outputs (section 3.7).

**Revision 3 (2026-11-07), "no dishes after every meal":** quantities now sized so the combined indoor + outdoor inventory covers a full day for 24 with one wash cycle a day; indoor/outdoor zones; outdoor material rules (no glass); small-appliance counts; a "meals covered" badge (sections 2.2, 2.3, 2.5, 2.6, 2.6a).

**Revision 4 (2026-11-07), First Coast resolved by Josh:** Sparrow pays First Coast. The statement is two line items: closets $9,255 and shades $9,732 (all 22 shades); total $18,987. Adds a "Contractor scope (base contract)" allowance option and contractor-paid handling (sections 1.1, 1.3, 3.7).

**Revision 5 (2026-11-07), Sparrow reimburses Minoan:** Josh and Kerry pay Minoan up front; Sparrow reimburses every Minoan purchase and carries it in the construction loan draws. Adds reimbursement tracking, a "Due from Sparrow" balance, a funding-source column for the CPA, and allowance-pool visibility for reimbursed items that have no Exhibit B category (sections 1.1, 1.2, 1.3, 2.2, 2.8, 3.7).

**Revision 6 (2026-11-07), locks the agent contract:** the research agent is being written in parallel as a Claude Skill run in Claude Cowork. Section 2.9 is the only coupling between this build and the agent. Adds candidate `tier` and `standardsCheck`, makes import forward-compatible, and defines how the master list seeds the Shopping tab (sections 2.4, 2.9, 2.12). **Build order: Phase 1 now; Phase 2 does not wait for the agent or the master list.**

---

## 0. Context

- Josh and Kerry own nothing for the house yet. This round stocks the whole house: small appliances, kitchen and dining for **24 people eating at one time**, linens, bath, supplies, game room, pool/outdoor.
- Buying window: Black Friday is **Fri Nov 27, 2026**; Cyber Monday is **Mon Nov 30**.
- Vendors: Amazon, Minoan (paid account), and anyone else. No vendor loyalty. Buy where **total landed cost** is best, with return risk visible.
  - Amazon 2026 holiday policy: purchases Nov 1 to Dec 31, 2026 returnable through Jan 31, 2027 (Apple-brand through Jan 15). Store as an editable vendor default in settings, not a code constant.
  - Minoan: returns and shipping follow **each brand's own policy**. Return windows must be captured per candidate, never assumed.
  - Minoan facts from Josh's actual receipts (Oct 2026):
    - Minoan is the merchant of record, but each line names the **brand vendor** that ships it (Ferguson Home, Lumens, Wayfair). The brand vendor governs the return window.
    - Every order carries a **transaction fee of about 3.2%** of the goods subtotal (3.19% and 3.24% on the two receipts). It is a real cost and must be in landed cost.
    - Sales tax worked out to **exactly 6.5% of goods + transaction fee** on both receipts.
    - Minoan's "Retail Price" and "Discount" are not a value signal. One order showed 9% off; another showed 78% off list. One line had no discount at all. Compare actual landed totals across vendors, never the claimed discount.
- A research agent is being built separately. In this round it never talks to the app directly. It reads an **export bundle** and returns a **results file** that Josh imports (section 2.6). That keeps the agent out of the auth model.
- Every hard rule in `04-Rules-Conventions-and-Known-Issues.md` applies. The ones this work touches most: hash + targeted HSET/HDEL only; everything per-property and added to `api/backup.js`; inline styles + `C` tokens; pure logic in `src/lib/*.js` with tests; receipts commit once on Save; `section` (§1245/§1250) never guessed; Blob stays Private.

**Phase order and why:** Phase 1 (Purchases) first because buying has effectively started and returns must be tracked from the first order. Phase 2 (Shopping) is the Black Friday critical path. Phase 3 (Receipt Inbox) can slip past Black Friday without harm because receipts simply queue.

| Phase | Target | Ships |
|---|---|---|
| 1 | Fri Nov 13 | Purchases: new trades, returns, order grouping, receiving, net cost |
| 2 | Thu Nov 19 | Shopping tab, quantities for 24, landed cost, agent export/import, Print for Kerry |
| 3 | Tue Nov 24 | Receipt Inbox with AI extraction and human review |
| 4 | Not this round | Ideas only (section 4) |

---

## 1. Phase 1: Purchases upgrades

### 1.1 Changes
1. **Trades** (17 → 22): add `Small Appliances`, `Kitchen & Dining`, `Supplies & Consumables`, `Window Treatments`, `Closets & Shelving`.
2. **Asset class** enum: add `supplies`, labeled "Supplies / expense (confirm with CPA)". Suggested classes: Small Appliances → 5-yr; Kitchen & Dining → 5-yr; Supplies & Consumables → `supplies`; Window Treatments → 5-yr; Closets & Shelving → 27.5-yr. Still suggestions, still overridable, `section` still blank. Decorative lighting, window treatments and built-ins are classic cost-seg judgment calls; the CSV label "suggested — confirm with CPA" covers them.
3. **Allowance defaults.**
   - When `purchasedBy` is Josh or Kerry and trade is Small Appliances, Kitchen & Dining, Supplies & Consumables, Window Treatments, Furniture / FF&E, Decor & Styling, Linens & Soft Goods or Electronics / AV, default `allowanceCategory` to "Not in Allowance / Owner FF&E". Reason: Exhibit B "Appliances $25,000" is Sparrow's major-appliance allowance; owner small-appliance buys must not draw it down.
   - Closets & Shelving defaults to the Exhibit B "Shelving" allowance; Electrical defaults to "Electrical Fixtures"; Plumbing defaults to "Plumbing Fixtures", **whoever paid**.
   - New allowance option **"Contractor scope (base contract)"** for items Sparrow pays for that have no Exhibit B category (e.g. window shades). It is the default when `purchasedBy` is Sparrow and no Exhibit B category applies. These items show in a separate reconciliation line so Josh can confirm each one is in the contract price and not a future change order.
   - User can always override.
3a. **Reimbursements and allowance credits.**
   - New fields: `reimbursable` (boolean), `reimbursedBy` (`"Sparrow (Contractor)"` | other), `reimbursementStatus` (`none | pending | requested | reimbursed`), `reimbursedAmount`, `reimbursedDate`, `drawNo`.
   - Default: any purchase whose `vendor` is in `settings.reimbursableVendors` (seed: Minoan) gets `reimbursable: true`, `reimbursedBy: "Sparrow (Contractor)"`, `reimbursementStatus: "pending"`. User can override per purchase.
   - Derived `fundingSource`: `"Owner direct"` (owner paid, not reimbursable), `"Contract (reimbursed by Sparrow)"` (owner paid, reimbursable), `"Contract (paid by Sparrow)"`.
   - **Allowance reconciliation** splits each Exhibit B category into **Paid by Sparrow**, **Reimbursed to owner** and **Owner direct**, still showing one Remaining. Reimbursed items with no Exhibit B category (e.g. Minoan beds, Black Friday small appliances bought on Minoan) appear in a line **"Reimbursed, no Exhibit B category"** and are added to a **pool view**: Exhibit B lets allowances move as a lump sum, so the card shows total $446,000 vs. everything charged against it, including these.
   - Stat card **"Due from Sparrow"**: sum of `netCost` where `reimbursable` and status is not `reimbursed`. Clicking filters to those purchases.
   - Stat card **"Owner-paid allowance items"** now counts only **Owner direct** purchases tagged to an Exhibit B category (credit to settle in writing). Reimbursable purchases never count here.
   - Pure functions `fundingSource(p)`, `reimbursementsDue(purchases)`, `allowanceCredits(purchases)` (excludes reimbursable), `allowancePool(purchases, allowances)`.
3b. **Marketplace and payment fields.** New fields: `sourceVendor` (the brand behind a marketplace order, e.g. vendor = Minoan, sourceVendor = Ferguson Home), `fees` (transaction/processing fees allocated to this line), `docType` (`receipt | invoice | statement | quote`), `paymentConfirmed` (boolean). A purchase whose `docType` is `statement` or `quote` defaults `paymentConfirmed` to false and shows an "Unpaid / no proof of payment" badge until a payment record is attached or the box is checked. **Exception:** when `purchasedBy` is Sparrow, the badge reads "Contractor-paid: confirm in draw" and a new boolean `lienWaiverReceived` replaces the payment check (contract §6: draw requests include supplier lien waivers).
4. **Order grouping.** New optional fields `orderGroupId` and `lineNo`. Purchases sharing an `orderGroupId` render grouped with an order subtotal. Several purchases may reference the same receipt pathname.
   - `receipts-delete` / blob cleanup must **not** delete a blob still referenced by any other purchase.
   - `receipts-view` already requires a referencing purchase; confirm it works when several do.
5. **Returns.** Status enum becomes `Ordered | Received | Installed | Return started | Returned`. New fields: `returnByDate`, `returnPolicyNote`, `refundAmount`, `refundDate`, `restockingFee`, `returnShippingCost`, `keepConfirmed` (boolean).
6. **Receiving.** New fields: `inspected` (boolean), `inspectedDate`, `deliveredTo` (`Home | Storage | Property | Other`).
7. **Net cost.** Derived `netCost = totalPaid − (refundAmount || 0)`. Stat cards, Exhibit B reconciliation and Cost Seg CSV use `netCost`. Fully `Returned` lines are excluded from the Cost Seg groups and listed in a trailing "Returned (excluded)" block. The Cost Seg CSV gains a **`fundingSource`** column and a header note: "Contract-funded items are already inside the construction contract price; do not add them to basis a second time."
8. **Dashboard.** New "Returns closing" list: purchases with `returnByDate` within 14 days, status not `Returned`, `keepConfirmed` false. Clicking deep-links to the purchase (existing `navigateToItem` pattern). A "Keep" button on the purchase sets `keepConfirmed` and drops it off the list.
9. **Backward compatibility.** Existing records get defaults on load (normalize in `emptyPurchase`-style helper). No migration writes.

### 1.2 Pure logic (`src/lib/purchases-logic.js`)
`suggestAssetClass` (extended), `defaultAllowanceFor(trade, purchasedBy)`, `fundingSource(p)`, `reimbursementsDue(purchases)`, `allowanceCredits(purchases)`, `allowancePool(purchases, allowances)`, `netCost(p)`, `returnsClosingSoon(purchases, todayISO, days)`, `groupByOrder(purchases)`, `buildCostSegCsv` (net cost, returned excluded). Tests in `scripts/verify-logic.mjs`.

### 1.3 Acceptance
- New trades appear in the form and filters; asset class auto-suggests correctly; section stays blank.
- Logging a $40 toaster bought by Kerry does not reduce the Exhibit B Appliances remaining.
- Logging both Minoan orders (fixtures A and B) as paid by Josh marks them reimbursable by Sparrow; "Due from Sparrow" shows **$7,685.47**; the lighting shows under Electrical Fixtures as **Reimbursed to owner**; the beds show under "Reimbursed, no Exhibit B category"; "Owner-paid allowance items" stays $0.
- Marking fixture A reimbursed (draw # entered) drops "Due from Sparrow" to $588.67.
- Cost Seg CSV shows `fundingSource` "Contract (reimbursed by Sparrow)" for every Minoan line.
- Purchases filed from the First Coast statement (fixture C) show purchased by Sparrow; the closets land in Exhibit B Shelving as **Paid by Sparrow** ($9,255 of $10,500, $1,245 remaining) and do **not** count toward "Owner-paid allowance items"; the shades land in "Contractor scope (base contract)"; both show "Contractor-paid: confirm in draw".
- A purchase with a $100 refund on $120 paid shows $20 everywhere totals appear.
- A Returned purchase disappears from Cost Seg groups and appears in the excluded block.
- Two purchases sharing one receipt: deleting one keeps the blob viewable from the other.
- Old purchases load unchanged.

---

## 2. Phase 2: Shopping tab

### 2.1 Storage and API
- Redis HASH `shopping:<propertyId>`. Fields: `item:<id>`, `settings`, and `item:<id>` tombstones `{id, __deleted:true}` (same pattern as finishes).
- `api/shopping.js`: GET (`HGETALL`) / PUT (`HSET` one validated field) / DELETE (`HDEL` one field). `?property=` **required** (400 without; no legacy data). Field names validated by strict regex. Values passed through `sanitizeShoppingItem` / `sanitizeShoppingSettings` (whitelist). Server stamps `updatedAt` / `updatedBy`.
- Add to `api/backup.js`.
- Client cache: localStorage allowed (no secrets), per property via `lsKey`, writes gated by `serverLoaded`, fetch effect with `isCancelled` guard. Copy the Purchases pattern exactly.

### 2.2 Settings (`settings` field)
```
{ guestCount: 24, bedrooms: 5, bathrooms: 5,
  mealsPerDay: 3, washesPerDay: 1,   // goal: run the dishwasher(s) once a day, not after each meal
  dishwashers: 1,                    // sealed plans show one (3rd-floor kitchen); update if a second is added
  budgetTarget: null,            // UI shows "Set target" until set
  readyDate: null,               // date the house can receive and test items
  defaultTaxRate: 0.065,         // observed on both Minoan receipts for 6401 Broward; editable
  vendorDefaults: {
    amazon: { name: "Amazon", transactionFeePct: 0, holidayReturnBy: "2027-01-31", note: "Nov 1–Dec 31 2026 purchases; Apple-brand Jan 15" },
    minoan: { name: "Minoan", transactionFeePct: 0.032, taxIncludesFees: true, reimbursedBy: "Sparrow (Contractor)", note: "Returns and shipping follow each brand's policy; fee observed 3.19–3.24%; Sparrow reimburses, funded through loan draws" } },
  reimbursableVendors: ["Minoan"] }
```

### 2.3 Shopping item (`item:<id>`, id `sh-<ts36>-<rand6>`)
```
{ id, name, category, room,
  zone: "indoor"|"outdoor"|"both",
  usesPerGuestPerDay: null|number,  // dishware/drinkware/flatware only; drives the meals-covered badge
  qtyRule: { basis: "guests"|"bedrooms"|"bathrooms"|"fixed", multiplier, fixedQty },
  qtyNeeded,                      // computed from qtyRule + settings; user may override
  qtyOverride: null|number,
  priority: "launch-critical"|"launch"|"nice-to-have",
  status: "researching"|"shortlisted"|"approved"|"ordered"|"received"|"kept"|"returned",
  candidates: [Candidate],
  selectedCandidateId, approvedBy: "JM"|"KM"|null, approvedAt,
  claimedBy: "JM"|"KM"|null,      // "I'm buying this" to prevent double-buys
  needBy, targetPrice,
  episodes: [epNumbers], finishItemId: null,
  agentFlag: { action: "buy-now"|"wait-for-sale"|"needs-review"|null, reason, flaggedAt },
  suggestedQty: null,             // agent suggestion, never auto-applied
  proposed: false,                // true = added by agent, awaiting human keep/dismiss
  purchaseIds: [], notes, userCreated, updatedAt, updatedBy }
```

### 2.4 Candidate (inside the item)
```
{ id, vendor, vendorType: "amazon"|"minoan"|"retail"|"restaurant-supply"|"other",
  url, sku, brand, model,
  sourceVendor,                   // brand behind a marketplace listing (Minoan)
  unitPrice, retailUnitPrice, packSize, qtyToBuy, shipping, transactionFeePct, estTax, discount, promoNote,
  returnWindowDays, returnByDate, returnShippingCost, restockingPct, freeReturns,
  deliveryEta, inStock, openStock, commercialGrade, warrantyTerm,
  rating, ratingCount, source: "agent"|"JM"|"KM", checkedAt, notes,
  tier: "best-value"|"upgrade"|null,
  standardsCheck: { pass: bool, failed: [string], notes } | null }   // agent's check against the buying standards
```
`openStock` = the pattern can be re-bought piece by piece later (matters for breakage replacement in a rental).

### 2.5 Categories and mapping to Purchase trade
| Shopping category | Purchase trade |
|---|---|
| Small Appliances | Small Appliances |
| Cookware & Bakeware, Dinnerware, Flatware, Glassware & Drinkware, Serveware & Entertaining, Kitchen Tools & Utensils, Food Storage, Bar & Coffee, Outdoor / Pool Dining | Kitchen & Dining |
| Linens & Towels | Linens & Soft Goods |
| Bath | Linens & Soft Goods |
| Cleaning & Laundry, Supplies & Consumables | Supplies & Consumables |
| Game Room & Recreation, Furniture | Furniture / FF&E |
| Electronics & Tech | Electronics / AV |
| Safety & First Aid, Other | Other |

"Outdoor / Pool Dining" items are flagged **non-glass** in the UI (pool deck). Outdoor material rules the agent must apply and the UI shows as a checklist on those items: premium heavy-gauge melamine for plates, bowls and serveware (dishwasher-safe; **not** microwave-safe, so it stays in the summer kitchen); Tritan or similar shatter-resistant, BPA-free drinkware that reads as glass; open stock; palette coordinates with the indoor set. Outdoor pieces go through the same dishwasher, so "dishwasher-safe" is required, not preferred.

### 2.6 Quantity rules (seed defaults, guests = 24, all editable)
**Standard:** the indoor and outdoor sets **combined** cover a full day of meals for 24 (with ~20% spare for breakage and late loads), so the dishwasher runs once a day. Each set alone covers at least one full meal for 24, so either set works when the weather moves everyone in or out.

Dishware and drinkware (seed as separate items per zone):
| Item | Uses / guest / day | Indoor (ceramic / glass) | Outdoor (melamine / Tritan) | Combined | Meals covered* |
|---|---|---|---|---|---|
| Dinner plates | 2 | 36 | 30 | 66 | 2.8 |
| Salad / dessert plates | 2 | 36 | 30 | 66 | 2.8 |
| All-purpose bowls | 2 | 36 | 30 | 66 | 2.8 |
| Coffee mugs | 1.25 | 36 | 0 | 36 | n/a (daily) |
| Everyday tumblers | 2.5 | 36 | 48 | 84 | n/a (daily) |
| Wine glasses (stemless outdoors) | 1.25 | 30 | 30 | 60 | n/a (daily) |
| Juice / small glasses | 1 | 24 | 0 | 24 | n/a (daily) |
| Kids' cups with lids | n/a | 0 | 12 | 12 | fixed |
| Serving platters | fixed | 6 | 4 | 10 | fixed |
| Serving bowls | fixed | 8 | 4 | 12 | fixed |
| Serving utensils | fixed | 16 | 8 | 24 | fixed |

\*Meals covered = combined ÷ guests. Target ≥ 2.5 for plates and bowls (breakfast typically uses bowls/small plates, lunch and dinner use dinner plates).

Flatware (`zone: both`, restaurant-grade stainless, bought by the dozen):
| Piece | Uses / guest / day | Qty |
|---|---|---|
| Dinner forks | 3 | 72 |
| Salad / dessert forks | 2 | 48 |
| Dinner knives | 2 | 48 |
| Steak knives | fixed | 24 |
| Teaspoons | 3 | 72 |
| Soup / dessert spoons | 1.5 | 36 |

Small appliances (sized for 24, `zone` as noted):
| Appliance | Qty | Why |
|---|---|---|
| 12–14 cup programmable drip coffee maker | 2 | One pot ≈ 6 mugs; mornings for 24 need two running |
| Single-serve coffee / espresso machine | 1 | Early risers and decaf |
| Electric kettle | 1 | Tea, pour-over, oatmeal |
| 4-slice toaster | 2 | Breakfast throughput |
| Electric griddle (large) | 2 | Pancakes and eggs for 24 in two batches, not six |
| Slow cooker 6–8 qt | 2 | Group dinners |
| Multi-cooker (pressure/rice) | 1 | |
| Large air fryer | 1 | |
| High-power blender | 1 indoor + 1 outdoor | Pool-day drinks stay in the summer kitchen |
| Food processor | 1 | |
| Hand mixer | 1 | |
| Countertop ice maker | 1 (outdoor) | Stopgap only; see the ice note in Josh's chat (built-in ice is a Kyle decision) |
| Large drink dispenser / cooler | 2 (outdoor) | |

Bath and bedroom linens keep their own rules (per bed / per bathroom), set by Josh; seed with `qtyOverride` placeholders.

Pure function `computeQty(item, settings)`; `qtyOverride` wins when set.

### 2.6a Meals-covered badge
Pure `mealsCovered(items, settings)`: for each dish type, sum `qtyNeeded` across zones (or owned quantity once purchased), divide by `guestCount`, and compare with `usesPerGuestPerDay ÷ washesPerDay`. Show a badge on the Shopping tab per dish type: green "covers a full day", amber "covers one meal", red "less than one meal for 24". Recomputes when guest count or purchases change. Test: 66 dinner plates at 24 guests and 2 uses/day → green.

### 2.7 Landed cost and best value (pure, `src/lib/shopping-logic.js`)
- `merchandise = unitPrice × qtyToBuy − discount`; `fees = merchandise × transactionFeePct` (candidate value, else the vendor default, else 0).
- `landedTotal(c) = merchandise + shipping + fees + estTax`. When `estTax` is blank it defaults to `defaultTaxRate × (merchandise + fees)` for vendors with `taxIncludesFees`, else `defaultTaxRate × merchandise`.
- Test case from fixture B: three beds, merchandise $535.41, fee 3.2386%, tax 6.5% → $588.67 within $0.01 (Minoan's own rounding differs by a cent).
- `retailUnitPrice` is display-only. Nothing ranks on "percent off retail".
- `returnExposure(c) = returnShippingCost + restockingPct × merchandise` (0 when `freeReturns`).
- `bestValue(item, settings)`: among `inStock` candidates whose `deliveryEta ≤ needBy` (if set), lowest `landedTotal`; ties broken by lower `returnExposure`, then earlier `deliveryEta`. Display only. A human selects.
- Warnings (pure `candidateWarnings`): return window closes before `settings.readyDate` ("can't test in the house before returns close"); price above `targetPrice`; not open stock for dinnerware/flatware/glassware; `checkedAt` older than 72 hours during Nov 20 to Dec 2.

### 2.8 UI
- New tab **Shopping** between Design and Purchases.
- Stat cards: Items, Approved, Ordered, **Forecast vs budget** (selected-candidate landed totals for unpurchased items + `netCost` of linked purchases, vs `budgetTarget`).
- Group by category or status. Filters: status, category, priority, agent flag, claimed by, vendor. Search.
- Expanded item: candidates side by side (vendor, landed total, per-unit, return-by, return exposure, delivery, in stock, source, checked at), Best Value badge, warning badges.
- Actions: Select candidate · Approve (stamps JM/KM) · Claim · Open link · **Mark purchased** → promote to a Purchase pre-filled (vendor, description, qty, unit price, trade from 2.5, allowance default from 1.1, `returnByDate` from candidate); item status → ordered; `purchaseIds` linked; ✓ shown. Same non-destructive promote pattern as Design. Candidates from a reimbursable vendor show a **"Sparrow reimburses (loan)"** tag; it does not change landed cost or Best Value, since the money is still part of the project cost, but it is visible when choosing between equal options.
- Agent proposals (`proposed:true`) show a "Keep / Dismiss" pair.
- Buttons: **Export for agent**, **Import agent results**, **Print for Kerry**.

### 2.9 Agent interface
**Export bundle** (download `pp-shopping-export-<date>.json`):
```
{ schema: "pp-shopping-export/v1", exportedAt, propertyId,
  settings, items: [all non-deleted items],
  research: {
    episodes: [ { ep, title, keyInsight, tags } ]   // podcast-data.json, non-gimmick,
                                                      // priority critical|high, categories
                                                      // Furnishing & Design, Guest Experience, Operations
    tools: [ procurement-relevant entries from tools-data.json ] } }
```
**Results file** (agent returns, Josh imports):
```
{ schema: "pp-shopping-results/v1", generatedAt, propertyId,
  updates: [ { itemId, addCandidates: [Candidate], agentFlag, suggestedQty, notes } ],
  newItems: [ { name, category, room, qtyRule, priority, candidates, agentFlag, notes } ] }
```
Import rules (pure `validateResults` + `mergeResults`):
- Reject on wrong schema or mismatched `propertyId`.
- Candidates dedupe on `vendor + (sku || url)`; a duplicate updates price/stock fields and `checkedAt`.
- New items land as `proposed:true`, status `researching`.
- The agent can **never** set `status` past `shortlisted`, `approvedBy`, `claimedBy`, `selectedCandidateId`, `qtyNeeded`/`qtyOverride`, or delete anything. Those fields are ignored if present.
- Preview screen lists adds and changes; Apply writes one targeted HSET per touched item (never a whole-hash write).
- **Forward-compatible:** `v1` may gain additive optional fields while the agent is written. Unknown fields on candidates and items are preserved on import, not rejected; only a different major schema (`/v2`) is rejected.

### 2.12 Seed data (master list)
Josh and Claude are building **Master List v1** as a spreadsheet in parallel. Ship Phase 2 seeded from `src/shopping-seed.json`; until the master list arrives, generate that file from the tables in 2.6. Add `scripts/parse-shopping-list.py` (same pattern as `parse-finishes.py`) to turn the master list spreadsheet into `shopping-seed.json`. Seed items merge like `mergeTasks` / `mergeFinishes`: defaults rebuilt from the seed, saved user edits win, user-created items kept, so re-seeding later never overwrites decisions already made.

### 2.10 Print for Kerry
A print-friendly view (approved and shortlisted items by category: item, qty, chosen vendor, landed total, return-by, notes) using inline styles; button calls `window.print()` so Kerry gets a PDF via Save as PDF. No new libraries.

### 2.11 Acceptance
- Changing guest count from 24 to 20 recomputes rule-based quantities but not overrides.
- Best Value picks correctly across an Amazon and a Minoan candidate with different shipping and return costs (unit tests).
- Importing a results file adds candidates and proposals without touching approvals, claims or selections; importing the same file twice changes nothing.
- Mark purchased creates a correctly pre-filled Purchase and links both ways.
- Backup includes `shopping:<id>`.

---

## 3. Phase 3: Receipt Inbox with auto-processing

### 3.1 Flow
Upload one or many receipts (phone or desktop) → each becomes an inbox record → server extracts line items with Claude → Josh reviews in one screen → **Accept** creates Purchases. Nothing is filed without a human click.

### 3.2 Storage and routes
- Redis HASH `receipt-inbox:<propertyId>`, field = inbox id `ri-<ts36>-<rand6>`:
```
{ id, status: "pending"|"extracted"|"needs-manual"|"filed"|"dismissed",
  receipt: { pathname, name, contentType, uploadedAt },
  extraction: { docType: "receipt"|"invoice"|"statement"|"quote",
                vendor,                       // merchant of record (Minoan, Amazon, First Coast…)
                orderNo, orderDate, paidDate, paymentMethod, cardLast4,
                customerName, shipTo,         // used only for the address check
                handwritten: bool,
                lines:[ExtractedLine], retailTotal, subtotal, tax, shipping, fees,
                discounts, total, amountPaid, reconciles: bool,
                issues: [string],             // model-reported ambiguities, verbatim to the UI
                model, extractedAt } | null,
  error, purchaseIds: [], updatedAt, updatedBy }
ExtractedLine = { lineNo, description, sourceVendor, sku, qty,
                  retailUnitPrice, unitPrice, lineTotal,
                  roomHint,                    // only when printed on the receipt ("Pantry")
                  suggestedTrade, suggestedCategory, confidence: 0-1,
                  matchItemId, matchScore, decision: "accept"|"skip"|null }
```
- `api/receipt-inbox.js` GET / PUT / DELETE (hash pattern, `?property=` required, sanitized, stamped). Add to `api/backup.js`.
- `api/receipt-extract.js` POST `{ property, inboxId }`: reads the private blob server-side, calls the Anthropic API, validates the JSON, writes `extraction`.
- Blob path `receipts/<pid>/inbox/<inboxId>/<file>`. Extend `parseReceiptPathname` and `receipts-view` so a pathname referenced by a real inbox record **or** a real purchase is viewable. Filing does not copy the blob; purchases reference the same pathname. Deleting an inbox record deletes the blob only if no purchase references it.

### 3.3 Model call
- Env `ANTHROPIC_API_KEY`, **server-side only. Never a `VITE_` name** (those ship to the browser). Add to `.env.example`.
- Model id in one constant `EXTRACTION_MODEL`; choose a current Sonnet-class model after checking Anthropic's docs. Send images/PDFs as base64 documents. Ask for JSON only; strip fences; validate.
- Prompt rules:
  - `suggestedTrade` must be one of the 22 Purchase trades; do not output asset class or tax section.
  - Extract only the last 4 of any card, never full numbers.
  - One line per distinct product. For marketplace receipts (Minoan), put the per-line vendor column in `sourceVendor`.
  - Report order-level tax, shipping, transaction/processing fees and discounts as separate fields. Never fold fees into tax or shipping.
  - Classify `docType`. A "Statement" or "Estimate" with no payment shown is not a paid receipt.
  - **Never resolve an ambiguity by guessing.** If a total is blank, a number could be a line price or a running total, a quantity has no price, or handwriting is unclear, set the field to null and describe it in `issues`.

### 3.3a Address check
Pure `addressMatches(shipTo, propertyAddress)` compares street number + street name. A mismatch shows a warning ("Receipt says 3401 Broward; property is 6401 Broward. Ask the vendor for a corrected copy for your records."). It never blocks filing.

### 3.4 Pure logic (`src/lib/receipt-logic.js`)
- `validateExtraction(json)`: shape + enum checks.
- `reconciles(extraction)`: lines + tax + shipping + fees − order-level discounts within $0.05 of total; otherwise flag "totals don't reconcile" in the UI. (Minoan line totals are already net of the Minoan discount; do not subtract it twice.)
- `allocateOrderCosts(lines, { tax, shipping, fees, discounts })`: allocate each order-level amount separately, pro rata by line total, rounded half-up to cents, remainder on the largest line, so each allocated column and the grand total sum exactly to the receipt. The purchase gets `tax`, `shipping`, `fees` and `totalPaid = lineTotal + its allocations`.
- `matchLines(lines, shoppingItems)`: exact SKU/ASIN against candidates first, then normalized-name similarity; returns best item and score; below threshold = no match.
- `findDuplicates(extraction, purchases, inbox)`: same vendor + orderNo, or same file already in inbox.
- Asset class comes from the existing `suggestAssetClass(trade)`, never from the model. `section` stays blank.

### 3.5 Review UI (Purchases tab, "Receipt Inbox" panel)
- Upload uses the existing two-trigger `ReceiptUploader` pattern ("Choose photo or file" multi-select + "Take photo"), HEIC → JPEG as today.
- Each record shows the receipt, vendor, total, reconcile status and lines. Per line: trade (editable), linked shopping item (editable), **Accept / Skip** (Skip covers personal items on a shared Amazon order).
- **Accept all** for the fast path; **File** creates one Purchase per accepted line with shared `orderGroupId`, allocated tax/shipping, `purchasedBy` and `paymentMethod` chosen once for the order, `returnByDate` from the linked shopping candidate if any. Linked shopping items move to `ordered`.
- Low-confidence lines (< 0.7) are highlighted.

### 3.6 Failure handling
- Extraction error, timeout or invalid JSON → `needs-manual`, error shown, receipt safe, "Retry" button; the manual purchase form is unaffected.
- Totals don't reconcile → can still file, with a visible warning.
- `issues` not empty → show them at the top of the record; **"Accept all" is disabled**; each line must be accepted individually and any null price filled in by hand.
- `docType` statement/quote → purchases file with `paymentConfirmed: false`.
- `handwritten` → every line starts at confidence ≤ 0.7, so all lines are highlighted for review.
- Duplicate detected → warn before filing.

### 3.7 Fixtures (real receipts, Oct–Nov 2026)
Store **expected-output JSON only** in `scripts/fixtures/receipts/` (the PDFs contain name and address; they stay in Blob and with Josh, not in git). Tests run `validateExtraction`, `reconciles`, `allocateOrderCosts`, `addressMatches` against these. No live API calls in `npm test`. Add an Amazon multi-item fixture when Josh supplies one.

**Fixture A: Minoan #F3F3D4B0** (`minoan-F3F3D4B0.json`). docType receipt; paid 2026-10-23; credit card; ship to 6401 Broward Street, Anastasia Island FL 32080. Retail $7,099.18, Minoan discount $641.23, subtotal $6,457.95, shipping $0.00, fees $205.72, tax $433.13, total/paid $7,096.80. reconciles: true. issues: []. Filed purchases: `purchasedBy: Josh`, `reimbursable: true`, `reimbursementStatus: pending`.

| # | Item | sourceVendor | Qty | Retail unit | Unit paid | Line | Fee alloc | Tax alloc | Total paid | Trade |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Kohler Expanse 60–72" curved shower rod, matte black | Ferguson Home | 1 | 121.16 | 109.04 | 109.04 | 3.47 | 7.31 | 119.82 | Plumbing |
| 2 | Minka Lavery Vantage 24" LED bath bar, coal | Ferguson Home | 11 | 134.83 | 125.10 | 1,376.10 | 43.84 | 92.29 | 1,512.23 | Electrical |
| 3 | Modern Forms Twilight 2-light outdoor wall sconce, black | Ferguson Home | 7 | 398.70 | 398.70 | 2,790.90 | 88.90 | 187.19 | 3,066.99 | Electrical |
| 4 | Nido linear suspension, matte black | Lumens | 1 | 990.00 | 772.20 | 772.20 | 24.60 | 51.79 | 848.59 | Electrical |
| 5 | Nido pendant, medium, matte black | Lumens | 3 | 398.00 | 310.44 | 931.32 | 29.67 | 62.46 | 1,023.45 | Electrical |
| 6 | Hurleigh 14-light crystal globe chandelier, matte black | Wayfair | 1 | 519.99 | 478.39 | 478.39 | 15.24 | 32.09 | 525.72 | Electrical |
| | **Totals** | | | | | **6,457.95** | **205.72** | **433.13** | **7,096.80** | |

Line 1 trade is a judgment call (shower rod could be Plumbing Fixtures or Interior Hardware allowance); the test asserts only that it is one of the 22 trades and flagged confidence < 0.9.

**Fixture B: Minoan #F088F252** (`minoan-F088F252.json`). docType receipt; paid 2026-10-26; credit card; ship to 6401 Broward. Retail $2,399.91, Minoan discount $1,864.50, subtotal $535.41, shipping $0.00, fees $17.34, tax $35.92, total/paid $588.67. reconciles: true. issues: []. Filed purchases: `purchasedBy: Josh`, `reimbursable: true`, `reimbursementStatus: pending`; allowance "Reimbursed, no Exhibit B category".

| # | Item | sourceVendor | Qty | Retail unit | Unit paid | Line | Fee alloc | Tax alloc | Total paid | Trade |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Dunphy upholstered platform bed, adjustable headboard, king, white | Wayfair | 1 | 1,039.96 | 196.87 | 196.87 | 6.38 | 13.21 | 216.46 | Furniture / FF&E |
| 2 | Dunphy upholstered platform bed, adjustable headboard, king, acid blue | Wayfair | 1 | 959.96 | 182.15 | 182.15 | 5.90 | 12.22 | 200.27 | Furniture / FF&E |
| 3 | King velvet upholstered platform bed, wooden slats, black | Wayfair | 1 | 399.99 | 156.39 | 156.39 | 5.06 | 10.49 | 171.94 | Furniture / FF&E |
| | **Totals** | | | | | **535.41** | **17.34** | **35.92** | **588.67** | |

**Fixture C: First Coast Closets & Window Fashions statement #687** (`firstcoast-687.json`). The ambiguity test, with Josh's resolution. docType **statement**; dated 2026-11-05; handwritten: true; customer "Josh + Kerry Martin, 3401 Broward" (address check must warn); no tax line; no payment shown; TOTAL box blank. Lines (all closets white finish; `roomHint` = the printed label):

| # | Item | Qty | Line | Trade |
|---|---|---|---|---|
| 1 | Closet system, Laundry Room | 1 | 525.00 | Closets & Shelving |
| 2 | Closet system, Pantry | 1 | 3,525.00 | Closets & Shelving |
| 3 | Closet system, Catch-all 2nd floor | 1 | 1,300.00 | Closets & Shelving |
| 4 | Closet system, Master | 1 | 1,350.00 | Closets & Shelving |
| 5 | Closet system, Middle 2nd floor | 1 | 465.00 | Closets & Shelving |
| 6 | Closet system, West 2nd floor | 1 | 280.00 | Closets & Shelving |
| 7 | Closet system, Middle 1st floor | 1 | 280.00 | Closets & Shelving |
| 8 | Closet system, West 1st floor | 1 | 280.00 | Closets & Shelving |
| 9 | Closet system, Coat closet | 1 | 250.00 | Closets & Shelving |
| 10 | Closet system, Under stairs | 1 | 1,000.00 | Closets & Shelving |
| 11 | Semi-sheer / light-filtering roller shades, Precision Lift | 12 | 9,732.00 | Window Treatments |
| 12 | Room-darkening roller shades, Precision Lift | 10 | **null** | Window Treatments |

**Raw extraction (what the model must return):** `total: null`, `reconciles: false`, line 12 price null, and `issues` containing, in substance: (1) "$18,987 is written beside the room-darkening shades but equals closets $9,255 + light-filtering shades $9,732 exactly; it may be the order total rather than a line price"; (2) "TOTAL box is blank"; (3) "statement, no payment recorded"; (4) "customer address 3401 Broward does not match property". Closets sum $9,255.00 is asserted. The model must not resolve this itself.

**Resolved filing (what Josh confirmed, 2026-11-07):** $9,732 covers **all 22 shades** (12 light-filtering + 10 room-darkening); $18,987 is the order total. In the review UI Josh merges lines 11 and 12 into one shade line and enters the total. Expected purchases (`purchasedBy: "Sparrow (Contractor)"`, `docType: statement`, `lienWaiverReceived: false`, one `orderGroupId`, tax 0, shipping 0, fees 0):

| Purchase | Qty | Total | Trade | Allowance | Suggested class |
|---|---|---|---|---|---|
| Closet systems, 10 lines as listed above (one purchase per closet, `roomHint` kept) | 10 | 9,255.00 | Closets & Shelving | Shelving (Exhibit B) | 27.5-yr |
| Roller shades, Precision Lift: 12 light-filtering + 10 room-darkening | 22 | 9,732.00 | Window Treatments | Contractor scope (base contract) | 5-yr |
| **Order total** | | **18,987.00** | | | |

Tests: the resolved order reconciles to $18,987.00; Shelving reconciliation shows $9,255 paid by Sparrow and $1,245 remaining; `allowanceCredits` excludes all fixture C purchases.

### 3.8 Acceptance
- A 12-line Amazon invoice with 2 personal items becomes 10 Purchases in under a minute of clicking, tax and shipping summing exactly to the receipt.
- Every created Purchase opens the same receipt.
- Killing the API key produces `needs-manual`, not a crash.
- Nothing appears in Purchases until File is clicked.

---

## 4. Not this round (record, don't build)
Agent writes directly to the app via a scoped token or MCP limited to `shopping:<id>`; email-forwarding receipts into the inbox; price history and price-drop alerts; Amazon order report import; a receipt-blob reconcile cron.

## 5. Verification gate for every phase
`npm test` + `npm run build`, then verify persistence, receipts and import on a Vercel deploy (no staging). Commit messages imperative, 1–2 sentences, co-author tag. Stop after each phase for Josh's sign-off.
