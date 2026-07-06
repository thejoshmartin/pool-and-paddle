// Pure purchase / cost-seg domain logic — NO React, NO browser APIs — so it can be
// unit-tested in plain node (see scripts/verify-logic.mjs) and reused by App.jsx.
// Browser-dependent helpers (receipt upload/compress, localStorage cache) stay in App.jsx.

export const PURCHASE_TRADES = [
  "Flooring", "Shower/Bath Tile", "Kitchens", "Countertops", "Paint", "Decking",
  "Appliances", "Electrical", "Plumbing", "Drywall", "Furniture / FF&E",
  "Decor & Styling", "Linens & Soft Goods", "Electronics / AV", "Outdoor & Landscape",
  "Pool & Spa", "Other",
];
export const PURCHASED_BY_OPTIONS = ["Josh", "Kerry", "Sparrow (Contractor)", "Other"];
export const CONTRACTOR_PURCHASER = "Sparrow (Contractor)";
export const PAYMENT_METHODS = ["Credit Card", "ACH / Bank Transfer", "Minoan", "Check", "Cash", "Other"];
export const PURCHASE_STATUSES = ["Ordered", "Received", "Installed"];
export const NOT_IN_ALLOWANCE = "Not in Allowance / Owner FF&E";
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

// Cost-seg (Phase 3). Asset classes are SUGGESTIONS only — always confirmed with the CPA.
export const ASSET_CLASSES = ["5-yr", "7-yr", "15-yr", "27.5-yr"];
export const ASSET_CLASS_BY_TRADE = {
  "Appliances": "5-yr", "Furniture / FF&E": "5-yr", "Decor & Styling": "5-yr",
  "Linens & Soft Goods": "5-yr", "Electronics / AV": "5-yr",
  "Decking": "15-yr", "Outdoor & Landscape": "15-yr", "Pool & Spa": "15-yr",
  "Flooring": "27.5-yr", "Shower/Bath Tile": "27.5-yr", "Kitchens": "27.5-yr",
  "Countertops": "27.5-yr", "Paint": "27.5-yr", "Electrical": "27.5-yr",
  "Plumbing": "27.5-yr", "Drywall": "27.5-yr",
};
export function suggestAssetClass(trade) { return ASSET_CLASS_BY_TRADE[trade] || ""; }

// Build a per-property cost-seg CSV: every purchase with BOTH an asset class and a
// placed-in-service date, grouped by asset class with subtotals. Section (§1245/1250)
// is included only when set. Header carries the "confirm with CPA" disclaimer.
export function buildCostSegCsv(purchases) {
  const order = { "5-yr": 1, "7-yr": 2, "15-yr": 3, "27.5-yr": 4 };
  const rows = purchases
    .filter(p => p.assetClass && p.placedInServiceDate)
    .sort((a, b) => (order[a.assetClass] || 9) - (order[b.assetClass] || 9) || (a.description || "").localeCompare(b.description || ""));
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Asset Class", "Description", "Vendor", "Invoice #", "Cost Basis (paid)", "Placed In Service", "Section", "Room", "Trade", "Purchased By", "Owner/Contractor"];
  const lines = [];
  lines.push(esc("Cost Segregation Export — asset classes are SUGGESTIONS; confirm all with your CPA / cost-seg engineer. Not tax advice."));
  lines.push(header.map(esc).join(","));
  let lastClass = null, subtotal = 0, grandTotal = 0;
  const blanks = (label, amt) => [esc(label), "", "", "", esc(amt), "", "", "", "", "", ""].join(",");
  const flushSubtotal = () => { if (lastClass != null) lines.push(blanks(lastClass + " subtotal", subtotal)); };
  for (const p of rows) {
    if (p.assetClass !== lastClass) { flushSubtotal(); lastClass = p.assetClass; subtotal = 0; }
    const paid = Number(p.totalPaid) || 0;
    subtotal += paid; grandTotal += paid;
    lines.push([
      esc(p.assetClass), esc(p.description), esc(p.vendor), esc(p.invoiceNo), esc(paid),
      esc(p.placedInServiceDate), esc(p.section), esc(p.room), esc(p.trade),
      esc(p.purchasedBy), esc(p.ownerPurchased ? "Owner" : "Contractor"),
    ].join(","));
  }
  flushSubtotal();
  lines.push(blanks("GRAND TOTAL", grandTotal));
  return { csv: lines.join("\n"), count: rows.length };
}

export function newPurchaseId() {
  return `pur-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
export function fmtUSD(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function emptyPurchase() {
  return {
    id: newPurchaseId(), finishItemId: null, furnitureId: null, description: "", trade: "", room: "",
    vendor: "", invoiceNo: "", purchasedBy: "", ownerPurchased: true, paymentMethod: "",
    qty: null, unitPrice: null, tax: null, shipping: null, totalPaid: null,
    allowanceCategory: NOT_IN_ALLOWANCE, status: "Ordered", purchaseDate: "", receivedDate: "",
    placedInServiceDate: "", assetClass: "", section: "",
    warranty: false, warrantyTerm: "", registered: false, binderPocket: "",
    receipts: [], notes: "", userCreated: true,
  };
}
