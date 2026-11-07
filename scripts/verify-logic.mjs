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
  fundingSource, reimbursementsDue, allowanceCredits, allowancePool,
  localISODate, daysBetween, returnsClosingSoon, newOrderGroupId, groupByOrder, statusChangePatch, formDefaultsTouched,
} from '../src/lib/purchases-logic.js';
import * as SH from '../src/lib/shopping-logic.js';
import { scopedKey, parseReceiptPathname, migrateFinishesToHash, purchasesFromHash, isReceiptReferenced } from '../api/_scope.js';
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
  const expected = ['id','finishItemId','furnitureId','description','trade','room','vendor','invoiceNo','purchasedBy','ownerPurchased','paymentMethod','qty','unitPrice','tax','shipping','totalPaid','allowanceCategory','status','purchaseDate','receivedDate','placedInServiceDate','assetClass','section','warranty','warrantyTerm','registered','binderPocket','receipts','notes','userCreated','returnByDate','returnPolicyNote','refundAmount','refundDate','restockingFee','returnShippingCost','keepConfirmed','inspected','inspectedDate','deliveredTo','orderGroupId','lineNo','reimbursable','reimbursedBy','reimbursementStatus','reimbursedAmount','reimbursedDate','drawNo','sourceVendor','fees','docType','paymentConfirmed','lienWaiverReceived','refundAutoFilled'];
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
  assert.ok(body[3].includes('5-yr'));   // 5-yr (order 1) sorts before 27.5-yr (order 4); rows start after 2 preamble lines + header
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

console.log('Phase 1 — reimbursements / allowance pool (spec §1.3 fixtures A, B, C):');
{
  // Each line's "Total paid" is copied from spec §3.7.
  const mk = (o) => ({
    ...emptyPurchase(), ownerPurchased: true, ...o,
    allowanceCategory: defaultAllowanceFor(o.trade, o.purchasedBy) || NOT_IN_ALLOWANCE,
    ...reimbursementDefaultsFor(o.vendor, o.purchasedBy),
  });
  const A = [['Plumbing', 119.82], ['Electrical', 1512.23], ['Electrical', 3066.99], ['Electrical', 848.59],
    ['Electrical', 1023.45], ['Electrical', 525.72]]
    .map(([trade, totalPaid]) => mk({ vendor: 'Minoan', purchasedBy: 'Josh', trade, totalPaid }));
  const B = [216.46, 200.27, 171.94]
    .map(totalPaid => mk({ vendor: 'Minoan', purchasedBy: 'Josh', trade: 'Furniture / FF&E', totalPaid }));
  const all = [...A, ...B];
  const row = (pool, name) => pool.rows.find(r => r.name === name);

  assert.equal(reimbursementsDue(all).total, 7685.47);
  assert.equal(reimbursementsDue(all).purchases.length, 9);
  ok('both Minoan orders as paid by Josh → Due from Sparrow $7,685.47 (exact cents)');
  const pool = allowancePool(all);
  assert.equal(row(pool, 'Electrical Fixtures').reimbursedToOwner, 6976.98);
  assert.equal(row(pool, 'Electrical Fixtures').paidBySparrow, 0);
  assert.equal(row(pool, 'Electrical Fixtures').ownerDirect, 0);
  assert.equal(row(pool, 'Plumbing Fixtures').reimbursedToOwner, 119.82);
  assert.equal(pool.reimbursedNoCategory.total, 588.67);
  assert.equal(allowanceCredits(all).total, 0);
  assert.ok(all.every(p => fundingSource(p) === 'Contract (reimbursed by Sparrow)'));
  assert.equal(pool.poolTotal, 446000);
  assert.equal(pool.poolCharged, 7685.47);
  assert.equal(pool.poolRemaining, 438314.53);
  ok('lighting = Reimbursed to owner under Electrical Fixtures; beds = Reimbursed, no Exhibit B category; owner-paid credits stay $0; pool charged includes both');

  const aDone = A.map(p => ({ ...p, reimbursementStatus: 'reimbursed' }));
  assert.equal(reimbursementsDue([...aDone, ...B]).total, 588.67);
  ok('marking fixture A reimbursed drops Due from Sparrow to $588.67');

  const closets = [525, 3525, 1300, 1350, 465, 280, 280, 280, 250, 1000]
    .map(totalPaid => mk({ vendor: 'First Coast Closets & Window Fashions', purchasedBy: 'Sparrow (Contractor)', ownerPurchased: false, trade: 'Closets & Shelving', totalPaid }));
  const shades = [mk({ vendor: 'First Coast Closets & Window Fashions', purchasedBy: 'Sparrow (Contractor)', ownerPurchased: false, trade: 'Window Treatments', totalPaid: 9732 })];
  const C = [...closets, ...shades];
  const poolC = allowancePool(C);
  assert.equal(row(poolC, 'Shelving').paidBySparrow, 9255);
  assert.equal(row(poolC, 'Shelving').remaining, 1245);
  assert.equal(row(poolC, 'Shelving').pct, 88);
  assert.equal(poolC.contractorScope.total, 9732);
  assert.equal(poolC.contractorScope.purchases.length, 1);
  assert.equal(allowanceCredits(C).total, 0);
  assert.equal(reimbursementsDue(C).total, 0);
  assert.ok(C.every(p => fundingSource(p) === 'Contract (paid by Sparrow)'));
  assert.equal(poolC.poolCharged, 9255);
  ok('First Coast: closets Paid by Sparrow in Shelving ($1,245 left), shades in Contractor scope (not charged to the pool), no owner credit, nothing due');

  const direct = mk({ vendor: 'Ferguson', purchasedBy: 'Josh', trade: 'Plumbing', totalPaid: 100 });
  assert.equal(fundingSource(direct), 'Owner direct');
  assert.equal(allowanceCredits([direct]).total, 100);
  assert.equal(row(allowancePool([direct]), 'Plumbing Fixtures').ownerDirect, 100);
  const toaster = mk({ vendor: 'Amazon', purchasedBy: 'Kerry', trade: 'Small Appliances', totalPaid: 40 });
  const poolT = allowancePool([toaster]);
  assert.equal(row(poolT, 'Appliances').spent, 0);
  assert.equal(row(poolT, 'Appliances').remaining, 25000);
  ok('owner-direct purchase in an Exhibit B category is a credit to settle; a $40 Kerry toaster leaves Appliances at $25,000');

  const refunded = mk({ vendor: 'Minoan', purchasedBy: 'Josh', trade: 'Electrical', totalPaid: 120, refundAmount: 120 });
  assert.equal(reimbursementsDue([refunded]).total, 0);
  ok('a fully refunded reimbursable purchase contributes $0 to Due from Sparrow');

  for (const input of [[], [{}]]) {
    assert.doesNotThrow(() => { reimbursementsDue(input); allowanceCredits(input); allowancePool(input); input.forEach(fundingSource); });
  }
  assert.equal(allowancePool([]).poolCharged, 0);
  ok('every money-flow function tolerates [] and bare legacy records');
}

