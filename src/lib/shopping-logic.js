/**
 * Pure, non-UI logic for the Shopping tab — no React, no browser APIs — so it can be unit-tested
 * in plain node (scripts/verify-logic.mjs) and reused by App.jsx and api/shopping.js.
 *
 * Data model (spec §2): a Redis hash `shopping:<propertyId>` with fields `item:<id>`, `settings`,
 * and `item:<id>` tombstones `{ id, __deleted:true }`. Seed items (src/shopping-seed.json) merge
 * with saved edits like mergeFinishes: saved wins, seed fills the rest, tombstones hide deletions.
 */

import {
  netCost, emptyPurchase, defaultAllowanceFor, reimbursementDefaultsFor, suggestAssetClass, NOT_IN_ALLOWANCE,
} from "./purchases-logic.js";

// ── Constants ────────────────────────────────────────────────────────────────

export const SHOPPING_CATEGORIES = [
  "Small Appliances", "Cookware & Bakeware", "Dinnerware", "Flatware", "Glassware & Drinkware",
  "Serveware & Entertaining", "Kitchen Tools & Utensils", "Food Storage", "Bar & Coffee",
  "Outdoor / Pool Dining", "Linens & Towels", "Bath", "Cleaning & Laundry", "Supplies & Consumables",
  "Game Room & Recreation", "Furniture", "Electronics & Tech", "Safety & First Aid", "Other",
];

// Spec §2.5: shopping category → Purchase trade.
export const CATEGORY_TO_TRADE = {
  "Small Appliances": "Small Appliances",
  "Cookware & Bakeware": "Kitchen & Dining", "Dinnerware": "Kitchen & Dining", "Flatware": "Kitchen & Dining",
  "Glassware & Drinkware": "Kitchen & Dining", "Serveware & Entertaining": "Kitchen & Dining",
  "Kitchen Tools & Utensils": "Kitchen & Dining", "Food Storage": "Kitchen & Dining",
  "Bar & Coffee": "Kitchen & Dining", "Outdoor / Pool Dining": "Kitchen & Dining",
  "Linens & Towels": "Linens & Soft Goods", "Bath": "Linens & Soft Goods",
  "Cleaning & Laundry": "Supplies & Consumables", "Supplies & Consumables": "Supplies & Consumables",
  "Game Room & Recreation": "Furniture / FF&E", "Furniture": "Furniture / FF&E",
  "Electronics & Tech": "Electronics / AV",
  "Safety & First Aid": "Other", "Other": "Other",
};

export const ITEM_PRIORITIES = ["launch-critical", "launch", "nice-to-have"];
export const ITEM_STATUSES = ["researching", "shortlisted", "approved", "ordered", "received", "kept", "returned"];
export const ZONES = ["indoor", "outdoor", "both"];
export const VENDOR_TYPES = ["amazon", "minoan", "retail", "restaurant-supply", "other"];
export const AGENT_ACTIONS = ["buy-now", "wait-for-sale", "needs-review"];
export const TIERS = ["best-value", "upgrade"];
export const QTY_BASES = ["guests", "bedrooms", "bathrooms", "fixed"];
export const NON_GLASS_CATEGORIES = ["Outdoor / Pool Dining"];
// Categories where a candidate should be open stock (a broken piece must be re-buyable one at a time).
export const OPEN_STOCK_CATEGORIES = ["Dinnerware", "Flatware", "Glassware & Drinkware"];

export const DEFAULT_SHOPPING_SETTINGS = {
  guestCount: 24, bedrooms: 5, bathrooms: 5,
  mealsPerDay: 3, washesPerDay: 1, dishwashers: 1,
  budgetTarget: null, readyDate: null,
  defaultTaxRate: 0.065,
  vendorDefaults: {
    amazon: { name: "Amazon", transactionFeePct: 0, holidayReturnBy: "2027-01-31", note: "Nov 1–Dec 31 2026 purchases; Apple-brand Jan 15" },
    minoan: { name: "Minoan", transactionFeePct: 0.032, taxIncludesFees: true, reimbursedBy: "Sparrow (Contractor)", note: "Returns and shipping follow each brand's policy; fee observed 3.19–3.24%; Sparrow reimburses, funded through loan draws" },
  },
  reimbursableVendors: ["Minoan"],
};

