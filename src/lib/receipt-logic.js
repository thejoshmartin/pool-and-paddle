/**
 * Pure, non-UI logic for the Receipt Inbox — no React, no browser APIs — so it is unit-tested in plain
 * node (scripts/verify-logic.mjs) against the spec's real fixtures (scripts/fixtures/receipts/) and
 * reused by App.jsx and the api/*.js routes.
 *
 * Flow (spec §3): upload receipts → server extracts line items with Claude → human reviews → File
 * creates Purchases. Nothing here talks to a network; everything the model returns is treated as
 * untrusted input and normalized/validated before it is stored or shown.
 */
import {
  PURCHASE_TRADES, DOC_TYPES, NOT_IN_ALLOWANCE, CONTRACTOR_PURCHASER, emptyPurchase, defaultAllowanceFor,
  reimbursementDefaultsFor, suggestAssetClass, newOrderGroupId,
} from "./purchases-logic.js";
import { SHOPPING_CATEGORIES } from "./shopping-logic.js";

export const EXTRACTION_MODEL = "claude-sonnet-5-5";
export const RECEIPT_STATUSES = ["pending", "extracted", "needs-manual", "filed", "dismissed"];
export const LOW_CONFIDENCE = 0.7;

const stamp36 = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export function newInboxId() { return `ri-${stamp36()}`; }

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// ── Privacy: never keep a full card number ──────────────────────────────────

function luhn(digits) {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

// Real payment-card numbers are 13–16 digits (Visa/Mastercard/Amex/Diners/Discover) or 19 (some UnionPay). Anything else —
// notably the 17-digit Amazon-style order numbers (3-7-7), which pass the Luhn check about 10% of the time — is NOT a card.
const CARD_LENGTHS = new Set([13, 14, 15, 16, 19]);

// Replace anything that looks like a real card number (a card length of digits, optional space/dash separators, passes the
// Luhn check) with "••••". Matching the length AND Luhn keeps order numbers and SKUs (also long digit strings) intact.
// No `\b`: "VISA4111…" and "4111…-2" must still match (the run is bounded by "not a digit" instead). A run that is not itself
// a card length is retried with ONE trailing 1–4 digit group removed ("4111 1111 1111 1111 12/27" — the card then its expiry
// month). Arbitrary windows are deliberately NOT tried: the 7+7 tail of an Amazon 3-7-7 order number would be mangled.
export function redactCardNumbers(text) {
  const isCard = (digits) => CARD_LENGTHS.has(digits.length) && luhn(digits);
  return String(text ?? "")
    .replace(/(?<!\d)\d{4}\.\d{4}\.\d{4}\.\d{4}(?:\.\d{3})?(?!\d)/g, (m) => (isCard(m.replace(/\D/g, "")) ? "••••" : m))
    .replace(/(?<!\d)\d(?:[ -]{0,3}\d){12,22}(?!\d)/g, (m) => {
      if (isCard(m.replace(/\D/g, ""))) return "••••";
      const groups = m.split(/[ -]+/);
      const last = groups[groups.length - 1];
      if (groups.length >= 2 && last.length >= 1 && last.length <= 4 && isCard(groups.slice(0, -1).join(""))) {
        const sep = m.slice(0, m.length - last.length).match(/[ -]*$/)[0];
        return "••••" + sep + last;
      }
      return m;
    });
}

// ── Parsing helpers (model output is untrusted) ─────────────────────────────

const MAX_MONEY = 1e9;   // no receipt is a billion dollars; a longer number is a card/order number in the wrong field
function parseMoney(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && Math.abs(v) < MAX_MONEY ? v : null;
  if (typeof v !== "string") return null;
  let t = v.trim();
  if (!t) return null;
  if (redactCardNumbers(t) !== t) return null;   // a card number in a money field is never stored
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$,\s]/g, "");
  if (t.startsWith("-")) { neg = true; t = t.slice(1); }
  const n = Number(t);
  if (!t || !Number.isFinite(n) || Math.abs(n) >= MAX_MONEY) return null;
  return neg ? -n : n;
}
const strOrNull = (v, max = 300) => {
  if (v === null || v === undefined) return null;
  const t = redactCardNumbers(String(v)).trim().slice(0, max);
  return t || null;
};
const cleanStr = (v, max = 300) => strOrNull(v, max) ?? "";
const cents = (n) => Math.round((Number(n) || 0) * 100);
const dollars = (c) => c / 100;
const boolish = (v) => v === true || (typeof v === "string" && ["true", "yes", "y", "1"].includes(v.trim().toLowerCase()));

