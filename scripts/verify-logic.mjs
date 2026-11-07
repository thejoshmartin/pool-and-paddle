/**
 * Pure-logic checks for the purchases / cost-seg / scoping code — no DB, no browser.
 * Run: node scripts/verify-logic.mjs   (or `npm test`, which runs this + the phase-1 checks)
 */
import assert from 'node:assert/strict';
import {
  buildCostSegCsv, suggestAssetClass, emptyPurchase, NOT_IN_ALLOWANCE,
  PURCHASE_TRADES, PURCHASE_STATUSES, ASSET_CLASSES, CONTRACTOR_SCOPE, CONTRACTOR_PURCHASER,
  assetClassLabel, defaultAllowanceFor, reimbursementDefaultsFor, purchaseDefaults,
  normalizePurchase, netCost, paymentBadge, summarizePurchases,
} from '../src/lib/purchases-logic.js';
import { scopedKey, parseReceiptPathname, migrateFinishesToHash } from '../api/_scope.js';
import {
  matchesFinishSearch, buildRoomCopies, mergeFinishes, migrateRoom,
  finishItemField, furnitureField, roomField, tombstone,
  BUDGET_FIELD, MIGRATED_FIELD, partitionFinishFields, blobToFields,
} from '../src/lib/design-logic.js';
import {
  HOUSE_INFO_CATEGORIES, newHouseInfoId, emptyHouseInfoItem,
  matchesHouseInfoSearch, sanitizeHouseInfoItem, groupHouseInfoByCategory,
} from '../src/lib/house-info-logic.js';

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
  const expected = ['id','finishItemId','furnitureId','description','trade','room','vendor','invoiceNo','purchasedBy','ownerPurchased','paymentMethod','qty','unitPrice','tax','shipping','totalPaid','allowanceCategory','status','purchaseDate','receivedDate','placedInServiceDate','assetClass','section','warranty','warrantyTerm','registered','binderPocket','receipts','notes','userCreated','returnByDate','returnPolicyNote','refundAmount','refundDate','restockingFee','returnShippingCost','keepConfirmed','inspected','inspectedDate','deliveredTo','orderGroupId','lineNo','reimbursable','reimbursedBy','reimbursementStatus','reimbursedAmount','reimbursedDate','drawNo','sourceVendor','fees','docType','paymentConfirmed','lienWaiverReceived'];
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

