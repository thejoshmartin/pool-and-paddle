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

const byName = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { sensitivity: "base" });
// Pickers show categories A–Z with "Other" last (SHOPPING_CATEGORIES keeps its grouping order for storage/validation).
export const sortedShoppingCategories = () => [...SHOPPING_CATEGORIES.filter(c => c !== "Other").sort(byName), "Other"];
// Items A–Z by name for a picker; returns a new array (nulls dropped, unnamed last).
export const sortItemsAlpha = (items) => (items || []).filter(Boolean).sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || byName(a.name, b.name));

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
// Free-text stand-ins the research agent writes instead of blanks ("Leave nothing blank: use n/a or unverified").
const PLACEHOLDERS = new Set(["", "n/a", "na", "unverified", "unknown", "-", "—", "–", "none", "tbd", "pending", "not priced"]);
const isPlaceholder = (v) => v === null || v === undefined || (typeof v === "string" && PLACEHOLDERS.has(v.trim().toLowerCase()));
// Strict yes/no parsing: never Boolean("false"). Anything else is "unknown" (null).
function triBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  const l = String(v ?? "").trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(l)) return true;
  if (["false", "no", "n", "0"].includes(l)) return false;
  return null;
}
const isoDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : "");
const isoDateTime = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim()) && !Number.isNaN(new Date(v).getTime()) ? v.trim() : "");
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
    approvedBy: null, approvedAt: null, approvedLanded: null, claimedBy: null,
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
  const strings = ["id", "vendor", "url", "sku", "brand", "model", "sourceVendor", "promoNote", "warrantyTerm", "notes"];
  for (const k of strings) out[k] = str(raw[k], k === "id" ? e.id : "");
  if (!out.id) out.id = e.id;
  const numbers = ["unitPrice", "retailUnitPrice", "shipping", "transactionFeePct", "estTax", "discount", "returnWindowDays", "returnShippingCost", "restockingPct", "rating", "ratingCount"];
  for (const k of numbers) out[k] = numOrNull(raw[k]);
  out.packSize = Math.max(1, num(raw.packSize, 1));
  out.qtyToBuy = Math.max(0, num(raw.qtyToBuy, 1));
  for (const k of ["inStock", "openStock", "commercialGrade"]) out[k] = triBool(raw[k]);
  out.freeReturns = triBool(raw.freeReturns) === true;
  out.returnByDate = isoDate(raw.returnByDate);
  out.deliveryEta = isoDate(raw.deliveryEta);
  out.checkedAt = isoDateTime(raw.checkedAt);
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
    approvedLanded: numOrNull(raw.approvedLanded),
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
  // Candidates with no price (or nothing to buy) can't be compared, so they are never "best".
  const ok = list.filter(c => c.inStock !== false && numOrNull(c.unitPrice) !== null && qtyOf(c) > 0
    && (!needBy || !c.deliveryEta || c.deliveryEta <= needBy));
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
    // Record PIECES so the purchase (and the meals-covered badge) counts forks, not packs of 12:
    // qty × unitPrice still equals the goods total.
    qty: qtyOf(candidate) * Math.max(1, num(candidate.packSize, 1)),
    unitPrice: numOrNull(candidate.unitPrice) === null ? null : Math.round((num(candidate.unitPrice, 0) / Math.max(1, num(candidate.packSize, 1))) * 10000) / 10000,
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

// ── Agent interface (spec §2.9) ──────────────────────────────────────────────
// The research agent never talks to the app. It reads an export bundle and returns a results file
// that Josh imports. These formats are a contract with that agent: do NOT rename fields or change the
// schema strings (additive optional fields are fine; unknown fields are preserved on import).

export const EXPORT_SCHEMA = "pp-shopping-export/v1";
export const RESULTS_SCHEMA_PREFIX = "pp-shopping-results/";
export const RESEARCH_EPISODE_CATEGORIES = ["Furnishing & Design", "Guest Experience", "Operations"];
// Spec says "procurement-relevant entries from tools-data.json" without a list; these tool categories
// are the ones that bear on what to buy for the house.
export const RESEARCH_TOOL_CATEGORIES = ["Smart Home & Security", "Guest Experience", "Operations & Cleaning"];

