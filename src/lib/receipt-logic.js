/**
 * Pure, non-UI logic for the Receipt Inbox — no React, no browser APIs — so it is unit-tested in plain
 * node (scripts/verify-logic.mjs) against the spec's real fixtures (scripts/fixtures/receipts/) and
 * reused by App.jsx and the api/*.js routes.
 *
 * Flow (spec §3): upload receipts → server extracts line items with Claude → human reviews → File
 * creates Purchases. Nothing here talks to a network; everything the model returns is treated as
 * untrusted input and normalized/validated before it is stored or shown.
 */
import { PURCHASE_TRADES, DOC_TYPES } from "./purchases-logic.js";
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

// Replace anything that looks like a real card number (13–19 digits, optional space/dash separators, passes
// the Luhn check) with "••••". Luhn keeps order numbers and SKUs (which are long digit strings too) intact.
export function redactCardNumbers(text) {
  return String(text ?? "").replace(/\b\d(?:[ -]?\d){12,18}\b/g, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? "••••" : m;
  });
}

// ── Parsing helpers (model output is untrusted) ─────────────────────────────

function parseMoney(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let t = v.trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$,\s]/g, "");
  if (t.startsWith("-")) { neg = true; t = t.slice(1); }
  const n = Number(t);
  if (!t || !Number.isFinite(n)) return null;
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