console.log('migrateFinishesToHash():');
{
  // Minimal mock redis backing store.
  function mockRedis(initial = {}) {
    const store = { ...initial };     // string keys → value; hash keys → object
    return {
      store,
      async hget(key, field) { return (store[key] || {})[field] ?? null; },
      async hgetall(key) { return store[key] ? { ...store[key] } : null; },
      async get(key) { return store[key] ?? null; },
      async set(key, val, opts) {
        if (opts && opts.nx && key in store) return null;
        store[key] = val; return 'OK';
      },
      async hset(key, obj) { store[key] = { ...(store[key] || {}), ...obj }; return 1; },
      async del(key) { delete store[key]; return 1; },
    };
  }

  const blob = { items: [{ id: 't1', item: 'LVP' }], deletedIds: ['t9'], roomData: {}, targetBudget: 100 };
  const redis = mockRedis({ 'finishes:pp': blob });
  const toFields = blobToFields;

  const r1 = await migrateFinishesToHash(redis, { key: 'finish-records:pp', legacyKey: 'finishes:pp', toFields });
  assert.equal(r1.status, 'migrated');
  assert.equal(JSON.parse(redis.store['finish-records:pp']['item:t1']).item, 'LVP');
  assert.deepEqual(JSON.parse(redis.store['finish-records:pp']['item:t9']), { id: 't9', __deleted: true });
  assert.equal(redis.store['finish-records:pp']['__migrated'], '1');
  assert.equal('finishes:pp' in redis.store, true);          // blob NEVER deleted
  ok('migrates the blob into the hash, stamps __migrated, keeps the blob');

  const r2 = await migrateFinishesToHash(redis, { key: 'finish-records:pp', legacyKey: 'finishes:pp', toFields });
  assert.equal(r2.status, 'already');                          // idempotent
  ok('second run is a no-op (already stamped)');

  const fresh = mockRedis({});                                 // no legacy blob
  const r3 = await migrateFinishesToHash(fresh, { key: 'finish-records:new', legacyKey: 'finishes:new', toFields });
  assert.equal(r3.status, 'empty');
  assert.equal('finish-records:new' in fresh.store, false);
  ok('no legacy blob → nothing migrated');

  // Interrupted run: content fields present, __migrated stamp NOT yet written, and the user
  // has since edited item:t1. A retry must NOT re-write the stale legacy blob over the edit.
  const interrupted = mockRedis({
    'finishes:pp': { items: [{ id: 't1', item: 'LVP' }], deletedIds: [], roomData: {}, targetBudget: null },
    'finish-records:pp': { 'item:t1': JSON.stringify({ id: 't1', item: 'User renamed this' }) },
  });
  const r4 = await migrateFinishesToHash(interrupted, { key: 'finish-records:pp', legacyKey: 'finishes:pp', toFields });
  assert.equal(r4.status, 'already');
  assert.equal(JSON.parse(interrupted.store['finish-records:pp']['item:t1']).item, 'User renamed this'); // edit preserved
  assert.equal(interrupted.store['finish-records:pp']['__migrated'], '1');                                // stamp finished
  ok('interrupted migration + later edit → no re-clobber, stamp completed');
}