// Keep only the last four digits of whatever the model gave us for a card.
function last4(v) {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

const MAX_ISSUES = 25;

// ── Validation / normalization ──────────────────────────────────────────────

// Structure is strict (object, valid docType, lines array of objects); line-level problems are
// normalized AND reported as `issues` so a human looks at them (issues disable "Accept all").
// `reconciles` is always recomputed here — the model's own claim is never trusted.
export function validateExtraction(json, now = new Date().toISOString()) {
  if (!isObj(json)) return { ok: false, error: "Extraction must be a JSON object." };
  if (!DOC_TYPES.includes(json.docType)) return { ok: false, error: `Invalid docType "${json.docType}" (expected ${DOC_TYPES.join(", ")}).` };
  if (!Array.isArray(json.lines)) return { ok: false, error: "Extraction has no lines array." };
  if (!json.lines.every(isObj)) return { ok: false, error: "Every extracted line must be an object." };

  const issues = new Set((Array.isArray(json.issues) ? json.issues : []).map(i => cleanStr(i, 500)).filter(Boolean));
  const handwritten = boolish(json.handwritten);

  const lines = json.lines.map((raw, idx) => {
    const n = idx + 1;
    let trade = raw.suggestedTrade;
    if (!PURCHASE_TRADES.includes(trade)) {
      issues.add(trade ? `Line ${n}: unrecognized trade "${cleanStr(trade, 40)}" — set to Other` : `Line ${n}: no trade suggested — set to Other`);
      trade = "Other";
    }
    let qty = parseMoney(raw.qty);
    if (qty === null || qty <= 0) { issues.add(`Line ${n}: quantity missing — assumed 1`); qty = 1; }
    let confidence = parseMoney(raw.confidence);
    confidence = confidence === null ? 0.5 : Math.min(1, Math.max(0, confidence));
    if (handwritten) confidence = Math.min(confidence, LOW_CONFIDENCE);
    return {
      lineNo: n,
      description: cleanStr(raw.description, 300),
      sourceVendor: strOrNull(raw.sourceVendor),
      sku: strOrNull(raw.sku, 80),
      qty,
      retailUnitPrice: parseMoney(raw.retailUnitPrice),
      unitPrice: parseMoney(raw.unitPrice),
      lineTotal: parseMoney(raw.lineTotal),
      roomHint: strOrNull(raw.roomHint, 80),
      suggestedTrade: trade,
      suggestedCategory: SHOPPING_CATEGORIES.includes(raw.suggestedCategory) ? raw.suggestedCategory : "Other",
      confidence,
      matchItemId: typeof raw.matchItemId === "string" && raw.matchItemId ? raw.matchItemId : null,
      matchScore: parseMoney(raw.matchScore),
      decision: raw.decision === "accept" || raw.decision === "skip" ? raw.decision : null,
    };
  });

  const extraction = {
    docType: json.docType,
    vendor: cleanStr(json.vendor, 120),
    orderNo: strOrNull(json.orderNo, 80),
    orderDate: strOrNull(json.orderDate, 40),
    paidDate: strOrNull(json.paidDate, 40),
    paymentMethod: strOrNull(json.paymentMethod, 80),
    cardLast4: last4(json.cardLast4),
    customerName: strOrNull(json.customerName, 120),
    shipTo: strOrNull(json.shipTo, 200),
    handwritten,
    lines,
    retailTotal: parseMoney(json.retailTotal),
    subtotal: parseMoney(json.subtotal),
    tax: parseMoney(json.tax),
    shipping: parseMoney(json.shipping),
    fees: parseMoney(json.fees),
    discounts: parseMoney(json.discounts),
    total: parseMoney(json.total),
    amountPaid: parseMoney(json.amountPaid),
    reconciles: false,
    issues: [...issues].slice(0, MAX_ISSUES),
    model: cleanStr(json.model, 80) || EXTRACTION_MODEL,
    extractedAt: cleanStr(json.extractedAt, 40) || now,
  };
  extraction.reconciles = reconciles(extraction);
  return { ok: true, extraction };
}

// lines + tax + shipping + fees − order-level discounts within $0.05 of the total. A null total, no lines or
// any null line total means it cannot be confirmed (false). Minoan line prices are already net of the Minoan
// discount, so that discount must NOT be passed as an order-level discount (and is never subtracted twice).
export function reconciles(ex) {
  if (!ex || !Array.isArray(ex.lines) || ex.lines.length === 0) return false;
  if (ex.total === null || ex.total === undefined || !Number.isFinite(Number(ex.total))) return false;
  if (ex.lines.some(l => !l || l.lineTotal === null || l.lineTotal === undefined)) return false;
  const lineSum = ex.lines.reduce((s, l) => s + cents(l.lineTotal), 0);
  const computed = lineSum + cents(ex.tax) + cents(ex.shipping) + cents(ex.fees) - cents(ex.discounts);
  return Math.abs(computed - cents(ex.total)) <= 5;
}

// ── Exact cost allocation ───────────────────────────────────────────────────

// Allocate `amountC` (integer cents, may be negative) pro rata by `weights` (integer cents). Each share is
// rounded half-up, then the rounding remainder goes on the largest line (first on ties) so the shares sum to
// the amount EXACTLY. Zero-weight lines receive nothing; if every weight is zero the first eligible line takes it.
function allocateCents(amountC, weights, eligible) {
  const out = weights.map(() => 0);
  if (amountC === 0 || weights.length === 0) return out;
  const idx = weights.map((_, i) => i).filter(i => eligible[i]);
  if (idx.length === 0) return out;
  const total = idx.reduce((s, i) => s + weights[i], 0);
  if (total <= 0) { out[idx[0]] = amountC; return out; }
  const sign = amountC < 0 ? -1 : 1;
  const abs = Math.abs(amountC);
  let allocated = 0;
  for (const i of idx) {
    out[i] = Math.floor((abs * weights[i]) / total + 0.5 + 1e-9);
    allocated += out[i];
  }
  let largest = idx[0];
  for (const i of idx) if (weights[i] > weights[largest]) largest = i;
  out[largest] += abs - allocated;
  return out.map(v => v * sign);
}

// Per line: { tax, shipping, fees, discounts, totalPaid } in dollars. Each order-level amount is allocated
// separately; totalPaid = lineTotal + tax + shipping + fees − discounts. A line with a null lineTotal gets zeros
// and totalPaid null (it must be filled in by hand before it can be filed).
export function allocateOrderCosts(lines, { tax, shipping, fees, discounts } = {}) {
  const list = Array.isArray(lines) ? lines : [];
  const weights = list.map(l => (l && l.lineTotal !== null && l.lineTotal !== undefined ? cents(l.lineTotal) : 0));
  const eligible = list.map(l => !!l && l.lineTotal !== null && l.lineTotal !== undefined);
  const t = allocateCents(cents(tax), weights, eligible);
  const s = allocateCents(cents(shipping), weights, eligible);
  const f = allocateCents(cents(fees), weights, eligible);
  const d = allocateCents(cents(discounts), weights, eligible);
  return list.map((l, i) => ({
    tax: dollars(t[i]), shipping: dollars(s[i]), fees: dollars(f[i]), discounts: dollars(d[i]),
    totalPaid: eligible[i] ? dollars(weights[i] + t[i] + s[i] + f[i] - d[i]) : null,
  }));
}

// ── Address check (spec §3.3a) ──────────────────────────────────────────────

const DIRECTIONS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west"]);
function streetKey(addr) {
  const t = String(addr ?? "").toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
  const m = /^(\d+)\s+(.+)$/.exec(t);
  if (!m) return null;
  const name = m[2].split(" ").find(w => w && !DIRECTIONS.has(w));
  return name ? { num: m[1], name } : null;
}

// Does the receipt's ship-to match the property? Compares street number + street name only. `null` = unknown
// (blank or unparseable address) — never a mismatch; only an explicit `false` should warn, and it never blocks filing.
export function addressMatches(shipTo, propertyAddress) {
  const a = streetKey(shipTo), b = streetKey(propertyAddress);
  if (!a || !b) return null;
  return a.num === b.num && a.name === b.name;
}

// ── Matching receipt lines to shopping items ────────────────────────────────

export const MATCH_THRESHOLD = 0.6;
const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokenSet = (v) => new Set(norm(v).split(" ").filter(Boolean));
const skuKey = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return (2 * n) / (a.size + b.size);
}