// ── Small helpers ────────────────────────────────────────────────────────────

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_RECORD_BYTES = 100000;
const FIELD_RE = /^(item:sh-[a-z0-9-]+|settings)$/;
const ITEM_ID_RE = /^sh-[a-z0-9-]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v, d = "") => (v === undefined || v === null ? d : String(v));
// Blank / non-numeric → null; otherwise a finite number.
function numOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const num = (v, d = 0) => { const n = numOrNull(v); return n === null ? d : n; };
const stamp36 = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function newShoppingItemId() { return `sh-${stamp36()}`; }
export function newCandidateId() { return `c-${stamp36()}`; }

// Copy every own key of `raw` except the unsafe ones (used to preserve unknown fields).
function safeCopy(raw) {
  const out = {};
  for (const k of Object.keys(raw)) if (!UNSAFE_KEYS.has(k)) out[k] = raw[k];
  return out;
}

// ── Empty records ────────────────────────────────────────────────────────────

export function emptyCandidate() {
  return {
    id: newCandidateId(), vendor: "", vendorType: "other", url: "", sku: "", brand: "", model: "",
    sourceVendor: "", unitPrice: null, retailUnitPrice: null, packSize: 1, qtyToBuy: 1,
    shipping: null, transactionFeePct: null, estTax: null, discount: null, promoNote: "",
    returnWindowDays: null, returnByDate: "", returnShippingCost: null, restockingPct: null, freeReturns: false,
    deliveryEta: "", inStock: null, openStock: null, commercialGrade: null, warrantyTerm: "",
    rating: null, ratingCount: null, source: "JM", checkedAt: "", notes: "",
    tier: null, standardsCheck: null,
  };
}

export function emptyShoppingItem() {
  return {
    id: newShoppingItemId(), name: "", category: "Other", room: "",
    zone: "both", dishType: "", usesPerGuestPerDay: null,
    qtyRule: { basis: "fixed", multiplier: 1, fixedQty: 1 },
    qtyNeeded: 0, qtyOverride: null,
    priority: "launch", status: "researching",
    candidates: [], selectedCandidateId: null,
    approvedBy: null, approvedAt: null, claimedBy: null,
    needBy: null, targetPrice: null,
    episodes: [], finishItemId: null,
    agentFlag: { action: null, reason: "", flaggedAt: null },
    suggestedQty: null, proposed: false, purchaseIds: [],
    notes: "", userCreated: true, updatedAt: null, updatedBy: null,
  };
}

// Fill any missing fields on a saved/seed item (no mutation). Unknown fields are kept.
export function normalizeShoppingItem(item) {
  const base = emptyShoppingItem();
  const src = item || {};
  return {
    ...base, ...src,
    qtyRule: { ...base.qtyRule, ...(isObj(src.qtyRule) ? src.qtyRule : {}) },
    agentFlag: { ...base.agentFlag, ...(isObj(src.agentFlag) ? src.agentFlag : {}) },
    candidates: Array.isArray(src.candidates) ? src.candidates : [],
    purchaseIds: Array.isArray(src.purchaseIds) ? src.purchaseIds : [],
    episodes: Array.isArray(src.episodes) ? src.episodes : [],
  };
}

// ── Quantities ───────────────────────────────────────────────────────────────

// Quantity needed: an explicit override wins; otherwise the rule × the house setting (rounded up,
// guarding float noise so 1.25 × 24 is exactly 30). Missing/invalid → 0. Never throws.
export function computeQty(item, settings) {
  if (!item || typeof item !== "object") return 0;
  const override = numOrNull(item.qtyOverride);
  if (override !== null) return override;
  const rule = isObj(item.qtyRule) ? item.qtyRule : {};
  const s = settings || DEFAULT_SHOPPING_SETTINGS;
  if (rule.basis === "fixed") return Math.max(0, num(rule.fixedQty, 0));
  const count = { guests: s.guestCount, bedrooms: s.bedrooms, bathrooms: s.bathrooms }[rule.basis];
  if (count === undefined) return 0;
  return Math.max(0, Math.ceil(num(rule.multiplier, 0) * num(count, 0) - 1e-9));
}