console.log('Phase 1 — returns closing / order grouping:');
{
  assert.equal(localISODate(new Date(2026, 10, 13)), '2026-11-13');
  assert.equal(daysBetween('2026-11-13', '2026-11-27'), 14);
  assert.equal(daysBetween('2026-11-13', 'nope'), null);
  assert.equal(daysBetween('', '2026-11-13'), null);
  ok('localISODate uses local date parts; daysBetween is whole days and null for invalid input');

  const today = '2026-11-13';
  const input = [
    { id: 'B', returnByDate: '2026-11-27', status: 'Ordered' },
    { id: 'late', returnByDate: '2026-11-28', status: 'Ordered' },
    { id: 'A', returnByDate: '2026-11-13', status: 'Received' },
    { id: 'past', returnByDate: '2026-11-12', status: 'Ordered' },
    { id: 'ret', returnByDate: '2026-11-15', status: 'Returned' },
    { id: 'kept', returnByDate: '2026-11-15', status: 'Installed', keepConfirmed: true },
    { id: 'blank', returnByDate: '', status: 'Ordered' },
    { id: 'junk', returnByDate: 'garbage', status: 'Ordered' },
    { id: 'I', returnByDate: '2026-11-20', status: 'Return started' },
    { id: 'old' },
  ];
  assert.deepEqual(returnsClosingSoon(input, today, 14).map(p => p.id), ['A', 'I', 'B']);
  ok('returns closing: today..today+14 inclusive, soonest first; excludes closed windows, Returned, kept, blank/garbage dates and bare legacy records');
  assert.deepEqual(returnsClosingSoon(input, today, 3).map(p => p.id), ['A']);
  ok('the day window is a parameter');

  assert.match(newOrderGroupId(), /^og-[a-z0-9]+-[a-z0-9]{6}$/);
  assert.notEqual(newOrderGroupId(), newOrderGroupId());
  ok('newOrderGroupId shape and uniqueness');

  const s1 = { id: 's1' }, s2 = { id: 's2' };
  const a1 = { id: 'a1', orderGroupId: 'og-1', lineNo: 2, totalPaid: 10 };
  const a0 = { id: 'a0', orderGroupId: 'og-1', lineNo: 1, totalPaid: 30, refundAmount: 5 };
  const lone = { id: 'lone', orderGroupId: 'og-2' };
  const g = groupByOrder([s1, a1, s2, a0, lone]);
  assert.equal(g.length, 4);
  assert.deepEqual([g[0].kind, g[0].purchase.id], ['single', 's1']);
  assert.equal(g[1].kind, 'order');
  assert.equal(g[1].orderGroupId, 'og-1');
  assert.deepEqual(g[1].purchases.map(p => p.id), ['a0', 'a1']);
  assert.equal(g[1].subtotal, 35);
  assert.deepEqual([g[2].kind, g[2].purchase.id], ['single', 's2']);
  assert.deepEqual([g[3].kind, g[3].purchase.id], ['single', 'lone']);
  ok('groupByOrder: group sits at first member, lines sort by lineNo, subtotal is net, one-member group renders as a single');
  const noLine = groupByOrder([{ id: 'm1', orderGroupId: 'og-3' }, { id: 'm2', orderGroupId: 'og-3', lineNo: 1 }, { id: 'm3', orderGroupId: 'og-3' }]);
  assert.deepEqual(noLine[0].purchases.map(p => p.id), ['m2', 'm1', 'm3']);
  assert.doesNotThrow(() => groupByOrder([{}, {}]));
  ok('lines without lineNo follow numbered ones in input order; bare records never throw');
}