// For each line: the best shopping item and a 0–1 score. An exact SKU/ASIN match against any candidate wins
// (score 1); otherwise the best word-overlap (Dice) between the line text and the item name — also tried with each
// candidate's brand + model — with a threshold of 0.6. Below the threshold `matchItemId` is null (the score is
// still reported). Dismissed items never match. Ties go to the first item.
export function matchLines(lines, shoppingItems) {
  const items = (shoppingItems || []).filter(i => i && !i.dismissed);
  return (lines || []).map(line => {
    const sk = skuKey(line && line.sku);
    if (sk) {
      const hit = items.find(i => (i.candidates || []).some(c => c && skuKey(c.sku) === sk));
      if (hit) return { matchItemId: hit.id, matchScore: 1 };
    }
    const lt = tokenSet(line && line.description);
    let best = null, bestScore = 0;
    for (const item of items) {
      let score = dice(lt, tokenSet(item.name));
      for (const c of item.candidates || []) {
        if (c) score = Math.max(score, dice(lt, tokenSet(`${item.name} ${c.brand || ""} ${c.model || ""}`)));
      }
      if (score > bestScore) { best = item; bestScore = score; }
    }
    const rounded = Math.round(bestScore * 1000) / 1000;
    return best && bestScore >= MATCH_THRESHOLD ? { matchItemId: best.id, matchScore: rounded } : { matchItemId: null, matchScore: rounded };
  });
}