// Per dish type (items sharing `dishType`, e.g. indoor + outdoor plates): how many guests' worth of a
// day can the combined inventory cover with one wash cycle a day? Owned quantity (linked, non-Returned
// purchases) replaces the planned quantity once an item has been bought.
export function mealsCovered(items, settings, purchases = []) {
  const s = settings || DEFAULT_SHOPPING_SETTINGS;
  const groups = new Map();
  for (const item of items || []) {
    const uses = numOrNull(item && item.usesPerGuestPerDay);
    if (!item || uses === null || !item.dishType) continue;
    const g = groups.get(item.dishType) || { dishType: item.dishType, uses, total: 0 };
    let qty = computeQty(item, s);
    if (Array.isArray(item.purchaseIds) && item.purchaseIds.length > 0) {
      const owned = (purchases || [])
        .filter(p => p && item.purchaseIds.includes(p.id) && p.status !== "Returned")
        .reduce((t, p) => t + (Number(p.qty) || 0), 0);
      if (owned > 0) qty = owned;
    }
    g.total += qty;
    groups.set(item.dishType, g);
  }
  const guests = Math.max(1, num(s.guestCount, 1));
  return [...groups.values()].map(g => {
    const perGuest = g.total / guests;
    const needFullDay = g.uses / Math.max(1, num(s.washesPerDay, 1));
    const needOneMeal = g.uses / Math.max(1, num(s.mealsPerDay, 1));
    const level = perGuest >= needFullDay - 1e-9 ? "full-day" : perGuest >= needOneMeal - 1e-9 ? "one-meal" : "short";
    return { dishType: g.dishType, total: g.total, perGuest, needFullDay, needOneMeal, level };
  });
}

// ── Sanitizers (used by api/shopping.js and the agent import) ────────────────

function enumField(raw, key, list, dflt) {
  const v = raw[key];
  if (v === undefined || v === null || v === "") return { ok: true, value: dflt };
  return list.includes(v) ? { ok: true, value: v } : { ok: false, error: `Invalid ${key}` };
}

// Validate/type a candidate; unknown keys are preserved (forward-compatible). Returns null for non-objects.
export function sanitizeCandidate(raw) {
  if (!isObj(raw)) return null;
  const e = emptyCandidate();
  const out = { ...safeCopy(raw) };
  const strings = ["id", "vendor", "url", "sku", "brand", "model", "sourceVendor", "promoNote", "returnByDate", "deliveryEta", "warrantyTerm", "checkedAt", "notes"];
  for (const k of strings) out[k] = str(raw[k], k === "id" ? e.id : "");
  if (!out.id) out.id = e.id;
  const numbers = ["unitPrice", "retailUnitPrice", "shipping", "transactionFeePct", "estTax", "discount", "returnWindowDays", "returnShippingCost", "restockingPct", "rating", "ratingCount"];
  for (const k of numbers) out[k] = numOrNull(raw[k]);
  out.packSize = Math.max(1, num(raw.packSize, 1));
  out.qtyToBuy = Math.max(0, num(raw.qtyToBuy, 1));
  for (const k of ["inStock", "openStock", "commercialGrade"]) out[k] = raw[k] === undefined || raw[k] === null ? null : Boolean(raw[k]);
  out.freeReturns = Boolean(raw.freeReturns);
  out.vendorType = VENDOR_TYPES.includes(raw.vendorType) ? raw.vendorType : "other";
  out.tier = TIERS.includes(raw.tier) ? raw.tier : null;
  out.source = ["agent", "JM", "KM"].includes(raw.source) ? raw.source : "JM";
  out.standardsCheck = isObj(raw.standardsCheck)
    ? { ...safeCopy(raw.standardsCheck), pass: Boolean(raw.standardsCheck.pass),
        failed: Array.isArray(raw.standardsCheck.failed) ? raw.standardsCheck.failed.map(String) : [],
        notes: str(raw.standardsCheck.notes) }
    : null;
  return out;
}