export function buildExportBundle({ items, settings, propertyId, podcast, tools, now }) {
  const toolList = Array.isArray(tools) ? tools : (tools && Array.isArray(tools.tools) ? tools.tools : []);
  return {
    schema: EXPORT_SCHEMA,
    exportedAt: now,
    propertyId,
    settings,
    items: (items || []).filter(Boolean).map(it => ({ ...it, qtyNeeded: computeQty(it, settings) })),
    research: {
      episodes: (podcast || [])
        .filter(e => e && !e.isGimmick && ["critical", "high"].includes(e.priority) && RESEARCH_EPISODE_CATEGORIES.includes(e.category))
        .map(e => ({ ep: e.ep, title: e.title, keyInsight: e.keyInsight, tags: e.tags || [] })),
      tools: toolList.filter(t => t && RESEARCH_TOOL_CATEGORIES.includes(t.category)),
    },
  };
}

// Reject anything that isn't a v1 results file for THIS property. Additive minor versions (v1.x) pass.
export function validateResults(json, propertyId) {
  if (!isObj(json)) return { ok: false, error: "That file isn't a results file (expected a JSON object)." };
  const m = /^pp-shopping-results\/v(\d+)(?:\.[\w.-]+)?$/.exec(typeof json.schema === "string" ? json.schema : "");
  if (!m) return { ok: false, error: `Unrecognized schema "${json.schema}" — expected pp-shopping-results/v1.` };
  if (Number(m[1]) !== 1) return { ok: false, error: `Unsupported schema version ${json.schema} — this app reads pp-shopping-results/v1.` };
  if (json.propertyId !== propertyId) return { ok: false, error: `This results file is for property "${json.propertyId}", not "${propertyId}".` };
  if (typeof json.generatedAt !== "string" || !json.generatedAt) return { ok: false, error: "The results file has no generatedAt." };
  if (json.updates !== undefined && !Array.isArray(json.updates)) return { ok: false, error: "updates must be an array." };
  if (json.newItems !== undefined && !Array.isArray(json.newItems)) return { ok: false, error: "newItems must be an array." };
  return { ok: true };
}

const ITEM_KNOWN_KEYS = new Set(Object.keys(emptyShoppingItem()));
const CANDIDATE_KNOWN_KEYS = new Set(Object.keys(emptyCandidate()));
// Fields an agent re-check may refresh on an existing candidate (identity, pack plan and human notes are never overwritten).
const PRICE_STOCK_FIELDS = ["unitPrice", "retailUnitPrice", "shipping", "transactionFeePct", "estTax", "discount", "promoNote", "inStock", "openStock", "deliveryEta",
  "rating", "ratingCount", "returnWindowDays", "returnByDate", "returnShippingCost", "restockingPct", "freeReturns", "tier", "standardsCheck", "checkedAt"];