// ── Duplicate detection ─────────────────────────────────────────────────────

// Warn (never block) when the same order may already be on file: same vendor + order # in a purchase or another
// inbox record, or the same file bytes (receipt.hash) already in the inbox. Ignores this record, purchases it already
// created, dismissed records, and blank order numbers.
export function findDuplicates(extraction, receipt, purchases, inbox, selfId, ignorePurchaseIds = []) {
  const out = [];
  const seen = new Set();
  const add = (kind, id, reason) => { const k = `${kind}:${id}`; if (!seen.has(k)) { seen.add(k); out.push({ kind, id, reason }); } };
  const vendor = norm(extraction && extraction.vendor), order = norm(extraction && extraction.orderNo);
  if (vendor && order) {
    for (const p of purchases || []) {
      if (p && !ignorePurchaseIds.includes(p.id) && norm(p.vendor) === vendor && norm(p.invoiceNo) === order) {
        add("purchase", p.id, `A purchase${p.description ? ` ("${p.description}")` : ""} already has order # ${extraction.orderNo}`);
      }
    }
  }
  for (const r of inbox || []) {
    if (!r || r.id === selfId || r.status === "dismissed") continue;
    if (vendor && order && r.extraction && norm(r.extraction.vendor) === vendor && norm(r.extraction.orderNo) === order) {
      add("inbox", r.id, `Another inbox receipt is already order # ${extraction.orderNo}`);
    }
    if (receipt && receipt.hash && r.receipt && r.receipt.hash === receipt.hash) add("inbox", r.id, "This exact file is already in the inbox");
  }
  return out;
}