// Validate a shopping item. Strict on invalid values, lenient on absent ones (defaults fill in).
// updatedAt/updatedBy ALWAYS come from `stamp` (server-computed), never from `raw`.
export function sanitizeShoppingItem(raw, stamp) {
  if (!isObj(raw)) return { ok: false, error: "Expected an item object" };
  if (typeof raw.id !== "string" || !ITEM_ID_RE.test(raw.id)) return { ok: false, error: "Invalid id" };
  if (typeof raw.name !== "string" || !raw.name.trim()) return { ok: false, error: "name is required" };
  if (!SHOPPING_CATEGORIES.includes(raw.category)) return { ok: false, error: "Invalid category" };
  const status = enumField(raw, "status", ITEM_STATUSES, "researching");
  const priority = enumField(raw, "priority", ITEM_PRIORITIES, "launch");
  const zone = enumField(raw, "zone", ZONES, "both");
  for (const r of [status, priority, zone]) if (!r.ok) return r;
  if (raw.candidates !== undefined && !Array.isArray(raw.candidates)) return { ok: false, error: "candidates must be an array" };
  const candidates = [];
  for (const c of raw.candidates || []) {
    const cand = sanitizeCandidate(c);
    if (!cand) return { ok: false, error: "Invalid candidate" };
    candidates.push(cand);
  }
  const rule = isObj(raw.qtyRule) ? raw.qtyRule : {};
  if (rule.basis !== undefined && !QTY_BASES.includes(rule.basis)) return { ok: false, error: "Invalid qtyRule.basis" };
  const flag = isObj(raw.agentFlag) ? raw.agentFlag : {};
  const person = (v) => (v === "JM" || v === "KM" ? v : null);
  const item = {
    ...safeCopy(raw),
    id: raw.id, name: raw.name.trim(), category: raw.category, room: str(raw.room),
    zone: zone.value, dishType: str(raw.dishType), usesPerGuestPerDay: numOrNull(raw.usesPerGuestPerDay),
    qtyRule: { ...safeCopy(rule), basis: rule.basis || "fixed", multiplier: num(rule.multiplier, 1), fixedQty: num(rule.fixedQty, 0) },
    qtyNeeded: num(raw.qtyNeeded, 0), qtyOverride: numOrNull(raw.qtyOverride),
    priority: priority.value, status: status.value,
    candidates,
    selectedCandidateId: raw.selectedCandidateId ? String(raw.selectedCandidateId) : null,
    approvedBy: person(raw.approvedBy), approvedAt: raw.approvedAt ? String(raw.approvedAt) : null,
    claimedBy: person(raw.claimedBy),
    needBy: raw.needBy ? String(raw.needBy) : null, targetPrice: numOrNull(raw.targetPrice),
    episodes: Array.isArray(raw.episodes) ? raw.episodes.map(Number).filter(Number.isFinite) : [],
    finishItemId: raw.finishItemId ? String(raw.finishItemId) : null,
    agentFlag: {
      action: AGENT_ACTIONS.includes(flag.action) ? flag.action : null,
      reason: str(flag.reason), flaggedAt: flag.flaggedAt ? String(flag.flaggedAt) : null,
    },
    suggestedQty: numOrNull(raw.suggestedQty), proposed: Boolean(raw.proposed),
    purchaseIds: Array.isArray(raw.purchaseIds) ? raw.purchaseIds.map(String) : [],
    notes: str(raw.notes), userCreated: raw.userCreated === undefined ? true : Boolean(raw.userCreated),
    updatedAt: (stamp && stamp.updatedAt) || null, updatedBy: (stamp && stamp.updatedBy) || null,
  };
  if (JSON.stringify(item).length > MAX_RECORD_BYTES) return { ok: false, error: "Record too large" };
  return { ok: true, item };
}

