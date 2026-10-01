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
  const item = { id: raw.id, category: raw.category, name: raw.name.trim() };
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