console.log('Phase 1 — cost-seg CSV (net cost, returned block, funding source):');
{
  const base = { placedInServiceDate: '2026-01-01', ownerPurchased: true, vendor: 'V', invoiceNo: '', trade: '', room: '', section: '', purchasedBy: '' };
  const net = buildCostSegCsv([{ ...base, assetClass: '5-yr', totalPaid: 120, refundAmount: 100, description: 'Rug' }]);
  assert.match(net.csv, /"5-yr subtotal",,,,"20"/);
  assert.match(net.csv, /"GRAND TOTAL",,,,"20"/);
  ok('CSV uses net cost ($120 paid, $100 refunded → 20) in rows, subtotal and grand total');

  const withReturn = buildCostSegCsv([
    { ...base, assetClass: '5-yr', totalPaid: 100, description: 'Good lamp', status: 'Installed' },
    { ...base, assetClass: '5-yr', totalPaid: 80, refundAmount: 80, description: 'Bad lamp', status: 'Returned', invoiceNo: 'INV9' },
  ]);
  assert.equal(withReturn.count, 1);
  assert.match(withReturn.csv, /"GRAND TOTAL",,,,"100"/);
  const iBlock = withReturn.csv.indexOf('Returned (excluded)');
  assert.ok(iBlock > -1 && withReturn.csv.indexOf('Bad lamp') > iBlock);
  assert.ok(withReturn.csv.indexOf('GRAND TOTAL') < iBlock);
  assert.ok(withReturn.csv.includes('INV9'));
  ok('a Returned line leaves the groups, count and grand total and is listed after a "Returned (excluded)" block');
  assert.ok(!net.csv.includes('Returned (excluded)'));
  ok('no Returned purchases → no excluded block');

  const classes = buildCostSegCsv([
    { ...base, assetClass: 'supplies', totalPaid: 10, description: 'Paper towels' },
    { ...base, assetClass: '27.5-yr', totalPaid: 20, description: 'Closet' },
  ]).csv;
  assert.ok(classes.indexOf('"27.5-yr subtotal"') < classes.indexOf('"supplies subtotal"'));
  ok('supplies group sorts after 27.5-yr');
  const partial = buildCostSegCsv([{ ...base, assetClass: '5-yr', totalPaid: 200, refundAmount: 50, status: 'Return started', description: 'Chair' }]);
  assert.equal(partial.count, 1);
  assert.match(partial.csv, /"5-yr subtotal",,,,"150"/);
  ok('Return started with a partial refund stays in its group at net');

  const funded = buildCostSegCsv([{ ...base, assetClass: '5-yr', totalPaid: 300, reimbursable: true, description: 'Pendant' }]).csv;
  assert.ok(funded.includes('Contract-funded items are already inside the construction contract price; do not add them to basis a second time.'));
  assert.ok(funded.includes('"Funding Source"') && funded.includes('"Cost Basis (net of refunds)"'));
  assert.ok(funded.includes('Contract (reimbursed by Sparrow)'));
  ok('CSV carries the contract-funded note, a Funding Source column (reimbursed by Sparrow) and the net-of-refunds header');
}

