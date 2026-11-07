// Pure purchase / cost-seg domain logic — NO React, NO browser APIs — so it can be
// unit-tested in plain node (see scripts/verify-logic.mjs) and reused by App.jsx.
// Browser-dependent helpers (receipt upload/compress, localStorage cache) stay in App.jsx.

export const PURCHASE_TRADES = [
  "Flooring", "Shower/Bath Tile", "Kitchens", "Countertops", "Paint", "Decking",
  "Appliances", "Electrical", "Plumbing", "Drywall", "Furniture / FF&E",
  "Decor & Styling", "Linens & Soft Goods", "Electronics / AV", "Outdoor & Landscape",
  "Pool & Spa", "Small Appliances", "Kitchen & Dining", "Supplies & Consumables",
  "Window Treatments", "Closets & Shelving", "Other",
];
export const PURCHASED_BY_OPTIONS = ["Josh", "Kerry", "Sparrow (Contractor)", "Other"];
export const CONTRACTOR_PURCHASER = "Sparrow (Contractor)";
export const PAYMENT_METHODS = ["Credit Card", "ACH / Bank Transfer", "Minoan", "Check", "Cash", "Other"];
export const PURCHASE_STATUSES = ["Ordered", "Received", "Installed", "Return started", "Returned"];
export const DELIVERED_TO_OPTIONS = ["Home", "Storage", "Property", "Other"];
export const REIMBURSEMENT_STATUSES = ["none", "pending", "requested", "reimbursed"];
export const DOC_TYPES = ["receipt", "invoice", "statement", "quote"];
export const NOT_IN_ALLOWANCE = "Not in Allowance / Owner FF&E";
// Items Sparrow pays for that have no Exhibit B category (e.g. window shades). Shown on its own
// reconciliation line so each can be confirmed as inside the base contract price.
export const CONTRACTOR_SCOPE = "Contractor scope (base contract)";
// Seed list of vendors whose purchases Sparrow reimburses (via loan draws). Phase 2 moves this
// into shopping settings; the logic functions already take the list as a parameter.
export const DEFAULT_REIMBURSABLE_VENDORS = ["Minoan"];
export const ALLOWANCE_CATEGORIES = [
  { name: "Plumbing Fixtures", allowance: 22000 },
  { name: "Electrical Fixtures", allowance: 20000 },
  { name: "Tile/Flooring Material", allowance: 34500 },
  { name: "Cabinets", allowance: 60000 },
  { name: "Countertops", allowance: 20000 },
  { name: "Appliances", allowance: 25000 },
  { name: "Interior Hardware", allowance: 9000 },
  { name: "Shelving", allowance: 10500 },
  { name: "Landscape", allowance: 135000 },
  { name: "Pool & Spa", allowance: 100000 },
  { name: "Glass Shower Enclosures", allowance: 10000 },
];
export const EXHIBIT_B_TOTAL = 446000;
export const EXHIBIT_B_NAMES = ALLOWANCE_CATEGORIES.map(a => a.name);

// Cost-seg (Phase 3). Asset classes are SUGGESTIONS only — always confirmed with the CPA.
export const ASSET_CLASSES = ["5-yr", "7-yr", "15-yr", "27.5-yr", "supplies"];
const ASSET_CLASS_LABELS = { supplies: "Supplies / expense (confirm with CPA)" };
export function assetClassLabel(c) { return ASSET_CLASS_LABELS[c] || c; }
export const ASSET_CLASS_BY_TRADE = {
  "Appliances": "5-yr", "Furniture / FF&E": "5-yr", "Decor & Styling": "5-yr",
  "Linens & Soft Goods": "5-yr", "Electronics / AV": "5-yr",
  "Small Appliances": "5-yr", "Kitchen & Dining": "5-yr", "Window Treatments": "5-yr",
  "Supplies & Consumables": "supplies", "Closets & Shelving": "27.5-yr",
  "Decking": "15-yr", "Outdoor & Landscape": "15-yr", "Pool & Spa": "15-yr",
  "Flooring": "27.5-yr", "Shower/Bath Tile": "27.5-yr", "Kitchens": "27.5-yr",
  "Countertops": "27.5-yr", "Paint": "27.5-yr", "Electrical": "27.5-yr",
  "Plumbing": "27.5-yr", "Drywall": "27.5-yr",
};
export function suggestAssetClass(trade) { return ASSET_CLASS_BY_TRADE[trade] || ""; }

