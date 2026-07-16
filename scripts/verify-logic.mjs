/**
 * Pure-logic checks for the purchases / cost-seg / scoping code — no DB, no browser.
 * Run: node scripts/verify-logic.mjs   (or `npm test`, which runs this + the phase-1 checks)
 */
import assert from 'node:assert/strict';
import {
  buildCostSegCsv, suggestAssetClass, emptyPurchase, NOT_IN_ALLOWANCE,
} from '../src/lib/purchases-logic.js';
import { scopedKey, parseReceiptPathname } from '../api/_scope.js';
import {
  matchesFinishSearch, buildRoomCopies, mergeFinishes, migrateRoom,
  finishItemField, furnitureField, roomField, tombstone,
  BUDGET_FIELD, MIGRATED_FIELD, partitionFinishFields, blobToFields,
} from '../src/lib/design-logic.js';

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

console.log('matchesFinishSearch():');
{
  const item = { item: 'Kohler faucet', notes: 'brushed nickel', url: 'https://kohler.com/x' };
  assert.equal(matchesFinishSearch(item, 'Purist', ''), true);      // blank term matches all
  assert.equal(matchesFinishSearch(item, 'Purist', '   '), true);   // whitespace-only matches all
  assert.equal(matchesFinishSearch(item, 'Purist', 'kohler'), true);   // matches name, case-insensitive
  assert.equal(matchesFinishSearch(item, 'Purist', 'PURIST'), true);   // matches resolved selection
  assert.equal(matchesFinishSearch(item, 'Purist', 'nickel'), true);   // matches notes
  assert.equal(matchesFinishSearch(item, 'Purist', 'kohler.com'), true); // matches url
  assert.equal(matchesFinishSearch(item, 'Purist', 'bathtub'), false);   // no match
  ok('matches name/selection/notes/url case-insensitively; blank term matches all');
  const sparse = { item: 'Towel bar' };
  assert.equal(matchesFinishSearch(sparse, '', 'towel'), true);   // missing fields don't throw
  assert.equal(matchesFinishSearch(sparse, null, 'zzz'), false);
  ok('tolerates missing selection/notes/url fields');
}

console.log('buildRoomCopies():');
{
  const source = {
    id: 'p1', category: 'plumbing', room: 'primary-bath', item: 'Shower valve',
    contractorOptions: ['A', 'B'], selection: 'Delta 17T', unitPrice: 120, quantity: 2,
    unit: 'ea', url: 'https://x.com', notes: 'trim in nickel', assignee: 'JM', dueDate: '2026-01-01',
    userCreated: false, linkedTo: null,
  };

  // Independent mode
  const ind = buildRoomCopies({ source, roomIds: ['guest-bath', 'pool-bath'], mode: 'independent', idBase: 1000 });
  assert.equal(ind.length, 2);
  assert.equal(ind[0].id, 'uf10000');
  assert.equal(ind[1].id, 'uf10001');
  assert.notEqual(ind[0].id, ind[1].id);
  assert.equal(ind[0].room, 'guest-bath');
  assert.equal(ind[0].item, 'Shower valve');
  assert.equal(ind[0].category, 'plumbing');
  assert.equal(ind[0].selection, 'Delta 17T');    // carried over
  assert.equal(ind[0].unitPrice, 120);
  assert.equal(ind[0].unit, 'ea');
  assert.equal(ind[0].url, 'https://x.com');
  assert.deepEqual(ind[0].contractorOptions, ['A', 'B']);
  assert.equal(ind[0].quantity, 2);
  assert.equal(ind[0].notes, 'trim in nickel');
  assert.equal(ind[0].linkedTo, null);
  assert.equal(ind[0].userCreated, true);
  assert.equal(ind[0].assignee, null);             // never carried
  assert.equal(ind[0].dueDate, null);
  ok('independent copies carry selection/price/unit/url/options, blank assignee/dueDate, unique ids');

  // contractorOptions is a fresh array (no shared reference)
  ind[0].contractorOptions.push('C');
  assert.deepEqual(source.contractorOptions, ['A', 'B']);
  ok('independent copy does not share the source contractorOptions array');

  // Linked mode from a root source
  const lnk = buildRoomCopies({ source, roomIds: ['guest-bath'], mode: 'linked', idBase: 2000 });
  assert.equal(lnk[0].linkedTo, 'p1');             // links to the source (it is the root)
  assert.equal(lnk[0].selection, '');              // inherited live, not copied
  assert.equal(lnk[0].unitPrice, null);
  assert.equal(lnk[0].url, '');
  assert.deepEqual(lnk[0].contractorOptions, []);
  assert.equal(lnk[0].quantity, 2);                // own quantity, seeded from source
  assert.equal(lnk[0].notes, 'trim in nickel');
  assert.equal(lnk[0].item, 'Shower valve');
  assert.equal(lnk[0].userCreated, true);
  ok('linked copies point at source id, leave selection/price/url blank, keep own quantity/notes');

  // Linked mode from a child source → links to the ROOT, not the child
  const childSource = { ...source, id: 'child1', linkedTo: 'root9' };
  const lnk2 = buildRoomCopies({ source: childSource, roomIds: ['pool-bath'], mode: 'linked', idBase: 3000 });
  assert.equal(lnk2[0].linkedTo, 'root9');
  ok('linked copy of a linked child points at the root parent (no two-level chain)');

  // Empty room list → empty result
  assert.deepEqual(buildRoomCopies({ source, roomIds: [], mode: 'independent', idBase: 4000 }), []);
  ok('no rooms → no copies');
}