// ── Review helpers ──────────────────────────────────────────────────────────

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

// Merge lines[index] into lines[index - 1] (the review UI's "Merge into line above"): quantities add, non-null line
// totals add (null + value = value, null + null = null), descriptions join. Returns a new array, renumbered; an index
// that can't be merged returns the input unchanged.
export function mergeLines(lines, index) {
  if (!Array.isArray(lines) || !Number.isInteger(index) || index < 1 || index >= lines.length) return lines;
  const a = lines[index - 1], b = lines[index];
  const lineTotal = a.lineTotal == null && b.lineTotal == null ? null : round2((a.lineTotal || 0) + (b.lineTotal || 0));
  const qty = (Number(a.qty) || 0) + (Number(b.qty) || 0);
  const merged = {
    ...a,
    description: [a.description, b.description].filter(Boolean).join(" + "),
    qty, lineTotal,
    unitPrice: lineTotal != null && qty > 0 ? round4(lineTotal / qty) : null,
    retailUnitPrice: null,
    sku: a.sku || b.sku || null,
    confidence: Math.min(Number(a.confidence ?? 1), Number(b.confidence ?? 1)),
    matchItemId: null, matchScore: null, decision: null,
  };
  return [...lines.slice(0, index - 1), merged, ...lines.slice(index + 1)].map((l, i) => ({ ...l, lineNo: i + 1 }));
}

// "Accept all" is only offered when the model flagged nothing and every line has a price and a valid trade.
// A line the reviewer should double-check: model confidence below 0.7 — or ANY line of a handwritten document, whose
// confidence is capped AT 0.7 (so a plain `< 0.7` test would never flag it).
export function isLowConfidence(line, extraction) {
  return ((line && line.confidence) ?? 1) < LOW_CONFIDENCE || !!(extraction && extraction.handwritten === true);
}

// "Accept all" accepts only lines nobody has decided yet — a line the reviewer skipped stays skipped.
export function acceptUndecided(lines) {
  return (lines || []).map(l => (l && l.decision == null ? { ...l, decision: "accept" } : l));
}

// A filed or dismissed record is closed: a stale tab's PUT must not reopen it (which would let a receipt be filed twice).
export function inboxTransitionAllowed(existing, incoming) {
  if (existing && (existing.status === "filed" || existing.status === "dismissed") && incoming && incoming.status !== existing.status) {
    return { ok: false, error: `This receipt is already ${existing.status}` };
  }
  return { ok: true };
}

// After saving every purchase draft: mark the record filed only if ALL saves succeeded (results = array of booleans).
export function decideFilingOutcome(results) {
  const list = Array.isArray(results) ? results : [];
  const failed = list.filter(r => r !== true).length;
  return { markFiled: list.length > 0 && failed === 0, failed };
}

export function canAcceptAll(extraction) {
  if (!extraction || !Array.isArray(extraction.lines) || extraction.lines.length === 0) return false;
  if ((extraction.issues || []).length > 0) return false;
  return extraction.lines.every(l => l && l.lineTotal != null && PURCHASE_TRADES.includes(l.suggestedTrade));
}

