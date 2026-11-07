#!/usr/bin/env node
/**
 * Manual check of the REAL receipt extraction on a local file — the same prompt, model and validation the Receipt Inbox uses
 * (api/_extract.js). Not part of `npm test` (it calls the Anthropic API and costs a few cents per receipt).
 *
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/try-extraction.mjs path/to/receipt.pdf|.jpg|.png [--json]
 *
 * Prints the vendor, doc type, lines (with trade / confidence), the order-level amounts, whether the totals reconcile, the
 * model's `issues`, and how the cost would be allocated across lines. Use it on real receipts before relying on the inbox.
 */
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { extractReceipt } from '../api/_extract.js';
import { allocateOrderCosts, EXTRACTION_MODEL } from '../src/lib/receipt-logic.js';

const file = process.argv[2];
const asJson = process.argv.includes('--json');
const TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

if (!file) { console.error('usage: node scripts/try-extraction.mjs <receipt.pdf|jpg|png> [--json]'); process.exit(2); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set. Run:  ANTHROPIC_API_KEY=sk-ant-... node scripts/try-extraction.mjs <file>'); process.exit(2); }
const mediaType = TYPES[path.extname(file).toLowerCase()];
if (!mediaType) { console.error(`Unsupported file type "${path.extname(file)}" (use pdf, jpg, png, webp or gif).`); process.exit(2); }
if (!fs.existsSync(file)) { console.error(`File not found: ${file}`); process.exit(2); }
const bytes = fs.readFileSync(file);
if (bytes.length > 2.5 * 1024 * 1024) console.error(`Note: this file is ${(bytes.length / 1048576).toFixed(1)} MB; the app caps uploads at about 2.5 MB.`);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120000, maxRetries: 1 });
console.error(`Reading ${path.basename(file)} with ${EXTRACTION_MODEL}…`);
const r = await extractReceipt({ client, mediaType, base64: bytes.toString('base64'), propertyAddress: '6401 Broward St, St. Augustine, FL 32080', now: new Date().toISOString() });
if (!r.ok) { console.error(`FAILED: ${r.error}`); process.exit(1); }
const ex = r.extraction;
if (asJson) { console.log(JSON.stringify(ex, null, 2)); process.exit(0); }

const money = (n) => (n == null ? '—' : n.toFixed(2));
console.log(`\n${ex.vendor || '(vendor?)'} · ${ex.docType}${ex.orderNo ? ` · #${ex.orderNo}` : ''}${ex.handwritten ? ' · HANDWRITTEN' : ''}`);
console.log(`dates: order ${ex.orderDate || '—'} / paid ${ex.paidDate || '—'}   payment: ${ex.paymentMethod || '—'}${ex.cardLast4 ? ` (card ending ${ex.cardLast4})` : ''}`);
console.log(`ship to: ${ex.shipTo || '—'}`);
const alloc = allocateOrderCosts(ex.lines, ex);
console.log('\n #  qty  line total  alloc total  trade                    conf  description');
ex.lines.forEach((l, i) => console.log(`${String(l.lineNo).padStart(2)}  ${String(l.qty).padStart(3)}  ${money(l.lineTotal).padStart(10)}  ${money(alloc[i].totalPaid).padStart(11)}  ${l.suggestedTrade.padEnd(24)} ${String(Math.round(l.confidence * 100)).padStart(3)}%  ${l.description}${l.sourceVendor ? `  [via ${l.sourceVendor}]` : ''}`));
console.log(`\nsubtotal ${money(ex.subtotal)}  tax ${money(ex.tax)}  shipping ${money(ex.shipping)}  fees ${money(ex.fees)}  discounts ${money(ex.discounts)}  TOTAL ${money(ex.total)}  paid ${money(ex.amountPaid)}`);
console.log(`totals reconcile: ${ex.reconciles ? 'YES' : 'NO'}`);
if (ex.issues.length) { console.log('\nIssues the model flagged (would disable "Accept all"):'); ex.issues.forEach(i => console.log(`  • ${i}`)); }