console.log('mergeFinishes():');
{
  const defaults = [
    { id: 'f1', category: 'plumbing', room: 'kitchen', item: 'Sink faucet', unit: 'ea', selection: '', unitPrice: null },
    { id: 'f2', category: 'electrical', room: 'bunk-bath', item: 'Sconce', unit: 'ea', selection: '', unitPrice: null },
  ];

  // Regression: an edited NAME on a default item must survive the merge (was dropped → reverted on reload)
  const saved = [{ id: 'f1', item: 'Brizo sink faucet', selection: 'Brizo', unitPrice: 420 }];
  const m = mergeFinishes(saved, [], defaults);
  const f1 = m.find(i => i.id === 'f1');
  assert.equal(f1.item, 'Brizo sink faucet');   // the fix: name persists
  assert.equal(f1.selection, 'Brizo');
  assert.equal(f1.unitPrice, 420);
  ok('preserves an edited default-item name (regression: name no longer reverts on reload)');

  // An edited category on a default item also survives
  const m2 = mergeFinishes([{ id: 'f2', category: 'lighting' }], [], defaults);
  assert.equal(m2.find(i => i.id === 'f2').category, 'lighting');
  ok('preserves an edited default-item category');

  // Untouched default items keep their catalogue values
  assert.equal(m.find(i => i.id === 'f2').item, 'Sconce');
  ok('untouched defaults keep catalogue values');

  // Old room ids migrate; deleted default ids are excluded; user items pass through
  assert.equal(mergeFinishes([{ id: 'f2', room: 'bunk-bath' }], [], defaults).find(i => i.id === 'f2').room, 'bunk-room');
  assert.equal(migrateRoom('kitchen'), 'kitchen-upstairs');
  assert.ok(!mergeFinishes([], ['f1'], defaults).some(i => i.id === 'f1'));
  const withUser = mergeFinishes([{ id: 'u1', userCreated: true, room: 'kitchen', item: 'Custom shelf' }], [], defaults);
  assert.equal(withUser.find(i => i.id === 'u1').item, 'Custom shelf');
  assert.equal(withUser.find(i => i.id === 'u1').room, 'kitchen-upstairs');
  ok('migrates rooms, excludes deleted defaults, passes user items through');

  // Invalid saved payload → the defaults array, verbatim
  assert.equal(mergeFinishes(null, [], defaults), defaults);
  ok('null saved → defaults');
}