console.log('Phase 1 — shared receipts (isReceiptReferenced / purchasesFromHash):');
{
  const path = 'receipts/pp/pur-a/r.pdf';
  const A = { id: 'pur-a', receipts: [{ pathname: path }] };
  const B = { id: 'pur-b', receipts: [{ pathname: path }, { pathname: 'receipts/pp/pur-b/own.jpg' }] };
  assert.equal(isReceiptReferenced([A, B], path, 'pur-a'), true);
  assert.equal(isReceiptReferenced([A, B], path, 'pur-b'), true);
  ok('a receipt shared by two purchases stays referenced when either one is excluded (deleting one keeps the blob)');
  assert.equal(isReceiptReferenced([A], path, 'pur-a'), false);
  ok('last reference gone → safe to delete (also the removal race: the record being edited still lists the path)');
  assert.equal(isReceiptReferenced([A, B], 'receipts/pp/pur-x/none.jpg', 'pur-a'), false);
  assert.equal(isReceiptReferenced([A, B], path), true);
  ok('unreferenced path → false; no exclusion → any reference counts');
  assert.doesNotThrow(() => isReceiptReferenced([{ id: 'x' }, { id: 'y', receipts: undefined }, { id: 'z', receipts: [null] }, null], path, 'q'));
  assert.equal(isReceiptReferenced([{ id: 'x' }, { id: 'z', receipts: [null] }], path), false);
  ok('records with missing/null receipts never throw');

  assert.deepEqual(purchasesFromHash(null), []);
  assert.deepEqual(purchasesFromHash({ a: JSON.stringify({ id: 'a' }), b: { id: 'b' } }).map(p => p.id).sort(), ['a', 'b']);
  ok('purchasesFromHash handles null and mixed JSON-string / object values');
}

console.log('statusChangePatch() — Returned refund prefill is persisted as a flag, so it undoes across sessions:');
{
  const toReturned = statusChangePatch({ status: 'Received', totalPaid: 1512.23, refundAmount: null }, 'Returned');
  assert.deepEqual(toReturned, { status: 'Returned', refundAmount: 1512.23, refundAutoFilled: true });
  ok('choosing Returned with no refund pre-fills the amount paid and flags it as automatic');

  const back = statusChangePatch({ status: 'Returned', totalPaid: 1512.23, refundAmount: 1512.23, refundAutoFilled: true }, 'Received');
  assert.deepEqual(back, { status: 'Received', refundAmount: null, refundAutoFilled: false });
  ok('mis-tap, even after a Save and reopen: switching away from Returned undoes the automatic refund (the flag is stored on the record)');

  assert.deepEqual(statusChangePatch({ status: 'Returned', totalPaid: 100, refundAmount: 100, refundAutoFilled: false }, 'Received'), { status: 'Received' });
  assert.deepEqual(statusChangePatch({ status: 'Returned', totalPaid: 100, refundAmount: 60 }, 'Received'), { status: 'Received' });
  ok('a refund the owner typed (flag false/absent) is never cleared, even when it equals the amount paid');

  assert.deepEqual(statusChangePatch({ status: 'Received', totalPaid: 100, refundAmount: 30 }, 'Returned'), { status: 'Returned' });
  assert.deepEqual(statusChangePatch({ status: 'Ordered', totalPaid: 10, refundAmount: null }, 'Installed'), { status: 'Installed' });
  assert.deepEqual(statusChangePatch({ status: 'Received', totalPaid: null, refundAmount: null }, 'Returned'), { status: 'Returned' });
  assert.equal(statusChangePatch({ status: 'Received', totalPaid: 1512.2299999999998, refundAmount: null }, 'Returned').refundAmount, 1512.23);
  assert.doesNotThrow(() => statusChangePatch({}, 'Returned'));
  ok('existing refunds are not overwritten; nothing to fill when no amount paid; money rounds to cents; bare records never throw');
}