export function sanitizeShoppingSettings(raw) {
  if (!isObj(raw)) return { ok: false, error: "Expected a settings object" };
  const D = DEFAULT_SHOPPING_SETTINGS;
  const intIn = (k, lo, hi) => {
    const v = raw[k] === undefined ? D[k] : raw[k];
    return Number.isInteger(v) && v >= lo && v <= hi ? { ok: true, value: v } : { ok: false, error: `Invalid ${k}` };
  };
  const out = { ...safeCopy(raw) };
  for (const [k, lo, hi] of [["guestCount", 1, 200], ["bedrooms", 0, 50], ["bathrooms", 0, 50], ["mealsPerDay", 1, 6], ["washesPerDay", 1, 6], ["dishwashers", 0, 10]]) {
    const r = intIn(k, lo, hi);
    if (!r.ok) return r;
    out[k] = r.value;
  }
  const budget = raw.budgetTarget === undefined ? null : raw.budgetTarget;
  if (budget !== null && !(typeof budget === "number" && Number.isFinite(budget) && budget >= 0)) return { ok: false, error: "Invalid budgetTarget" };
  out.budgetTarget = budget;
  const ready = raw.readyDate === undefined ? null : raw.readyDate;
  if (ready !== null && !(typeof ready === "string" && ISO_DATE_RE.test(ready))) return { ok: false, error: "Invalid readyDate" };
  out.readyDate = ready;
  const tax = raw.defaultTaxRate === undefined ? D.defaultTaxRate : raw.defaultTaxRate;
  if (!(typeof tax === "number" && Number.isFinite(tax) && tax >= 0 && tax <= 0.25)) return { ok: false, error: "Invalid defaultTaxRate" };
  out.defaultTaxRate = tax;
  const vd = raw.vendorDefaults === undefined ? D.vendorDefaults : raw.vendorDefaults;
  if (!isObj(vd) || !Object.values(vd).every(isObj)) return { ok: false, error: "Invalid vendorDefaults" };
  out.vendorDefaults = {};
  for (const k of Object.keys(vd)) if (!UNSAFE_KEYS.has(k)) out.vendorDefaults[k] = safeCopy(vd[k]);
  const rv = raw.reimbursableVendors === undefined ? D.reimbursableVendors : raw.reimbursableVendors;
  if (!Array.isArray(rv) || rv.length > 50 || !rv.every(v => typeof v === "string")) return { ok: false, error: "Invalid reimbursableVendors" };
  out.reimbursableVendors = rv;
  if (JSON.stringify(out).length > MAX_RECORD_BYTES) return { ok: false, error: "Record too large" };
  return { ok: true, settings: out };
}

// ── Hash fields ──────────────────────────────────────────────────────────────

export const SHOPPING_SETTINGS_FIELD = "settings";
export function shoppingItemField(id) { return `item:${id}`; }
export function isShoppingField(field) {
  return typeof field === "string" && field.length <= 80 && FIELD_RE.test(field);
}

// Validate one `{ field, value }` write. Tombstones are exactly { id, __deleted:true }.
export function sanitizeShoppingField(field, value, stamp) {
  if (!isShoppingField(field)) return { ok: false, error: "Invalid field" };
  if (field === SHOPPING_SETTINGS_FIELD) {
    const r = sanitizeShoppingSettings(value);
    return r.ok ? { ok: true, value: r.settings } : r;
  }
  if (!isObj(value)) return { ok: false, error: "Expected an object" };
  const id = field.slice("item:".length);
  if (value.__deleted === true) {
    return value.id === id ? { ok: true, value: { id, __deleted: true } } : { ok: false, error: "Tombstone id mismatch" };
  }
  const r = sanitizeShoppingItem(value, stamp);
  if (!r.ok) return r;
  if (r.item.id !== id) return { ok: false, error: "Field/id mismatch" };
  return { ok: true, value: r.item };
}

// Split an HGETALL-style map (values are objects or JSON strings) into saved items, tombstones, settings.
export function partitionShoppingFields(map) {
  const itemsById = {};
  const deletedIds = [];
  let settings = null;
  for (const [field, rawValue] of Object.entries(map || {})) {
    if (!isShoppingField(field)) continue;
    let v = rawValue;
    if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { continue; } }
    if (!isObj(v)) continue;
    if (field === SHOPPING_SETTINGS_FIELD) { settings = v; continue; }
    const id = field.slice("item:".length);
    if (v.__deleted === true) deletedIds.push(id);
    else itemsById[id] = v;
  }
  return { itemsById, deletedIds, settings };
}