const UPDATE_KEYS = new Set(["itemId", "addCandidates", "agentFlag", "suggestedQty", "notes"]);
const NEW_ITEM_KEYS = new Set(["name", "category", "room", "qtyRule", "priority", "candidates", "agentFlag", "notes", "suggestedQty", "zone", "dishType", "usesPerGuestPerDay"]);
// ("dismissed" is how the app hides a rejected agent proposal — an import must never set or clear it.)
const FORBIDDEN_AGENT_KEYS = new Set(["delete", "deleted", "__deleted", "remove", "removed", "tombstone", "dismissed"]);
// Human master-list fields: an import may fill one in when it is empty but never overwrite it.
const FILL_ONLY_KEYS = new Set(["qualityTier", "requirements", "kerryDecides"]);
function isForbiddenAgentKey(k) {
  const l = k.toLowerCase();
  return FORBIDDEN_AGENT_KEYS.has(l) || /^(is_?)?(delete|remov)/.test(l) || l.startsWith("master");
}
// The agent's own flag labels (BUY NOW / WAIT / REVIEW) → the app's action names; anything else is null.
function normalizeAgentAction(v) {
  const l = String(v ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (AGENT_ACTIONS.includes(l)) return l;
  if (["buy", "buynow"].includes(l)) return "buy-now";
  if (["wait", "wait-for-a-sale", "hold"].includes(l)) return "wait-for-sale";
  if (["review", "needs-reviewing"].includes(l)) return "needs-review";
  return null;
}
const blank = (v) => v === null || v === undefined || v === "";
const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const norm = (v) => String(v || "").trim().toLowerCase();

// Identity of a candidate for de-duplication: vendor + (sku || url || brand+model), with agent
// placeholders ("n/a") treated as blank. When nothing identifies the product, the price and quantity do —
// so Good / Better / Best at one vendor stay separate, and re-importing the same file is still a no-op.
const clean = (v) => (isPlaceholder(v) ? "" : norm(v));
function candidateKey(c) {
  const identity = clean(c.sku) || clean(c.url) || `${clean(c.brand)} ${clean(c.model)}`.trim()
    || `~${numOrNull(c.unitPrice)}x${numOrNull(c.qtyToBuy)}`;
  return `${clean(c.vendor)}|${identity}`;
}

function mergeCandidates(item, rawList, gen, stats) {
  for (const raw of rawList) {
    if (!isObj(raw)) continue;
    const inc = sanitizeCandidate({ ...raw, source: "agent" });   // an import can't label a candidate as JM/KM
    if (!inc) continue;
    const existing = item.candidates.find(c => candidateKey(c) === candidateKey(inc));
    if (existing) {
      let changed = false;
      for (const f of PRICE_STOCK_FIELDS) {
        // Only fields the agent actually sent, and never a null/blank over a known value.
        // Only fields the agent sent with a real value: not "n/a", and nothing that parsed to null/blank.
        if (f in raw && !isPlaceholder(raw[f]) && inc[f] !== null && inc[f] !== "" && !same(inc[f], existing[f])) { existing[f] = inc[f]; changed = true; }
      }
      for (const k of Object.keys(inc)) {
        if (!CANDIDATE_KNOWN_KEYS.has(k) && !same(inc[k], existing[k])) { existing[k] = inc[k]; changed = true; }
      }
      if (changed) stats.updated += 1;
    } else {
      const id = typeof raw.id === "string" && raw.id && !item.candidates.some(c => c.id === raw.id) ? raw.id : gen.candidate();
      item.candidates.push({ ...inc, id });
      stats.added += 1;
    }
  }
}

// The agent-writable parts shared by updates and new items. Everything else — status, approval, claim,
// selection, quantities, purchase links, deletions — is ignored. `handled` lists the keys the caller
// already consumes so only genuinely additive unknown fields are copied through.
function applyAgentFields(item, src, results, gen, stats, handled, candidatesKey) {
  if (Array.isArray(src[candidatesKey])) mergeCandidates(item, src[candidatesKey], gen, stats);
  if (isObj(src.agentFlag)) {
    // An unrecognized/blank action is ignored — an import can set a flag but never clear one.
    const action = normalizeAgentAction(src.agentFlag.action);
    if (action !== null) {
      const flag = { action, reason: str(src.agentFlag.reason), flaggedAt: results.generatedAt };
      if (!same(flag, item.agentFlag)) { item.agentFlag = flag; stats.flag = action; }
    }
  }
  if ("suggestedQty" in src) {
    const q = numOrNull(src.suggestedQty);   // a null/blank/"n/a" never clears an earlier suggestion
    if (q !== null && q !== item.suggestedQty) { item.suggestedQty = q; stats.suggestedQty = q; }
  }
  if (typeof src.notes === "string" && src.notes.trim()) {
    const line = `[agent ${String(results.generatedAt).slice(0, 10)}] ${src.notes.trim()}`;
    if (!String(item.notes || "").includes(line)) { item.notes = item.notes ? `${item.notes}\n${line}` : line; stats.noteAdded = true; }
  }
  for (const k of Object.keys(src)) {
    if (handled.has(k) || ITEM_KNOWN_KEYS.has(k) || UNSAFE_KEYS.has(k) || isForbiddenAgentKey(k)) continue;
    if (FILL_ONLY_KEYS.has(k) && !blank(item[k])) continue;
    if (!same(src[k], item[k])) item[k] = clone(src[k]);
  }
}

// Merge a validated results file into the item list WITHOUT mutating the inputs. Returns the items that
// actually changed (`touched`), a human-readable change list for the preview, and skipped rows.
// Idempotent: importing the same file again touches nothing.
export function mergeResults(items, results, settings, ids = {}) {
  const gen = { candidate: ids.candidate || newCandidateId, item: ids.item || newShoppingItemId };
  const out = { touched: [], changes: [], skipped: [] };
  if (!isObj(results)) return out;
  const working = (items || []).filter(isObj).map(i => normalizeShoppingItem(clone(i)));
  const before = new Map(working.map(i => [i.id, JSON.stringify(i)]));
  const fresh = new Set();
  const touchedOrder = [];
  const mark = (item) => { if (!touchedOrder.includes(item.id)) touchedOrder.push(item.id); };
  const newStats = () => ({ added: 0, updated: 0, flag: null, suggestedQty: null, noteAdded: false });
  const record = (kind, item, stats) => {
    const prior = before.get(item.id);
    if (fresh.has(item.id) || (prior !== undefined && prior !== JSON.stringify(item))) {
      mark(item);
      const existing = out.changes.find(c => c.itemId === item.id);
      const entry = { kind: fresh.has(item.id) ? "new" : kind, itemId: item.id, name: item.name, addedCandidates: stats.added, updatedCandidates: stats.updated, flag: stats.flag, suggestedQty: stats.suggestedQty, noteAdded: stats.noteAdded };
      if (existing) {
        existing.addedCandidates += stats.added; existing.updatedCandidates += stats.updated;
        existing.flag = existing.flag || stats.flag; if (stats.suggestedQty !== null) existing.suggestedQty = stats.suggestedQty;
        existing.noteAdded = existing.noteAdded || stats.noteAdded;
      } else out.changes.push(entry);
    }
  };

  for (const up of results.updates || []) {
    if (!isObj(up) || typeof up.itemId !== "string") { out.skipped.push("An update had no itemId"); continue; }
    // The agent keys rows by the Master List "Item ID" (kept on the item as masterId) or by the app id.
    const item = working.find(i => i.id === up.itemId) || working.find(i => i.masterId && i.masterId === up.itemId);
    if (!item) { out.skipped.push(`Unknown item ${up.itemId}`); continue; }
    const stats = newStats();
    applyAgentFields(item, up, results, gen, stats, UPDATE_KEYS, "addCandidates");
    record("update", item, stats);
  }

  for (const raw of results.newItems || []) {
    if (!isObj(raw) || typeof raw.name !== "string" || !raw.name.trim()) { out.skipped.push("A new item had no name"); continue; }
    const category = SHOPPING_CATEGORIES.includes(raw.category) ? raw.category : "Other";
    const key = `${norm(raw.name)}|${category}`;
    let item = working.find(i => `${norm(i.name)}|${i.category}` === key);
    if (!item) {
      const rule = isObj(raw.qtyRule) && QTY_BASES.includes(raw.qtyRule.basis)
        ? { basis: raw.qtyRule.basis, multiplier: num(raw.qtyRule.multiplier, 1), fixedQty: num(raw.qtyRule.fixedQty, 0) }
        : emptyShoppingItem().qtyRule;
      item = normalizeShoppingItem({
        ...emptyShoppingItem(), id: gen.item(), name: raw.name.trim(), category, room: str(raw.room),
        zone: ZONES.includes(raw.zone) ? raw.zone : "both", dishType: str(raw.dishType), usesPerGuestPerDay: numOrNull(raw.usesPerGuestPerDay),
        qtyRule: rule, priority: ITEM_PRIORITIES.includes(raw.priority) ? raw.priority : "launch",
        proposed: true, status: "researching", userCreated: true,
      });
      working.push(item);
      fresh.add(item.id);
    }
    const stats = newStats();
    applyAgentFields(item, raw, results, gen, stats, NEW_ITEM_KEYS, "candidates");
    record("update", item, stats);
  }

  out.touched = touchedOrder.map(id => working.find(i => i.id === id));
  return out;
}

// ── Print for Kerry ──────────────────────────────────────────────────────────

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const usd = (n) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });

// One printable page of approved + shortlisted items by category. Pure string, inline styles only, every
// dynamic value escaped, no scripts / stylesheets / external references (the caller opens it in a new
// window and calls print()).
export function buildPrintHtml(items, settings, now) {
  const list = (items || []).filter(i => i && (i.status === "approved" || i.status === "shortlisted"));
  const groups = groupShoppingItems(list, "category");
  const cell = "padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top;font-size:12px;";
  let grand = 0;
  const body = groups.map(g => {
    const rows = [...g.items].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(item => {
      const sel = (item.candidates || []).find(c => c && c.id === item.selectedCandidateId) || null;
      const landed = sel ? landedTotal(sel, settings) : null;
      if (landed !== null) grand += landed;
      const status = item.status === "approved" ? `Approved${item.approvedBy ? ` by ${item.approvedBy}` : ""}` : "Shortlisted";
      return `<tr style="page-break-inside:avoid;"><td style="${cell}">${esc(item.name)}</td><td style="${cell}text-align:right;">${esc(computeQty(item, settings))}</td>`
        + `<td style="${cell}">${esc(sel ? sel.vendor : "—")}</td><td style="${cell}text-align:right;">${landed === null ? "—" : esc(usd(landed))}</td>`
        + `<td style="${cell}">${esc((sel && sel.returnByDate) || "—")}</td><td style="${cell}">${esc(status)}</td><td style="${cell}">${esc(item.notes || "")}</td></tr>`;
    }).join("");
    return `<h2 style="font-size:14px;margin:18px 0 6px;color:#238C62;">${esc(g.key)}</h2>`
      + `<table style="width:100%;border-collapse:collapse;"><thead><tr>${["Item", "Qty", "Vendor", "Landed total", "Return by", "Status", "Notes"].map((h, i) => `<th style="${cell}font-weight:700;${i === 1 || i === 3 ? "text-align:right;" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
  const date = String(now || "").slice(0, 10);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pool &amp; Paddle — Shopping list</title></head>`
    + `<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#333;margin:24px;">`
    + `<h1 style="font-size:20px;margin:0 0 4px;">Pool &amp; Paddle — Shopping list for Kerry</h1>`
    + `<p style="margin:0 0 4px;font-size:12px;color:#666;">Printed ${esc(date)} · ${list.length} item${list.length === 1 ? "" : "s"} (approved and shortlisted) · selected total ${esc(usd(grand))} · sized for ${esc(settings && settings.guestCount)} guests</p>`
    + (body || `<p style="font-size:13px;color:#666;">Nothing approved or shortlisted yet.</p>`)
    + `</body></html>`;
}

// When an approved item's selected candidate no longer costs what it did at approval (e.g. an agent
// re-check refreshed its price), return { from, to } so the UI can ask for a fresh look. Otherwise null.
export function priceChangedSinceApproval(item, settings) {
  if (!item || !item.approvedBy) return null;
  const from = numOrNull(item.approvedLanded);
  const sel = (Array.isArray(item.candidates) ? item.candidates : []).find(c => c && c.id === item.selectedCandidateId);
  if (from === null || !sel) return null;
  const to = landedTotal(sel, settings);
  return Math.abs(to - from) >= 0.01 ? { from, to } : null;
}


// ── Putting bought items on the Shopping list ───────────────────────────────

const TRADE_TO_CATEGORY = {
  "Furniture / FF&E": "Furniture", "Small Appliances": "Small Appliances", "Linens & Soft Goods": "Linens & Towels",
  "Supplies & Consumables": "Supplies & Consumables", "Electronics / AV": "Electronics & Tech",
};
// Best Shopping category for a Purchase trade. Trades that map to several categories (Kitchen & Dining) or to none
// become "Other" — the reviewer can change it on the item.
export const categoryForTrade = (trade) => TRADE_TO_CATEGORY[trade] || "Other";

// Purchase status → Shopping item status.
export function shoppingStatusForPurchase(status) {
  if (status === "Received" || status === "Installed") return "received";
  if (status === "Returned") return "returned";
  return "ordered";
}

// An existing item only ever moves forward when a purchase links to it (researching/shortlisted/approved → target;
// ordered → received); anything further along is left alone.
export function advanceShoppingStatus(current, target) {
  if (["researching", "shortlisted", "approved"].includes(current)) return target;   // incl. "returned"
  if (current === "ordered" && target === "received") return "received";
  return current;
}

const normName = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const skuOf = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Shared core: for each entry that still needs a Shopping item, link an EXISTING non-dismissed item with the same SKU
// (any candidate) or the same normalized name, otherwise create a new item (reusing one created earlier in this same
// plan for a same-SKU/name entry). New items get one selected candidate that reproduces what was paid (tax, shipping,
// fees and discount carried, so landed total = amount paid). Entries: { ref, skip, name, sku, category, room, vendor,
// sourceVendor, unitPrice, qty, tax, shipping, fees, discount, status, returnByDate }.
// Returns { results: [{ itemId, created }|null per entry], newItems }.
export function planShoppingItems(entries, shoppingItems = [], user = "") {
  const pool = (shoppingItems || []).filter(i => i && !i.dismissed);
  const newItems = [];
  const results = (entries || []).map((e) => {
    if (!e || e.skip) return null;
    const sk = skuOf(e.sku), nm = normName(String(e.name ?? "").trim().slice(0, 120));   // the stored name is cut to 120, so match on the same cut
    const all = [...pool, ...newItems];
    const found = all.find(it => sk && (it.candidates || []).some(c => c && skuOf(c.sku) === sk)) || all.find(it => nm && normName(it.name) === nm);
    if (found) {
      const mine = newItems.includes(found);
      if (mine) found.purchaseIds = [...found.purchaseIds, e.ref];
      return { itemId: found.id, created: false, mine };
    }
    const item = emptyShoppingItem();
    const cand = emptyCandidate();
    const qty = Number(e.qty) > 0 ? Number(e.qty) : 1;
    const goods = (Number(e.unitPrice) || 0) * qty - (Number(e.discount) || 0);
    Object.assign(cand, {
      vendor: e.vendor || "", sourceVendor: e.sourceVendor || "", sku: e.sku || "",
      unitPrice: e.unitPrice ?? null, qtyToBuy: qty, source: user === "KM" ? "KM" : "JM",
      estTax: e.tax ?? 0, shipping: e.shipping ?? 0, discount: e.discount || null,
      transactionFeePct: goods > 0 ? (Number(e.fees) || 0) / goods : 0,
      returnByDate: e.returnByDate || "",
    });
    Object.assign(item, {
      name: String(e.name || e.vendor || "Purchased item").trim().slice(0, 120),
      category: SHOPPING_CATEGORIES.includes(e.category) ? e.category : "Other",
      room: e.room || "", status: e.status || "ordered",
      qtyRule: { basis: "fixed", multiplier: 1, fixedQty: qty },
      candidates: [cand], selectedCandidateId: cand.id, purchaseIds: [e.ref],
    });
    newItems.push(item);
    return { itemId: item.id, created: true, mine: true };
  });
  return { results, newItems };
}

// Does this purchase still need a Shopping link? No link, or a link to an item that no longer exists (only judged once the
// list is loaded: pass `null` while it isn't, and a link is trusted).
export function purchaseNeedsShopping(p, shoppingItems) {
  if (!p) return false;
  if (!p.shoppingItemId) return true;
  return Array.isArray(shoppingItems) && !shoppingItems.some(i => i && i.id === p.shoppingItemId);
}

// "Add to Shopping list" for purchases that are already filed (a backfill, or lines whose link was skipped). Purchases
// that already point at an existing item are skipped. Returns the new items to save, the purchase→item links to write,
// and the EXISTING items that gained purchases ({ itemId, purchaseIds, status } — the caller appends to the item's
// purchaseIds and moves its status forward with advanceShoppingStatus).
export function planShoppingForPurchases({ purchases, shoppingItems = [], user = "" }) {
  const exists = (id) => !!id && (shoppingItems || []).some(i => i && i.id === id);
  const todo = (purchases || []).filter(p => p && !exists(p.shoppingItemId));
  const entries = todo.map(p => {
    const qty = Number(p.qty) > 0 ? Number(p.qty) : 1;
    const n = (v) => Number(v) || 0;
    const hasUnit = p.unitPrice !== null && p.unitPrice !== undefined && p.unitPrice !== "" && Number.isFinite(Number(p.unitPrice));
    return {
      ref: p.id, name: String(p.description || "").trim(), category: categoryForTrade(p.trade), room: p.room || "",   // a blank description never dedupes by vendor name
      vendor: p.vendor || "", sourceVendor: p.sourceVendor || "",
      unitPrice: hasUnit ? Number(p.unitPrice) : (p.totalPaid != null && p.totalPaid !== "" ? Math.round(((n(p.totalPaid) - n(p.tax) - n(p.shipping) - n(p.fees) + n(p.discount)) / qty) * 10000) / 10000 : null),
      qty, tax: p.tax, shipping: p.shipping, fees: p.fees, discount: p.discount,
      status: shoppingStatusForPurchase(p.status), returnByDate: p.returnByDate || "",
    };
  });
  const { results, newItems } = planShoppingItems(entries, shoppingItems, user);
  const purchaseLinks = [], byItem = new Map();
  results.forEach((r, i) => {
    if (!r) return;
    purchaseLinks.push({ purchaseId: todo[i].id, itemId: r.itemId });
    if (!r.mine) {
      const cur = byItem.get(r.itemId) || { itemId: r.itemId, purchaseIds: [], statuses: [] };
      cur.purchaseIds.push(todo[i].id); cur.statuses.push(entries[i].status);
      byItem.set(r.itemId, cur);
    }
  });
  const itemLinks = [...byItem.values()].map(({ itemId, purchaseIds, statuses }) => ({
    itemId, purchaseIds,
    status: statuses.includes("received") ? "received" : statuses.every(x => x === "returned") ? "returned" : "ordered",
  }));
  return { newItems, purchaseLinks, itemLinks };
}