console.log('PR-review fixes — money consistency, form defaults, CSV, tolerant parsing:');
{
  // 1. "Due from Sparrow" is only owed on purchases the OWNER paid.
  const sparrowPaidFlagged = { ownerPurchased: false, reimbursable: true, reimbursementStatus: 'pending', totalPaid: 100, allowanceCategory: NOT_IN_ALLOWANCE };
  assert.equal(reimbursementsDue([sparrowPaidFlagged]).total, 0);
  assert.equal(reimbursementsDue([{ ...sparrowPaidFlagged, ownerPurchased: true }]).total, 100);
  assert.equal(allowancePool([sparrowPaidFlagged]).reimbursedNoCategory.total, 0);
  assert.equal(allowancePool([sparrowPaidFlagged]).poolCharged, 0);
  ok('a Sparrow-paid purchase flagged reimbursable is never "Due from Sparrow" and never charged to the pool as reimbursed');

  // 2. Contractor-scope items are listed separately and NOT also charged to the pool.
  const scopeFlagged = { ownerPurchased: true, reimbursable: true, reimbursementStatus: 'pending', totalPaid: 100, allowanceCategory: CONTRACTOR_SCOPE };
  const poolS = allowancePool([scopeFlagged]);
  assert.equal(poolS.contractorScope.total, 100);
  assert.equal(poolS.reimbursedNoCategory.total, 0);
  assert.equal(poolS.poolCharged, 0);
  ok('a reimbursable purchase tagged Contractor scope is counted once (contractor-scope line), not also against the pool');

  // 3. Defaults only follow edits on records that have not been through an owner Save.
  assert.deepEqual(formDefaultsTouched({ allowanceCategory: NOT_IN_ALLOWANCE, reimbursable: false, reimbursementStatus: 'none', drawNo: '' }, false), { allowance: true, reimb: true });
  assert.deepEqual(formDefaultsTouched({ allowanceCategory: NOT_IN_ALLOWANCE, reimbursable: false, reimbursementStatus: 'none', drawNo: '' }, true), { allowance: false, reimb: false });
  assert.deepEqual(formDefaultsTouched({ allowanceCategory: 'Electrical Fixtures', reimbursable: false, reimbursementStatus: 'none' }, true), { allowance: true, reimb: false });
  assert.deepEqual(formDefaultsTouched({ allowanceCategory: NOT_IN_ALLOWANCE, reimbursable: true, reimbursementStatus: 'pending' }, true), { allowance: false, reimb: true });
  assert.deepEqual(formDefaultsTouched({}, true), { allowance: false, reimb: false });   // no explicit choice on a bare record = untouched; never throws
  ok('a saved record starts "touched" so editing it never re-applies defaults over the owner\'s explicit choice; fresh records follow defaults until set');

  // 4. CSV Returned block shows what was NOT refunded, rounded to cents.
  const rb = buildCostSegCsv([
    { placedInServiceDate: '2026-01-01', ownerPurchased: true, assetClass: '5-yr', totalPaid: 10, description: 'Keeper', status: 'Installed' },
    { ownerPurchased: true, totalPaid: 80, refundAmount: 70, description: 'Restocked lamp', vendor: 'V', invoiceNo: 'I1', status: 'Returned' },
    { ownerPurchased: true, totalPaid: 1512.2299999999998, description: 'Float item', status: 'Returned' },
  ]).csv;
  assert.ok(rb.includes('"Net not refunded"'));
  assert.match(rb, /"Restocked lamp","V","I1","80","70","10"/);
  assert.ok(rb.includes('"1512.23"') && !rb.includes('1512.2299'));
  ok('Returned (excluded) block adds a "Net not refunded" column and rounds money to cents');

  // 5. One corrupt record must not break receipt views / purchase deletes for the whole property.
  assert.deepEqual(purchasesFromHash({ bad: '{not json', good: JSON.stringify({ id: 'good' }) }).map(p => p.id), ['good']);
  ok('purchasesFromHash skips an unparseable record instead of throwing');
}

console.log('Repairs — Sparrow-paid scope defaults, legacy Minoan, fixture coverage:');
{
  for (const t of ['Paint', 'Decking', 'Doors', 'Drywall', 'Other']) {
    assert.equal(defaultAllowanceFor(t, 'Sparrow (Contractor)'), CONTRACTOR_SCOPE, t);
    assert.equal(defaultAllowanceFor(t, 'Josh'), null, t + '/Josh');
  }
  assert.equal(defaultAllowanceFor('Flooring', 'Sparrow (Contractor)'), null);
  ok('Sparrow-paid trades with no Exhibit B equivalent (Paint, Decking, Doors, Drywall, Other) default to Contractor scope; trades that do have one are left for the owner to pick');

  const loose = { ownerPurchased: false, totalPaid: 100, allowanceCategory: NOT_IN_ALLOWANCE, trade: 'Flooring' };
  const poolL = allowancePool([loose]);
  assert.equal(poolL.contractorScope.total, 100);
  assert.equal(poolL.poolCharged, 0);
  ok('a Sparrow-paid purchase outside every Exhibit B category is listed on the contractor-scope line (not invisible), and not charged to the pool');

  const legacy = normalizePurchase({ id: 'old-minoan', vendor: 'Minoan', purchasedBy: 'Josh', ownerPurchased: true, totalPaid: 100 });
  assert.equal(legacy.reimbursable, true); assert.equal(legacy.reimbursementStatus, 'pending'); assert.equal(legacy.reimbursedBy, 'Sparrow (Contractor)');
  assert.equal(normalizePurchase({ id: 'x', vendor: 'Minoan', ownerPurchased: true, reimbursable: false, reimbursementStatus: 'none' }).reimbursable, false);
  assert.equal(normalizePurchase({ id: 'x', vendor: 'Minoan', purchasedBy: 'Sparrow (Contractor)', ownerPurchased: false }).reimbursable, false);
  assert.equal(normalizePurchase({ id: 'x', vendor: 'Amazon', purchasedBy: 'Kerry', ownerPurchased: true }).reimbursable, false);
  assert.equal(reimbursementsDue([legacy]).total, 100);
  ok('a pre-Phase-1 owner-paid Minoan purchase loads as reimbursable/pending (counts as Due from Sparrow); explicit saved values and other vendors/payers are untouched');

  const mkF = (o) => ({ ...emptyPurchase(), ownerPurchased: true, ...o, allowanceCategory: defaultAllowanceFor(o.trade, o.purchasedBy) || NOT_IN_ALLOWANCE, ...reimbursementDefaultsFor(o.vendor, o.purchasedBy) });
  const fixA = [['Plumbing', 119.82], ['Electrical', 1512.23], ['Electrical', 3066.99], ['Electrical', 848.59], ['Electrical', 1023.45], ['Electrical', 525.72]]
    .map(([trade, totalPaid]) => ({ ...mkF({ vendor: 'Minoan', purchasedBy: 'Josh', trade, totalPaid }), assetClass: '27.5-yr', placedInServiceDate: '2026-11-01' }));
  const { csv: csvA, count: countA } = buildCostSegCsv(fixA);
  assert.equal(countA, 6);
  assert.equal(csvA.split('Contract (reimbursed by Sparrow)').length - 1, 6);
  assert.match(csvA, /"GRAND TOTAL",,,,"7096.8"/);
  ok('cost-seg CSV on fixture A: every one of the 6 Minoan lines carries Funding Source "Contract (reimbursed by Sparrow)" and the total is $7,096.80');

  const fixC = [525, 3525, 1300, 1350, 465, 280, 280, 280, 250, 1000]
    .map(totalPaid => ({ ...mkF({ vendor: 'First Coast', purchasedBy: 'Sparrow (Contractor)', ownerPurchased: false, trade: 'Closets & Shelving', totalPaid }), docType: 'statement' }))
    .concat([{ ...mkF({ vendor: 'First Coast', purchasedBy: 'Sparrow (Contractor)', ownerPurchased: false, trade: 'Window Treatments', totalPaid: 9732 }), docType: 'statement' }]);
  assert.ok(fixC.every(p => paymentBadge(p) === 'Contractor-paid: confirm in draw'));
  assert.ok(fixC.every(p => paymentBadge({ ...p, lienWaiverReceived: true }) === null));
  ok('fixture C: every First Coast statement line shows "Contractor-paid: confirm in draw" until the lien waiver is received');
}