console.log('\nhouse-info-logic:');
{
  assert.deepEqual(HOUSE_INFO_CATEGORIES, ['Utility', 'Legal & Financial', 'Access & Security', 'Vendor & Service', 'Other']);
  ok('HOUSE_INFO_CATEGORIES has the 5 expected categories, in order');

  const id1 = newHouseInfoId();
  const id2 = newHouseInfoId();
  assert.match(id1, /^hi-[a-z0-9-]+$/);
  assert.notEqual(id1, id2);
  ok('newHouseInfoId() matches the expected shape and is unique per call');

  const item = emptyHouseInfoItem();
  const expectedKeys = ['id', 'category', 'name', 'accountNumber', 'username', 'password', 'url', 'phone', 'notes', 'updatedAt', 'updatedBy'];
  for (const k of expectedKeys) assert.ok(k in item, `missing field: ${k}`);
  assert.match(item.id, /^hi-[a-z0-9-]+$/);
  assert.equal(item.category, '');
  assert.equal(item.name, '');
  assert.equal(item.updatedAt, null);
  assert.equal(item.updatedBy, null);
  ok('emptyHouseInfoItem() has all expected fields with blank/null defaults');

  const fpl = { id: 'hi-1', category: 'Utility', name: 'FPL Electric', accountNumber: '12345', username: '', password: '', url: '', phone: '', notes: 'Call before 5pm', updatedAt: null, updatedBy: null };
  assert.equal(matchesHouseInfoSearch(fpl, ''), true);
  assert.equal(matchesHouseInfoSearch(fpl, 'fpl'), true);
  assert.equal(matchesHouseInfoSearch(fpl, 'UTILITY'), true);
  assert.equal(matchesHouseInfoSearch(fpl, '12345'), true);
  assert.equal(matchesHouseInfoSearch(fpl, 'before 5pm'), true);
  assert.equal(matchesHouseInfoSearch(fpl, 'insurance'), false);
  ok('matchesHouseInfoSearch() matches name/category/accountNumber/notes, case-insensitive; blank term matches all');

  const stamp = { updatedAt: '2026-10-01T00:00:00.000Z', updatedBy: 'JM' };
  const raw = {
    id: 'hi-abc123', category: 'Utility', name: 'FPL Electric',
    accountNumber: 98765, username: 'josh@example.com', password: 'hunter2',
    url: 'https://fpl.com', phone: '9045551234', notes: 'n',
    updatedAt: '2000-01-01T00:00:00.000Z', updatedBy: 'KM',   // client-supplied — must be overwritten
    evil: '<script>alert(1)</script>',                          // unknown field — must be dropped
  };
  const r1 = sanitizeHouseInfoItem(raw, stamp);
  assert.equal(r1.ok, true);
  assert.deepEqual(Object.keys(r1.item).sort(), ['accountNumber','category','id','name','notes','password','phone','updatedAt','updatedBy','url','username'].sort());
  assert.equal(r1.item.accountNumber, '98765');     // coerced to string
  assert.equal(r1.item.updatedAt, stamp.updatedAt); // server stamp wins
  assert.equal(r1.item.updatedBy, stamp.updatedBy); // server stamp wins
  assert.equal('evil' in r1.item, false);           // unknown field dropped
  ok('sanitizeHouseInfoItem() whitelists fields, coerces to strings, and always overwrites updatedAt/updatedBy with the server-provided stamp');

  assert.equal(sanitizeHouseInfoItem({ ...raw, name: '  FPL Electric  ' }, stamp).item.name, 'FPL Electric');
  ok('sanitizeHouseInfoItem() trims the stored name');

  assert.equal(sanitizeHouseInfoItem({ ...raw, id: 'not-valid-id' }, stamp).ok, false);
  assert.equal(sanitizeHouseInfoItem({ ...raw, id: 'HI-ABC' }, stamp).ok, false);
  ok('sanitizeHouseInfoItem() rejects an id that does not match /^hi-[a-z0-9-]+$/');

  assert.equal(sanitizeHouseInfoItem({ ...raw, category: 'Not A Real Category' }, stamp).ok, false);
  ok('sanitizeHouseInfoItem() rejects a category outside HOUSE_INFO_CATEGORIES');

  assert.equal(sanitizeHouseInfoItem({ ...raw, name: '' }, stamp).ok, false);
  assert.equal(sanitizeHouseInfoItem({ ...raw, name: '   ' }, stamp).ok, false);
  ok('sanitizeHouseInfoItem() rejects a blank/whitespace-only name');

  const items = [
    { id: 'a', category: 'Utility', name: 'FPL' },
    { id: 'b', category: 'Other', name: 'Spare key' },
    { id: 'c', category: 'Vintage Category', name: 'Old thing' }, // not in HOUSE_INFO_CATEGORIES
  ];
  const { order, groups } = groupHouseInfoByCategory(items);
  assert.deepEqual(order.slice(0, HOUSE_INFO_CATEGORIES.length), HOUSE_INFO_CATEGORIES);
  assert.deepEqual(order.slice(HOUSE_INFO_CATEGORIES.length), ['Vintage Category']);
  assert.equal(groups['Utility'].length, 1);
  assert.equal(groups['Other'].length, 1);
  assert.equal(groups['Vintage Category'].length, 1);
  assert.equal(groupHouseInfoByCategory([]).order.join(','), HOUSE_INFO_CATEGORIES.join(','));
  ok('groupHouseInfoByCategory() orders every known category first, then any unrecognized category present in the data, so an item can never silently disappear just because its category fell out of the official list');
}