console.log('finish field helpers:');
{
  assert.equal(finishItemField('t42'), 'item:t42');
  assert.equal(furnitureField('kitchen-upstairs', 'furn9'), 'furn:kitchen-upstairs:furn9');
  assert.equal(roomField('bunk-room'), 'room:bunk-room');
  assert.equal(BUDGET_FIELD, 'budget');
  assert.deepEqual(tombstone('t42'), { id: 't42', __deleted: true });
  ok('field-name builders + tombstone');
}

console.log('blobToFields() → partitionFinishFields() round-trip:');
{
  const blob = {
    items: [
      { id: 't1', category: 'flooring', room: 'kitchen-upstairs', item: 'LVP', selection: 'Coretec', unitPrice: 5, quantity: 100, unit: 'sqft', userCreated: false },
      { id: 'uf7', category: 'plumbing', room: 'guest-bath', item: 'Custom faucet', userCreated: true, linkedTo: null, contractorOptions: ['A'] },
    ],
    deletedIds: ['t99'],
    roomData: {
      'kitchen-upstairs': { miroUrl: 'https://miro/x', furniture: [ { id: 'furn1', name: 'Stool', price: 40, purchased: false } ] },
      'guest-bath': { miroUrl: '', furniture: [] },
    },
    targetBudget: 446000,
  };

  const fields = blobToFields(blob);
  // Upstash hgetall returns already-parsed objects; simulate that (values are objects, not strings).
  assert.deepEqual(fields['item:t1'].item, 'LVP');
  assert.deepEqual(fields['item:t99'], { id: 't99', __deleted: true });
  assert.equal(fields['furn:kitchen-upstairs:furn1'].name, 'Stool');
  assert.deepEqual(fields['room:kitchen-upstairs'], { miroUrl: 'https://miro/x' });
  assert.equal(fields[BUDGET_FIELD], 446000);
  ok('blobToFields emits item/furn/room/budget + deletion tombstones');

  const parsed = partitionFinishFields(fields);
  assert.equal(parsed.savedItems.length, 2);                       // tombstone NOT a saved item
  assert.deepEqual(parsed.deletedIds, ['t99']);
  assert.equal(parsed.savedItems.find(i => i.id === 'uf7').userCreated, true);
  assert.equal(parsed.roomData['kitchen-upstairs'].miroUrl, 'https://miro/x');
  assert.equal(parsed.roomData['kitchen-upstairs'].furniture[0].name, 'Stool');
  assert.equal(parsed.targetBudget, 446000);
  ok('partitionFinishFields splits items/deletions/roomData/budget');

  // String values (Upstash may return raw strings) parse too.
  const asStrings = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]));
  const parsed2 = partitionFinishFields(asStrings);
  assert.equal(parsed2.savedItems.length, 2);
  assert.deepEqual(parsed2.deletedIds, ['t99']);
  ok('partitionFinishFields tolerates string-encoded field values');

  // Unknown/reserved fields ignored.
  const parsed3 = partitionFinishFields({ ...fields, [MIGRATED_FIELD]: '1', 'weird:thing': 'x' });
  assert.equal(parsed3.savedItems.length, 2);
  ok('partitionFinishFields ignores __migrated and unknown prefixes');

  // Empty map → empty everything.
  const empty = partitionFinishFields({});
  assert.deepEqual(empty.savedItems, []);
  assert.deepEqual(empty.deletedIds, []);
  assert.deepEqual(empty.roomData, {});
  assert.equal(empty.targetBudget, null);
  ok('empty hash → empty partition');

  // Null/undefined map → empty partition (never throws).
  assert.deepEqual(partitionFinishFields(null).savedItems, []);
  ok('null hash → empty partition');

  // Furniture is sorted by id (stable order) regardless of HGETALL field order.
  const shuffled = {
    'furn:den:furn200': { id: 'furn200', name: 'Later' },
    'furn:den:furn100': { id: 'furn100', name: 'Earlier' },
  };
  const ord = partitionFinishFields(shuffled).roomData['den'].furniture.map(f => f.id);
  assert.deepEqual(ord, ['furn100', 'furn200']);
  ok('furniture is deterministically ordered by id');
}

console.log(`\nAll ${passed} checks passed.`);