console.log('Phase 2 — shopping model, quantity rules, sanitizers, seed merge:');
{
  const D = SH.DEFAULT_SHOPPING_SETTINGS;
  assert.equal(D.guestCount, 24); assert.equal(D.bedrooms, 5); assert.equal(D.bathrooms, 5);
  assert.equal(D.mealsPerDay, 3); assert.equal(D.washesPerDay, 1); assert.equal(D.dishwashers, 1);
  assert.equal(D.budgetTarget, null); assert.equal(D.readyDate, null); assert.equal(D.defaultTaxRate, 0.065);
  assert.equal(D.vendorDefaults.amazon.holidayReturnBy, '2027-01-31');
  assert.equal(D.vendorDefaults.minoan.transactionFeePct, 0.032);
  assert.equal(D.vendorDefaults.minoan.taxIncludesFees, true);
  assert.deepEqual(D.reimbursableVendors, ['Minoan']);
  ok('default settings match spec §2.2 (24 guests, 6.5% tax, Minoan 3.2% fee, reimbursable Minoan)');

  assert.equal(SH.SHOPPING_CATEGORIES.length, 19);
  assert.equal(SH.CATEGORY_TO_TRADE['Dinnerware'], 'Kitchen & Dining');
  assert.equal(SH.CATEGORY_TO_TRADE['Bath'], 'Linens & Soft Goods');
  assert.equal(SH.CATEGORY_TO_TRADE['Furniture'], 'Furniture / FF&E');
  assert.equal(SH.CATEGORY_TO_TRADE['Cleaning & Laundry'], 'Supplies & Consumables');
  assert.equal(SH.CATEGORY_TO_TRADE['Electronics & Tech'], 'Electronics / AV');
  assert.equal(SH.CATEGORY_TO_TRADE['Safety & First Aid'], 'Other');
  for (const c of SH.SHOPPING_CATEGORIES) assert.ok(PURCHASE_TRADES.includes(SH.CATEGORY_TO_TRADE[c]), `no valid trade for ${c}`);
  ok('every shopping category maps to a real Purchase trade (§2.5)');

  const I = (o) => ({ ...SH.emptyShoppingItem(), id: 'sh-test-1', name: 'x', ...o });
  const q = (o, g = 24) => SH.computeQty(I(o), { ...D, guestCount: g });
  assert.equal(q({ qtyRule: { basis: 'guests', multiplier: 1.5 } }), 36);
  assert.equal(q({ qtyRule: { basis: 'guests', multiplier: 1.5 } }, 20), 30);
  assert.equal(q({ qtyRule: { basis: 'guests', multiplier: 1.5 }, qtyOverride: 40 }), 40);
  assert.equal(q({ qtyRule: { basis: 'guests', multiplier: 1.5 }, qtyOverride: 40 }, 20), 40);
  assert.equal(q({ qtyRule: { basis: 'fixed', fixedQty: 10 } }), 10);
  assert.equal(q({ qtyRule: { basis: 'bathrooms', multiplier: 3 } }), 15);
  assert.equal(q({ qtyRule: { basis: 'bedrooms', multiplier: 2 } }), 10);
  assert.equal(q({ qtyRule: { basis: 'guests', multiplier: 1.25 } }), 30);
  assert.equal(q({ qtyRule: { basis: 'guests', multiplier: '1.5' } }), 36);
  assert.equal(SH.computeQty({}, D), 0);
  assert.doesNotThrow(() => SH.computeQty(null, D));
  ok('computeQty: rules scale with guests/bedrooms/bathrooms, overrides win, no float drift, blank items → 0 and never throw');

  const plates = (zone, mult, extra = {}) => I({ id: `sh-plates-${zone}`, dishType: 'Dinner plates', zone, usesPerGuestPerDay: 2, qtyRule: { basis: 'guests', multiplier: mult }, ...extra });
  const mc = (items, g = 24, purchases) => SH.mealsCovered(items, { ...D, guestCount: g }, purchases).find(r => r.dishType === 'Dinner plates');
  assert.equal(mc([plates('indoor', 1.5), plates('outdoor', 1.25)]).total, 66);
  assert.equal(mc([plates('indoor', 1.5), plates('outdoor', 1.25)]).level, 'full-day');
  assert.equal(mc([plates('indoor', 1.5)]).level, 'one-meal');
  assert.equal(mc([plates('indoor', 0.5)]).level, 'short');
  assert.equal(mc([plates('indoor', 1.5), plates('outdoor', 1.25)], 20).total, 55);
  assert.equal(SH.mealsCovered([I({ dishType: 'Kids cups', usesPerGuestPerDay: null })], D).length, 0);
  const owned = plates('outdoor', 1.25, { status: 'ordered', purchaseIds: ['p1'] });
  assert.equal(mc([plates('indoor', 1.5), owned], 24, [{ id: 'p1', qty: 70, status: 'Ordered' }]).total, 106);
  assert.equal(mc([plates('indoor', 1.5), owned], 24, [{ id: 'p1', qty: 70, status: 'Returned' }]).total, 66);
  ok('mealsCovered: 66 plates at 24 guests and 2 uses/day → green; indoor alone amber; tiny set red; follows guest count; owned quantity replaces the plan; Returned purchases do not count');

  // sanitizers
  const stamp = { updatedAt: '2026-11-07T00:00:00.000Z', updatedBy: 'JM' };
  const raw = { ...SH.emptyShoppingItem(), id: 'sh-abc-123', name: 'Plates', category: 'Dinnerware', updatedBy: 'HACK', updatedAt: 'x' };
  const good = SH.sanitizeShoppingItem(raw, stamp);
  assert.equal(good.ok, true); assert.equal(good.item.updatedBy, 'JM'); assert.equal(good.item.updatedAt, stamp.updatedAt);
  for (const bad of [{ id: 'SH-1' }, { id: 'abc' }, { name: '   ' }, { category: 'Nope' }, { status: 'bogus' }, { priority: 'bogus' }, { zone: 'sideways' }, { candidates: 'nope' }, { candidates: [1] }]) {
    assert.equal(SH.sanitizeShoppingItem({ ...raw, ...bad }, stamp).ok, false, JSON.stringify(bad));
  }
  const withExtra = SH.sanitizeShoppingItem({ ...raw, agentExtra: { a: 1 }, candidates: [{ id: 'c-1', vendor: 'Amazon', futureField: 'x' }] }, stamp);
  assert.deepEqual(withExtra.item.agentExtra, { a: 1 });
  assert.equal(withExtra.item.candidates[0].futureField, 'x');
  assert.equal(withExtra.item.candidates[0].vendor, 'Amazon');
  const hostile = SH.sanitizeShoppingItem(JSON.parse('{"id":"sh-a","name":"n","category":"Other","__proto__":{"polluted":true},"constructor":{"x":1}}'), stamp);
  assert.equal(hostile.ok, true);
  assert.equal(Object.keys(hostile.item).includes('__proto__'), false);
  assert.equal(hostile.item.polluted, undefined); assert.equal(({}).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(hostile.item, 'constructor'), false);
  assert.equal(SH.sanitizeShoppingItem({ ...raw, notes: 'a'.repeat(100001) }, stamp).ok, false);
  ok('sanitizeShoppingItem validates known fields, stamps updatedAt/By server-side, preserves unknown fields, drops __proto__/constructor, caps size');

  assert.equal(SH.sanitizeShoppingSettings({ guestCount: 0 }).ok, false);
  assert.equal(SH.sanitizeShoppingSettings({ guestCount: 201 }).ok, false);
  assert.equal(SH.sanitizeShoppingSettings({ defaultTaxRate: 0.3 }).ok, false);
  assert.equal(SH.sanitizeShoppingSettings({ reimbursableVendors: 'Minoan' }).ok, false);
  assert.equal(SH.sanitizeShoppingSettings({ readyDate: 'soon' }).ok, false);
  const st = SH.sanitizeShoppingSettings({ guestCount: 20, futureSetting: { z: 1 } });
  assert.equal(st.ok, true); assert.equal(st.settings.guestCount, 20); assert.equal(st.settings.bedrooms, 5);
  assert.deepEqual(st.settings.futureSetting, { z: 1 });
  ok('sanitizeShoppingSettings rejects out-of-range/mistyped values, fills defaults, preserves unknown settings');

  assert.equal(SH.isShoppingField('item:sh-abc-123'), true);
  assert.equal(SH.isShoppingField('settings'), true);
  for (const f of ['item:../x', 'foo', 'item:SH-1', 'item:sh-a:b', 'item:' + 'a'.repeat(1000), '__proto__']) assert.equal(SH.isShoppingField(f), false, f);
  assert.equal(SH.sanitizeShoppingField('item:sh-abc-123', raw, stamp).ok, true);
  assert.equal(SH.sanitizeShoppingField('item:sh-other-9', raw, stamp).ok, false);
  assert.equal(SH.sanitizeShoppingField('item:sh-abc-123', null, stamp).ok, false);
  assert.equal(SH.sanitizeShoppingField('item:sh-abc-123', [raw], stamp).ok, false);
  assert.deepEqual(SH.sanitizeShoppingField('item:sh-seed-x', { id: 'sh-seed-x', __deleted: true, extra: 1 }, stamp), { ok: true, value: { id: 'sh-seed-x', __deleted: true } });
  assert.equal(SH.sanitizeShoppingField('item:sh-seed-x', { id: 'sh-other', __deleted: true }, stamp).ok, false);
  assert.equal(SH.sanitizeShoppingField('settings', { guestCount: 22 }, stamp).ok, true);
  assert.equal(SH.sanitizeShoppingField('settings', { guestCount: -1 }, stamp).ok, false);
  ok('field names are strictly validated; item fields must match their id; tombstones are exactly {id,__deleted:true}; settings go through their sanitizer');

  // seed merge
  const seedItem = (id, o = {}) => ({ ...SH.emptyShoppingItem(), id, name: id, userCreated: false, ...o });
  const seed = [seedItem('sh-seed-a'), seedItem('sh-seed-b'), seedItem('sh-seed-c')];
  const none = SH.mergeShopping(SH.partitionShoppingFields({}), seed);
  assert.deepEqual(none.items.map(i => i.id), ['sh-seed-a', 'sh-seed-b', 'sh-seed-c']);
  assert.deepEqual(none.settings, { ...D });
  const map = {
    'item:sh-seed-a': JSON.stringify({ ...seed[0], status: 'approved' }),
    'item:sh-seed-b': { id: 'sh-seed-b', __deleted: true },
    'item:sh-user-1': JSON.stringify(seedItem('sh-user-1', { userCreated: true, name: 'Mine' })),
    settings: { vendorDefaults: { minoan: { note: 'custom note' } } },
    'bogus-field': '{"x":1}',
  };
  const part = SH.partitionShoppingFields(map);
  assert.deepEqual(part.deletedIds, ['sh-seed-b']);
  assert.equal(part.itemsById['sh-seed-a'].status, 'approved');
  const merged = SH.mergeShopping(part, seed);
  assert.deepEqual(merged.items.map(i => i.id), ['sh-seed-a', 'sh-seed-c', 'sh-user-1']);
  assert.equal(merged.items[0].status, 'approved');
  assert.equal(merged.items[1].status, 'researching');
  assert.equal(merged.settings.vendorDefaults.amazon.holidayReturnBy, '2027-01-31');
  assert.equal(merged.settings.vendorDefaults.minoan.note, 'custom note');
  assert.equal(merged.settings.vendorDefaults.minoan.transactionFeePct, 0.032);
  const resurrect = SH.mergeShopping({ itemsById: { 'sh-seed-b': seedItem('sh-seed-b') }, deletedIds: ['sh-seed-b'], settings: null }, seed);
  assert.equal(resurrect.items.some(i => i.id === 'sh-seed-b'), false);
  const twice = SH.mergeShopping(part, seed);
  assert.equal(twice.items.filter(i => i.id === 'sh-user-1').length, 1);
  assert.ok(merged.items.every(i => Array.isArray(i.candidates) && i.agentFlag && i.qtyRule));
  ok('seed merge: saved edits win, untouched seed fills in, tombstones hide (never resurrect), user-created items kept once, settings overlay defaults per vendor');
}

console.log(`\nAll ${passed} checks passed.`);
