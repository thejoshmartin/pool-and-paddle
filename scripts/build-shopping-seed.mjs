#!/usr/bin/env node
/**
 * Generate src/shopping-seed.json from the spec §2.6 tables (docs/superpowers/specs/
 * 2026-11-07-shopping-receipts-agent-spec.md): dishware/drinkware (indoor + outdoor sets sized so the
 * COMBINED inventory covers a full day for 24 guests with one wash cycle a day), flatware, small
 * appliances, and linen placeholders.
 *
 * Usage: node scripts/build-shopping-seed.mjs
 * Re-run if the tables change. Once the Master List spreadsheet exists, scripts/parse-shopping-list.py
 * regenerates the same file from it instead. Seed ids are stable (`sh-seed-<slug>`), and saved edits
 * always win over the seed (see mergeShopping), so re-seeding never overwrites decisions.
 */
import fs from 'node:fs';
import { emptyShoppingItem, computeQty, DEFAULT_SHOPPING_SETTINGS } from '../src/lib/shopping-logic.js';

const G = (multiplier) => ({ basis: 'guests', multiplier, fixedQty: 0 });
const F = (fixedQty) => ({ basis: 'fixed', multiplier: 1, fixedQty });
const KITCHEN = 'Kitchen';
const SUMMER = 'Summer kitchen';

// [slug, name, category, zone, room, dishType, usesPerGuestPerDay, qtyRule, priority, notes]
const rows = [];
const add = (slug, name, category, zone, room, dishType, uses, rule, priority = 'launch-critical', notes = '') =>
  rows.push({ slug, name, category, zone, room, dishType, uses, rule, priority, notes });

// ── Dishware & drinkware: separate indoor / outdoor items so each zone can be bought on its own ──
const pair = (slug, name, dishType, uses, indoor, outdoor, indoorCat, outdoorCat, indoorNote, outdoorNote) => {
  if (indoor) add(`${slug}-indoor`, `${name} (indoor)`, indoorCat, 'indoor', KITCHEN, dishType, uses, indoor, 'launch-critical', indoorNote);
  if (outdoor) add(`${slug}-outdoor`, `${name} (outdoor)`, outdoorCat, 'outdoor', SUMMER, dishType, uses, outdoor, 'launch-critical', outdoorNote);
};
const OUT_PLATE = 'Premium heavy-gauge melamine; dishwasher-safe, NOT microwave-safe; open stock; coordinates with the indoor set.';
const OUT_GLASS = 'Tritan or similar shatter-resistant, BPA-free; reads as glass; dishwasher-safe; open stock.';
pair('dinner-plates', 'Dinner plates', 'Dinner plates', 2, G(1.5), G(1.25), 'Dinnerware', 'Outdoor / Pool Dining', 'Ceramic, open stock, dishwasher-safe.', OUT_PLATE);
pair('salad-dessert-plates', 'Salad / dessert plates', 'Salad / dessert plates', 2, G(1.5), G(1.25), 'Dinnerware', 'Outdoor / Pool Dining', 'Ceramic, open stock, dishwasher-safe.', OUT_PLATE);
pair('all-purpose-bowls', 'All-purpose bowls', 'All-purpose bowls', 2, G(1.5), G(1.25), 'Dinnerware', 'Outdoor / Pool Dining', 'Ceramic, open stock, dishwasher-safe.', OUT_PLATE);
pair('coffee-mugs', 'Coffee mugs', 'Coffee mugs', 1.25, G(1.5), null, 'Glassware & Drinkware', null, 'Ceramic, dishwasher-safe.', '');
pair('everyday-tumblers', 'Everyday tumblers', 'Everyday tumblers', 2.5, G(1.5), G(2), 'Glassware & Drinkware', 'Outdoor / Pool Dining', 'Glass, open stock, dishwasher-safe.', OUT_GLASS);
pair('wine-glasses', 'Wine glasses (stemless outdoors)', 'Wine glasses', 1.25, G(1.25), G(1.25), 'Glassware & Drinkware', 'Outdoor / Pool Dining', 'Glass, open stock, dishwasher-safe.', OUT_GLASS);
pair('juice-small-glasses', 'Juice / small glasses', 'Juice / small glasses', 1, G(1), null, 'Glassware & Drinkware', null, 'Glass, dishwasher-safe.', '');
pair('kids-cups-with-lids', "Kids' cups with lids", '', null, null, F(12), null, 'Outdoor / Pool Dining', '', 'Shatter-resistant with lids; dishwasher-safe.');
pair('serving-platters', 'Serving platters', '', null, F(6), F(4), 'Serveware & Entertaining', 'Outdoor / Pool Dining', '', OUT_PLATE);
pair('serving-bowls', 'Serving bowls', '', null, F(8), F(4), 'Serveware & Entertaining', 'Outdoor / Pool Dining', '', OUT_PLATE);
pair('serving-utensils', 'Serving utensils', '', null, F(16), F(8), 'Serveware & Entertaining', 'Outdoor / Pool Dining', '', 'Dishwasher-safe.');