// What still blocks filing (empty = ready). Only accepted lines are checked.
export function fileProblems(extraction, { purchasedBy } = {}) {
  const accepted = ((extraction && extraction.lines) || []).filter(l => l && l.decision === "accept");
  if (accepted.length === 0) return ["Accept at least one line"];
  const problems = [];
  if (!purchasedBy) problems.push("Choose who paid");
  for (const l of accepted) {
    if (l.lineTotal == null) problems.push(`Line ${l.lineNo}: enter the line total`);
    if (!PURCHASE_TRADES.includes(l.suggestedTrade)) problems.push(`Line ${l.lineNo}: choose a trade`);
    if (!String(l.description || "").trim()) problems.push(`Line ${l.lineNo}: add a description`);
  }
  return problems;
}

// Best guess at the app's payment-method option from the receipt's free text ("" when unsure).
export function suggestPaymentMethod(text) {
  const t = norm(text);
  if (!t) return "";
  if (/\b(ach|bank|transfer|wire|zelle)\b/.test(t)) return "ACH / Bank Transfer";
  if (/\b(check|cheque)\b/.test(t)) return "Check";
  if (/\bcash\b/.test(t)) return "Cash";
  if (/\b(credit|debit|card|visa|mastercard|master|amex|american express|discover)\b/.test(t)) return "Credit Card";
  return "";
}

const isoDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : "");

// One normalized Purchase per ACCEPTED line. Order-level tax/shipping/fees/discounts are allocated across ALL of the
// receipt's lines (so a skipped personal item keeps its own share and the accepted purchases are not inflated), each
// purchase gets its allocation and totalPaid, and every purchase shares one order group and the same receipt
// (referenced by pathname — the blob is never copied). Asset class comes from the trade, never the model; section stays
// blank; the allowance default, reimbursement default (settings vendor list) and docType-driven payment proof follow
// the same rules as the manual form.
export function buildPurchasesFromInbox({ record, order = {}, shoppingItems = [], settings = {}, propertyInServiceDate = "" }) {
  const ex = record && record.extraction;
  if (!ex || !Array.isArray(ex.lines)) return [];
  const alloc = allocateOrderCosts(ex.lines, { tax: ex.tax, shipping: ex.shipping, fees: ex.fees, discounts: ex.discounts });
  const acceptedIdx = ex.lines.map((l, i) => (l && l.decision === "accept" ? i : -1)).filter(i => i >= 0);
  const grouped = acceptedIdx.length > 1;
  const orderGroupId = order.orderGroupId || (grouped ? newOrderGroupId() : null);
  const purchasedBy = order.purchasedBy || "";
  const paymentMethod = order.paymentMethod || suggestPaymentMethod(ex.paymentMethod);
  const r = record.receipt || {};
  const receipts = r.pathname ? [{ pathname: r.pathname, name: r.name || "", contentType: r.contentType || "", uploadedAt: r.uploadedAt || "" }] : [];
  return acceptedIdx.map((i, n) => {
    const line = ex.lines[i], a = alloc[i];
    const trade = line.suggestedTrade;
    const item = (shoppingItems || []).find(s => s && s.id === line.matchItemId) || null;
    let cand = null;
    if (item) {
      const sk = skuKey(line.sku);
      cand = (sk && (item.candidates || []).find(c => c && skuKey(c.sku) === sk)) || (item.candidates || []).find(c => c && c.id === item.selectedCandidateId) || null;
    }
    const qty = Number(line.qty) > 0 ? Number(line.qty) : 1;
    return {
      ...emptyPurchase(),
      description: line.description || ex.vendor || "",
      trade, room: line.roomHint || "",
      vendor: ex.vendor || "", sourceVendor: line.sourceVendor || "", invoiceNo: ex.orderNo || "",
      purchasedBy, ownerPurchased: purchasedBy !== CONTRACTOR_PURCHASER, paymentMethod,
      qty,
      unitPrice: line.unitPrice != null ? line.unitPrice : (line.lineTotal != null ? round4(line.lineTotal / qty) : null),
      tax: a.tax, shipping: a.shipping, fees: a.fees, totalPaid: a.totalPaid,
      allowanceCategory: defaultAllowanceFor(trade, purchasedBy) || NOT_IN_ALLOWANCE,
      ...reimbursementDefaultsFor(ex.vendor, purchasedBy, settings.reimbursableVendors),
      assetClass: suggestAssetClass(trade), placedInServiceDate: propertyInServiceDate || "",
      docType: ex.docType, paymentConfirmed: ex.docType !== "statement" && ex.docType !== "quote", lienWaiverReceived: false,
      purchaseDate: isoDate(ex.paidDate) || isoDate(ex.orderDate),
      orderGroupId, lineNo: orderGroupId ? n + 1 : null,
      receipts, shoppingItemId: item ? item.id : null,
      returnByDate: (cand && cand.returnByDate) || "",
      notes: ["Filed from the Receipt Inbox", a.discounts ? `includes a ${a.discounts.toFixed(2)} share of the order discount` : ""].filter(Boolean).join(" · "),
    };
  });
}

