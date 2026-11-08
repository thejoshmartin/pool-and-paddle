/**
 * Pure-logic checks for the purchases / cost-seg / scoping code — no DB, no browser.
 * Run: node scripts/verify-logic.mjs   (or `npm test`, which runs this + the phase-1 checks)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildCostSegCsv, suggestAssetClass, emptyPurchase, NOT_IN_ALLOWANCE,
  PURCHASE_TRADES, PURCHASE_STATUSES, ASSET_CLASSES, CONTRACTOR_SCOPE, CONTRACTOR_PURCHASER,
  assetClassLabel, defaultAllowanceFor, reimbursementDefaultsFor, purchaseDefaults,
  normalizePurchase, netCost, paymentBadge, summarizePurchases,
  fundingSource, reimbursementsDue, allowanceCredits, allowancePool,
  localISODate, daysBetween, returnsClosingSoon, newOrderGroupId, groupByOrder, statusChangePatch, formDefaultsTouched,
} from '../src/lib/purchases-logic.js';
import * as SH from '../src/lib/shopping-logic.js';
import * as RL from '../src/lib/receipt-logic.js';
import { extractReceipt, buildExtractionPrompt } from '../api/_extract.js';
import { processInboxRecord } from '../api/_extract-record.js';
import { scopedKey, parseReceiptPathname, migrateFinishesToHash, purchasesFromHash, isReceiptReferenced, isInboxReceiptReferenced, blobIsReferenced } from '../api/_scope.js';
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
  const expected = ['id','finishItemId','furnitureId','description','trade','room','vendor','invoiceNo','purchasedBy','ownerPurchased','paymentMethod','qty','unitPrice','tax','shipping','totalPaid','allowanceCategory','status','purchaseDate','receivedDate','placedInServiceDate','assetClass','section','warranty','warrantyTerm','registered','binderPocket','receipts','notes','userCreated','returnByDate','returnPolicyNote','refundAmount','refundDate','restockingFee','returnShippingCost','keepConfirmed','inspected','inspectedDate','deliveredTo','orderGroupId','lineNo','reimbursable','reimbursedBy','reimbursementStatus','reimbursedAmount','reimbursedDate','drawNo','sourceVendor','fees','docType','paymentConfirmed','lienWaiverReceived','refundAutoFilled','shoppingItemId'];
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

console.log('Phase 2 — landed cost, best value, warnings, spend forecast:');
{
  const D = SH.DEFAULT_SHOPPING_SETTINGS;
  const within = (a, b, cents = 1) => Math.round(Math.abs(a - b) * 100) <= cents;
  const cand = (o) => ({ ...SH.emptyCandidate(), ...o });

  // Fixture B: three beds, merchandise $535.41, fee 3.2386%, tax 6.5% on goods + fee.
  const fixB = cand({ vendorType: 'minoan', unitPrice: 535.41, qtyToBuy: 1, shipping: 0, transactionFeePct: 0.032386 });
  assert.equal(SH.merchandise(fixB), 535.41);
  assert.equal(SH.feesFor(fixB, D), 17.34);
  assert.equal(SH.taxFor(fixB, D), 35.93);
  assert.ok(within(SH.landedTotal(fixB, D), 588.67), `landed ${SH.landedTotal(fixB, D)}`);
  const minoanDefault = cand({ vendorType: 'minoan', unitPrice: 535.41, qtyToBuy: 1 });
  assert.equal(SH.feesFor(minoanDefault, D), 17.13);
  assert.equal(SH.taxFor(minoanDefault, D), 35.92);
  ok('fixture B (three beds, Minoan): $535.41 + 3.2386% fee + 6.5% tax on goods+fee lands within a cent of $588.67; vendor default fee applies when the candidate has none');

  const amazon = cand({ vendorType: 'amazon', unitPrice: 100, qtyToBuy: 2, shipping: 5, discount: 10 });
  assert.equal(SH.merchandise(amazon), 190);
  assert.equal(SH.feesFor(amazon, D), 0);
  assert.equal(SH.taxFor(amazon, D), 12.35);
  assert.equal(SH.landedTotal(amazon, D), 207.35);
  assert.equal(SH.landedTotal({ ...amazon, estTax: 0 }, D), 195);
  assert.equal(SH.landedTotal({ ...amazon, estTax: '' }, D), 207.35);
  assert.equal(SH.landedTotal({ ...amazon, estTax: null }, D), 207.35);
  assert.equal(SH.landedTotal(amazon, { ...D, defaultTaxRate: 0.07 }), 208.3);
  ok('landed total = merchandise + shipping + fees + tax; an explicit $0 tax is honored while blank tax uses the default rate');

  const byName = cand({ vendor: ' MINOAN ', vendorType: 'other', unitPrice: 100, qtyToBuy: 1 });
  assert.equal(SH.feesFor(byName, D), 3.2);
  assert.equal(SH.perUnit({ ...amazon, packSize: 3 }, D), 34.56);
  ok('vendor defaults are found by vendorType or by a case-insensitive vendor name; per-unit price divides by packs × pack size');

  assert.equal(SH.returnExposure(cand({ freeReturns: true, returnShippingCost: 50, restockingPct: 0.5, unitPrice: 100 })), 0);
  assert.equal(SH.returnExposure(cand({ returnShippingCost: 12, restockingPct: 0.15, unitPrice: 100, qtyToBuy: 1 })), 27);
  assert.equal(SH.returnExposure(cand({ returnShippingCost: 12, restockingPct: 15, unitPrice: 100, qtyToBuy: 1 })), 27);
  assert.equal(SH.returnExposure(cand({ unitPrice: 100 })), 0);
  ok('return exposure = return shipping + restocking % of merchandise (fraction or percent), zero for free returns');

  // bestValue
  const mk = (cs, o = {}) => ({ ...SH.emptyShoppingItem(), id: 'sh-bv', name: 'Toaster', candidates: cs, ...o });
  const A = cand({ id: 'A', vendor: 'Amazon', vendorType: 'amazon', unitPrice: 100, qtyToBuy: 1, shipping: 0, inStock: true, freeReturns: true });
  const Mdear = cand({ id: 'M', vendor: 'Minoan', vendorType: 'minoan', unitPrice: 90, qtyToBuy: 1, shipping: 15, inStock: true });
  assert.equal(SH.bestValue(mk([Mdear, A]), D).id, 'A');
  const Mcheap = { ...Mdear, unitPrice: 80, shipping: 0 };
  assert.equal(SH.bestValue(mk([A, Mcheap]), D).id, 'M');
  ok('Best Value ranks on total landed cost (a lower sticker price with shipping + fee can lose to a dearer free-shipping offer)');
  assert.equal(SH.bestValue(mk([A, { ...Mcheap, inStock: false }]), D).id, 'A');
  assert.equal(SH.bestValue(mk([A, { ...Mcheap, inStock: null }]), D).id, 'M');
  assert.equal(SH.bestValue(mk([A, { ...Mcheap, deliveryEta: '2026-12-20' }], { needBy: '2026-12-01' }), D).id, 'A');
  assert.equal(SH.bestValue(mk([A, { ...Mcheap, deliveryEta: '' }], { needBy: '2026-12-01' }), D).id, 'M');
  ok('out-of-stock and too-late candidates are skipped; unknown stock or a missing ETA does not disqualify');
  const T1 = cand({ id: 'T1', vendorType: 'other', unitPrice: 100, estTax: 0, shipping: 0, returnShippingCost: 10, inStock: true });
  const T2 = cand({ id: 'T2', vendorType: 'other', unitPrice: 100, estTax: 0, shipping: 0, freeReturns: true, inStock: true, deliveryEta: '2026-12-05' });
  const T3 = cand({ id: 'T3', vendorType: 'other', unitPrice: 100, estTax: 0, shipping: 0, freeReturns: true, inStock: true, deliveryEta: '2026-12-01' });
  assert.equal(SH.bestValue(mk([T1, T2]), D).id, 'T2');
  assert.equal(SH.bestValue(mk([T1, T2, T3]), D).id, 'T3');
  assert.equal(SH.bestValue(mk([]), D), null);
  const noisy = { ...A, retailUnitPrice: 9999 };
  assert.equal(SH.bestValue(mk([noisy, Mcheap]), D).id, 'M');
  const before = JSON.stringify(mk([A, Mcheap]));
  SH.bestValue(JSON.parse(before), D);
  assert.equal(JSON.stringify(JSON.parse(before)), before);
  assert.equal(SH.bestValue({}, D), null);
  ok('ties break on lower return exposure then earlier delivery; retail "list price" is ignored; empty/bare items → null');

  // warnings
  const wn = (c, item, now = '2026-11-25T12:00:00Z', settings = D) => SH.candidateWarnings(c, item, settings, now).map(w => w.code);
  const dn = { category: 'Dinnerware', targetPrice: 20 };
  assert.deepEqual(wn(cand({ returnByDate: '2026-12-01' }), { category: 'Small Appliances' }, undefined, { ...D, readyDate: '2026-12-15' }), ['return-before-ready']);
  assert.deepEqual(wn(cand({ returnByDate: '2026-12-01' }), { category: 'Small Appliances' }), []);
  assert.ok(wn(cand({ unitPrice: 50, packSize: 2, openStock: true }), dn).includes('over-target'));
  assert.ok(!wn(cand({ unitPrice: 50, packSize: 2, openStock: true }), { ...dn, targetPrice: 25 }).includes('over-target'));
  assert.ok(wn(cand({ openStock: false }), dn).includes('not-open-stock'));
  assert.ok(wn(cand({ openStock: null }), dn).includes('not-open-stock'));
  assert.ok(!wn(cand({ openStock: true }), dn).includes('not-open-stock'));
  assert.ok(!wn(cand({ openStock: false }), { category: 'Small Appliances' }).includes('not-open-stock'));
  assert.ok(wn(cand({ checkedAt: '2026-11-21T08:00:00Z' }), { category: 'Other' }).includes('stale-price'));
  assert.ok(!wn(cand({ checkedAt: '2026-11-25T02:00:00Z' }), { category: 'Other' }).includes('stale-price'));
  assert.ok(!wn(cand({ checkedAt: '2026-10-06T08:00:00Z' }), { category: 'Other' }, '2026-10-10T12:00:00Z').includes('stale-price'));
  assert.ok(!wn(cand({ checkedAt: '' }), { category: 'Other' }).includes('stale-price'));
  assert.doesNotThrow(() => SH.candidateWarnings({}, {}, D, 'not-a-date'));
  assert.ok(SH.candidateWarnings(cand({ returnByDate: '2026-12-01' }), { category: 'Other' }, { ...D, readyDate: '2026-12-15' }, '2026-11-25T12:00:00Z')[0].text.includes("can't test in the house"));
  ok('warnings: return closes before the house is ready, over per-unit target, not open stock (dinnerware/flatware/glassware), stale price only Nov 20–Dec 2');

  // forecast
  const lc = (id, price) => cand({ id, vendorType: 'other', unitPrice: price, qtyToBuy: 1, estTax: 0, shipping: 0 });
  const items = [
    mk([lc('c1', 100)], { id: 'sh-a', selectedCandidateId: 'c1' }),
    mk([lc('c2', 500)], { id: 'sh-b', selectedCandidateId: 'c2', purchaseIds: ['p1'] }),
    mk([lc('c3', 70)], { id: 'sh-c' }),
    mk([lc('c4', 300)], { id: 'sh-d', selectedCandidateId: 'c4', status: 'returned' }),
    mk([lc('c5', 50)], { id: 'sh-e', selectedCandidateId: 'c5', purchaseIds: ['gone'] }),
  ];
  const f = SH.forecastSpend(items, [{ id: 'p1', totalPaid: 25, refundAmount: 5, status: 'Received' }], D);
  assert.deepEqual(f, { planned: 150, committed: 20, forecast: 170 });
  assert.deepEqual(SH.forecastSpend([], [], D), { planned: 0, committed: 0, forecast: 0 });
  assert.doesNotThrow(() => SH.forecastSpend([{}, null], [null], D));
  ok('forecast = selected-candidate landed totals for unpurchased items + net cost of linked purchases (returned items and dangling links handled)');
}

console.log('Phase 2 — shopping API write rules (regression pins for api/shopping.js):');
{
  const stamp = { updatedAt: '2026-11-07T00:00:00.000Z', updatedBy: 'KM' };
  const item = { ...SH.emptyShoppingItem(), id: 'sh-api-1', name: 'Kettle', category: 'Small Appliances' };
  const withCand = SH.sanitizeShoppingField('item:sh-api-1', { ...item, candidates: [{ vendor: 'Amazon', unitPrice: '24.99', futureField: [1, 2] }] }, stamp);
  assert.equal(withCand.ok, true);
  assert.equal(withCand.value.candidates[0].unitPrice, 24.99);
  assert.deepEqual(withCand.value.candidates[0].futureField, [1, 2]);
  assert.match(withCand.value.candidates[0].id, /^c-/);
  assert.equal(withCand.value.updatedBy, 'KM');
  for (const bad of [null, 'str', 5, [item]]) assert.equal(SH.sanitizeShoppingField('item:sh-api-1', bad, stamp).ok, false);
  assert.equal(SH.sanitizeShoppingField('item:sh-api-1', { ...item, candidates: [null] }, stamp).ok, false);
  for (const f of ['item:sh-a:b', 'item:' + 'x'.repeat(1000), '__proto__', 'constructor', 'item:', 'ITEM:sh-a', '']) {
    assert.equal(SH.sanitizeShoppingField(f, item, stamp).ok, false, f);
  }
  ok('a PUT body is typed per field, keeps unknown candidate fields, stamps the server user, and every malformed field name or value shape is rejected');
}

console.log('Phase 2 — seed list (§2.6 tables) and master-list parser:');
{
  const D = SH.DEFAULT_SHOPPING_SETTINGS;
  const seed = JSON.parse(fs.readFileSync(new URL('../src/shopping-seed.json', import.meta.url), 'utf8'));
  const items = seed.items;
  const stamp = { updatedAt: null, updatedBy: null };
  assert.ok(Array.isArray(items) && items.length >= 40);
  assert.equal(new Set(items.map(i => i.id)).size, items.length);
  for (const i of items) {
    assert.match(i.id, /^sh-seed-[a-z0-9-]+$/);
    assert.equal(SH.sanitizeShoppingItem(i, stamp).ok, true, `seed item invalid: ${i.id}`);
    assert.equal(i.proposed, false); assert.equal(i.status, 'researching'); assert.equal(i.approvedBy, null); assert.equal(i.userCreated, false);
  }
  ok('seed items are unique, valid, un-approved, not proposed and marked as seed (not user-created)');

  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const qty = (id, g = 24) => SH.computeQty(byId[id], { ...D, guestCount: g });
  const expect24 = { 'sh-seed-dinner-plates-indoor': 36, 'sh-seed-dinner-plates-outdoor': 30, 'sh-seed-everyday-tumblers-indoor': 36, 'sh-seed-everyday-tumblers-outdoor': 48,
    'sh-seed-coffee-mugs-indoor': 36, 'sh-seed-wine-glasses-indoor': 30, 'sh-seed-juice-small-glasses-indoor': 24, 'sh-seed-kids-cups-with-lids-outdoor': 12,
    'sh-seed-serving-platters-indoor': 6, 'sh-seed-serving-platters-outdoor': 4, 'sh-seed-serving-bowls-indoor': 8, 'sh-seed-serving-utensils-indoor': 16, 'sh-seed-serving-utensils-outdoor': 8,
    'sh-seed-dinner-forks': 72, 'sh-seed-salad-dessert-forks': 48, 'sh-seed-dinner-knives': 48, 'sh-seed-steak-knives': 24, 'sh-seed-teaspoons': 72, 'sh-seed-soup-dessert-spoons': 36,
    'sh-seed-drip-coffee-maker': 2, 'sh-seed-toaster': 2, 'sh-seed-electric-griddle': 2, 'sh-seed-slow-cooker': 2, 'sh-seed-blender-indoor': 1, 'sh-seed-blender-outdoor': 1,
    'sh-seed-ice-maker': 1, 'sh-seed-drink-dispenser': 2 };
  for (const [id, n] of Object.entries(expect24)) { assert.ok(byId[id], `missing seed item ${id}`); assert.equal(qty(id), n, id); }
  ok('seed quantities at 24 guests match the §2.6 tables (plates 36/30, tumblers 36/48, flatware 72/48/48/24/72/36, serving pieces, appliance counts)');
  assert.equal(qty('sh-seed-dinner-plates-indoor', 20), 30);
  assert.equal(qty('sh-seed-steak-knives', 20), 24);
  const overridden = items.filter(i => i.qtyOverride !== null && i.qtyOverride !== undefined);
  assert.ok(overridden.length >= 2);
  for (const i of overridden) assert.equal(SH.computeQty(i, { ...D, guestCount: 10 }), i.qtyOverride);
  ok('24 → 20 guests recomputes rule-based seed quantities but not fixed counts or overrides (linen placeholders)');

  const levels = SH.mealsCovered(items, D);
  assert.ok(levels.length >= 12);   // 7 dish types + 5 flatware pieces that scale with guests
  for (const r of levels) assert.equal(r.level, 'full-day', `${r.dishType} is ${r.level}`);
  assert.equal(levels.find(r => r.dishType === 'Dinner plates').total, 66);
  assert.equal(levels.find(r => r.dishType === 'Everyday tumblers').total, 84);
  ok('the seeded indoor + outdoor sets cover a full day at 24 guests for every dish type (66 plates, 84 tumblers)');
  for (const i of items.filter(x => x.category === 'Outdoor / Pool Dining')) assert.equal(i.zone, 'outdoor', i.id);
  assert.ok(items.some(i => i.category === 'Outdoor / Pool Dining'));
  ok('every Outdoor / Pool Dining seed item is zone: outdoor');

  // master-list parser (CSV → seed shape). Skipped when python3 is unavailable.
  const py = spawnSync('python3', ['--version']);
  if (py.error) { ok('parse-shopping-list.py check skipped (python3 not installed)'); }
  else {
    const src = fs.readFileSync(new URL('../scripts/parse-shopping-list.py', import.meta.url), 'utf8');
    const catStart = src.indexOf('CATEGORIES = [');
    const catBlock = src.slice(catStart, src.indexOf(']', catStart));
    const pyCats = [...catBlock.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(pyCats, SH.SHOPPING_CATEGORIES);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-parse-'));
    const out = path.join(tmp, 'seed.json');
    const run = spawnSync('python3', ['scripts/parse-shopping-list.py', 'scripts/fixtures/shopping-list-sample.csv', '--out', out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const parsed = JSON.parse(fs.readFileSync(out, 'utf8')).items;
    assert.ok(parsed.length >= 5);
    for (const i of parsed) assert.equal(SH.sanitizeShoppingItem(i, stamp).ok, true, `parsed item invalid: ${i.id}`);
    const withTier = parsed.find(i => i.qualityTier === 'Premium');
    assert.ok(withTier && withTier.requirements && typeof withTier.kerryDecides === 'boolean');
    assert.equal(SH.computeQty(parsed[0], D), parsed[0].qtyRule.fixedQty);
    assert.equal(parsed.find(i => i.name === 'Dinner plates (indoor)').dishType, 'Dinner plates');
    assert.equal(parsed.find(i => i.name === 'Shatter-resistant tumblers (outdoor)').dishType, 'Shatter-resistant tumblers');
    const drip = parsed.find(i => i.masterId === 'MS-0102');
    assert.ok(drip && drip.id === 'sh-seed-ms-0102');
    const mugs = parsed.find(i => i.name === 'Coffee mugs');
    assert.deepEqual([mugs.qtyRule.basis, mugs.qtyRule.multiplier], ['guests', 1.5]);
    assert.equal(SH.computeQty(mugs, { ...D, guestCount: 20 }), 30);
    const bad = path.join(tmp, 'bad.csv');
    fs.writeFileSync(bad, 'Item,Category,Final qty\nGood item,Dinnerware,4\nBad item,Not A Category,2\n');
    const badRun = spawnSync('python3', ['scripts/parse-shopping-list.py', bad, '--check'], { encoding: 'utf8' });
    assert.notEqual(badRun.status, 0);
    assert.match(badRun.stderr + badRun.stdout, /row 3/i);
    ok('parse-shopping-list.py turns a master-list CSV into valid seed items (keeping quality tier / requirements / Kerry-decides) and rejects a bad category with the row number');
  }
}

console.log('Phase 2 — list helpers (search, filter, group):');
{
  const mk = (id, o) => ({ ...SH.emptyShoppingItem(), id, name: id, ...o });
  const items = [
    mk('sh-a', { name: 'Dinner plates', category: 'Dinnerware', room: 'Kitchen', status: 'approved', priority: 'launch-critical', claimedBy: 'JM', notes: 'Stoneware', candidates: [{ id: 'c1', vendor: 'Amazon', brand: 'Corelle', model: 'ABC-1' }] }),
    mk('sh-b', { name: 'Toaster', category: 'Small Appliances', status: 'researching', priority: 'launch', agentFlag: { action: 'buy-now', reason: 'Low', flaggedAt: null }, candidates: [{ id: 'c2', vendor: 'Minoan', brand: 'Breville' }] }),
    mk('sh-c', { name: 'Hangers', category: 'Supplies & Consumables', status: 'shortlisted', priority: 'nice-to-have', dishType: 'x' }),
    mk('sh-d', { name: 'Odd thing', category: 'Other', status: 'weird-status' }),
  ];
  const ids = (list) => list.map(i => i.id);
  assert.deepEqual(ids(SH.filterShoppingItems(items, {})), ['sh-a', 'sh-b', 'sh-c', 'sh-d']);
  assert.deepEqual(ids(SH.filterShoppingItems(items, { status: 'approved' })), ['sh-a']);
  assert.deepEqual(ids(SH.filterShoppingItems(items, { category: 'Small Appliances' })), ['sh-b']);
  assert.deepEqual(ids(SH.filterShoppingItems(items, { priority: 'nice-to-have' })), ['sh-c']);
  assert.deepEqual(ids(SH.filterShoppingItems(items, { agentFlag: 'buy-now' })), ['sh-b']);
  assert.deepEqual(ids(SH.filterShoppingItems(items, { agentFlag: 'none' })), ['sh-a', 'sh-c', 'sh-d']);
  assert.deepEqual(ids(SH.filterShoppingItems(items, { claimedBy: 'JM' })), ['sh-a']);
  assert.deepEqual(ids(SH.filterShoppingItems(items, { claimedBy: 'unclaimed' })), ['sh-b', 'sh-c', 'sh-d']);
  assert.deepEqual(ids(SH.filterShoppingItems(items, { vendor: 'minoan' })), ['sh-b']);
  assert.deepEqual(ids(SH.filterShoppingItems(items, { search: 'corelle' })), ['sh-a']);
  assert.deepEqual(ids(SH.filterShoppingItems(items, { status: 'all', category: 'all', priority: 'all', agentFlag: 'all', claimedBy: 'all', vendor: 'all', search: '  ' })), ['sh-a', 'sh-b', 'sh-c', 'sh-d']);
  assert.deepEqual(ids(SH.filterShoppingItems(items, { status: 'approved', category: 'Small Appliances' })), []);
  assert.equal(SH.matchesShoppingSearch(items[0], 'stoneware'), true);
  assert.equal(SH.matchesShoppingSearch(items[0], 'zzz'), false);
  assert.equal(SH.matchesShoppingSearch({}, 'x'), false);
  ok('filters (status, category, priority, agent flag, claimed by, vendor) and search combine; "all"/blank mean no filter; search covers name, notes, room and candidate vendor/brand/model');

  const byCat = SH.groupShoppingItems(items, 'category');
  assert.deepEqual(byCat.map(g => g.key), ['Small Appliances', 'Dinnerware', 'Supplies & Consumables', 'Other']);
  assert.deepEqual(byCat.map(g => g.items.length), [1, 1, 1, 1]);
  const byStatus = SH.groupShoppingItems(items, 'status');
  assert.deepEqual(byStatus.map(g => g.key), ['researching', 'shortlisted', 'approved', 'weird-status']);
  assert.deepEqual(SH.groupShoppingItems([], 'category'), []);
  ok('grouping follows the category / status order, drops empty groups, and keeps an unrecognized status instead of hiding the item');
}

console.log('Phase 2 — Mark purchased (buildPurchaseFromShopping):');
{
  const D = SH.DEFAULT_SHOPPING_SETTINGS;
  const within = (a, b) => Math.round(Math.abs(a - b) * 100) <= 1;
  const item = { ...SH.emptyShoppingItem(), id: 'sh-bed', name: 'Dunphy platform bed', category: 'Furniture', room: 'Master Suite' };
  const minoan = { ...SH.emptyCandidate(), id: 'c-m', vendor: 'Minoan', vendorType: 'minoan', sourceVendor: 'Wayfair', url: 'https://m.example/bed', brand: 'Dunphy', model: 'K-1', unitPrice: 535.41, qtyToBuy: 1, shipping: 0, transactionFeePct: 0.032386, returnWindowDays: 30 };
  const d = SH.buildPurchaseFromShopping(item, minoan, D);
  assert.match(d.id, /^pur-/);
  assert.equal(d.trade, 'Furniture / FF&E');
  assert.equal(d.vendor, 'Minoan'); assert.equal(d.sourceVendor, 'Wayfair');
  assert.equal(d.reimbursable, true); assert.equal(d.reimbursementStatus, 'pending'); assert.equal(d.reimbursedBy, 'Sparrow (Contractor)');
  assert.equal(d.allowanceCategory, NOT_IN_ALLOWANCE);
  assert.equal(d.qty, 1); assert.equal(d.unitPrice, 535.41); assert.equal(d.fees, 17.34); assert.equal(d.tax, 35.93);
  assert.ok(within(d.totalPaid, 588.67), `totalPaid ${d.totalPaid}`);
  assert.equal(d.shoppingItemId, 'sh-bed'); assert.equal(d.room, 'Master Suite');
  assert.equal(d.assetClass, '5-yr'); assert.equal(d.status, 'Ordered'); assert.equal(d.section, '');
  assert.ok(d.description.startsWith('Dunphy platform bed') && d.description.includes('Dunphy K-1'));
  assert.equal(d.returnByDate, ''); assert.equal(d.returnPolicyNote, '30-day returns');
  assert.ok(d.notes.includes('https://m.example/bed'));
  for (const k of Object.keys(emptyPurchase())) assert.ok(k in d, `draft missing ${k}`);
  ok('a Minoan candidate becomes a fully pre-filled Purchase: trade from the category map, reimbursable/pending, fee + tax + landed total within a cent of $588.67, linked to the shopping item');

  const amazon = { ...SH.emptyCandidate(), id: 'c-a', vendor: 'Amazon', vendorType: 'amazon', unitPrice: 40, qtyToBuy: 2, shipping: 0 };
  assert.equal(SH.buildPurchaseFromShopping(item, amazon, D).returnByDate, '2027-01-31');
  assert.equal(SH.buildPurchaseFromShopping(item, amazon, D).reimbursable, false);
  assert.equal(SH.buildPurchaseFromShopping(item, { ...amazon, returnByDate: '2026-12-20' }, D).returnByDate, '2026-12-20');
  assert.equal(SH.buildPurchaseFromShopping(item, minoan, { ...D, reimbursableVendors: [] }).reimbursable, false);
  assert.equal(SH.buildPurchaseFromShopping({ ...item, category: 'Not a category' }, amazon, D).trade, 'Other');
  assert.equal(SH.buildPurchaseFromShopping({ ...item, category: 'Dinnerware' }, amazon, D).trade, 'Kitchen & Dining');
  assert.equal(SH.buildPurchaseFromShopping({ ...item, category: 'Small Appliances' }, amazon, D).assetClass, '5-yr');
  assert.equal(SH.buildPurchaseFromShopping(item, null, D), null);
  assert.equal(SH.buildPurchaseFromShopping(null, amazon, D), null);
  assert.equal(SH.buildPurchaseFromShopping(item, { ...amazon, discount: 10 }, D).notes.includes('discount'), true);
  ok('Amazon holiday return-by defaults from settings, an explicit return date wins, reimbursement follows the settings vendor list, unknown categories fall back to Other, missing item/candidate → null');
  assert.equal(emptyPurchase().shoppingItemId, null);
  assert.equal(normalizePurchase({ id: 'x' }).shoppingItemId, null);
  ok('purchases carry shoppingItemId (default null) for the two-way link');
}

console.log('Phase 2 — agent export/import (§2.9) and Print for Kerry:');
{
  const D = SH.DEFAULT_SHOPPING_SETTINGS;
  const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

  // ── export bundle ──
  const podcast = [
    { ep: 1, title: 'A', keyInsight: 'ka', tags: ['x'], category: 'Operations', priority: 'critical', isGimmick: false, summary: 'long text' },
    { ep: 2, title: 'B', keyInsight: 'kb', tags: [], category: 'Marketing', priority: 'critical', isGimmick: false },
    { ep: 3, title: 'C', keyInsight: 'kc', tags: [], category: 'Guest Experience', priority: 'medium', isGimmick: false },
    { ep: 4, title: 'D', keyInsight: 'kd', tags: [], category: 'Guest Experience', priority: 'high', isGimmick: true },
    { ep: 5, title: 'E', keyInsight: 'ke', tags: ['bed'], category: 'Furnishing & Design', priority: 'high', isGimmick: false },
  ];
  const tools = { tools: [{ name: 'Minut', category: 'Smart Home & Security' }, { name: 'PriceLabs', category: 'Dynamic Pricing' }, { name: 'Breezeway', category: 'Operations & Cleaning' }, { name: 'StayFi', category: 'Guest Experience' }] };
  const plates = { ...SH.emptyShoppingItem(), id: 'sh-seed-plates', name: 'Plates', category: 'Dinnerware', qtyRule: { basis: 'guests', multiplier: 1.5, fixedQty: 0 }, qtyNeeded: 36, mystery: { keep: true } };
  const frozenItems = deepFreeze([plates]);
  const bundle = SH.buildExportBundle({ items: frozenItems, settings: { ...D, guestCount: 20 }, propertyId: 'pp', podcast, tools, now: '2026-11-21T10:00:00Z' });
  assert.deepEqual(Object.keys(bundle).sort(), ['exportedAt', 'items', 'propertyId', 'research', 'schema', 'settings']);
  assert.equal(bundle.schema, 'pp-shopping-export/v1');
  assert.equal(bundle.exportedAt, '2026-11-21T10:00:00Z'); assert.equal(bundle.propertyId, 'pp');
  assert.deepEqual(Object.keys(bundle.research).sort(), ['episodes', 'tools']);
  assert.deepEqual(bundle.research.episodes.map(e => e.ep), [1, 5]);
  assert.deepEqual(Object.keys(bundle.research.episodes[0]).sort(), ['ep', 'keyInsight', 'tags', 'title']);
  assert.deepEqual(bundle.research.tools.map(t => t.name), ['Minut', 'Breezeway', 'StayFi']);
  assert.equal(bundle.items[0].qtyNeeded, 30);
  assert.deepEqual(bundle.items[0].mystery, { keep: true });
  assert.equal(plates.qtyNeeded, 36);
  assert.equal(bundle.settings.guestCount, 20);
  assert.deepEqual(SH.buildExportBundle({ items: [], settings: D, propertyId: 'pp', podcast: [], tools: [], now: 'x' }).research, { episodes: [], tools: [] });
  ok('export bundle matches §2.9 exactly (schema, keys, filtered episodes/tools), refreshes qtyNeeded for the current guest count, keeps unknown item fields, never mutates the items');

  // ── validateResults ──
  const mkRes = (extra) => ({ schema: 'pp-shopping-results/v1', generatedAt: '2026-11-20T09:00:00Z', propertyId: 'pp', updates: [], newItems: [], ...extra });
  assert.deepEqual(SH.validateResults(mkRes(), 'pp'), { ok: true });
  assert.equal(SH.validateResults(mkRes({ schema: 'pp-shopping-results/v1.2' }), 'pp').ok, true);
  assert.equal(SH.validateResults(mkRes({ schema: 'pp-shopping-results/v2' }), 'pp').ok, false);
  assert.equal(SH.validateResults(mkRes({ schema: 'pp-shopping-export/v1' }), 'pp').ok, false);
  assert.equal(SH.validateResults(mkRes({ propertyId: 'other' }), 'pp').ok, false);
  assert.equal(SH.validateResults(mkRes({ updates: 'nope' }), 'pp').ok, false);
  assert.equal(SH.validateResults(mkRes({ newItems: {} }), 'pp').ok, false);
  assert.equal(SH.validateResults(mkRes({ generatedAt: undefined }), 'pp').ok, false);
  assert.equal(SH.validateResults(null, 'pp').ok, false);
  assert.equal(SH.validateResults('text', 'pp').ok, false);
  const noArrays = { schema: 'pp-shopping-results/v1', generatedAt: 'x', propertyId: 'pp' };
  assert.equal(SH.validateResults(noArrays, 'pp').ok, true);
  assert.match(SH.validateResults(mkRes({ propertyId: 'other' }), 'pp').error, /property/i);
  ok('results validation: v1 (and additive v1.x) accepted; /v2, the export schema, another property, malformed arrays or a missing generatedAt rejected');

  // ── mergeResults ──
  let cn = 0, sn = 0;
  const ids = { candidate: () => `c-gen-${++cn}`, item: () => `sh-gen-${++sn}` };
  const keep = { ...SH.emptyCandidate(), id: 'c-keep', vendor: 'Amazon', sku: 'OLD', unitPrice: 30, inStock: true };
  const toaster = { ...SH.emptyShoppingItem(), id: 'sh-1', name: 'Toaster', category: 'Small Appliances', candidates: [keep], selectedCandidateId: 'c-keep', approvedBy: 'JM', approvedAt: '2026-11-19T00:00:00Z', claimedBy: 'KM', qtyOverride: 3, status: 'approved', notes: 'Kerry likes chrome' };
  const cA = { vendor: 'Amazon', vendorType: 'amazon', sku: 'B0TEST', url: 'https://a.example/x', unitPrice: 25, qtyToBuy: 2, shipping: 0, inStock: true, checkedAt: '2026-11-20T08:00:00Z', tier: 'best-value', futureField: { z: 1 } };
  const cB = { vendor: 'Minoan', vendorType: 'minoan', sku: 'M-1', unitPrice: 20, qtyToBuy: 2, checkedAt: '2026-11-20T08:00:00Z' };
  const sneaky = { itemId: 'sh-1', addCandidates: [cA, cB], agentFlag: { action: 'buy-now', reason: '90-day low' }, suggestedQty: 4, notes: 'Good price',
    status: 'ordered', approvedBy: 'KM', approvedAt: 'x', claimedBy: 'JM', selectedCandidateId: 'zzz', qtyOverride: 99, qtyNeeded: 5, name: 'HACKED', purchaseIds: ['p9'], qualityTier: 'Premium', delete: true };
  const results1 = deepFreeze(mkRes({ updates: [sneaky] }));
  const r1 = SH.mergeResults(deepFreeze([toaster]), results1, D, ids);
  assert.equal(r1.touched.length, 1);
  const t1 = r1.touched[0];
  assert.equal(t1.candidates.length, 3);
  assert.deepEqual(t1.candidates.map(c => c.vendor), ['Amazon', 'Amazon', 'Minoan']);
  assert.ok(t1.candidates.slice(1).every(c => /^c-gen-/.test(c.id) && c.source === 'agent'));
  assert.deepEqual(t1.candidates[1].futureField, { z: 1 });
  assert.equal(t1.status, 'approved'); assert.equal(t1.approvedBy, 'JM'); assert.equal(t1.approvedAt, '2026-11-19T00:00:00Z');
  assert.equal(t1.claimedBy, 'KM'); assert.equal(t1.selectedCandidateId, 'c-keep'); assert.equal(t1.qtyOverride, 3);
  assert.equal(t1.name, 'Toaster'); assert.deepEqual(t1.purchaseIds, []);
  assert.deepEqual(t1.agentFlag, { action: 'buy-now', reason: '90-day low', flaggedAt: '2026-11-20T09:00:00Z' });
  assert.equal(t1.suggestedQty, 4); assert.equal(t1.qtyNeeded, toaster.qtyNeeded);
  assert.equal(t1.qualityTier, 'Premium');
  assert.equal(t1.delete, undefined);
  assert.ok(t1.notes.startsWith('Kerry likes chrome') && t1.notes.endsWith('[agent 2026-11-20] Good price'));
  assert.equal(r1.changes.length, 1);
  assert.deepEqual([r1.changes[0].kind, r1.changes[0].itemId, r1.changes[0].addedCandidates, r1.changes[0].updatedCandidates, r1.changes[0].noteAdded], ['update', 'sh-1', 2, 0, true]);
  ok('import adds candidates, flag, suggested qty and an agent note — and ignores status, approval, claim, selection, quantities, name, purchase links and "delete" even when the file includes them; additive unknown fields survive');

  const after1 = [t1];
  const again = SH.mergeResults(after1, results1, D, ids);
  assert.deepEqual(again.touched, []); assert.deepEqual(again.changes, []);
  ok('importing the same file twice changes nothing');

  const repriced = mkRes({ generatedAt: '2026-11-21T09:00:00Z', updates: [{ itemId: 'sh-1', addCandidates: [{ ...cA, url: 'https://a.example/other', unitPrice: 22, checkedAt: '2026-11-21T08:00:00Z', rating: null, inStock: null, brand: 'NewBrand' }] }] });
  const r2 = SH.mergeResults(after1, repriced, D, ids);
  assert.equal(r2.touched.length, 1);
  const c2 = r2.touched[0].candidates.find(c => c.sku === 'B0TEST');
  assert.equal(c2.unitPrice, 22); assert.equal(c2.checkedAt, '2026-11-21T08:00:00Z');
  assert.equal(c2.inStock, true); assert.equal(c2.url, 'https://a.example/x'); assert.equal(c2.brand, '');
  assert.equal(r2.touched[0].candidates.length, 3);
  assert.equal(r2.changes[0].updatedCandidates, 1); assert.equal(r2.changes[0].addedCandidates, 0);
  ok('a duplicate candidate (vendor + sku) updates price/stock fields and checkedAt, keeps its id/url/plan fields, and a null from the agent never wipes a known value');

  const noSku = { vendor: 'Wayfair', url: 'https://w.example/1', unitPrice: 50 };
  const s1 = SH.mergeResults([toaster], mkRes({ updates: [{ itemId: 'sh-1', addCandidates: [noSku] }] }), D, ids).touched[0];
  assert.equal(s1.candidates.length, 2);
  assert.equal(SH.mergeResults([s1], mkRes({ updates: [{ itemId: 'sh-1', addCandidates: [noSku] }] }), D, ids).touched.length, 0);
  const s2 = SH.mergeResults([s1], mkRes({ updates: [{ itemId: 'sh-1', addCandidates: [{ ...noSku, unitPrice: 45 }] }] }), D, ids).touched[0];
  assert.equal(s2.candidates.length, 2); assert.equal(s2.candidates[1].unitPrice, 45);
  ok('candidates without a SKU dedupe on vendor + URL');

  const newItem = { name: 'Cheese board', category: 'Serveware & Entertaining', room: 'Kitchen', qtyRule: { basis: 'fixed', fixedQty: 2 }, priority: 'nice-to-have', candidates: [cB],
    agentFlag: { action: 'needs-review', reason: 'idea' }, notes: 'hosting idea', status: 'approved', approvedBy: 'JM', claimedBy: 'KM', selectedCandidateId: 'zz', qtyOverride: 5, purchaseIds: ['p1'], mystery: 'kept' };
  const resNew = deepFreeze(mkRes({ newItems: [newItem, { name: 'Odd gadget', category: 'Not A Category' }, { category: 'Other' }] }));
  const rn = SH.mergeResults([toaster], resNew, D, ids);
  assert.equal(rn.touched.length, 2);
  const n1 = rn.touched[0];
  assert.match(n1.id, /^sh-gen-/); assert.equal(n1.proposed, true); assert.equal(n1.status, 'researching'); assert.equal(n1.userCreated, true);
  assert.equal(n1.approvedBy, null); assert.equal(n1.claimedBy, null); assert.equal(n1.selectedCandidateId, null); assert.equal(n1.qtyOverride, null); assert.deepEqual(n1.purchaseIds, []);
  assert.equal(n1.name, 'Cheese board'); assert.equal(n1.priority, 'nice-to-have'); assert.equal(n1.mystery, 'kept');
  assert.equal(n1.candidates.length, 1); assert.equal(n1.candidates[0].source, 'agent');
  assert.equal(n1.agentFlag.action, 'needs-review');
  assert.equal(rn.touched[1].category, 'Other');
  assert.equal(rn.skipped.length, 1);
  assert.equal(rn.changes.filter(c => c.kind === 'new').length, 2);
  const rnAgain = SH.mergeResults([toaster, ...rn.touched], resNew, D, ids);
  assert.deepEqual(rnAgain.touched, []);
  ok('new items land proposed/researching with no approval, claim, selection or override; invalid category → Other; nameless rows are skipped; re-importing adds no duplicates');

  const unknown = SH.mergeResults([toaster], mkRes({ updates: [{ itemId: 'sh-nope', addCandidates: [cA] }] }), D, ids);
  assert.deepEqual(unknown.touched, []); assert.equal(unknown.skipped.length, 1);
  assert.doesNotThrow(() => SH.mergeResults([toaster, null, {}], mkRes({ updates: [null, {}, { itemId: 'sh-1' }], newItems: [null] }), D, ids));
  ok('an update for an unknown item is reported as skipped; junk rows never throw');

  // ── Print for Kerry ──
  const mkSel = (id, name, category, status, vendor, price, extra = {}) => ({ ...SH.emptyShoppingItem(), id, name, category, status, selectedCandidateId: `c-${id}`, approvedBy: status === 'approved' ? 'JM' : null,
    candidates: [{ ...SH.emptyCandidate(), id: `c-${id}`, vendor, vendorType: 'other', unitPrice: price, qtyToBuy: 1, estTax: 0, shipping: 0, returnByDate: '2027-01-31' }], ...extra });
  const printItems = [
    mkSel('a', '<script>alert(1)</script> & Co', 'Small Appliances', 'approved', 'Ama&zon', 100, { notes: 'say "hi" <b>bold</b>' }),
    mkSel('b', 'Toaster', 'Small Appliances', 'shortlisted', 'Costco', 50),   // (a vendor named Minoan would pick up its 3.2% default fee)
    mkSel('c', 'Researching thing', 'Dinnerware', 'researching', 'X', 1),
    mkSel('d', 'Ordered thing', 'Dinnerware', 'ordered', 'X', 1),
    { ...SH.emptyShoppingItem(), id: 'e', name: 'No pick', category: 'Flatware', status: 'shortlisted', qtyRule: { basis: 'guests', multiplier: 3, fixedQty: 0 } },
  ];
  const html = SH.buildPrintHtml(printItems, D, '2026-11-25T12:00:00Z');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!html.includes('<script') && !html.includes('<b>bold</b>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co'));
  assert.ok(html.includes('Ama&amp;zon') && html.includes('say &quot;hi&quot; &lt;b&gt;bold&lt;/b&gt;'));
  assert.ok(html.includes('Toaster') && html.includes('No pick'));
  assert.ok(!html.includes('Researching thing') && !html.includes('Ordered thing'));
  assert.ok(html.indexOf('Small Appliances') < html.indexOf('Flatware'));
  assert.ok(html.includes('$100.00') && html.includes('$50.00') && html.includes('2027-01-31'));
  assert.ok(html.includes('72'));
  assert.ok(html.includes('2026-11-25'));
  for (const bad of ['<link', '<style', '@import', 'src=', 'href=', 'http://', 'https://']) assert.ok(!html.includes(bad), `print html must not contain ${bad}`);
  assert.ok(html.includes('—'));
  ok('Print for Kerry lists only approved + shortlisted items grouped by category with qty, chosen vendor, landed total and return-by; every value is escaped; no scripts, styles or external references');
}

console.log('Phase 2 review fixes — agent value robustness, Best Value, packs, master ids:');
{
  const D = SH.DEFAULT_SHOPPING_SETTINGS;
  const mkRes = (extra) => ({ schema: 'pp-shopping-results/v1', generatedAt: '2026-11-21T09:00:00Z', propertyId: 'pp', updates: [], newItems: [], ...extra });
  let n = 0;
  const ids = { candidate: () => `c-r-${++n}`, item: () => `sh-r-${++n}` };
  const existing = { ...SH.emptyCandidate(), id: 'c-1', vendor: 'Amazon', vendorType: 'amazon', sku: 'B0X', unitPrice: 50, qtyToBuy: 1, inStock: true, freeReturns: true, returnByDate: '2026-12-30', rating: 4.6, checkedAt: '2026-11-20T08:00:00Z' };
  const item = { ...SH.emptyShoppingItem(), id: 'sh-1', name: 'Kettle', category: 'Small Appliances', candidates: [existing], selectedCandidateId: 'c-1', requirements: 'Original requirement', kerryDecides: false, masterId: 'MS-0102' };
  const upd = (cands, extra = {}) => mkRes({ updates: [{ itemId: 'sh-1', addCandidates: cands, ...extra }] });
  const run = (items, res) => SH.mergeResults(items, res, D, ids);

  // placeholders never wipe known values (the agent is told to write "n/a"/"unverified" instead of blanks)
  const placeholder = run([item], upd([{ vendor: 'Amazon', sku: 'B0X', unitPrice: 'n/a', inStock: 'unverified', returnByDate: 'n/a', freeReturns: 'unknown', rating: 'unverified', retailUnitPrice: '—', checkedAt: '2026-11-21T08:00:00Z' }]));
  const c = placeholder.touched[0].candidates[0];
  assert.equal(c.unitPrice, 50); assert.equal(c.inStock, true); assert.equal(c.returnByDate, '2026-12-30');
  assert.equal(c.freeReturns, true); assert.equal(c.rating, 4.6); assert.equal(c.checkedAt, '2026-11-21T08:00:00Z');
  ok('placeholder values ("n/a", "unverified", "unknown", "—") never overwrite known prices, stock, dates or flags on a re-check');

  // strict booleans and ISO-only dates
  const typed = run([item], upd([{ vendor: 'Target', sku: 'T1', unitPrice: 10, inStock: 'false', freeReturns: 'no', openStock: 'N', commercialGrade: 'maybe', returnByDate: 'next week', deliveryEta: '2026-12-01' },
    { vendor: 'Target', sku: 'T2', unitPrice: 11, inStock: 'Yes', freeReturns: 'true', openStock: 1 }])).touched[0].candidates;
  const t1 = typed.find(x => x.sku === 'T1'), t2 = typed.find(x => x.sku === 'T2');
  assert.equal(t1.inStock, false); assert.equal(t1.freeReturns, false); assert.equal(t1.openStock, false); assert.equal(t1.commercialGrade, null);
  assert.equal(t1.returnByDate, ''); assert.equal(t1.deliveryEta, '2026-12-01');
  assert.equal(t2.inStock, true); assert.equal(t2.freeReturns, true); assert.equal(t2.openStock, true);
  assert.equal(SH.landedTotal({ ...t1, qtyToBuy: 1 }, D) > 0, true);
  assert.equal(SH.returnExposure({ ...t1, returnShippingCost: 12 }), 12);
  ok('"false"/"no"/"N" are false (not truthy), "maybe" is unknown, free-text is not stored as a date');

  // Good / Better / Best with no sku/url stay separate; identical re-import adds nothing
  const gbb = [{ vendor: 'Amazon', sku: 'n/a', unitPrice: 40, brand: '', model: '' }, { vendor: 'Amazon', sku: 'n/a', unitPrice: 60 }, { vendor: 'Amazon', sku: 'n/a', unitPrice: 90 }];
  const g1 = run([item], upd(gbb)).touched[0];
  assert.equal(g1.candidates.length, 4);
  assert.deepEqual(g1.candidates.slice(1).map(x => x.unitPrice), [40, 60, 90]);
  assert.deepEqual(run([g1], upd(gbb)).touched, []);
  ok('options from one vendor with placeholder/blank identifiers stay separate candidates, and re-importing them is still a no-op');

  // agent-supplied source is ignored; null never clears; flag labels are normalized; unknown flag is ignored
  const withSrc = run([item], upd([{ vendor: 'Wayfair', sku: 'W1', unitPrice: 5, source: 'JM' }, { vendor: 'Wayfair', sku: 'W2', unitPrice: 6, source: 'KM' }])).touched[0];
  assert.ok(withSrc.candidates.slice(1).every(x => x.source === 'agent'));
  const flagged = { ...item, suggestedQty: 4, agentFlag: { action: 'buy-now', reason: 'low', flaggedAt: '2026-11-01T00:00:00Z' } };
  assert.equal(run([flagged], upd([], { suggestedQty: null, agentFlag: { action: 'banana', reason: 'x' } })).touched.length, 0);
  for (const [label, action] of [['BUY NOW', 'buy-now'], ['Wait', 'wait-for-sale'], ['wait for sale', 'wait-for-sale'], ['REVIEW', 'needs-review'], ['needs_review', 'needs-review']]) {
    assert.equal(run([item], upd([], { agentFlag: { action: label, reason: 'r' } })).touched[0].agentFlag.action, action, label);
  }
  ok('imported candidates are always labelled "agent"; a null suggested qty or an unrecognized flag never clears what is there; BUY NOW / WAIT / REVIEW map to the app flags');

  // human master-list fields and delete-like keys are protected; blanks can still be filled in
  const protect = run([item], upd([], { requirements: 'HACK', kerryDecides: true, masterId: 'EVIL', isDeleted: true, deleted: true, removeMe: true, masterNote: 'x' }));
  assert.deepEqual(protect.touched, []);
  const fill = run([{ ...item, requirements: undefined }], upd([], { requirements: 'Agent filled', qualityTier: 'Premium' })).touched[0];
  assert.equal(fill.requirements, 'Agent filled'); assert.equal(fill.qualityTier, 'Premium');
  ok('an update can fill a missing master-list field but never overwrite one, never touch master ids, and delete/remove-style keys are ignored');

  // master ids resolve
  const byMaster = run([item], mkRes({ updates: [{ itemId: 'MS-0102', addCandidates: [{ vendor: 'Costco', sku: 'C1', unitPrice: 20 }] }] }));
  assert.equal(byMaster.touched.length, 1); assert.equal(byMaster.touched[0].id, 'sh-1'); assert.deepEqual(byMaster.skipped, []);
  ok('results keyed by the master-list Item ID resolve to the right shopping item');

  // Best Value ignores unpriced / zero-quantity candidates
  const priced = { ...SH.emptyCandidate(), id: 'P', vendor: 'Amazon', vendorType: 'amazon', unitPrice: 49.99, qtyToBuy: 2, inStock: true };
  const unpriced = { ...SH.emptyCandidate(), id: 'U', vendor: 'Target', vendorType: 'retail', unitPrice: null, qtyToBuy: 2, shipping: 0, inStock: true };
  const zeroQty = { ...priced, id: 'Z', unitPrice: 1, qtyToBuy: 0 };
  assert.equal(SH.bestValue({ candidates: [unpriced, priced] }, D).id, 'P');
  assert.equal(SH.bestValue({ candidates: [zeroQty, priced] }, D).id, 'P');
  assert.equal(SH.bestValue({ candidates: [unpriced, zeroQty] }, D), null);
  ok('Best Value never recommends a candidate with no price or zero quantity');

  // packs: the purchase records pieces so mealsCovered counts forks, not packs
  const forksItem = { ...SH.emptyShoppingItem(), id: 'sh-forks', name: 'Dinner forks', category: 'Flatware', dishType: 'Dinner forks', usesPerGuestPerDay: 3, qtyRule: { basis: 'guests', multiplier: 3, fixedQty: 0 } };
  const packCand = { ...SH.emptyCandidate(), id: 'c-p', vendor: 'Costco', vendorType: 'retail', unitPrice: 36, packSize: 12, qtyToBuy: 6, estTax: 0, shipping: 0 };
  const draft = SH.buildPurchaseFromShopping(forksItem, packCand, D);
  assert.equal(draft.qty, 72); assert.equal(draft.unitPrice, 3);
  assert.equal(Math.round(draft.qty * draft.unitPrice * 100) / 100, SH.merchandise(packCand));
  const boughtForks = { ...forksItem, status: 'ordered', purchaseIds: [draft.id] };
  const forks = SH.mealsCovered([boughtForks], D, [draft]).find(r => r.dishType === 'Dinner forks');
  assert.equal(forks.total, 72); assert.equal(forks.level, 'full-day');
  assert.equal(SH.buildPurchaseFromShopping(forksItem, { ...packCand, packSize: 1, qtyToBuy: 2, unitPrice: 5 }, D).qty, 2);
  ok('buying 6 packs of 12 records 72 pieces at $3 each (quantity × price still equals the goods total), so the meals-covered badge counts forks, not packs');
}

console.log('Phase 2 — remaining limits resolved (dismissed proposals, price-since-approval):');
{
  const D = SH.DEFAULT_SHOPPING_SETTINGS;
  const mkRes = (extra) => ({ schema: 'pp-shopping-results/v1', generatedAt: '2026-11-21T09:00:00Z', propertyId: 'pp', updates: [], newItems: [], ...extra });
  let n = 0;
  const ids = { candidate: () => `c-d-${++n}`, item: () => `sh-d-${++n}` };
  const proposal = { name: 'Cheese board', category: 'Serveware & Entertaining', candidates: [{ vendor: 'Minoan', sku: 'M1', unitPrice: 20 }], notes: 'idea' };
  const first = SH.mergeResults([], mkRes({ newItems: [proposal] }), D, ids).touched[0];
  assert.equal(first.proposed, true);
  // Dismiss = keep the record hidden (not deleted), so a re-import can't resurrect it.
  const dismissed = { ...first, dismissed: true, proposed: false };
  const again = SH.mergeResults([dismissed], mkRes({ newItems: [proposal] }), D, ids);
  assert.deepEqual(again.touched, []);
  assert.equal(again.touched.length + [dismissed].length, 1);
  const withNewOption = SH.mergeResults([dismissed], mkRes({ newItems: [{ ...proposal, candidates: [...proposal.candidates, { vendor: 'Amazon', sku: 'A1', unitPrice: 18 }] }] }), D, ids);
  assert.equal(withNewOption.touched.length, 1); assert.equal(withNewOption.touched[0].id, dismissed.id); assert.equal(withNewOption.touched[0].dismissed, true);
  assert.equal(withNewOption.changes.filter(c => c.kind === 'new').length, 0);
  // an agent can never un-dismiss (or dismiss) anything
  const flip = SH.mergeResults([dismissed], mkRes({ updates: [{ itemId: dismissed.id, dismissed: false, proposed: true }] }), D, ids);
  assert.deepEqual(flip.touched, []);
  const flipNew = SH.mergeResults([], mkRes({ newItems: [{ ...proposal, dismissed: true }] }), D, ids).touched[0];
  assert.equal(flipNew.dismissed, undefined);
  ok('a dismissed proposal stays hidden when the same file is imported again (no duplicate, nothing resurrected), and an import can never dismiss or restore items');

  // price changed since approval
  const cand = { ...SH.emptyCandidate(), id: 'c1', vendor: 'Amazon', vendorType: 'amazon', unitPrice: 100, qtyToBuy: 1, estTax: 0, shipping: 0 };
  const approved = { ...SH.emptyShoppingItem(), id: 'sh-a', name: 'x', candidates: [cand], selectedCandidateId: 'c1', approvedBy: 'JM', approvedLanded: 100 };
  assert.equal(SH.priceChangedSinceApproval(approved, D), null);
  const repriced = { ...approved, candidates: [{ ...cand, unitPrice: 112.5 }] };
  assert.deepEqual(SH.priceChangedSinceApproval(repriced, D), { from: 100, to: 112.5 });
  assert.equal(SH.priceChangedSinceApproval({ ...repriced, approvedBy: null }, D), null);
  assert.equal(SH.priceChangedSinceApproval({ ...repriced, approvedLanded: null }, D), null);
  assert.equal(SH.priceChangedSinceApproval({ ...repriced, selectedCandidateId: null }, D), null);
  assert.equal(SH.priceChangedSinceApproval({ ...approved, candidates: [{ ...cand, unitPrice: 100.004 }] }, D), null);
  assert.equal(SH.priceChangedSinceApproval({}, D), null);
  assert.equal(SH.priceChangedSinceApproval(null, D), null);
  const saved = SH.sanitizeShoppingItem({ ...approved, approvedLanded: '104.5', name: 'x', category: 'Other' }, { updatedAt: null, updatedBy: null });
  assert.equal(saved.item.approvedLanded, 104.5);
  assert.equal(SH.emptyShoppingItem().approvedLanded, null);
  // an agent import cannot set the recorded approval price
  const forged = SH.mergeResults([approved], mkRes({ updates: [{ itemId: 'sh-a', approvedLanded: 1 }] }), D, ids);
  assert.deepEqual(forged.touched, []);
  ok('an approved item flags when its selected candidate\'s landed price later changes (e.g. an agent re-check); no flag for sub-cent noise, unapproved items or missing data; the approval price can\'t be forged by an import');
}

console.log('Phase 3 — extraction validation, reconcile, exact cost allocation (spec §3.7 fixtures):');
{
  const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/receipts/${n}.json`, import.meta.url), 'utf8'));
  const cents = (n) => Math.round(n * 100);
  const sum = (xs) => Math.round(xs.reduce((a, b) => a + cents(b), 0)) / 100;
  const A = fx('minoan-F3F3D4B0'), B = fx('minoan-F088F252'), C = fx('firstcoast-687');
  const vA = RL.validateExtraction(A), vB = RL.validateExtraction(B), vC = RL.validateExtraction(C);
  assert.equal(vA.ok, true); assert.equal(vB.ok, true); assert.equal(vC.ok, true);
  assert.equal(vA.extraction.reconciles, true); assert.equal(vB.extraction.reconciles, true);
  assert.equal(RL.reconciles(vA.extraction), true);
  assert.equal(PURCHASE_TRADES.includes(vA.extraction.lines[0].suggestedTrade), true);
  assert.ok(vA.extraction.lines[0].confidence < 0.9);
  ok('real Minoan fixtures A and B validate and reconcile; the ambiguous line-1 trade is a valid trade flagged below 0.9 confidence');

  assert.equal(vC.extraction.reconciles, false);
  assert.deepEqual(vC.extraction.issues.slice(0, C.issues.length), C.issues);
  assert.ok(vC.extraction.lines.every(l => l.confidence <= 0.7));
  assert.equal(vC.extraction.total, null);
  assert.equal(vC.extraction.lines[11].lineTotal, null);
  const closetsSum = sum(vC.extraction.lines.filter(l => l.suggestedTrade === 'Closets & Shelving').map(l => l.lineTotal));
  assert.equal(closetsSum, 9255);
  ok('fixture C stays ambiguous (total null, line 12 price null, issues kept verbatim, handwritten caps confidence at 0.7, closets sum $9,255.00) — nothing is guessed');

  for (const [fixture, v] of [[A, vA], [B, vB]]) {
    const lines = v.extraction.lines;
    const alloc = RL.allocateOrderCosts(lines, { tax: fixture.tax, shipping: fixture.shipping, fees: fixture.fees, discounts: fixture.discounts });
    assert.deepEqual(alloc.map(a => a.fees), fixture._expected.fees);
    assert.deepEqual(alloc.map(a => a.tax), fixture._expected.tax);
    assert.deepEqual(alloc.map(a => a.totalPaid), fixture._expected.totalPaid);
    assert.equal(sum(alloc.map(a => a.fees)), fixture.fees);
    assert.equal(sum(alloc.map(a => a.tax)), fixture.tax);
    assert.equal(sum(alloc.map(a => a.totalPaid)), fixture.total);
  }
  ok('allocation reproduces the spec tables to the cent for both Minoan orders (fees, tax and total paid per line; every column and the grand total sum exactly to the receipt)');

  const L = (...totals) => totals.map((t, i) => ({ lineNo: i + 1, lineTotal: t }));
  const odd = RL.allocateOrderCosts(L(10, 10, 10), { tax: 0.01, shipping: 0, fees: 0, discounts: 0 });
  assert.deepEqual(odd.map(a => a.tax), [0.01, 0, 0]);
  assert.deepEqual(RL.allocateOrderCosts(L(25), { tax: 1.99, shipping: 3.5, fees: 0.75, discounts: 0 })[0], { tax: 1.99, shipping: 3.5, fees: 0.75, discounts: 0, totalPaid: 31.24 });   // 25 + 1.99 + 3.50 + 0.75
  assert.ok(RL.allocateOrderCosts(L(10, 20), { tax: 0, shipping: 0, fees: 0, discounts: 0 }).every(a => a.tax === 0 && a.shipping === 0 && a.fees === 0));
  const withNull = RL.allocateOrderCosts(L(100, null, 100), { tax: 7, shipping: 0, fees: 0, discounts: 0 });
  assert.deepEqual(withNull.map(a => a.tax), [3.5, 0, 3.5]); assert.equal(withNull[1].totalPaid, null);
  const disc = RL.allocateOrderCosts(L(100, 100, 100), { tax: 0, shipping: 0, fees: 0, discounts: 5 });
  assert.equal(sum(disc.map(a => a.discounts)), 5); assert.equal(sum(disc.map(a => a.totalPaid)), 295);
  assert.deepEqual(RL.allocateOrderCosts([], { tax: 1, shipping: 1, fees: 1, discounts: 1 }), []);
  assert.equal(RL.allocateOrderCosts(L(0, 0), { tax: 2, shipping: 0, fees: 0, discounts: 0 })[0].tax, 2);
  const messy = RL.allocateOrderCosts(L(33.33, 33.33, 33.34, 0.01, 12.37), { tax: 7.77, shipping: 11.11, fees: 3.03, discounts: 1.01 });
  assert.equal(sum(messy.map(a => a.tax)), 7.77); assert.equal(sum(messy.map(a => a.shipping)), 11.11);
  assert.equal(sum(messy.map(a => a.fees)), 3.03); assert.equal(sum(messy.map(a => a.discounts)), 1.01);
  assert.equal(sum(messy.map(a => a.totalPaid)), Math.round((112.38 + 7.77 + 11.11 + 3.03 - 1.01) * 100) / 100);
  ok('cent edge cases: odd-cent remainder lands on the largest line, a single line takes everything, zero amounts allocate zeros, null-total lines are skipped, discounts subtract, all-zero lines take the amount on the first, and messy amounts still sum exactly');

  const ex = (o) => ({ lines: [{ lineTotal: 100 }, { lineTotal: 50 }], tax: 10, shipping: 5, fees: 2, discounts: 0, total: 167, ...o });
  assert.equal(RL.reconciles(ex()), true);
  assert.equal(RL.reconciles(ex({ total: 167.05 })), true);
  assert.equal(RL.reconciles(ex({ total: 167.06 })), false);
  assert.equal(RL.reconciles(ex({ total: null })), false);
  assert.equal(RL.reconciles(ex({ lines: [{ lineTotal: 100 }, { lineTotal: null }] })), false);
  assert.equal(RL.reconciles(ex({ tax: null, shipping: null, fees: null, total: 150 })), true);
  assert.equal(RL.reconciles(ex({ discounts: 7, total: 160 })), true);
  assert.equal(RL.reconciles({ lines: [], total: 0 }), false);
  assert.equal(RL.reconciles(null), false);
  assert.equal(RL.reconciles({ ...A, discounts: 641.23 }), false);
  ok('reconciles: within $0.05 of the total, false for a null total / null line / no lines, order-level discounts subtract, and Minoan\'s item discount is never subtracted a second time');

  // hostile model output
  const base = () => ({ docType: 'receipt', vendor: 'Amazon', lines: [{ description: 'Thing', qty: 1, unitPrice: '$1,234.50', lineTotal: '$1,234.50', suggestedTrade: 'Kitchen & Dining', confidence: 0.9 }], total: '$1,234.50' });
  const m = RL.validateExtraction(base());
  assert.equal(m.ok, true); assert.equal(m.extraction.lines[0].lineTotal, 1234.5); assert.equal(m.extraction.total, 1234.5);
  assert.equal(RL.validateExtraction({ ...base(), cardLast4: '4111 1111 1111 1111' }).extraction.cardLast4, '1111');
  assert.equal(RL.validateExtraction({ ...base(), cardLast4: 'Visa ending 4242' }).extraction.cardLast4, '4242');
  const card = '4111 1111 1111 1111';
  const red = RL.validateExtraction({ ...base(), paymentMethod: `Visa ${card}`, issues: [`paid with ${card}`], customerName: `X ${card}`,
    lines: [{ ...base().lines[0], description: `Item 4111111111111111 here` }] }).extraction;
  assert.ok(!JSON.stringify(red).includes('4111 1111 1111 1111') && !JSON.stringify(red).includes('4111111111111111'));
  assert.equal(RL.redactCardNumbers('order 113-1234567-1234567 ok'), 'order 113-1234567-1234567 ok');
  assert.equal(RL.redactCardNumbers('card 5500 0055 5555 5559 end'), 'card •••• end');
  const bad = RL.validateExtraction({ ...base(), lines: [{ ...base().lines[0], suggestedTrade: 'Spaceships', confidence: 7 }, { ...base().lines[0], confidence: -1 }, { ...base().lines[0], qty: null }] }).extraction;
  assert.equal(bad.lines[0].suggestedTrade, 'Other'); assert.equal(bad.lines[0].confidence, 1); assert.equal(bad.lines[1].confidence, 0);
  assert.equal(bad.lines[2].qty, 1);
  assert.ok(bad.issues.some(i => /Line 1/.test(i) && /trade/i.test(i)) && bad.issues.some(i => /Line 3/.test(i) && /quantity/i.test(i)));
  assert.equal(RL.validateExtraction({ ...base(), lines: undefined }).ok, false);
  for (const junk of [null, 'text', 5, [], undefined]) assert.equal(RL.validateExtraction(junk).ok, false);
  assert.equal(RL.validateExtraction({ ...base(), docType: 'invoice-ish' }).ok, false);
  assert.equal(RL.validateExtraction({ ...base(), lines: [5] }).ok, false);
  assert.ok(RL.validateExtraction({ ...base(), issues: Array.from({ length: 200 }, (_, i) => `issue ${i}`) }).extraction.issues.length <= 25);
  const again = RL.validateExtraction(RL.validateExtraction({ ...base(), lines: [{ ...base().lines[0], suggestedTrade: 'Spaceships' }] }).extraction).extraction;
  assert.equal(again.issues.length, 1);
  assert.match(RL.newInboxId(), /^ri-[a-z0-9]+-[a-z0-9]{6}$/);
  assert.notEqual(RL.newInboxId(), RL.newInboxId());
  assert.equal(RL.EXTRACTION_MODEL, 'claude-sonnet-5-5');
  ok('hostile model output: money strings parse, card numbers reduce to the last 4 and are redacted everywhere (order numbers are not), invalid trades/confidence/quantities are normalized with issues, structural garbage is rejected, issues are capped, and re-validating never duplicates issues');
}

console.log('Phase 3 — matching, duplicates, address check, merge, filing (fixtures through Phase 1 accounting):');
{
  const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/receipts/${n}.json`, import.meta.url), 'utf8'));
  const accept = (ex) => ({ ...ex, lines: ex.lines.map(l => ({ ...l, decision: 'accept' })) });
  const D = SH.DEFAULT_SHOPPING_SETTINGS;
  const receipt = (id) => ({ pathname: `receipts/pp/inbox/${id}/receipt-abc.pdf`, name: 'r.pdf', contentType: 'application/pdf', uploadedAt: '2026-11-07T00:00:00Z', hash: `hash-${id}` });
  const rec = (id, ex) => ({ id, status: 'extracted', receipt: receipt(id), extraction: ex, error: null, purchaseIds: [] });
  const PROP = '6401 Broward St, St. Augustine, FL 32080';

  assert.equal(RL.addressMatches('6401 Broward Street, Anastasia Island FL 32080', PROP), true);
  assert.equal(RL.addressMatches('6401 BROWARD ST.', PROP), true);
  assert.equal(RL.addressMatches('3401 Broward', PROP), false);
  assert.equal(RL.addressMatches('6401 Ocean Blvd', PROP), false);
  assert.equal(RL.addressMatches('123 N Main St', '123 Main Street, Town'), true);
  assert.equal(RL.addressMatches('', PROP), null);
  assert.equal(RL.addressMatches(null, PROP), null);
  assert.equal(RL.addressMatches('PO Box 12', PROP), null);
  assert.equal(RL.addressMatches('6401 Broward St', ''), null);
  ok('address check compares street number + street name (case/punctuation/suffix/direction tolerant); a blank or unparseable address is "unknown" (null), not a mismatch');

  const items = [
    { ...SH.emptyShoppingItem(), id: 'sh-toast', name: '4-slice toaster', candidates: [{ ...SH.emptyCandidate(), id: 'c1', sku: 'B0CPT142', brand: 'Cuisinart', model: 'CPT-142' }] },
    { ...SH.emptyShoppingItem(), id: 'sh-kettle', name: 'Electric kettle', candidates: [] },
    { ...SH.emptyShoppingItem(), id: 'sh-gone', name: 'Dismissed thing', dismissed: true, candidates: [] },
  ];
  const ml = RL.matchLines([{ sku: 'b0cpt142', description: 'whatever' }, { sku: null, description: 'Cuisinart 4-Slice Toaster CPT-142 Chrome' }, { sku: null, description: 'Bamboo cutting board' }, { sku: 'ZZZ', description: 'Dismissed thing' }], items);
  assert.deepEqual([ml[0].matchItemId, ml[0].matchScore], ['sh-toast', 1]);
  assert.equal(ml[1].matchItemId, 'sh-toast'); assert.ok(ml[1].matchScore >= 0.6 && ml[1].matchScore < 1);
  assert.equal(ml[2].matchItemId, null); assert.ok(ml[2].matchScore < 0.6);
  assert.equal(ml[3].matchItemId, null);
  assert.deepEqual(RL.matchLines([], items), []);
  assert.deepEqual(RL.matchLines([{ description: 'x' }], []), [{ matchItemId: null, matchScore: 0 }]);
  ok('line matching: exact SKU first (score 1), then name similarity at ≥ 0.6, nothing for unrelated lines, dismissed items never match, empty inputs are safe');

  const exA = RL.validateExtraction(fx('minoan-F3F3D4B0')).extraction;
  const pur = [{ id: 'p-old', vendor: 'minoan', invoiceNo: 'f3f3d4b0', description: 'earlier' }, { id: 'p-self', vendor: 'Minoan', invoiceNo: 'F3F3D4B0' }, { id: 'p-other', vendor: 'Amazon', invoiceNo: 'F3F3D4B0' }];
  const inbox = [{ id: 'ri-1', status: 'extracted', extraction: exA, receipt: { hash: 'h1' } }, { id: 'ri-2', status: 'dismissed', extraction: exA, receipt: { hash: 'h1' } }, { id: 'ri-3', status: 'extracted', extraction: { vendor: 'X', orderNo: '1' }, receipt: { hash: 'h-same' } }];
  const dups = RL.findDuplicates(exA, { hash: 'h-same' }, pur, inbox, 'ri-self', ['p-self']);
  assert.deepEqual(dups.map(d => `${d.kind}:${d.id}`).sort(), ['inbox:ri-1', 'inbox:ri-3', 'purchase:p-old']);
  assert.deepEqual(RL.findDuplicates({ vendor: 'Minoan', orderNo: '' }, null, pur, inbox, 'x'), []);
  assert.deepEqual(RL.findDuplicates(exA, { hash: 'h-same' }, [], [{ id: 'ri-3', status: 'extracted', extraction: null, receipt: { hash: 'h-same' } }], 'ri-3'), []);
  ok('duplicates: same vendor + order # (any case) in purchases or another inbox record, or the same file hash; self, linked purchases and dismissed records are ignored; a blank order # never matches');

  const exC = RL.validateExtraction(fx('firstcoast-687')).extraction;
  const merged = RL.mergeLines(exC.lines, 11);
  assert.equal(merged.length, 11);
  assert.deepEqual([merged[10].qty, merged[10].lineTotal, merged[10].lineNo], [22, 9732, 11]);
  assert.ok(merged[10].description.includes('light-filtering') && merged[10].description.includes('Room-darkening'));
  assert.equal(exC.lines.length, 12);
  assert.equal(RL.mergeLines(exC.lines, 0), exC.lines); assert.equal(RL.mergeLines(exC.lines, 99), exC.lines);
  assert.equal(RL.mergeLines([{ qty: 1, lineTotal: null, description: 'a' }, { qty: 1, lineTotal: null, description: 'b' }], 1)[0].lineTotal, null);
  ok('merging fixture C\'s two shade lines gives one 22-unit $9,732 line, renumbers the rest, and never mutates the input');

  assert.equal(RL.canAcceptAll(exC), false);
  assert.equal(RL.canAcceptAll(exA), true);
  assert.equal(RL.canAcceptAll({ ...exA, issues: ['x'] }), false);
  assert.equal(RL.canAcceptAll(null), false);
  assert.deepEqual(RL.fileProblems(exA, { purchasedBy: 'Josh' }), ['Accept at least one line']);
  const accA = accept(exA);
  assert.deepEqual(RL.fileProblems(accA, { purchasedBy: '' }), ['Choose who paid']);
  assert.deepEqual(RL.fileProblems(accA, { purchasedBy: 'Josh' }), []);
  const accC = accept(exC);
  const pc = RL.fileProblems(accC, { purchasedBy: 'Sparrow (Contractor)' });
  assert.ok(pc.length === 1 && /Line 12/.test(pc[0]) && /line total/i.test(pc[0]));
  ok('Accept-all is blocked by issues or null prices; filing reports each missing piece (nothing accepted, who paid, a null line total)');

  const orderJ = { purchasedBy: 'Josh', paymentMethod: 'Credit Card' };
  const buildFor = (ex, id, order, extra = {}) => RL.buildPurchasesFromInbox({ record: rec(id, ex), order, shoppingItems: [], settings: D, propertyInServiceDate: '2026-11-01', ...extra });
  const pA = buildFor(accA, 'ri-a', orderJ), pB = buildFor(accept(RL.validateExtraction(fx('minoan-F088F252')).extraction), 'ri-b', orderJ);
  assert.deepEqual(pA.map(p => p.totalPaid), fx('minoan-F3F3D4B0')._expected.totalPaid);
  assert.deepEqual(pB.map(p => p.totalPaid), [216.46, 200.27, 171.94]);
  assert.ok([...pA, ...pB].every(p => p.reimbursable && p.reimbursementStatus === 'pending' && p.vendor === 'Minoan' && p.section === '' && p.paymentConfirmed === true && p.docType === 'receipt'));
  assert.deepEqual(pA.map(p => p.allowanceCategory), ['Plumbing Fixtures', 'Electrical Fixtures', 'Electrical Fixtures', 'Electrical Fixtures', 'Electrical Fixtures', 'Electrical Fixtures']);
  assert.ok(pB.every(p => p.allowanceCategory === NOT_IN_ALLOWANCE));
  assert.equal(new Set(pA.map(p => p.orderGroupId)).size, 1); assert.ok(pA[0].orderGroupId);
  assert.deepEqual(pA.map(p => p.lineNo), [1, 2, 3, 4, 5, 6]);
  assert.ok(pA.every(p => p.receipts.length === 1 && p.receipts[0].pathname === 'receipts/pp/inbox/ri-a/receipt-abc.pdf'));
  assert.equal(pA[1].invoiceNo, 'F3F3D4B0'); assert.equal(pA[1].sourceVendor, 'Ferguson Home'); assert.equal(pA[1].purchaseDate, '2026-10-23'); assert.equal(pA[1].qty, 11);
  assert.equal(pA[1].assetClass, '27.5-yr'); assert.equal(pA[1].placedInServiceDate, '2026-11-01');
  assert.equal(RL.suggestPaymentMethod('credit card'), 'Credit Card'); assert.equal(RL.suggestPaymentMethod('Visa ending 4242'), 'Credit Card');
  assert.equal(RL.suggestPaymentMethod('ACH transfer'), 'ACH / Bank Transfer'); assert.equal(RL.suggestPaymentMethod(null), '');
  const both = [...pA, ...pB];
  assert.equal(reimbursementsDue(both).total, 7685.47);
  assert.equal(allowanceCredits(both).total, 0);
  assert.equal(allowancePool(both).reimbursedNoCategory.total, 588.67);
  ok('fixtures A + B filed as Josh match the spec tables line by line, are reimbursable/pending, share one order group and one receipt each, and feed Phase 1\'s accounting exactly: Due from Sparrow $7,685.47, owner credits $0, beds $588.67 in "no Exhibit B category"');

  // fixture C after Josh's resolution
  const resolved = { ...exC, lines: RL.mergeLines(exC.lines, 11), total: 18987 };
  assert.equal(RL.reconciles(resolved), true);
  const cPurchases = buildFor(accept(resolved), 'ri-c', { purchasedBy: 'Sparrow (Contractor)', paymentMethod: '' });
  assert.equal(cPurchases.length, 11);
  const closets = cPurchases.filter(p => p.trade === 'Closets & Shelving'), shades = cPurchases.filter(p => p.trade === 'Window Treatments');
  assert.equal(closets.length, 10); assert.equal(shades.length, 1);
  assert.equal(Math.round(closets.reduce((s, p) => s + p.totalPaid, 0) * 100) / 100, 9255);
  assert.ok(closets.every(p => p.allowanceCategory === 'Shelving' && p.assetClass === '27.5-yr' && p.room));
  assert.deepEqual([shades[0].qty, shades[0].totalPaid, shades[0].allowanceCategory, shades[0].assetClass], [22, 9732, CONTRACTOR_SCOPE, '5-yr']);
  assert.ok(cPurchases.every(p => p.docType === 'statement' && p.paymentConfirmed === false && p.lienWaiverReceived === false && p.ownerPurchased === false && p.reimbursable === false && p.tax === 0 && p.shipping === 0 && p.fees === 0));
  assert.equal(new Set(cPurchases.map(p => p.orderGroupId)).size, 1);
  assert.ok(cPurchases.every(p => p.receipts[0].pathname === 'receipts/pp/inbox/ri-c/receipt-abc.pdf'));
  assert.ok(cPurchases.every(p => paymentBadge(p) === 'Contractor-paid: confirm in draw'));
  const poolC = allowancePool(cPurchases);
  const shelving = poolC.rows.find(r => r.name === 'Shelving');
  assert.deepEqual([shelving.paidBySparrow, shelving.remaining], [9255, 1245]);
  assert.equal(poolC.contractorScope.total, 9732);
  assert.equal(allowanceCredits(cPurchases).total, 0);
  ok('fixture C after Josh\'s resolution (merge shades, enter $18,987): reconciles; 10 closets in Shelving as Paid by Sparrow ($1,245 left) + one 22-unit $9,732 shades purchase in Contractor scope; statements are unpaid-until-draw; no owner credit; one order group; one shared receipt');

  // personal items on a shared Amazon order, and nothing silently filed
  const amazonLines = Array.from({ length: 12 }, (_, i) => ({ lineNo: i + 1, description: `Item ${i + 1}`, sourceVendor: null, sku: null, qty: 1, retailUnitPrice: null, unitPrice: 10 + i, lineTotal: 10 + i, roomHint: null, suggestedTrade: 'Kitchen & Dining', suggestedCategory: 'Other', confidence: 0.9, matchItemId: null, matchScore: null, decision: i < 10 ? 'accept' : 'skip' }));
  const exAm = { docType: 'receipt', vendor: 'Amazon', orderNo: '113-0000000-1111111', orderDate: '2026-11-03', paidDate: null, paymentMethod: 'Visa', cardLast4: '4242', customerName: null, shipTo: null, handwritten: false, lines: amazonLines, tax: 9.99, shipping: 5.01, fees: 0, discounts: 0, total: 0, issues: [], reconciles: false };
  const total = amazonLines.reduce((s, l) => s + l.lineTotal, 0) + 9.99 + 5.01;
  exAm.total = Math.round(total * 100) / 100;
  const pAm = buildFor(exAm, 'ri-am', { purchasedBy: 'Kerry', paymentMethod: 'Credit Card' });
  assert.equal(pAm.length, 10);
  const allocAm = RL.allocateOrderCosts(amazonLines, { tax: 9.99, shipping: 5.01, fees: 0, discounts: 0 });
  const taxAll = Math.round((pAm.reduce((s, p) => s + p.tax, 0) + allocAm.slice(10).reduce((s, a) => s + a.tax, 0)) * 100) / 100;
  const shipAll = Math.round((pAm.reduce((s, p) => s + p.shipping, 0) + allocAm.slice(10).reduce((s, a) => s + a.shipping, 0)) * 100) / 100;
  assert.equal(taxAll, 9.99); assert.equal(shipAll, 5.01);
  assert.ok(pAm.every(p => p.purchasedBy === 'Kerry' && p.ownerPurchased === true && p.reimbursable === false));
  assert.deepEqual(buildFor({ ...exAm, lines: amazonLines.map(l => ({ ...l, decision: null })) }, 'ri-am', { purchasedBy: 'Kerry' }), []);
  assert.deepEqual(buildFor({ ...exAm, lines: amazonLines.map(l => ({ ...l, decision: 'skip' })) }, 'ri-am', { purchasedBy: 'Kerry' }), []);
  assert.equal(buildFor({ ...exAm, lines: [amazonLines[0]] }, 'ri-am', { purchasedBy: 'Kerry' })[0].orderGroupId, null);
  ok('a 12-line Amazon order with 2 personal items skipped files exactly 10 purchases whose tax and shipping, plus the skipped lines\' shares, equal the receipt exactly; undecided or skipped lines file nothing; a single accepted line has no order group');

  // matched shopping item supplies the link and the return-by date
  const withItem = { ...SH.emptyShoppingItem(), id: 'sh-toast', name: 'toaster', selectedCandidateId: 'c9', candidates: [{ ...SH.emptyCandidate(), id: 'c1', sku: 'B0CPT142', returnByDate: '2027-01-31' }, { ...SH.emptyCandidate(), id: 'c9', sku: 'OTHER', returnByDate: '2026-12-15' }] };
  const line = { ...amazonLines[0], sku: 'b0cpt142', matchItemId: 'sh-toast', decision: 'accept' };
  const linked = RL.buildPurchasesFromInbox({ record: rec('ri-l', { ...exAm, lines: [line] }), order: { purchasedBy: 'Kerry' }, shoppingItems: [withItem], settings: D, propertyInServiceDate: '' })[0];
  assert.equal(linked.shoppingItemId, 'sh-toast'); assert.equal(linked.returnByDate, '2027-01-31');
  const fallback = RL.buildPurchasesFromInbox({ record: rec('ri-l', { ...exAm, lines: [{ ...line, sku: 'nomatch' }] }), order: { purchasedBy: 'Kerry' }, shoppingItems: [withItem], settings: D, propertyInServiceDate: '' })[0];
  assert.equal(fallback.returnByDate, '2026-12-15');
  ok('a line linked to a shopping item carries shoppingItemId and the matching candidate\'s return-by date (the selected candidate\'s when no SKU matches)');
}

console.log('Phase 3 — Claude extraction helper (fake client, no network):');
{
  const fixA = JSON.parse(fs.readFileSync(new URL('./fixtures/receipts/minoan-F3F3D4B0.json', import.meta.url), 'utf8'));
  const modelReply = Object.fromEntries(Object.entries(fixA).filter(([k]) => !k.startsWith('_')));
  const calls = [];
  const fake = (impl) => ({ messages: { create: async (req) => { calls.push(req); return impl(req); } } });
  const reply = (text, extra = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }], model: 'claude-sonnet-5-5', ...extra });
  const PROP = '6401 Broward St, St. Augustine, FL 32080';
  const run = (client, o = {}) => extractReceipt({ client, mediaType: 'application/pdf', base64: 'JVBERi0=', propertyAddress: PROP, now: '2026-11-07T00:00:00.000Z', ...o });

  const good = await run(fake(() => reply('```json\n' + JSON.stringify(modelReply) + '\n```')));
  assert.equal(good.ok, true); assert.equal(good.extraction.reconciles, true); assert.equal(good.extraction.lines.length, 6);
  assert.equal(good.extraction.model, 'claude-sonnet-5-5');
  const prose = await run(fake(() => reply(`Here is the receipt you asked for:\n${JSON.stringify({ ...modelReply, lines: modelReply.lines.map((l, i) => i === 0 ? { ...l, description: 'Rod } 60" with a brace' } : l) })}\nHope that helps!`)));
  assert.equal(prose.ok, true); assert.ok(prose.extraction.lines[0].description.includes('Rod } 60'));
  assert.equal((await run(fake(() => reply(JSON.stringify(modelReply))))).ok, true);
  ok('fenced JSON, bare JSON and JSON wrapped in prose (with braces inside strings) all parse and validate; reconciles is recomputed');

  const failure = async (impl, re) => { const r = await run(fake(impl)); assert.equal(r.ok, false); assert.match(r.error, re); assert.equal(typeof r.error, 'string'); };
  await failure(() => reply('', { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'general_harms' } }), /declined/i);
  await failure(() => reply('{"docType":"receipt"', { stop_reason: 'max_tokens' }), /too long|cut off/i);
  await failure(() => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }] }), /no text|nothing/i);
  await failure(() => reply('I could not read this receipt, sorry.'), /valid JSON/i);
  await failure(() => reply('{"docType": "receipt", "lines": ['), /valid JSON/i);
  await failure(() => reply(JSON.stringify({ ...modelReply, docType: 'napkin' })), /not usable/i);
  await failure(() => { throw Object.assign(new Error('401 invalid x-api-key'), { status: 401 }); }, /ANTHROPIC_API_KEY|authentication/i);
  await failure(() => { throw Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }); }, /timed out/i);
  await failure(() => { throw Object.assign(new Error('rate limited'), { status: 429 }); }, /busy|rate/i);
  await failure(() => { throw new Error('socket hang up'); }, /socket hang up/);
  await failure(() => null, /no text|nothing|valid/i);
  const leaked = await run(fake(() => { throw new Error('boom card 4111 1111 1111 1111'); }));
  assert.ok(!leaked.error.includes('4111 1111 1111 1111'));
  ok('every failure mode — refusal, truncation, empty reply, prose-only reply, bad JSON, unusable shape, 401, timeout, 429, network error, null — comes back as a readable { ok:false, error } and never throws');

  calls.length = 0;
  await run(fake(() => reply(JSON.stringify(modelReply))));
  await run(fake(() => reply(JSON.stringify(modelReply))), { mediaType: 'image/jpeg' });
  const [pdfReq, imgReq] = calls;
  for (const req of [pdfReq, imgReq]) {
    assert.equal(req.model, RL.EXTRACTION_MODEL);
    assert.ok(req.max_tokens >= 4096);
    for (const bad of ['temperature', 'top_p', 'top_k', 'tool_choice', 'thinking', 'betas', 'fallbacks']) assert.ok(!(bad in req), `request must not send ${bad}`);
    assert.equal(req.messages[req.messages.length - 1].role, 'user');
    assert.equal(req.messages.length, 1);
    assert.equal(typeof req.system, 'string');
    const kinds = req.messages[0].content.map(b => b.type);
    assert.equal(kinds[kinds.length - 1], 'text');
  }
  assert.deepEqual(pdfReq.messages[0].content[0], { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' } });
  assert.deepEqual(imgReq.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'JVBERi0=' } });
  ok('the request is a single user turn (no prefill) with the file as a base64 document (PDF) or image block before the text, the pinned model, and none of the parameters Sonnet 5.5 rejects');

  const prompt = buildExtractionPrompt({ propertyAddress: PROP });
  for (const t of PURCHASE_TRADES) assert.ok(prompt.includes(t), `prompt must list trade ${t}`);
  assert.equal(PURCHASE_TRADES.length, 22);
  for (const must of [PROP, 'last 4', 'guess', 'issues', 'sourceVendor', 'statement', 'JSON', 'asset class', 'handwritten', 'fees']) assert.ok(prompt.toLowerCase().includes(must.toLowerCase()), `prompt must mention "${must}"`);
  for (const c of SH.SHOPPING_CATEGORIES) assert.ok(prompt.includes(c), `prompt must list category ${c}`);
  ok('the prompt lists all 22 trades and the shopping categories and carries the spec rules (last 4 only, never guess → null + issues, fees separate, statement ≠ paid, marketplace vendor, no asset class) and the property address');

  const withCard = await run(fake(() => reply(JSON.stringify({ ...modelReply, paymentMethod: 'Visa 4111 1111 1111 1111', cardLast4: '4111111111111111', issues: ['paid with 5500 0055 5555 5559'] }))));
  assert.equal(withCard.ok, true);
  assert.ok(!JSON.stringify(withCard.extraction).includes('4111 1111 1111 1111') && !JSON.stringify(withCard.extraction).includes('5500 0055 5555 5559'));
  assert.equal(withCard.extraction.cardLast4, '1111');
  ok('a model reply containing a full card number comes back with only the last 4 and the rest redacted');
}

console.log('Phase 3 — extraction route logic (fake redis / blob / client):');
{
  const fixA = JSON.parse(fs.readFileSync(new URL('./fixtures/receipts/minoan-F3F3D4B0.json', import.meta.url), 'utf8'));
  const modelReply = JSON.stringify(Object.fromEntries(Object.entries(fixA).filter(([k]) => !k.startsWith('_'))));
  const mkRedis = (records = {}, registry = null) => {
    const hash = Object.fromEntries(Object.entries(records).map(([k, v]) => [k, JSON.stringify(v)]));
    return { hash, hget: async (_k, id) => hash[id] ?? null, hset: async (_k, obj) => { Object.assign(hash, obj); }, get: async () => registry };
  };
  const pending = (o = {}) => ({ id: 'ri-1', status: 'pending', receipt: { pathname: 'receipts/pp/inbox/ri-1/receipt.pdf', name: 'r.pdf', contentType: 'application/pdf', uploadedAt: 'x', hash: 'h' }, extraction: null, error: null, purchaseIds: [], ...o });
  const goodClient = () => ({ messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: modelReply }], model: 'claude-sonnet-5-5' }) } });
  const base = (over) => ({ redis: mkRedis({ 'ri-1': pending() }), key: 'receipt-inbox:pp', inboxId: 'ri-1', readBlob: async () => 'JVBERi0=', createClient: goodClient, apiKey: 'sk-test', user: 'JM', now: '2026-11-07T00:00:00.000Z', propertyId: 'pp', defaultAddress: '6401 Broward St', ...over });
  const saved = (r) => JSON.parse(r.hash['ri-1']);

  const okRun = await processInboxRecord(base());
  assert.equal(okRun.status, 200); assert.equal(okRun.body.ok, true);
  assert.equal(okRun.body.record.status, 'extracted'); assert.equal(okRun.body.record.extraction.reconciles, true); assert.equal(okRun.body.record.error, null);
  assert.equal(okRun.body.record.updatedBy, 'JM');
  ok('a pending upload is read from storage, extracted, validated and saved as "extracted" with the server stamp');

  const redis1 = mkRedis({ 'ri-1': pending() });
  let built = 0;
  const noKey = await processInboxRecord(base({ redis: redis1, apiKey: '', createClient: () => { built += 1; return goodClient(); } }));
  assert.equal(noKey.status, 200); assert.equal(noKey.body.ok, false);
  assert.equal(noKey.body.record.status, 'needs-manual'); assert.match(noKey.body.record.error, /ANTHROPIC_API_KEY/);
  assert.equal(saved(redis1).status, 'needs-manual'); assert.equal(built, 0);
  const noKey2 = await processInboxRecord(base({ apiKey: undefined }));
  assert.equal(noKey2.body.record.status, 'needs-manual');
  ok('with no API key the record becomes "needs-manual" with a clear message (saved, not a crash), and no client is ever constructed');

  const unreadable = await processInboxRecord(base({ readBlob: async () => null }));
  assert.equal(unreadable.body.record.status, 'needs-manual'); assert.match(unreadable.body.record.error, /read the uploaded file/i);
  const blobThrows = await processInboxRecord(base({ readBlob: async () => { throw new Error('blob store down'); } }));
  assert.equal(blobThrows.status, 200); assert.equal(blobThrows.body.record.status, 'needs-manual'); assert.match(blobThrows.body.record.error, /blob store down/);
  const noFile = await processInboxRecord(base({ redis: mkRedis({ 'ri-1': pending({ receipt: null }) }) }));
  assert.equal(noFile.body.record.status, 'needs-manual');
  ok('an unreadable, missing or throwing blob read also lands as needs-manual with the receipt untouched');

  // Review Focus 3: API failure → needs-manual; Retry succeeds and clears the error
  const redis2 = mkRedis({ 'ri-1': pending() });
  const failing = await processInboxRecord(base({ redis: redis2, createClient: () => ({ messages: { create: async () => { throw Object.assign(new Error('nope'), { status: 401 }); } } }) }));
  assert.equal(failing.body.record.status, 'needs-manual'); assert.match(failing.body.record.error, /authenticate|ANTHROPIC_API_KEY/i);
  const retry = await processInboxRecord(base({ redis: redis2 }));
  assert.equal(retry.body.record.status, 'extracted'); assert.equal(retry.body.record.error, null);
  assert.equal(saved(redis2).status, 'extracted');
  const badJson = await processInboxRecord(base({ createClient: () => ({ messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'sorry' }] }) } }) }));
  assert.equal(badJson.body.record.status, 'needs-manual');
  const createThrows = await processInboxRecord(base({ createClient: () => { throw new Error('sdk init failed'); } }));
  assert.equal(createThrows.status, 200); assert.equal(createThrows.body.record.status, 'needs-manual');
  ok('an API error, bad reply or SDK failure → needs-manual; pressing Retry afterwards extracts successfully and clears the error');

  assert.equal((await processInboxRecord(base({ redis: mkRedis({}) }))).status, 404);
  const filed = await processInboxRecord(base({ redis: mkRedis({ 'ri-1': pending({ status: 'filed' }) }) }));
  assert.equal(filed.status, 409);
  assert.equal((await processInboxRecord(base({ redis: mkRedis({ 'ri-1': pending({ status: 'dismissed' }) }) }))).status, 409);
  const fromRegistry = [];
  await processInboxRecord(base({ redis: mkRedis({ 'ri-1': pending() }, { properties: [{ id: 'pp', address: '99 Test Ln' }] }), createClient: () => ({ messages: { create: async (req) => { fromRegistry.push(req.system); return { stop_reason: 'end_turn', content: [{ type: 'text', text: modelReply }] }; } } }) }));
  assert.ok(fromRegistry[0].includes('99 Test Ln'));
  ok('a missing record is 404, an already filed or dismissed receipt is 409 (never re-extracted), and the property address for the prompt comes from the registry');
}

console.log('Phase 3 — inbox storage rules (paths, sanitizer, shared-blob safety):');
{
  const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/receipts/${n}.json`, import.meta.url), 'utf8'));
  const stamp = { updatedAt: '2026-11-07T10:00:00.000Z', updatedBy: 'JM' };
  assert.deepEqual(parseReceiptPathname('receipts/pp/inbox/ri-abc-123/receipt-x9.jpg'), { propertyId: 'pp', inboxId: 'ri-abc-123' });
  assert.deepEqual(parseReceiptPathname('receipts/pp/pur-1/file.jpg'), { propertyId: 'pp', purchaseId: 'pur-1' });
  for (const bad of ['receipts/pp/inbox/ri-abc/a/b.jpg', 'receipts/pp/inbox/pur-1/f.jpg', 'receipts/pp/inbox/ri-abc', 'receipts/PP/inbox/ri-a/f.jpg', 'receipts/pp/inbox/ri-../f.jpg', 'receipts/pp/inbox/RI-abc/f.jpg', 'receipts/../inbox/ri-a/f.jpg', 'receipts/pp/inbox//f.jpg', 'receipts/pp/other/ri-a/f.jpg']) {
    assert.equal(parseReceiptPathname(bad), null, bad);
  }
  ok('inbox blob paths parse to { propertyId, inboxId }; purchase paths are unchanged; traversal, wrong prefixes, uppercase and extra levels are rejected');

  const rec = (o = {}) => ({ id: 'ri-abc-123', status: 'extracted', receipt: { pathname: 'receipts/pp/inbox/ri-abc-123/receipt-x9.pdf', name: 'a.pdf', contentType: 'application/pdf', uploadedAt: '2026-11-07T09:00:00Z', hash: 'a'.repeat(64) },
    extraction: RL.validateExtraction(fx('minoan-F3F3D4B0')).extraction, error: null, purchaseIds: [], ...o });
  const good = RL.sanitizeInboxRecord(rec({ updatedBy: 'HACK', updatedAt: 'x', mystery: 1 }), stamp);
  assert.equal(good.ok, true);
  assert.deepEqual([good.record.updatedAt, good.record.updatedBy], [stamp.updatedAt, 'JM']);
  assert.deepEqual(Object.keys(good.record).sort(), ['error', 'extraction', 'id', 'purchaseIds', 'receipt', 'status', 'updatedAt', 'updatedBy']);
  assert.equal(good.record.extraction.lines.length, 6);
  const edited = rec(); edited.extraction.lines[1].decision = 'accept'; edited.extraction.lines[1].matchItemId = 'sh-toast'; edited.extraction.lines[1].lineTotal = 1111.11; edited.extraction.lines[1].suggestedTrade = 'Plumbing';
  const keptEdits = RL.sanitizeInboxRecord(edited, stamp).record.extraction.lines[1];
  assert.deepEqual([keptEdits.decision, keptEdits.matchItemId, keptEdits.lineTotal, keptEdits.suggestedTrade], ['accept', 'sh-toast', 1111.11, 'Plumbing']);
  assert.equal(RL.sanitizeInboxRecord(rec({ extraction: null, status: 'needs-manual', error: 'boom' }), stamp).ok, true);
  assert.equal(RL.sanitizeInboxRecord(rec({ extraction: null, status: 'pending' }), stamp).ok, true);
  const bads = [{ id: 'abc' }, { id: 'RI-1' }, { status: 'weird' }, { receipt: null }, { receipt: { ...rec().receipt, pathname: 'receipts/pp/pur-1/f.pdf' } },
    { receipt: { ...rec().receipt, pathname: 'receipts/pp/inbox/ri-other-999/f.pdf' } }, { receipt: { ...rec().receipt, contentType: 'text/html' } },
    { extraction: { docType: 'napkin', lines: [] } }, { extraction: 'x' }, { purchaseIds: 'p1' }];
  for (const b of bads) assert.equal(RL.sanitizeInboxRecord(rec(b), stamp).ok, false, JSON.stringify(b).slice(0, 60));
  assert.equal(RL.sanitizeInboxRecord(null, stamp).ok, false);
  const huge = rec(); huge.extraction.issues = []; huge.extraction.lines = Array.from({ length: 3000 }, (_, i) => ({ ...huge.extraction.lines[0], lineNo: i + 1, description: 'x'.repeat(250) }));
  assert.equal(RL.sanitizeInboxRecord(huge, stamp).ok, false);
  const withCard = RL.sanitizeInboxRecord(rec({ error: 'failed for 4111 1111 1111 1111' }), stamp).record;
  assert.ok(!withCard.error.includes('4111 1111 1111 1111'));
  ok('inbox records are strictly whitelisted and stamped by the server; review edits survive; the blob path must belong to THIS record; bad ids/status/content types, a forged purchase path, unusable extractions and oversize records are rejected; card numbers are redacted');

  const purchases = [{ id: 'pur-1', receipts: [{ pathname: 'receipts/pp/inbox/ri-abc-123/receipt-x9.pdf' }] }, { id: 'pur-2', receipts: [] }, null];
  const inbox = [rec(), { id: 'ri-zzz-1', receipt: { pathname: 'receipts/pp/inbox/ri-zzz-1/other.pdf' } }, { id: 'ri-bad' }, null];
  const P = 'receipts/pp/inbox/ri-abc-123/receipt-x9.pdf';
  assert.equal(isInboxReceiptReferenced(inbox, P), true);
  assert.equal(isInboxReceiptReferenced(inbox, P, 'ri-abc-123'), false);
  assert.equal(isInboxReceiptReferenced(inbox, 'receipts/pp/inbox/ri-none-1/f.pdf'), false);
  assert.equal(blobIsReferenced({ purchases, inbox, pathname: P }), true);
  assert.equal(blobIsReferenced({ purchases, inbox, pathname: P, excludeInboxId: 'ri-abc-123' }), true);       // a purchase (filed from this record) still shows it
  assert.equal(blobIsReferenced({ purchases, inbox, pathname: P, excludeInboxId: 'ri-abc-123', excludePurchaseId: 'pur-1' }), false);
  assert.equal(blobIsReferenced({ purchases: [{ id: 'pur-2', receipts: [] }], inbox, pathname: P, excludeInboxId: 'ri-abc-123' }), false);
  assert.equal(blobIsReferenced({ purchases, inbox, pathname: P, excludePurchaseId: 'pur-1' }), true);          // the inbox record itself still holds it
  assert.equal(blobIsReferenced({ purchases: [], inbox: [], pathname: P }), false);
  assert.doesNotThrow(() => blobIsReferenced({ purchases: null, inbox: undefined, pathname: P }));
  ok('shared-blob safety: a filed receipt stays viewable and undeletable while a purchase OR its inbox record still references it, and is only deletable when nothing else does');
}

console.log('Phase 3 fix — card redaction must not mangle order numbers:');
{
  // 11355500001112223 is a 17-digit Amazon-style order number that happens to pass the Luhn check (~10% of them do)
  assert.equal(RL.redactCardNumbers('order 113-5550000-1112223 ok'), 'order 113-5550000-1112223 ok');
  assert.equal(RL.redactCardNumbers('order 11355500001112223'), 'order 11355500001112223');
  assert.equal(RL.redactCardNumbers('x 123456789012345678 y'), 'x 123456789012345678 y');   // 18 digits: not a card length
  assert.equal(RL.redactCardNumbers('amex 378282246310005 end'), 'amex •••• end');           // 15 digits
  assert.equal(RL.redactCardNumbers('diners 30569309025904 end'), 'diners •••• end');          // 14 digits
  assert.equal(RL.redactCardNumbers('visa 4111-1111-1111-1111 end'), 'visa •••• end');         // 16 digits, dashed
  const v = RL.validateExtraction({ docType: 'receipt', vendor: 'Amazon', orderNo: '113-5550000-1112223', lines: [{ description: 'x', qty: 1, lineTotal: 1, sku: '11355500001112223', suggestedTrade: 'Other', confidence: 0.9 }], total: 1 }).extraction;
  assert.equal(v.orderNo, '113-5550000-1112223');
  assert.equal(v.lines[0].sku, '11355500001112223');
  ok('real card lengths (13–16, 19 digits) are still redacted, but 17/18-digit order numbers and SKUs — including Luhn-valid Amazon-style ones — are left intact');
}

console.log('Phase 3 review fixes (Opus final review):');
{
  // #1 receipts-view must not reference an undefined identifier (the old purchases-key fallback was left behind)
  const rv = fs.readFileSync(new URL('../api/receipts-view.js', import.meta.url), 'utf8');
  assert.ok(!/hgetall\(key\)/.test(rv), 'receipts-view.js must not call hgetall(key) — `key` is not defined there');
  ok('receipts-view has no dangling `key` reference (an unreferenced pathname 404s instead of throwing)');

  // #2 handwritten lines are always highlighted, even though their confidence is capped AT 0.7 (not below it)
  const hw = RL.validateExtraction({ docType: 'statement', vendor: 'First Coast', handwritten: true, lines: [{ description: 'x', qty: 1, lineTotal: 1, suggestedTrade: 'Other', confidence: 0.95 }], total: 1 }).extraction;
  assert.equal(RL.isLowConfidence(hw.lines[0], hw), true);
  const typed = RL.validateExtraction({ docType: 'receipt', vendor: 'V', handwritten: false, lines: [{ description: 'x', qty: 1, lineTotal: 1, suggestedTrade: 'Other', confidence: 0.95 }, { description: 'y', qty: 1, lineTotal: 1, suggestedTrade: 'Other', confidence: 0.5 }], total: 2 }).extraction;
  assert.equal(RL.isLowConfidence(typed.lines[0], typed), false);
  assert.equal(RL.isLowConfidence(typed.lines[1], typed), true);
  ok('a handwritten document highlights every line (confidence capped at 0.7 is flagged); typed lines flag only below 0.7');

  // #3 Accept all never overrides a Skip
  const mixed = [{ decision: 'skip' }, { decision: null }, { decision: 'accept' }, { decision: null }];
  assert.deepEqual(RL.acceptUndecided(mixed).map(l => l.decision), ['skip', 'accept', 'accept', 'accept']);
  ok('Accept all accepts only undecided lines — a skipped personal item stays skipped');

  // #4 the model cannot pre-set review decisions or shopping links
  const injected = { ...JSON.parse(fs.readFileSync(new URL('./fixtures/receipts/minoan-F3F3D4B0.json', import.meta.url), 'utf8')) };
  injected.lines = injected.lines.map(l => ({ ...l, decision: 'accept', matchItemId: 'sh-seed-x', matchScore: 1 }));
  const client = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(injected) }], model: 'claude-sonnet-5-5' }) } };
  const ex4 = await extractReceipt({ client, mediaType: 'application/pdf', base64: 'JVBERi0=', propertyAddress: 'x', now: '2026-11-07T00:00:00.000Z' });
  assert.equal(ex4.ok, true);
  assert.ok(ex4.extraction.lines.every(l => l.decision === null && l.matchItemId === null && l.matchScore === null));
  ok('decisions and shopping links in the model reply are discarded — every line starts undecided and unlinked');

  // #5 a filed/dismissed record can never be reopened by a (stale) PUT
  assert.equal(RL.inboxTransitionAllowed({ status: 'filed' }, { status: 'extracted' }).ok, false);
  assert.equal(RL.inboxTransitionAllowed({ status: 'dismissed' }, { status: 'extracted' }).ok, false);
  assert.equal(RL.inboxTransitionAllowed({ status: 'filed' }, { status: 'filed' }).ok, true);
  assert.equal(RL.inboxTransitionAllowed({ status: 'extracted' }, { status: 'filed' }).ok, true);
  assert.equal(RL.inboxTransitionAllowed(null, { status: 'pending' }).ok, true);
  assert.equal(RL.inboxTransitionAllowed({ status: 'pending' }, { status: 'extracted' }).ok, true);
  ok('inboxTransitionAllowed: only filed→filed / dismissed→dismissed are allowed once a record is closed');

  // #5b processInboxRecord re-reads before saving: a record filed / dismissed / deleted during the Claude call is not overwritten
  const fixA = JSON.parse(fs.readFileSync(new URL('./fixtures/receipts/minoan-F3F3D4B0.json', import.meta.url), 'utf8'));
  const reply = JSON.stringify(Object.fromEntries(Object.entries(fixA).filter(([k]) => !k.startsWith('_'))));
  const rec = { id: 'ri-1', status: 'pending', receipt: { pathname: 'receipts/pp/inbox/ri-1/r.pdf', name: 'r.pdf', contentType: 'application/pdf', uploadedAt: 'x', hash: 'h' }, extraction: null, error: null, purchaseIds: [] };
  const racing = (mutate) => {
    const hash = { 'ri-1': JSON.stringify(rec) };
    const redis = { hash, hget: async (_k, id) => hash[id] ?? null, hset: async (_k, o) => { Object.assign(hash, o); }, get: async () => null };
    const createClient = () => ({ messages: { create: async () => { mutate(hash); return { stop_reason: 'end_turn', content: [{ type: 'text', text: reply }], model: 'claude-sonnet-5-5' }; } } });
    return { hash, run: () => processInboxRecord({ redis, key: 'receipt-inbox:pp', inboxId: 'ri-1', readBlob: async () => 'JVBERi0=', createClient, apiKey: 'k', user: 'JM', now: '2026-11-07T00:00:00.000Z', propertyId: 'pp', defaultAddress: 'x' }) };
  };
  const f = racing(h => { h['ri-1'] = JSON.stringify({ ...rec, status: 'filed', purchaseIds: ['p1'] }); });
  const fr = await f.run();
  assert.equal(fr.status, 409); assert.equal(JSON.parse(f.hash['ri-1']).status, 'filed'); assert.deepEqual(JSON.parse(f.hash['ri-1']).purchaseIds, ['p1']);
  const d = racing(h => { delete h['ri-1']; });
  const dr = await d.run();
  assert.equal(dr.status, 404); assert.equal(d.hash['ri-1'], undefined);
  const x = racing(h => { h['ri-1'] = JSON.stringify({ ...rec, status: 'dismissed' }); });
  assert.equal((await x.run()).status, 409); assert.equal(JSON.parse(x.hash['ri-1']).status, 'dismissed');
  ok('a record filed, dismissed or deleted while Claude was reading is not overwritten or resurrected by the extraction result');

  // #6 card-number redaction covers real-world layouts but still leaves order numbers alone
  for (const [inp, want] of [
    ['Visa 4111 1111 1111 1111 12/27', 'Visa •••• 12/27'],
    ['4111111111111111-2', '••••-2'],
    ['VISA4111111111111111', 'VISA••••'],
    ['4111.1111.1111.1111', '••••'],
    ['4111 - 1111 - 1111 - 1111', '••••'],
    ['order 113-5550000-1112223', 'order 113-5550000-1112223'],
    ['order 11355500001112223', 'order 11355500001112223'],
  ]) assert.equal(RL.redactCardNumbers(inp), want, inp);
  const money = RL.validateExtraction({ docType: 'receipt', vendor: 'V', lines: [{ description: 'x', qty: 1, lineTotal: 1, suggestedTrade: 'Other', confidence: 0.9 }], total: '4111111111111111', tax: '4111 1111 1111 1111' }).extraction;
  assert.ok(!JSON.stringify(money).includes('4111111111111111'));
  ok('card numbers are redacted with expiry/suffix attached, no word boundary, or odd separators — and a card number in a money field is never stored');

  // a SHA-256 file digest must survive sanitizing untouched (hex digits next to letters can look like a card number)
  const digest = 'a' + '4111111111111111' + 'b'.repeat(47);
  const sres = RL.sanitizeInboxRecord({ id: 'ri-h1', status: 'pending', receipt: { pathname: 'receipts/pp/inbox/ri-h1/f.pdf', name: 'f.pdf', contentType: 'application/pdf', uploadedAt: 'x', hash: digest }, extraction: null, purchaseIds: [] }, { updatedAt: 'x', updatedBy: 'JM' });
  assert.equal(sres.ok, true); assert.equal(sres.record.receipt.hash, digest);
  ok('the receipt file hash (hex digest) is stored exactly as sent, even if its digits look like a card number');

  // #7 partial filing failure must not mark the record filed
  assert.equal(typeof RL.decideFilingOutcome, 'function');
  assert.deepEqual(RL.decideFilingOutcome([true, true, true]), { markFiled: true, failed: 0 });
  assert.deepEqual(RL.decideFilingOutcome([true, false, true]), { markFiled: false, failed: 1 });
  assert.deepEqual(RL.decideFilingOutcome([]), { markFiled: false, failed: 0 });
  ok('decideFilingOutcome: the record is marked filed only when every purchase save succeeded');

  // invoice (e.g. the Amazon case) is paid; only statements/quotes file unconfirmed (spec §3.3 / Phase 1 rule)
  const mkDraft = (docType) => RL.buildPurchasesFromInbox({
    record: { id: 'ri-9', receipt: { pathname: 'receipts/pp/inbox/ri-9/f.pdf', name: 'f.pdf', contentType: 'application/pdf', uploadedAt: 'x' }, extraction: { docType, vendor: 'Amazon', orderNo: '1', lines: [{ lineNo: 1, description: 'a', qty: 1, unitPrice: 10, lineTotal: 10, suggestedTrade: 'Other', decision: 'accept', confidence: 0.9 }], tax: 0, shipping: 0, fees: 0, discounts: 0, total: 10 } },
    order: { purchasedBy: 'JM', paymentMethod: 'Credit card' }, shoppingItems: [], settings: { reimbursableVendors: [] }, propertyInServiceDate: '',
  })[0].paymentConfirmed;
  assert.equal(mkDraft('receipt'), true); assert.equal(mkDraft('invoice'), true);
  assert.equal(mkDraft('statement'), false); assert.equal(mkDraft('quote'), false);
  ok('only statements and quotes file with paymentConfirmed:false — receipts and invoices are treated as paid');
}

console.log('Phase 3 deferred items (all fixed):');
{
  const PL = await import('../src/lib/purchases-logic.js');
  // negative allocation: tiny amount over many lines never leaves a negative share; sums stay exact
  const twelve = Array.from({ length: 12 }, () => ({ lineTotal: 10 }));   // equal lines: every share rounds up, the remainder is negative
  const tiny = RL.allocateOrderCosts(twelve, { tax: 0, shipping: 0.06, fees: 0, discounts: 0 });
  assert.ok(tiny.every(a => a.shipping >= 0), 'no negative shipping share');
  assert.equal(Math.round(tiny.reduce((s, a) => s + a.shipping, 0) * 100), 6);
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let t = 0; t < 3000; t++) {
    const n = 1 + Math.floor(rnd() * 14);
    const lines = Array.from({ length: n }, () => ({ lineTotal: Math.round(rnd() * 5000) / 100 + 0.01 }));
    const amt = Math.round(rnd() * 2000) / 100;
    const out = RL.allocateOrderCosts(lines, { tax: amt, shipping: amt / 3, fees: 0, discounts: amt / 7 });
    for (const k of ['tax', 'shipping', 'discounts']) {
      assert.ok(out.every(a => a[k] >= 0), `${k} share must never be negative`);
    }
    assert.equal(Math.round(out.reduce((s, a) => s + a.tax, 0) * 100), Math.round(amt * 100));
  }
  ok('allocation: the remainder never pushes a line negative (largest-remainder fallback) and every column still sums exactly (3000 random orders)');

  // cross-property blob path
  const mk = (pathname) => ({ id: 'ri-x1', status: 'pending', receipt: { pathname, name: 'f.pdf', contentType: 'application/pdf', uploadedAt: 'x', hash: '' }, extraction: null, purchaseIds: [] });
  assert.equal(RL.sanitizeInboxRecord(mk('receipts/pp/inbox/ri-x1/f.pdf'), {}, 'pp').ok, true);
  assert.equal(RL.sanitizeInboxRecord(mk('receipts/other/inbox/ri-x1/f.pdf'), {}, 'pp').ok, false);
  assert.equal(RL.sanitizeInboxRecord(mk('receipts/other/inbox/ri-x1/f.pdf'), {}).ok, true);   // no property given → shape check only (unit-level use)
  const rin = fs.readFileSync(new URL('../api/receipt-inbox.js', import.meta.url), 'utf8');
  assert.ok(/sanitizeInboxRecord\(req\.body,[\s\S]*?\},\s*property\)/.test(rin), 'the route must pass ?property= to the sanitizer');
  ok('an inbox record whose blob path belongs to another property is rejected (and the route passes ?property= in)');

  // re-link only fills lines that were never matched
  const lines = [{ matchItemId: null, matchScore: 0.2 }, { matchItemId: null, matchScore: null }, { matchItemId: 'a', matchScore: 1 }];
  const matched = RL.applyMatches(lines, [{ matchItemId: 'x', matchScore: 0.9 }, { matchItemId: 'y', matchScore: 0.8 }, { matchItemId: 'z', matchScore: 0.7 }]);
  assert.deepEqual(matched.map(l => [l.matchItemId, l.matchScore]), [[null, 0.2], ['y', 0.8], ['a', 1]]);
  ok('matching fills only never-matched lines — a line the reviewer unlinked stays unlinked, existing links stay');

  // function duration
  const vj = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(vj.functions && vj.functions['api/receipt-extract.js'] && vj.functions['api/receipt-extract.js'].maxDuration >= 240);
  ok('vercel.json gives receipt-extract a maxDuration that covers 2 SDK attempts of 120 s');

  // an extraction too big to store lands as needs-manual instead of poisoning later PUTs
  const bigLines = Array.from({ length: 700 }, (_, i) => ({ description: 'Item number ' + i + ' ' + 'x'.repeat(120), qty: 1, unitPrice: 1, lineTotal: 1, suggestedTrade: 'Other', confidence: 0.9 }));
  const bigReply = JSON.stringify({ docType: 'receipt', vendor: 'Big Co', lines: bigLines, total: 700 });
  const hash = { 'ri-1': JSON.stringify({ id: 'ri-1', status: 'pending', receipt: { pathname: 'receipts/pp/inbox/ri-1/r.pdf', name: 'r.pdf', contentType: 'application/pdf', uploadedAt: 'x', hash: '' }, extraction: null, error: null, purchaseIds: [] }) };
  const redisBig = { hget: async (_k, id) => hash[id] ?? null, hset: async (_k, o) => { Object.assign(hash, o); }, get: async () => null };
  const bigRes = await processInboxRecord({ redis: redisBig, key: 'k', inboxId: 'ri-1', readBlob: async () => 'JVBERi0=', createClient: () => ({ messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: bigReply }], model: 'claude-sonnet-5-5' }) } }), apiKey: 'k', user: 'JM', now: '2026-11-07T00:00:00.000Z', propertyId: 'pp', defaultAddress: 'x' });
  assert.equal(bigRes.status, 200); assert.equal(bigRes.body.record.status, 'needs-manual'); assert.match(bigRes.body.record.error, /too (long|large|many)/i);
  assert.equal(JSON.parse(hash['ri-1']).extraction, null);
  ok('an extraction too large to store is saved as needs-manual with a readable reason (never stored in a state later saves would reject)');

  // JSON after a prose brace
  const fixA2 = JSON.parse(fs.readFileSync(new URL('./fixtures/receipts/minoan-F3F3D4B0.json', import.meta.url), 'utf8'));
  const clean = Object.fromEntries(Object.entries(fixA2).filter(([k]) => !k.startsWith('_')));
  const proseClient = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Note: fields in {braces} are optional.\nHere you go:\n' + JSON.stringify(clean) }], model: 'claude-sonnet-5-5' }) } };
  const pr = await extractReceipt({ client: proseClient, mediaType: 'application/pdf', base64: 'JVBERi0=', propertyAddress: 'x', now: '2026-11-07T00:00:00.000Z' });
  assert.equal(pr.ok, true); assert.equal(pr.extraction.lines.length, 6);
  ok('JSON is found even when the reply has an earlier balanced {…} in its prose');

  // card redaction refinements
  assert.equal(RL.redactCardNumbers('Total 12.50 4111111111111111'), 'Total 12.50 ••••');
  assert.equal(RL.redactCardNumbers('Total $1,234.50 4111 1111 1111 1111 ok'), 'Total $1,234.50 •••• ok');
  let ean = null; for (let n = 9780000000001; n < 9780000000200 && !ean; n++) { const d = String(n); let sum = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let v = +d[i]; if (alt) { v *= 2; if (v > 9) v -= 9; } sum += v; alt = !alt; } if (sum % 10 === 0) ean = d; }
  assert.ok(ean, 'found a Luhn-passing 13-digit number starting with 9');
  assert.equal(RL.redactCardNumbers(`GTIN ${ean} end`), `GTIN ${ean} end`);
  for (const card of ['5500005555555559', '378282246310005', '30569309025904', '6011111111111117', '3530111333300000', '4222222222222']) assert.equal(RL.redactCardNumbers(`c ${card} e`), 'c •••• e', card);
  assert.equal(RL.redactCardNumbers('order 113-5550000-1112223'), 'order 113-5550000-1112223');
  ok('card redaction: a card after a money amount is caught; 13-digit barcodes (not card-prefixed) and order numbers are left alone; all major card prefixes still redact');

  // discount as a real field + a penny-tolerant "use total" suggestion
  assert.equal(PL.emptyPurchase().discount, null);
  assert.equal(PL.purchaseComputedTotal({ qty: 22, unitPrice: 442.3636, tax: 0, shipping: 0, fees: 0 }), 9732);
  assert.equal(PL.purchaseComputedTotal({ qty: 2, unitPrice: 10, tax: 1, shipping: 2, fees: 0.5, discount: 3 }), 20.5);
  assert.equal(PL.totalSuggestionNeeded({ qty: 22, unitPrice: 442.3636, totalPaid: 9731.99 }), false);
  assert.equal(PL.totalSuggestionNeeded({ qty: 2, unitPrice: 10, totalPaid: 25 }), true);
  assert.equal(PL.totalSuggestionNeeded({ qty: 0, unitPrice: 0, totalPaid: 25 }), false);
  const dr = RL.buildPurchasesFromInbox({
    record: { id: 'ri-9', receipt: { pathname: 'receipts/pp/inbox/ri-9/f.pdf', name: 'f.pdf', contentType: 'application/pdf', uploadedAt: 'x' }, extraction: { docType: 'receipt', vendor: 'V', orderNo: '1', lines: [{ lineNo: 1, description: 'a', qty: 1, unitPrice: 100, lineTotal: 100, suggestedTrade: 'Other', decision: 'accept', confidence: 0.9 }], tax: 0, shipping: 0, fees: 0, discounts: 10, total: 90 } },
    order: { purchasedBy: 'JM', paymentMethod: 'Credit card' }, shoppingItems: [], settings: { reimbursableVendors: [] }, propertyInServiceDate: '',
  })[0];
  assert.equal(dr.discount, 10); assert.equal(dr.totalPaid, 90);
  assert.equal(PL.totalSuggestionNeeded(dr), false);
  ok('the order discount share is stored in a real `discount` field, the form total accounts for it, and a one-cent rounding gap no longer triggers "use $…"');
}

console.log('Phase 3 second Opus review (all fixed):');
{
  // negative order discount: normalized to a positive amount, flagged, and Accept all stays off
  const neg = RL.validateExtraction({ docType: 'receipt', vendor: 'V', lines: [{ description: 'a', qty: 1, lineTotal: 100, suggestedTrade: 'Other', confidence: 0.9 }, { description: 'b', qty: 1, lineTotal: 50, suggestedTrade: 'Other', confidence: 0.9 }], tax: 9, discounts: -10, total: 149 }).extraction;
  assert.equal(neg.discounts, 10);
  assert.ok(neg.issues.some(i => /discount/i.test(i)));
  assert.equal(RL.canAcceptAll(neg), false);
  assert.equal(neg.reconciles, true);
  const pos = RL.validateExtraction({ docType: 'receipt', vendor: 'V', lines: [{ description: 'a', qty: 1, lineTotal: 100, suggestedTrade: 'Other', confidence: 0.9 }], discounts: 10, total: 90 }).extraction;
  assert.equal(pos.discounts, 10); assert.ok(!pos.issues.some(i => /discount/i.test(i)));
  assert.ok(buildExtractionPrompt({ propertyAddress: 'x' }).toLowerCase().includes('positive number'));
  ok('a discount printed as a negative number is stored positive and flagged (Accept all off); the prompt asks for positive amounts');

  // blank payment method chosen on purpose is respected; untouched (null/undefined) falls back to the suggestion
  const base = (pm) => RL.buildPurchasesFromInbox({
    record: { id: 'ri-9', receipt: { pathname: 'receipts/pp/inbox/ri-9/f.pdf', name: 'f.pdf', contentType: 'application/pdf', uploadedAt: 'x' }, extraction: { docType: 'receipt', vendor: 'V', paymentMethod: 'Visa ending 1234', orderNo: '1', lines: [{ lineNo: 1, description: 'a', qty: 1, unitPrice: 10, lineTotal: 10, suggestedTrade: 'Other', decision: 'accept', confidence: 0.9 }], tax: 0, shipping: 0, fees: 0, discounts: 0, total: 10 } },
    order: { purchasedBy: 'JM', paymentMethod: pm }, shoppingItems: [], settings: { reimbursableVendors: [] }, propertyInServiceDate: '',
  })[0].paymentMethod;
  assert.equal(base(''), '');
  assert.equal(base(undefined), RL.suggestPaymentMethod('Visa ending 1234'));
  assert.equal(base(null), RL.suggestPaymentMethod('Visa ending 1234'));
  ok('a payment method deliberately left blank files blank; only an untouched one uses the suggestion');

  // card redaction: grouping-aware
  for (const [inp, want] of [
    ['Line 3 4111 1111 1111 1111', 'Line 3 ••••'],
    ['x2 4111111111111111', 'x2 ••••'],
    ['$12 4111 1111 1111 1111', '$12 ••••'],
    ['Paid 2026-11-07 4111 1111 1111 1111', 'Paid 2026-11-07 ••••'],
    ['Visa 4111 1111 1111 1111 end', 'Visa •••• end'],
    ['Visa 4111\t1111\t1111\t1111 end', 'Visa •••• end'],
    ['Amex 3782 822463 10005 end', 'Amex •••• end'],
    ['Visa 4111 1111 1111 1111 12/27', 'Visa •••• 12/27'],
    ['Total 12.50 4111111111111111', 'Total 12.50 ••••'],
  ]) assert.equal(RL.redactCardNumbers(inp), want, inp);
  // ordinary text must never be redacted, whatever its Luhn luck: phone/zip strings, date ranges, order numbers
  const lcg = (() => { let x = 11; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  for (let i = 0; i < 4000; i++) {
    const zip = String(30000 + Math.floor(lcg() * 60000));
    const ph = `${900 + Math.floor(lcg() * 99)}-${700 + Math.floor(lcg() * 99)}-${String(1000 + Math.floor(lcg() * 8999))}`;
    const t1 = `FL ${zip} ${ph}`, t2 = `2026-0${1 + Math.floor(lcg() * 9)}-20 - 2026-12-${10 + Math.floor(lcg() * 19)}`;
    assert.equal(RL.redactCardNumbers(t1), t1, t1); assert.equal(RL.redactCardNumbers(t2), t2, t2);
  }
  ok('card redaction finds a card after any leading numbers, with NBSP/tab separators, and Amex 4-6-5 grouping — and never redacts zip+phone strings or date ranges (4000 fuzz cases)');

  // order numbers / SKUs are identifiers, not free text: a contiguous Luhn-valid 16-digit one survives; a spaced card in them does not
  const idEx = RL.validateExtraction({ docType: 'receipt', vendor: 'V', orderNo: '5500005555555559', lines: [{ description: 'card 5500005555555559', sku: '5500005555555559', qty: 1, lineTotal: 1, suggestedTrade: 'Other', confidence: 0.9 }], total: 1 }).extraction;
  assert.equal(idEx.orderNo, '5500005555555559'); assert.equal(idEx.lines[0].sku, '5500005555555559');
  assert.equal(idEx.lines[0].description, 'card ••••');
  const spaced = RL.validateExtraction({ docType: 'receipt', vendor: 'V', orderNo: '5500 0055 5555 5559', lines: [{ description: 'x', qty: 1, lineTotal: 1, suggestedTrade: 'Other', confidence: 0.9 }], total: 1 }).extraction;
  assert.ok(!spaced.orderNo.includes('5500 0055'));
  ok('order numbers and SKUs keep contiguous digit strings (even if they look like a card); a card number written with spaces is still removed from them; free text is redacted either way');

  // Phase 4 fix-ups (first live read of a real Minoan receipt)
  const hashEx = RL.validateExtraction({ docType: 'receipt', vendor: 'Minoan', orderNo: '#F088F252', lines: [{ description: 'x', qty: 1, lineTotal: 1, suggestedTrade: 'Other', confidence: 0.9 }], total: 1 }).extraction;
  assert.equal(hashEx.orderNo, 'F088F252');
  assert.equal(RL.validateExtraction({ docType: 'receipt', vendor: 'M', orderNo: ' ## F1 ', lines: [{ description: 'x', qty: 1, lineTotal: 1, suggestedTrade: 'Other', confidence: 0.9 }], total: 1 }).extraction.orderNo, 'F1');
  assert.equal(RL.validateExtraction({ docType: 'receipt', vendor: 'M', orderNo: '#', lines: [{ description: 'x', qty: 1, lineTotal: 1, suggestedTrade: 'Other', confidence: 0.9 }], total: 1 }).extraction.orderNo, null);
  ok('a leading # on the order number is dropped (the card adds its own #, so it showed "##F088F252"; duplicate checks now match with or without it)');

  const promptText = buildExtractionPrompt({ propertyAddress: '6401 Broward Street, St. Augustine, FL 32080' });
  const rule6 = promptText.split('\n').find(l => l.startsWith('6.')) || '';
  assert.ok(!/address/i.test(rule6), 'rule 6 must not ask the model to report address differences: the app checks the address itself');
  assert.ok(/ship-to/i.test(promptText) && /exactly as printed/i.test(promptText));
  assert.ok(/ONLY .*reviewer.*(fix|confirm|decide)/i.test(promptText) && /do not list/i.test(promptText), 'issues is reserved for things the reviewer must act on');
  ok('the prompt no longer asks the model to flag address differences (the app does that, warn-only) and reserves "issues" for things the reviewer must act on, so a clean receipt can use Accept all');

  // Shopping pickers are alphabetical
  const cats = SH.sortedShoppingCategories();
  assert.deepEqual([...cats].sort(), [...SH.SHOPPING_CATEGORIES].sort(), 'same categories, only reordered');
  assert.equal(cats[cats.length - 1], 'Other');
  const rest = cats.slice(0, -1);
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  const picked = SH.sortItemsAlpha([{ id: '1', name: 'wine glasses' }, { id: '2', name: 'Air fryer' }, { id: '3', name: 'Bath towels' }, { id: '4', name: null }, null]);
  assert.deepEqual(picked.map(i => i.id), ['2', '3', '1', '4']);
  const orig = [{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }];
  SH.sortItemsAlpha(orig); assert.equal(orig[0].id, 'b', 'never reorders the caller\'s array');
  ok('the Shopping item picker and the category lists sort A–Z (case-insensitive, "Other" last for categories) without touching the stored order');

  // Changing "Paid by" on a saved purchase keeps the reimbursement in step
  const PLg = await import('../src/lib/purchases-logic.js');
  const sparrowPaid = { vendor: 'Minoan', purchasedBy: 'Sparrow (Contractor)', reimbursable: false, reimbursedBy: '', reimbursementStatus: 'none', drawNo: '' };
  assert.deepEqual(PLg.payerChangePatch(sparrowPaid, 'Josh', ['Minoan']), { reimbursable: true, reimbursedBy: 'Sparrow (Contractor)', reimbursementStatus: 'pending' });
  assert.deepEqual(PLg.payerChangePatch(sparrowPaid, 'Kerry', ['Minoan']), { reimbursable: true, reimbursedBy: 'Sparrow (Contractor)', reimbursementStatus: 'pending' });
  assert.deepEqual(PLg.payerChangePatch({ ...sparrowPaid, vendor: 'Amazon' }, 'Josh', ['Minoan']), {}, 'a vendor Sparrow does not reimburse stays as is');
  const owed = { ...sparrowPaid, purchasedBy: 'Josh', reimbursable: true, reimbursedBy: 'Sparrow (Contractor)', reimbursementStatus: 'requested', drawNo: '3' };
  assert.deepEqual(PLg.payerChangePatch(owed, 'Kerry', ['Minoan']), {}, 'never overwrites reimbursement progress');
  const ownerNo = { ...owed, purchasedBy: 'Josh', reimbursable: false, reimbursedBy: '', reimbursementStatus: 'none', drawNo: '' };
  assert.deepEqual(PLg.payerChangePatch(ownerNo, 'Kerry', ['Minoan']), {}, 'owner → owner never re-applies a deliberate "not reimbursable"');
  assert.deepEqual(PLg.payerChangePatch(ownerNo, '', ['Minoan']), {}, 'owner → blank neither');
  assert.deepEqual(PLg.payerChangePatch(owed, 'Sparrow (Contractor)', ['Minoan']), { reimbursable: false, reimbursedBy: '', reimbursementStatus: 'none' }, 'choosing Sparrow as payer clears it (existing rule)');
  ok('moving a saved Minoan purchase from Sparrow-paid to Josh/Kerry-paid turns on "Due from Sparrow" (pending); existing reimbursement progress is never overwritten; Sparrow as payer still clears it');

  // Receipt lines carry BOTH a Purchase trade and a Shopping category, and every bought item lands on the Shopping list
  const tl = RL.validateExtraction({ docType: 'receipt', vendor: 'V', lines: [{ description: 'Bed', qty: 1, lineTotal: 10, suggestedTrade: 'Furniture / FF&E', suggestedCategory: 'Furniture', confidence: 0.9 }, { description: 'Mug', qty: 1, lineTotal: 5, suggestedTrade: 'Other', addToShopping: false, confidence: 0.9 }], total: 15 }).extraction;
  assert.equal(tl.lines[0].addToShopping, true, 'default: add to the Shopping list');
  assert.equal(tl.lines[1].addToShopping, false, 'a reviewer opt-out survives a save');
  const mclient = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ docType: 'receipt', vendor: 'V', lines: [{ description: 'Bed', qty: 1, lineTotal: 10, suggestedTrade: 'Furniture / FF&E', suggestedCategory: 'Furniture', addToShopping: false, confidence: 0.9 }], total: 10 }) }], model: 'claude-sonnet-5-5' }) } };
  const mex = await extractReceipt({ client: mclient, mediaType: 'application/pdf', base64: 'JVBERi0=', propertyAddress: 'x', now: '2026-11-07T00:00:00.000Z' });
  assert.equal(mex.extraction.lines[0].addToShopping, true, 'the model cannot opt a line out');

  // changing the Shopping category carries the Purchase trade along only while the trade was still following it
  assert.deepEqual(RL.categoryChangePatch({ suggestedCategory: 'Other', suggestedTrade: 'Other' }, 'Furniture'), { suggestedCategory: 'Furniture', suggestedTrade: 'Furniture / FF&E' });
  assert.deepEqual(RL.categoryChangePatch({ suggestedCategory: 'Dinnerware', suggestedTrade: 'Kitchen & Dining' }, 'Bath'), { suggestedCategory: 'Bath', suggestedTrade: 'Linens & Soft Goods' });
  assert.deepEqual(RL.categoryChangePatch({ suggestedCategory: 'Dinnerware', suggestedTrade: 'Plumbing' }, 'Bath'), { suggestedCategory: 'Bath' }, 'a hand-picked trade is never overridden');
  ok('a line has both a Shopping category and a Purchase trade; the category drives the trade only while the trade was still following it; the model cannot opt a line out of the Shopping list');

  const bedRec = { id: 'ri-b', receipt: { pathname: 'receipts/pp/inbox/ri-b/f.pdf', name: 'f.pdf', contentType: 'application/pdf', uploadedAt: 'x' }, extraction: { docType: 'receipt', vendor: 'Minoan', orderNo: 'F1', paidDate: '2026-10-26', lines: [
    { lineNo: 1, description: 'Dunphy Upholstered Platform Bed', sourceVendor: 'Wayfair', sku: 'W1', qty: 1, unitPrice: 196.87, lineTotal: 196.87, roomHint: 'Bedroom 2', suggestedTrade: 'Furniture / FF&E', suggestedCategory: 'Furniture', decision: 'accept', addToShopping: true, matchItemId: null, confidence: 0.9 },
    { lineNo: 2, description: 'Air fryer', sourceVendor: null, sku: null, qty: 1, unitPrice: 50, lineTotal: 50, suggestedTrade: 'Small Appliances', suggestedCategory: 'Small Appliances', decision: 'accept', addToShopping: true, matchItemId: 'sh-seed-air', confidence: 0.9 },
    { lineNo: 3, description: 'Pillow', qty: 2, unitPrice: 10, lineTotal: 20, suggestedTrade: 'Linens & Soft Goods', suggestedCategory: 'Linens & Towels', decision: 'accept', addToShopping: false, matchItemId: null, confidence: 0.9 },
    { lineNo: 4, description: 'Skipped thing', qty: 1, unitPrice: 5, lineTotal: 5, suggestedTrade: 'Other', suggestedCategory: 'Other', decision: 'skip', addToShopping: true, matchItemId: null, confidence: 0.9 },
  ], tax: 0, shipping: 0, fees: 0, discounts: 0, total: 271.87 } };
  const bedItems = [{ id: 'sh-seed-air', name: 'Large air fryer', category: 'Small Appliances', candidates: [], purchaseIds: [] }];
  const bedDrafts = RL.buildPurchasesFromInbox({ record: bedRec, order: { purchasedBy: 'Josh' }, shoppingItems: bedItems, settings: { reimbursableVendors: ['Minoan'] }, propertyInServiceDate: '' });
  const plan = RL.planShoppingFromInbox({ record: bedRec, drafts: bedDrafts, shoppingItems: bedItems, user: 'JM' });
  assert.equal(plan.newItems.length, 1, 'only the unmatched, opted-in, accepted line creates an item');
  const ni = plan.newItems[0];
  assert.equal(ni.name, 'Dunphy Upholstered Platform Bed'); assert.equal(ni.category, 'Furniture'); assert.equal(ni.room, 'Bedroom 2');
  assert.equal(ni.status, 'ordered'); assert.equal(ni.userCreated, true);
  assert.deepEqual(ni.purchaseIds, [bedDrafts[0].id]);
  assert.equal(ni.candidates.length, 1); assert.equal(ni.selectedCandidateId, ni.candidates[0].id);
  assert.equal(ni.candidates[0].vendor, 'Minoan'); assert.equal(ni.candidates[0].sourceVendor, 'Wayfair'); assert.equal(ni.candidates[0].sku, 'W1'); assert.equal(ni.candidates[0].unitPrice, 196.87); assert.equal(ni.candidates[0].qtyToBuy, 1);
  assert.equal(plan.drafts[0].shoppingItemId, ni.id, 'the purchase links back to the new item');
  assert.equal(plan.drafts[1].shoppingItemId, 'sh-seed-air', 'a matched line keeps its link');
  assert.equal(plan.drafts[2].shoppingItemId, null, 'an opted-out line makes no Shopping item');
  assert.equal(bedDrafts[0].shoppingItemId, null, 'the input drafts are not mutated');
  assert.ok(SH.SHOPPING_CATEGORIES.includes(ni.category));
  ok('filing a receipt also puts every unmatched, accepted line on the Shopping list (category, room, vendor/SKU/price, ordered, linked both ways); matched, opted-out and skipped lines make no new item');

  // Opus review of phase4-fixups
  // pairing by accepted index even when a SKIPPED line comes first
  const skipFirst = { ...bedRec, extraction: { ...bedRec.extraction, lines: [bedRec.extraction.lines[3], ...bedRec.extraction.lines.slice(0, 3)] } };
  const sfDrafts = RL.buildPurchasesFromInbox({ record: skipFirst, order: { purchasedBy: 'Josh' }, shoppingItems: bedItems, settings: { reimbursableVendors: [] }, propertyInServiceDate: '' });
  const sfPlan = RL.planShoppingFromInbox({ record: skipFirst, drafts: sfDrafts, shoppingItems: bedItems, user: 'JM' });
  assert.equal(sfPlan.newItems.length, 1); assert.equal(sfPlan.newItems[0].name, 'Dunphy Upholstered Platform Bed');
  assert.equal(sfPlan.drafts[0].shoppingItemId, sfPlan.newItems[0].id, 'the bed (first ACCEPTED line) links to its new item even though a skipped line precedes it');
  // a matchItemId that no longer resolves (item deleted elsewhere) is treated as unmatched
  const stale = { ...bedRec, extraction: { ...bedRec.extraction, lines: bedRec.extraction.lines.map(l => (l.matchItemId ? { ...l, matchItemId: 'sh-gone' } : l)) } };
  const stDrafts = RL.buildPurchasesFromInbox({ record: stale, order: { purchasedBy: 'Josh' }, shoppingItems: bedItems, settings: { reimbursableVendors: [] }, propertyInServiceDate: '' });
  assert.equal(RL.planShoppingFromInbox({ record: stale, drafts: stDrafts, shoppingItems: bedItems, user: 'JM' }).newItems.length, 2, 'the air fryer line (stale link) and the bed both get items');
  // no duplicates: an existing item with the same SKU or the same name is linked instead
  const existing = [...bedItems, { id: 'sh-prev-bed', name: 'dunphy upholstered platform bed', category: 'Furniture', candidates: [{ id: 'c1', sku: 'X-9' }], purchaseIds: [] }, { id: 'sh-prev-sku', name: 'Different name', category: 'Other', candidates: [{ id: 'c2', sku: 'w1' }], purchaseIds: [] }];
  const dupPlan = RL.planShoppingFromInbox({ record: bedRec, drafts: bedDrafts, shoppingItems: existing, user: 'JM' });
  assert.equal(dupPlan.newItems.length, 0);
  assert.equal(dupPlan.drafts[0].shoppingItemId, 'sh-prev-sku', 'exact SKU match wins');
  const dupName = RL.planShoppingFromInbox({ record: bedRec, drafts: bedDrafts, shoppingItems: [existing[1]], user: 'JM' });
  assert.equal(dupName.newItems.length, 0); assert.equal(dupName.drafts[0].shoppingItemId, 'sh-prev-bed', 'same normalized name links to the existing item');
  // the new item's price reproduces what was paid (tax, shipping, fees, discount carried)
  const payRec = { ...bedRec, extraction: { ...bedRec.extraction, lines: [{ lineNo: 1, description: '  Plates  ', sourceVendor: null, sku: null, qty: 12, unitPrice: 4, lineTotal: 48, suggestedTrade: 'Kitchen & Dining', suggestedCategory: 'Dinnerware', decision: 'accept', addToShopping: true, matchItemId: null, confidence: 0.9 }], tax: 3, shipping: 5, fees: 2, discounts: 1, total: 57 } };
  const payDrafts = RL.buildPurchasesFromInbox({ record: payRec, order: { purchasedBy: 'Josh' }, shoppingItems: [], settings: { reimbursableVendors: [] }, propertyInServiceDate: '' });
  const payItem = RL.planShoppingFromInbox({ record: payRec, drafts: payDrafts, shoppingItems: [], user: 'KM' }).newItems[0];
  assert.equal(payItem.name, 'Plates'); assert.equal(payItem.candidates[0].source, 'KM');
  assert.ok(Math.abs(SH.landedTotal(payItem.candidates[0], { defaultTaxRate: 0.065 }) - payDrafts[0].totalPaid) <= 0.01, 'landed total = what was paid: ' + SH.landedTotal(payItem.candidates[0], { defaultTaxRate: 0.065 }) + ' vs ' + payDrafts[0].totalPaid);
  assert.equal(payItem.candidates[0].openStock, null);
  // the server accepts a created item
  assert.equal(SH.sanitizeShoppingField('item:' + payItem.id, payItem, { updatedAt: 'x', updatedBy: 'JM' }).ok, true);
  // merging two lines keeps an opt-out from EITHER line
  const mg = RL.mergeLines([{ description: 'a', qty: 1, lineTotal: 1, addToShopping: true }, { description: 'b', qty: 1, lineTotal: 1, addToShopping: false }], 1)[0];
  assert.equal(mg.addToShopping, false);
  assert.equal(RL.mergeLines([{ description: 'a', qty: 1, lineTotal: 1, addToShopping: true }, { description: 'b', qty: 1, lineTotal: 1, addToShopping: true }], 1)[0].addToShopping, true);
  ok('Opus review: index pairing survives a skipped first line; a stale link is treated as unmatched; a same-SKU or same-name item is linked, not duplicated; the new item\'s price reproduces what was paid and the server accepts it; merging keeps an opt-out');

  // many lines with no quantity (a closet quote prices each room once) → ONE issue, not one per line
  const mkLine = (qty) => ({ description: 'room', qty, lineTotal: 100, suggestedTrade: 'Other', confidence: 0.9 });
  const qIssues = (qtys) => RL.validateExtraction({ docType: 'statement', vendor: 'V', lines: qtys.map(mkLine), total: 100 * qtys.length }).extraction.issues.filter(i => /quantity/i.test(i));
  assert.deepEqual(qIssues(Array(10).fill(null)), ['Lines 1–10: quantity missing — assumed 1 each']);
  assert.deepEqual(qIssues([null, null, null, 2, null]), ['Lines 1–3, 5: quantity missing — assumed 1 each']);
  assert.deepEqual(qIssues([null, 1, 1, null]), ['Line 1: quantity missing — assumed 1', 'Line 4: quantity missing — assumed 1'], 'one or two lines keep the per-line wording');
  assert.deepEqual(qIssues([1, 1]), []);
  ok('three or more lines without a quantity produce one summarized issue ("Lines 1–10 …"), one or two keep the per-line wording');
}

console.log(`\nAll ${passed} checks passed.`);