// ── Flatware (zone: both; restaurant-grade stainless, bought by the dozen) ──
const FLAT = 'Restaurant-grade stainless; dishwasher-safe; open stock; buy by the dozen.';
add('dinner-forks', 'Dinner forks', 'Flatware', 'both', KITCHEN, 'Dinner forks', 3, G(3), 'launch-critical', FLAT);
add('salad-dessert-forks', 'Salad / dessert forks', 'Flatware', 'both', KITCHEN, 'Salad / dessert forks', 2, G(2), 'launch-critical', FLAT);
add('dinner-knives', 'Dinner knives', 'Flatware', 'both', KITCHEN, 'Dinner knives', 2, G(2), 'launch-critical', FLAT);
add('steak-knives', 'Steak knives', 'Flatware', 'both', KITCHEN, '', null, F(24), 'launch', FLAT);
add('teaspoons', 'Teaspoons', 'Flatware', 'both', KITCHEN, 'Teaspoons', 3, G(3), 'launch-critical', FLAT);
add('soup-dessert-spoons', 'Soup / dessert spoons', 'Flatware', 'both', KITCHEN, 'Soup / dessert spoons', 1.5, G(1.5), 'launch-critical', FLAT);

// ── Small appliances (sized for 24) ──
const appl = (slug, name, zone, qty, why, priority = 'launch') =>
  add(slug, name, 'Small Appliances', zone, zone === 'outdoor' ? SUMMER : KITCHEN, '', null, F(qty), priority, why);
appl('drip-coffee-maker', '12–14 cup programmable drip coffee maker', 'indoor', 2, 'One pot ≈ 6 mugs; mornings for 24 need two running.', 'launch-critical');
appl('single-serve-coffee-machine', 'Single-serve coffee / espresso machine', 'indoor', 1, 'Early risers and decaf.');
appl('electric-kettle', 'Electric kettle', 'indoor', 1, 'Tea, pour-over, oatmeal.');
appl('toaster', '4-slice toaster', 'indoor', 2, 'Breakfast throughput.', 'launch-critical');
appl('electric-griddle', 'Electric griddle (large)', 'indoor', 2, 'Pancakes and eggs for 24 in two batches, not six.', 'launch-critical');
appl('slow-cooker', 'Slow cooker 6–8 qt', 'indoor', 2, 'Group dinners.');
appl('multi-cooker', 'Multi-cooker (pressure / rice)', 'indoor', 1, '');
appl('air-fryer', 'Large air fryer', 'indoor', 1, '');
appl('blender-indoor', 'High-power blender (indoor)', 'indoor', 1, 'One indoor and one outdoor: pool-day drinks stay in the summer kitchen.');
appl('blender-outdoor', 'High-power blender (outdoor)', 'outdoor', 1, 'Pool-day drinks stay in the summer kitchen.');
appl('food-processor', 'Food processor', 'indoor', 1, '');
appl('hand-mixer', 'Hand mixer', 'indoor', 1, '');
appl('ice-maker', 'Countertop ice maker', 'outdoor', 1, 'Stopgap only; built-in ice is a Kyle decision.');
appl('drink-dispenser', 'Large drink dispenser / cooler', 'outdoor', 2, '');

// ── Linens: per-bed / per-bathroom rules are Josh's call; seeded as placeholders (qtyOverride 0 = "to set") ──
const PH = 'Quantity per bed / per bathroom — Josh to set (placeholder 0).';
const linen = (slug, name, category, zone, room) => rows.push({ slug, name, category, zone, room, dishType: '', uses: null, rule: F(0), priority: 'launch', notes: PH, placeholder: true });
linen('bath-towel-sets', 'Bath towel sets', 'Bath', 'indoor', 'Bathrooms');
linen('bed-linen-sets', 'Bed linen sets', 'Linens & Towels', 'indoor', 'Bedrooms');
linen('pool-towels', 'Pool towels', 'Linens & Towels', 'outdoor', 'Pool deck');

const items = rows.map(r => {
  const base = emptyShoppingItem();
  const item = {
    ...base,
    id: `sh-seed-${r.slug}`, name: r.name, category: r.category, room: r.room, zone: r.zone,
    dishType: r.dishType, usesPerGuestPerDay: r.uses, qtyRule: r.rule,
    priority: r.priority, notes: r.notes, userCreated: false, updatedAt: null, updatedBy: null,
    qtyOverride: r.placeholder ? 0 : null,
  };
  item.qtyNeeded = computeQty(item, DEFAULT_SHOPPING_SETTINGS);
  return item;
});

const out = new URL('../src/shopping-seed.json', import.meta.url);
fs.writeFileSync(out, JSON.stringify({ generatedFrom: 'spec §2.6 tables (scripts/build-shopping-seed.mjs)', items }, null, 2) + '\n');
console.log(`Wrote ${items.length} seed items to src/shopping-seed.json`);