console.log('Phase 1 — trades / statuses / asset classes:');
{
  assert.equal(PURCHASE_TRADES.length, 22);
  for (const t of ['Small Appliances', 'Kitchen & Dining', 'Supplies & Consumables', 'Window Treatments', 'Closets & Shelving']) {
    assert.ok(PURCHASE_TRADES.includes(t), `missing trade ${t}`);
  }
  assert.equal(PURCHASE_TRADES[PURCHASE_TRADES.length - 1], 'Other');
  ok('22 trades incl. the five new ones, "Other" still last');
  assert.deepEqual(PURCHASE_STATUSES, ['Ordered', 'Received', 'Installed', 'Return started', 'Returned']);
  assert.ok(ASSET_CLASSES.includes('supplies'));
  ok('5 statuses and the supplies asset class');
  assert.equal(suggestAssetClass('Small Appliances'), '5-yr');
  assert.equal(suggestAssetClass('Kitchen & Dining'), '5-yr');
  assert.equal(suggestAssetClass('Supplies & Consumables'), 'supplies');
  assert.equal(suggestAssetClass('Window Treatments'), '5-yr');
  assert.equal(suggestAssetClass('Closets & Shelving'), '27.5-yr');
  assert.equal(assetClassLabel('supplies'), 'Supplies / expense (confirm with CPA)');
  assert.equal(assetClassLabel('5-yr'), '5-yr');
  ok('new trades suggest the right class; supplies has its CPA label');
}

console.log('defaultAllowanceFor() / reimbursementDefaultsFor():');
{
  const OWNER_TRADES = ['Small Appliances', 'Kitchen & Dining', 'Supplies & Consumables', 'Window Treatments',
    'Furniture / FF&E', 'Decor & Styling', 'Linens & Soft Goods', 'Electronics / AV'];
  for (const t of OWNER_TRADES) {
    assert.equal(defaultAllowanceFor(t, 'Josh'), NOT_IN_ALLOWANCE, `${t}/Josh`);
    assert.equal(defaultAllowanceFor(t, 'Kerry'), NOT_IN_ALLOWANCE, `${t}/Kerry`);
  }
  ok('owner-bought FF&E-type trades default to Not in Allowance (toaster cannot draw down Appliances)');
  assert.equal(defaultAllowanceFor('Closets & Shelving', 'Sparrow (Contractor)'), 'Shelving');
  assert.equal(defaultAllowanceFor('Closets & Shelving', 'Josh'), 'Shelving');
  assert.equal(defaultAllowanceFor('Electrical', 'Josh'), 'Electrical Fixtures');
  assert.equal(defaultAllowanceFor('Plumbing', 'Sparrow (Contractor)'), 'Plumbing Fixtures');
  ok('Closets→Shelving, Electrical→Electrical Fixtures, Plumbing→Plumbing Fixtures whoever paid');
  assert.equal(defaultAllowanceFor('Window Treatments', 'Sparrow (Contractor)'), CONTRACTOR_SCOPE);
  assert.equal(defaultAllowanceFor('Small Appliances', 'Sparrow (Contractor)'), CONTRACTOR_SCOPE);
  assert.equal(defaultAllowanceFor('Flooring', 'Sparrow (Contractor)'), null);
  assert.equal(defaultAllowanceFor('Appliances', 'Josh'), null);
  assert.equal(defaultAllowanceFor('Small Appliances', ''), null);
  assert.equal(defaultAllowanceFor('', 'Josh'), null);
  ok('Sparrow-paid no-category trades → Contractor scope; otherwise no default');

  assert.deepEqual(reimbursementDefaultsFor('Minoan', 'Josh'),
    { reimbursable: true, reimbursedBy: 'Sparrow (Contractor)', reimbursementStatus: 'pending' });
  assert.equal(reimbursementDefaultsFor(' minoan ', 'Kerry').reimbursable, true);
  assert.deepEqual(reimbursementDefaultsFor('Amazon', 'Josh'), { reimbursable: false, reimbursedBy: '', reimbursementStatus: 'none' });
  assert.deepEqual(reimbursementDefaultsFor('Minoan', 'Sparrow (Contractor)'), { reimbursable: false, reimbursedBy: '', reimbursementStatus: 'none' });
  assert.equal(reimbursementDefaultsFor('Wayfair', 'Josh', ['Wayfair']).reimbursable, true);
  ok('Minoan (case/space-insensitive) defaults to reimbursable/pending; not when Sparrow paid; vendor list overridable');
}

