# Phase 3: Receipt Inbox with AI Extraction and Human Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload one or many receipts, have the server read them with Claude into line items, review everything on one screen, and on **File** create correctly-allocated Purchases (one per accepted line, one shared order group, one shared receipt). Nothing is filed without a human click, and an extraction failure never blocks the manual flow.

**Architecture:** Same patterns as Purchases/Shopping. A Redis hash `receipt-inbox:<propertyId>` (one field per inbox record, single-record HSET/HDEL, `?property=` required, server whitelist + stamp) behind `api/receipt-inbox.js`; a server-only `api/receipt-extract.js` that reads the private blob, calls Anthropic through the official SDK (helper in `api/_extract.js`, testable with a fake client), validates, and writes the extraction; all decisions are pure in `src/lib/receipt-logic.js` (validation, reconcile, cost allocation, line matching, duplicate/address checks, purchase building) and tested against the spec's three real fixtures. The review UI is a "Receipt Inbox" panel on the Purchases tab.

**Tech Stack:** React 18 single-file SPA, Vercel Node functions, `@anthropic-ai/sdk` (already a dependency, 0.74.0), Upstash Redis hash, private Vercel Blob, plain-node assert tests.

**Spec:** `docs/superpowers/specs/2026-11-07-shopping-receipts-agent-spec.md` (Revision 6, §3 only). Phase 4 ideas are out of scope. The §2.9 agent file formats are untouched.

## Global Constraints