// Reconcile seed + saved: seed items (minus tombstoned) with any saved record layered on top, then
// user-created saved items absent from the seed. Saved edits always win; nothing is resurrected.
export function mergeShopping(saved, seedItems) {
  const itemsById = (saved && saved.itemsById) || {};
  const deleted = new Set((saved && saved.deletedIds) || []);
  const seedIds = new Set();
  const items = [];
  for (const seed of seedItems || []) {
    seedIds.add(seed.id);
    if (deleted.has(seed.id)) continue;
    items.push(normalizeShoppingItem(itemsById[seed.id] ? { ...seed, ...itemsById[seed.id] } : seed));
  }
  for (const [id, rec] of Object.entries(itemsById)) {
    if (seedIds.has(id) || deleted.has(id)) continue;
    items.push(normalizeShoppingItem(rec));
  }
  const D = DEFAULT_SHOPPING_SETTINGS;
  const sv = (saved && saved.settings) || {};
  const vendorDefaults = { ...D.vendorDefaults };
  for (const [k, v] of Object.entries(sv.vendorDefaults || {})) vendorDefaults[k] = { ...(D.vendorDefaults[k] || {}), ...v };
  return { items, settings: { ...D, ...sv, vendorDefaults } };
}

// ── Landed cost, best value, warnings, forecast (spec §2.7) ──────────────────

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const qtyOf = (c) => { const q = numOrNull(c && c.qtyToBuy); return q === null ? 1 : Math.max(0, q); };

// Goods total after any discount: unitPrice × qtyToBuy − discount (never negative).
export function merchandise(c) {
  if (!c) return 0;
  return Math.max(0, round2(num(c.unitPrice, 0) * qtyOf(c) - num(c.discount, 0)));
}

// Vendor defaults (fee %, whether tax is charged on fees, holiday return date) by vendorType, else by
// a case-insensitive match of the vendor name.
export function vendorDefaultFor(c, settings) {
  const vd = (settings && settings.vendorDefaults) || {};
  if (c && vd[c.vendorType] && isObj(vd[c.vendorType])) return vd[c.vendorType];
  const name = String((c && c.vendor) || "").trim().toLowerCase();
  if (!name) return null;
  return Object.values(vd).find(v => isObj(v) && String(v.name || "").trim().toLowerCase() === name) || null;
}

// Transaction/processing fees: candidate value, else the vendor default, else 0.
export function feesFor(c, settings) {
  const vd = vendorDefaultFor(c, settings);
  const pct = numOrNull(c && c.transactionFeePct) ?? numOrNull(vd && vd.transactionFeePct) ?? 0;
  return round2(merchandise(c) * pct);
}

// Sales tax: an explicit estTax (even 0) wins; blank defaults to the tax rate on goods (plus fees
// for vendors whose tax base includes them, e.g. Minoan).
export function taxFor(c, settings) {
  const explicit = numOrNull(c && c.estTax);
  if (explicit !== null) return round2(explicit);
  const vd = vendorDefaultFor(c, settings);
  const base = merchandise(c) + (vd && vd.taxIncludesFees ? feesFor(c, settings) : 0);
  return round2(num(settings && settings.defaultTaxRate, DEFAULT_SHOPPING_SETTINGS.defaultTaxRate) * base);
}

export function landedTotal(c, settings) {
  if (!c) return 0;
  return round2(merchandise(c) + num(c.shipping, 0) + feesFor(c, settings) + taxFor(c, settings));
}

// Landed price per individual unit (qtyToBuy packs × packSize units).
export function perUnit(c, settings) {
  const units = Math.max(1, qtyOf(c) * Math.max(1, num(c && c.packSize, 1)));
  return round2(landedTotal(c, settings) / units);
}

