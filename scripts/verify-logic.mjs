/**
 * Pure-logic checks for the purchases / cost-seg / scoping code — no DB, no browser.
 * Run: node scripts/verify-logic.mjs   (or `npm test`, which runs this + the phase-1 checks)
 */
import assert from 'node:assert/strict';
import {
  buildCostSegCsv, suggestAssetClass, emptyPurchase, NOT_IN_ALLOWANCE,
} from '../src/lib/purchases-logic.js';
import { scopedKey, parseReceiptPathname } from '../api/_scope.js';

let passed = 0;
function ok(name) { passed += 1; console.log(`  ✓ ${name}`); }

console.log('suggestAssetClass():');
assert.equal(suggestAssetClass('Appliances'), '5-yr');
assert.equal(suggestAssetClass('Furniture / FF&E'), '5-yr');
assert.equal(suggestAssetClass('Pool & Spa'), '15-yr');
assert.equal(suggestAssetClass('Flooring'), '27.5-yr');
ok('maps known trades to a suggested class');
assert.equal(suggestAssetClass('Other'), '');
assert.equal(suggestAssetClass('Nonexistent'), '');
ok('unknown trade → "" (no suggestion)');

console.log('emptyPurchase():');
{
  const p = emptyPurchase();
  const expected = ['id','finishItemId','furnitureId','description','trade','room','vendor','invoiceNo','purchasedBy','ownerPurchased','paymentMethod','qty','unitPrice','tax','shipping','totalPaid','allowanceCategory','status','purchaseDate','receivedDate','placedInServiceDate','assetClass','section','warranty','warrantyTerm','registered','binderPocket','receipts','notes','userCreated'];
  for (const k of expected) assert.ok(k in p, `missing field: ${k}`);
  ok('has all expected fields');
  assert.equal(p.allowanceCategory, NOT_IN_ALLOWANCE);
  assert.equal(p.section, '');           // never auto-guessed
  assert.ok(Array.isArray(p.receipts) && p.receipts.length === 0);
  assert.ok(p.id.startsWith('pur-'));
  ok('sensible defaults (NOT_IN_ALLOWANCE, blank section, empty receipts, pur- id)');
  assert.notEqual(emptyPurchase().id, emptyPurchase().id);
  ok('ids are unique');
}

console.log('buildCostSegCsv():');
{
  const { csv, count } = buildCostSegCsv([]);
  assert.equal(count, 0);
  assert.ok(csv.includes('SUGGESTIONS') && csv.includes('CPA'));
  ok('empty → count 0 + "confirm with CPA" disclaimer present');
}
{
  const purchases = [
    { assetClass: '27.5-yr', placedInServiceDate: '2026-01-01', totalPaid: 100, description: 'Tile', vendor: 'V', ownerPurchased: false, trade: 'Flooring', room: 'Kitchen', invoiceNo: '', section: '', purchasedBy: '' },
    { assetClass: '5-yr', placedInServiceDate: '2026-02-01', totalPaid: 50, description: 'Sofa', vendor: 'W', ownerPurchased: true, trade: 'Furniture / FF&E', room: 'Living', invoiceNo: '', section: '', purchasedBy: 'Josh' },
    { assetClass: '5-yr', placedInServiceDate: '2026-03-01', totalPaid: 25, description: 'Lamp', vendor: '', ownerPurchased: true, trade: 'Decor & Styling', room: '', invoiceNo: '', section: '', purchasedBy: '' },
    { assetClass: '', placedInServiceDate: '2026-01-01', totalPaid: 999, description: 'no class' },  // excluded
    { assetClass: '15-yr', placedInServiceDate: '', totalPaid: 999, description: 'no date' },         // excluded
  ];
  const { csv, count } = buildCostSegCsv(purchases);
  assert.equal(count, 3);
  ok('filters to items with BOTH assetClass and placedInServiceDate');
  const body = csv.split('\n');
  assert.ok(body[2].includes('5-yr'));   // 5-yr (order 1) sorts before 27.5-yr (order 4)
  ok('grouped by asset class in MACRS order');
  assert.ok(csv.includes('"5-yr subtotal"') && csv.includes('"27.5-yr subtotal"'));
  ok('per-class subtotals present');
  assert.ok(csv.includes('"GRAND TOTAL"') && csv.includes('"175"'));   // 100+50+25
  ok('grand total = sum of included totalPaid (175)');
}
{
  const purchases = [{ assetClass: '5-yr', placedInServiceDate: '2026-01-01', totalPaid: 10, description: 'A, "B"\nC', vendor: 'x', ownerPurchased: true, trade: '', room: '', invoiceNo: '', section: '', purchasedBy: '' }];
  const { csv } = buildCostSegCsv(purchases);
  assert.ok(csv.includes('"A, ""B""\nC"'));   // comma kept, quotes doubled, newline preserved — all inside quotes
  ok('escapes commas / quotes / newlines (RFC-4180)');
}

console.log('scopedKey() / parseReceiptPathname() — purchases + receipts:');
assert.equal(scopedKey('purchases', 'pp'), 'purchases:pp');
assert.equal(scopedKey('purchases', undefined), 'purchases');
assert.equal(scopedKey('purchases', '../evil'), null);
ok('scopedKey handles the purchases scope + rejects injection');
assert.deepEqual(parseReceiptPathname('receipts/pp/pur-1/file.jpg'), { propertyId: 'pp', purchaseId: 'pur-1' });
assert.equal(parseReceiptPathname('receipts/pp/pur-1/a/b.jpg'), null);   // extra path level
assert.equal(parseReceiptPathname('../../etc/passwd'), null);            // traversal / wrong prefix
assert.equal(parseReceiptPathname('receipts/pp/pur-1'), null);           // missing file segment
ok('parseReceiptPathname accepts valid, rejects traversal / extra levels / missing file');

console.log(`\nAll ${passed} checks passed.`);