- Hash `receipt-inbox:<propertyId>`, field = inbox id `ri-<ts36>-<rand6>`; targeted single-record HSET/HDEL; `?property=` **required** (400 without); add to `api/backup.js`.
- Inbox record shape and `ExtractedLine` shape exactly as spec §3.2 (status `pending|extracted|needs-manual|filed|dismissed`; extraction fields docType, vendor, orderNo, orderDate, paidDate, paymentMethod, cardLast4, customerName, shipTo, handwritten, lines, retailTotal, subtotal, tax, shipping, fees, discounts, total, amountPaid, reconciles, issues, model, extractedAt).
- Blob path for inbox uploads: `receipts/<pid>/inbox/<inboxId>/<file>` (store stays **Private**). A pathname referenced by a real inbox record **or** a real purchase is viewable. Filing never copies the blob. Deleting an inbox record deletes the blob only if no purchase (and no other inbox record) still references it.
- `ANTHROPIC_API_KEY` is **server-side only, never a `VITE_` name**; add it to `.env.example`. Model id in one constant `EXTRACTION_MODEL` (`claude-sonnet-5-5`). Images/PDFs sent as base64 `image`/`document` blocks; ask for JSON only, strip code fences, validate. On `claude-sonnet-5-5`: no `temperature`/`top_p`/`top_k`, no forced `tool_choice`, no prefill, `thinking` omitted (default adaptive).
- Prompt rules (§3.3): `suggestedTrade` must be one of the 22 Purchase trades; never output asset class or tax section; only the last 4 of any card number; one line per distinct product; marketplace per-line vendor → `sourceVendor`; order-level tax, shipping, fees and discounts reported separately (never folded); classify `docType` (a statement/estimate with no payment shown is not a paid receipt); **never resolve an ambiguity by guessing** — null the field and describe it in `issues`.
- `reconciles`: lines + tax + shipping + fees − order-level discounts within $0.05 of `total`; Minoan line totals are already net of the Minoan discount, so it is never subtracted twice. `allocateOrderCosts`: each order-level amount allocated separately, pro rata by line total, rounded half-up to cents, remainder on the largest line, so every column and the grand total sum exactly; purchase `totalPaid = lineTotal + tax + shipping + fees − discounts` allocation.
- Failure handling (§3.6): extraction error/timeout/invalid JSON/missing key → `needs-manual` with the error shown and a Retry button (receipt safe); non-reconciling totals still file with a warning; non-empty `issues` shown at top and **Accept all disabled**; statement/quote → purchases file with `paymentConfirmed:false`; handwritten → every line confidence ≤ 0.7; duplicate → warn before filing; address mismatch warns, never blocks.
- Asset class always from `suggestAssetClass(trade)`, `section` stays blank, `allowanceCategory` from `defaultAllowanceFor`, reimbursement from `reimbursementDefaultsFor` (settings vendor list).
- UI rules: inline styles + `C` tokens, `<button>` not `<div onClick>`, inputs ≥16px (`ppInput`), targets ≥44px; two-trigger upload ("Choose photo or file" multiple + "Take photo" with `capture`), HEIC→JPEG as today (`buildReceiptUpload`).
- No live API calls in `npm test`. Commit messages imperative, ending `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Gate: `npm test` + `npm run build` + SSR smoke + a Playwright run against a fake backend (extraction faked), then Josh verifies on a deploy with the real key. **Do not push or open a PR without Josh's OK.**

## Decisions made while planning (Josh: veto any)

1. Model `claude-sonnet-5-5` (spec: "a current Sonnet-class model"); non-streaming, `max_tokens` 16000, client timeout 120 s, 1 retry, so a hang becomes `needs-manual` quickly.
2. Refusals (`stop_reason: "refusal"`) are treated as extraction errors → `needs-manual` (no server-side fallback beta: it can't be verified without an API key here).
3. `validateExtraction` is strict about structure (object, valid `docType`, `lines` array → else error) but **normalizes** line-level problems: unknown trade → `Other` with an added issue; confidence clamped to 0–1; numbers parsed from `"$1,234.50"`; `cardLast4` reduced to 4 digits and any run of ≥12 digits anywhere is redacted; `handwritten` caps every line at 0.7. `reconciles` is recomputed here, never trusted from the model.
4. Duplicate-file detection uses a SHA-256 of the original file bytes computed in the browser and stored as `receipt.hash` (no content is compared on the server).
5. Line matching to shopping items: exact SKU/ASIN against candidates first (score 1), then name similarity (Dice coefficient on word bigrams after normalizing), threshold 0.6; below threshold = no match. A matched candidate also supplies `returnByDate` (same-SKU candidate, else the item's selected candidate).
6. Merge: a **"Merge into line above"** button sums quantity, sums non-null line totals (null + value = value), and joins descriptions — this is how fixture C's two shade lines become one 22-unit line; the order total is an editable field when the model returned `null`.
7. Inbox records are not cached in localStorage (they carry addresses and payment hints); the panel shows a loading state. Review edits write per record, debounced 500 ms, flushed on hide/unload.
8. Filing links shopping items: each matched item gets the new purchase ids appended and moves to `ordered` unless already received/kept/returned.
9. `purchasedBy` and `paymentMethod` are chosen once per order in the review card; `purchasedBy` defaults from the extraction's `paymentMethod`/vendor only to blank (never guessed).

## Review Focus

1. **Exact cents:** every allocated column and the grand total equal the receipt for odd cent remainders, single-line orders, zero tax, null lines, and negative discounts (Task 1).
2. **Model output hostility:** fenced JSON, prose around JSON, string numbers, missing arrays, a full 16-digit card number in any field, an invalid trade — never crashes, never stores a full card number (Tasks 1, 3).
3. **No key / API failure** produces `needs-manual` and a Retry that works; a successful retry replaces the error (Task 3, Task 5).
4. **Shared receipt safety:** inbox blobs are viewable, survive filing (purchases reference the same pathname), and are only deleted when nothing references them (Task 4).
5. **Nothing silently filed:** filing is a single explicit action; skipped lines and unaccepted lines create no purchases; double-click cannot file twice (Task 5).

---

## File Structure

| File | Change |
|---|---|
| `src/lib/receipt-logic.js` | **New.** Constants, ids, `validateExtraction`, `reconciles`, `allocateOrderCosts`, `matchLines`, `findDuplicates`, `addressMatches`, `mergeLines`, `fileProblems`/`canAcceptAll`, `buildPurchasesFromInbox`, `sanitizeInboxRecord` |
| `scripts/fixtures/receipts/*.json` | **New.** Expected extraction JSON for fixtures A, B, C (no PDFs) |
| `api/_extract.js` | **New.** Prompt + `extractReceipt({ client, … })` (testable with a fake client) |
| `api/receipt-extract.js` | **New.** POST `{ property, inboxId }` |
| `api/receipt-inbox.js` | **New.** GET / PUT / DELETE |
| `api/_scope.js`, `api/receipts-upload.js`, `api/receipts-view.js`, `api/receipts-delete.js`, `api/backup.js` | Inbox-aware paths, references, backup |
| `src/App.jsx` | Inbox state + persistence, upload/extract flow, `ReceiptInboxPanel` on the Purchases tab |
| `.env.example`, `CLAUDE.md`, `docs/known-issues.md`, `scripts/try-extraction.mjs` | Env var, docs, manual extraction script |
| `scripts/verify-logic.mjs` | New sections per task |

---

### Task 1: Extraction validation, reconcile, cost allocation + fixtures (pure)

**Files:** Create `src/lib/receipt-logic.js`, `scripts/fixtures/receipts/{minoan-F3F3D4B0,minoan-F088F252,firstcoast-687}.json`; Test `scripts/verify-logic.mjs`.

**Interfaces — produces** (exported):
- `EXTRACTION_MODEL = "claude-sonnet-5-5"`, `RECEIPT_STATUSES = ["pending","extracted","needs-manual","filed","dismissed"]`, `LOW_CONFIDENCE = 0.7`, `newInboxId(): string` (`ri-<ts36>-<rand6>`), `redactCardNumbers(text: string): string`.
- `validateExtraction(json, now?): { ok:true, extraction } | { ok:false, error }` per Decision 3. Normalized line: `{ lineNo, description, sourceVendor, sku, qty, retailUnitPrice, unitPrice, lineTotal, roomHint, suggestedTrade, suggestedCategory, confidence, matchItemId:null, matchScore:null, decision:null }`; extraction gets `reconciles` recomputed, `issues` as strings, `model`/`extractedAt` filled when absent.
- `reconciles(extraction): boolean`.
- `allocateOrderCosts(lines, { tax, shipping, fees, discounts }): Array<{ tax, shipping, fees, discounts, totalPaid }>` aligned to `lines`; lines with a null `lineTotal` receive zero and are excluded from the pro-rata base.

- [ ] **Step 1: Write the three fixture JSONs** from spec §3.7 (expected model output; `minoan-*` with `discounts: 0`, `retailTotal` 7099.18 / 2399.91; fixture C as the raw ambiguous extraction: `total: null`, `reconciles: false`, line 12 `lineTotal`/`unitPrice` null, `handwritten: true`, the four `issues`, `shipTo: "3401 Broward"`, `docType: "statement"`). Include per-line expected allocations from the spec tables in a `_expected` key (ignored by the validator).
- [ ] **Step 2: Write failing tests:**
  - Fixtures A and B pass `validateExtraction`, `reconciles` is true, and line 1 of A has a valid trade and `confidence < 0.9`; fixture C passes validation (it is a valid *ambiguous* extraction), `reconciles` is false, issues preserved verbatim, handwritten caps every confidence at ≤ 0.7, closets' `lineTotal` sum is exactly 9255.00.
  - `allocateOrderCosts` for A: each of the fee and tax columns equals the spec table to the cent **exactly** (fees 3.47, 43.84, 88.90, 24.60, 29.67, 15.24; tax 7.31, 92.29, 187.19, 51.79, 62.46, 32.09) and the `totalPaid` column equals 119.82, 1512.23, 3066.99, 848.59, 1023.45, 525.72; sums equal 205.72 / 433.13 / 7096.80. Same for B (fees 6.38, 5.90, 5.06; tax 13.21, 12.22, 10.49; totals 216.46, 200.27, 171.94).
  - Review Focus 1: odd-cent remainder on the largest line (3 lines of $10.00 with $0.01 tax → one line gets it, sum exact); single line takes everything; zero tax allocates zeros; a null-total line gets 0 and is skipped; a negative-discount order (`discounts: 5`) subtracts and still sums exactly; `lines: []` → `[]`; all-zero line totals with an amount → whole amount on the first line.
  - `reconciles`: false when `total` is null; true within $0.05 and false at $0.06 off; false when any line total is null; Minoan discount is not subtracted again (A reconciles with `discounts: 0`, and would not with `discounts: 641.23`).
  - Hostile model output (Review Focus 2): `"$1,234.50"` strings parse; `cardLast4: "4111 1111 1111 1111"` → `"1111"`; a 16-digit number inside `issues`, `notes`-like text, `description`, or `paymentMethod` is redacted; unknown trade → `Other` + an added issue; confidence `7` clamps to 1 and `-1` to 0; missing `lines` → error; non-object / array / null / string → error; invalid `docType` → error; `lines` entries that are not objects → error; huge `issues` arrays are capped.
- [ ] **Step 3: Run `npm test`.** Expected: FAIL (missing module).
- [ ] **Step 4: Implement** the Interfaces block (integer-cent arithmetic for allocation; largest line = first of the maximum `lineTotal`).
- [ ] **Step 5: Run `npm test`.** Expected: pass.
- [ ] **Step 6: Commit.** `feat(receipts): add extraction validation, reconcile and exact order-cost allocation with the spec fixtures`

---

### Task 2: Matching, duplicates, address check, merge, filing (pure)

**Files:** Modify `src/lib/receipt-logic.js`; Test `scripts/verify-logic.mjs`.

**Interfaces — consumes:** Task 1; `purchases-logic.js` (`emptyPurchase`, `PURCHASE_TRADES`, `defaultAllowanceFor`, `reimbursementDefaultsFor`, `suggestAssetClass`, `NOT_IN_ALLOWANCE`, `CONTRACTOR_PURCHASER`); `shopping-logic.js` (`CATEGORY_TO_TRADE`). **Produces:**
- `addressMatches(shipTo, propertyAddress): boolean | null` (street number + street name; `null` when `shipTo` is blank).
- `matchLines(lines, shoppingItems): Array<{ matchItemId: string|null, matchScore: number }>` (Decision 5; below 0.6 → `{ null, 0 }` … score still reported).
- `findDuplicates(extraction, receipt, purchases, inbox, selfId?): Array<{ kind: "purchase"|"inbox", id, reason }>` (same vendor + orderNo case-insensitive and non-blank, or same `receipt.hash`; ignores `selfId` and `dismissed` records).
- `mergeLines(lines, index): lines` (merges `lines[index]` into `lines[index-1]` per Decision 6; renumbers `lineNo`; never mutates).
- `canAcceptAll(extraction): boolean` (no `issues`, every line has a non-null `lineTotal` and a valid trade); `fileProblems(extraction, { purchasedBy }): string[]` (empty = fileable: at least one accepted line; every accepted line has a `lineTotal` and valid trade; `purchasedBy` chosen).
- `buildPurchasesFromInbox({ record, order: { purchasedBy, paymentMethod, orderGroupId? }, shoppingItems, settings, propertyInServiceDate }): object[]` (one normalized purchase per accepted line; Decision/§3.5; `orderGroupId = newOrderGroupId()` when absent and more than one line; `lineNo` in order; `receipts: [{ pathname, name, contentType, uploadedAt }]` shared by every line; `shoppingItemId` and candidate `returnByDate` when matched; `paymentConfirmed:false` for statement/quote; `docType`; `lienWaiverReceived:false`; `purchaseDate = paidDate || orderDate || ""`; `invoiceNo = orderNo`).

- [ ] **Step 1: Write failing tests:**
  - `addressMatches`: `("6401 Broward Street, Anastasia Island FL 32080", "6401 Broward St, St. Augustine, FL 32080")` true; `("3401 Broward", same)` false; `("6401 BROWARD ST.", …)` true; `("", …)`/`null` → `null`; `("6401 Ocean Blvd", …)` false.
  - `matchLines`: a SKU equal (case-insensitive) to a candidate SKU → that item, score 1; a near-identical name → matched with score ≥ 0.6; an unrelated name → `matchItemId: null`; empty inputs → `[]`; ties choose the first item.
  - `findDuplicates`: same vendor + order# in purchases and in another inbox record; same hash; dismissed record ignored; self ignored; blank order# never matches.
  - `mergeLines` on fixture C's lines 11 and 12 → one line, qty 22, `lineTotal` 9732, description joined, 11 lines left, `lineNo` renumbered, input unchanged; merging index 0 or an out-of-range index returns the input unchanged; null + null stays null.
  - `canAcceptAll`/`fileProblems`: fixture C raw → `canAcceptAll` false (issues + null price); fixtures A/B → true; `fileProblems` reports each missing piece (no accepted line, null line total, no `purchasedBy`).
  - **End-to-end fixtures through the real accounting from Phase 1** (Review Focus 1, 5): file A and B with `purchasedBy: "Josh"` → every line's `totalPaid` matches the §3.7 tables, `reimbursable` true, allowance Plumbing Fixtures / Electrical Fixtures / not-in-allowance (beds), `reimbursementsDue(all).total === 7685.47`, `allowanceCredits(all).total === 0`. File fixture C **after** the resolution (merge 11+12, enter total 18987, `purchasedBy: "Sparrow (Contractor)"`): 10 closet purchases (Shelving, 27.5-yr, `roomHint` in `room`) totalling 9255 + 1 shades purchase (qty 22, 9732, Window Treatments, `CONTRACTOR_SCOPE`, 5-yr), all `docType:'statement'`, `paymentConfirmed:false`, `lienWaiverReceived:false`, one shared `orderGroupId`, tax/shipping/fees 0; `reconciles` true at 18987.00; `allowancePool` Shelving `paidBySparrow 9255`, `remaining 1245`; `allowanceCredits` excludes all; every purchase shares the same receipt pathname; skipped lines (`decision:"skip"`) and undecided lines create no purchase.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the functions.
- [ ] **Step 4: Run `npm test`.** Expected: pass.
- [ ] **Step 5: Commit.** `feat(receipts): add line matching, duplicate and address checks, line merge and purchase building`

---

### Task 3: Server extraction helper and route

**Files:** Create `api/_extract.js`, `api/receipt-extract.js`; Test `scripts/verify-logic.mjs`.

**Interfaces — consumes:** `validateExtraction`, `EXTRACTION_MODEL`, `PURCHASE_TRADES`, `SHOPPING_CATEGORIES`. **Produces:** `buildExtractionPrompt({ propertyAddress, trades, categories }): string`; `extractReceipt({ client, model?, mediaType, base64, propertyAddress, now }): Promise<{ ok:true, extraction } | { ok:false, error }>` — calls `client.messages.create({ model, max_tokens: 16000, system, messages: [{ role:"user", content:[<image|document block>, {type:"text", text:"…JSON only…"}] }] })`; never throws. Route `POST /api/receipt-extract` `{ property, inboxId }` → loads the record, runs the helper, writes `status` (`extracted` / `needs-manual`) + `extraction`/`error`, returns the record; 404/400/409 as appropriate; missing `ANTHROPIC_API_KEY` → `needs-manual` with "ANTHROPIC_API_KEY is not set on the server".

- [ ] **Step 1: Write failing tests with a fake client** (no network): valid fenced JSON (```json … ```) → ok; JSON surrounded by prose → ok (first balanced object); `stop_reason: "refusal"` → `{ ok:false }` with a readable error; empty content / only a thinking block → error; invalid JSON → error; JSON failing `validateExtraction` → error; the client throwing (timeout / API error) → error, never rethrown; the request sent has `model === EXTRACTION_MODEL`, a PDF → `document` block with `media_type: "application/pdf"`, an image → `image` block, **no** `temperature`/`top_p`/`top_k`/`tool_choice`/`thinking`/prefill (last message is `user`), `max_tokens` ≥ 4096; the prompt contains all 22 trades, the last-4 rule, the never-guess rule and the property address; a model reply containing a 16-digit card number comes back redacted.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** `api/_extract.js` (JSON extraction: strip fences, else first balanced `{…}`; handle `content` blocks of type `text`; check `stop_reason`) and `api/receipt-extract.js` (Redis hash read/write, private blob read with `get(pathname, { access: 'private' })`, `new Anthropic({ apiKey, timeout: 120000, maxRetries: 1 })` created lazily inside the handler; typed error handling with the SDK's error classes; the whole handler wrapped so any failure is written as `needs-manual`).
- [ ] **Step 4: Run `npm test`, `node --check` both files, `npm run build`.** Expected: pass.
- [ ] **Step 5: Commit.** `feat(receipts): add the Claude receipt extraction helper and route with safe failure handling`

---

### Task 4: Inbox storage API, inbox-aware blob routes, backup, env

**Files:** Create `api/receipt-inbox.js`; Modify `src/lib/receipt-logic.js` (`sanitizeInboxRecord`), `api/_scope.js`, `api/receipts-upload.js`, `api/receipts-view.js`, `api/receipts-delete.js`, `api/backup.js`, `.env.example`; Test `scripts/verify-logic.mjs`.

**Interfaces — produces:** `sanitizeInboxRecord(raw, stamp): { ok, record | error }` (strict whitelist: `id` `^ri-[a-z0-9-]+$`, status enum, `receipt` `{pathname (must be receipts/<pid>/inbox/<id>/<file>), name, contentType, uploadedAt, hash}`, `extraction` via `validateExtraction` when non-null, `error`, `purchaseIds` strings, stamp; 100 KB cap); `parseReceiptPathname(pathname)` in `api/_scope.js` now also returns `{ propertyId, inboxId }` for inbox paths (existing purchase paths unchanged); `isInboxReceiptReferenced(records, pathname, excludeId?)`. Routes: `receipts-upload` accepts `inboxId` (instead of `purchaseId`) → `receipts/<pid>/inbox/<inboxId>/<file>`; `receipts-view` serves a pathname referenced by any purchase **or** any inbox record; `receipts-delete` keeps the blob if any purchase or inbox record (other than the caller's `inboxId`/`purchaseId`) references it; `receipt-inbox` GET → array, PUT → sanitized single HSET, DELETE `?id=` → HDEL + guarded blob delete.

- [ ] **Step 1: Write failing tests:** `parseReceiptPathname('receipts/pp/inbox/ri-abc-123/receipt-x.jpg')` → `{ propertyId:'pp', inboxId:'ri-abc-123' }`; the old purchase path still parses; traversal / extra levels / uppercase / a 5-level path rejected; `sanitizeInboxRecord`: valid record round-trips with a server stamp; bad id / status / pathname (including a purchase-style path) rejected; extraction normalized; review edits (`decision`, `matchItemId`, edited numbers) preserved; oversize rejected; unknown top-level keys dropped; `isInboxReceiptReferenced` keep/last-reference/exclude cases; blobs referenced only by a purchase (after filing) remain viewable.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement** the sanitizer, `_scope.js` changes, the three route changes (receipts-view fast path: inbox record by id from the path, then purchases scan), `api/receipt-inbox.js`, `api/backup.js` (`receiptInbox: await redis.hgetall(...)`), and `.env.example` (`ANTHROPIC_API_KEY=` with the server-side-only warning).
- [ ] **Step 4: Run `npm test`, `node --check` the touched API files, `npm run build`.** Expected: pass.
- [ ] **Step 5: Commit.** `feat(receipts): add the receipt inbox API and make receipt blob routes inbox-aware`

---

### Task 5: Inbox state, upload flow and the review panel

**Files:** Modify `src/App.jsx`.

**Interfaces — consumes:** Tasks 1–4 and `buildReceiptUpload`, `receiptViewUrl`, `PurchasesView`, `savePurchase`, `saveShoppingItem`. **Produces:** `inbox` state (array) with a gated, cancellation-guarded fetch effect and per-record debounced saves (`saveInboxRecord`), `removeInboxRecord`; `ReceiptInboxPanel` (collapsible, top of the Purchases tab) and `ReceiptInboxCard`; App `fileInboxRecord(record, order)`.

- [ ] **Step 1: Implement state/persistence** like the shopping tab (no localStorage cache; `?property=` always; writes only after load; flush on hide/unload; `syncError` banner).
- [ ] **Step 2: Upload flow** (per selected file, sequential): hash the original bytes (SHA-256), `buildReceiptUpload`, POST `/api/receipts-upload` with `inboxId`, PUT a `pending` record, POST `/api/receipt-extract`, then update state with the returned record; per-file status text; failures leave a `needs-manual` card (never lose the upload). Two triggers (Choose photo or file — `multiple`, no `capture`; Take photo — `capture="environment"`).
- [ ] **Step 3: Review card** per Task spec §3.5: receipt link, vendor, docType, order #, total (editable when null), reconcile badge ("totals don't reconcile" warning), address warning, duplicate warning, issues list (disables Accept all), handwritten notice; order-level `purchasedBy` + `paymentMethod`; lines with editable description/qty/unit price/line total, trade select (22), linked shopping item select (matched via `matchLines` on first view; shows score), Accept/Skip, low-confidence highlight, **Merge into line above**; **Accept all** (`canAcceptAll`), **File N purchases** (`fileProblems` shown as a checklist; duplicate → `window.confirm`), **Retry** and **Dismiss**; filed/dismissed records collapsed under "Filed (n)".
- [ ] **Step 3: Filing:** one explicit action; guards against double-click (disable + ref); builds drafts with `buildPurchasesFromInbox`; `savePurchase` each; marks the record `filed` with `purchaseIds`; moves matched shopping items to `ordered` with `purchaseIds` appended (unless received/kept/returned); focuses the first new purchase on the Purchases list.
- [ ] **Step 4: Verify:** `npm test`, `npm run build`, extend `.superpowers/smoke.mjs` to SSR-render the panel with the three fixtures, then run a Playwright scenario (fake `/api/receipt-extract` returning fixture extractions; file A, Josh → Due from Sparrow $7,685.47 on the Purchases cards; fixture C: issues disable Accept all, merge + total + Sparrow → Shelving $1,245 remaining; no-key path shows `needs-manual` + Retry; nothing in Purchases before File; one receipt opens from every created purchase).
- [ ] **Step 5: Commit.** `feat(receipts): add the Receipt Inbox panel with upload, extraction review and filing`

---

### Task 6: Docs, manual extraction script, gate, hand-off

**Files:** Create `scripts/try-extraction.mjs`; Modify `CLAUDE.md`, `docs/known-issues.md`.

- [ ] **Step 1: `scripts/try-extraction.mjs <file.pdf|jpg|png>`** — runs the same `extractReceipt` against a local file using `ANTHROPIC_API_KEY` from the environment and prints the validated extraction and `reconciles` (so Josh can verify the real prompt on real receipts). Not part of `npm test`.
- [ ] **Step 2: Docs:** CLAUDE.md (Receipt Inbox data model, routes, key, env var, rules, the manual script); known-issues (decisions that matter, e.g. refusals → needs-manual, duplicate detection by file hash, merge/total entry for ambiguous receipts).
- [ ] **Step 3: Full gate** (`npm test`, `npm run build`, smoke, Playwright) and commit `docs: document the Receipt Inbox and add a manual extraction script`.
- [ ] **Step 4: Hand-off** (do not push/PR without Josh's OK): prerequisites (`ANTHROPIC_API_KEY` in Vercel, server-side) and a deploy checklist from spec §3.8 (12-line Amazon invoice with 2 personal items → 10 purchases; every purchase opens the same receipt; no key → `needs-manual`; nothing in Purchases until File; fixtures A/B/C behave as the spec describes with real receipts).

---

## Self-Review (spec §3 coverage)

3.1 flow → T5; 3.2 storage/routes/blob paths → T3, T4; 3.3 model call + prompt rules → T3; 3.3a address check → T2, T5; 3.4 pure logic (validate, reconcile, allocate, match, duplicates) → T1, T2; 3.5 review UI → T5; 3.6 failure handling → T1 (issues/handwritten/statement), T3 (needs-manual), T5 (Retry, warnings, Accept-all gating, duplicate confirm); 3.7 fixtures + tests → T1, T2 (expected-output JSON only, no PDFs); 3.8 acceptance → T2/T4/T5 tests + the T6 deploy checklist. Signatures consistent across tasks: `validateExtraction`, `allocateOrderCosts`, `buildPurchasesFromInbox`, `extractReceipt`, `sanitizeInboxRecord`.