// What returning it would cost: return shipping + restocking % of goods (a value above 1 is read as a percent).
export function returnExposure(c) {
  if (!c || c.freeReturns) return 0;
  let pct = num(c.restockingPct, 0);
  if (pct > 1) pct /= 100;
  return round2(num(c.returnShippingCost, 0) + pct * merchandise(c));
}

// Display-only suggestion: lowest landed total among candidates not known to be out of stock and
// (when the item has a need-by date) not known to arrive too late. A human always selects.
export function bestValue(item, settings) {
  const list = Array.isArray(item && item.candidates) ? item.candidates.filter(isObj) : [];
  const needBy = item && item.needBy;
  const ok = list.filter(c => c.inStock !== false && (!needBy || !c.deliveryEta || c.deliveryEta <= needBy));
  if (ok.length === 0) return null;
  const eta = (c) => c.deliveryEta || "9999-12-31";
  return [...ok].sort((a, b) =>
    landedTotal(a, settings) - landedTotal(b, settings) ||
    returnExposure(a) - returnExposure(b) ||
    (eta(a) < eta(b) ? -1 : eta(a) > eta(b) ? 1 : 0))[0];
}

const HOURS_72 = 72 * 3600 * 1000;

// Cautions about a candidate. `nowISO` is injected so the logic stays pure/testable.
export function candidateWarnings(c, item, settings, nowISO) {
  const out = [];
  if (!c) return out;
  const s = settings || {};
  if (c.returnByDate && s.readyDate && c.returnByDate < s.readyDate) {
    out.push({ code: "return-before-ready", text: "Return window closes before the house is ready — can't test in the house before returns close" });
  }
  const target = numOrNull(item && item.targetPrice);
  if (target !== null && num(c.unitPrice, 0) / Math.max(1, num(c.packSize, 1)) > target) {
    out.push({ code: "over-target", text: "Unit price is above the target price" });
  }
  if (OPEN_STOCK_CATEGORIES.includes(item && item.category) && c.openStock !== true) {
    out.push({ code: "not-open-stock", text: "Not confirmed open stock — a broken piece may not be re-buyable" });
  }
  const now = new Date(nowISO);
  const checked = c.checkedAt ? new Date(c.checkedAt) : null;
  if (checked && !Number.isNaN(checked.getTime()) && !Number.isNaN(now.getTime())) {
    const y = now.getUTCFullYear();
    const inSaleWindow = now >= new Date(Date.UTC(y, 10, 20)) && now < new Date(Date.UTC(y, 11, 3));
    if (inSaleWindow && now - checked > HOURS_72) {
      out.push({ code: "stale-price", text: "Price last checked more than 72 hours ago" });
    }
  }
  return out;
}

// Spend outlook: selected-candidate landed totals for items with no live linked purchase (and not
// returned) + the net cost of linked purchases. Items with no selected candidate plan $0.
export function forecastSpend(items, purchases, settings) {
  const byId = new Map((purchases || []).filter(Boolean).map(p => [p.id, p]));
  const countedPurchases = new Set();
  let planned = 0, committed = 0;
  for (const item of items || []) {
    if (!item) continue;
    const linked = (Array.isArray(item.purchaseIds) ? item.purchaseIds : []).map(id => byId.get(id)).filter(Boolean);
    for (const p of linked) {
      if (!countedPurchases.has(p.id)) { countedPurchases.add(p.id); committed += netCost(p); }
    }
    if (linked.length === 0 && item.status !== "returned") {
      const sel = (Array.isArray(item.candidates) ? item.candidates : []).find(c => c && c.id === item.selectedCandidateId);
      if (sel) planned += landedTotal(sel, settings);
    }
  }
  planned = round2(planned); committed = round2(committed);
  return { planned, committed, forecast: round2(planned + committed) };
}

// ── List helpers (search / filter / group) ───────────────────────────────────

// Case-insensitive search over the item and its candidates.
export function matchesShoppingSearch(item, term) {
  const t = String(term || "").trim().toLowerCase();
  if (!t) return true;
  if (!item) return false;
  const parts = [item.name, item.category, item.room, item.notes, item.dishType, item.requirements];
  for (const c of Array.isArray(item.candidates) ? item.candidates : []) {
    if (c) parts.push(c.vendor, c.brand, c.model, c.sourceVendor);
  }
  return parts.filter(Boolean).join(" ").toLowerCase().includes(t);
}