console.log('emptyPurchase() / normalizePurchase() — Phase 1 fields:');
{
  const p = emptyPurchase();
  assert.equal(p.returnByDate, ''); assert.equal(p.refundAmount, null); assert.equal(p.keepConfirmed, false);
  assert.equal(p.inspected, false); assert.equal(p.deliveredTo, '');
  assert.equal(p.orderGroupId, null); assert.equal(p.lineNo, null);
  assert.equal(p.reimbursable, false); assert.equal(p.reimbursementStatus, 'none');
  assert.equal(p.docType, ''); assert.equal(p.paymentConfirmed, false); assert.equal(p.lienWaiverReceived, false);
  assert.equal(p.fees, null); assert.equal(p.section, '');
  ok('emptyPurchase carries every Phase 1 default; section still blank');

  const old = { id: 'pur-old', description: 'x', totalPaid: 10, refundAmount: 5 };
  const frozen = JSON.stringify(old);
  const n = normalizePurchase(old);
  assert.equal(n.id, 'pur-old'); assert.equal(n.description, 'x'); assert.equal(n.totalPaid, 10); assert.equal(n.refundAmount, 5);
  for (const k of Object.keys(purchaseDefaults())) assert.ok(k in n, `normalize missing ${k}`);
  assert.equal(JSON.stringify(old), frozen);
  assert.doesNotThrow(() => normalizePurchase({}));
  ok('normalizePurchase fills missing fields, keeps saved values, never mutates input');
}

console.log('netCost() / paymentBadge() / summarizePurchases():');
{
  assert.equal(netCost({ totalPaid: 120, refundAmount: 100 }), 20);
  assert.equal(netCost({ totalPaid: 40 }), 40);
  assert.equal(netCost({}), 0);
  assert.equal(netCost({ totalPaid: 50, refundAmount: 80 }), 0);
  assert.equal(netCost({ totalPaid: '12.5' }), 12.5);
  ok('netCost = paid − refund, clamped at 0, tolerant of blanks and numeric strings');

  assert.equal(paymentBadge({ docType: 'statement', paymentConfirmed: false, purchasedBy: 'Josh' }), 'Unpaid / no proof of payment');
  assert.equal(paymentBadge({ docType: 'statement', paymentConfirmed: true, purchasedBy: 'Josh' }), null);
  assert.equal(paymentBadge({ docType: 'quote', purchasedBy: 'Kerry' }), 'Unpaid / no proof of payment');
  assert.equal(paymentBadge({ docType: 'statement', purchasedBy: CONTRACTOR_PURCHASER, lienWaiverReceived: false }), 'Contractor-paid: confirm in draw');
  assert.equal(paymentBadge({ docType: 'statement', purchasedBy: CONTRACTOR_PURCHASER, lienWaiverReceived: true }), null);
  assert.equal(paymentBadge({ docType: 'receipt' }), null);
  assert.equal(paymentBadge({}), null);
  ok('paymentBadge: unpaid for statement/quote, contractor-paid variant needs lien waiver, none otherwise');

  const s = summarizePurchases([
    { totalPaid: 40, ownerPurchased: true, trade: 'Small Appliances' },
    { totalPaid: 1000, ownerPurchased: false, trade: 'Appliances' },
    { totalPaid: 120, refundAmount: 100, ownerPurchased: true, trade: 'Linens & Soft Goods' },
  ]);
  assert.equal(s.total, 1060); assert.equal(s.owner, 60); assert.equal(s.contractor, 1000);
  assert.equal(s.byTrade['Linens & Soft Goods'], 20);
  assert.doesNotThrow(() => summarizePurchases([{}]));
  ok('summarizePurchases sums net cost (refund 100 on 120 counts as 20) and tolerates bare records');
}

console.log(`\nAll ${passed} checks passed.`);
