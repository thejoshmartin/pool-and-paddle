/**
 * Pool & Paddle — Podcast Episode Fetcher + AI Processor
 *
 * Fetches all episodes from the Thanks for Visiting WordPress API,
 * optionally grabs full transcripts, then processes through Claude.
 *
 * Usage:
 *   node scripts/fetch-episodes.js                              # Phase 1 only
 *   ANTHROPIC_API_KEY=sk-... node scripts/fetch-episodes.js     # Phase 1 + 2
 */

import { writeFileSync, existsSync, readFileSync } from "fs";

const WP_BASE = "https://thanksforvisiting.com/wp-json/wp/v2";
const PER_PAGE = 100; // WP API max
const BATCH_SIZE = 10; // episodes per Claude call
const RAW_FILE = "scripts/raw-episodes.json";
const OUTPUT_FILE = "scripts/processed-episodes.json";

// ─── Phase 1: Fetch from WordPress API ──────────────────────────────────────

async function fetchAllPages(endpoint) {
  const items = [];
  let page = 1;

  // Get total count first
  const headRes = await fetch(`${WP_BASE}/${endpoint}?per_page=1`);
  const total = parseInt(headRes.headers.get("x-wp-total")) || 0;
  const totalPages = Math.ceil(total / PER_PAGE);
  console.log(`  ${endpoint}: ${total} items (${totalPages} pages)`);

  while (page <= totalPages) {
    const url = `${WP_BASE}/${endpoint}?per_page=${PER_PAGE}&page=${page}&orderby=date&order=asc`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  Error on page ${page}: ${res.status}`);
      break;
    }
    const data = await res.json();
    items.push(...data);
    console.log(`  Page ${page}/${totalPages} — ${data.length} items (${items.length} total)`);
    page++;
    await sleep(500);
  }

  return items;
}

function stripHtml(html) {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&[#\w]+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEpNumber(title) {
  const m = title.match(/^(\d+)[\.\:\s]/);
  if (m) return parseInt(m[1]);
  const m2 = title.match(/\(Episode\s+(\d+)\)/i);
  if (m2) return parseInt(m2[1]);
  return null;
}

function cleanTitle(title) {
  return title
    .replace(/^(\d+)[\.\:]\s*/, "")
    .replace(/\s*\(Episode\s+\d+\)\s*$/i, "")
    .trim();
}

async function fetchEpisodeData() {
  console.log("Fetching podcast episodes...\n");
  const podcasts = await fetchAllPages("podcasts");

  console.log("\nFetching transcripts...\n");
  const transcripts = await fetchAllPages("transcript");

  // Index transcripts by episode number
  const transcriptMap = {};
  for (const t of transcripts) {
    const raw = stripHtml(t.title?.rendered || "");
    const epNum = parseEpNumber(raw);
    if (epNum) {
      const content = stripHtml(t.content?.rendered || "");
      // Truncate to first ~2000 chars to keep manageable for Claude
      transcriptMap[epNum] = content.substring(0, 2000);
    }
  }
  console.log(`\nTranscripts indexed: ${Object.keys(transcriptMap).length}`);

  // Build combined episode data
  const episodes = [];
  const seen = new Set();

  for (const p of podcasts) {
    const rawTitle = stripHtml(p.title?.rendered || "");
    const epNum = parseEpNumber(rawTitle);
    const title = cleanTitle(rawTitle);
    const description = stripHtml(p.content?.rendered || "");
    const date = p.date || "";

    if (epNum && seen.has(epNum)) continue;
    if (epNum) seen.add(epNum);

    episodes.push({
      ep: epNum,
      title,
      date,
      description: description.substring(0, 1500),
      transcript: transcriptMap[epNum] || null,
      hasTranscript: !!transcriptMap[epNum],
    });
  }

  episodes.sort((a, b) => (a.ep || 9999) - (b.ep || 9999));
  return episodes;
}

// ─── Phase 2: Process with Claude ───────────────────────────────────────────

async function processWithClaude(episodes) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const results = [];
  const totalBatches = Math.ceil(episodes.length / BATCH_SIZE);

  for (let i = 0; i < episodes.length; i += BATCH_SIZE) {
    const batch = episodes.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`  Batch ${batchNum}/${totalBatches}...`);

    const episodeList = batch.map(ep => {
      let text = `EP ${ep.ep || "??"}: "${ep.title}"\nDate: ${ep.date}`;
      if (ep.description) text += `\nDescription: ${ep.description}`;
      if (ep.transcript) text += `\nTranscript excerpt: ${ep.transcript}`;
      return text;
    }).join("\n\n---\n\n");

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `You are analyzing episodes of the "Thanks for Visiting" podcast about short-term rental (STR) hosting by Annette Grant & Sarah Karakaian.

For each episode below, produce a JSON object with these fields:
- ep: episode number (integer, or null if unknown)
- title: episode title (clean, no number prefix)
- category: one of: "Getting Started", "Pricing & Revenue", "Furnishing & Design", "Guest Experience", "Operations", "Technology", "Marketing", "Legal & Compliance", "Industry Trends"
- priority: "critical" | "high" | "medium" | "low" — how essential for a new luxury STR host launching a pool & paddle sports property
- tags: array of 3-8 lowercase keyword tags
- summary: 2-3 sentence actionable summary
- keyInsight: single sentence — the most important takeaway
- isGimmick: boolean — true only if the advice is gimmicky or low-value

Return ONLY a valid JSON array. No markdown fences, no explanation.

Episodes:

${episodeList}`
      }]
    });

    const text = response.content[0].text;
    try {
      const parsed = JSON.parse(text);
      results.push(...parsed);
      console.log(`    ok — ${parsed.length} episodes`);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const recovered = JSON.parse(match[0]);
          results.push(...recovered);
          console.log(`    recovered — ${recovered.length} episodes`);
        } catch {
          console.error(`    FAILED batch ${batchNum}`);
        }
      } else {
        console.error(`    FAILED batch ${batchNum} (no JSON)`);
      }
    }

    await sleep(2000);
  }

  return results;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  let episodes;

  if (existsSync(RAW_FILE)) {
    console.log(`Found cached ${RAW_FILE} — delete to re-fetch.\n`);
    episodes = JSON.parse(readFileSync(RAW_FILE, "utf-8"));
  } else {
    console.log("Phase 1: Fetching from WordPress API...\n");
    episodes = await fetchEpisodeData();
    writeFileSync(RAW_FILE, JSON.stringify(episodes, null, 2));
    console.log(`\nSaved to ${RAW_FILE}`);
  }

  const numbered = episodes.filter(e => e.ep);
  const withTranscript = episodes.filter(e => e.hasTranscript);
  console.log(`\nTotal episodes: ${episodes.length}`);
  console.log(`With episode numbers: ${numbered.length}`);
  console.log(`With transcripts: ${withTranscript.length}`);
  if (numbered.length) {
    console.log(`Range: EP ${numbered[0].ep} – EP ${numbered[numbered.length - 1].ep}\n`);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("────────────────────────────────────────");
    console.log("Phase 1 complete. To process with Claude:\n");
    console.log("  ANTHROPIC_API_KEY=sk-ant-... node scripts/fetch-episodes.js\n");
    console.log(`Estimated: ~${Math.ceil(numbered.length / BATCH_SIZE)} API calls (~$2-5 for Sonnet)`);
    console.log("────────────────────────────────────────");
    return;
  }

  // Load already-processed episodes to avoid re-processing
  let existing = [];
  const alreadyProcessed = new Set();
  if (existsSync(OUTPUT_FILE)) {
    existing = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
    existing.forEach(ep => alreadyProcessed.add(ep.ep));
    console.log(`Found ${existing.length} already-processed episodes in ${OUTPUT_FILE}`);
  }

  const toProcess = episodes.filter(e => e.ep && !alreadyProcessed.has(e.ep));

  if (toProcess.length === 0) {
    console.log("All episodes already processed — nothing to do.");
    console.log(`${existing.length} episodes in ${OUTPUT_FILE}`);
    return;
  }

  console.log(`Phase 2: Processing ${toProcess.length} new episodes with Claude...\n`);
  const rawProcessed = await processWithClaude(toProcess);

  // Stamp new episodes with processedDate so they can be identified as recent additions
  const today = new Date().toISOString().split("T")[0];
  const processed = rawProcessed.map(ep => ({ ...ep, processedDate: today }));

  // Merge new results with existing
  const allProcessed = [...existing, ...processed];
  const seen = new Set();
  const final = allProcessed
    .filter(ep => {
      if (!ep.ep || seen.has(ep.ep)) return false;
      seen.add(ep.ep);
      return true;
    })
    .sort((a, b) => a.ep - b.ep)
    .map((ep, i) => ({
      id: i + 1,
      ...ep,
      source: ep.source || `https://thanksforvisiting.com/podcasts/${ep.ep}/`,
    }));

  writeFileSync(OUTPUT_FILE, JSON.stringify(final, null, 2));
  console.log(`\nDone! ${final.length} total episodes saved to ${OUTPUT_FILE}`);
  console.log(`  (${processed.length} new + ${existing.length} existing)`);
  console.log("Next: replace PODCAST_DATABASE in src/App.jsx with this data.");
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
