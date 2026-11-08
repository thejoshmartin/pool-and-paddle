// Receipt extraction with Claude (spec §3.3). Not a route (`_`-prefixed). Kept free of Redis/Blob/SDK imports so it can
// be unit-tested with a fake client — `npm test` never calls the real API. The caller passes an Anthropic client.
//
// Model notes (claude-sonnet-5-5): no temperature/top_p/top_k, no forced tool_choice, no prefill and no `thinking`
// parameter are sent (the model defaults to adaptive thinking); the reply is a single user turn answered in plain
// text, which we parse and validate ourselves. Everything the model returns is untrusted input.
import { PURCHASE_TRADES } from '../src/lib/purchases-logic.js';
import { SHOPPING_CATEGORIES } from '../src/lib/shopping-logic.js';
import { validateExtraction, redactCardNumbers, EXTRACTION_MODEL } from '../src/lib/receipt-logic.js';

export function buildExtractionPrompt({ propertyAddress = '', trades = PURCHASE_TRADES, categories = SHOPPING_CATEGORIES } = {}) {
  return `You read receipts, invoices, statements and quotes for a home-building and short-term-rental project, and turn each one into structured JSON that a person will review before anything is recorded. Accuracy matters far more than completeness: a wrong guess silently corrupts financial records, while a null with an explanation costs the reviewer ten seconds.

The property is: ${propertyAddress || '(address not provided)'}.

Return ONLY one JSON object (no prose, no code fence) with exactly these fields:
{
  "docType": "receipt" | "invoice" | "statement" | "quote",
  "vendor": string,            // the merchant of record (Minoan, Amazon, First Coast Closets...)
  "orderNo": string | null, "orderDate": "YYYY-MM-DD" | null, "paidDate": "YYYY-MM-DD" | null,
  "paymentMethod": string | null,   // e.g. "credit card", "check" (never a number)
  "cardLast4": string | null,       // ONLY the last 4 digits, if printed
  "customerName": string | null, "shipTo": string | null,   // copy the ship-to / customer address exactly as printed
  "handwritten": boolean,
  "lines": [ {
      "lineNo": number, "description": string, "sourceVendor": string | null, "sku": string | null,
      "qty": number | null, "retailUnitPrice": number | null, "unitPrice": number | null, "lineTotal": number | null,
      "roomHint": string | null,                  // ONLY when a room/location is printed on the receipt line
      "suggestedTrade": one of the trades below,
      "suggestedCategory": one of the categories below,
      "confidence": number 0..1
  } ],
  "retailTotal": number | null, "subtotal": number | null, "tax": number | null, "shipping": number | null,
  "fees": number | null, "discounts": number | null, "total": number | null, "amountPaid": number | null,
  "issues": [ string ]
}

Rules:
1. suggestedTrade must be exactly one of: ${trades.join('; ')}.
   suggestedCategory must be exactly one of: ${categories.join('; ')}.
   Never output an asset class, a depreciation class or a tax section — those are decided elsewhere.
2. Card numbers: output ONLY the last 4 digits in cardLast4. Never write a full or partial card number anywhere else (not in issues, notes, paymentMethod or descriptions).
3. One line per distinct product. For a marketplace receipt (e.g. Minoan) where each line names the brand that ships it, put that brand in "sourceVendor" and keep "vendor" as the marketplace. unitPrice is what was actually paid per unit; retailUnitPrice is the crossed-out/list price if shown (it is informational only).
4. Report order-level tax, shipping, transaction/processing fees and order-level discounts as SEPARATE fields, each as a POSITIVE number (a discount printed as "-$10.00" is reported as 10 — it is subtracted by the app). Never fold fees into tax or shipping, and never fold them into line prices. If a marketplace's line prices already include its own discount, do not also report that discount in "discounts" (use "discounts" only for a separate order-level discount line that is subtracted from the total).
5. Classify docType. A "Statement" or "Estimate"/"Quote" with no payment shown is not a paid receipt. Set "handwritten": true if the document is handwritten.
6. NEVER resolve an ambiguity by guessing. If a total is blank, if a number could be either a line price or a running/order total, if a quantity has no price, or if handwriting is unclear, set the affected field to null (or keep what is printed) and describe the problem in "issues" in plain words, quoting what you see. Do not do arithmetic to fill in a missing number. Do not invent SKUs, dates or room names.
7. If you are unsure of a line's trade, choose the closest one and lower that line's confidence (below 0.7 when you are guessing between categories).
8. Output numbers as JSON numbers (no currency symbols or thousands separators).
9. "issues" is ONLY for things the reviewer must fix, confirm or decide (a blank or ambiguous number, unclear handwriting, a missing quantity). Do not list things you handled correctly or purely informational notes (for example a discount already reflected in the line prices, a date printed as "Paid on", or a card that is not shown). Do not comment on the ship-to address: copy it exactly as printed and the app compares it with the property. An empty "issues" array is the normal result for a clean receipt.`;
}