// Build a per-property cost-seg CSV: every purchase with BOTH an asset class and a
// placed-in-service date, grouped by asset class with subtotals, on NET cost (refunds
// subtracted). Fully Returned lines are excluded and listed in a trailing block. Section
// (§1245/1250) is included only when set. The header carries the "confirm with CPA"
// disclaimer and the contract-funded note.
export function buildCostSegCsv(purchases) {
  const order = { "5-yr": 1, "7-yr": 2, "15-yr": 3, "27.5-yr": 4, "supplies": 5 };
  const rows = purchases
    .filter(p => p.status !== "Returned" && p.assetClass && p.placedInServiceDate)
    .sort((a, b) => (order[a.assetClass] || 9) - (order[b.assetClass] || 9) || (a.description || "").localeCompare(b.description || ""));
  const returned = purchases.filter(p => p.status === "Returned");
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Asset Class", "Description", "Vendor", "Invoice #", "Cost Basis (net of refunds)", "Placed In Service", "Section", "Room", "Trade", "Purchased By", "Owner/Contractor", "Funding Source"];
  const lines = [];
  lines.push(esc("Cost Segregation Export — asset classes are SUGGESTIONS; confirm all with your CPA / cost-seg engineer. Not tax advice."));
  lines.push(esc("Contract-funded items are already inside the construction contract price; do not add them to basis a second time."));
  lines.push(header.map(esc).join(","));
  let lastClass = null, subtotal = 0, grandTotal = 0;
  const blanks = (label, amt) => [esc(label), "", "", "", esc(amt), "", "", "", "", "", "", ""].join(",");
  const flushSubtotal = () => { if (lastClass != null) lines.push(blanks(lastClass + " subtotal", round2(subtotal))); };
  for (const p of rows) {
    if (p.assetClass !== lastClass) { flushSubtotal(); lastClass = p.assetClass; subtotal = 0; }
    const paid = netCost(p);
    subtotal += paid; grandTotal += paid;
    lines.push([
      esc(p.assetClass), esc(p.description), esc(p.vendor), esc(p.invoiceNo), esc(paid),
      esc(p.placedInServiceDate), esc(p.section), esc(p.room), esc(p.trade),
      esc(p.purchasedBy), esc(p.ownerPurchased ? "Owner" : "Contractor"), esc(fundingSource(p)),
    ].join(","));
  }
  flushSubtotal();
  lines.push(blanks("GRAND TOTAL", round2(grandTotal)));
  if (returned.length > 0) {
    lines.push("");
    lines.push(esc("Returned (excluded)"));
    lines.push(["Description", "Vendor", "Invoice #", "Paid", "Refund"].map(esc).join(","));
    for (const p of returned) {
      lines.push([esc(p.description), esc(p.vendor), esc(p.invoiceNo), esc(Number(p.totalPaid) || 0), esc(Number(p.refundAmount) || 0)].join(","));
    }
  }
  return { csv: lines.join("\n"), count: rows.length };
}