// ── Inbox record sanitizer (api/receipt-inbox.js) ───────────────────────────

const INBOX_PATH_RE = /^receipts\/[a-z0-9-]+\/inbox\/(ri-[a-z0-9-]+)\/[^/]+$/;
const RECEIPT_TYPE_RE = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/i;
const MAX_RECORD_BYTES = 100000;

// Strict whitelist for a stored inbox record. The blob path must belong to THIS record (a forged purchase path or another
// record's path is rejected), the extraction is re-validated/normalized (review edits like decision, matchItemId and
// edited numbers survive), updatedAt/updatedBy always come from the server stamp, and card numbers are redacted.
export function sanitizeInboxRecord(raw, stamp) {
  if (!isObj(raw)) return { ok: false, error: "Expected a record object" };
  if (typeof raw.id !== "string" || !/^ri-[a-z0-9-]+$/.test(raw.id)) return { ok: false, error: "Invalid id" };
  if (!RECEIPT_STATUSES.includes(raw.status)) return { ok: false, error: "Invalid status" };
  const r = raw.receipt;
  if (!isObj(r)) return { ok: false, error: "Missing receipt" };
  const m = typeof r.pathname === "string" ? INBOX_PATH_RE.exec(r.pathname) : null;
  if (!m || m[1] !== raw.id) return { ok: false, error: "The receipt file path does not belong to this record" };
  if (typeof r.contentType !== "string" || !RECEIPT_TYPE_RE.test(r.contentType)) return { ok: false, error: "Unsupported receipt file type" };
  let extraction = null;
  if (raw.extraction !== null && raw.extraction !== undefined) {
    const v = validateExtraction(raw.extraction);
    if (!v.ok) return { ok: false, error: `Invalid extraction: ${v.error}` };
    extraction = v.extraction;
  }
  if (raw.purchaseIds !== undefined && !Array.isArray(raw.purchaseIds)) return { ok: false, error: "purchaseIds must be an array" };
  const record = {
    id: raw.id,
    status: raw.status,
    receipt: { pathname: r.pathname, name: cleanStr(r.name, 200), contentType: r.contentType, uploadedAt: cleanStr(r.uploadedAt, 40), hash: /^[a-f0-9]{32,128}$/i.test(String(r.hash || "")) ? String(r.hash).toLowerCase() : "" },   // a file digest is hex, never a card number (redaction would corrupt ~0.4% of them)
    extraction,
    error: raw.error ? redactCardNumbers(String(raw.error)).slice(0, 400) : null,
    purchaseIds: (raw.purchaseIds || []).map(String).slice(0, 200),
    updatedAt: (stamp && stamp.updatedAt) || null,
    updatedBy: (stamp && stamp.updatedBy) || null,
  };
  if (JSON.stringify(record).length > MAX_RECORD_BYTES) return { ok: false, error: "Record too large" };
  return { ok: true, record };
}