// Parse the model's reply: prefer a fenced block, then the whole text, then the first balanced {...} object
// (string/escape aware, so braces inside descriptions don't confuse it). Returns an object or null.
function parseJsonObject(text) {
  const tryParse = (t) => { try { const v = JSON.parse(t); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) { const v = tryParse(fenced[1].trim()); if (v) return v; }
  const whole = tryParse(text.trim());
  if (whole) return whole;
  // Prose before the JSON may itself contain a balanced {…}: try each "{" in turn until one parses to an object.
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') { depth -= 1; if (depth === 0) { const v = tryParse(text.slice(start, i + 1)); if (v) return v; break; } }
    }
  }
  return null;
}

function describeError(e) {
  const status = e && e.status;
  const name = (e && e.name) || '';
  if (status === 401 || status === 403) return 'The server could not authenticate with Anthropic — check that ANTHROPIC_API_KEY is set correctly in Vercel.';
  if (status === 429) return 'Anthropic is busy (rate limited). Wait a minute and press Retry.';
  if (/timeout/i.test(name) || /timed out/i.test((e && e.message) || '')) return 'Reading the receipt timed out. Press Retry (a large or blurry file can take a while).';
  if (status === 413) return 'The file was too large for the extraction service.';
  return redactCardNumbers(`Extraction failed: ${String((e && e.message) || e || 'unknown error')}`).slice(0, 300);
}

// Never throws. Returns { ok: true, extraction } (validated + normalized) or { ok: false, error } (human-readable).
export async function extractReceipt({ client, model = EXTRACTION_MODEL, mediaType, base64, propertyAddress, now }) {
  try {
    const fileBlock = mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
    const resp = await client.messages.create({
      model,
      max_tokens: 16000,
      system: buildExtractionPrompt({ propertyAddress }),
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: 'Read this document and return the JSON object described in your instructions. JSON only.' }] }],
    });
    if (!resp) return { ok: false, error: 'The model returned nothing.' };
    if (resp.stop_reason === 'refusal') {
      const cat = resp.stop_details && resp.stop_details.category;
      return { ok: false, error: `The model declined to read this file${cat ? ` (${cat})` : ''}. Enter the purchase by hand.` };
    }
    if (resp.stop_reason === 'max_tokens') return { ok: false, error: 'The reply was cut off — the document is too long to read in one pass. Try a smaller photo or enter it by hand.' };
    const text = (Array.isArray(resp.content) ? resp.content : []).filter(b => b && b.type === 'text').map(b => b.text).join('\n');
    if (!text.trim()) return { ok: false, error: 'The model returned no text.' };
    const json = parseJsonObject(text);
    if (!json) return { ok: false, error: 'The model did not return valid JSON.' };
    const v = validateExtraction({ ...json, model: resp.model || model }, now);
    if (!v.ok) return { ok: false, error: `The extraction was not usable: ${v.error}` };
    // Review state belongs to the human: whatever the model (or text printed on the receipt) put in decision / matchItemId /
    // matchScore is discarded, so every line starts undecided and unlinked ("Accept all" stays off while issues exist).
    const lines = v.extraction.lines.map(l => ({ ...l, decision: null, matchItemId: null, matchScore: null }));
    return { ok: true, extraction: { ...v.extraction, lines } };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}