export function newPurchaseId() {
  return `pur-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
export function fmtUSD(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function purchaseDefaults() {
  return {
    finishItemId: null, furnitureId: null, description: "", trade: "", room: "",
    vendor: "", invoiceNo: "", purchasedBy: "", ownerPurchased: true, paymentMethod: "",
    qty: null, unitPrice: null, tax: null, shipping: null, totalPaid: null,
    allowanceCategory: NOT_IN_ALLOWANCE, status: "Ordered", purchaseDate: "", receivedDate: "",
    placedInServiceDate: "", assetClass: "", section: "",
    warranty: false, warrantyTerm: "", registered: false, binderPocket: "",
    receipts: [], notes: "", userCreated: true,
    // Returns
    returnByDate: "", returnPolicyNote: "", refundAmount: null, refundDate: "",
    restockingFee: null, returnShippingCost: null, keepConfirmed: false,
    // Receiving
    inspected: false, inspectedDate: "", deliveredTo: "",
    // Order grouping
    orderGroupId: null, lineNo: null,
    // Reimbursement (Sparrow reimburses owner-paid purchases via loan draws)
    reimbursable: false, reimbursedBy: "", reimbursementStatus: "none",
    reimbursedAmount: null, reimbursedDate: "", drawNo: "",
    // Marketplace / payment proof
    sourceVendor: "", fees: null, docType: "", paymentConfirmed: false, lienWaiverReceived: false,
  };
}

export function emptyPurchase() {
  return { id: newPurchaseId(), ...purchaseDefaults() };
}

// Fill any missing fields on a saved record (in memory only — nothing is written back).
export function normalizePurchase(p) {
  return { ...purchaseDefaults(), ...p };
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Money actually spent: paid minus refunded, never negative.
export function netCost(p) {
  return Math.max(0, round2((Number(p && p.totalPaid) || 0) - (Number(p && p.refundAmount) || 0)));
}

// Trades where an owner (Josh/Kerry) buy is not drawn from any Exhibit B allowance.
const OWNER_FFE_TRADES = [
  "Small Appliances", "Kitchen & Dining", "Supplies & Consumables", "Window Treatments",
  "Furniture / FF&E", "Decor & Styling", "Linens & Soft Goods", "Electronics / AV",
];
const TRADE_ALLOWANCE = {
  "Closets & Shelving": "Shelving", "Electrical": "Electrical Fixtures", "Plumbing": "Plumbing Fixtures",
};

// Suggested allowance category for a (trade, payer) pair, or null for "no default — user picks".
export function defaultAllowanceFor(trade, purchasedBy) {
  const owner = purchasedBy === "Josh" || purchasedBy === "Kerry";
  if (owner && OWNER_FFE_TRADES.includes(trade)) return NOT_IN_ALLOWANCE;
  if (TRADE_ALLOWANCE[trade]) return TRADE_ALLOWANCE[trade];
  if (purchasedBy === CONTRACTOR_PURCHASER && OWNER_FFE_TRADES.includes(trade)) return CONTRACTOR_SCOPE;
  return null;
}

// Reimbursement defaults for a vendor. Nothing to reimburse when Sparrow paid directly.
export function reimbursementDefaultsFor(vendor, purchasedBy, vendors = DEFAULT_REIMBURSABLE_VENDORS) {
  const v = String(vendor || "").trim().toLowerCase();
  const match = v !== "" && vendors.some(x => String(x).trim().toLowerCase() === v);
  if (match && purchasedBy !== CONTRACTOR_PURCHASER) {
    return { reimbursable: true, reimbursedBy: CONTRACTOR_PURCHASER, reimbursementStatus: "pending" };
  }
  return { reimbursable: false, reimbursedBy: "", reimbursementStatus: "none" };
}

// Badge for statements/quotes (which are not proof of payment). Null when nothing to flag.
export function paymentBadge(p) {
  if (!p || (p.docType !== "statement" && p.docType !== "quote")) return null;
  if (p.purchasedBy === CONTRACTOR_PURCHASER) return p.lienWaiverReceived ? null : "Contractor-paid: confirm in draw";
  return p.paymentConfirmed ? null : "Unpaid / no proof of payment";
}

// Totals for the stat cards, on net cost (refunds subtracted).
export function summarizePurchases(purchases) {
  let total = 0, owner = 0, contractor = 0;
  const byTrade = {};
  for (const p of purchases) {
    const amt = netCost(p);
    total += amt;
    if (p.ownerPurchased) owner += amt; else contractor += amt;
    if (p.trade) byTrade[p.trade] = round2((byTrade[p.trade] || 0) + amt);
  }
  return { total: round2(total), owner: round2(owner), contractor: round2(contractor), byTrade };
}

// Where the money came from: paid by Sparrow directly, paid by the owner then reimbursed by
// Sparrow (loan draws), or owner direct.
export function fundingSource(p) {
  if (!p || !p.ownerPurchased) return "Contract (paid by Sparrow)";
  return p.reimbursable ? "Contract (reimbursed by Sparrow)" : "Owner direct";
}

const sumNet = (list) => round2(list.reduce((s, p) => s + netCost(p), 0));

// "Due from Sparrow": reimbursable purchases not yet reimbursed, on net cost (fully refunded
// lines drop out). reimbursedAmount is informational only.
export function reimbursementsDue(purchases) {
  const list = purchases.filter(p => p.reimbursable && p.reimbursementStatus !== "reimbursed" && netCost(p) > 0);
  return { total: sumNet(list), purchases: list };
}

// Owner-paid purchases charged to an Exhibit B category and NOT reimbursable: a credit the owners
// should settle with Sparrow in writing.
export function allowanceCredits(purchases) {
  const list = purchases.filter(p => p.ownerPurchased && !p.reimbursable && EXHIBIT_B_NAMES.includes(p.allowanceCategory) && netCost(p) > 0);
  return { total: sumNet(list), purchases: list };
}

// Exhibit B reconciliation. Each category splits spend by funding source; reimbursed items with
// no Exhibit B category count against the lump-sum pool; contractor-scope spend is listed
// separately (confirm it is in the base contract) and is NOT charged to the pool.
export function allowancePool(purchases, allowances = ALLOWANCE_CATEGORIES) {
  const names = allowances.map(a => a.name);
  const rows = allowances.map(a => {
    const mine = purchases.filter(p => p.allowanceCategory === a.name);
    const by = (src) => sumNet(mine.filter(p => fundingSource(p) === src));
    const paidBySparrow = by("Contract (paid by Sparrow)");
    const reimbursedToOwner = by("Contract (reimbursed by Sparrow)");
    const ownerDirect = by("Owner direct");
    const spent = round2(paidBySparrow + reimbursedToOwner + ownerDirect);
    return {
      name: a.name, allowance: a.allowance, paidBySparrow, reimbursedToOwner, ownerDirect, spent,
      remaining: round2(a.allowance - spent),
      pct: a.allowance ? Math.round((spent / a.allowance) * 100) : 0,
    };
  });
  const noCat = purchases.filter(p => p.reimbursable && !names.includes(p.allowanceCategory));
  const scope = purchases.filter(p => p.allowanceCategory === CONTRACTOR_SCOPE);
  const poolTotal = round2(allowances.reduce((s, a) => s + a.allowance, 0));
  const reimbursedNoCategory = { total: sumNet(noCat), purchases: noCat };
  const poolCharged = round2(rows.reduce((s, r) => s + r.spent, 0) + reimbursedNoCategory.total);
  return {
    rows,
    contractorScope: { total: sumNet(scope), purchases: scope },
    reimbursedNoCategory,
    poolTotal, poolCharged, poolRemaining: round2(poolTotal - poolCharged),
  };
}

// ── Returns, dates, order grouping ───────────────────────────────────────────

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

// Today's date as YYYY-MM-DD from the LOCAL clock (toISOString would flip a day in the evening).
export function localISODate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Whole days from fromISO to toISO; null if either is not a valid YYYY-MM-DD.
export function daysBetween(fromISO, toISO) {
  if (!ISO_RE.test(fromISO || "") || !ISO_RE.test(toISO || "")) return null;
  const utc = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const diff = Math.round((utc(toISO) - utc(fromISO)) / 86400000);
  return Number.isNaN(diff) ? null : diff;
}

// Purchases whose return window closes from today through today+days (soonest first),
// excluding Returned and ones the owners already decided to keep. Closed windows are not listed.
export function returnsClosingSoon(purchases, todayISO, days = 14) {
  return purchases
    .map((p, i) => ({ p, i, left: daysBetween(todayISO, p.returnByDate) }))
    .filter(({ p, left }) => left !== null && left >= 0 && left <= days && p.status !== "Returned" && !p.keepConfirmed)
    .sort((a, b) => a.left - b.left || a.i - b.i)
    .map(({ p }) => p);
}

export function newOrderGroupId() {
  return `og-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Group purchases that share an orderGroupId. A group sits where its first member appeared;
// its lines sort by lineNo (unnumbered lines after numbered ones, in input order); one-member
// groups render as a plain single.
export function groupByOrder(purchases) {
  const members = {};
  for (const p of purchases) {
    if (p.orderGroupId) (members[p.orderGroupId] = members[p.orderGroupId] || []).push(p);
  }
  const out = [];
  const emitted = new Set();
  for (const p of purchases) {
    const gid = p.orderGroupId;
    if (!gid || members[gid].length < 2) { out.push({ kind: "single", purchase: p }); continue; }
    if (emitted.has(gid)) continue;
    emitted.add(gid);
    const lines = members[gid]
      .map((m, i) => ({ m, i }))
      .sort((a, b) => {
        const an = a.m.lineNo == null, bn = b.m.lineNo == null;
        if (an !== bn) return an ? 1 : -1;
        return (an ? 0 : a.m.lineNo - b.m.lineNo) || a.i - b.i;
      })
      .map(x => x.m);
    out.push({ kind: "order", orderGroupId: gid, purchases: lines, subtotal: round2(lines.reduce((s, m) => s + netCost(m), 0)) });
  }
  return out;
}