const isAll = (v) => v === undefined || v === null || v === "" || v === "all";

// Filters: status, category, priority, agentFlag ("none" or an action), claimedBy ("unclaimed" or JM/KM),
// vendor (any candidate), search. "all"/blank means no filter. Input order is preserved.
export function filterShoppingItems(items, f = {}) {
  return (items || []).filter(item => {
    if (!item) return false;
    if (!isAll(f.status) && item.status !== f.status) return false;
    if (!isAll(f.category) && item.category !== f.category) return false;
    if (!isAll(f.priority) && item.priority !== f.priority) return false;
    if (!isAll(f.agentFlag)) {
      const action = (item.agentFlag && item.agentFlag.action) || null;
      if (f.agentFlag === "none" ? action !== null : action !== f.agentFlag) return false;
    }
    if (!isAll(f.claimedBy)) {
      if (f.claimedBy === "unclaimed" ? item.claimedBy : item.claimedBy !== f.claimedBy) return false;
    }
    if (!isAll(f.vendor)) {
      const v = String(f.vendor).trim().toLowerCase();
      if (!(Array.isArray(item.candidates) ? item.candidates : []).some(c => c && String(c.vendor || "").trim().toLowerCase() === v)) return false;
    }
    return matchesShoppingSearch(item, f.search);
  });
}

// Group by category or status in the canonical order; unrecognized keys follow (never hidden); empty
// groups are dropped. Returns [{ key, items }].
export function groupShoppingItems(items, by) {
  const field = by === "status" ? "status" : "category";
  const order = by === "status" ? ITEM_STATUSES : SHOPPING_CATEGORIES;
  const buckets = new Map();
  for (const item of items || []) {
    const key = item[field];
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  const keys = [...order.filter(k => buckets.has(k)), ...[...buckets.keys()].filter(k => !order.includes(k))];
  return keys.map(key => ({ key, items: buckets.get(key) }));
}

// ── Mark purchased: shopping item + chosen candidate → a pre-filled Purchase draft ──────────────

// Non-destructive promote (the shopping item is changed by the caller, never here). Money fields come
// from the same landed-cost math the comparison used, so the purchase matches what was approved.
// Returns null when there is no item or candidate.
export function buildPurchaseFromShopping(item, candidate, settings) {
  if (!item || !candidate) return null;
  const s = settings || DEFAULT_SHOPPING_SETTINGS;
  const trade = CATEGORY_TO_TRADE[item.category] || "Other";
  const vd = vendorDefaultFor(candidate, s);
  const amazonReturnBy = candidate.vendorType === "amazon" && vd ? vd.holidayReturnBy : "";
  const days = numOrNull(candidate.returnWindowDays);
  const model = [candidate.brand, candidate.model].filter(Boolean).join(" ");
  const notes = [
    "Promoted from the Shopping list",
    candidate.url ? candidate.url : "",
    numOrNull(candidate.discount) ? `discount ${candidate.discount} applied` : "",
  ].filter(Boolean).join(" · ");
  return {
    ...emptyPurchase(),
    shoppingItemId: item.id,
    description: model ? `${item.name} — ${model}` : item.name,
    trade, room: item.room || "",
    vendor: candidate.vendor || "", sourceVendor: candidate.sourceVendor || "",
    qty: qtyOf(candidate), unitPrice: numOrNull(candidate.unitPrice),
    shipping: numOrNull(candidate.shipping), fees: feesFor(candidate, s), tax: taxFor(candidate, s),
    totalPaid: landedTotal(candidate, s),
    allowanceCategory: defaultAllowanceFor(trade, "") || NOT_IN_ALLOWANCE,
    ...reimbursementDefaultsFor(candidate.vendor, "", s.reimbursableVendors),
    returnByDate: candidate.returnByDate || amazonReturnBy || "",
    returnPolicyNote: days ? `${days}-day returns` : "",
    assetClass: suggestAssetClass(trade),
    notes,
  };
}
