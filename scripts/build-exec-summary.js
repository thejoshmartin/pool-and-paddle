/**
 * Pool & Paddle — Executive Brief Rebuilder
 *
 * Regenerates src/executive-summary.json from src/podcast-data.json so the
 * Executive Brief tab stays in sync after new episodes are indexed.
 *
 * Hybrid strategy:
 *   - Deterministic parts are always recomputed: episode counts, per-category
 *     totals, critical/high counts, the tag cloud, dates, and last episode.
 *   - Curated parts (per-category topEpisodes, overall topInsights) are
 *     PRESERVED. We only auto-fold in NEW critical episodes — those whose
 *     processedDate matches the most recent indexing run — and never disturb
 *     existing hand-picked entries.
 *
 * Usage: node scripts/build-exec-summary.js
 */

import { readFileSync, writeFileSync } from "fs";

const POD_FILE = "src/podcast-data.json";
const EX_FILE = "src/executive-summary.json";

const pods = JSON.parse(readFileSync(POD_FILE, "utf-8"));
const ex = JSON.parse(readFileSync(EX_FILE, "utf-8"));

const real = pods.filter(e => typeof e.ep === "number");
const nonGimmick = pods.filter(e => !e.isGimmick);
const today = new Date().toISOString().slice(0, 10);

// ─── Deterministic stats ─────────────────────────────────────────────────────
ex.totalEpisodes = pods.length;
ex.nonGimmickCount = nonGimmick.length;
ex.generatedDate = today;
ex.lastIndexedEpisode = real
  .filter(e => e.ep < 2000) // exclude the special "2026 predictions" entry
  .reduce((m, e) => Math.max(m, e.ep), 0);

const isCritHigh = p => p === "critical" || p === "high";
for (const cat of ex.categories) {
  const inCat = pods.filter(e => e.category === cat.name);
  cat.count = inCat.length;
  cat.criticalHighCount = inCat.filter(e => isCritHigh(e.priority)).length;
}

// ─── Tag cloud (literal tag frequency, top 30, non-gimmick) ──────────────────
const tagCounts = {};
for (const e of nonGimmick) {
  for (const t of e.tags || []) {
    const tag = String(t).toLowerCase();
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }
}
ex.tagCloud = Object.entries(tagCounts)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, 30)
  .map(([tag, count]) => ({ tag, count }));

// ─── Hybrid fold: add new critical episodes from the latest run ──────────────
const latestRun = pods.reduce((m, e) => (e.processedDate && e.processedDate > m ? e.processedDate : m), "");
const newCriticals = pods.filter(
  e => e.priority === "critical" && e.processedDate === latestRun && typeof e.ep === "number"
);

let folded = 0;
for (const e of newCriticals) {
  const cat = ex.categories.find(c => c.name === e.category);
  if (cat && Array.isArray(cat.topEpisodes) && !cat.topEpisodes.some(t => t.ep === e.ep)) {
    cat.topEpisodes.unshift({ ep: e.ep, title: e.title, keyInsight: e.keyInsight, priority: e.priority });
    folded++;
  }
  if (Array.isArray(ex.topInsights) && !ex.topInsights.some(t => String(t.ep) === String(e.ep))) {
    ex.topInsights.unshift({
      ep: String(e.ep), title: e.title, keyInsight: e.keyInsight, category: e.category, priority: e.priority,
    });
  }
}

writeFileSync(EX_FILE, JSON.stringify(ex, null, 2) + "\n");

console.log(
  `Executive Brief rebuilt: ${ex.totalEpisodes} episodes (${ex.nonGimmickCount} analyzed), ` +
  `through Ep ${ex.lastIndexedEpisode}. Latest run ${latestRun || "n/a"} — folded ${folded} new critical episode(s).`
);
