import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import PODCAST_DATABASE from "./podcast-data.json";
import EXEC_SUMMARY from "./executive-summary.json";
import TOOLS_DATA from "./tools-data.json";
import FINISHES_DATA from "./finishes-data.json";
import {
  PURCHASE_TRADES, PURCHASED_BY_OPTIONS, CONTRACTOR_PURCHASER, PAYMENT_METHODS,
  PURCHASE_STATUSES, NOT_IN_ALLOWANCE, ALLOWANCE_CATEGORIES, EXHIBIT_B_TOTAL,
  ASSET_CLASSES, suggestAssetClass, buildCostSegCsv, fmtUSD, emptyPurchase,
  DELIVERED_TO_OPTIONS, REIMBURSEMENT_STATUSES, DOC_TYPES, CONTRACTOR_SCOPE, assetClassLabel,
  defaultAllowanceFor, reimbursementDefaultsFor, payerChangePatch, normalizePurchase, netCost, paymentBadge,
  summarizePurchases, fundingSource, reimbursementsDue, allowanceCredits, allowancePool,
  groupByOrder, newOrderGroupId, returnsClosingSoon, localISODate, daysBetween, statusChangePatch, formDefaultsTouched,
  purchaseComputedTotal, totalSuggestionNeeded,
} from "./lib/purchases-logic.js";
import { matchesFinishSearch, buildRoomCopies, mergeFinishes, finishItemField, furnitureField, roomField, tombstone, BUDGET_FIELD, partitionFinishFields } from "./lib/design-logic.js";
import { HOUSE_INFO_CATEGORIES, emptyHouseInfoItem, matchesHouseInfoSearch, groupHouseInfoByCategory } from "./lib/house-info-logic.js";
import {
  newInboxId, reconciles, matchLines, findDuplicates, addressMatches, mergeLines, canAcceptAll, fileProblems,
  buildPurchasesFromInbox, suggestPaymentMethod, isLowConfidence, applyMatches, acceptUndecided, decideFilingOutcome,
  categoryChangePatch, planShoppingFromInbox,
} from "./lib/receipt-logic.js";
import SHOPPING_SEED from "./shopping-seed.json";
import {
  normalizeShoppingItem, mergeShopping, partitionShoppingFields, shoppingItemField, SHOPPING_SETTINGS_FIELD,
  SHOPPING_CATEGORIES, sortedShoppingCategories, sortItemsAlpha, ITEM_PRIORITIES, ITEM_STATUSES, ZONES, VENDOR_TYPES, AGENT_ACTIONS, TIERS, QTY_BASES,
  NON_GLASS_CATEGORIES, emptyShoppingItem, emptyCandidate, computeQty, mealsCovered, landedTotal, perUnit,
  returnExposure, bestValue, candidateWarnings, forecastSpend, feesFor, taxFor, filterShoppingItems,
  groupShoppingItems, sanitizeShoppingSettings, buildPurchaseFromShopping,
  buildExportBundle, validateResults, mergeResults, buildPrintHtml, priceChangedSinceApproval,
} from "./lib/shopping-logic.js";

// ─── DATA ───────────────────────────────────────────────────────────────────

const TASK_CATEGORIES = [
  { id: "pre-launch", label: "Pre-Launch Business Setup", icon: "🏗️" },
  { id: "legal", label: "Legal & Compliance", icon: "⚖️" },
  { id: "design", label: "Design & Furnishing", icon: "🛋️" },
  { id: "technology", label: "Technology & Tools", icon: "💻" },
  { id: "operations", label: "Operations & Systems", icon: "⚙️" },
  { id: "marketing", label: "Marketing & Listing", icon: "📸" },
  { id: "guest-exp", label: "Guest Experience", icon: "⭐" },
  { id: "pricing", label: "Pricing & Revenue", icon: "💰" },
  { id: "launch", label: "Launch Checklist", icon: "🚀" },
];

const DEFAULT_TASKS = [
  { id: "t1", category: "pre-launch", task: "Set up business entity (LLC recommended)", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [526] },
  { id: "t2", category: "pre-launch", task: "Open dedicated business bank account", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [526] },
  { id: "t3", category: "pre-launch", task: "Build advisory team: CPA, attorney, insurance agent", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [526] },
  { id: "t4", category: "pre-launch", task: "Research local STR regulations and permits", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [519, 521] },
  { id: "t5", category: "pre-launch", task: "Define your guest avatar and positioning (luxury pool & paddle sports)", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [520, 528] },
  { id: "t6", category: "pre-launch", task: "Research comparable properties and their reviews", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [523] },
  { id: "t7", category: "pre-launch", task: "Determine your 'why': revenue, lifestyle, or luxury experience", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [528] },
  { id: "t8", category: "legal", task: "Obtain STR license/permit", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [519] },
  { id: "t9", category: "legal", task: "Get proper STR insurance (not just homeowners)", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [526, 529] },
  { id: "t10", category: "legal", task: "Understand tax obligations and set up collection", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [526, 529] },
  { id: "t11", category: "legal", task: "Review Airbnb's cancellation and host fee policies", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [519, 530] },
  { id: "t12", category: "legal", task: "Draft house rules document", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [524] },
  { id: "t13", category: "design", task: "SPLURGE: Quality mattresses (king preferred for luxury)", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [531] },
  { id: "t14", category: "design", task: "SPLURGE: Hospitality-grade sheets and bedding", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [531] },
  { id: "t15", category: "design", task: "SPLURGE: Quality cookware and full kitchen essentials", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [531] },
  { id: "t16", category: "design", task: "SPLURGE: Durable seating with performance fabrics", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [531] },
  { id: "t17", category: "design", task: "SPLURGE: Quality rugs (properly secured for safety)", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [531] },
  { id: "t18", category: "design", task: "SPLURGE: One intentional 'wow' design moment", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [531] },
  { id: "t19", category: "design", task: "SAVE: Affordable wine glasses/barware (they break)", done: false, priority: "medium", isGimmick: false, notes: "", relatedEps: [531] },
  { id: "t20", category: "design", task: "SAVE: Skip decorative clutter — less is more", done: false, priority: "medium", isGimmick: false, notes: "", relatedEps: [531] },
  { id: "t21", category: "design", task: "Ensure enough place settings for max occupancy + extras", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [531] },
  { id: "t22", category: "technology", task: "Choose and set up PMS (Property Management Software)", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [249] },
  { id: "t23", category: "technology", task: "Implement dynamic pricing tool (PriceLabs/Wheelhouse)", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [249, 530] },
  { id: "t24", category: "technology", task: "Set up Airbnb Professional Hosting Tools and learn metrics", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [537] },
  { id: "t25", category: "technology", task: "Install smart lock for self check-in", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [] },
  { id: "t26", category: "technology", task: "Set up noise monitoring device (e.g., Minut)", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [] },
  { id: "t27", category: "technology", task: "Install exterior security cameras (disclosed)", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [] },
  { id: "t28", category: "operations", task: "Create detailed cleaning checklist with photos", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [518] },
  { id: "t29", category: "operations", task: "Hire and train cleaning team to SOPs", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [518] },
  { id: "t30", category: "operations", task: "Stock cleaning tools for guests (vacuum, broom, plunger, cloths, spray)", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [239] },
  { id: "t31", category: "operations", task: "Create guest welcome guide / digital guidebook", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [] },
  { id: "t32", category: "operations", task: "Set up automated guest messaging templates", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [538] },
  { id: "t33", category: "operations", task: "Build maintenance vendor contact list", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [] },
  { id: "t34", category: "operations", task: "Install refillable toiletry dispensers in every bathroom", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [522] },
  { id: "t35", category: "marketing", task: "Hire professional photographer", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [532] },
  { id: "t36", category: "marketing", task: "Write compelling listing title and description for target guest", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [520, 523] },
  { id: "t37", category: "marketing", task: "Name photos descriptively for SEO", done: false, priority: "low", isGimmick: true, notes: "", relatedEps: [532] },
  { id: "t38", category: "marketing", task: "Set up direct booking website", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [519] },
  { id: "t39", category: "marketing", task: "Create Instagram/social presence for Pool & Paddle", done: false, priority: "medium", isGimmick: false, notes: "", relatedEps: [] },
  { id: "t40", category: "marketing", task: "Optimize listing for AI discovery (rich descriptions, keywords)", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [533] },
  { id: "t41", category: "guest-exp", task: "Curate pool area with luxury towels, sunscreen, and extras", done: false, priority: "critical", isGimmick: false, notes: "This is your differentiator — make Pool & Paddle's pool area unforgettable", relatedEps: [] },
  { id: "t42", category: "guest-exp", task: "Set up paddle sports equipment and storage", done: false, priority: "critical", isGimmick: false, notes: "Core to your brand identity", relatedEps: [] },
  { id: "t43", category: "guest-exp", task: "Create one 'wow' moment guests will photograph and share", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [531, 291] },
  { id: "t44", category: "guest-exp", task: "Develop local area guide with curated recommendations", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [] },
  { id: "t45", category: "guest-exp", task: "Set clear check-in/check-out process", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [] },
  { id: "t46", category: "pricing", task: "Research comp set pricing in your market", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [249, 523] },
  { id: "t47", category: "pricing", task: "Set base rate using dynamic pricing data", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [249, 530] },
  { id: "t48", category: "pricing", task: "Configure holiday and event pricing calendar", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [535] },
  { id: "t49", category: "pricing", task: "Set minimum night stays strategically", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [535] },
  { id: "t50", category: "pricing", task: "Plan slow season strategy (maintenance, photo updates, pricing)", done: false, priority: "medium", isGimmick: false, notes: "", relatedEps: [525] },
  { id: "t51", category: "launch", task: "Do a full test stay yourself (sleep, cook, clean)", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [] },
  { id: "t52", category: "launch", task: "Invite friends/family for feedback stay", done: false, priority: "high", isGimmick: false, notes: "", relatedEps: [] },
  { id: "t53", category: "launch", task: "Go live on Airbnb with launch pricing (slightly below market)", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [249] },
  { id: "t54", category: "launch", task: "Request reviews from first guests", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [] },
  { id: "t55", category: "launch", task: "Monitor metrics weekly (impressions, views, conversion)", done: false, priority: "critical", isGimmick: false, notes: "", relatedEps: [537, 265] },
].map(t => ({ ...t, assignee: null, dueDate: null, completedDate: null, userCreated: false }));

// ─── DESIGN TOKENS ──────────────────────────────────────────────────────────

const C = {
  white: "#FFFFFF",
  offWhite: "#F7FAF8",
  seafoam: "#93E9BE",
  seafoamLight: "#D6F5E6",
  seafoamFaint: "#EDF9F3",
  mint: "#2EAF7B",
  mintDark: "#238C62",
  ocean: "#2D7DD2",
  oceanLight: "#E3EFF9",
  warnText: "#B7791F",   // warning chips / badges
  warnBg: "#FEFCBF",
  dangerText: "#E53E3E",   // destructive / shortfall chips
  dangerBg: "#FED7D7",
  charcoal: "#333333",
  textSecondary: "#666666",
  textMuted: "#999999",
  border: "#E2E8E5",
  borderLight: "#EEF2F0",
  cardBg: "#FFFFFF",
  pageBg: "#F5F8F6",
};

const font = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

const priorityColors = {
  critical: C.ocean,
  high: C.mint,
  medium: C.textSecondary,
  low: C.textMuted,
};

// ─── COMPONENTS ────────────────────────────────────────────────────────────

function getCurrentUser() {
  try {
    const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('pp_user='));
    if (match) {
      const code = match.split('=')[1]?.trim();
      if (code === 'JM') return { code: 'JM', name: 'Josh' };
      if (code === 'KM') return { code: 'KM', name: 'Kerry' };
    }
  } catch (e) { /* local dev or no cookie */ }
  return null;
}

function Header({ activeView, setActiveView, properties = [], activeProperty, onSwitchProperty, onDownloadBackup }) {
  const user = getCurrentUser();
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <header style={{
      background: C.white,
      borderBottom: `1px solid ${C.border}`,
      padding: 0,
      position: "sticky",
      top: 0,
      zIndex: 100,
      boxShadow: "0 1px 8px rgba(0,112,60,0.06)",
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 44,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${C.seafoamFaint}, ${C.seafoamLight})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
              boxShadow: `0 2px 8px rgba(46,175,123,0.15)`,
            }}>
              <svg width="36" height="36" viewBox="10 10 200 130" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g transform="translate(82, 68) rotate(-35)">
                  <rect x="-22" y="-44" width="44" height="52" rx="18" fill="#333333"/>
                  <circle cx="-8" cy="-32" r="2.3" fill="#F5F8F6"/>
                  <circle cx="6" cy="-32" r="2.3" fill="#F5F8F6"/>
                  <circle cx="-12" cy="-20" r="2.3" fill="#F5F8F6"/>
                  <circle cx="0" cy="-20" r="2.3" fill="#F5F8F6"/>
                  <circle cx="12" cy="-20" r="2.3" fill="#F5F8F6"/>
                  <circle cx="-8" cy="-8" r="2.3" fill="#F5F8F6"/>
                  <circle cx="6" cy="-8" r="2.3" fill="#F5F8F6"/>
                  <rect x="-5" y="8" width="10" height="28" rx="3.5" fill="#333333"/>
                  <rect x="-6" y="30" width="12" height="7" rx="2" fill="#2EAF7B"/>
                </g>
                <g transform="translate(138, 68) rotate(35)">
                  <rect x="-22" y="-44" width="44" height="52" rx="18" fill="#333333"/>
                  <circle cx="-8" cy="-32" r="2.3" fill="#F5F8F6"/>
                  <circle cx="6" cy="-32" r="2.3" fill="#F5F8F6"/>
                  <circle cx="-12" cy="-20" r="2.3" fill="#F5F8F6"/>
                  <circle cx="0" cy="-20" r="2.3" fill="#F5F8F6"/>
                  <circle cx="12" cy="-20" r="2.3" fill="#F5F8F6"/>
                  <circle cx="-8" cy="-8" r="2.3" fill="#F5F8F6"/>
                  <circle cx="6" cy="-8" r="2.3" fill="#F5F8F6"/>
                  <rect x="-5" y="8" width="10" height="28" rx="3.5" fill="#333333"/>
                  <rect x="-6" y="30" width="12" height="7" rx="2" fill="#2EAF7B"/>
                </g>
                <path d="M22 102 Q48 92 74 102 Q96 110 110 102 Q124 94 146 102 Q168 110 198 102" stroke="#93E9BE" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
                <path d="M18 116 Q46 107 74 116 Q96 124 114 116 Q132 108 156 116 Q174 122 202 116" stroke="#2EAF7B" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.7"/>
                <path d="M28 129 Q52 122 76 129 Q94 134 110 129 Q128 122 150 129 Q164 134 186 129" stroke="#93E9BE" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.4"/>
              </svg>
            </div>
            <div>
              <h1 style={{
                fontFamily: font,
                fontSize: 22,
                fontWeight: 800,
                color: C.charcoal,
                margin: 0,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}>Pool & Paddle</h1>
              <p style={{
                fontFamily: font,
                fontSize: 11,
                color: C.textMuted,
                margin: 0,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 500,
              }}>Luxury STR Command Center · Beach Side</p>
            </div>
          </div>
          <nav style={{
            display: "flex", gap: 6,
            // On a phone: one horizontally-scrollable strip instead of wrapping into 3-4
            // rows that bloat the sticky header. On desktop: wrap as before.
            ...(isMobile
              ? { flexWrap: "nowrap", overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%", order: 3, paddingBottom: 2 }
              : { flexWrap: "wrap" }),
          }}>
            {[
              { key: "dashboard", label: "Dashboard" },
              { key: "tasks", label: "Tasks" },
              { key: "design", label: "Design" },
              { key: "shopping", label: "Shopping" },
              { key: "purchases", label: "Purchases" },
              { key: "house-info", label: "House Info" },
              { key: "summary", label: "Brief" },
              { key: "podcast", label: "Podcast" },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setActiveView(v.key)}
                style={{
                  padding: "10px 14px",
                  minHeight: 40,
                  borderRadius: 8,
                  border: "none",
                  background: activeView === v.key ? C.mint : (isMobile ? C.offWhite : "transparent"),
                  color: activeView === v.key ? C.white : C.textSecondary,
                  fontFamily: font,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {v.label}
              </button>
            ))}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {properties.length > 0 && (
              <select
                value={activeProperty || ""}
                onChange={e => onSwitchProperty && onSwitchProperty(e.target.value)}
                aria-label="Active property"
                style={{
                  fontFamily: font,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.charcoal,
                  background: C.offWhite,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {onDownloadBackup && (
              <button
                onClick={onDownloadBackup}
                title="Download a full backup of all your data"
                style={{
                  fontFamily: font,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.textSecondary,
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "6px 12px",
                  cursor: "pointer",
                }}
              >Backup</button>
            )}
            {user && (
              <>
                <span style={{
                  fontFamily: font,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.mint,
                  background: C.seafoamFaint,
                  padding: "5px 12px",
                  borderRadius: 20,
                  letterSpacing: "0.02em",
                }}>{user.name}</span>
                <a
                  href="/admin/logout"
                  style={{
                    fontFamily: font,
                    fontSize: 12,
                    fontWeight: 500,
                    color: C.textMuted,
                    textDecoration: "none",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={e => e.target.style.color = C.charcoal}
                  onMouseLeave={e => e.target.style.color = C.textMuted}
                >Sign Out</a>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function StatCard({ label, value, sub, accent }) {
  const color = accent || C.mint;
  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: "18px 16px",
      flex: "1 1 140px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      <div style={{
        fontFamily: font,
        fontSize: "clamp(22px, 5vw, 36px)",
        fontWeight: 800,
        color: color,
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}>{value}</div>
      <div style={{
        fontFamily: font,
        fontSize: 13,
        fontWeight: 600,
        color: C.charcoal,
        marginTop: 6,
      }}>{label}</div>
      {sub && <div style={{
        fontFamily: font,
        fontSize: 11,
        color: C.textMuted,
        marginTop: 4,
        fontWeight: 500,
      }}>{sub}</div>}
    </div>
  );
}

function Dashboard({ tasks, podcastData, finishes, onNavigateToItem, purchases = [], onOpenPurchase }) {
  const completed = tasks.filter(t => t.done).length;
  const total = tasks.length;
  const critical = tasks.filter(t => t.priority === "critical");
  const criticalDone = critical.filter(t => t.done).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const critPct = critical.length > 0 ? Math.round((criticalDone / critical.length) * 100) : 0;

  const catProgress = TASK_CATEGORIES.map(cat => {
    const catTasks = tasks.filter(t => t.category === cat.id);
    const catDone = catTasks.filter(t => t.done).length;
    return { ...cat, total: catTasks.length, done: catDone, pct: catTasks.length > 0 ? Math.round((catDone / catTasks.length) * 100) : 0 };
  });

  // Resolve linked item selection — linked items inherit parent's selection
  const resolveSelection = (f) => {
    if (f.linkedTo) {
      const parent = finishes.find(p => p.id === f.linkedTo);
      if (parent) return parent.selection;
    }
    return f.selection;
  };
  const hasSelection = (f) => { const s = resolveSelection(f); return s && s.trim() !== ""; };

  // Design progress — count items with a selection made per room
  const designRooms = FINISHES_DATA.rooms.map(room => {
    const roomItems = finishes.filter(f => f.room === room.id);
    const decided = roomItems.filter(hasSelection);
    return { ...room, total: roomItems.length, decided: decided.length, pct: roomItems.length > 0 ? Math.round((decided.length / roomItems.length) * 100) : 0 };
  });
  const totalDesignItems = finishes.length;
  const totalDecided = finishes.filter(hasSelection).length;
  const designPct = totalDesignItems > 0 ? Math.round((totalDecided / totalDesignItems) * 100) : 0;

  return (
    <div style={{ padding: "36px 32px", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: font, fontSize: 26, fontWeight: 800, color: C.charcoal, margin: "0 0 6px 0", letterSpacing: "-0.02em" }}>
          Mission Control
        </h2>
        <p style={{ fontFamily: font, fontSize: 14, color: C.textMuted, margin: 0, fontWeight: 500 }}>
          Pool & Paddle — 6401 Broward Street, St. Augustine, FL 32080
        </p>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <StatCard label="Task Progress" value={`${pct}%`} sub={`${completed} of ${total} tasks complete`} accent={C.mint} />
        <StatCard label="Critical Tasks" value={`${critPct}%`} sub={`${criticalDone} of ${critical.length} must-haves done`} accent={C.ocean} />
        <StatCard label="Design Decisions" value={`${designPct}%`} sub={`${totalDecided} of ${totalDesignItems} selections made`} accent={C.mint} />
        <StatCard label="Podcast Insights" value={podcastData.length} sub="Episodes cataloged" accent={C.textMuted} />
      </div>

      {/* Action Items — Overdue + Assigned items from Tasks AND Design */}
      {(() => {
        const today = new Date().toISOString().split("T")[0];
        // Normalize tasks into action items
        const taskItems = tasks
          .filter(t => !t.done && t.dueDate && (t.dueDate < today || t.assignee))
          .map(t => {
            const catInfo = TASK_CATEGORIES.find(c => c.id === t.category);
            return { id: t.id, sourceId: t.id, label: t.task, icon: catInfo?.icon || "📋", dueDate: t.dueDate, assignee: t.assignee, priority: t.priority, source: "task" };
          });
        // Normalize design items into action items (skip items that already have a selection)
        const designItems = finishes
          .filter(f => {
            if (!f.dueDate && !f.assignee) return false;
            if (!hasSelection(f)) return f.dueDate && (f.dueDate < today || f.assignee);
            return false; // decided items are done — don't show in action items
          })
          .map(f => {
            const catInfo = FINISHES_DATA.categories.find(c => c.id === f.category);
            const roomInfo = FINISHES_DATA.rooms.find(r => r.id === f.room);
            return { id: `d-${f.id}`, sourceId: f.id, label: f.item, icon: catInfo?.icon || "🔨", dueDate: f.dueDate, assignee: f.assignee, priority: null, source: "design", room: roomInfo?.label || f.room };
          });
        // Combine, overdue first then by date
        const all = [...taskItems, ...designItems];
        const overdue = all.filter(a => a.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const upcoming = all.filter(a => a.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const actionItems = [...overdue, ...upcoming];
        if (actionItems.length === 0) return null;
        return (
          <div style={{
            background: C.white, border: `1px solid ${overdue.length > 0 ? "#FEB2B2" : C.border}`, borderRadius: 14,
            padding: 28, marginBottom: 32, boxShadow: overdue.length > 0 ? "0 2px 12px rgba(229,62,62,0.08)" : "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.charcoal, margin: 0 }}>
                {overdue.length > 0 ? "⚠️ " : ""}Action Items
              </h3>
              {overdue.length > 0 && (
                <span style={{
                  fontFamily: font, fontSize: 12, fontWeight: 700,
                  color: "#E53E3E", background: "#FED7D7",
                  padding: "4px 12px", borderRadius: 20,
                }}>
                  {overdue.length} overdue
                </span>
              )}
            </div>
            <p style={{ fontFamily: font, fontSize: 12, color: C.textMuted, margin: "0 0 16px 0" }}>
              {overdue.length > 0 && upcoming.length > 0
                ? `${overdue.length} overdue · ${upcoming.length} upcoming`
                : overdue.length > 0
                ? `${overdue.length} item${overdue.length !== 1 ? "s" : ""} past due`
                : `${upcoming.length} assigned item${upcoming.length !== 1 ? "s" : ""} coming up`}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {actionItems.map((a, i) => {
                const isOverdue = a.dueDate < today;
                const isSoon = !isOverdue && a.dueDate <= new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
                return (
                  <div key={a.id} onClick={() => onNavigateToItem(a.source, a.sourceId)} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
                    borderTop: i > 0 ? `1px solid ${C.borderLight}` : "none",
                    cursor: "pointer", borderRadius: 6, transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.offWhite}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: isOverdue ? "#E53E3E" : (priorityColors[a.priority] || C.mint),
                    }} />
                    <span style={{ fontSize: 16, width: 24, flexShrink: 0 }}>{a.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: font, fontSize: 13, fontWeight: 500, color: C.charcoal }}>
                        {a.label}
                      </div>
                      {a.source === "design" && a.room && (
                        <div style={{ fontFamily: font, fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                          Design · {a.room}
                        </div>
                      )}
                    </div>
                    {a.assignee && (
                      <span style={{
                        fontFamily: font, fontSize: 10, fontWeight: 700,
                        width: 24, height: 24, borderRadius: "50%",
                        background: a.assignee === "JM" ? C.ocean : C.mint,
                        color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        {a.assignee}
                      </span>
                    )}
                    <span style={{
                      fontFamily: font, fontSize: 12, fontWeight: 600, flexShrink: 0,
                      color: isOverdue ? "#E53E3E" : isSoon ? "#D69E2E" : C.textMuted,
                      background: isOverdue ? "#FED7D7" : isSoon ? "#FEFCBF" : C.pageBg,
                      padding: "3px 10px", borderRadius: 6,
                    }}>
                      {isOverdue ? "Overdue · " : ""}{new Date(a.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Returns closing — purchases whose return window closes within 14 days */}
      {(() => {
        const today = localISODate();
        const closing = returnsClosingSoon(purchases, today, 14);
        if (closing.length === 0) return null;
        return (
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28, marginBottom: 32, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.charcoal, margin: "0 0 4px 0" }}>Returns closing</h3>
            <p style={{ fontFamily: font, fontSize: 12, color: C.textMuted, margin: "0 0 16px 0" }}>Return windows closing in the next 14 days. Open one to test it, then keep it or start a return.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {closing.map(p => {
                const left = daysBetween(today, p.returnByDate);
                const label = left === 0 ? "today" : left === 1 ? "1 day left" : `${left} days left`;
                const urgent = left <= 3;
                return (
                  <button key={p.id} onClick={() => onOpenPurchase && onOpenPurchase(p.id)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 44, textAlign: "left", background: C.offWhite, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontFamily: font }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.charcoal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.description || "(untitled)"}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{[p.vendor, p.sourceVendor].filter(Boolean).join(" · ") || "—"} · {fmtUSD(netCost(p))}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, color: urgent ? "#E53E3E" : C.warnText, background: urgent ? "#FED7D7" : C.warnBg, padding: "3px 10px", borderRadius: 6 }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Category Progress */}
      <div style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 28,
        marginBottom: 32,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.charcoal, margin: "0 0 20px 0" }}>
          Task Progress by Category
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {catProgress.map(cat => (
            <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 18, width: 28 }}>{cat.icon}</span>
              <span style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: C.charcoal, width: 200, flexShrink: 0 }}>
                {cat.label}
              </span>
              <div style={{
                flex: 1, height: 8,
                background: C.seafoamFaint,
                borderRadius: 4, overflow: "hidden",
              }}>
                <div style={{
                  width: `${cat.pct}%`, height: "100%",
                  background: cat.pct === 100 ? C.mint : `linear-gradient(90deg, ${C.seafoam}, ${C.mint})`,
                  borderRadius: 4, transition: "width 0.5s ease",
                }} />
              </div>
              <span style={{ fontFamily: font, fontSize: 12, color: C.textMuted, width: 50, textAlign: "right", fontWeight: 600 }}>
                {cat.done}/{cat.total}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Design Decisions by Room */}
      <div style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 28,
        marginBottom: 32,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.charcoal, margin: 0 }}>
            Design Selections by Room
          </h3>
          <span style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: C.textMuted }}>
            {totalDecided}/{totalDesignItems} decisions made
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {designRooms.map(room => (
            <div key={room.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: C.charcoal, width: 220, flexShrink: 0 }}>
                {room.label}
              </span>
              <div style={{
                flex: 1, height: 8,
                background: C.seafoamFaint,
                borderRadius: 4, overflow: "hidden",
              }}>
                <div style={{
                  width: `${room.pct}%`, height: "100%",
                  background: room.pct === 100 ? C.mint : `linear-gradient(90deg, ${C.seafoam}, ${C.mint})`,
                  borderRadius: 4, transition: "width 0.5s ease",
                }} />
              </div>
              <span style={{ fontFamily: font, fontSize: 12, color: C.textMuted, width: 70, textAlign: "right", fontWeight: 600 }}>
                {room.decided}/{room.total}
              </span>
              <span style={{ fontFamily: font, fontSize: 11, color: room.pct === 100 ? C.mint : room.pct > 0 ? C.mint : C.textMuted, width: 36, textAlign: "right", fontWeight: 700 }}>
                {room.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Property Location Map */}
      <div style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <div style={{ padding: "20px 28px 12px" }}>
          <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.charcoal, margin: "0 0 4px 0" }}>
            Property Location
          </h3>
          <p style={{ fontFamily: font, fontSize: 13, color: C.textMuted, margin: 0, fontWeight: 500 }}>
            6401 Broward Street, St. Augustine, FL 32080
          </p>
        </div>
        <iframe
          title="Pool & Paddle Property Location"
          width="100%"
          height="400"
          style={{ border: 0, display: "block" }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={`https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}&q=6401+Broward+Street,+St+Augustine,+FL+32080&zoom=16&maptype=roadmap`}
        />
      </div>
    </div>
  );
}

function PodcastView({ podcastData }) {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [showGimmicks, setShowGimmicks] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const categories = useMemo(() => [...new Set(podcastData.map(p => p.category))], [podcastData]);

  const filtered = useMemo(() => {
    return podcastData.filter(ep => {
      const matchSearch = search === "" ||
        ep.title.toLowerCase().includes(search.toLowerCase()) ||
        ep.summary.toLowerCase().includes(search.toLowerCase()) ||
        ep.tags.some(t => t.toLowerCase().includes(search.toLowerCase())) ||
        ep.keyInsight.toLowerCase().includes(search.toLowerCase());
      const matchCat = filterCat === "all" || ep.category === filterCat;
      const matchPriority = filterPriority === "all" || ep.priority === filterPriority;
      const matchGimmick = showGimmicks || !ep.isGimmick;
      return matchSearch && matchCat && matchPriority && matchGimmick;
    });
  }, [podcastData, search, filterCat, filterPriority, showGimmicks]);

  const allTags = useMemo(() => {
    const tagSet = new Set();
    podcastData.forEach(ep => ep.tags.forEach(t => tagSet.add(t)));
    return [...tagSet].sort();
  }, [podcastData]);

  return (
    <div style={{ padding: "36px 32px", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: font, fontSize: 26, fontWeight: 800, color: C.charcoal, margin: "0 0 6px 0", letterSpacing: "-0.02em" }}>
          Podcast Intelligence Database
        </h2>
        <p style={{ fontFamily: font, fontSize: 14, color: C.textMuted, margin: 0, fontWeight: 500 }}>
          Search across {podcastData.length} curated episodes from Thanks for Visiting
        </p>
      </div>

      {/* Search & Filters */}
      <div style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 22,
        marginBottom: 20,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <input
          type="text"
          placeholder="Search episodes, topics, tags, insights..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "13px 18px",
            borderRadius: 10,
            border: `1.5px solid ${C.border}`,
            background: C.offWhite,
            color: C.charcoal,
            fontFamily: font,
            fontSize: 16,
            fontWeight: 500,
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 14,
            transition: "border-color 0.2s",
          }}
          onFocus={e => e.target.style.borderColor = C.mint}
          onBlur={e => e.target.style.borderColor = C.border}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{
            padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
            background: C.white, color: C.charcoal, fontFamily: font, fontSize: 13, fontWeight: 500,
          }}>
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{
            padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
            background: C.white, color: C.charcoal, fontFamily: font, fontSize: 13, fontWeight: 500,
          }}>
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: font, fontSize: 13, color: C.textSecondary, cursor: "pointer", fontWeight: 500 }}>
            <input type="checkbox" checked={showGimmicks} onChange={e => setShowGimmicks(e.target.checked)} style={{ accentColor: C.mint }} />
            Show gimmicky items
          </label>
          <span style={{ fontFamily: font, fontSize: 12, color: C.textMuted, marginLeft: "auto", fontWeight: 600 }}>
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {search === "" && (
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allTags.slice(0, 30).map(tag => (
              <button
                key={tag}
                onClick={() => setSearch(tag)}
                style={{
                  padding: "4px 11px", borderRadius: 20,
                  border: `1px solid ${C.borderLight}`,
                  background: C.seafoamFaint, color: C.textSecondary,
                  fontFamily: font, fontSize: 11, fontWeight: 500,
                  cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.target.style.background = C.seafoamLight; e.target.style.color = C.mintDark; e.target.style.borderColor = C.seafoam; }}
                onMouseLeave={e => { e.target.style.background = C.seafoamFaint; e.target.style.color = C.textSecondary; e.target.style.borderColor = C.borderLight; }}
              >{tag}</button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map(ep => (
          <div
            key={ep.id}
            onClick={() => setExpandedId(expandedId === ep.id ? null : ep.id)}
            style={{
              background: C.white,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "18px 22px",
              cursor: "pointer",
              transition: "all 0.2s",
              opacity: ep.isGimmick ? 0.55 : 1,
              borderLeft: `4px solid ${priorityColors[ep.priority]}`,
              boxShadow: expandedId === ep.id ? "0 2px 12px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                  <span style={{
                    fontFamily: font, fontSize: 10, fontWeight: 700,
                    color: C.white, background: priorityColors[ep.priority],
                    padding: "2px 8px", borderRadius: 4,
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>{ep.priority}</span>
                  <span style={{ fontFamily: font, fontSize: 11, color: C.textMuted, fontWeight: 500 }}>
                    EP {ep.ep} · {ep.category}
                  </span>
                  {ep.isGimmick && <span style={{
                    fontFamily: font, fontSize: 10, fontWeight: 600,
                    color: C.textMuted, background: C.borderLight,
                    padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>skip</span>}
                  {ep.processedDate && (() => {
                    const daysAgo = Math.floor((Date.now() - new Date(ep.processedDate + "T00:00:00").getTime()) / 86400000);
                    return daysAgo <= 30 ? <span style={{
                      fontFamily: font, fontSize: 10, fontWeight: 700,
                      color: C.ocean, background: C.oceanLight,
                      padding: "2px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>new</span> : null;
                  })()}
                </div>
                <h3 style={{ fontFamily: font, fontSize: 16, fontWeight: 700, color: C.charcoal, margin: "0 0 6px 0" }}>
                  {ep.title}
                </h3>
                <p style={{ fontFamily: font, fontSize: 13, color: C.textSecondary, margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
                  💡 {ep.keyInsight}
                </p>
              </div>
              <span style={{
                color: C.textMuted, fontSize: 16, flexShrink: 0, marginTop: 4,
                transform: expandedId === ep.id ? "rotate(180deg)" : "rotate(0)",
                transition: "transform 0.2s",
              }}>▾</span>
            </div>

            {expandedId === ep.id && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.borderLight}` }}>
                <p style={{ fontFamily: font, fontSize: 14, color: C.textSecondary, lineHeight: 1.7, margin: "0 0 12px 0" }}>
                  {ep.summary}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {ep.tags.map(tag => (
                    <span
                      key={tag}
                      onClick={e => { e.stopPropagation(); setSearch(tag); }}
                      style={{
                        padding: "3px 10px", borderRadius: 20,
                        border: `1px solid ${C.seafoam}`,
                        background: C.seafoamFaint, color: C.mint,
                        fontFamily: font, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}
                    >{tag}</span>
                  ))}
                </div>
                <a
                  href={ep.source} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: C.mint, textDecoration: "none" }}
                >Listen to Episode {ep.ep} →</a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskView({ tasks, setTasks, focusItemId }) {
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [showGimmicks, setShowGimmicks] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTask, setNewTask] = useState({ task: "", category: "pre-launch", priority: "high", dueDate: "" });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const dateRefs = useRef({});
  const taskRowRefs = useRef({});

  // Auto-expand and scroll to focused item from dashboard
  useEffect(() => {
    if (!focusItemId) return;
    const task = tasks.find(t => t.id === focusItemId);
    if (task) {
      setFilterCat("all");
      setFilterStatus("all");
      setFilterAssignee("all");
      setShowGimmicks(task.isGimmick || false);
      setEditingNote(focusItemId);
      setNoteText(task.notes || "");
      requestAnimationFrame(() => {
        const el = taskRowRefs.current[focusItemId];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [focusItemId]);

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      const matchCat = filterCat === "all" || t.category === filterCat;
      const matchStatus = filterStatus === "all" || (filterStatus === "done" ? t.done : !t.done);
      const matchGimmick = showGimmicks || !t.isGimmick;
      const matchAssignee = filterAssignee === "all" ||
        (filterAssignee === "unassigned" ? !t.assignee : t.assignee === filterAssignee);
      return matchCat && matchStatus && matchGimmick && matchAssignee;
    });
  }, [tasks, filterCat, filterStatus, showGimmicks, filterAssignee]);

  const toggleTask = (taskId) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const nowDone = !t.done;
      return { ...t, done: nowDone, completedDate: nowDone ? new Date().toISOString().split("T")[0] : null };
    }));
  };

  const saveNote = (taskId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, notes: noteText } : t));
    setEditingNote(null);
    setNoteText("");
  };

  const setDueDate = (taskId, date) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, dueDate: date || null } : t));
  };

  const cycleAssignee = (taskId) => {
    const cycle = [null, "JM", "KM"];
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const idx = cycle.indexOf(t.assignee);
      return { ...t, assignee: cycle[(idx + 1) % cycle.length] };
    }));
  };

  const deleteTask = (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setConfirmDelete(null);
  };

  const handleDelete = (task) => {
    if (task.userCreated) {
      deleteTask(task.id);
    } else {
      setConfirmDelete(confirmDelete === task.id ? null : task.id);
    }
  };

  const addTask = () => {
    if (!newTask.task.trim()) return;
    setTasks(prev => [...prev, {
      id: "u" + Date.now(),
      category: newTask.category,
      task: newTask.task.trim(),
      done: false,
      priority: newTask.priority,
      isGimmick: false,
      notes: "",
      relatedEps: [],
      assignee: null,
      dueDate: newTask.dueDate || null,
      completedDate: null,
      userCreated: true,
    }]);
    setNewTask({ task: "", category: "pre-launch", priority: "high", dueDate: "" });
    setShowAddForm(false);
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const isOverdue = (task) => {
    if (!task.dueDate || task.done) return false;
    return task.dueDate < new Date().toISOString().split("T")[0];
  };

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(t => {
      if (!g[t.category]) g[t.category] = [];
      g[t.category].push(t);
    });
    return g;
  }, [filtered]);

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

  const sortTasks = (arr) => {
    const inc = arr.filter(t => !t.done).sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    const comp = arr.filter(t => t.done).sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    return [...inc, ...comp];
  };

  const selectStyle = {
    // fontSize 16 avoids iOS Safari's zoom-on-focus.
    padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
    background: C.white, color: C.charcoal, fontFamily: font, fontSize: 16, fontWeight: 500,
  };

  return (
    <div style={{ padding: "36px 32px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: font, fontSize: 26, fontWeight: 800, color: C.charcoal, margin: "0 0 6px 0", letterSpacing: "-0.02em" }}>
            Pending Tasks
          </h2>
          <p style={{ fontFamily: font, fontSize: 14, color: C.textMuted, margin: 0, fontWeight: 500 }}>
            Curated from 538+ episodes — only the tasks that actually matter
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: "10px 20px", borderRadius: 8, border: "none",
            background: C.mint, color: C.white,
            fontFamily: font, fontSize: 13, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            boxShadow: "0 2px 8px rgba(46,175,123,0.25)",
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Task
        </button>
      </div>

      {/* Add Task Form */}
      {showAddForm && (
        <div style={{
          background: C.white, border: `1px solid ${C.seafoam}`, borderRadius: 10,
          padding: 16, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap",
          boxShadow: "0 2px 12px rgba(46,175,123,0.1)",
        }}>
          <div style={{ flex: "1 1 300px" }}>
            <label style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Task</label>
            <input
              type="text" value={newTask.task}
              onChange={e => setNewTask(p => ({ ...p, task: e.target.value }))}
              placeholder="What needs to be done?"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") addTask(); if (e.key === "Escape") setShowAddForm(false); }}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 6,
                border: `1.5px solid ${C.border}`, background: C.offWhite,
                color: C.charcoal, fontFamily: font, fontSize: 16, fontWeight: 500, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Category</label>
            <select value={newTask.category} onChange={e => setNewTask(p => ({ ...p, category: e.target.value }))} style={selectStyle}>
              {TASK_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Priority</label>
            <select value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))} style={selectStyle}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Due Date</label>
            <input type="date" value={newTask.dueDate} onChange={e => setNewTask(p => ({ ...p, dueDate: e.target.value }))} style={{
              padding: "8px 12px", borderRadius: 6, border: `1.5px solid ${C.border}`,
              background: C.white, color: C.charcoal, fontFamily: font, fontSize: 16, fontWeight: 500,
            }} />
          </div>
          <button onClick={addTask} style={{
            padding: "8px 20px", borderRadius: 6, border: "none",
            background: C.mint, color: C.white,
            fontFamily: font, fontSize: 13, fontWeight: 700, cursor: "pointer",
            opacity: newTask.task.trim() ? 1 : 0.5,
          }}>Add</button>
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 24,
        padding: "14px 18px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={selectStyle}>
          <option value="all">All Categories</option>
          {TASK_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">All Tasks</option>
          <option value="todo">To Do</option>
          <option value="done">Complete</option>
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={selectStyle}>
          <option value="all">All Assignees</option>
          <option value="JM">JM</option>
          <option value="KM">KM</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: font, fontSize: 13, color: C.textSecondary, cursor: "pointer", fontWeight: 500 }}>
          <input type="checkbox" checked={showGimmicks} onChange={e => setShowGimmicks(e.target.checked)} style={{ accentColor: C.mint }} />
          Show deprioritized / gimmick items
        </label>
      </div>

      {/* Grouped tasks */}
      {Object.entries(grouped).sort(([a], [b]) => {
        return TASK_CATEGORIES.findIndex(c => c.id === a) - TASK_CATEGORIES.findIndex(c => c.id === b);
      }).map(([catId, catTasks]) => {
        const catInfo = TASK_CATEGORIES.find(c => c.id === catId);
        const doneCount = catTasks.filter(t => t.done).length;
        return (
          <div key={catId} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>{catInfo?.icon}</span>
              <h3 style={{ fontFamily: font, fontSize: 17, fontWeight: 700, color: C.charcoal, margin: 0 }}>
                {catInfo?.label}
              </h3>
              <span style={{
                fontFamily: font, fontSize: 12, fontWeight: 600,
                color: doneCount === catTasks.length ? C.mint : C.textMuted,
                background: doneCount === catTasks.length ? C.seafoamFaint : C.borderLight,
                padding: "2px 8px", borderRadius: 10,
              }}>{doneCount}/{catTasks.length}</span>
            </div>
            <div style={{
              background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
              overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}>
              {sortTasks(catTasks).map((task, i, arr) => (
                <div key={task.id} ref={el => { taskRowRefs.current[task.id] = el; }}>
                  <div
                    onMouseEnter={() => !isMobile && setHoveredRow(task.id)}
                    onMouseLeave={() => { setHoveredRow(null); if (confirmDelete === task.id) setConfirmDelete(null); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 16px",
                      borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : "none",
                      background: task.done ? C.seafoamFaint : (hoveredRow === task.id ? C.offWhite : C.white),
                      transition: "background 0.15s",
                      opacity: task.isGimmick ? 0.55 : 1,
                    }}
                  >
                    {/* Priority dot */}
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: priorityColors[task.priority], flexShrink: 0,
                    }} />

                    {/* Checkbox */}
                    <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)}
                      style={{ width: 16, height: 16, accentColor: C.mint, cursor: "pointer", flexShrink: 0, margin: 0 }} />

                    {/* Task text */}
                    <div
                      onClick={() => { setEditingNote(editingNote === task.id ? null : task.id); setNoteText(task.notes || ""); }}
                      style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{
                          fontFamily: font, fontSize: 13, fontWeight: 500,
                          color: task.done ? C.textMuted : C.charcoal,
                          textDecoration: task.done ? "line-through" : "none",
                        }}>{task.task}</span>
                        {task.userCreated && (
                          <span style={{
                            fontFamily: font, fontSize: 9, fontWeight: 700,
                            color: C.ocean, background: C.oceanLight,
                            padding: "1px 5px", borderRadius: 3,
                            textTransform: "uppercase", letterSpacing: "0.04em",
                          }}>USER</span>
                        )}
                        {task.isGimmick && (
                          <span style={{
                            fontFamily: font, fontSize: 9, fontWeight: 600,
                            color: C.textMuted, background: C.borderLight,
                            padding: "1px 5px", borderRadius: 3,
                          }}>gimmick</span>
                        )}
                        {task.done && task.completedDate && (
                          <span style={{ fontFamily: font, fontSize: 11, fontWeight: 500, color: C.mint }}>
                            ✓ Completed {fmtDate(task.completedDate)}
                          </span>
                        )}
                      </div>
                      {task.notes && editingNote !== task.id && (
                        <div style={{ fontFamily: font, fontSize: 11, color: C.textMuted, marginTop: 2, fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {task.notes}
                        </div>
                      )}
                    </div>

                    {/* Due date */}
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }} onClick={e => e.stopPropagation()}>
                      <input type="date" value={task.dueDate || ""}
                        ref={el => { dateRefs.current[task.id] = el; }}
                        onChange={e => setDueDate(task.id, e.target.value)}
                        style={{
                          // fontSize 16 avoids iOS zoom-on-focus.
                          fontFamily: font, fontSize: 16, fontWeight: 500,
                          color: task.dueDate ? (isOverdue(task) ? "#D94444" : C.textSecondary) : C.textMuted,
                          border: "none", background: "transparent", cursor: "pointer",
                          outline: "none", padding: "2px 4px", minWidth: 110,
                        }} />
                      {task.dueDate && (
                        <button onClick={() => setDueDate(task.id, "")} style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: C.textMuted, fontSize: 14, padding: "0 2px", lineHeight: 1,
                        }}>&times;</button>
                      )}
                    </div>

                    {/* Episode links */}
                    <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      {(task.relatedEps || []).map(epNum => (
                        <a key={epNum} href={`https://thanksforvisiting.com/podcasts/${epNum}/`}
                          target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{
                            fontFamily: font, fontSize: 10, fontWeight: 600,
                            color: C.mint, textDecoration: "none",
                            padding: "1px 5px", borderRadius: 3,
                            border: `1px solid ${C.seafoamLight}`, background: C.seafoamFaint,
                          }}
                        >EP {epNum}</a>
                      ))}
                    </div>

                    {/* Assignee avatar */}
                    <button
                      onClick={e => { e.stopPropagation(); cycleAssignee(task.id); }}
                      title={task.assignee ? task.assignee : "Unassigned — click to assign"}
                      style={{
                        width: 36, height: 36, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", flexShrink: 0, border: "none",
                        ...(task.assignee ? {
                          background: task.assignee === "JM" ? C.ocean : C.mint,
                          color: C.white, fontSize: 10, fontWeight: 700, fontFamily: font,
                        } : {
                          background: "transparent",
                          border: `1.5px dashed ${C.textMuted}`,
                          color: C.textMuted, fontSize: 14, fontFamily: font,
                        }),
                      }}
                    >{task.assignee || "+"}</button>

                    {/* Delete button — revealed on hover (desktop) or always shown on touch (mobile) */}
                    <div style={{ width: isMobile ? 40 : 36, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                      {confirmDelete === task.id ? (
                        <button onClick={e => { e.stopPropagation(); deleteTask(task.id); }} style={{
                          padding: "6px 10px", borderRadius: 4, border: "none",
                          background: "#D94444", color: C.white,
                          fontFamily: font, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        }}>Yes</button>
                      ) : (isMobile || hoveredRow === task.id) ? (
                        <button onClick={e => { e.stopPropagation(); handleDelete(task); }} aria-label="Delete task" style={{
                          background: "none", border: "none",
                          color: C.textMuted, fontSize: 18, cursor: "pointer", padding: isMobile ? "8px 8px" : 0, lineHeight: 1,
                        }}>×</button>
                      ) : null}
                    </div>
                  </div>

                  {/* Note editor */}
                  {editingNote === task.id && (
                    <div style={{
                      padding: "8px 16px 10px 50px",
                      background: C.offWhite,
                      borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : "none",
                    }}>
                      <input type="text" value={noteText} onChange={e => setNoteText(e.target.value)}
                        placeholder="Add a note... (Enter to save, Escape to cancel)"
                        autoFocus
                        style={{
                          width: "100%", padding: "7px 12px", borderRadius: 6,
                          border: `1.5px solid ${C.seafoam}`, background: C.white,
                          color: C.charcoal, fontFamily: font, fontSize: 16, fontWeight: 500,
                          outline: "none", boxSizing: "border-box",
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter") saveNote(task.id);
                          if (e.key === "Escape") setEditingNote(null);
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── EXECUTIVE SUMMARY ────────────────────────────────────────────────────

const categoryIcons = {
  "Operations": "⚙️",
  "Industry Trends": "📈",
  "Pricing & Revenue": "💰",
  "Marketing": "📸",
  "Getting Started": "🏗️",
  "Legal & Compliance": "⚖️",
  "Guest Experience": "⭐",
  "Furnishing & Design": "🛋️",
  "Technology": "💻",
};

function ExecutiveSummary() {
  const [expandedCat, setExpandedCat] = useState(null);
  const data = EXEC_SUMMARY;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px 64px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: font, fontSize: 26, fontWeight: 800, color: C.charcoal, margin: "0 0 8px 0", letterSpacing: "-0.02em" }}>
          Executive Brief
        </h2>
        <p style={{ fontFamily: font, fontSize: 14, color: C.textMuted, margin: 0 }}>
          Intelligence from {data.nonGimmickCount} episodes of <em>Thanks for Visiting</em> — filtered for luxury STR relevance, gimmicks excluded
        </p>
      </div>

      {/* Luxury Strategy Overview */}
      <div style={{
        background: `linear-gradient(135deg, ${C.charcoal} 0%, #1a1a2e 100%)`,
        borderRadius: 16,
        padding: "32px 36px",
        marginBottom: 28,
        color: C.white,
      }}>
        <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, margin: "0 0 16px 0", color: C.seafoam }}>
          Pool & Paddle — Luxury Positioning Strategy
        </h3>
        <div style={{ fontFamily: font, fontSize: 14, lineHeight: 1.85, color: "rgba(255,255,255,0.88)" }}>
          <p style={{ margin: "0 0 14px 0" }}>
            <strong style={{ color: C.white }}>Your Differentiator:</strong> A pool and paddle sports property has a built-in guest avatar and brand identity that most STRs lack. Annette and Sarah consistently emphasize that confused positioning loses bookings — your focused niche is a strategic advantage. Every design choice, amenity, photo, and listing word should reinforce the luxury active-leisure experience.
          </p>
          <p style={{ margin: "0 0 14px 0" }}>
            <strong style={{ color: C.white }}>The Luxury Framework:</strong> Premium guests expect flawless operations, not just pretty interiors. Invest where guests feel it most — sleep quality, seating comfort, kitchen function, and the pool area experience. Create one unforgettable "wow" moment that guests photograph and share. Skip decorative clutter, cheap barware, and trend-chasing.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: C.white }}>Revenue-First Mindset:</strong> Use dynamic pricing tools (PriceLabs/Wheelhouse), track Airbnb's professional hosting metrics, analyze competitor reviews systematically, and treat this as a data-driven business from day one. The podcast's most successful hosts combine hospitality instinct with analytical rigor.
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Episodes Analyzed", value: data.nonGimmickCount, color: C.mint },
          { label: "Critical Priority", value: data.categories.reduce((s, c) => s + c.topEpisodes.filter(e => e.priority === "critical").length, 0) > 0 ? data.categories.reduce((s, c) => s + c.criticalHighCount, 0) : 0, sub: "critical + high", color: C.ocean },
          { label: "Categories", value: data.categories.length, color: C.mint },
          { label: "Gimmicks Excluded", value: data.totalEpisodes - data.nonGimmickCount, color: C.textMuted },
        ].map((s, i) => (
          <div key={i} style={{
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: "16px 18px", textAlign: "center",
          }}>
            <div style={{ fontFamily: font, fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: font, fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Top Critical Insights */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 28, marginBottom: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.charcoal, margin: "0 0 6px 0" }}>
          Top 20 Must-Know Insights
        </h3>
        <p style={{ fontFamily: font, fontSize: 12, color: C.textMuted, margin: "0 0 20px 0" }}>
          Critical-priority takeaways across all categories — the essentials for launching a luxury STR
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {data.topInsights.map((ep, i) => (
            <div key={ep.ep} style={{
              display: "flex", gap: 14, alignItems: "flex-start",
              padding: "14px 0",
              borderTop: i > 0 ? `1px solid ${C.borderLight}` : "none",
            }}>
              <div style={{
                minWidth: 32, height: 32, borderRadius: 8,
                background: C.oceanLight, color: C.ocean,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: font, fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2,
              }}>
                {ep.ep}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: C.charcoal, marginBottom: 4 }}>
                  {ep.title}
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 600, color: C.textMuted,
                    background: C.pageBg, padding: "2px 8px", borderRadius: 4,
                  }}>
                    {ep.category}
                  </span>
                </div>
                <div style={{ fontFamily: font, fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}>
                  {ep.keyInsight}
                </div>
              </div>
              <a
                href={`https://thanksforvisiting.com/podcasts/${ep.ep}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: font, fontSize: 11, color: C.mint, textDecoration: "none",
                  fontWeight: 600, flexShrink: 0, marginTop: 4,
                }}
              >
                Listen
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Category Deep Dives */}
      <div style={{ marginBottom: 28 }}>
        <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.charcoal, margin: "0 0 20px 0" }}>
          Category Intelligence
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.categories.map(cat => {
            const isOpen = expandedCat === cat.name;
            return (
              <div key={cat.name} style={{
                background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
                overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}>
                <button
                  onClick={() => setExpandedCat(isOpen ? null : cat.name)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 14,
                    padding: "18px 24px", border: "none", background: "transparent",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 22 }}>{categoryIcons[cat.name] || "📋"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: font, fontSize: 15, fontWeight: 700, color: C.charcoal }}>
                      {cat.name}
                    </div>
                    <div style={{ fontFamily: font, fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                      {cat.count} episodes · {cat.criticalHighCount} critical/high priority
                    </div>
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <div style={{
                      width: 80, height: 6, background: C.seafoamFaint, borderRadius: 3, overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${(cat.criticalHighCount / cat.count * 100)}%`,
                        height: "100%", background: C.mint, borderRadius: 3,
                      }} />
                    </div>
                    <span style={{
                      fontFamily: font, fontSize: 18, color: C.textMuted,
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s", display: "inline-block",
                    }}>
                      ▾
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ padding: "0 24px 24px", borderTop: `1px solid ${C.borderLight}` }}>
                    {/* Luxury Relevance */}
                    <div style={{
                      background: C.seafoamFaint, borderRadius: 10, padding: "14px 18px",
                      marginTop: 16, marginBottom: 18,
                    }}>
                      <div style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: C.mint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                        Luxury Relevance
                      </div>
                      <div style={{ fontFamily: font, fontSize: 13, color: C.charcoal, lineHeight: 1.6 }}>
                        {cat.luxuryRelevance}
                      </div>
                    </div>

                    {/* Tags */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
                      {cat.topTags.map(tag => (
                        <span key={tag} style={{
                          fontFamily: font, fontSize: 11, fontWeight: 600, color: C.mint,
                          background: C.seafoamFaint, padding: "4px 10px", borderRadius: 6,
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Top Episodes */}
                    <div style={{ fontFamily: font, fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                      Top Episodes
                    </div>
                    {cat.topEpisodes.map((ep, i) => (
                      <div key={ep.ep} style={{
                        display: "flex", gap: 12, alignItems: "flex-start",
                        padding: "12px 0",
                        borderTop: i > 0 ? `1px solid ${C.borderLight}` : "none",
                      }}>
                        <span style={{
                          fontFamily: font, fontSize: 11, fontWeight: 700, color: C.ocean,
                          background: C.oceanLight, padding: "3px 8px", borderRadius: 6, flexShrink: 0,
                        }}>
                          EP {ep.ep}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: C.charcoal, marginBottom: 3 }}>
                            {ep.title}
                          </div>
                          <div style={{ fontFamily: font, fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>
                            {ep.keyInsight}
                          </div>
                        </div>
                        <a
                          href={`https://thanksforvisiting.com/podcasts/${ep.ep}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontFamily: font, fontSize: 11, color: C.mint, textDecoration: "none",
                            fontWeight: 600, flexShrink: 0, marginTop: 2,
                          }}
                        >
                          Listen
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommended Tools & Software */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 28, marginBottom: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.charcoal, margin: "0 0 6px 0" }}>
          Recommended Tools & Software
        </h3>
        <p style={{ fontFamily: font, fontSize: 12, color: C.textMuted, margin: "0 0 20px 0" }}>
          Industry tools referenced across {data.nonGimmickCount} episodes — grouped by function
        </p>
        {(() => {
          const tools = TOOLS_DATA.tools.filter(t => t.name !== "Airbnb"); // Airbnb is obvious
          const grouped = {};
          tools.forEach(t => {
            if (!grouped[t.category]) grouped[t.category] = [];
            grouped[t.category].push(t);
          });
          const catOrder = Object.keys(grouped).sort((a, b) => {
            const aMax = Math.max(...grouped[a].map(t => t.episodeCount));
            const bMax = Math.max(...grouped[b].map(t => t.episodeCount));
            return bMax - aMax;
          });
          const catIcons = {
            "Dynamic Pricing": "📊", "Operations & Cleaning": "🧹", "Insurance": "🛡️",
            "Property Management (PMS)": "🏠", "Smart Home & Security": "🔐",
            "Booking Platform": "🌐", "Guest Experience": "🎁", "AI Tools": "🤖",
            "Accounting & Finance": "📒", "Social Media & Marketing": "📱",
            "Direct Booking & Marketing": "🔗", "Automation": "⚡",
            "Communication & Productivity": "💬", "Payment Processing": "💳",
          };
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {catOrder.map(cat => (
                <div key={cat} style={{
                  border: `1px solid ${C.borderLight}`, borderRadius: 12, padding: "16px 20px",
                }}>
                  <div style={{
                    fontFamily: font, fontSize: 13, fontWeight: 700, color: C.charcoal, marginBottom: 12,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span>{catIcons[cat] || "📋"}</span> {cat}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {grouped[cat].sort((a, b) => b.episodeCount - a.episodeCount).map(tool => (
                      <div key={tool.name} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <div style={{
                          minWidth: 28, height: 28, borderRadius: 7,
                          background: C.seafoamFaint, color: C.mint,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: font, fontSize: 10, fontWeight: 700, flexShrink: 0,
                        }}>
                          {tool.episodeCount}
                        </div>
                        <div>
                          <div style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: C.charcoal }}>
                            {tool.name}
                          </div>
                          <div style={{ fontFamily: font, fontSize: 11, color: C.textMuted, lineHeight: 1.4, marginTop: 2 }}>
                            {tool.description}
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                            {tool.episodes.slice(0, 3).map(ep => (
                              <a
                                key={ep}
                                href={`https://thanksforvisiting.com/podcasts/${ep}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontFamily: font, fontSize: 10, color: C.ocean, textDecoration: "none",
                                  background: C.oceanLight, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
                                }}
                              >
                                EP {ep}
                              </a>
                            ))}
                            {tool.episodes.length > 3 && (
                              <span style={{ fontFamily: font, fontSize: 10, color: C.textMuted, padding: "2px 4px" }}>
                                +{tool.episodes.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        <div style={{
          marginTop: 20, padding: "14px 18px", background: C.seafoamFaint,
          borderRadius: 10, fontFamily: font, fontSize: 12, color: C.textSecondary, lineHeight: 1.6,
        }}>
          <strong style={{ color: C.charcoal }}>Discount codes & affiliate links:</strong> Annette and Sarah frequently partner with these tools. Visit{" "}
          <a href="https://thanksforvisiting.com" target="_blank" rel="noopener noreferrer" style={{ color: C.mint, fontWeight: 600 }}>
            thanksforvisiting.com
          </a>{" "}
          for their current partner links and promo codes — they often offer exclusive discounts for PriceLabs, Breezeway, Proper Insurance, StayFi, and other recommended tools.
        </div>
      </div>

      {/* Tag Cloud */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.charcoal, margin: "0 0 6px 0" }}>
          Most Discussed Topics
        </h3>
        <p style={{ fontFamily: font, fontSize: 12, color: C.textMuted, margin: "0 0 18px 0" }}>
          Top 30 tags across all {data.nonGimmickCount} episodes — sized by frequency
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {data.tagCloud.map((t, i) => {
            const maxCount = data.tagCloud[0].count;
            const minSize = 11;
            const maxSize = 20;
            const size = minSize + ((t.count / maxCount) * (maxSize - minSize));
            const opacity = 0.5 + (t.count / maxCount) * 0.5;
            return (
              <span key={t.tag} style={{
                fontFamily: font,
                fontSize: size,
                fontWeight: t.count > maxCount * 0.6 ? 700 : 500,
                color: C.charcoal,
                opacity,
                padding: "4px 10px",
                cursor: "default",
              }}>
                {t.tag}
                <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 3, fontWeight: 500 }}>
                  {t.count}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        textAlign: "center", marginTop: 32, fontFamily: font, fontSize: 11, color: C.textMuted,
      }}>
        Generated from {data.totalEpisodes} episodes · {data.nonGimmickCount} analyzed · {data.totalEpisodes - data.nonGimmickCount} gimmicks excluded · Updated {data.generatedDate}
      </div>
    </div>
  );
}

// ─── DESIGN VIEW ────────────────────────────────────────────────────────────

const FINISH_CATEGORIES = FINISHES_DATA.categories;
const FINISH_ROOMS = FINISHES_DATA.rooms;
const DEFAULT_FINISH_ITEMS = FINISHES_DATA.items.map(item => ({ ...item, userCreated: false }));

function DesignView({ finishes, setFinishes, targetBudget, setTargetBudget, roomData, setRoomData, focusItemId, deletedFinishIds, setDeletedFinishIds, onPromote, promotedFinishIds, onPromoteFurniture, promotedFurnitureIds, writeFinishItem, tombstoneFinishItem, removeFinishItem, writeFurniture, removeFurniture, writeRoomMeta, writeBudget }) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [groupBy, setGroupBy] = useState("trade");
  const [filterCat, setFilterCat] = useState("all");
  const [filterRoom, setFilterRoom] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ item: "", category: FINISH_CATEGORIES[0].id, room: FINISH_ROOMS[0].id });
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [hoveredRow, setHoveredRow] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [search, setSearch] = useState("");
  const [copyPanelId, setCopyPanelId] = useState(null);   // id of the item whose copy panel is open
  const [copyRooms, setCopyRooms] = useState([]);         // checked target room ids
  const [copyMode, setCopyMode] = useState("independent"); // "independent" | "linked"
  const [copyToast, setCopyToast] = useState("");         // transient "Copied to N rooms" message
  const dateRefs = useRef({});
  const itemRowRefs = useRef({});

  // Auto-expand and scroll to focused item from dashboard
  useEffect(() => {
    if (!focusItemId) return;
    setFilterCat("all");
    setFilterRoom("all");
    setFilterStatus("all");
    setFilterAssignee("all");
    setSearch("");
    setExpandedId(focusItemId);
    requestAnimationFrame(() => {
      const el = itemRowRefs.current[focusItemId];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [focusItemId]);

  const selectStyle = {
    // fontSize 16 avoids iOS Safari's zoom-on-focus.
    padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
    background: C.white, color: C.charcoal, fontFamily: font, fontSize: 16, fontWeight: 500,
  };

  const filtered = useMemo(() => {
    return finishes.filter(item => {
      const matchCat = filterCat === "all" || item.category === filterCat;
      const matchRoom = filterRoom === "all" || item.room === filterRoom;
      const resolvedSel = item.linkedTo
        ? (finishes.find(p => p.id === item.linkedTo)?.selection || item.selection)
        : item.selection;
      const hasSel = resolvedSel && resolvedSel.trim() !== "";
      const matchStatus = filterStatus === "all" ||
        (filterStatus === "priced" ? (item.unitPrice != null && item.quantity != null) :
         filterStatus === "selected" ? hasSel :
         filterStatus === "needs-selection" ? !hasSel : true);
      const matchAssignee = filterAssignee === "all" ||
        (filterAssignee === "unassigned" ? !item.assignee : item.assignee === filterAssignee);
      const matchSearch = matchesFinishSearch(item, resolvedSel, search);
      return matchCat && matchRoom && matchStatus && matchAssignee && matchSearch;
    });
  }, [finishes, filterCat, filterRoom, filterStatus, filterAssignee, search]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(item => {
      const key = groupBy === "trade" ? item.category : item.room;
      if (!g[key]) g[key] = [];
      g[key].push(item);
    });
    // Sort items within each group by the cross-reference dimension
    // so all items for the same room cluster together (when grouped by trade) and vice versa
    const roomOrder = FINISH_ROOMS.map(r => r.id);
    const catOrder = FINISH_CATEGORIES.map(c => c.id);
    Object.values(g).forEach(items => {
      items.sort((a, b) => {
        const orderList = groupBy === "trade" ? roomOrder : catOrder;
        const aKey = groupBy === "trade" ? a.room : a.category;
        const bKey = groupBy === "trade" ? b.room : b.category;
        const aIdx = orderList.indexOf(aKey);
        const bIdx = orderList.indexOf(bKey);
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
      });
    });
    return g;
  }, [filtered, groupBy]);

  const groupMeta = groupBy === "trade" ? FINISH_CATEGORIES : FINISH_ROOMS;

  // Resolve linked item values — parent's selection/price/unit/url, child's own quantity/notes
  const resolveItem = (item) => {
    if (!item.linkedTo) return item;
    const parent = finishes.find(p => p.id === item.linkedTo);
    if (!parent) return item;
    return {
      ...item,
      selection: parent.selection,
      unitPrice: parent.unitPrice,
      unit: parent.unit,
      url: parent.url,
    };
  };

  // Items available to link to (have a selection filled in)
  const linkableItems = useMemo(() => {
    return finishes.filter(i => i.selection && i.selection.trim() !== "");
  }, [finishes]);

  const grandTotal = useMemo(() => {
    return finishes.reduce((sum, item) => {
      const r = resolveItem(item);
      if (r.unitPrice != null && item.quantity != null) return sum + r.unitPrice * item.quantity;
      return sum;
    }, 0);
  }, [finishes]);

  const pricedCount = useMemo(() => finishes.filter(i => {
    const r = resolveItem(i);
    return r.unitPrice != null && i.quantity != null;
  }).length, [finishes]);
  const decidedCount = useMemo(() => finishes.filter(i => {
    const r = resolveItem(i);
    return r.selection && r.selection.trim() !== "";
  }).length, [finishes]);
  const outstandingCount = finishes.length - decidedCount;

  const updateItem = (id, updates) => {
    setFinishes(prev => prev.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, ...updates };
      writeFinishItem(next);
      return next;
    }));
  };

  const deleteItem = (id) => {
    const item = finishes.find(i => i.id === id);
    if (item && !item.userCreated) {
      setDeletedFinishIds(prev => [...prev, id]);
      tombstoneFinishItem(id);          // default → tombstone field
    } else {
      removeFinishItem(id);             // user item → HDEL
    }
    setFinishes(prev => prev
      .filter(item => item.id !== id)
      .map(item => {
        if (item.linkedTo === id) {
          const next = { ...item, linkedTo: null };
          writeFinishItem(next);        // persist each unlinked child
          return next;
        }
        return item;
      }));
    setConfirmDelete(null);
  };

  const cycleAssignee = (id) => {
    const cycle = [null, "JM", "KM"];
    setFinishes(prev => prev.map(item => {
      if (item.id !== id) return item;
      const idx = cycle.indexOf(item.assignee);
      const next = { ...item, assignee: cycle[(idx + 1) % cycle.length] };
      writeFinishItem(next);
      return next;
    }));
  };

  const setItemDueDate = (id, date) => {
    setFinishes(prev => prev.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, dueDate: date || null };
      writeFinishItem(next);
      return next;
    }));
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const isItemOverdue = (item) => {
    if (!item.dueDate) return false;
    const resolved = resolveItem(item);
    const hasSel = resolved.selection && resolved.selection.trim() !== "";
    if (hasSel) return false;
    return item.dueDate < new Date().toISOString().split("T")[0];
  };

  const addItem = () => {
    if (!newItem.item.trim()) return;
    const created = {
      id: "uf" + Date.now(),
      category: newItem.category,
      room: newItem.room,
      item: newItem.item.trim(),
      contractorOptions: [],
      selection: "",
      unitPrice: null,
      quantity: null,
      unit: "ea",
      url: "",
      notes: "",
      assignee: null,
      dueDate: null,
      userCreated: true,
    };
    setFinishes(prev => [...prev, created]);
    writeFinishItem(created);
    setNewItem({ item: "", category: FINISH_CATEGORIES[0].id, room: FINISH_ROOMS[0].id });
    setShowAddForm(false);
  };

  const openCopyPanel = (item) => {
    setCopyPanelId(item.id);
    setCopyRooms([]);
    setCopyMode("independent");
    setCopyToast("");
  };

  const createRoomCopies = (source) => {
    if (copyRooms.length === 0) return;
    const copies = buildRoomCopies({ source, roomIds: copyRooms, mode: copyMode, idBase: Date.now() });
    setFinishes(prev => [...prev, ...copies]);
    copies.forEach(writeFinishItem);
    setCopyToast(`Copied to ${copies.length} room${copies.length !== 1 ? "s" : ""}`);
    setCopyPanelId(null);
    setCopyRooms([]);
  };

  const [editingMiroRoom, setEditingMiroRoom] = useState(null);
  const [miroInput, setMiroInput] = useState("");
  const [expandedFurnitureRoom, setExpandedFurnitureRoom] = useState(null);
  const [showAddFurniture, setShowAddFurniture] = useState(null);
  const [newFurniture, setNewFurniture] = useState({ name: "", price: "", url: "", notes: "" });

  const getRoomData = (roomId) => roomData[roomId] || { miroUrl: "", furniture: [] };

  const updateRoomData = (roomId, updates) => {
    setRoomData(prev => ({
      ...prev,
      [roomId]: { ...getRoomData(roomId), ...updates },
    }));
  };

  const addFurnitureItem = (roomId) => {
    if (!newFurniture.name.trim()) return;
    const rd = getRoomData(roomId);
    const furn = {
      id: "furn" + Date.now(),
      name: newFurniture.name.trim(),
      price: newFurniture.price ? parseFloat(newFurniture.price) : null,
      url: newFurniture.url || "",
      notes: newFurniture.notes || "",
      purchased: false,
    };
    updateRoomData(roomId, { furniture: [...rd.furniture, furn] });
    writeFurniture(roomId, furn);
    setNewFurniture({ name: "", price: "", url: "", notes: "" });
    setShowAddFurniture(null);
  };

  const updateFurnitureItem = (roomId, furnId, updates) => {
    const rd = getRoomData(roomId);
    const next = rd.furniture.map(f => f.id === furnId ? { ...f, ...updates } : f);
    updateRoomData(roomId, { furniture: next });
    const updated = next.find(f => f.id === furnId);
    if (updated) writeFurniture(roomId, updated);
  };

  const deleteFurnitureItem = (roomId, furnId) => {
    const rd = getRoomData(roomId);
    updateRoomData(roomId, { furniture: rd.furniture.filter(f => f.id !== furnId) });
    removeFurniture(roomId, furnId);
  };

  const fmtMoney = (n) => {
    if (n == null) return "—";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const groupSubtotal = (items) => {
    return items.reduce((sum, item) => {
      const r = resolveItem(item);
      if (r.unitPrice != null && item.quantity != null) return sum + r.unitPrice * item.quantity;
      return sum;
    }, 0);
  };

  return (
    <div style={{ padding: isMobile ? "20px 14px" : "36px 32px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 20 : 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: font, fontSize: isMobile ? 22 : 26, fontWeight: 800, color: C.charcoal, margin: "0 0 6px 0", letterSpacing: "-0.02em" }}>
            Finish Selections
          </h2>
          <p style={{ fontFamily: font, fontSize: 14, color: C.textMuted, margin: 0, fontWeight: 500 }}>
            Track selections, pricing, and budget across {FINISH_CATEGORIES.length} trades and {FINISH_ROOMS.length} rooms
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              const headers = ["Trade", "Room", "Item", "Selection", "Unit Price", "Quantity", "Unit", "Line Total", "Product Link", "Notes", "Linked To", "Assignee", "Decision Date", "Contractor Options"];
              const csvRows = [headers.join(",")];
              const esc = (s) => `"${String(s || "").replace(/"/g, '""')}"`;
              // =HYPERLINK() renders as a clickable link in the cell (Excel + Google Sheets);
              // empty url → empty cell (no broken formula).
              const hyperlink = (url) => {
                const u = String(url || "").trim();
                return u ? esc(`=HYPERLINK("${u}","${u}")`) : "";
              };
              finishes.forEach(item => {
                const r = resolveItem(item);
                const catLabel = FINISH_CATEGORIES.find(c => c.id === item.category)?.label || item.category;
                const roomLabel = FINISH_ROOMS.find(rr => rr.id === item.room)?.label || item.room;
                const lineTotal = (r.unitPrice != null && item.quantity != null) ? r.unitPrice * item.quantity : "";
                const parentName = item.linkedTo ? finishes.find(p => p.id === item.linkedTo)?.item || "" : "";
                csvRows.push([
                  esc(catLabel), esc(roomLabel), esc(item.item),
                  esc(r.selection), r.unitPrice ?? "", item.quantity ?? "",
                  esc(r.unit), lineTotal, hyperlink(r.url), esc(item.notes), esc(parentName),
                  esc(item.assignee || ""), esc(item.dueDate || ""),
                  esc((item.contractorOptions || []).join("; ")),
                ].join(","));
              });
              // Furniture items per room
              const furnitureRows = [];
              FINISH_ROOMS.forEach(room => {
                const rd = getRoomData(room.id);
                if (rd.furniture && rd.furniture.length > 0) {
                  rd.furniture.forEach(f => {
                    furnitureRows.push([
                      esc("Furniture"), esc(room.label), esc(f.name),
                      "", "", f.price ?? "", "", "",
                      f.price ?? "", hyperlink(f.url), esc(f.notes), "",
                    ].join(","));
                  });
                }
              });
              if (furnitureRows.length > 0) {
                csvRows.push("");
                csvRows.push(`"--- Furniture ---",,,,,,,,,,`);
                csvRows.push(...furnitureRows);
              }
              // Budget summary
              if (targetBudget != null) {
                csvRows.push("");
                const gt = finishes.reduce((s, i) => { const r = resolveItem(i); return s + ((r.unitPrice ?? 0) * (i.quantity ?? 0)); }, 0);
                csvRows.push(`"Budget Target",,,,,,,,${targetBudget},,`);
                csvRows.push(`"Grand Total",,,,,,,,${gt},,`);
                csvRows.push(`"Variance",,,,,,,,${targetBudget - gt},,`);
              }
              const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "pool-paddle-finishes.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{
              padding: "10px 16px", borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.white, color: C.textSecondary,
              fontFamily: font, fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            Export CSV
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              padding: "10px 20px", borderRadius: 8, border: "none",
              background: C.mint, color: C.white,
              fontFamily: font, fontSize: 13, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 2px 8px rgba(46,175,123,0.25)",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Item
          </button>
        </div>
      </div>

      {/* Budget Summary Bar */}
      <div style={{ display: "flex", gap: isMobile ? 10 : 16, flexWrap: "wrap", marginBottom: isMobile ? 16 : 24 }}>
        <StatCard label="Grand Total" value={fmtMoney(grandTotal)} sub={grandTotal === 0 ? "No items priced yet" : "Materials & finishes"} accent={C.mint} />
        <StatCard label="Items Priced" value={`${pricedCount} of ${finishes.length}`} sub={`${finishes.length - pricedCount} still need pricing`} accent={C.ocean} />
        <div style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: "24px 26px", flex: "1 1 200px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)", cursor: "pointer",
        }} onClick={() => { setEditingBudget(true); setBudgetInput(targetBudget != null ? String(targetBudget) : ""); }}>
          {editingBudget ? (
            <div>
              <input
                type="number"
                value={budgetInput}
                onChange={e => setBudgetInput(e.target.value)}
                placeholder="Enter budget..."
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const val = budgetInput.trim() ? parseFloat(budgetInput) : null;
                    setTargetBudget(val);
                    writeBudget(val);
                    setEditingBudget(false);
                  }
                  if (e.key === "Escape") setEditingBudget(false);
                }}
                onBlur={() => {
                  const val = budgetInput.trim() ? parseFloat(budgetInput) : null;
                  setTargetBudget(val);
                  writeBudget(val);
                  setEditingBudget(false);
                }}
                style={{
                  width: "100%", padding: "6px 0", border: "none", borderBottom: `2px solid ${C.mint}`,
                  background: "transparent", color: C.charcoal, fontFamily: font, fontSize: 28, fontWeight: 800,
                  outline: "none", boxSizing: "border-box",
                }}
              />
              <div style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: C.charcoal, marginTop: 6 }}>Budget Target</div>
            </div>
          ) : (
            <div>
              <div style={{
                fontFamily: font, fontSize: 36, fontWeight: 800,
                color: C.mint, lineHeight: 1, letterSpacing: "-0.02em",
              }}>{targetBudget != null ? fmtMoney(targetBudget) : "Set"}</div>
              <div style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: C.charcoal, marginTop: 6 }}>Budget Target</div>
              <div style={{ fontFamily: font, fontSize: 11, color: C.textMuted, marginTop: 4, fontWeight: 500 }}>
                {targetBudget != null ? "Click to edit" : "Click to set a target"}
              </div>
            </div>
          )}
        </div>
        <StatCard
          label="Items Decided"
          value={`${decidedCount} / ${finishes.length}`}
          sub={outstandingCount === 0 ? "All selections made!" : `${outstandingCount} still outstanding`}
          accent={outstandingCount === 0 ? C.mint : C.ocean}
        />
      </div>

      {/* Add Item Form */}
      {showAddForm && (
        <div style={{
          background: C.white, border: `1px solid ${C.seafoam}`, borderRadius: 10,
          padding: 16, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap",
          boxShadow: "0 2px 12px rgba(46,175,123,0.1)",
        }}>
          <div style={{ flex: "1 1 300px" }}>
            <label style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Item Description</label>
            <input
              type="text" value={newItem.item}
              onChange={e => setNewItem(p => ({ ...p, item: e.target.value }))}
              placeholder="What finish item needs to be selected?"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setShowAddForm(false); }}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 6,
                border: `1.5px solid ${C.border}`, background: C.offWhite,
                color: C.charcoal, fontFamily: font, fontSize: 16, fontWeight: 500, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Trade</label>
            <select value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))} style={selectStyle}>
              {FINISH_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Room</label>
            <select value={newItem.room} onChange={e => setNewItem(p => ({ ...p, room: e.target.value }))} style={selectStyle}>
              {FINISH_ROOMS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <button onClick={addItem} style={{
            padding: "8px 20px", borderRadius: 6, border: "none",
            background: C.mint, color: C.white,
            fontFamily: font, fontSize: 13, fontWeight: 700, cursor: "pointer",
            opacity: newItem.item.trim() ? 1 : 0.5,
          }}>Add</button>
        </div>
      )}

      {/* Toggle + Filters */}
      <div style={{
        display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 24,
        padding: "14px 18px", background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        {/* Segmented toggle */}
        <div style={{
          display: "flex", borderRadius: 8, overflow: "hidden",
          border: `1px solid ${C.border}`,
        }}>
          {[{ key: "trade", label: "By Trade" }, { key: "room", label: "By Room" }].map(opt => (
            <button
              key={opt.key}
              onClick={() => setGroupBy(opt.key)}
              style={{
                padding: "7px 16px", border: "none",
                background: groupBy === opt.key ? C.mint : C.white,
                color: groupBy === opt.key ? C.white : C.textSecondary,
                fontFamily: font, fontSize: 12, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
              }}
            >{opt.label}</button>
          ))}
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={selectStyle}>
          <option value="all">All Trades</option>
          {FINISH_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
        </select>
        <select value={filterRoom} onChange={e => setFilterRoom(e.target.value)} style={selectStyle}>
          <option value="all">All Rooms</option>
          {FINISH_ROOMS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">All Status</option>
          <option value="selected">Has Selection</option>
          <option value="needs-selection">Needs Selection</option>
          <option value="priced">Priced</option>
        </select>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            style={{ ...selectStyle, paddingRight: search ? 44 : 14, minWidth: 180 }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              style={{
                position: "absolute", right: 4, background: "none", border: "none",
                color: C.textMuted, fontSize: 16, cursor: "pointer",
                padding: "10px 8px", lineHeight: 1, minWidth: 44, minHeight: 44,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >×</button>
          )}
        </div>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={selectStyle}>
          <option value="all">All Owners</option>
          <option value="JM">JM</option>
          <option value="KM">KM</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <span style={{ fontFamily: font, fontSize: 12, color: C.textMuted, marginLeft: "auto", fontWeight: 600 }}>
          {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grouped Sections */}
      {Object.entries(grouped).sort(([a], [b]) => {
        return groupMeta.findIndex(m => m.id === a) - groupMeta.findIndex(m => m.id === b);
      }).map(([groupId, items]) => {
        const meta = groupMeta.find(m => m.id === groupId);
        if (!meta) return null;
        const sub = groupSubtotal(items);
        const catInfo = groupBy === "trade" ? FINISH_CATEGORIES.find(c => c.id === groupId) : null;
        return (
          <div key={groupId} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              {groupBy === "trade" && <span style={{ fontSize: 22 }}>{meta.icon}</span>}
              <h3 style={{ fontFamily: font, fontSize: 17, fontWeight: 700, color: C.charcoal, margin: 0 }}>
                {meta.label}
              </h3>
              <span style={{
                fontFamily: font, fontSize: 12, fontWeight: 600,
                color: C.textMuted, background: C.borderLight,
                padding: "2px 8px", borderRadius: 10,
              }}>{items.length} item{items.length !== 1 ? "s" : ""}</span>
              {sub > 0 && (
                <span style={{
                  fontFamily: font, fontSize: 12, fontWeight: 700,
                  color: C.mint,
                }}>{fmtMoney(sub)}</span>
              )}
              {/* Miro link — room groups only */}
              {groupBy === "room" && (() => {
                const rd = getRoomData(groupId);
                return editingMiroRoom === groupId ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }} onClick={e => e.stopPropagation()}>
                    <input
                      type="url" value={miroInput}
                      onChange={e => setMiroInput(e.target.value)}
                      placeholder="Paste Miro board URL..."
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === "Enter") { updateRoomData(groupId, { miroUrl: miroInput.trim() }); writeRoomMeta(groupId, { miroUrl: miroInput.trim() }); setEditingMiroRoom(null); }
                        if (e.key === "Escape") setEditingMiroRoom(null);
                      }}
                      onBlur={() => { updateRoomData(groupId, { miroUrl: miroInput.trim() }); writeRoomMeta(groupId, { miroUrl: miroInput.trim() }); setEditingMiroRoom(null); }}
                      style={{
                        padding: "7px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`,
                        background: C.white, color: C.charcoal, fontFamily: font, fontSize: 16,
                        fontWeight: 500, outline: "none", width: isMobile ? 180 : 260,
                      }}
                    />
                  </div>
                ) : rd.miroUrl ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
                    <a href={rd.miroUrl} target="_blank" rel="noopener noreferrer"
                      style={{
                        padding: "4px 12px", borderRadius: 6,
                        background: "#FFD02F", color: "#050038",
                        fontFamily: font, fontSize: 11, fontWeight: 700, textDecoration: "none",
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >Miro Board</a>
                    <button onClick={() => { setEditingMiroRoom(groupId); setMiroInput(rd.miroUrl); }}
                      style={{ background: "none", border: "none", color: C.textMuted, fontSize: 12, cursor: "pointer", padding: 0 }}
                    >edit</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingMiroRoom(groupId); setMiroInput(""); }}
                    style={{
                      padding: "4px 12px", borderRadius: 6,
                      border: `1px dashed ${C.textMuted}`, background: "transparent",
                      color: C.textMuted, fontFamily: font, fontSize: 11, fontWeight: 600,
                      cursor: "pointer", marginLeft: "auto",
                    }}
                  >+ Miro Link</button>
                );
              })()}
            </div>

            {/* Contractor recommendation callout */}
            {groupBy === "trade" && catInfo?.contractorNote && (
              <div style={{
                background: C.seafoamFaint, borderRadius: 10, padding: "12px 16px",
                marginBottom: 10, display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>💬</span>
                <div>
                  <div style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: C.mint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
                    Contractor Note
                  </div>
                  <div style={{ fontFamily: font, fontSize: 12, color: C.charcoal, lineHeight: 1.5 }}>
                    {catInfo.contractorNote}
                  </div>
                </div>
              </div>
            )}

            {/* Furniture section — room groups only */}
            {groupBy === "room" && (() => {
              const rd = getRoomData(groupId);
              const hasFurniture = rd.furniture && rd.furniture.length > 0;
              const furnitureTotal = (rd.furniture || []).reduce((s, f) => s + (f.price || 0), 0);
              const isExpFurn = expandedFurnitureRoom === groupId;
              return (
                <div style={{
                  background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
                  marginBottom: 10, overflow: "hidden",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}>
                  <div
                    onClick={() => setExpandedFurnitureRoom(isExpFurn ? null : groupId)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 16px", cursor: "pointer",
                      background: isExpFurn ? C.offWhite : C.white,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>🛋️</span>
                    <span style={{ fontFamily: font, fontSize: 13, fontWeight: 600, color: C.charcoal, flex: 1 }}>
                      Furniture
                    </span>
                    <span style={{
                      fontFamily: font, fontSize: 11, fontWeight: 600,
                      color: C.textMuted, background: C.borderLight,
                      padding: "2px 8px", borderRadius: 10,
                    }}>{(rd.furniture || []).length}</span>
                    {furnitureTotal > 0 && (
                      <span style={{ fontFamily: font, fontSize: 12, fontWeight: 700, color: C.mint }}>
                        {fmtMoney(furnitureTotal)}
                      </span>
                    )}
                    <span style={{
                      color: C.textMuted, fontSize: 14,
                      transform: isExpFurn ? "rotate(180deg)" : "rotate(0)",
                      transition: "transform 0.2s",
                    }}>▾</span>
                  </div>

                  {isExpFurn && (
                    <div style={{ borderTop: `1px solid ${C.borderLight}` }}>
                      {(rd.furniture || []).map((furn, fi) => (
                        <div key={furn.id} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: isMobile ? "8px 12px" : "8px 16px",
                          borderBottom: `1px solid ${C.borderLight}`,
                        }}>
                          <input type="checkbox" checked={furn.purchased || false}
                            onChange={() => updateFurnitureItem(groupId, furn.id, { purchased: !furn.purchased })}
                            style={{ width: 16, height: 16, accentColor: C.mint, cursor: "pointer", flexShrink: 0, margin: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontFamily: font, fontSize: 13, fontWeight: 500,
                              color: furn.purchased ? C.textMuted : C.charcoal,
                              textDecoration: furn.purchased ? "line-through" : "none",
                            }}>{furn.name}</div>
                            {furn.notes && (
                              <div style={{ fontFamily: font, fontSize: 11, color: C.textMuted, marginTop: 1 }}>{furn.notes}</div>
                            )}
                          </div>
                          {furn.price != null && (
                            <span style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: C.charcoal, flexShrink: 0 }}>
                              {fmtMoney(furn.price)}
                            </span>
                          )}
                          {furn.url && (
                            <a href={furn.url} target="_blank" rel="noopener noreferrer"
                              style={{ color: C.mint, fontSize: 13, flexShrink: 0, textDecoration: "none" }}
                            >🔗</a>
                          )}
                          {onPromoteFurniture && (
                            promotedFurnitureIds && promotedFurnitureIds.has(furn.id) ? (
                              <span title="Already a purchase" style={{ fontSize: 12, fontWeight: 700, color: C.mint, flexShrink: 0 }}>✓</span>
                            ) : (
                              <button onClick={() => onPromoteFurniture(furn, groupId)} title="Create a purchase from this item"
                                style={{ background: C.seafoamFaint, border: `1px solid ${C.mint}`, color: C.mintDark, fontFamily: font, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "3px 8px", borderRadius: 6, flexShrink: 0, whiteSpace: "nowrap" }}
                              >Mark purchased</button>
                            )
                          )}
                          <button onClick={() => deleteFurnitureItem(groupId, furn.id)}
                            style={{ background: "none", border: "none", color: C.textMuted, fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0 }}
                          >×</button>
                        </div>
                      ))}

                      {/* Add furniture form */}
                      {showAddFurniture === groupId ? (
                        <div style={{
                          padding: isMobile ? "10px 12px" : "10px 16px",
                          display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end",
                        }}>
                          <div style={{ flex: "1 1 180px" }}>
                            <label style={{ fontFamily: font, fontSize: 10, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 3 }}>Item</label>
                            <input type="text" value={newFurniture.name}
                              onChange={e => setNewFurniture(p => ({ ...p, name: e.target.value }))}
                              placeholder="Furniture item..."
                              autoFocus
                              onKeyDown={e => { if (e.key === "Enter") addFurnitureItem(groupId); if (e.key === "Escape") setShowAddFurniture(null); }}
                              style={{
                                width: "100%", padding: "7px 10px", borderRadius: 6,
                                border: `1.5px solid ${C.border}`, background: C.pageBg,
                                color: C.charcoal, fontFamily: font, fontSize: 12, fontWeight: 500,
                                outline: "none", boxSizing: "border-box",
                              }}
                            />
                          </div>
                          <div style={{ width: 90 }}>
                            <label style={{ fontFamily: font, fontSize: 10, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 3 }}>Price</label>
                            <input type="number" value={newFurniture.price}
                              onChange={e => setNewFurniture(p => ({ ...p, price: e.target.value }))}
                              placeholder="$"
                              onKeyDown={e => { if (e.key === "Enter") addFurnitureItem(groupId); }}
                              style={{
                                width: "100%", padding: "7px 10px", borderRadius: 6,
                                border: `1.5px solid ${C.border}`, background: C.pageBg,
                                color: C.charcoal, fontFamily: font, fontSize: 12, fontWeight: 500,
                                outline: "none", boxSizing: "border-box",
                              }}
                            />
                          </div>
                          <div style={{ flex: "1 1 180px" }}>
                            <label style={{ fontFamily: font, fontSize: 10, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 3 }}>Link</label>
                            <input type="url" value={newFurniture.url}
                              onChange={e => setNewFurniture(p => ({ ...p, url: e.target.value }))}
                              placeholder="https://..."
                              onKeyDown={e => { if (e.key === "Enter") addFurnitureItem(groupId); }}
                              style={{
                                width: "100%", padding: "7px 10px", borderRadius: 6,
                                border: `1.5px solid ${C.border}`, background: C.pageBg,
                                color: C.charcoal, fontFamily: font, fontSize: 12, fontWeight: 500,
                                outline: "none", boxSizing: "border-box",
                              }}
                            />
                          </div>
                          <button onClick={() => addFurnitureItem(groupId)} style={{
                            padding: "7px 14px", borderRadius: 6, border: "none",
                            background: C.mint, color: C.white,
                            fontFamily: font, fontSize: 12, fontWeight: 700, cursor: "pointer",
                            opacity: newFurniture.name.trim() ? 1 : 0.5,
                          }}>Add</button>
                        </div>
                      ) : (
                        <div style={{ padding: "8px 16px" }}>
                          <button onClick={() => { setShowAddFurniture(groupId); setNewFurniture({ name: "", price: "", url: "", notes: "" }); }}
                            style={{
                              background: "none", border: "none", color: C.mint,
                              fontFamily: font, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0,
                            }}
                          >+ Add Furniture</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{
              background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
              overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}>
              {items.map((item, i, arr) => {
                const isExpanded = expandedId === item.id;
                const resolved = resolveItem(item);
                const parentItem = item.linkedTo ? finishes.find(p => p.id === item.linkedTo) : null;
                const crossRef = groupBy === "trade"
                  ? FINISH_ROOMS.find(r => r.id === item.room)?.label
                  : FINISH_CATEGORIES.find(c => c.id === item.category)?.label;
                const lineTotal = (resolved.unitPrice != null && item.quantity != null) ? resolved.unitPrice * item.quantity : null;
                return (
                  <div key={item.id} ref={el => { itemRowRefs.current[item.id] = el; }}>
                    <div
                      onClick={() => { setExpandedId(isExpanded ? null : item.id); setConfirmDelete(null); setCopyToast(""); }}
                      onMouseEnter={() => !isMobile && setHoveredRow(item.id)}
                      onMouseLeave={() => { setHoveredRow(null); }}
                      style={{
                        display: "flex", alignItems: "center", gap: isMobile ? 8 : 10,
                        padding: isMobile ? "10px 12px" : "10px 16px",
                        borderBottom: (i < arr.length - 1 || isExpanded) ? `1px solid ${C.borderLight}` : "none",
                        background: isExpanded ? C.offWhite : (hoveredRow === item.id ? C.offWhite : C.white),
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                    >
                      {/* Selection status dot */}
                      {(() => {
                        const filled = resolved.selection && resolved.selection.trim() !== "";
                        return (
                          <div style={{
                            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                            background: filled ? C.mint : "transparent",
                            border: `2px solid ${filled ? C.mint : C.textMuted}`,
                            transition: "all 0.2s",
                          }} />
                        );
                      })()}

                      {/* Item name */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{
                            fontFamily: font, fontSize: 13, fontWeight: 500, color: C.charcoal,
                          }}>{item.item}</span>
                          {item.userCreated && (
                            <span style={{
                              fontFamily: font, fontSize: 9, fontWeight: 700,
                              color: C.ocean, background: C.oceanLight,
                              padding: "1px 5px", borderRadius: 3,
                              textTransform: "uppercase", letterSpacing: "0.04em",
                            }}>CUSTOM</span>
                          )}
                        </div>
                        {resolved.selection && !isExpanded && (
                          <div style={{ fontFamily: font, fontSize: 11, color: C.textMuted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                            {item.linkedTo && <span style={{ color: C.ocean, fontSize: 10 }}>🔗</span>}
                            {resolved.selection}
                          </div>
                        )}
                      </div>

                      {/* Cross-reference badge — hide on mobile */}
                      {!isMobile && (
                        <span style={{
                          fontFamily: font, fontSize: 10, fontWeight: 600,
                          color: C.textMuted, background: C.pageBg,
                          padding: "2px 8px", borderRadius: 4, flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}>{crossRef}</span>
                      )}

                      {/* Price summary */}
                      <span style={{
                        fontFamily: font, fontSize: 12, fontWeight: 600,
                        color: lineTotal != null ? C.charcoal : C.textMuted,
                        flexShrink: 0, minWidth: isMobile ? 50 : 80, textAlign: "right",
                      }}>
                        {lineTotal != null ? fmtMoney(lineTotal) : "—"}
                      </span>

                      {/* Decision date */}
                      <div
                        style={{ flexShrink: 0 }}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => e.stopPropagation()}
                      >
                        <input type="date" value={item.dueDate || ""}
                          onChange={e => setItemDueDate(item.id, e.target.value)}
                          style={{
                            // fontSize 16 avoids iOS zoom; wider tap zone on mobile (badge/link are hidden there).
                            fontFamily: font, fontSize: 16, fontWeight: 500,
                            color: item.dueDate ? (isItemOverdue(item) ? "#D94444" : C.textSecondary) : C.textMuted,
                            border: "none", background: "transparent", outline: "none",
                            cursor: "pointer", padding: "4px 2px", width: isMobile ? 44 : 130,
                          }}
                        />
                      </div>

                      {/* Assignee avatar */}
                      <button
                        onClick={e => { e.stopPropagation(); cycleAssignee(item.id); }}
                        title={item.assignee ? item.assignee : "Unassigned — click to assign"}
                        style={{
                          width: 28, height: 28, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", flexShrink: 0, border: "none",
                          ...(item.assignee ? {
                            background: item.assignee === "JM" ? C.ocean : C.mint,
                            color: C.white, fontSize: 10, fontWeight: 700, fontFamily: font,
                          } : {
                            background: "transparent",
                            border: `1.5px dashed ${C.textMuted}`,
                            color: C.textMuted, fontSize: 14, fontFamily: font,
                          }),
                        }}
                      >{item.assignee || "+"}</button>

                      {/* Link icon — hide on mobile to save space (visible in expanded panel) */}
                      {!isMobile && resolved.url && (
                        <a href={resolved.url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ color: C.mint, fontSize: 14, flexShrink: 0, textDecoration: "none", lineHeight: 1 }}
                        >🔗</a>
                      )}

                      {/* Delete button — always show on mobile, hover on desktop */}
                      <div style={{ width: 28, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                        {confirmDelete === item.id ? (
                          <button onClick={e => { e.stopPropagation(); deleteItem(item.id); }} style={{
                            padding: "2px 8px", borderRadius: 4, border: "none",
                            background: "#D94444", color: C.white,
                            fontFamily: font, fontSize: 11, fontWeight: 700, cursor: "pointer",
                          }}>Yes</button>
                        ) : (isMobile || hoveredRow === item.id) ? (
                          <button onClick={e => {
                            e.stopPropagation();
                            if (item.userCreated) { deleteItem(item.id); }
                            else { setConfirmDelete(confirmDelete === item.id ? null : item.id); }
                          }} style={{
                            background: "none", border: "none",
                            color: C.textMuted, fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1,
                          }}>×</button>
                        ) : null}
                      </div>

                      {/* Expand chevron */}
                      <span style={{
                        color: C.textMuted, fontSize: 14, flexShrink: 0,
                        transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
                        transition: "transform 0.2s",
                      }}>▾</span>
                    </div>

                    {/* Expanded edit panel */}
                    {isExpanded && (
                      <div style={{
                        padding: isMobile ? "14px 12px 16px 12px" : "16px 20px 18px 38px",
                        background: C.white,
                        borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : "none",
                        borderTop: `1px solid ${C.borderLight}`,
                      }}>
                        {/* Cross-reference on mobile (hidden from row) */}
                        {isMobile && (
                          <div style={{ fontFamily: font, fontSize: 11, color: C.textMuted, marginBottom: 10 }}>
                            {groupBy === "trade" ? "Room" : "Trade"}: <strong style={{ color: C.textSecondary }}>{crossRef}</strong>
                          </div>
                        )}
                        {(() => {
                          const inputStyle = {
                            width: "100%", padding: "10px 12px", borderRadius: 8,
                            border: `1.5px solid ${C.border}`, background: C.pageBg,
                            color: C.charcoal, fontFamily: font, fontSize: 13, fontWeight: 500,
                            outline: "none", boxSizing: "border-box",
                          };
                          const focusHandlers = {
                            onFocus: e => { e.target.style.borderColor = C.mint; e.target.style.background = C.white; },
                            onBlur: e => { e.target.style.borderColor = C.border; e.target.style.background = C.pageBg; },
                          };
                          const labelStyle = { fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textSecondary, display: "block", marginBottom: 4 };

                          return (<>

                        {/* Editable item name */}
                        <div style={{ marginBottom: 14 }}>
                          <label style={labelStyle}>Item Name</label>
                          <input
                            type="text" value={item.item || ""}
                            onChange={e => updateItem(item.id, { item: e.target.value })}
                            onClick={e => e.stopPropagation()}
                            style={inputStyle} {...focusHandlers}
                          />
                        </div>

                        {/* Editable room — reclassify the item to another room */}
                        <div style={{ marginBottom: 14 }}>
                          <label style={labelStyle}>Room</label>
                          <select
                            value={item.room || ""}
                            onChange={e => updateItem(item.id, { room: e.target.value })}
                            onClick={e => e.stopPropagation()}
                            style={inputStyle} {...focusHandlers}
                          >
                            {FINISH_ROOMS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                          </select>
                        </div>

                        {/* Linked item banner */}
                        {item.linkedTo && parentItem && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
                            padding: "10px 14px", borderRadius: 8,
                            background: C.oceanLight, border: `1px solid ${C.ocean}20`,
                          }}>
                            <span style={{ fontSize: 14 }}>🔗</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: font, fontSize: 12, fontWeight: 700, color: C.ocean }}>
                                Linked to: {parentItem.item}
                              </div>
                              <div style={{ fontFamily: font, fontSize: 11, color: C.textSecondary, marginTop: 1 }}>
                                Inherits selection, price, unit & link — set quantity and notes here
                              </div>
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); updateItem(item.id, { linkedTo: null }); }}
                              style={{
                                padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
                                background: C.white, color: C.textSecondary,
                                fontFamily: font, fontSize: 11, fontWeight: 600, cursor: "pointer",
                              }}
                            >Unlink</button>
                          </div>
                        )}

                        {/* Link to parent selector (when not linked and no own selection) */}
                        {!item.linkedTo && (
                          <div style={{
                            marginBottom: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                          }}>
                            {linkableItems.filter(li => li.id !== item.id).length > 0 && (
                              <>
                                <span style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textMuted }}>Link to:</span>
                                <select
                                  value=""
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => {
                                    e.stopPropagation();
                                    if (e.target.value) updateItem(item.id, { linkedTo: e.target.value, selection: "", unitPrice: null, url: "" });
                                  }}
                                  style={{
                                    padding: "5px 10px", borderRadius: 6,
                                    border: `1px solid ${C.ocean}40`, background: C.oceanLight,
                                    color: C.ocean, fontFamily: font, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                  }}
                                >
                                  <option value="">Pick a parent item...</option>
                                  {[...FINISH_CATEGORIES].sort((a, b) => {
                                    if (a.id === item.category) return -1;
                                    if (b.id === item.category) return 1;
                                    return 0;
                                  }).map(cat => {
                                    const catItems = linkableItems.filter(li => li.id !== item.id && li.category === cat.id);
                                    if (catItems.length === 0) return null;
                                    return (
                                      <optgroup key={cat.id} label={`${cat.icon} ${cat.label}${cat.id === item.category ? ' ★' : ''}`}>
                                        {catItems.map(li => {
                                          const roomLabel = FINISH_ROOMS.find(r => r.id === li.room)?.label || li.room;
                                          return <option key={li.id} value={li.id}>{li.item} ({roomLabel}) — {li.selection}</option>;
                                        })}
                                      </optgroup>
                                    );
                                  })}
                                </select>
                                <span style={{ fontFamily: font, fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>or fill in manually below</span>
                              </>
                            )}
                          </div>
                        )}

                        {/* Contractor options (only when not linked) */}
                        {!item.linkedTo && item.contractorOptions && item.contractorOptions.length > 0 && (
                          <div style={{
                            marginBottom: 14, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
                          }}>
                            <span style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: C.textMuted }}>Contractor options:</span>
                            {item.contractorOptions.map((opt, oi) => (
                              <button
                                key={oi}
                                onClick={e => { e.stopPropagation(); updateItem(item.id, { selection: opt }); }}
                                style={{
                                  padding: "3px 10px", borderRadius: 6,
                                  border: `1px solid ${item.selection === opt ? C.seafoam : C.borderLight}`,
                                  background: item.selection === opt ? C.seafoamFaint : C.white,
                                  color: item.selection === opt ? C.mintDark : C.textSecondary,
                                  fontFamily: font, fontSize: 11, fontWeight: 500, cursor: "pointer",
                                  transition: "all 0.15s",
                                }}
                              >{opt}</button>
                            ))}
                          </div>
                        )}

                        {/* Inherited values display (when linked) */}
                        {item.linkedTo && parentItem && (
                          <div style={{
                            display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 12,
                            padding: "10px 14px", borderRadius: 8, background: C.pageBg,
                          }}>
                            <div>
                              <div style={labelStyle}>Selection (from parent)</div>
                              <div style={{ fontFamily: font, fontSize: 13, fontWeight: 500, color: C.charcoal }}>{resolved.selection || "—"}</div>
                            </div>
                            <div>
                              <div style={labelStyle}>Unit Price (from parent)</div>
                              <div style={{ fontFamily: font, fontSize: 13, fontWeight: 500, color: C.charcoal }}>{resolved.unitPrice != null ? `$${resolved.unitPrice}` : "—"}</div>
                            </div>
                            <div>
                              <div style={labelStyle}>Unit (from parent)</div>
                              <div style={{ fontFamily: font, fontSize: 13, fontWeight: 500, color: C.charcoal }}>{resolved.unit || "—"}</div>
                            </div>
                          </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                          {/* Selection (only when not linked) */}
                          {!item.linkedTo && (
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label style={labelStyle}>Selection</label>
                              <input
                                type="text" value={item.selection || ""}
                                onChange={e => updateItem(item.id, { selection: e.target.value })}
                                onClick={e => e.stopPropagation()}
                                placeholder="Type or click a contractor option above"
                                style={inputStyle} {...focusHandlers}
                              />
                            </div>
                          )}

                          {/* Unit Price (only when not linked) */}
                          {!item.linkedTo && (
                            <div>
                              <label style={labelStyle}>Unit Price ($)</label>
                              <input
                                type="number" value={item.unitPrice ?? ""}
                                onChange={e => updateItem(item.id, { unitPrice: e.target.value === "" ? null : parseFloat(e.target.value) })}
                                onClick={e => e.stopPropagation()}
                                placeholder="0.00"
                                style={inputStyle} {...focusHandlers}
                              />
                            </div>
                          )}

                          {/* Quantity (always editable) */}
                          {!item.linkedTo ? (
                            <div style={{ display: "flex", gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Quantity</label>
                                <input
                                  type="number" value={item.quantity ?? ""}
                                  onChange={e => updateItem(item.id, { quantity: e.target.value === "" ? null : parseFloat(e.target.value) })}
                                  onClick={e => e.stopPropagation()}
                                  placeholder="0"
                                  style={inputStyle} {...focusHandlers}
                                />
                              </div>
                              <div style={{ width: 80 }}>
                                <label style={labelStyle}>Unit</label>
                                <select
                                  value={item.unit || "ea"}
                                  onChange={e => { e.stopPropagation(); updateItem(item.id, { unit: e.target.value }); }}
                                  onClick={e => e.stopPropagation()}
                                  style={{
                                    width: "100%", padding: "10px 6px", borderRadius: 8,
                                    border: `1.5px solid ${C.border}`, background: C.pageBg,
                                    color: C.charcoal, fontFamily: font, fontSize: 12, fontWeight: 500,
                                  }}
                                >
                                  <option value="ea">ea</option>
                                  <option value="sq ft">sq ft</option>
                                  <option value="lin ft">lin ft</option>
                                  <option value="set">set</option>
                                  <option value="lot">lot</option>
                                  <option value="gal">gal</option>
                                </select>
                              </div>
                            </div>
                          ) : (
                            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <label style={labelStyle}>Quantity (this room)</label>
                                <input
                                  type="number" value={item.quantity ?? ""}
                                  onChange={e => updateItem(item.id, { quantity: e.target.value === "" ? null : parseFloat(e.target.value) })}
                                  onClick={e => e.stopPropagation()}
                                  placeholder="0"
                                  style={inputStyle} {...focusHandlers}
                                />
                              </div>
                            </div>
                          )}

                          {/* URL (only when not linked) */}
                          {!item.linkedTo && (
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label style={labelStyle}>Product Link</label>
                              <input
                                type="url" value={item.url || ""}
                                onChange={e => updateItem(item.id, { url: e.target.value })}
                                onClick={e => e.stopPropagation()}
                                placeholder="https://..."
                                style={inputStyle} {...focusHandlers}
                              />
                            </div>
                          )}

                          {/* Notes (always editable) */}
                          <div style={{ gridColumn: "1 / -1" }}>
                            <label style={labelStyle}>Notes</label>
                            <input
                              type="text" value={item.notes || ""}
                              onChange={e => updateItem(item.id, { notes: e.target.value })}
                              onClick={e => e.stopPropagation()}
                              placeholder="Any notes about this selection..."
                              style={inputStyle} {...focusHandlers}
                            />
                          </div>

                          {/* Assignee + Decision Date */}
                          <div>
                            <label style={labelStyle}>Decision Owner</label>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              {[{ key: "JM", label: "Josh", color: C.ocean }, { key: "KM", label: "Kerry", color: C.mint }].map(opt => (
                                <button
                                  key={opt.key}
                                  onClick={e => { e.stopPropagation(); updateItem(item.id, { assignee: item.assignee === opt.key ? null : opt.key }); }}
                                  style={{
                                    padding: "7px 16px", borderRadius: 8, border: "none",
                                    background: item.assignee === opt.key ? opt.color : C.pageBg,
                                    color: item.assignee === opt.key ? C.white : C.textSecondary,
                                    fontFamily: font, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                    transition: "all 0.15s",
                                  }}
                                >{opt.label}</button>
                              ))}
                              {item.assignee && (
                                <button
                                  onClick={e => { e.stopPropagation(); updateItem(item.id, { assignee: null }); }}
                                  style={{
                                    background: "none", border: "none", color: C.textMuted,
                                    fontFamily: font, fontSize: 11, cursor: "pointer", padding: "4px 8px",
                                  }}
                                >Clear</button>
                              )}
                            </div>
                          </div>
                          <div>
                            <label style={labelStyle}>Decision Date</label>
                            <div style={{ position: "relative" }}>
                              <input
                                type="date" value={item.dueDate || ""}
                                onChange={e => { e.stopPropagation(); setItemDueDate(item.id, e.target.value); }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                  ...inputStyle,
                                  color: item.dueDate ? (isItemOverdue(item) ? "#D94444" : C.charcoal) : C.textMuted,
                                }}
                              />
                              {item.dueDate && (
                                <button
                                  onClick={e => { e.stopPropagation(); setItemDueDate(item.id, ""); }}
                                  style={{
                                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                                    background: "none", border: "none", color: C.textMuted,
                                    fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1,
                                  }}
                                >×</button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Line total */}
                        {lineTotal != null && (
                          <div style={{
                            marginTop: 12, textAlign: "right",
                            fontFamily: font, fontSize: 13, fontWeight: 700, color: C.mint,
                          }}>
                            Line total: {fmtMoney(lineTotal)} ({item.quantity} {resolved.unit} × ${resolved.unitPrice}/{resolved.unit})
                          </div>
                        )}

                        {/* Promote to a purchase (non-destructive — the design item stays as-is) */}
                        {onPromote && (
                          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.borderLight}` }}>
                            {promotedFinishIds && promotedFinishIds.has(item.id) ? (
                              <span style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: C.mint, background: C.seafoamFaint, padding: "7px 14px", borderRadius: 8, display: "inline-block" }}>✓ Purchased — see the Purchases tab</span>
                            ) : (
                              <>
                                <button
                                  onClick={e => { e.stopPropagation(); onPromote(item); }}
                                  style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: C.mint, color: C.white, fontFamily: font, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                                >Mark as purchased →</button>
                                <div style={{ fontFamily: font, fontSize: 11, color: C.textMuted, marginTop: 8 }}>
                                  Creates a purchase record from this selection on the Purchases tab. Your design selection stays here, unchanged.
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        {/* Copy this item to other rooms (independent copies or linked children) */}
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.borderLight}` }}>
                          {copyPanelId === item.id ? (
                            <div onClick={e => e.stopPropagation()}>
                              <div style={{ fontFamily: font, fontSize: 12, fontWeight: 700, color: C.charcoal, marginBottom: 10 }}>
                                Copy to rooms
                              </div>
                              {/* Mode toggle */}
                              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, marginBottom: 12, width: "fit-content" }}>
                                {[{ key: "independent", label: "Independent copies" }, { key: "linked", label: "Linked to this item" }].map(opt => (
                                  <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() => setCopyMode(opt.key)}
                                    style={{
                                      padding: "7px 14px", border: "none", minHeight: 44,
                                      background: copyMode === opt.key ? C.mint : C.white,
                                      color: copyMode === opt.key ? C.white : C.textSecondary,
                                      fontFamily: font, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                    }}
                                  >{opt.label}</button>
                                ))}
                              </div>
                              {/* Room checkboxes — exclude the item's current room */}
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                                {FINISH_ROOMS.filter(r => r.id !== item.room).map(r => {
                                  const checked = copyRooms.includes(r.id);
                                  return (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={() => setCopyRooms(prev => checked ? prev.filter(x => x !== r.id) : [...prev, r.id])}
                                      style={{
                                        padding: "6px 12px", borderRadius: 8, minHeight: 44,
                                        border: `1.5px solid ${checked ? C.mint : C.border}`,
                                        background: checked ? C.seafoamFaint : C.white,
                                        color: checked ? C.mint : C.textSecondary,
                                        fontFamily: font, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                      }}
                                    >{checked ? "✓ " : ""}{r.label}</button>
                                  );
                                })}
                              </div>
                              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  onClick={() => createRoomCopies(item)}
                                  disabled={copyRooms.length === 0}
                                  style={{
                                    padding: "10px 18px", borderRadius: 8, border: "none", minHeight: 44,
                                    background: C.mint, color: C.white, fontFamily: font, fontSize: 13, fontWeight: 700,
                                    cursor: copyRooms.length === 0 ? "default" : "pointer",
                                    opacity: copyRooms.length === 0 ? 0.5 : 1,
                                  }}
                                >Create copies</button>
                                <button
                                  type="button"
                                  onClick={() => { setCopyPanelId(null); setCopyRooms([]); }}
                                  style={{ background: "none", border: "none", color: C.textMuted, fontFamily: font, fontSize: 12, cursor: "pointer", padding: "10px 8px", minHeight: 44 }}
                                >Cancel</button>
                              </div>
                              <div style={{ fontFamily: font, fontSize: 11, color: C.textMuted, marginTop: 10 }}>
                                {copyMode === "linked"
                                  ? "Linked rooms inherit this item's selection & price automatically; each keeps its own quantity, notes, owner, and date."
                                  : "Independent copies start from this item's selection & price but can be edited separately per room."}
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); openCopyPanel(item); }}
                                style={{ padding: "10px 18px", borderRadius: 8, minHeight: 44, border: `1.5px solid ${C.mint}`, background: C.white, color: C.mint, fontFamily: font, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                              >Copy to rooms…</button>
                              {copyToast && (
                                <span style={{ marginLeft: 12, fontFamily: font, fontSize: 12, fontWeight: 600, color: C.mint, background: C.seafoamFaint, padding: "7px 14px", borderRadius: 8 }}>{copyToast}</span>
                              )}
                            </>
                          )}
                        </div>
                        </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div style={{
          textAlign: "center", padding: "48px 24px",
          fontFamily: font, fontSize: 14, color: C.textMuted,
        }}>
          No items match your filters. Try adjusting the search or the trade, room, and status filters above.
        </div>
      )}
    </div>
  );
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function mergeTasks(saved) {
  if (!saved || !Array.isArray(saved)) return DEFAULT_TASKS;
  const defaultIds = new Set(DEFAULT_TASKS.map(t => t.id));
  const merged = DEFAULT_TASKS.map(t => {
    const s = saved.find(s => s.id === t.id);
    return s ? { ...t, done: s.done, notes: s.notes ?? t.notes, assignee: s.assignee ?? null, dueDate: s.dueDate ?? null, completedDate: s.completedDate ?? null } : t;
  });
  const userTasks = saved.filter(s => s.userCreated && !defaultIds.has(s.id));
  return [...merged, ...userTasks];
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────

// ─── PURCHASES (Phase 2) ─────────────────────────────────────────────────────
// What we actually bought — scoped per property, independent of the Design schedule.
// Persisted server-side as a Redis hash (one field per purchase) via /api/purchases;
// localStorage is a local read-cache only. Field names mirror the Excel expense tracker.

const LS_PURCHASES = "pool-paddle-purchases-v1";

// Purchase/cost-seg domain constants + pure helpers (PURCHASE_TRADES, ALLOWANCE_CATEGORIES,
// suggestAssetClass, buildCostSegCsv, emptyPurchase, fmtUSD, …) live in
// ./lib/purchases-logic.js (imported at the top of this file) so they can be unit-tested
// in plain node. Browser-dependent receipt helpers stay below.

function receiptViewUrl(pathname) {
  return `/api/receipts-view?pathname=${encodeURIComponent(pathname)}`;
}
function loadPurchasesFromCache(propertyId) {
  try {
    const raw = localStorage.getItem(lsKey(LS_PURCHASES, propertyId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalizePurchase);
    }
  } catch (e) { /* fall through to empty */ }
  return [];
}

// A user-facing upload problem (bad format, too big) — its .message is safe to show as-is.
class ReceiptUploadError extends Error {}

// Max RAW bytes we'll send for a passthrough (non-image) file. The server caps the decoded
// buffer at 2.5 MB and Vercel caps the whole request body at 4.5 MB; base64 inflates ~1.37x,
// so keep raw comfortably under ~2.4 MB and fail fast (before uploading) if it's larger.
const MAX_RAW_UPLOAD_BYTES = 2.4 * 1024 * 1024;

// Build the upload payload for a receipt file. ALL still images — including iPhone/Android
// HEIC/HEIF — are decoded, downscaled and re-encoded to JPEG, so uploads stay tiny AND are
// universally viewable (Android Chrome can't render HEIC). If the browser can't decode the
// image (e.g. Android Chrome + HEIC), we throw a clear, actionable error instead of letting
// a multi-MB raw file get silently rejected. PDFs pass through (size-checked first).
// Returns { name, contentType, dataBase64 } or throws.
async function buildReceiptUpload(file) {
  const type = (file.type || "").toLowerCase();
  const name = file.name || "receipt";
  const looksLikeImage = type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/i.test(name);
  // GIFs stay as-is (canvas would flatten animation); everything else image-like → JPEG.
  if (looksLikeImage && type !== "image/gif") {
    try {
      const dataBase64 = await compressImageToBase64(file, 1400, 0.75);
      return { name: name.replace(/\.\w+$/, "") + ".jpg", contentType: "image/jpeg", dataBase64 };
    } catch (e) {
      throw new ReceiptUploadError(
        "This photo couldn't be processed on this device (often an iPhone HEIC photo opened on Android). " +
        "Set your iPhone camera to \"Most Compatible\" (Settings ▸ Camera ▸ Formats), or attach a screenshot or PDF instead."
      );
    }
  }
  // Passthrough (PDF, GIF, …). Size-check BEFORE base64-encoding and uploading a file the
  // server would only reject — saves the owner a long cellular round-trip.
  if (typeof file.size === "number" && file.size > MAX_RAW_UPLOAD_BYTES) {
    throw new ReceiptUploadError(
      `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is about 2.5 MB. ` +
      "Try a photo of the receipt, or a smaller / compressed PDF."
    );
  }
  const dataBase64 = await fileToBase64(file);
  return { name, contentType: file.type || "application/octet-stream", dataBase64 };
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
function compressImageToBase64(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (Math.max(width, height) > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1] || "");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image decode failed")); };
    img.src = url;
  });
}

const ppInput = {
  // fontSize 16 is the minimum that stops iOS Safari from auto-zooming the page on focus.
  width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
  fontFamily: font, fontSize: 16, color: C.charcoal, background: C.white, outline: "none",
  boxSizing: "border-box",
};
const ppLabel = { display: "block", fontSize: 12, fontWeight: 600, color: C.textSecondary, marginBottom: 5 };

// Self-contained receipt attach/list/remove control, reused in the purchase form (attach
// while creating) and the expanded purchase row. Offers BOTH "take a photo" (camera) and
// "choose photo or file" (library / Files / PDF, multi-select) — the primary trigger has no
// `capture` so the owner can pick an existing photo, per the app's core requirement. Handles
// HEIC→JPEG conversion, size limits, upload timeout, and per-control retry.
// viewablePaths: Set of pathnames that are actually persisted (so their view link works);
//   undefined → treat all as viewable (used by the already-saved expanded row).
// deferBlobDelete: when true, removing a receipt only updates the array; the owner (the
//   PurchaseForm) reconciles the underlying blob on Save/teardown so a discarded edit never
//   deletes a blob the saved record still references.
// onBlobUploaded(pathname): notified after each successful upload so the form can track and
//   clean up blobs that were uploaded but never committed.
function ReceiptUploader({ propertyId, purchaseId, receipts, onChange, viewablePaths, deferBlobDelete = false, onBlobUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null); // { message, retryable } | null
  const lastFileRef = useRef(null);
  const isViewable = (pathname) => !viewablePaths || viewablePaths.has(pathname);
  const anyPending = (receipts || []).some(r => !isViewable(r.pathname));

  // Upload one file; returns the receipt record on success, or null (and sets error) on failure.
  const uploadOne = async (file) => {
    setError(null);
    lastFileRef.current = file;
    setUploading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000); // generous cap for slow cellular
    try {
      const payload = await buildReceiptUpload(file);
      const res = await fetch("/api/receipts-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, purchaseId, ...payload }),
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 413) {
          setError({ message: "That file is too large (about 2.5 MB max). Try a photo of the receipt, or a smaller / compressed file.", retryable: false });
        } else {
          const body = await res.json().catch(() => ({}));
          setError({ message: (body && body.error) || "Upload failed. Please try again.", retryable: true });
        }
        return null;
      }
      const { pathname, name, contentType } = await res.json();
      lastFileRef.current = null;
      return { pathname, name, contentType, uploadedAt: new Date().toISOString() };
    } catch (e) {
      if (e && e.name === "AbortError") {
        setError({ message: "Upload timed out — check your connection and tap Retry.", retryable: true });
      } else if (e instanceof ReceiptUploadError) {
        setError({ message: e.message, retryable: false });
      } else if (e instanceof TypeError) {
        setError({ message: "Couldn't reach the server — check your connection and tap Retry.", retryable: true });
      } else {
        setError({ message: "Could not process that file.", retryable: false });
      }
      return null;
    } finally {
      clearTimeout(timer);
      setUploading(false);
    }
  };

  // Upload a batch sequentially, accumulating so we never overwrite a just-added receipt
  // (the `receipts` prop is stale within a single loop). Continue past a failed file so the
  // rest of the batch isn't silently dropped, then summarize what failed.
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    let current = receipts || [];
    const failed = [];
    for (const f of files) {
      const added = await uploadOne(f);
      if (added) {
        current = [...current, added];
        onChange(current);
        if (onBlobUploaded) onBlobUploaded(added.pathname);
      } else {
        failed.push(f.name || "a file");
      }
    }
    // For a single file, uploadOne's specific (retryable) error already stands. For a batch,
    // a later success would have cleared that error — so surface a summary of what didn't upload.
    if (files.length > 1 && failed.length > 0) {
      setError({ message: `${failed.length} file(s) couldn't be uploaded: ${failed.join(", ")}. Tap a button above to try those again.`, retryable: false });
    }
  };

  const retryLast = async () => {
    const f = lastFileRef.current;
    if (!f) return;
    const added = await uploadOne(f);
    if (added) { onChange([...(receipts || []), added]); if (onBlobUploaded) onBlobUploaded(added.pathname); }
  };

  const removeReceipt = (pathname) => {
    if (!window.confirm("Remove this receipt?")) return;
    onChange((receipts || []).filter(r => r.pathname !== pathname));
    // Immediate-persist contexts (the saved expanded row) delete the blob now, atomically with
    // the record update. Deferred contexts (an open form) leave the blob for the form to
    // reconcile on Save/teardown, so a cancelled edit never strands the saved record.
    if (!deferBlobDelete) {
      fetch("/api/receipts-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname, purchaseId }),
      }).catch(() => {});
    }
  };

  const trigger = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    fontSize: 14, fontWeight: 600, borderRadius: 8, padding: "12px 16px", minHeight: 44,
    boxSizing: "border-box", cursor: uploading ? "wait" : "pointer",
  };

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Receipts</div>
      {(receipts || []).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {(receipts || []).map(r => (
            <span key={r.pathname} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 8, paddingLeft: 10 }}>
              {isViewable(r.pathname) ? (
                <a href={receiptViewUrl(r.pathname)} target="_blank" rel="noreferrer" style={{ color: C.mint, textDecoration: "none", fontWeight: 600, padding: "10px 2px" }}>{r.name || "receipt"}</a>
              ) : (
                // Not yet persisted: the view route requires the receipt to be referenced by a
                // saved purchase, so a link would 404 until Save. Show the name (non-link).
                <span title="Viewable after you save this purchase" style={{ color: C.textSecondary, fontWeight: 600, padding: "10px 2px" }}>{r.name || "receipt"}</span>
              )}
              <button onClick={() => removeReceipt(r.pathname)} title="Remove receipt" aria-label="Remove receipt" style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "10px 12px", minWidth: 44, minHeight: 44 }}>×</button>
            </span>
          ))}
        </div>
      )}
      {anyPending && (
        <p style={{ fontSize: 11, color: C.textMuted, margin: "0 0 8px" }}>Attached — viewable after you save this purchase.</p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <label style={{ ...trigger, color: C.mintDark, background: C.seafoamFaint, border: `1.5px dashed ${C.mint}` }}>
          {uploading ? "Uploading…" : "🖼️ Choose photo or file"}
          <input type="file" accept="image/*,application/pdf" multiple disabled={uploading} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
        </label>
        <label style={{ ...trigger, color: C.textSecondary, background: C.white, border: `1.5px solid ${C.border}` }}>
          📷 Take photo
          <input type="file" accept="image/*" capture="environment" disabled={uploading} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
        </label>
      </div>
      {error && (
        <div style={{ color: C.ocean, fontSize: 12, marginTop: 6 }}>
          {error.message}
          {error.retryable && lastFileRef.current && (
            <button onClick={retryLast} style={{ marginLeft: 8, background: "none", border: "none", color: C.mint, fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}>Retry</button>
          )}
        </div>
      )}
      <p style={{ fontSize: 11, color: C.textMuted, margin: "6px 0 0" }}>Take a photo or pick an existing photo / PDF. iPhone photos are converted automatically.</p>
    </div>
  );
}

// Receipts are handled with a DEFERRED model: files upload to Blob immediately (we need the
// pathname), but the receipt array commits to the record only on Save — a single whole-record
// write, so it never races the field-edit Save (the concurrency pattern CLAUDE.md forbids).
// A removed receipt's blob is reconciled on Save; blobs uploaded but never committed are
// cleaned up on teardown (Cancel / tap-away / tab-switch) unless a draft still holds them.
const MEANINGFUL_PURCHASE_FIELDS = [
  "description", "vendor", "invoiceNo", "trade", "room", "notes",
  "purchaseDate", "receivedDate", "qty", "unitPrice", "tax", "shipping", "totalPaid",
  "sourceVendor", "docType", "fees", "discount", "returnByDate", "returnPolicyNote", "refundAmount", "drawNo",
];
function draftHasContent(parsed) {
  if (!parsed || typeof parsed !== "object" || !parsed.id) return false;
  if ((parsed.receipts || []).length > 0) return true;
  return MEANINGFUL_PURCHASE_FIELDS.some(k => {
    const v = parsed[k];
    return typeof v === "string" ? v.trim() !== "" : (v !== null && v !== undefined);
  });
}
function PurchaseForm({ initial, onSave, onCancel, propertyId, isMobile, draftKey, fresh = false, reimbursableVendors }) {
  const [d, setD] = useState(() => {
    // Restore an in-progress draft (e.g. after an accidental pull-to-refresh or a
    // backgrounded-tab discard on mobile) so the owner never loses a long form. Only restore
    // a draft that has real content, so an untouched open doesn't silently resurface later.
    if (draftKey) {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) { const parsed = JSON.parse(raw); if (draftHasContent(parsed)) return normalizePurchase(parsed); }
      } catch (e) { /* ignore malformed draft */ }
    }
    return initial;
  });
  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  const clearDraft = () => { if (draftKey) { try { localStorage.removeItem(draftKey); } catch (e) { /* ignore */ } } };
  useEffect(() => {
    if (!draftKey) return;
    try { localStorage.setItem(draftKey, JSON.stringify(d)); } catch (e) { /* quota/full — ignore */ }
  }, [d, draftKey]);

  const initialReceiptPaths = new Set((initial.receipts || []).map(r => r.pathname));
  // Blob pathnames uploaded during this session. Seeded from a restored draft's not-yet-saved
  // receipts (fresh opens → []) so a reload-then-remove/cancel still reconciles their blobs.
  const sessionUploadedRef = useRef((d.receipts || []).filter(r => r && !initialReceiptPaths.has(r.pathname)).map(r => r.pathname));
  const savedRef = useRef(false);           // did the owner Save (vs. discard)?
  const deleteBlobs = (pathnames) => pathnames.forEach(pathname =>
    fetch("/api/receipts-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pathname, purchaseId: d.id }) }).catch(() => {}));

  // Teardown cleanup: if the form is discarded (not Saved), best-effort delete blobs uploaded
  // this session that were never committed. Skip when a draft still persists (a reload/tab
  // switch we intend to resume) so the restored draft's receipts still resolve.
  useEffect(() => () => {
    if (savedRef.current) return;
    if (draftKey) { try { if (localStorage.getItem(draftKey)) return; } catch (e) { /* fall through */ } }
    deleteBlobs(sessionUploadedRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const noteUploaded = (pathname) => { sessionUploadedRef.current.push(pathname); };
  const changeReceipts = (rs) => set({ receipts: rs });
  const handleCancel = () => { clearDraft(); onCancel(); }; // teardown effect cleans up blobs
  const handleSave = () => {
    savedRef.current = true;
    clearDraft();
    // Reconcile blobs against the saved record: delete any existing receipt the owner removed,
    // plus any uploaded-then-removed this session; keep everything still referenced.
    const finalPaths = new Set((d.receipts || []).map(r => r.pathname));
    const orphaned = [...new Set([...initialReceiptPaths, ...sessionUploadedRef.current])].filter(p => !finalPaths.has(p));
    onSave(d);
    deleteBlobs(orphaned);
  };
  // "Touched" refs: a default (allowance category, reimbursement) only follows trade/payer/vendor
  // edits while the user has not set that field themselves. A saved record starts touched (see
  // formDefaultsTouched), so editing it never silently overrides what the owner chose.
  // A record that has already been through an owner Save (`fresh` false) always starts touched.
  const initialTouched = formDefaultsTouched(d, fresh);
  const allowanceTouched = useRef(initialTouched.allowance);
  const reimbTouched = useRef(initialTouched.reimb);
  const allowanceFor = (trade, paidBy) => defaultAllowanceFor(trade, paidBy) || NOT_IN_ALLOWANCE;
  const num = (k) => (e) => set({ [k]: e.target.value === "" ? null : Number(e.target.value) });
  const checkRow = (k, text, extra) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.charcoal, padding: "9px 0", minHeight: 44, boxSizing: "border-box" }}>
      <input type="checkbox" checked={!!d[k]} onChange={e => set({ [k]: e.target.checked, ...(extra ? extra(e.target.checked) : {}) })} style={{ accentColor: C.mint, width: 16, height: 16 }} /> {text}
    </label>
  );
  const groupHead = (title, note) => (
    <div style={{ marginTop: 4, marginBottom: 6, fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {title}{note && <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}> — {note}</span>}
    </div>
  );
  const computedTotal = purchaseComputedTotal(d);

  const field = (label, node) => (
    <div style={{ flex: 1, minWidth: isMobile ? "100%" : 140 }}><label style={ppLabel}>{label}</label>{node}</div>
  );

  return (
    <div style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Item / Description", <input autoFocus style={ppInput} value={d.description} onChange={e => set({ description: e.target.value })} placeholder="e.g. Blanco undermount sink" />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Trade", <select style={ppInput} value={d.trade} onChange={e => { const trade = e.target.value; const patch = { trade, assetClass: d.assetClass || suggestAssetClass(trade) }; if (!allowanceTouched.current) patch.allowanceCategory = allowanceFor(trade, d.purchasedBy); set(patch); }}><option value="">—</option>{PURCHASE_TRADES.map(t => <option key={t} value={t}>{t}</option>)}</select>)}
        {field("Room / Area", <input style={ppInput} value={d.room} onChange={e => set({ room: e.target.value })} placeholder="e.g. Kitchen" />)}
        {field("Status", <select style={ppInput} value={d.status} onChange={e => set(statusChangePatch(d, e.target.value))}>{PURCHASE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Vendor", <input style={ppInput} value={d.vendor} onChange={e => { const vendor = e.target.value; set(reimbTouched.current ? { vendor } : { vendor, ...reimbursementDefaultsFor(vendor, d.purchasedBy, reimbursableVendors) }); }} placeholder="e.g. Ferguson" />)}
        {field("Order / Invoice #", <input style={ppInput} value={d.invoiceNo} onChange={e => set({ invoiceNo: e.target.value })} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Paid by", <select style={ppInput} value={d.purchasedBy} onChange={e => { const v = e.target.value; const patch = { purchasedBy: v, ownerPurchased: v !== CONTRACTOR_PURCHASER }; if (!allowanceTouched.current) patch.allowanceCategory = allowanceFor(d.trade, v); Object.assign(patch, !reimbTouched.current ? reimbursementDefaultsFor(d.vendor, v, reimbursableVendors) : payerChangePatch(d, v, reimbursableVendors)); set(patch); }}><option value="">—</option>{PURCHASED_BY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select>)}
        {field("Payment method", <select style={ppInput} value={d.paymentMethod} onChange={e => set({ paymentMethod: e.target.value })}><option value="">—</option>{PAYMENT_METHODS.map(p => <option key={p} value={p}>{p}</option>)}</select>)}
        {field("Whose money?", (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.charcoal, padding: "9px 0" }}>
            <input type="checkbox" checked={!!d.ownerPurchased} onChange={e => set({ ownerPurchased: e.target.checked, ...(e.target.checked ? {} : reimbursementDefaultsFor("", "")) })} style={{ accentColor: C.mint, width: 16, height: 16 }} />
            {d.ownerPurchased ? "Owner-purchased (our money)" : "Contractor / Exhibit B allowance"}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Qty", <input type="number" style={ppInput} value={d.qty ?? ""} onChange={e => set({ qty: e.target.value === "" ? null : Number(e.target.value) })} />)}
        {field("Unit price ($)", <input type="number" step="0.01" style={ppInput} value={d.unitPrice ?? ""} onChange={e => set({ unitPrice: e.target.value === "" ? null : Number(e.target.value) })} />)}
        {field("Tax ($)", <input type="number" step="0.01" style={ppInput} value={d.tax ?? ""} onChange={e => set({ tax: e.target.value === "" ? null : Number(e.target.value) })} />)}
        {field("Shipping ($)", <input type="number" step="0.01" style={ppInput} value={d.shipping ?? ""} onChange={e => set({ shipping: e.target.value === "" ? null : Number(e.target.value) })} />)}
        {field("Fees ($)", <input type="number" step="0.01" style={ppInput} value={d.fees ?? ""} onChange={num("fees")} placeholder="transaction / processing" />)}
        {field("Discount ($)", <input type="number" step="0.01" style={ppInput} value={d.discount ?? ""} onChange={num("discount")} placeholder="order discount share" />)}
        {field("Total paid ($)", (
          <div>
            <input type="number" step="0.01" style={ppInput} value={d.totalPaid ?? ""} onChange={e => set({ totalPaid: e.target.value === "" ? null : Number(e.target.value) })} placeholder={computedTotal ? String(computedTotal) : ""} />
            {totalSuggestionNeeded(d) && (
              <button type="button" onClick={() => set({ totalPaid: computedTotal })} style={{ marginTop: 2, background: "none", border: "none", color: C.mint, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "6px 2px" }}>use {fmtUSD(computedTotal)}</button>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Allowance category", <select style={ppInput} value={d.allowanceCategory} onChange={e => { allowanceTouched.current = true; set({ allowanceCategory: e.target.value }); }}><option value={NOT_IN_ALLOWANCE}>{NOT_IN_ALLOWANCE}</option><option value={CONTRACTOR_SCOPE}>{CONTRACTOR_SCOPE}</option>{ALLOWANCE_CATEGORIES.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}</select>)}
        {field("Purchase date", <input type="date" style={ppInput} value={d.purchaseDate || ""} onChange={e => set({ purchaseDate: e.target.value })} />)}
        {field("Received date", <input type="date" style={ppInput} value={d.receivedDate || ""} onChange={e => set({ receivedDate: e.target.value })} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Warranty", (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.charcoal, padding: "9px 0" }}>
            <input type="checkbox" checked={!!d.warranty} onChange={e => set({ warranty: e.target.checked })} style={{ accentColor: C.mint, width: 16, height: 16 }} /> Has warranty
          </label>
        ))}
        {field("Warranty term", <input style={ppInput} value={d.warrantyTerm} onChange={e => set({ warrantyTerm: e.target.value })} placeholder="e.g. 5 years" />)}
        {field("Registered", (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.charcoal, padding: "9px 0" }}>
            <input type="checkbox" checked={!!d.registered} onChange={e => set({ registered: e.target.checked })} style={{ accentColor: C.mint, width: 16, height: 16 }} /> Registered
          </label>
        ))}
        {field("Binder pocket", <input style={ppInput} value={d.binderPocket} onChange={e => set({ binderPocket: e.target.value })} />)}
      </div>
      {groupHead("Sparrow reimbursement", "Sparrow reimburses owner-paid purchases through loan draws")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Sparrow reimburses", checkRow("reimbursable", "Reimbursable", (on) => { reimbTouched.current = true; return on ? { reimbursedBy: CONTRACTOR_PURCHASER, reimbursementStatus: d.reimbursementStatus === "none" ? "pending" : d.reimbursementStatus } : { reimbursedBy: "", reimbursementStatus: "none" }; }))}
        {field("Reimbursement status", <select style={ppInput} value={d.reimbursementStatus} onChange={e => { reimbTouched.current = true; const st = e.target.value; const patch = { reimbursementStatus: st }; if (st === "reimbursed" && d.reimbursedAmount == null) patch.reimbursedAmount = netCost(d); set(patch); }}>{REIMBURSEMENT_STATUSES.map(r => <option key={r} value={r}>{r}</option>)}</select>)}
        {field("Reimbursed amount ($)", <input type="number" step="0.01" style={ppInput} value={d.reimbursedAmount ?? ""} onChange={e => { reimbTouched.current = true; num("reimbursedAmount")(e); }} />)}
        {field("Reimbursed date", <input type="date" style={ppInput} value={d.reimbursedDate || ""} onChange={e => { reimbTouched.current = true; set({ reimbursedDate: e.target.value }); }} />)}
        {field("Draw #", <input style={ppInput} value={d.drawNo || ""} onChange={e => { reimbTouched.current = true; set({ drawNo: e.target.value }); }} placeholder="e.g. 3" />)}
      </div>
      {groupHead("Marketplace & payment proof")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Source vendor (brand behind a marketplace order)", <input style={ppInput} value={d.sourceVendor || ""} onChange={e => set({ sourceVendor: e.target.value })} placeholder="e.g. Ferguson Home" />)}
        {field("Document type", <select style={ppInput} value={d.docType || ""} onChange={e => set({ docType: e.target.value })}><option value="">—</option>{DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>)}
        {d.purchasedBy === CONTRACTOR_PURCHASER
          ? field("Lien waiver", checkRow("lienWaiverReceived", "Lien waiver received"))
          : field("Payment", checkRow("paymentConfirmed", "Payment confirmed"))}
        {paymentBadge(d) && <div style={{ alignSelf: "center", fontSize: 12, fontWeight: 700, color: C.warnText, background: C.warnBg, padding: "4px 10px", borderRadius: 8 }}>{paymentBadge(d)}</div>}
      </div>
      {groupHead("Returns")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Return by", <input type="date" style={ppInput} value={d.returnByDate || ""} onChange={e => set({ returnByDate: e.target.value })} />)}
        {field("Return policy note", <input style={ppInput} value={d.returnPolicyNote || ""} onChange={e => set({ returnPolicyNote: e.target.value })} placeholder="e.g. 30 days, brand pays shipping" />)}
        {field("Refund amount ($)", <input type="number" step="0.01" style={ppInput} value={d.refundAmount ?? ""} onChange={e => set({ refundAmount: e.target.value === "" ? null : Number(e.target.value), refundAutoFilled: false })} />)}
        {field("Refund date", <input type="date" style={ppInput} value={d.refundDate || ""} onChange={e => set({ refundDate: e.target.value })} />)}
        {field("Restocking fee ($)", <input type="number" step="0.01" style={ppInput} value={d.restockingFee ?? ""} onChange={num("restockingFee")} />)}
        {field("Return shipping ($)", <input type="number" step="0.01" style={ppInput} value={d.returnShippingCost ?? ""} onChange={num("returnShippingCost")} />)}
        {field("Decision", checkRow("keepConfirmed", "Decided to keep"))}
      </div>
      {groupHead("Receiving")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Inspected", checkRow("inspected", "Inspected / tested"))}
        {field("Inspected date", <input type="date" style={ppInput} value={d.inspectedDate || ""} onChange={e => set({ inspectedDate: e.target.value })} />)}
        {field("Delivered to", <select style={ppInput} value={d.deliveredTo || ""} onChange={e => set({ deliveredTo: e.target.value })}><option value="">—</option>{DELIVERED_TO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}</select>)}
      </div>
      <div style={{ marginTop: 4, marginBottom: 6, fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Cost-seg <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>— suggested; confirm with your CPA</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Placed in service", <input type="date" style={ppInput} value={d.placedInServiceDate || ""} onChange={e => set({ placedInServiceDate: e.target.value })} />)}
        {field("Asset class", <select style={ppInput} value={d.assetClass} onChange={e => set({ assetClass: e.target.value })}><option value="">— (unset)</option>{ASSET_CLASSES.map(a => <option key={a} value={a}>{assetClassLabel(a)}</option>)}</select>)}
        {field("Section", <select style={ppInput} value={d.section} onChange={e => set({ section: e.target.value })}><option value="">— (blank)</option><option value="1245">§1245 (personal property)</option><option value="1250">§1250 (real property)</option></select>)}
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={ppLabel}>Notes</label>
        <textarea style={{ ...ppInput, minHeight: 60, resize: "vertical" }} value={d.notes} onChange={e => set({ notes: e.target.value })} />
      </div>
      {/* Attach a receipt right here while creating/editing — no need to save first. The
          purchase already has an id (emptyPurchase mints one), so receipts upload against it
          and are saved with the record. */}
      <div style={{ marginBottom: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <ReceiptUploader
          propertyId={propertyId}
          purchaseId={d.id}
          receipts={d.receipts || []}
          onChange={changeReceipts}
          viewablePaths={initialReceiptPaths}
          deferBlobDelete
          onBlobUploaded={noteUploaded}
        />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={handleSave} disabled={!(d.description || "").trim()} style={{ padding: "12px 18px", minHeight: 44, borderRadius: 8, border: "none", background: (d.description || "").trim() ? C.mint : C.border, color: C.white, fontFamily: font, fontSize: 15, fontWeight: 700, cursor: (d.description || "").trim() ? "pointer" : "not-allowed" }}>Save purchase</button>
        <button onClick={handleCancel} style={{ padding: "12px 18px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.textSecondary, fontFamily: font, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

// ─── RECEIPT INBOX ───────────────────────────────────────────────────────────
// Upload receipts → the server reads them with Claude (api/receipt-extract.js) → review everything here → File creates
// Purchases. Nothing is filed without a click, and an extraction failure never blocks entering a purchase by hand.
// Pure logic (validation, reconcile, cost allocation, matching, purchase building) is in src/lib/receipt-logic.js.

async function sha256Hex(file) {
  try {
    if (!(window.crypto && window.crypto.subtle)) return "";
    const buf = await window.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (e) { return ""; }
}

const inboxBtn = { padding: "10px 16px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.charcoal, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer" };
const inboxBtnPrimary = { ...inboxBtn, border: `1px solid ${C.mint}`, background: C.mint, color: C.white, fontWeight: 700 };
const inboxChip = (color, bg) => ({ fontSize: 11, fontWeight: 700, color, background: bg, padding: "3px 9px", borderRadius: 12, whiteSpace: "nowrap" });

function ReceiptInboxCard({ record, shoppingItems, purchases, inbox, propertyAddress, onChange, onChangeNow, onFile, onRetry, onRemove, onOpenPurchase, isMobile }) {
  const ex = record.extraction;
  const [order, setOrder] = useState(() => ({ purchasedBy: "", paymentMethod: null }));   // paymentMethod null = not touched → the extraction's suggestion
  const shownOrder = { ...order, paymentMethod: order.paymentMethod ?? (ex ? suggestPaymentMethod(ex.paymentMethod) : "") };   // what the form shows is exactly what gets filed
  const [filing, setFiling] = useState(false);
  const activeItems = useMemo(() => sortItemsAlpha((shoppingItems || []).filter(i => i && !i.dismissed)), [shoppingItems]);

  // First time the reviewer sees an extraction: link lines to shopping items (exact SKU, then name similarity).
  useEffect(() => {
    if (record.status === "extracted" && ex && ex.lines.some(l => l.matchScore == null)) {
      const m = matchLines(ex.lines, shoppingItems);
      onChange({ ...record, extraction: { ...ex, lines: applyMatches(ex.lines, m) } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id, record.status]);

  const setEx = (patch) => { const next = { ...ex, ...patch }; next.reconciles = reconciles(next); onChange({ ...record, extraction: next }); };
  const setLine = (i, patch) => setEx({ lines: ex.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const numField = (v) => (v === "" ? null : Number(v));
  const fld = (label, node, w = 130) => (<div style={{ flex: 1, minWidth: isMobile ? "45%" : w }}><label style={ppLabel}>{label}</label>{node}</div>);
  const acc = ex ? ex.lines.filter(l => l.decision === "accept").length : 0;
  const problems = ex ? fileProblems(ex, shownOrder) : [];
  const dups = ex ? findDuplicates(ex, record.receipt, purchases, inbox, record.id, record.purchaseIds) : [];
  const addrOk = ex ? addressMatches(ex.shipTo, propertyAddress) : null;
  const fileName = (record.receipt && record.receipt.name) || "receipt";
  const link = record.receipt && record.receipt.pathname ? (
    <a href={receiptViewUrl(record.receipt.pathname)} target="_blank" rel="noreferrer" style={{ color: C.mint, fontWeight: 700, textDecoration: "none" }}>{fileName}</a>
  ) : fileName;
  const stale = record.status === "pending" && record.updatedAt && Date.now() - new Date(record.updatedAt).getTime() > 3 * 60 * 1000;

  const doFile = () => {
    if (filing || problems.length) return;
    if (dups.length > 0 && !window.confirm(`This may already be on file:\n\n• ${dups.map(d => d.reason).join("\n• ")}\n\nFile it anyway?`)) return;
    setFiling(true);
    Promise.resolve(onFile(record, shownOrder)).then(ok => { if (ok === false) setFiling(false); });
  };

  const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 12 };
  if (record.status === "pending") {
    return (
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div><strong>{link}</strong> <span style={inboxChip(C.textSecondary, C.pageBg)}>reading…</span></div>
          {stale && <button onClick={() => onRetry(record)} style={inboxBtn}>Retry</button>}
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: C.textMuted }}>Claude is reading this receipt (usually under a minute). You can keep working.</p>
      </div>
    );
  }
  if (record.status === "needs-manual") {
    return (
      <div style={{ ...card, borderColor: C.warnText }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div><strong>{link}</strong> <span style={inboxChip(C.warnText, C.warnBg)}>needs manual entry</span></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onRetry(record)} style={inboxBtnPrimary}>Retry</button>
            <button onClick={() => { if (window.confirm("Dismiss this receipt? The file stays attached to nothing; you can still add the purchase by hand.")) onChangeNow({ ...record, status: "dismissed" }); }} style={inboxBtn}>Dismiss</button>
          </div>
        </div>
        <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, color: C.warnText, fontWeight: 600 }}>{record.error || "The receipt could not be read."}</p>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: C.textMuted }}>The receipt is safe. Press Retry, or use “+ Add purchase” to enter it by hand (open the file link above to read it).</p>
      </div>
    );
  }
  if (!ex) return null;
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 15 }}><strong>{ex.vendor || "(vendor?)"}</strong> <span style={{ color: C.textMuted }}>· {ex.docType}{ex.orderNo ? ` · #${ex.orderNo}` : ""}</span></div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{link}{ex.paidDate || ex.orderDate ? ` · ${ex.paidDate || ex.orderDate}` : ""}{ex.cardLast4 ? ` · card ending ${ex.cardLast4}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={ex.reconciles ? inboxChip(C.mintDark, C.seafoamLight) : inboxChip(C.warnText, C.warnBg)}>{ex.reconciles ? "totals match" : "totals don't reconcile"}</span>
          {ex.handwritten && <span style={inboxChip(C.warnText, C.warnBg)}>handwritten</span>}
          {ex.docType !== "receipt" && <span style={inboxChip(C.warnText, C.warnBg)}>{ex.docType} — not proof of payment</span>}
        </div>
      </div>

      {ex.issues.length > 0 && (
        <div role="alert" style={{ background: C.warnBg, border: `1px solid ${C.warnText}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.warnText, marginBottom: 4 }}>Check these first — Claude would not guess:</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.charcoal, lineHeight: 1.5 }}>{ex.issues.map((t, i) => <li key={i}>{t}</li>)}</ul>
          <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 6 }}>“Accept all” is off until you review each line yourself and fill in any blank prices or the total.</div>
        </div>
      )}
      {ex.handwritten && <p style={{ margin: "0 0 8px", fontSize: 12, color: C.warnText }}>Handwritten document — every line starts flagged for review.</p>}
      {addrOk === false && <p style={{ margin: "0 0 8px", fontSize: 13, color: C.warnText, fontWeight: 600 }}>⚠ Receipt says “{ex.shipTo}”; the property is {propertyAddress}. Ask the vendor for a corrected copy for your records. (You can still file it.)</p>}
      {dups.length > 0 && <p style={{ margin: "0 0 8px", fontSize: 13, color: C.warnText, fontWeight: 600 }}>⚠ Possible duplicate: {dups.map(d => d.reason).join("; ")}.</p>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        {fld("Who paid?", <select style={ppInput} value={order.purchasedBy} onChange={e => setOrder(o => ({ ...o, purchasedBy: e.target.value }))}><option value="">— choose —</option>{PURCHASED_BY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select>, 170)}
        {fld("Payment method", <select style={ppInput} value={shownOrder.paymentMethod} onChange={e => setOrder(o => ({ ...o, paymentMethod: e.target.value }))}><option value="">—</option>{PAYMENT_METHODS.map(p => <option key={p} value={p}>{p}</option>)}</select>, 170)}
        {fld("Tax ($)", <input type="number" step="0.01" style={ppInput} value={ex.tax ?? ""} onChange={e => setEx({ tax: numField(e.target.value) })} />)}
        {fld("Shipping ($)", <input type="number" step="0.01" style={ppInput} value={ex.shipping ?? ""} onChange={e => setEx({ shipping: numField(e.target.value) })} />)}
        {fld("Fees ($)", <input type="number" step="0.01" style={ppInput} value={ex.fees ?? ""} onChange={e => setEx({ fees: numField(e.target.value) })} />)}
        {fld("Order discount ($)", <input type="number" step="0.01" style={ppInput} value={ex.discounts ?? ""} onChange={e => setEx({ discounts: numField(e.target.value) })} />)}
        {fld("Order total ($)", <input type="number" step="0.01" style={{ ...ppInput, borderColor: ex.total == null ? C.warnText : C.border }} value={ex.total ?? ""} placeholder="enter the total" onChange={e => setEx({ total: numField(e.target.value) })} />)}
      </div>

      {ex.lines.map((l, i) => {
        const low = isLowConfidence(l, ex);
        const accepted = l.decision === "accept", skipped = l.decision === "skip";
        return (
          <div key={i} style={{ border: `1px solid ${accepted ? C.mint : low ? C.warnText : C.border}`, background: skipped ? C.pageBg : low ? C.warnBg : C.white, borderRadius: 10, padding: 10, marginBottom: 8, opacity: skipped ? 0.7 : 1 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.textMuted }}>Line {l.lineNo}</span>
              {low && <span style={inboxChip(C.warnText, C.white)}>check this line · {Math.round((l.confidence ?? 0) * 100)}% sure</span>}
              {l.sourceVendor && <span style={inboxChip(C.textSecondary, C.pageBg)}>via {l.sourceVendor}</span>}
              {l.roomHint && <span style={inboxChip(C.ocean, C.oceanLight)}>{l.roomHint}</span>}
              {l.matchItemId && <span style={inboxChip(C.mintDark, C.seafoamLight)}>linked to shopping item</span>}
              <span style={{ flex: 1 }} />
              <button onClick={() => setLine(i, { decision: accepted ? null : "accept" })} style={{ ...inboxBtn, ...(accepted ? { background: C.mint, color: C.white, borderColor: C.mint } : {}) }}>{accepted ? "✓ Accepted" : "Accept"}</button>
              <button onClick={() => setLine(i, { decision: skipped ? null : "skip" })} style={{ ...inboxBtn, ...(skipped ? { background: C.charcoal, color: C.white, borderColor: C.charcoal } : {}) }}>{skipped ? "Skipped" : "Skip"}</button>
              {i > 0 && <button onClick={() => onChange({ ...record, extraction: { ...ex, lines: mergeLines(ex.lines, i), reconciles: reconciles({ ...ex, lines: mergeLines(ex.lines, i) }) } })} style={inboxBtn} title="Combine this line with the one above (adds quantities and totals)">Merge into line above</button>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <div style={{ flex: 3, minWidth: isMobile ? "100%" : 240 }}><label style={ppLabel}>Description</label><input style={ppInput} value={l.description} onChange={e => setLine(i, { description: e.target.value })} /></div>
              {fld("Qty", <input type="number" style={ppInput} value={l.qty ?? ""} onChange={e => setLine(i, { qty: numField(e.target.value) })} />, 70)}
              {fld("Unit price ($)", <input type="number" step="0.01" style={ppInput} value={l.unitPrice ?? ""} onChange={e => setLine(i, { unitPrice: numField(e.target.value) })} />, 100)}
              {fld("Line total ($)", <input type="number" step="0.01" style={{ ...ppInput, borderColor: l.lineTotal == null ? C.warnText : C.border }} value={l.lineTotal ?? ""} placeholder="required" onChange={e => setLine(i, { lineTotal: numField(e.target.value) })} />, 110)}
              {fld("Trade (Purchases)", <select style={ppInput} value={l.suggestedTrade} onChange={e => setLine(i, { suggestedTrade: e.target.value })}>{PURCHASE_TRADES.map(t => <option key={t} value={t}>{t}</option>)}</select>, 170)}
              {fld("Category (Shopping)", <select style={ppInput} value={l.suggestedCategory || "Other"} onChange={e => setLine(i, categoryChangePatch(l, e.target.value))}>{sortedShoppingCategories().map(c => <option key={c} value={c}>{c}</option>)}</select>, 170)}
              {fld("Shopping item", <select style={ppInput} value={l.matchItemId || ""} onChange={e => setLine(i, { matchItemId: e.target.value || null })}><option value="">— none —</option>{activeItems.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}</select>, 170)}
              {!l.matchItemId && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 16, alignSelf: "flex-end", paddingBottom: 8 }}><input type="checkbox" checked={l.addToShopping !== false} onChange={e => setLine(i, { addToShopping: e.target.checked })} style={{ accentColor: C.mint, width: 18, height: 18 }} />Also add to Shopping list</label>}
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <button disabled={!canAcceptAll(ex)} title={canAcceptAll(ex) ? "" : "Disabled while there are issues or blank prices — accept lines one at a time"} onClick={() => onChange({ ...record, extraction: { ...ex, lines: acceptUndecided(ex.lines) } })} style={{ ...inboxBtn, opacity: canAcceptAll(ex) ? 1 : 0.5 }}>Accept all</button>
        <button disabled={problems.length > 0 || filing} onClick={doFile} style={{ ...inboxBtnPrimary, background: problems.length || filing ? C.border : C.mint, borderColor: problems.length || filing ? C.border : C.mint }}>{filing ? "Filing…" : `File ${acc} purchase${acc === 1 ? "" : "s"}`}</button>
        <button onClick={() => { if (window.confirm("Dismiss this receipt without filing anything?")) onChangeNow({ ...record, status: "dismissed" }); }} style={inboxBtn}>Dismiss</button>
      </div>
      {problems.length > 0 && <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: C.textSecondary }}>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
    </div>
  );
}

function ReceiptInboxPanel({ inbox, loaded, loadError, canUse, uploads, onUpload, onChange, onChangeNow, onRemove, onRetry, onFile, shoppingItems, purchases, propertyAddress, onOpenPurchase, notice, onDismissNotice, isMobile }) {
  const open = inbox.filter(r => ["pending", "extracted", "needs-manual"].includes(r.status)).sort((a, b) => String(a.receipt?.uploadedAt).localeCompare(String(b.receipt?.uploadedAt)));
  const done = inbox.filter(r => r.status === "filed" || r.status === "dismissed");
  const [expanded, setExpanded] = useState(null);       // null = follow "open if anything needs attention"
  const [showDone, setShowDone] = useState(false);
  const isOpen = expanded === null ? true : expanded;   // open by default: the upload buttons (or the reason they're off) are always visible
  const busy = uploads.length > 0;
  const trigger = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, fontWeight: 600, borderRadius: 8, padding: "12px 16px", minHeight: 44, boxSizing: "border-box", cursor: busy || !canUse ? "not-allowed" : "pointer", opacity: canUse ? 1 : 0.5 };
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
      <button onClick={() => setExpanded(!isOpen)} aria-expanded={isOpen} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, minHeight: 44, fontFamily: font, textAlign: "left" }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.charcoal }}>Receipt Inbox <span style={{ fontWeight: 600, color: C.textMuted, fontSize: 13 }}>— drop in receipts and review them in one place</span></span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {open.length > 0 && <span style={inboxChip(C.warnText, C.warnBg)}>{open.length} to review</span>}
          <span style={{ color: C.textMuted }}>{isOpen ? "▾" : "▸"}</span>
        </span>
      </button>
      {isOpen && (
        <div style={{ marginTop: 12 }}>
          {!canUse && <p style={{ fontSize: 13, color: C.textMuted }}>The inbox is available once this property is set up (open the app from the main address once to finish setup).</p>}
          {loadError && <p style={{ fontSize: 13, color: C.ocean, fontWeight: 600 }}>Couldn’t load the inbox — reload to try again.</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
            <label style={{ ...trigger, color: C.mintDark, background: C.seafoamFaint, border: `1.5px dashed ${C.mint}` }}>
              {busy ? "Working…" : "🖼️ Choose photos or files"}
              <input type="file" accept="image/*,application/pdf" multiple disabled={busy || !canUse} onChange={e => { onUpload(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
            <label style={{ ...trigger, color: C.textSecondary, background: C.white, border: `1.5px solid ${C.border}` }}>
              📷 Take photo
              <input type="file" accept="image/*" capture="environment" disabled={busy || !canUse} onChange={e => { onUpload(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
          </div>
          <p style={{ fontSize: 11, color: C.textMuted, margin: "0 0 10px" }}>Pick several at once. Nothing becomes a purchase until you review it and press File. iPhone photos are converted automatically.</p>
          {uploads.map(u => (
            <div key={u.key} style={{ fontSize: 13, color: u.error ? C.ocean : C.textSecondary, margin: "0 0 6px" }}>{u.error ? "⚠ " : "⏳ "}{u.name}: {u.error || u.stage}</div>
          ))}
          {notice && (
            <div role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, background: C.seafoamFaint, border: `1px solid ${C.mint}`, borderRadius: 8, padding: "8px 12px", margin: "0 0 10px", fontSize: 13, color: C.charcoal }}>
              <span>✓ {notice.text}</span>
              <button onClick={() => onOpenPurchase(notice.purchaseId)} style={inboxBtn}>Open the first purchase</button>
              <button onClick={onDismissNotice} aria-label="Dismiss" style={{ ...inboxBtn, border: "none", background: "none" }}>✕</button>
            </div>
          )}
          {!loaded && <p style={{ fontSize: 13, color: C.textMuted }}>Loading the inbox…</p>}
          {loaded && open.length === 0 && uploads.length === 0 && canUse && <p style={{ fontSize: 13, color: C.textMuted }}>Nothing waiting. Upload a receipt to have it read for you.</p>}
          {open.map(r => (
            <ReceiptInboxCard key={r.id} record={r} shoppingItems={shoppingItems} purchases={purchases} inbox={inbox} propertyAddress={propertyAddress}
              onChange={onChange} onChangeNow={onChangeNow} onFile={onFile} onRetry={onRetry} onRemove={onRemove} onOpenPurchase={onOpenPurchase} isMobile={isMobile} />
          ))}
          {done.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowDone(s => !s)} style={{ ...inboxBtn, border: "none", background: "none", color: C.textSecondary, padding: "6px 0", minHeight: 44 }}>{showDone ? "▾" : "▸"} Filed &amp; dismissed ({done.length})</button>
              {showDone && done.map(r => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: `1px solid ${C.borderLight}`, fontSize: 13 }}>
                  <span>
                    <strong>{(r.extraction && r.extraction.vendor) || r.receipt?.name || "receipt"}</strong>
                    <span style={{ color: C.textMuted }}> · {r.status === "filed" ? `filed ${r.purchaseIds.length} purchase${r.purchaseIds.length === 1 ? "" : "s"}` : "dismissed"}</span>
                    {r.receipt?.pathname && <> · <a href={receiptViewUrl(r.receipt.pathname)} target="_blank" rel="noreferrer" style={{ color: C.mint, textDecoration: "none", fontWeight: 600 }}>view receipt</a></>}
                  </span>
                  <span style={{ display: "flex", gap: 8 }}>
                    {r.status === "filed" && r.purchaseIds[0] && <button onClick={() => onOpenPurchase(r.purchaseIds[0])} style={inboxBtn}>Open purchases</button>}
                    <button onClick={() => { if (window.confirm("Remove this from the inbox history? Purchases already filed from it are kept, and the receipt file stays with them.")) onRemove(r.id); }} style={inboxBtn}>Remove</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PurchasesView({ purchases, activeProperty, onSave, onDelete, onReceiptsChange, onAddLine, reimbursableVendors, inboxPanel, focusPurchaseId, focusPurchaseMode, onFocusHandled, propertyInServiceDate, onSetInServiceDate }) {
  const [editingId, setEditingId] = useState(null);   // id | "new" | null
  const [expandedId, setExpandedId] = useState(null);
  const [query, setQuery] = useState("");
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const newFormRef = useRef(null);

  useEffect(() => {
    if (editingId === "new" && newFormRef.current) {
      newFormRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [editingId]);

  // When arriving from a Design "Mark as purchased →" promote, open that purchase in edit
  // mode so the owner can finish the details (vendor, total, who paid, receipt).
  useEffect(() => {
    if (focusPurchaseId && purchases.some(p => p.id === focusPurchaseId)) {
      setQuery("");                 // clear any active search so the promoted purchase is visible
      setTradeFilter("");           // ...and the trade / due-from-Sparrow filters (a new "Add line" has no trade yet)
      setDueFilter(false);
      setExpandedId(focusPurchaseId);
      setEditingId(focusPurchaseMode === "view" ? null : focusPurchaseId);
      setFreshEditId(focusPurchaseMode === "view" ? null : focusPurchaseId);
      const focusId = focusPurchaseId;
      setTimeout(() => { const el = document.getElementById(`purchase-${focusId}`); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60);
      if (onFocusHandled) onFocusHandled();
    }
  }, [focusPurchaseId, focusPurchaseMode, purchases, onFocusHandled]);

  const [freshEditId, setFreshEditId] = useState(null);   // record opened for edit right after promote/add-line (defaults may still apply)
  const [dueFilter, setDueFilter] = useState(false);
  const [tradeFilter, setTradeFilter] = useState("");
  const stats = useMemo(() => summarizePurchases(purchases), [purchases]);
  const due = useMemo(() => reimbursementsDue(purchases), [purchases]);
  const credits = useMemo(() => allowanceCredits(purchases), [purchases]);
  const pool = useMemo(() => allowancePool(purchases), [purchases]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = purchases;
    if (dueFilter) { const ids = new Set(due.purchases.map(p => p.id)); list = list.filter(p => ids.has(p.id)); }
    if (tradeFilter) list = list.filter(p => p.trade === tradeFilter);
    if (q) list = list.filter(p => [p.description, p.vendor, p.sourceVendor, p.trade, p.room, p.allowanceCategory].some(v => (v || "").toLowerCase().includes(q)));
    return [...list].sort((a, b) => (b.purchaseDate || "").localeCompare(a.purchaseDate || "") || (b.id > a.id ? 1 : -1));
  }, [purchases, query, dueFilter, tradeFilter, due]);

  const exportCostSeg = () => {
    const { csv, count } = buildCostSegCsv(purchases);
    if (count === 0) { window.alert("No purchases yet have BOTH an asset class and a placed-in-service date, so there is nothing to export. Add those on your purchases first."); return; }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pool-paddle-cost-seg-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.charcoal, margin: 0 }}>Purchases</h2>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "4px 0 0" }}>What we actually bought · {purchases.length} logged</p>
        </div>
        {editingId !== "new" && (
          <button onClick={() => { setEditingId("new"); setExpandedId(null); }} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: C.mint, color: C.white, fontFamily: font, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>+ Add purchase</button>
        )}
      </div>

      {inboxPanel && <ReceiptInboxPanel {...inboxPanel} purchases={purchases} isMobile={isMobile} />}

      {/* New purchase form — at the top so it's visible immediately when opened. Keyed on the
          active property so a property switch remounts it (draft is scoped per property). */}
      {editingId === "new" && (
        <div ref={newFormRef}>
          <PurchaseForm
            reimbursableVendors={reimbursableVendors}
            key={`new-${activeProperty || "base"}`}
            initial={{ ...emptyPurchase(), placedInServiceDate: propertyInServiceDate || "" }}
            fresh
            onSave={(p) => { onSave(p); setEditingId(null); setExpandedId(p.id); }}
            onCancel={() => setEditingId(null)}
            propertyId={activeProperty}
            isMobile={isMobile}
            draftKey={`pp-purchase-draft:${activeProperty || "base"}:new`}
          />
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { label: "Total spent (net of refunds)", value: fmtUSD(stats.total) },
          { label: "Purchases logged", value: String(purchases.length) },
          { label: "Owner-purchased", value: fmtUSD(stats.owner), sub: "includes money Sparrow reimburses" },
          { label: "Contractor / allowance", value: fmtUSD(stats.contractor) },
          { label: "Due from Sparrow", value: fmtUSD(due.total), sub: dueFilter ? "showing these — tap to clear" : "tap to filter the list", onClick: () => setDueFilter(f => !f), active: dueFilter },
          { label: "Owner-paid allowance items", value: fmtUSD(credits.total), sub: "credit to settle in writing" },
        ].map(c => {
          const style = { background: C.white, border: `1px solid ${c.active ? C.mint : C.border}`, borderRadius: 12, padding: "14px 16px", textAlign: "left", fontFamily: font };
          const body = (<>
            <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.charcoal, marginTop: 4 }}>{c.value}</div>
            {c.sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{c.sub}</div>}
          </>);
          return c.onClick
            ? <button key={c.label} onClick={c.onClick} style={{ ...style, cursor: "pointer", minHeight: 44 }}>{body}</button>
            : <div key={c.label} style={style}>{body}</div>;
        })}
      </div>

      {/* Exhibit B allowance reconciliation */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 22 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: C.charcoal, margin: "0 0 4px" }}>Exhibit B allowance reconciliation</h3>
        <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 12px" }}>Allowances total {fmtUSD(EXHIBIT_B_TOTAL)} (Construction Agreement, Exhibit B). Spend is split by who funded it: Sparrow paid directly, owner paid then reimbursed by Sparrow, or owner direct (a credit to settle in writing).</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.textSecondary, textAlign: "right" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Category</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Allowance</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Paid by Sparrow</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Reimbursed to owner</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Owner direct</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>Remaining</th>
                <th style={{ padding: "6px 8px", fontWeight: 600 }}>% used</th>
              </tr>
            </thead>
            <tbody>
              {pool.rows.map(r => (
                <tr key={r.name} style={{ borderTop: `1px solid ${C.borderLight}`, textAlign: "right" }}>
                  <td style={{ textAlign: "left", padding: "7px 8px", color: C.charcoal }}>{r.name}</td>
                  <td style={{ padding: "7px 8px", color: C.textSecondary }}>{fmtUSD(r.allowance)}</td>
                  <td style={{ padding: "7px 8px", color: C.charcoal }}>{fmtUSD(r.paidBySparrow)}</td>
                  <td style={{ padding: "7px 8px", color: C.charcoal }}>{fmtUSD(r.reimbursedToOwner)}</td>
                  <td style={{ padding: "7px 8px", color: r.ownerDirect > 0 ? C.ocean : C.charcoal }}>{fmtUSD(r.ownerDirect)}</td>
                  <td style={{ padding: "7px 8px", color: r.remaining < 0 ? C.ocean : C.textSecondary, fontWeight: 600 }}>{fmtUSD(r.remaining)}</td>
                  <td style={{ padding: "7px 8px", color: r.pct > 100 ? C.ocean : C.mint, fontWeight: 600 }}>{r.pct}%</td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${C.border}`, textAlign: "right", fontWeight: 800 }}>
                <td style={{ textAlign: "left", padding: "8px", color: C.charcoal }}>Total</td>
                <td style={{ padding: "8px", color: C.charcoal }}>{fmtUSD(pool.poolTotal)}</td>
                <td style={{ padding: "8px", color: C.charcoal }}>{fmtUSD(pool.rows.reduce((t, r) => t + r.paidBySparrow, 0))}</td>
                <td style={{ padding: "8px", color: C.charcoal }}>{fmtUSD(pool.rows.reduce((t, r) => t + r.reimbursedToOwner, 0))}</td>
                <td style={{ padding: "8px", color: C.charcoal }}>{fmtUSD(pool.rows.reduce((t, r) => t + r.ownerDirect, 0))}</td>
                <td style={{ padding: "8px", color: C.charcoal }}>{fmtUSD(pool.rows.reduce((t, r) => t + r.remaining, 0))}</td>
                <td style={{ padding: "8px" }}></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: C.textSecondary }}>
          <div><strong style={{ color: C.charcoal }}>Reimbursed, no Exhibit B category:</strong> {fmtUSD(pool.reimbursedNoCategory.total)} ({pool.reimbursedNoCategory.purchases.length} purchases). Counts against the lump-sum pool.</div>
          <div><strong style={{ color: C.charcoal }}>Allowance pool:</strong> {fmtUSD(pool.poolTotal)} total · {fmtUSD(pool.poolCharged)} charged against it (including the line above) · {fmtUSD(pool.poolRemaining)} remaining.</div>
          <div><strong style={{ color: C.charcoal }}>Contractor scope (base contract):</strong> {fmtUSD(pool.contractorScope.total)} ({pool.contractorScope.purchases.length} purchases). Not charged to the pool — confirm each is inside the contract price and not a future change order.</div>
        </div>
      </div>

      {/* Cost segregation */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.charcoal, margin: "0 0 4px" }}>Cost segregation</h3>
            <p style={{ fontSize: 12, color: C.textMuted, margin: 0, maxWidth: 480 }}>Asset classes are <strong>suggestions</strong> — confirm with your CPA / cost-seg engineer. Not tax advice. Export includes every purchase that has both an asset class and a placed-in-service date.</p>
          </div>
          <button onClick={exportCostSeg} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${C.mint}`, background: C.seafoamFaint, color: C.mintDark, fontFamily: font, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>&darr; Export Cost Seg CSV</button>
        </div>
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary }}>Property in-service date</label>
          <input type="date" value={propertyInServiceDate || ""} onChange={e => onSetInServiceDate && onSetInServiceDate(e.target.value)} style={{ ...ppInput, maxWidth: 180 }} />
          <span style={{ fontSize: 11, color: C.textMuted }}>Defaults the placed-in-service date on new purchases.</span>
        </div>
      </div>

      {/* Search */}
      {purchases.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search purchases…" style={{ ...ppInput, maxWidth: 320 }} />
          <select value={tradeFilter} onChange={e => setTradeFilter(e.target.value)} style={{ ...ppInput, maxWidth: 220 }} aria-label="Filter by trade">
            <option value="">All trades</option>
            {PURCHASE_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {dueFilter && <button onClick={() => setDueFilter(false)} style={{ padding: "8px 14px", minHeight: 44, borderRadius: 20, border: `1px solid ${C.mint}`, background: C.seafoamFaint, color: C.mintDark, fontFamily: font, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Showing: due from Sparrow ✕</button>}
        </div>
      )}

      {/* Purchase list */}
      {filtered.length === 0 && editingId !== "new" && (
        <p style={{ color: C.textMuted, fontSize: 14, textAlign: "center", padding: 32 }}>{purchases.length > 0 ? "No purchases match your search or filters." : "No purchases yet. Click “+ Add purchase” to log your first one."}</p>
      )}
      {(() => {
      const renderPurchase = (p) => {
        const isOpen = expandedId === p.id;
        const isEditing = editingId === p.id;
        return (
          <div key={p.id} id={`purchase-${p.id}`} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
            <button onClick={() => { if (editingId === "new") { try { localStorage.removeItem(`pp-purchase-draft:${activeProperty || "base"}:new`); } catch (e) { /* ignore */ } } setExpandedId(isOpen ? null : p.id); setEditingId(null); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.charcoal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.description || "(untitled)"}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                  {[p.trade, p.room, p.vendor].filter(Boolean).join(" · ") || "—"}
                </div>
                {Number(p.refundAmount) > 0 && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>paid {fmtUSD(p.totalPaid)} · refunded {fmtUSD(p.refundAmount)}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {p.status && p.status !== "Ordered" && <span style={{ fontSize: 11, fontWeight: 600, color: C.textSecondary, background: C.pageBg, padding: "3px 9px", borderRadius: 12 }}>{p.status}</span>}
                {p.status === "Returned" && p.refundAmount == null && <span style={{ fontSize: 11, fontWeight: 700, color: C.warnText, background: C.warnBg, padding: "3px 9px", borderRadius: 12 }}>refund not recorded</span>}
                {paymentBadge(p) && <span style={{ fontSize: 11, fontWeight: 700, color: C.warnText, background: C.warnBg, padding: "3px 9px", borderRadius: 12 }}>{paymentBadge(p)}</span>}
                {(p.receipts || []).length > 0 && <span style={{ fontSize: 11, color: C.textMuted }}>📎 {(p.receipts || []).length}</span>}
                <span style={{ fontSize: 11, fontWeight: 600, color: p.ownerPurchased ? C.mint : C.ocean, background: p.ownerPurchased ? C.seafoamFaint : C.oceanLight, padding: "3px 9px", borderRadius: 12 }}>{p.ownerPurchased ? "Owner" : "Contractor"}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.charcoal }}>{fmtUSD(netCost(p))}</span>
              </div>
            </button>
            {isOpen && !isEditing && (
              <div style={{ padding: "0 16px 16px" }}>
                <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7, marginBottom: 12 }}>
                  {p.invoiceNo && <>Invoice: {p.invoiceNo}<br /></>}
                  {p.purchasedBy && <>Paid by: {p.purchasedBy} · {p.paymentMethod || "—"}<br /></>}
                  Allowance: {p.allowanceCategory} · Status: {p.status}<br />
                  Funding: {fundingSource(p)}<br />
                  {p.reimbursable && <>Sparrow reimbursement: {p.reimbursementStatus}{p.reimbursedAmount != null ? ` · ${fmtUSD(p.reimbursedAmount)}` : ""}{p.reimbursedDate ? ` · ${p.reimbursedDate}` : ""}{p.drawNo ? ` · draw ${p.drawNo}` : ""}<br /></>}
                  {(p.sourceVendor || p.docType || Number(p.fees) > 0 || Number(p.discount) > 0) && <>{[p.sourceVendor && `Source vendor: ${p.sourceVendor}`, p.docType && `Document: ${p.docType}`, Number(p.fees) > 0 && `Fees: ${fmtUSD(p.fees)}`, Number(p.discount) > 0 && `Discount: ${fmtUSD(p.discount)}`].filter(Boolean).join(" · ")}<br /></>}
                  {(p.returnByDate || p.returnPolicyNote || p.refundAmount != null || Number(p.restockingFee) > 0 || Number(p.returnShippingCost) > 0) && <>{[p.returnByDate && `Return by ${p.returnByDate}${p.keepConfirmed ? " (keeping)" : ""}`, p.returnPolicyNote, p.refundAmount != null && `Refund ${fmtUSD(p.refundAmount)}${p.refundDate ? ` on ${p.refundDate}` : ""}`, Number(p.restockingFee) > 0 && `Restocking fee ${fmtUSD(p.restockingFee)}`, Number(p.returnShippingCost) > 0 && `Return shipping ${fmtUSD(p.returnShippingCost)}`].filter(Boolean).join(" · ")}<br /></>}
                  {(p.inspected || p.deliveredTo) && <>{[p.inspected && `Inspected${p.inspectedDate ? ` ${p.inspectedDate}` : ""}`, p.deliveredTo && `Delivered to ${p.deliveredTo}`].filter(Boolean).join(" · ")}<br /></>}
                  {(p.warranty || p.warrantyTerm) && <>Warranty: {p.warrantyTerm || "yes"}{p.registered ? " (registered)" : ""}{p.binderPocket ? ` · Binder ${p.binderPocket}` : ""}<br /></>}
                  {p.notes && <span style={{ color: C.textMuted }}>{p.notes}</span>}
                </div>

                {/* Receipts */}
                <div style={{ marginBottom: 12 }}>
                  <ReceiptUploader
                    propertyId={activeProperty}
                    purchaseId={p.id}
                    receipts={p.receipts || []}
                    onChange={(rs) => onReceiptsChange(p.id, rs)}
                  />
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {p.returnByDate && !p.keepConfirmed && p.status !== "Returned" && (
                    <button onClick={() => onSave({ ...p, keepConfirmed: true })} style={{ padding: "10px 18px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.mint}`, background: C.seafoamFaint, color: C.mintDark, fontFamily: font, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Keep</button>
                  )}
                  <button onClick={() => onAddLine && onAddLine(p)} style={{ padding: "10px 18px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.charcoal, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Add line to this order</button>
                  <button onClick={() => { setEditingId(p.id); }} style={{ padding: "10px 18px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.charcoal, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                  <button onClick={() => { if (window.confirm("Delete this purchase? Its receipts are deleted too, except any shared with other lines of the same order.")) { onDelete(p.id); setExpandedId(null); } }} style={{ padding: "10px 18px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.ocean, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                </div>
              </div>
            )}
            {isOpen && isEditing && (
              <div style={{ padding: "0 16px 16px" }}>
                <PurchaseForm
                  reimbursableVendors={reimbursableVendors}
                  initial={p}
                  fresh={freshEditId === p.id}
                  onSave={(updated) => { onSave(updated); setEditingId(null); setFreshEditId(null); }}
                  onCancel={() => setEditingId(null)}
                  propertyId={activeProperty}
                  isMobile={isMobile}
                />
              </div>
            )}
          </div>
        );
      };
      // Header totals describe the WHOLE order even when a filter hides some of its lines.
      const orderHeader = (g) => {
        const all = purchases.filter(m => m.orderGroupId === g.orderGroupId);
        const sub = all.reduce((t, m) => t + netCost(m), 0);
        return `Order · ${g.purchases[0].vendor || "no vendor"} · ${g.purchases[0].invoiceNo || "no invoice #"} · ${all.length} lines · subtotal ${fmtUSD(sub)}${g.purchases.length < all.length ? ` (showing ${g.purchases.length})` : ""}`;
      };
      return groupByOrder(filtered).map(g => g.kind === "single" ? renderPurchase(g.purchase) : (
        <div key={g.orderGroupId} style={{ border: `1px solid ${C.seafoam}`, borderRadius: 14, padding: 8, marginBottom: 12, background: C.seafoamFaint }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.mintDark, padding: "4px 8px 8px" }}>
            {orderHeader(g)}
          </div>
          {g.purchases.map(renderPurchase)}
        </div>
      ));
      })()}
    </div>
  );
}

// ─── SHOPPING ────────────────────────────────────────────────────────────────
// Whole-house shopping list: seeded from src/shopping-seed.json, compared on total landed cost,
// approved by JM/KM, promoted to Purchases, and round-tripped with the research agent. Persisted as
// a Redis hash via /api/shopping (per-field writes, see App). Pure logic lives in
// src/lib/shopping-logic.js; this section is UI only.

const SHOP_LEVELS = {
  "full-day": { label: "covers a full day", color: C.mintDark, bg: C.seafoamFaint },
  "one-meal": { label: "covers one meal", color: C.warnText, bg: C.warnBg },
  short: { label: "less than one meal", color: C.dangerText, bg: C.dangerBg },
};
const shBtn = { padding: "10px 16px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.charcoal, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer" };
const shBtnPrimary = { ...shBtn, border: `1px solid ${C.mint}`, background: C.mint, color: C.white, fontWeight: 700 };
const shBtnDanger = { ...shBtn, color: C.ocean };
const shChip = (color, bg) => ({ fontSize: 11, fontWeight: 700, color, background: bg, padding: "3px 9px", borderRadius: 12, whiteSpace: "nowrap" });
const isReimbursableVendor = (vendor, settings) =>
  (settings.reimbursableVendors || []).some(v => String(v).trim().toLowerCase() === String(vendor || "").trim().toLowerCase());
const priorityLabel = { "launch-critical": "Launch-critical", launch: "Launch", "nice-to-have": "Nice to have" };

function ShoppingCandidateForm({ initial, onSave, onCancel, isMobile, userCode }) {
  const [d, setD] = useState(initial);
  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  const field = (label, node) => (<div style={{ flex: 1, minWidth: isMobile ? "100%" : 150 }}><label style={ppLabel}>{label}</label>{node}</div>);
  const txt = (k, ph) => <input style={ppInput} value={d[k] ?? ""} placeholder={ph} onChange={e => set({ [k]: e.target.value })} />;
  const nm = (k, ph) => <input type="number" step="0.01" style={ppInput} value={d[k] ?? ""} placeholder={ph} onChange={e => set({ [k]: e.target.value === "" ? null : Number(e.target.value) })} />;
  const pct = (k, ph) => <input type="number" step="0.01" style={ppInput} value={d[k] == null ? "" : Math.round(d[k] * 10000) / 100} placeholder={ph} onChange={e => set({ [k]: e.target.value === "" ? null : Number(e.target.value) / 100 })} />;
  const tri = (k) => (
    <select style={ppInput} value={d[k] === true ? "yes" : d[k] === false ? "no" : ""} onChange={e => set({ [k]: e.target.value === "" ? null : e.target.value === "yes" })}>
      <option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option>
    </select>
  );
  const row = { display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 };
  return (
    <div style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 10 }}>
      <div style={row}>
        {field("Vendor (store)", txt("vendor", "e.g. Amazon"))}
        {field("Vendor type", <select style={ppInput} value={d.vendorType} onChange={e => set({ vendorType: e.target.value })}>{VENDOR_TYPES.map(v => <option key={v} value={v}>{v}</option>)}</select>)}
        {field("Source vendor (brand behind a marketplace)", txt("sourceVendor", "e.g. Ferguson Home"))}
      </div>
      <div style={row}>
        {field("Product link", txt("url", "https://…"))}
        {field("Brand", txt("brand"))}
        {field("Model #", txt("model"))}
        {field("SKU / ASIN", txt("sku"))}
      </div>
      <div style={row}>
        {field("Unit price ($)", nm("unitPrice"))}
        {field("Pack size (units per pack)", nm("packSize"))}
        {field("Packs to buy", nm("qtyToBuy"))}
        {field("Shipping ($)", nm("shipping"))}
        {field("Discount ($)", nm("discount"))}
        {field("Retail price ($, display only)", nm("retailUnitPrice"))}
      </div>
      <div style={row}>
        {field("Fee % (blank = vendor default)", pct("transactionFeePct", "e.g. 3.2"))}
        {field("Sales tax ($, blank = default rate)", nm("estTax"))}
        {field("Promo note", txt("promoNote"))}
      </div>
      <div style={row}>
        {field("Return window (days)", nm("returnWindowDays"))}
        {field("Return by", <input type="date" style={ppInput} value={d.returnByDate || ""} onChange={e => set({ returnByDate: e.target.value })} />)}
        {field("Return shipping ($)", nm("returnShippingCost"))}
        {field("Restocking %", pct("restockingPct", "e.g. 15"))}
        {field("Free returns", <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, minHeight: 44 }}><input type="checkbox" checked={!!d.freeReturns} onChange={e => set({ freeReturns: e.target.checked })} style={{ accentColor: C.mint, width: 16, height: 16 }} /> Free returns</label>)}
      </div>
      <div style={row}>
        {field("Delivery ETA", <input type="date" style={ppInput} value={d.deliveryEta || ""} onChange={e => set({ deliveryEta: e.target.value })} />)}
        {field("In stock", tri("inStock"))}
        {field("Open stock (re-buyable by the piece)", tri("openStock"))}
        {field("Commercial grade", tri("commercialGrade"))}
        {field("Warranty", txt("warrantyTerm"))}
      </div>
      <div style={row}>
        {field("Rating", nm("rating"))}
        {field("Rating count", nm("ratingCount"))}
        {field("Tier", <select style={ppInput} value={d.tier || ""} onChange={e => set({ tier: e.target.value || null })}><option value="">—</option>{TIERS.map(t => <option key={t} value={t}>{t}</option>)}</select>)}
      </div>
      <div style={{ marginBottom: 14 }}><label style={ppLabel}>Notes</label><textarea style={{ ...ppInput, minHeight: 56, resize: "vertical" }} value={d.notes || ""} onChange={e => set({ notes: e.target.value })} /></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button disabled={!(d.vendor || "").trim()} onClick={() => onSave({ ...d, source: d.source === "agent" ? "agent" : (userCode || "JM"), checkedAt: new Date().toISOString() })} style={{ ...shBtnPrimary, background: (d.vendor || "").trim() ? C.mint : C.border }}>Save candidate</button>
        <button onClick={onCancel} style={shBtn}>Cancel</button>
      </div>
    </div>
  );
}

function ShoppingCandidateCard({ c, item, settings, selected, best, canEdit, onSelect, onEdit, onDelete, nowISO }) {
  const landed = landedTotal(c, settings);
  const warnings = candidateWarnings(c, item, settings, nowISO);
  const dim = { fontSize: 12, color: C.textSecondary, lineHeight: 1.6 };
  return (
    <div style={{ background: C.white, border: `2px solid ${selected ? C.mint : C.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <strong style={{ fontSize: 15, color: C.charcoal }}>{c.vendor || "(vendor)"}</strong>
        {c.sourceVendor && <span style={{ fontSize: 12, color: C.textMuted }}>via {c.sourceVendor}</span>}
        {best && <span style={shChip(C.mintDark, C.seafoamLight)}>Best Value</span>}
        {selected && <span style={shChip(C.white, C.mint)}>Selected</span>}
        {isReimbursableVendor(c.vendor, settings) && <span style={shChip(C.ocean, C.oceanLight)}>Sparrow reimburses (loan)</span>}
        {c.tier && <span style={shChip(C.textSecondary, C.pageBg)}>{c.tier}</span>}
        {c.source === "agent" && <span style={shChip(C.textSecondary, C.pageBg)}>agent</span>}
        {c.standardsCheck && !c.standardsCheck.pass && <span style={shChip(C.warnText, C.warnBg)}>fails standards</span>}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.charcoal }}>{fmtUSD(landed)} <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>landed · {fmtUSD(perUnit(c, settings))} / unit</span></div>
      <div style={dim}>
        {[c.brand, c.model].filter(Boolean).join(" ")}{(c.brand || c.model) ? " · " : ""}
        {c.qtyToBuy ?? 1} × {fmtUSD(c.unitPrice)}{Number(c.packSize) > 1 ? ` (pack of ${c.packSize})` : ""}
        {c.discount ? ` − ${fmtUSD(c.discount)}` : ""} + ship {fmtUSD(c.shipping)} + fees {fmtUSD(feesFor(c, settings))} + tax {fmtUSD(taxFor(c, settings))}
        {c.promoNote ? ` · ${c.promoNote}` : ""}
      </div>
      <div style={dim}>
        Return by {c.returnByDate || "—"}{c.returnWindowDays ? ` (${c.returnWindowDays} days)` : ""} · exposure {c.freeReturns ? "free returns" : fmtUSD(returnExposure(c))}
        {" · "}Delivery {c.deliveryEta || "—"} · {c.inStock === true ? "in stock" : c.inStock === false ? "OUT of stock" : "stock unknown"}
        {c.openStock === true ? " · open stock" : ""}
        {c.rating ? ` · ${c.rating}★${c.ratingCount ? ` (${c.ratingCount})` : ""}` : ""}
      </div>
      <div style={{ ...dim, color: C.textMuted }}>Checked {c.checkedAt && !Number.isNaN(new Date(c.checkedAt).getTime()) ? new Date(c.checkedAt).toLocaleString() : "—"} · by {c.source || "—"}{c.notes ? ` · ${c.notes}` : ""}</div>
      {warnings.map(w => <div key={w.code} style={{ fontSize: 12, fontWeight: 600, color: C.warnText, background: C.warnBg, padding: "4px 8px", borderRadius: 6 }}>⚠ {w.text}</div>)}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        <button disabled={!canEdit || selected} onClick={onSelect} style={{ ...shBtnPrimary, background: selected || !canEdit ? C.border : C.mint, border: "none" }}>{selected ? "Selected" : "Select"}</button>
        {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ ...shBtn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Open link ↗</a>}
        <button disabled={!canEdit} onClick={onEdit} style={shBtn}>Edit</button>
        <button disabled={!canEdit} onClick={onDelete} style={shBtnDanger}>Delete</button>
      </div>
    </div>
  );
}

function ShoppingItemCard({ item, settings, expanded, onToggle, canEdit, onSave, onRemove, onMarkPurchased, linkedPurchases = [], isMobile, nowISO }) {
  const [editingCand, setEditingCand] = useState(null);   // candidate id | "new" | null
  const user = getCurrentUser() || { code: null, name: "" };   // no pp_user cookie (auth bypassed): browse only, no approve/claim
  const qty = computeQty(item, settings);
  const best = bestValue(item, settings);
  const selected = (item.candidates || []).find(c => c.id === item.selectedCandidateId) || null;
  const selectedLanded = selected ? landedTotal(selected, settings) : null;
  const priceChange = priceChangedSinceApproval(item, settings);
  const patch = (p) => onSave({ ...item, ...p });
  const rule = item.qtyRule || {};
  const ruleText = item.qtyOverride != null ? `override (rule would give ${computeQty({ ...item, qtyOverride: null }, settings)})`
    : rule.basis === "fixed" ? `fixed ${rule.fixedQty}` : `${rule.multiplier} × ${rule.basis} (${settings[rule.basis === "guests" ? "guestCount" : rule.basis]})`;
  const field = (label, node, w = 150) => (<div style={{ flex: 1, minWidth: isMobile ? "100%" : w }}><label style={ppLabel}>{label}</label>{node}</div>);
  const row = { display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 };
  const purchased = linkedPurchases.length > 0;   // live purchases only — a deleted purchase must not leave the item stuck
  return (
    <div id={`shop-${item.id}`} style={{ background: C.white, border: `1px solid ${item.proposed ? C.seafoam : C.border}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      <button onClick={onToggle} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", fontFamily: font }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.charcoal }}>{item.name || "(untitled)"} <span style={{ fontWeight: 600, color: C.textMuted }}>× {qty}</span></div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{[item.category, item.room, item.zone !== "both" ? item.zone : ""].filter(Boolean).join(" · ")}{selected ? ` · ${selected.vendor}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
          {item.proposed && <span style={shChip(C.mintDark, C.seafoamLight)}>proposed</span>}
          {NON_GLASS_CATEGORIES.includes(item.category) && <span style={shChip(C.ocean, C.oceanLight)}>non-glass</span>}
          <span style={shChip(C.textSecondary, C.pageBg)}>{item.status}</span>
          <span style={shChip(C.textSecondary, C.pageBg)}>{priorityLabel[item.priority] || item.priority}</span>
          {item.agentFlag && item.agentFlag.action && <span style={shChip(item.agentFlag.action === "buy-now" ? C.mintDark : C.warnText, item.agentFlag.action === "buy-now" ? C.seafoamLight : C.warnBg)}>{item.agentFlag.action}</span>}
          {item.claimedBy && <span style={shChip(C.white, item.claimedBy === "JM" ? C.ocean : C.mint)}>{item.claimedBy} buying</span>}
          {item.approvedBy && <span style={shChip(C.white, C.mint)}>approved {item.approvedBy}</span>}
          {priceChange && <span style={shChip(C.warnText, C.warnBg)}>price changed since approval</span>}
          {purchased && <span style={shChip(C.mintDark, C.seafoamLight)}>✓ purchased</span>}
          {selectedLanded !== null && <span style={{ fontSize: 15, fontWeight: 800, color: C.charcoal }}>{fmtUSD(selectedLanded)}</span>}
        </div>
      </button>
      {expanded && (
        <div style={{ padding: "0 16px 16px" }}>
          {item.proposed && (
            <div style={{ background: C.seafoamFaint, border: `1px solid ${C.seafoam}`, borderRadius: 10, padding: 12, marginBottom: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: C.mintDark, fontWeight: 600, flex: 1 }}>The research agent proposed this item.</span>
              <button disabled={!canEdit} onClick={() => patch({ proposed: false })} style={shBtnPrimary}>Keep</button>
              <button disabled={!canEdit} onClick={() => { if (window.confirm("Dismiss this proposed item? It stays hidden even if the agent proposes it again.")) patch({ dismissed: true, proposed: false }); }} style={shBtnDanger}>Dismiss</button>
            </div>
          )}
          {priceChange && (
            <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: C.warnText, background: C.warnBg, borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
              ⚠ The selected candidate's landed price changed since {item.approvedBy} approved it: {fmtUSD(priceChange.from)} → {fmtUSD(priceChange.to)}. Un-approve and re-approve to accept the new price.
            </div>
          )}
          {item.agentFlag && item.agentFlag.action && (
            <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 10 }}><strong>Agent flag: {item.agentFlag.action}</strong>{item.agentFlag.reason ? ` — ${item.agentFlag.reason}` : ""}</div>
          )}
          {(item.qualityTier || item.requirements || item.kerryDecides) && (
            <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 10, lineHeight: 1.6 }}>
              {item.qualityTier && <div><strong>Quality tier:</strong> {item.qualityTier}</div>}
              {item.requirements && <div><strong>Requirements:</strong> {item.requirements}</div>}
              {item.kerryDecides && <div><strong>Kerry decides</strong></div>}
            </div>
          )}
          {NON_GLASS_CATEGORIES.includes(item.category) && (
            <div style={{ fontSize: 12, color: C.textSecondary, background: C.oceanLight, borderRadius: 8, padding: "8px 12px", marginBottom: 12, lineHeight: 1.7 }}>
              <strong>Pool-deck checklist (no glass):</strong>
              <div>☐ Plates, bowls, serveware: premium heavy-gauge melamine</div>
              <div>☐ Dishwasher-safe — required (goes through the same dishwasher)</div>
              <div>☐ Not microwave-safe — stays in the summer kitchen</div>
              <div>☐ Drinkware: Tritan or similar shatter-resistant, BPA-free, reads as glass</div>
              <div>☐ Open stock · ☐ Palette coordinates with the indoor set</div>
            </div>
          )}
          <div style={row}>
            {field(`Quantity needed — ${ruleText}`, (
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" style={ppInput} disabled={!canEdit} value={item.qtyOverride ?? ""} placeholder={`${computeQty({ ...item, qtyOverride: null }, settings)} (from rule)`} onChange={e => patch({ qtyOverride: e.target.value === "" ? null : Number(e.target.value) })} />
                {item.qtyOverride != null && <button disabled={!canEdit} onClick={() => patch({ qtyOverride: null })} style={shBtn}>Use rule</button>}
              </div>
            ), 240)}
            {item.suggestedQty != null && item.suggestedQty !== qty && field("Agent suggests", <button disabled={!canEdit} onClick={() => patch({ qtyOverride: item.suggestedQty })} style={shBtn}>Use {item.suggestedQty}</button>)}
            {field("Status", <select style={ppInput} disabled={!canEdit} value={item.status} onChange={e => patch({ status: e.target.value })}>{ITEM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>)}
            {field("Priority", <select style={ppInput} disabled={!canEdit} value={item.priority} onChange={e => patch({ priority: e.target.value })}>{ITEM_PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel[p]}</option>)}</select>)}
          </div>
          <div style={row}>
            {field("Room", <input style={ppInput} disabled={!canEdit} value={item.room || ""} onChange={e => patch({ room: e.target.value })} />)}
            {field("Zone", <select style={ppInput} disabled={!canEdit} value={item.zone} onChange={e => patch({ zone: e.target.value })}>{ZONES.map(z => <option key={z} value={z}>{z}</option>)}</select>)}
            {field("Need by", <input type="date" style={ppInput} disabled={!canEdit} value={item.needBy || ""} onChange={e => patch({ needBy: e.target.value || null })} />)}
            {field("Target price per unit ($)", <input type="number" step="0.01" style={ppInput} disabled={!canEdit} value={item.targetPrice ?? ""} onChange={e => patch({ targetPrice: e.target.value === "" ? null : Number(e.target.value) })} />)}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={ppLabel}>Notes</label>
            <textarea style={{ ...ppInput, minHeight: 56, resize: "vertical" }} disabled={!canEdit} value={item.notes || ""} onChange={e => patch({ notes: e.target.value })} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.charcoal }}>Candidates ({(item.candidates || []).length})</h4>
            <button disabled={!canEdit} onClick={() => setEditingCand("new")} style={shBtn}>+ Add candidate</button>
          </div>
          {editingCand === "new" && (
            <ShoppingCandidateForm initial={{ ...emptyCandidate(), qtyToBuy: Math.max(1, qty) }} isMobile={isMobile} userCode={user.code}
              onSave={(c) => { patch({ candidates: [...(item.candidates || []), c] }); setEditingCand(null); }} onCancel={() => setEditingCand(null)} />
          )}
          {(item.candidates || []).length === 0 && editingCand !== "new" && <p style={{ fontSize: 13, color: C.textMuted, margin: "8px 0 14px" }}>No candidates yet. Add one, or import the research agent's results.</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 14 }}>
            {(item.candidates || []).map(c => editingCand === c.id ? (
              <ShoppingCandidateForm key={c.id} initial={c} isMobile={isMobile} userCode={user.code}
                onSave={(next) => { patch({ candidates: item.candidates.map(x => (x.id === c.id ? next : x)) }); setEditingCand(null); }} onCancel={() => setEditingCand(null)} />
            ) : (
              <ShoppingCandidateCard key={c.id} c={c} item={item} settings={settings} nowISO={nowISO}
                selected={item.selectedCandidateId === c.id} best={!!best && best.id === c.id} canEdit={canEdit}
                onSelect={() => {
                  const reapprove = !!item.approvedBy && item.selectedCandidateId !== c.id;   // a different pick was never approved
                  patch({ selectedCandidateId: c.id, ...(reapprove ? { status: "shortlisted", approvedBy: null, approvedAt: null, approvedLanded: null } : { status: item.status === "researching" ? "shortlisted" : item.status }) });
                }}
                onEdit={() => setEditingCand(c.id)}
                onDelete={() => { if (window.confirm("Delete this candidate?")) { const wasPick = item.selectedCandidateId === c.id; patch({ candidates: item.candidates.filter(x => x.id !== c.id), selectedCandidateId: wasPick ? null : item.selectedCandidateId, ...(wasPick && item.approvedBy ? { status: "shortlisted", approvedBy: null, approvedAt: null, approvedLanded: null } : {}) }); } }} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {item.approvedBy
              ? <button disabled={!canEdit} onClick={() => patch({ status: "shortlisted", approvedBy: null, approvedAt: null, approvedLanded: null })} style={shBtn}>Un-approve ({item.approvedBy})</button>
              : <button disabled={!canEdit || !selected || !user.code} title={!user.code ? "Log in to approve" : selected ? "" : "Select a candidate first"} onClick={() => patch({ status: "approved", approvedBy: user.code, approvedAt: new Date().toISOString(), approvedLanded: selected ? landedTotal(selected, settings) : null })} style={{ ...shBtnPrimary, background: canEdit && selected && user.code ? C.mint : C.border, border: "none" }}>Approve as {user.code || "me"}</button>}
            {item.claimedBy
              ? <button disabled={!canEdit} onClick={() => patch({ claimedBy: null })} style={shBtn}>Release claim ({item.claimedBy} is buying)</button>
              : <button disabled={!canEdit || !user.code} onClick={() => patch({ claimedBy: user.code })} style={shBtn}>I'm buying this</button>}
            {selected && selected.url && <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ ...shBtn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Open selected link ↗</a>}
            {onMarkPurchased && selected && !purchased && <button disabled={!canEdit} onClick={() => onMarkPurchased(item, selected.id)} style={shBtnPrimary}>Mark purchased</button>}
            {purchased && <span style={{ ...shChip(C.mintDark, C.seafoamLight), alignSelf: "center", padding: "8px 12px" }}>✓ {linkedPurchases.length} purchase{linkedPurchases.length > 1 ? "s" : ""} logged</span>}
            <button disabled={!canEdit} onClick={() => { if (window.confirm(`Delete "${item.name}" from the list?`)) onRemove(item.id); }} style={shBtnDanger}>Delete item</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ShoppingSettingsPanel({ settings, canEdit, onSave, onClose }) {
  const v = settings.vendorDefaults || {};
  const [d, setD] = useState({
    guestCount: settings.guestCount, bedrooms: settings.bedrooms, bathrooms: settings.bathrooms,
    mealsPerDay: settings.mealsPerDay, washesPerDay: settings.washesPerDay, dishwashers: settings.dishwashers,
    budgetTarget: settings.budgetTarget ?? "", readyDate: settings.readyDate || "",
    taxPct: Math.round(settings.defaultTaxRate * 10000) / 100,
    amazonFee: Math.round(((v.amazon || {}).transactionFeePct || 0) * 10000) / 100,
    amazonReturnBy: (v.amazon || {}).holidayReturnBy || "",
    minoanFee: Math.round(((v.minoan || {}).transactionFeePct || 0) * 10000) / 100,
    reimbursable: (settings.reimbursableVendors || []).join(", "),
  });
  const [error, setError] = useState("");
  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  const field = (label, node) => (<div style={{ flex: 1, minWidth: 150 }}><label style={ppLabel}>{label}</label>{node}</div>);
  const int = (k) => <input type="number" style={ppInput} value={d[k]} onChange={e => set({ [k]: e.target.value === "" ? "" : Number(e.target.value) })} />;
  const save = () => {
    if (String(d.taxPct).trim() === "") { setError("Enter a sales tax % (it can be 0, but it can't be blank)."); return; }
    const raw = {
      ...settings,
      guestCount: d.guestCount, bedrooms: d.bedrooms, bathrooms: d.bathrooms,
      mealsPerDay: d.mealsPerDay, washesPerDay: d.washesPerDay, dishwashers: d.dishwashers,
      budgetTarget: d.budgetTarget === "" ? null : Number(d.budgetTarget),
      readyDate: d.readyDate || null,
      defaultTaxRate: Number(d.taxPct) / 100,
      vendorDefaults: {
        ...v,
        amazon: { ...(v.amazon || {}), transactionFeePct: Number(d.amazonFee) / 100, holidayReturnBy: d.amazonReturnBy },
        minoan: { ...(v.minoan || {}), transactionFeePct: Number(d.minoanFee) / 100 },
      },
      reimbursableVendors: d.reimbursable.split(",").map(x => x.trim()).filter(Boolean),
    };
    const r = sanitizeShoppingSettings(raw);
    if (!r.ok) { setError(`Can't save: ${r.error}. Check the numbers and try again.`); return; }
    setError("");
    onSave(r.settings);
    onClose();
  };
  const row = { display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 };
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: C.charcoal }}>Shopping settings</h3>
      <div style={row}>{field("Guests eating at once", int("guestCount"))}{field("Bedrooms", int("bedrooms"))}{field("Bathrooms", int("bathrooms"))}</div>
      <div style={row}>{field("Meals per day", int("mealsPerDay"))}{field("Dishwasher runs per day", int("washesPerDay"))}{field("Dishwashers", int("dishwashers"))}</div>
      <div style={row}>
        {field("Budget target ($)", <input type="number" style={ppInput} value={d.budgetTarget} placeholder="Not set" onChange={e => set({ budgetTarget: e.target.value })} />)}
        {field("House ready (can receive & test items)", <input type="date" style={ppInput} value={d.readyDate} onChange={e => set({ readyDate: e.target.value })} />)}
        {field("Default sales tax % (confirm)", <input type="number" step="0.01" style={ppInput} value={d.taxPct} onChange={e => set({ taxPct: e.target.value })} />)}
      </div>
      <div style={row}>
        {field("Amazon fee %", <input type="number" step="0.01" style={ppInput} value={d.amazonFee} onChange={e => set({ amazonFee: e.target.value })} />)}
        {field("Amazon holiday return-by", <input type="date" style={ppInput} value={d.amazonReturnBy} onChange={e => set({ amazonReturnBy: e.target.value })} />)}
        {field("Minoan fee %", <input type="number" step="0.01" style={ppInput} value={d.minoanFee} onChange={e => set({ minoanFee: e.target.value })} />)}
        {field("Sparrow reimburses these vendors (comma-separated)", <input style={ppInput} value={d.reimbursable} onChange={e => set({ reimbursable: e.target.value })} />)}
      </div>
      {error && <p style={{ color: C.ocean, fontSize: 13, fontWeight: 600 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button disabled={!canEdit} onClick={save} style={{ ...shBtnPrimary, background: canEdit ? C.mint : C.border }}>Save settings</button>
        <button onClick={onClose} style={shBtn}>Close</button>
      </div>
    </div>
  );
}

function ShoppingItemForm({ onSave, onCancel, isMobile }) {
  const [d, setD] = useState(() => ({ ...emptyShoppingItem(), userCreated: true }));
  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  const field = (label, node) => (<div style={{ flex: 1, minWidth: isMobile ? "100%" : 150 }}><label style={ppLabel}>{label}</label>{node}</div>);
  const rule = d.qtyRule;
  return (
    <div style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Item", <input autoFocus style={ppInput} value={d.name} placeholder="e.g. Cheese board" onChange={e => set({ name: e.target.value })} />)}
        {field("Category", <select style={ppInput} value={d.category} onChange={e => set({ category: e.target.value })}>{sortedShoppingCategories().map(c => <option key={c} value={c}>{c}</option>)}</select>)}
        {field("Room", <input style={ppInput} value={d.room} onChange={e => set({ room: e.target.value })} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Zone", <select style={ppInput} value={d.zone} onChange={e => set({ zone: e.target.value })}>{ZONES.map(z => <option key={z} value={z}>{z}</option>)}</select>)}
        {field("Priority", <select style={ppInput} value={d.priority} onChange={e => set({ priority: e.target.value })}>{ITEM_PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel[p]}</option>)}</select>)}
        {field("Quantity rule", <select style={ppInput} value={rule.basis} onChange={e => set({ qtyRule: { ...rule, basis: e.target.value } })}>{QTY_BASES.map(b => <option key={b} value={b}>{b === "fixed" ? "fixed number" : `× ${b}`}</option>)}</select>)}
        {rule.basis === "fixed"
          ? field("How many", <input type="number" style={ppInput} value={rule.fixedQty} onChange={e => set({ qtyRule: { ...rule, fixedQty: Number(e.target.value) } })} />)
          : field(`Multiplier (× ${rule.basis})`, <input type="number" step="0.25" style={ppInput} value={rule.multiplier} onChange={e => set({ qtyRule: { ...rule, multiplier: Number(e.target.value) } })} />)}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button disabled={!d.name.trim()} onClick={() => onSave({ ...d, name: d.name.trim() })} style={{ ...shBtnPrimary, background: d.name.trim() ? C.mint : C.border }}>Add item</button>
        <button onClick={onCancel} style={shBtn}>Cancel</button>
      </div>
    </div>
  );
}

function ShoppingImportPreview({ preview, onApply, onCancel }) {
  const { fileName, changes, skipped, touched } = preview;
  return (
    <div role="dialog" aria-modal="true" aria-label="Import agent results" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 14, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto", padding: 22, fontFamily: font }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: C.charcoal }}>Import agent results</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: C.textMuted }}>{fileName} · nothing is saved until you press Apply. Approvals, claims, selections, quantities and statuses are never changed by an import.</p>
        {changes.length === 0 && <p style={{ fontSize: 14, color: C.textSecondary }}>No changes — everything in this file is already in the list.</p>}
        {changes.map(c => (
          <div key={c.itemId} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.charcoal }}>{c.kind === "new" ? "New (proposed): " : ""}{c.name}</div>
            <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>
              {[c.addedCandidates ? `+${c.addedCandidates} candidate${c.addedCandidates > 1 ? "s" : ""}` : "", c.updatedCandidates ? `${c.updatedCandidates} price/stock update${c.updatedCandidates > 1 ? "s" : ""}` : "",
                c.flag ? `flag: ${c.flag}` : "", c.suggestedQty != null ? `suggested qty ${c.suggestedQty}` : "", c.noteAdded ? "note added" : ""].filter(Boolean).join(" · ") || "details updated"}
            </div>
          </div>
        ))}
        {skipped.length > 0 && <p style={{ fontSize: 12, color: C.warnText, background: C.warnBg, borderRadius: 8, padding: "8px 10px" }}>Skipped: {skipped.join("; ")}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={onApply} style={shBtnPrimary}>{touched.length === 0 ? "Close" : `Apply ${touched.length} change${touched.length === 1 ? "" : "s"}`}</button>
          {touched.length > 0 && <button onClick={onCancel} style={shBtn}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}

function ShoppingView({ shopping, loaded, loadError, canEdit, purchases, onSaveItem, onRemoveItem, onSaveSettings, onMarkPurchased, propertyId }) {
  const { settings } = shopping;
  const items = useMemo(() => shopping.items.filter(i => !i.dismissed), [shopping.items]);   // dismissed proposals stay saved (so a re-import can't bring them back) but hidden
  const [groupBy, setGroupBy] = useState("category");
  const [filters, setFilters] = useState({ status: "all", category: "all", priority: "all", agentFlag: "all", claimedBy: "all", vendor: "all", search: "" });
  const [expandedId, setExpandedId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [importPreview, setImportPreview] = useState(null);   // { fileName, touched, changes, skipped } | null
  const [importMsg, setImportMsg] = useState(null);           // { error } | { ok } | null
  const fileRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const nowISO = new Date().toISOString();
  const setFilter = (k) => (e) => setFilters(prev => ({ ...prev, [k]: e.target.value }));
  const filtered = useMemo(() => filterShoppingItems(items, filters), [items, filters]);
  const groups = useMemo(() => groupShoppingItems(filtered, groupBy), [filtered, groupBy]);
  const meals = useMemo(() => mealsCovered(items, settings, purchases), [items, settings, purchases]);
  const forecast = useMemo(() => forecastSpend(items, purchases, settings), [items, purchases, settings]);
  const vendors = useMemo(() => [...new Set(items.flatMap(i => (i.candidates || []).map(c => c.vendor)).filter(Boolean))].sort(), [items]);
  const purchasesById = useMemo(() => new Map((purchases || []).map(p => [p.id, p])), [purchases]);
  const count = (status) => items.filter(i => i.status === status).length;
  const budget = settings.budgetTarget;
  const cards = [
    { label: "Items", value: String(items.length), sub: `${filtered.length} shown` },
    { label: "Approved", value: String(count("approved")), sub: `${count("shortlisted")} shortlisted` },
    { label: "Ordered", value: String(count("ordered")), sub: `${count("received") + count("kept")} received / kept` },
    { label: "Forecast vs budget", value: fmtUSD(forecast.forecast),
      sub: budget == null ? "Set target" : `${fmtUSD(budget - forecast.forecast)} ${budget - forecast.forecast >= 0 ? "under" : "over"} ${fmtUSD(budget)}`,
      onClick: budget == null ? () => setShowSettings(true) : null },
  ];
  const sel = { ...ppInput, maxWidth: 200, width: "auto" };

  // ── Research-agent round trip (formats are a contract — see shopping-logic.js §2.9 notes) ──
  const exportForAgent = () => {
    const bundle = buildExportBundle({ items, settings, propertyId, podcast: PODCAST_DATABASE, tools: TOOLS_DATA, now: new Date().toISOString() });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pp-shopping-export-${localISODate()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  // The import merges against the SERVER's current list, not this tab's in-memory copy: another device
  // may have approved/claimed/selected things since this tab loaded, and a whole-record save from a
  // stale copy would silently revert them.
  const loadFresh = async () => {
    const r = await fetch(apiUrl('/api/shopping', propertyId));
    if (!r.ok) throw new Error("bad status");
    return mergeShopping(partitionShoppingFields(await r.json()), SHOPPING_SEED.items);
  };
  const REFRESH_FAILED = "Couldn't refresh the shopping list from the server just now, so nothing was imported. Check your connection and try again.";
  const onPickResults = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";   // allow re-picking the same file
    if (!file) return;
    let json;
    try { json = JSON.parse(await file.text()); } catch (err) { setImportMsg({ error: "That file isn't valid JSON." }); return; }
    const v = validateResults(json, propertyId);
    if (!v.ok) { setImportMsg({ error: v.error }); return; }
    let fresh;
    try { fresh = await loadFresh(); } catch (err) { setImportMsg({ error: REFRESH_FAILED }); return; }
    setImportMsg(null);
    setImportPreview({ fileName: file.name, results: json, ...mergeResults(fresh.items, json, fresh.settings) });
  };
  const applyImport = async () => {
    let fresh;
    try { fresh = await loadFresh(); } catch (err) { setImportMsg({ error: REFRESH_FAILED }); setImportPreview(null); return; }
    const { touched } = mergeResults(fresh.items, importPreview.results, fresh.settings);   // recomputed right before applying
    touched.forEach(onSaveItem);   // one targeted write per touched item (never a whole-hash write)
    setImportMsg({ ok: touched.length === 0 ? "Nothing to change — this file is already imported." : `Imported: ${touched.length} item${touched.length === 1 ? "" : "s"} updated.` });
    setImportPreview(null);
  };
  const printForKerry = () => {
    const html = buildPrintHtml(items, settings, new Date().toISOString());
    const w = window.open("", "_blank");
    if (!w) { window.alert("Your browser blocked the print window. Allow pop-ups for this site and try again."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.charcoal, margin: 0 }}>Shopping</h2>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "4px 0 0" }}>Stocking the house for {settings.guestCount} guests · {items.length} items</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button disabled={!propertyId} onClick={exportForAgent} style={shBtn}>Export for agent</button>
          <button disabled={!canEdit || !propertyId} onClick={() => fileRef.current && fileRef.current.click()} style={shBtn}>Import agent results</button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPickResults} style={{ display: "none" }} />
          <button onClick={printForKerry} style={shBtn}>Print for Kerry</button>
          <button onClick={() => setShowSettings(s => !s)} style={shBtn}>Settings</button>
          <button disabled={!canEdit} onClick={() => setShowAdd(true)} style={{ ...shBtnPrimary, background: canEdit ? C.mint : C.border }}>+ Add item</button>
        </div>
      </div>
      {!loaded && <p style={{ color: C.textMuted, fontSize: 14, padding: "8px 0" }}>Loading saved changes…</p>}
      {loaded && loadError && <p style={{ color: C.ocean, fontSize: 14, fontWeight: 600 }}>Couldn’t load saved shopping changes — showing the starter list, and editing is off. Reload to try again.</p>}
      {loaded && !loadError && !canEdit && <p style={{ color: C.textMuted, fontSize: 13 }}>Editing is off until this property’s data is set up (open the app from the main address once to finish setup).</p>}

      {importMsg && importMsg.error && <p role="alert" style={{ color: C.ocean, fontSize: 14, fontWeight: 600 }}>{importMsg.error}</p>}
      {importMsg && importMsg.ok && <p style={{ color: C.mintDark, fontSize: 14, fontWeight: 600 }}>{importMsg.ok}</p>}
      {importPreview && <ShoppingImportPreview preview={importPreview} onApply={applyImport} onCancel={() => setImportPreview(null)} />}
      {showSettings && <ShoppingSettingsPanel key={JSON.stringify(settings)} settings={settings} canEdit={canEdit} onSave={onSaveSettings} onClose={() => setShowSettings(false)} />}
      {showAdd && <ShoppingItemForm isMobile={isMobile} onCancel={() => setShowAdd(false)} onSave={(item) => { onSaveItem(item); setShowAdd(false); setExpandedId(item.id); }} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 14 }}>
        {cards.map(c => {
          const style = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", textAlign: "left", fontFamily: font };
          const body = (<><div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>{c.label}</div><div style={{ fontSize: 22, fontWeight: 800, color: C.charcoal, marginTop: 4 }}>{c.value}</div><div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{c.sub}</div></>);
          return c.onClick ? <button key={c.label} onClick={c.onClick} style={{ ...style, cursor: "pointer", minHeight: 44 }}>{body}</button> : <div key={c.label} style={style}>{body}</div>;
        })}
      </div>

      {meals.length > 0 && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 8 }}>NO DISHES AFTER EVERY MEAL — can the {settings.guestCount} guests get through a day on one wash cycle?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {meals.map(m => { const lv = SHOP_LEVELS[m.level]; return <span key={m.dishType} style={shChip(lv.color, lv.bg)}>{m.dishType}: {m.total} · {m.level === "short" ? `${lv.label} for ${settings.guestCount}` : lv.label}</span>; })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <input value={filters.search} onChange={setFilter("search")} placeholder="Search items, notes, vendors…" style={{ ...ppInput, maxWidth: 280 }} />
        <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={sel} aria-label="Group by"><option value="category">Group: category</option><option value="status">Group: status</option></select>
        <select value={filters.status} onChange={setFilter("status")} style={sel} aria-label="Status"><option value="all">All statuses</option>{ITEM_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select value={filters.category} onChange={setFilter("category")} style={sel} aria-label="Category"><option value="all">All categories</option>{sortedShoppingCategories().map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select value={filters.priority} onChange={setFilter("priority")} style={sel} aria-label="Priority"><option value="all">All priorities</option>{ITEM_PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel[p]}</option>)}</select>
        <select value={filters.agentFlag} onChange={setFilter("agentFlag")} style={sel} aria-label="Agent flag"><option value="all">Any agent flag</option><option value="none">No flag</option>{AGENT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select value={filters.claimedBy} onChange={setFilter("claimedBy")} style={sel} aria-label="Claimed by"><option value="all">Anyone buying</option><option value="unclaimed">Unclaimed</option><option value="JM">JM buying</option><option value="KM">KM buying</option></select>
        <select value={filters.vendor} onChange={setFilter("vendor")} style={sel} aria-label="Vendor"><option value="all">Any vendor</option>{vendors.map(v => <option key={v} value={v}>{v}</option>)}</select>
      </div>

      {filtered.length === 0 && <p style={{ color: C.textMuted, fontSize: 14, textAlign: "center", padding: 32 }}>{items.length === 0 ? "No items yet." : "No items match your search or filters."}</p>}
      {groups.map(g => (
        <div key={g.key} style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: C.textSecondary, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{g.key} <span style={{ fontWeight: 600, color: C.textMuted }}>({g.items.length})</span></h3>
          {g.items.map(item => (
            <ShoppingItemCard key={item.id} item={item} settings={settings} isMobile={isMobile} nowISO={nowISO}
              expanded={expandedId === item.id} onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              canEdit={canEdit} onSave={onSaveItem} onRemove={(id) => { onRemoveItem(id); if (expandedId === id) setExpandedId(null); }}
              onMarkPurchased={onMarkPurchased} linkedPurchases={(item.purchaseIds || []).map(id => purchasesById.get(id)).filter(Boolean)} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── HOUSE INFO ──────────────────────────────────────────────────────────────
// House reference data (utility accounts, IDs, access codes, vendor contacts) — including
// real login credentials. Persisted server-side as a Redis hash (one field per item) via
// /api/house-info, same targeted-write discipline as Purchases. Deliberately NO localStorage
// cache (unlike Purchases/Tasks/Finishes): caching plaintext credentials client-side is a new
// exposure that outlives logout, so this tab just shows a brief loading state instead. See
// docs/superpowers/specs/2026-10-01-house-info-design.md for the full design rationale.

function HouseInfoForm({ initial, onSave, onCancel, isMobile }) {
  const [d, setD] = useState(initial);
  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  // No draft-recovery to localStorage here (unlike PurchaseForm) — this form can hold a
  // plaintext password, and persisting that to localStorage is exactly the new exposure
  // the design spec rules out.
  const canSave = !!d.category && !!(d.name || "").trim();
  const field = (label, node) => (
    <div style={{ flex: 1, minWidth: isMobile ? "100%" : 160 }}><label style={ppLabel}>{label}</label>{node}</div>
  );
  return (
    <div style={{ background: C.offWhite, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Category", (
          <select style={ppInput} value={d.category} onChange={e => set({ category: e.target.value })}>
            <option value="">—</option>
            {HOUSE_INFO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ))}
        {field("Name", <input autoFocus style={ppInput} value={d.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. FPL Electric" />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Account / policy #", <input style={ppInput} value={d.accountNumber} onChange={e => set({ accountNumber: e.target.value })} />)}
        {field("Phone", <input style={ppInput} value={d.phone} onChange={e => set({ phone: e.target.value })} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Username", <input style={ppInput} value={d.username} onChange={e => set({ username: e.target.value })} />)}
        {field("Password", <input type="password" style={ppInput} value={d.password} onChange={e => set({ password: e.target.value })} autoComplete="new-password" />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        {field("Login / payment URL", <input style={ppInput} value={d.url} onChange={e => set({ url: e.target.value })} placeholder="https://…" />)}
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={ppLabel}>Notes</label>
        <textarea style={{ ...ppInput, minHeight: 60, resize: "vertical" }} value={d.notes} onChange={e => set({ notes: e.target.value })} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => onSave(d)} disabled={!canSave} style={{ padding: "12px 18px", minHeight: 44, borderRadius: 8, border: "none", background: canSave ? C.mint : C.border, color: C.white, fontFamily: font, fontSize: 15, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed" }}>Save</button>
        <button onClick={onCancel} style={{ padding: "12px 18px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.textSecondary, fontFamily: font, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

function HouseInfoView({ houseInfo, loaded, canAdd, loadError, onSave, onDelete }) {
  const [editingId, setEditingId] = useState(null);   // id | "new" | null
  const [expandedId, setExpandedId] = useState(null);
  const [query, setQuery] = useState("");
  const [revealedFields, setRevealedFields] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Re-mask on ANY row-collapse-or-switch, not just same-row collapse: only one row can ever
  // be open at a time, so clearing every revealed field whenever expandedId changes (including
  // to null, e.g. via "+ Add item") is correct and covers the case the row-header onClick's own
  // reveal-clearing logic (below) misses — switching straight from row A to row B never runs
  // row A's onClick at all, so without this effect A's revealed password would still show
  // unmasked if A were reopened later (screen-share safety gap).
  useEffect(() => {
    setRevealedFields({});
  }, [expandedId]);

  // Falls back to window.prompt if the Clipboard API is unavailable or denied (e.g. a
  // non-HTTPS context or a browser permission block), so "Copy" never silently does nothing.
  const copyToClipboard = (text, key) => {
    const done = () => { setCopiedKey(key); setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => window.prompt("Copy:", text));
    } else {
      window.prompt("Copy:", text);
    }
  };

  const copyBtnStyle = { background: "none", border: "none", color: C.mint, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 10px", minHeight: 44 };

  // Shared renderer for both masked (accountNumber/password) and plain (username/phone)
  // fields — maskable controls whether a Reveal/Hide toggle is shown.
  const fieldRow = (itemId, field, label, value, maskable) => {
    if (!value) return null;
    const key = `${itemId}:${field}`;
    const revealed = !maskable || !!revealedFields[key];
    return (
      <div key={field} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.textMuted, minWidth: 90 }}>{label}:</span>
        <span style={{ fontSize: 13, color: C.charcoal, fontFamily: maskable && revealed ? "monospace" : font }}>{revealed ? value : "••••••••"}</span>
        {maskable && (
          <button type="button" onClick={() => setRevealedFields(prev => ({ ...prev, [key]: !prev[key] }))} style={copyBtnStyle}>{revealed ? "Hide" : "Reveal"}</button>
        )}
        <button type="button" onClick={() => copyToClipboard(value, key)} style={copyBtnStyle}>{copiedKey === key ? "Copied!" : "Copy"}</button>
      </div>
    );
  };

  // Only http(s) values render as a clickable link — a saved javascript:-scheme (or any
  // other) value always renders as inert plain text, regardless of how it got there.
  const urlRow = (itemId, value) => {
    if (!value) return null;
    const isLink = /^https?:\/\//i.test(value);
    const key = `${itemId}:url`;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.textMuted, minWidth: 90 }}>Link:</span>
        {isLink
          ? <a href={value} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: C.mint, wordBreak: "break-all" }}>{value}</a>
          : <span style={{ fontSize: 13, color: C.charcoal, wordBreak: "break-all" }}>{value}</span>}
        <button type="button" onClick={() => copyToClipboard(value, key)} style={copyBtnStyle}>{copiedKey === key ? "Copied!" : "Copy"}</button>
      </div>
    );
  };

  const filtered = useMemo(() => {
    const list = houseInfo.filter(item => matchesHouseInfoSearch(item, query));
    // Null-safe: groupHouseInfoByCategory already tolerates a missing/unrecognized category
    // (see Task 1), so this sort must too — a record that ever reached storage with no
    // category (only possible via a direct Redis write, not through the validated API)
    // must not crash the whole tab.
    return [...list].sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.name || "").localeCompare(b.name || ""));
  }, [houseInfo, query]);

  // groupHouseInfoByCategory (unit-tested in Task 1) orders every known category first, then
  // any category actually present in the data that isn't in today's HOUSE_INFO_CATEGORIES
  // (e.g. after a future category rename) — so an item never silently disappears just
  // because its category fell out of the official list.
  const { order: categoryOrder, groups: grouped } = useMemo(() => groupHouseInfoByCategory(filtered), [filtered]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.charcoal, margin: 0 }}>House Info</h2>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "4px 0 0" }}>Accounts, IDs, access codes & vendor contacts · {houseInfo.length} saved</p>
        </div>
        {editingId !== "new" && (
          <button
            onClick={() => { setEditingId("new"); setExpandedId(null); }}
            disabled={!canAdd}
            style={{ padding: "10px 18px", minHeight: 44, borderRadius: 8, border: "none", background: canAdd ? C.mint : C.border, color: C.white, fontFamily: font, fontSize: 14, fontWeight: 700, cursor: canAdd ? "pointer" : "not-allowed" }}
          >+ Add item</button>
        )}
      </div>

      {/* `loaded` = the GET attempt has settled (success or fail) — clears the spinner.
          `canAdd` = loaded AND a property is active AND that load didn't fail — gates writes.
          `loaded` and `canAdd` are kept separate so the tab still renders (rather than
          spinning forever) in local dev, where activeProperty never leaves null: `loaded`
          becomes true immediately there even though `canAdd` stays false. `loadError` is
          checked first below, ahead of both the generic "not ready" message and the "Nothing
          saved yet" empty-state message, so a failed load can never be mistaken for either. */}
      {!loaded && <p style={{ color: C.textMuted, fontSize: 14, textAlign: "center", padding: 32 }}>Loading…</p>}
      {loaded && loadError && <p style={{ color: C.textMuted, fontSize: 14, textAlign: "center", padding: 32 }}>Couldn't load house info — reload the page to try again.</p>}
      {loaded && !loadError && !canAdd && <p style={{ color: C.textMuted, fontSize: 14, textAlign: "center", padding: 32 }}>House info isn't available yet — no active property is set. Try reloading the page.</p>}

      {editingId === "new" && (
        <HouseInfoForm
          initial={emptyHouseInfoItem()}
          onSave={(item) => { onSave(item); setEditingId(null); setExpandedId(item.id); }}
          onCancel={() => setEditingId(null)}
          isMobile={isMobile}
        />
      )}

      {loaded && houseInfo.length > 0 && (
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search house info…" style={{ ...ppInput, marginBottom: 16, maxWidth: 320 }} />
      )}

      {loaded && canAdd && houseInfo.length === 0 && editingId !== "new" && (
        <p style={{ color: C.textMuted, fontSize: 14, textAlign: "center", padding: 32 }}>Nothing saved yet. Click "+ Add item" to log your first account, ID, or access code.</p>
      )}

      {loaded && categoryOrder.map(category => {
        const items = grouped[category] || [];
        if (items.length === 0) return null;
        return (
          <div key={category} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary, textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 10px" }}>{category}</h3>
            {items.map(item => {
              const isOpen = expandedId === item.id;
              const isEditing = editingId === item.id;
              return (
                <div key={item.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
                  <button onClick={() => {
                    // Collapsing re-masks: a revealed password/account number shouldn't stay
                    // revealed the next time this row is opened (screen-share safety).
                    if (isOpen) {
                      setRevealedFields(prev => {
                        const next = { ...prev };
                        delete next[`${item.id}:accountNumber`];
                        delete next[`${item.id}:password`];
                        return next;
                      });
                    }
                    setExpandedId(isOpen ? null : item.id);
                    setEditingId(null);
                  }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.charcoal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{item.updatedBy ? `Updated by ${item.updatedBy}` : ""}</div>
                    </div>
                  </button>
                  {isOpen && !isEditing && (
                    <div style={{ padding: "0 16px 16px" }}>
                      {fieldRow(item.id, "accountNumber", "Account #", item.accountNumber, true)}
                      {fieldRow(item.id, "username", "Username", item.username, false)}
                      {fieldRow(item.id, "password", "Password", item.password, true)}
                      {fieldRow(item.id, "phone", "Phone", item.phone, false)}
                      {urlRow(item.id, item.url)}
                      {item.notes && <p style={{ fontSize: 13, color: C.textMuted, marginTop: 8 }}>{item.notes}</p>}
                      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <button onClick={() => setEditingId(item.id)} style={{ padding: "10px 18px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.charcoal, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => { if (window.confirm(`Delete "${item.name}"?`)) { onDelete(item.id); setExpandedId(null); } }} style={{ padding: "10px 18px", minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.ocean, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                      </div>
                    </div>
                  )}
                  {isOpen && isEditing && (
                    <div style={{ padding: "0 16px 16px" }}>
                      <HouseInfoForm
                        initial={item}
                        onSave={(updated) => { onSave(updated); setEditingId(null); }}
                        onCancel={() => setEditingId(null)}
                        isMobile={isMobile}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── MULTI-PROPERTY (Phase 1) ────────────────────────────────────────────────
// Data is scoped per property. Pre-migration (activeProperty === null) the app reads
// and writes the LEGACY global keys, so it behaves exactly as before until the owner
// runs the one-time migration. localStorage cache keys are also per-property so
// switching properties never bleeds one property's cached data into another.

const LS_TASKS = "pool-paddle-tasks-v2";
const LS_FINISHES = "pool-paddle-finishes-v1";
const LS_SHOPPING = "pool-paddle-shopping-v1";
const LS_ACTIVE_PROPERTY = "pool-paddle-active-property";

// localStorage key for a property (legacy base key when propertyId is null/pre-migration).
function lsKey(base, propertyId) {
  return propertyId ? `${base}:${propertyId}` : base;
}
// API url for a property (no ?property= when null → hits the legacy global key).
function apiUrl(base, propertyId) {
  return propertyId ? `${base}?property=${encodeURIComponent(propertyId)}` : base;
}
function readActiveProperty() {
  try { return localStorage.getItem(LS_ACTIVE_PROPERTY) || null; } catch (e) { return null; }
}
function loadTasksFromCache(propertyId) {
  try {
    const raw = localStorage.getItem(lsKey(LS_TASKS, propertyId));
    if (raw) return mergeTasks(JSON.parse(raw));
  } catch (e) { /* fall through to defaults */ }
  return DEFAULT_TASKS;
}
function loadFinishesFromCache(propertyId) {
  try {
    const raw = localStorage.getItem(lsKey(LS_FINISHES, propertyId));
    if (raw) {
      const parsed = JSON.parse(raw);
      const deletedIds = parsed.deletedIds || [];
      return {
        finishes: mergeFinishes(parsed.items || parsed, deletedIds, DEFAULT_FINISH_ITEMS),
        deletedIds,
        targetBudget: parsed.targetBudget ?? null,
        roomData: parsed.roomData ?? {},
      };
    }
  } catch (e) { /* fall through to defaults */ }
  return { finishes: DEFAULT_FINISH_ITEMS, deletedIds: [], targetBudget: null, roomData: {} };
}

const modalOverlayStyle = {
  position: "fixed", inset: 0, zIndex: 1000,
  background: "rgba(51,51,51,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20,
};
const modalCardStyle = {
  background: C.white, borderRadius: 16, border: `1px solid ${C.border}`,
  padding: "32px 28px", maxWidth: 460, width: "100%",
  boxShadow: "0 8px 40px rgba(0,0,0,0.18)", fontFamily: font,
};

// Shopping list = bundled seed + this property's saved edits. The localStorage cache holds the MERGED
// result (local read-cache only — server writes are per-field via the handlers in App).
function loadShoppingFromCache(propertyId) {
  try {
    const raw = localStorage.getItem(lsKey(LS_SHOPPING, propertyId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items) && parsed.settings) {
        return { items: parsed.items.map(normalizeShoppingItem), settings: parsed.settings };
      }
    }
  } catch (e) { /* fall through to the seed */ }
  return mergeShopping({ itemsById: {}, deletedIds: [], settings: null }, SHOPPING_SEED.items);
}

export default function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [activeProperty, setActiveProperty] = useState(() => readActiveProperty());
  const [properties, setProperties] = useState([]);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [showSignoff, setShowSignoff] = useState(false);
  const [focusItemId, setFocusItemId] = useState(null);
  const [focusItemSource, setFocusItemSource] = useState(null);
  const [focusPurchaseId, setFocusPurchaseId] = useState(null);
  const [focusPurchaseMode, setFocusPurchaseMode] = useState("edit");   // "edit" (promote paths) | "view" (Dashboard deep link)

  const navigateToItem = (source, itemId) => {
    setFocusItemId(itemId);
    setFocusItemSource(source);
    setActiveView(source === "task" ? "tasks" : "design");
  };
  // Initial state loads from the active property's localStorage cache (legacy base key
  // when pre-migration). activeProperty holds its initial value here on first render.
  const [tasks, setTasks] = useState(() => loadTasksFromCache(activeProperty));
  const [deletedFinishIds, setDeletedFinishIds] = useState(() => loadFinishesFromCache(activeProperty).deletedIds);
  const [finishes, setFinishes] = useState(() => loadFinishesFromCache(activeProperty).finishes);
  const [targetBudget, setTargetBudget] = useState(() => loadFinishesFromCache(activeProperty).targetBudget);
  const [roomData, setRoomData] = useState(() => loadFinishesFromCache(activeProperty).roomData);
  const [syncError, setSyncError] = useState(null);
  const serverLoaded = useRef(false);
  const finishesServerLoaded = useRef(false);
  const tasksFirstRun = useRef(true);
  const finishesFirstRun = useRef(true);
  const [purchases, setPurchases] = useState(() => loadPurchasesFromCache(activeProperty));
  const purchasesServerLoaded = useRef(false);
  const purchasesFirstRun = useRef(true);
  const [houseInfo, setHouseInfo] = useState([]);
  const [houseInfoLoaded, setHouseInfoLoaded] = useState(false);
  const [houseInfoLoadError, setHouseInfoLoadError] = useState(false);
  const [shopping, setShopping] = useState(() => loadShoppingFromCache(activeProperty));
  const [shoppingLoaded, setShoppingLoaded] = useState(false);
  const [shoppingLoadError, setShoppingLoadError] = useState(false);
  const shoppingServerLoaded = useRef(false);
  const shoppingFirstRun = useRef(true);
  const shoppingFieldTimers = useRef({});    // field -> debounce timer
  const shoppingFieldPending = useRef({});   // field -> latest unsent value
  const [inbox, setInbox] = useState([]);                 // Receipt Inbox records (no localStorage cache: they carry addresses)
  const [inboxLoaded, setInboxLoaded] = useState(false);
  const [inboxLoadError, setInboxLoadError] = useState(false);
  const [inboxUploads, setInboxUploads] = useState([]);   // in-flight uploads: [{ key, name, stage, error }]
  const inboxServerLoaded = useRef(false);
  const inboxTimers = useRef({});                         // id -> debounce timer
  const inboxPending = useRef({});                        // id -> { rec, prop }: latest unsent record + the property it belongs to
  const inboxSeq = useRef({});                            // id -> local edit counter (a server reply is only adopted if no newer local edit happened)
  const [inboxNotice, setInboxNotice] = useState(null);  // { text, purchaseId } after a successful filing
  const inboxNoticeTimer = useRef(null);
  const inboxFiling = useRef(new Set());                  // double-click guard for File

  // Load the property registry once. Decides migrated vs. needs-migration.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/properties')
      .then(r => r.json())
      .then(reg => {
        if (cancelled) return;
        if (reg && reg.schemaVersion && Array.isArray(reg.properties) && reg.properties.length > 0) {
          setProperties(reg.properties);
          const validIds = reg.properties.map(p => p.id);
          const lsActive = readActiveProperty();
          const active = (lsActive && validIds.includes(lsActive)) ? lsActive
            : (reg.activeId && validIds.includes(reg.activeId)) ? reg.activeId
            : reg.properties[0].id;
          setActiveProperty(active);
          try { localStorage.setItem(LS_ACTIVE_PROPERTY, active); } catch (e) { /* ignore */ }
        } else {
          // Not migrated yet — stay on the legacy globals and offer the migration.
          setMigrationNeeded(true);
          setShowMigrationModal(true);
        }
      })
      .catch(() => { /* offline / route missing → stay on legacy data, no modal */ });
    return () => { cancelled = true; };
  }, []);

  // Fetch tasks for the active property. Cancellation-guarded so a stale (out-of-order)
  // resolution after a rapid property switch can never apply under the wrong key.
  // On a switch (not first run) we immediately show this property's cache, never stale.
  useEffect(() => {
    serverLoaded.current = false;
    let cancelled = false;
    if (tasksFirstRun.current) {
      tasksFirstRun.current = false; // state already initialized from cache
    } else {
      setTasks(loadTasksFromCache(activeProperty));
    }
    fetch(apiUrl('/api/tasks', activeProperty))
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        serverLoaded.current = true;
        if (data && Array.isArray(data) && data.length > 0) {
          setTasks(mergeTasks(data));
        }
      })
      .catch(() => { if (!cancelled) serverLoaded.current = true; });
    return () => { cancelled = true; };
  }, [activeProperty]);

  // Fetch finishes for the active property from the per-record HASH (server migrates the
  // legacy blob → hash on first read). Same cancellation discipline as tasks/purchases.
  useEffect(() => {
    finishesServerLoaded.current = false;
    let cancelled = false;
    if (finishesFirstRun.current) {
      finishesFirstRun.current = false;
    } else {
      const cached = loadFinishesFromCache(activeProperty);
      setDeletedFinishIds(cached.deletedIds);
      setFinishes(cached.finishes);
      setTargetBudget(cached.targetBudget);
      setRoomData(cached.roomData);
    }
    fetch(apiUrl('/api/finish-records', activeProperty))
      .then(r => r.json())
      .then(map => {
        if (cancelled) return;
        finishesServerLoaded.current = true;
        const { savedItems, deletedIds, roomData: rd, targetBudget: tb } = partitionFinishFields(map);
        // Only apply server data when the hash actually has records (a brand-new property
        // returns {} → keep defaults, exactly like the old `items.length > 0` guard).
        // INVARIANT: the hash is fully empty ONLY for a fresh property — deleting a default
        // always leaves a tombstone (deletedIds > 0) and user items leave item: fields. So an
        // all-empty partition can't be a "user deleted everything" state. If a future
        // "restore all defaults" feature HDELs tombstones, revisit this guard.
        if (savedItems.length > 0 || deletedIds.length > 0 || Object.keys(rd).length > 0 || tb != null) {
          setDeletedFinishIds(deletedIds);
          setFinishes(mergeFinishes(savedItems, deletedIds, DEFAULT_FINISH_ITEMS));
          setRoomData(rd);
          if (tb != null) setTargetBudget(tb);
        }
      })
      .catch(() => { if (!cancelled) finishesServerLoaded.current = true; });
    return () => { cancelled = true; };
  }, [activeProperty]);

  // Fetch purchases for the active property (same load discipline as tasks/finishes).
  useEffect(() => {
    purchasesServerLoaded.current = false;
    let cancelled = false;
    if (purchasesFirstRun.current) {
      purchasesFirstRun.current = false;
    } else {
      setPurchases(loadPurchasesFromCache(activeProperty));
    }
    fetch(apiUrl('/api/purchases', activeProperty))
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        purchasesServerLoaded.current = true;
        if (Array.isArray(data)) setPurchases(data.map(normalizePurchase));
      })
      .catch(() => { if (!cancelled) purchasesServerLoaded.current = true; });
    return () => { cancelled = true; };
  }, [activeProperty]);

  // Fetch house info for the active property. api/house-info.js REQUIRES ?property= and
  // 400s without it (there's no legacy data to fall back to), so pre-migration
  // (activeProperty === null) there is nothing to fetch — show an empty, "loaded" list
  // rather than calling an endpoint guaranteed to fail. No localStorage cache to seed from
  // (see the HOUSE INFO section banner above `HouseInfoView`). houseInfo is cleared at the
  // START of every run (not just the no-property case) so that if a property switch's GET
  // ever resolves with something other than an array (an expired session, a 400/500), the
  // PREVIOUS property's items — including credentials — can never render under the new
  // property while this settles; there is no cache to safely re-seed from instead (contrast
  // the purchases effect, which re-seeds from that property's cache on every run).
  useEffect(() => {
    setHouseInfo([]);
    setHouseInfoLoadError(false);
    if (!activeProperty) { setHouseInfoLoaded(true); return; }
    setHouseInfoLoaded(false);
    let cancelled = false;
    fetch(apiUrl('/api/house-info', activeProperty))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('bad response'))))
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data)) {
          setHouseInfo(data);
        } else {
          // A 200 with a non-array body is still a failure we must surface — leaving
          // houseInfo as [] here would be indistinguishable from a real empty list.
          setHouseInfoLoadError(true);
        }
        setHouseInfoLoaded(true);
      })
      .catch(() => { if (!cancelled) { setHouseInfoLoadError(true); setHouseInfoLoaded(true); } });
    return () => { cancelled = true; };
  }, [activeProperty]);

  // Save tasks to localStorage + server (debounced, property-scoped).
  // activeProperty is deliberately NOT a dependency: the effect must run only when the
  // DATA changes, never on a bare property switch. On a switch, `tasks` still holds the
  // previous property's data for one commit — firing then would write it under the new
  // property's key. When the effect runs after the fetch effect's setTasks applies the
  // new property's data, the closure's activeProperty and the data are always consistent.
  useEffect(() => {
    try {
      localStorage.setItem(lsKey(LS_TASKS, activeProperty), JSON.stringify(tasks));
    } catch (e) { console.warn('localStorage save failed:', e.name); }

    if (!serverLoaded.current) return;

    const timer = setTimeout(() => {
      fetch(apiUrl('/api/tasks', activeProperty), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tasks),
      }).then(r => {
        if (!r.ok) setSyncError('Failed to save tasks');
        else setSyncError(null);
      }).catch(() => setSyncError('Unable to reach server'));
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  // Cache finishes to localStorage (LOCAL read-cache only — server writes are per-record
  // via the write helpers, never a whole-array PUT). activeProperty omitted from deps for
  // the same reason as the tasks save effect.
  useEffect(() => {
    const payload = { items: finishes, targetBudget, roomData, deletedIds: deletedFinishIds };
    try {
      localStorage.setItem(lsKey(LS_FINISHES, activeProperty), JSON.stringify(payload));
    } catch (e) { console.warn('localStorage save failed:', e.name); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishes, targetBudget, roomData, deletedFinishIds]);

  // Cache purchases to localStorage (LOCAL read-cache only — server writes are per-record
  // via the handlers below, never a whole-array PUT). activeProperty omitted from deps for
  // the same reason as the tasks/finishes save effects.
  useEffect(() => {
    try {
      localStorage.setItem(lsKey(LS_PURCHASES, activeProperty), JSON.stringify(purchases));
    } catch (e) { console.warn('localStorage save failed:', e.name); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases]);

  // Fetch the shopping list's saved edits for the active property. api/shopping.js REQUIRES ?property=
  // (no legacy data), so pre-migration there is nothing to load and edits are disabled. Cancellation-
  // guarded like every other fetch effect so an out-of-order response after a rapid property switch can
  // never apply under the wrong key; on a switch we show that property's cache first. Writes stay gated
  // by shoppingServerLoaded so seed/cache defaults can never clobber saved server data.
  useEffect(() => {
    shoppingServerLoaded.current = false;
    let cancelled = false;
    setShoppingLoadError(false);
    if (shoppingFirstRun.current) {
      shoppingFirstRun.current = false;   // state already initialized from cache
    } else {
      setShopping(loadShoppingFromCache(activeProperty));
    }
    if (!activeProperty) { setShoppingLoaded(true); return () => { cancelled = true; }; }
    setShoppingLoaded(false);
    fetch(apiUrl('/api/shopping', activeProperty))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('bad status'))))
      .then(map => {
        if (cancelled) return;
        setShopping(mergeShopping(partitionShoppingFields(map), SHOPPING_SEED.items));
        shoppingServerLoaded.current = true;
        setShoppingLoaded(true);
      })
      .catch(() => { if (!cancelled) { setShoppingLoadError(true); setShoppingLoaded(true); } });
    return () => { cancelled = true; };
  }, [activeProperty]);

  // Cache the merged shopping list locally (read-cache only). activeProperty omitted from deps for the
  // same reason as the other cache/save effects.
  useEffect(() => {
    if (!shoppingServerLoaded.current) return;   // gated like the server writes: never cache seed defaults before the saved list loads
    try {
      localStorage.setItem(lsKey(LS_SHOPPING, activeProperty), JSON.stringify(shopping));
    } catch (e) { console.warn('localStorage save failed:', e.name); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopping]);

  // ── Property switch + migration + backup handlers ─────────────────────────
  const switchProperty = (id) => {
    if (!id || id === activeProperty) return;
    setActiveProperty(id);
    try { localStorage.setItem(LS_ACTIVE_PROPERTY, id); } catch (e) { /* ignore */ }
  };

  const downloadBackup = async () => {
    try {
      const r = await fetch('/api/backup');
      if (!r.ok) { setSyncError('Backup failed — please try again.'); return; }
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pool-paddle-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupDownloaded(true);
    } catch (e) {
      setSyncError('Backup failed to reach the server — please try again.');
    }
  };

  const runMigration = async () => {
    setMigrating(true);
    try {
      const r = await fetch('/api/migrate', { method: 'POST' });
      const result = await r.json();
      if (r.ok && (result.status === 'migrated' || result.status === 'already') && result.properties) {
        const reg = result.properties;
        setProperties(reg.properties);
        const active = reg.activeId || reg.properties[0].id;
        // Seed the new property's cache from the current (legacy) in-memory state so the
        // switch shows correct data immediately — no flash of defaults before the server
        // load returns, and no transient wrong-cache write.
        try {
          localStorage.setItem(lsKey(LS_TASKS, active), JSON.stringify(tasks));
          localStorage.setItem(lsKey(LS_FINISHES, active), JSON.stringify({ items: finishes, targetBudget, roomData, deletedIds: deletedFinishIds }));
        } catch (e) { /* ignore */ }
        setActiveProperty(active);
        try { localStorage.setItem(LS_ACTIVE_PROPERTY, active); } catch (e) { /* ignore */ }
        setMigrationNeeded(false);
        setShowMigrationModal(false);
        setShowSignoff(true);
      } else if (result.status === 'locked') {
        setSyncError('Setup is already running in another tab — please wait a moment and reload.');
      } else {
        setSyncError('Setup failed — your data is safe. Please try again.');
      }
    } catch (e) {
      setSyncError('Setup could not reach the server — your data is safe. Please try again.');
    } finally {
      setMigrating(false);
    }
  };

  // Purchases — per-record server mutations (HSET/HDEL), never a whole-array write.
  const savePurchase = (purchase) => {
    setPurchases(prev => (prev.some(p => p.id === purchase.id)
      ? prev.map(p => (p.id === purchase.id ? purchase : p))
      : [...prev, purchase]));
    return fetch(apiUrl('/api/purchases', activeProperty), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purchase),
    }).then(r => { if (!r.ok) { setSyncError('Failed to save purchase'); return false; } setSyncError(null); return true; })
      .catch(() => { setSyncError('Unable to reach server'); return false; });   // resolves true/false so callers (Receipt Inbox filing) can wait for the outcome
  };
  const deletePurchase = (id) => {
    setPurchases(prev => prev.filter(p => p.id !== id));
    const base = apiUrl('/api/purchases', activeProperty);
    const url = base + (activeProperty ? '&' : '?') + 'id=' + encodeURIComponent(id);
    fetch(url, { method: 'DELETE' })
      .then(r => { if (!r.ok) setSyncError('Failed to delete purchase'); else setSyncError(null); })
      .catch(() => setSyncError('Unable to reach server'));
  };
  const changePurchaseReceipts = (id, receipts) => {
    const target = purchases.find(p => p.id === id);
    if (target) savePurchase({ ...target, receipts });
  };
  // "Add line to this order": give the source an order group if it has none, then create a new
  // line that shares the order-level fields and the SAME receipt pathnames (by reference).
  // Persisted immediately, like promote; each save is a targeted single-record PUT.
  const addLineToOrder = (source) => {
    let src = source;
    if (!src.orderGroupId) {
      src = { ...source, orderGroupId: newOrderGroupId(), lineNo: 1 };
      savePurchase(src);
    }
    const members = purchases.filter(p => p.orderGroupId === src.orderGroupId);
    const maxLine = members.reduce((m, p) => Math.max(m, Number(p.lineNo) || 0), 0);
    const line = {
      ...emptyPurchase(),
      vendor: src.vendor, invoiceNo: src.invoiceNo, purchasedBy: src.purchasedBy,
      ownerPurchased: src.ownerPurchased, paymentMethod: src.paymentMethod,
      purchaseDate: src.purchaseDate, docType: src.docType, sourceVendor: src.sourceVendor,
      reimbursable: src.reimbursable, reimbursedBy: src.reimbursedBy,
      reimbursementStatus: src.reimbursable ? "pending" : "none",
      orderGroupId: src.orderGroupId,
      lineNo: Math.max(maxLine, members.length, 1) + 1,
      receipts: src.receipts || [],
      placedInServiceDate: activeInServiceDate,
    };
    savePurchase(line);
    setFocusPurchaseMode("edit");
    setFocusPurchaseId(line.id);
    setActiveView("purchases");
  };

  // House info — per-record server mutations (HSET/HDEL one field via api/house-info.js),
  // never a whole-array write. The PUT response carries the server-stamped item (real
  // updatedAt/updatedBy), so a successful save reconciles local state with it immediately
  // instead of waiting for the next reload.
  const saveHouseInfo = (item) => {
    setHouseInfo(prev => (prev.some(h => h.id === item.id)
      ? prev.map(h => (h.id === item.id ? item : h))
      : [...prev, item]));
    fetch(apiUrl('/api/house-info', activeProperty), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    }).then(async (r) => {
      if (!r.ok) { setSyncError('Failed to save house info — not saved anywhere; please retry'); return; }
      setSyncError(null);
      const body = await r.json().catch(() => null);
      if (body && body.item) {
        setHouseInfo(prev => prev.map(h => (h.id === body.item.id ? body.item : h)));
      }
    }).catch(() => setSyncError('Unable to reach server — house info not saved; please retry'));
  };
  const deleteHouseInfo = (id) => {
    setHouseInfo(prev => prev.filter(h => h.id !== id));
    const base = apiUrl('/api/house-info', activeProperty);
    const url = base + (activeProperty ? '&' : '?') + 'id=' + encodeURIComponent(id);
    fetch(url, { method: 'DELETE' })
      .then(r => { if (!r.ok) setSyncError('Failed to delete house info — please retry'); else setSyncError(null); })
      .catch(() => setSyncError('Unable to reach server — house info change not saved; please retry'));
  };
  // Whether it's actually safe to write: the initial load has settled, a property is
  // active, AND that load didn't fail. Passed to HouseInfoView as `canAdd`, kept separate
  // from `houseInfoLoaded` (passed as `loaded`) so the tab still renders (rather than
  // spinning forever) in local dev, where activeProperty never leaves null: `loaded`
  // becomes true immediately there even though `canAdd` stays false.
  const houseInfoReady = houseInfoLoaded && !!activeProperty && !houseInfoLoadError;

  // ── Finishes — per-record server mutations (HSET/HDEL one field), never a whole-array
  // write. finishesServerLoaded gates writes so loading defaults/cache never persists.
  const finishFieldTimers = useRef({});   // field → setTimeout id (debounce)
  const finishFieldPending = useRef({});  // field → latest value awaiting its write

  // Cancel any pending debounced write for a field (used before a superseding write,
  // e.g. a delete/tombstone must beat a still-pending rename — otherwise the stale rename
  // fires after the tombstone and resurrects the deleted item on reload).
  const cancelPendingFinishField = (field) => {
    if (finishFieldTimers.current[field]) {
      clearTimeout(finishFieldTimers.current[field]);
      delete finishFieldTimers.current[field];
    }
    delete finishFieldPending.current[field];
  };

  // `useKeepalive` lets the unload/hide flush survive tab close (browsers cancel plain
  // in-flight fetches on unload; keepalive does not).
  const putFinishField = (field, value, useKeepalive = false) => {
    if (!finishesServerLoaded.current) return;
    fetch(apiUrl('/api/finish-records', activeProperty), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
      keepalive: useKeepalive,
    }).then(r => { if (!r.ok) setSyncError('Failed to save finishes'); else setSyncError(null); })
      .catch(() => setSyncError('Unable to reach server'));
  };

  const deleteFinishField = (field) => {
    if (!finishesServerLoaded.current) return;
    cancelPendingFinishField(field);   // a delete supersedes any queued write to this field
    const base = apiUrl('/api/finish-records', activeProperty);
    const url = base + (activeProperty ? '&' : '?') + 'field=' + encodeURIComponent(field);
    fetch(url, { method: 'DELETE' })
      .then(r => { if (!r.ok) setSyncError('Failed to save finishes'); else setSyncError(null); })
      .catch(() => setSyncError('Unable to reach server'));
  };

  // Debounced field write (coalesces rapid keystrokes on the same field).
  const putFinishFieldDebounced = (field, value) => {
    finishFieldPending.current[field] = value;
    if (finishFieldTimers.current[field]) clearTimeout(finishFieldTimers.current[field]);
    finishFieldTimers.current[field] = setTimeout(() => {
      delete finishFieldTimers.current[field];
      delete finishFieldPending.current[field];
      putFinishField(field, value);
    }, 400);
  };

  // Fire any still-pending debounced writes immediately (tab hidden / page unload).
  // keepalive=true so the request isn't cancelled when the page is closing.
  const flushFinishFields = () => {
    for (const id of Object.values(finishFieldTimers.current)) clearTimeout(id);
    const pending = finishFieldPending.current;
    finishFieldTimers.current = {};
    finishFieldPending.current = {};
    for (const [field, value] of Object.entries(pending)) putFinishField(field, value, true);
  };

  // Typed callbacks passed to DesignView (kept here so all server I/O lives in the parent).
  // tombstone/remove call putFinishField/deleteFinishField which cancel any pending rename
  // on the SAME field first, so a delete can never be undone by a late debounced write.
  const writeFinishItem = (item) => putFinishFieldDebounced(finishItemField(item.id), item);
  const tombstoneFinishItem = (id) => {
    const field = finishItemField(id);
    cancelPendingFinishField(field);   // beat any still-pending rename for this item
    putFinishField(field, tombstone(id));
  };
  const removeFinishItem = (id) => deleteFinishField(finishItemField(id));
  const writeFurniture = (roomId, furn) => putFinishField(furnitureField(roomId, furn.id), furn);
  const removeFurniture = (roomId, furnId) => deleteFinishField(furnitureField(roomId, furnId));
  const writeRoomMeta = (roomId, meta) => putFinishField(roomField(roomId), meta);
  const writeBudget = (val) => putFinishField(BUDGET_FIELD, val);

  // Shopping — per-field server mutations (HSET/HDEL one field via api/shopping.js), never a
  // whole-hash write. Item edits are debounced per field (coalesces typing) and flushed on hide/unload.
  // The hide/unload flush listener is registered once, so writers read the CURRENT property from a ref
  // (a closure would keep the first render's null property and PUT without ?property=).
  const activePropertyRef = useRef(activeProperty);
  activePropertyRef.current = activeProperty;
  const putShoppingField = (field, value, useKeepalive = false) => {
    if (!shoppingServerLoaded.current) return;
    fetch(apiUrl('/api/shopping', activePropertyRef.current), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
      keepalive: useKeepalive,
    }).then(r => { if (!r.ok) setSyncError('Failed to save shopping list'); else setSyncError(null); })
      .catch(() => setSyncError('Unable to reach server'));
  };
  const cancelPendingShoppingField = (field) => {
    if (shoppingFieldTimers.current[field]) { clearTimeout(shoppingFieldTimers.current[field]); delete shoppingFieldTimers.current[field]; }
    delete shoppingFieldPending.current[field];
  };
  const putShoppingFieldDebounced = (field, value) => {
    shoppingFieldPending.current[field] = value;
    if (shoppingFieldTimers.current[field]) clearTimeout(shoppingFieldTimers.current[field]);
    shoppingFieldTimers.current[field] = setTimeout(() => {
      delete shoppingFieldTimers.current[field];
      delete shoppingFieldPending.current[field];
      putShoppingField(field, value);
    }, 400);
  };
  const flushShoppingFields = () => {
    for (const id of Object.values(shoppingFieldTimers.current)) clearTimeout(id);
    const pending = shoppingFieldPending.current;
    shoppingFieldTimers.current = {};
    shoppingFieldPending.current = {};
    for (const [field, value] of Object.entries(pending)) putShoppingField(field, value, true);
  };
  const saveShoppingItem = (item) => {
    setShopping(prev => ({
      ...prev,
      items: prev.items.some(i => i.id === item.id) ? prev.items.map(i => (i.id === item.id ? item : i)) : [...prev.items, item],
    }));
    putShoppingFieldDebounced(shoppingItemField(item.id), item);
  };
  // Deleting a seed item writes a tombstone (so the seed can't resurrect it); a user-created item is just removed.
  const removeShoppingItem = (id) => {
    const item = shopping.items.find(i => i.id === id);
    setShopping(prev => ({ ...prev, items: prev.items.filter(i => i.id !== id) }));
    const field = shoppingItemField(id);
    cancelPendingShoppingField(field);
    if (!shoppingServerLoaded.current) return;
    if (item && item.userCreated === false) {
      putShoppingField(field, { id, __deleted: true });
    } else {
      const base = apiUrl('/api/shopping', activeProperty);
      fetch(base + (activeProperty ? '&' : '?') + 'field=' + encodeURIComponent(field), { method: 'DELETE' })
        .then(r => { if (!r.ok) setSyncError('Failed to save shopping list'); else setSyncError(null); })
        .catch(() => setSyncError('Unable to reach server'));
    }
  };
  const saveShoppingSettings = (settings) => {
    setShopping(prev => ({ ...prev, settings }));
    putShoppingFieldDebounced(SHOPPING_SETTINGS_FIELD, settings);
  };
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushShoppingFields(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', flushShoppingFields);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', flushShoppingFields);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Edits are enabled only once the saved list has loaded for a real property and the load didn't fail.
  const shoppingReady = shoppingLoaded && !!activeProperty && !shoppingLoadError;

  // Flush pending finish writes when the tab is hidden/closed. Empty dep array is safe
  // because there is a single, static property (no property-switch UI) — the flush closure's
  // captured activeProperty can't go stale for a different key. visibilitychange lives on
  // `document`; beforeunload is a less-reliable belt-and-suspenders (mobile Safari).
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushFinishFields(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', flushFinishFields);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', flushFinishFields);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which design items already have a purchase (drives the "✓ Purchased" badge).
  const promotedFinishIds = useMemo(
    () => new Set(purchases.filter(p => p.finishItemId).map(p => p.finishItemId)),
    [purchases]
  );

  // Property in-service date (cost-seg) — set in one place, defaults each purchase's
  // placed-in-service date.
  const activeInServiceDate = (properties.find(p => p.id === activeProperty) || {}).inServiceDate || "";
  const setPropertyInServiceDate = async (date) => {
    if (!activeProperty) return;
    // Optimistic local update.
    setProperties(prev => prev.map(p => (p.id === activeProperty ? { ...p, inServiceDate: date || null } : p)));
    try {
      // Read the FRESH registry and patch only this property's date, so we never clobber
      // other properties/fields written by another device (future-proofs multi-property).
      const reg = await fetch('/api/properties').then(r => r.json()).catch(() => null);
      const base = (reg && Array.isArray(reg.properties) && reg.properties.length > 0)
        ? reg
        : { schemaVersion: 'v2', activeId: activeProperty, properties };
      const updated = base.properties.map(p => (p.id === activeProperty ? { ...p, inServiceDate: date || null } : p));
      const registry = { schemaVersion: base.schemaVersion || 'v2', activeId: base.activeId || activeProperty, properties: updated };
      const res = await fetch('/api/properties', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registry),
      });
      if (!res.ok) setSyncError('Failed to save property date'); else setSyncError(null);
    } catch (e) {
      setSyncError('Unable to reach server');
    }
  };
  // Promote a design item → a purchase record, non-destructively (the design item is never
  // changed). Pre-fills from the selection, then opens it on the Purchases tab to finish.
  const promoteFinishItem = (item) => {
    if (promotedFinishIds.has(item.id)) return; // already promoted — don't create a duplicate
    const catLabel = (FINISH_CATEGORIES.find(c => c.id === item.category) || {}).label || "";
    const roomLabel = (FINISH_ROOMS.find(r => r.id === item.room) || {}).label || item.room || "";
    const trade = PURCHASE_TRADES.includes(catLabel) ? catLabel : "Other";
    const draft = {
      ...emptyPurchase(),
      finishItemId: item.id,
      description: item.selection || item.item || "",
      trade,
      room: roomLabel,
      unitPrice: item.unitPrice ?? null,
      qty: item.quantity ?? null,
      assetClass: suggestAssetClass(trade),
      allowanceCategory: defaultAllowanceFor(trade, "") || NOT_IN_ALLOWANCE,
      placedInServiceDate: activeInServiceDate,
      notes: item.url ? `Promoted from design selection · ${item.url}` : "Promoted from design selection",
    };
    savePurchase(draft);
    setFocusPurchaseMode("edit");
    setFocusPurchaseId(draft.id);
    setActiveView("purchases");
  };
  const handlePurchaseFocusCleared = useCallback(() => { setFocusPurchaseId(null); setFocusPurchaseMode("edit"); }, []);
  // Dashboard "Returns closing" → open that purchase expanded (not in edit mode) on the Purchases tab.
  const openPurchase = (id) => { setFocusPurchaseMode("view"); setFocusPurchaseId(id); setActiveView("purchases"); };

  // ── Receipt Inbox ──────────────────────────────────────────────────────────
  // Records are a Redis hash (api/receipt-inbox.js, one field per record): single-record writes only. Edits while reviewing
  // are debounced per record; File / Dismiss write immediately. Loading is cancellation-guarded like every fetch effect.
  useEffect(() => {
    let cancelled = false;
    inboxServerLoaded.current = false;
    setInbox([]); setInboxLoadError(false);
    if (!activeProperty) { setInboxLoaded(true); return () => { cancelled = true; }; }
    setInboxLoaded(false);
    fetch(apiUrl('/api/receipt-inbox', activeProperty))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('bad status'))))
      .then(data => {
        if (cancelled) return;
        setInbox(Array.isArray(data) ? data.filter(r => r && typeof r.id === 'string') : []);
        inboxServerLoaded.current = true;
        setInboxLoaded(true);
      })
      .catch(() => { if (!cancelled) { setInboxLoadError(true); setInboxLoaded(true); } });
    return () => { cancelled = true; };
  }, [activeProperty]);

  // Resolves true (saved), 'closed' (409: already filed/dismissed elsewhere — the server's record is adopted) or false.
  // `propertyId` is the property the record BELONGS to (a pending write can outlive a property switch).
  const putInboxRecord = (rec, useKeepalive = false, propertyId = activePropertyRef.current) => {
    if (propertyId === activePropertyRef.current && !inboxServerLoaded.current) return Promise.resolve(false);
    const seq = inboxSeq.current[rec.id] || 0;
    const sameProperty = () => activePropertyRef.current === propertyId;
    return fetch(apiUrl('/api/receipt-inbox', propertyId), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec), keepalive: useKeepalive,
    }).then(async r => {
      const body = await r.json().catch(() => null);
      if (r.status === 409) {
        if (body && body.record && sameProperty()) setInbox(prev => prev.map(x => (x.id === body.record.id ? body.record : x)));
        setSyncError('This receipt was already filed or dismissed on another device — it has been refreshed');
        return 'closed';
      }
      if (!r.ok) { setSyncError('Failed to save receipt'); return false; }
      setSyncError(null);
      // The server re-validates every save (e.g. a cleared quantity becomes "assumed 1" with a new issue). Adopt its issues
      // and reconcile flag so the screen matches what is stored — but never overwrite the reviewer's own fields, and only if
      // nothing newer was typed since this request left.
      const sx = body && body.record && body.record.extraction;
      if (sx && sameProperty() && (inboxSeq.current[rec.id] || 0) === seq && !inboxPending.current[rec.id]) {
        setInbox(prev => prev.map(x => (x.id === rec.id && x.extraction ? { ...x, updatedAt: body.record.updatedAt, updatedBy: body.record.updatedBy, extraction: { ...x.extraction, issues: sx.issues, reconciles: sx.reconciles } } : x)));
      }
      return true;
    }).catch(() => { setSyncError('Unable to reach server'); return false; });
  };
  const cancelInboxWrite = (id) => {
    if (inboxTimers.current[id]) { clearTimeout(inboxTimers.current[id]); delete inboxTimers.current[id]; }
    delete inboxPending.current[id];
  };
  const saveInboxRecord = (rec) => {   // debounced (review typing)
    setInbox(prev => prev.map(r => (r.id === rec.id ? rec : r)));
    inboxSeq.current[rec.id] = (inboxSeq.current[rec.id] || 0) + 1;
    const prop = activePropertyRef.current;   // the write belongs to the property it was typed in, even if the user switches before it fires
    inboxPending.current[rec.id] = { rec, prop };
    if (inboxTimers.current[rec.id]) clearTimeout(inboxTimers.current[rec.id]);
    inboxTimers.current[rec.id] = setTimeout(() => { delete inboxTimers.current[rec.id]; delete inboxPending.current[rec.id]; putInboxRecord(rec, false, prop); }, 500);
  };
  const saveInboxRecordNow = (rec) => {   // immediate (File / Dismiss)
    setInbox(prev => prev.map(r => (r.id === rec.id ? rec : r)));
    inboxSeq.current[rec.id] = (inboxSeq.current[rec.id] || 0) + 1;
    cancelInboxWrite(rec.id);
    return putInboxRecord(rec);
  };
  const flushInbox = () => {
    for (const t of Object.values(inboxTimers.current)) clearTimeout(t);
    const pending = inboxPending.current;
    inboxTimers.current = {}; inboxPending.current = {};
    for (const { rec, prop } of Object.values(pending)) putInboxRecord(rec, true, prop);
  };
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushInbox(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', flushInbox);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('beforeunload', flushInbox); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const removeInboxRecord = (id) => {
    setInbox(prev => prev.filter(r => r.id !== id));
    cancelInboxWrite(id);
    if (!inboxServerLoaded.current) return;
    const base = apiUrl('/api/receipt-inbox', activeProperty);
    fetch(base + (activeProperty ? '&' : '?') + 'id=' + encodeURIComponent(id), { method: 'DELETE' })
      .then(r => { if (!r.ok) setSyncError('Failed to remove receipt'); else setSyncError(null); })
      .catch(() => setSyncError('Unable to reach server'));
  };
  // Ask the server to read one uploaded receipt; returns the updated record (extracted OR needs-manual) or null if unreachable.
  const runExtraction = async (id, propertyId = activePropertyRef.current) => {
    try {
      const r = await fetch('/api/receipt-extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ property: propertyId, inboxId: id }) });
      const body = await r.json().catch(() => null);
      return body && body.record ? body.record : null;
    } catch (e) { return null; }
  };
  const retryInboxRecord = async (record) => {
    const propertyId = activePropertyRef.current;
    setInbox(prev => prev.map(r => (r.id === record.id ? { ...r, status: 'pending', error: null } : r)));
    const rec = await runExtraction(record.id, propertyId);
    if (activePropertyRef.current !== propertyId) return;   // the property changed while Claude was reading: don't touch the other property's list
    setInbox(prev => prev.map(r => (r.id === record.id
      ? (rec || { ...record, status: 'needs-manual', error: 'Could not reach the server to read this receipt. Check your connection and press Retry.' })
      : r)));
  };
  // One receipt at a time: upload → create the inbox record → extract. Each failure leaves the file safe in the inbox.
  const uploadToInbox = async (fileList) => {
    const propertyId = activePropertyRef.current;
    if (!propertyId || !inboxServerLoaded.current) return;
    for (const file of Array.from(fileList || [])) {
      const key = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      const stage = (text, error) => setInboxUploads(u => u.map(x => (x.key === key ? { ...x, stage: text, error: error || null } : x)));
      setInboxUploads(u => [...u, { key, name: file.name || 'receipt', stage: 'Preparing…', error: null }]);
      try {
        const hash = await sha256Hex(file);
        const id = newInboxId();
        const payload = await buildReceiptUpload(file);
        stage('Uploading…');
        const up = await fetch('/api/receipts-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, inboxId: id, ...payload }) });
        if (!up.ok) {
          const msg = up.status === 413 ? 'That file is too large (about 2.5 MB max).' : ((await up.json().catch(() => ({}))).error || 'Upload failed.');
          throw new ReceiptUploadError(msg);
        }
        const { pathname, name, contentType } = await up.json();
        const record = { id, status: 'pending', receipt: { pathname, name, contentType, uploadedAt: new Date().toISOString(), hash }, extraction: null, error: null, purchaseIds: [] };
        const savePending = () => fetch(apiUrl('/api/receipt-inbox', propertyId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) }).then(r => r.ok).catch(() => false);
        if (!(await savePending()) && !(await savePending())) {
          // The file is uploaded but no inbox card exists for it: remove the orphaned blob (best-effort) and tell the user.
          fetch('/api/receipts-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pathname, inboxId: id }) }).catch(() => {});
          throw new ReceiptUploadError('Could not save the receipt to the inbox (the upload was removed). Check your connection and try again.');
        }
        const stillHere = () => activePropertyRef.current === propertyId;   // a property switch mid-upload must not leak into the other property's list
        if (stillHere()) setInbox(prev => [...prev, record]);
        stage('Reading the receipt…');
        const rec = await runExtraction(id, propertyId);
        if (stillHere()) setInbox(prev => prev.map(r => (r.id === id ? (rec || { ...record, status: 'needs-manual', error: 'Could not reach the server to read this receipt. Press Retry.' }) : r)));
        setInboxUploads(u => u.filter(x => x.key !== key));
      } catch (e) {
        stage('', e instanceof ReceiptUploadError ? e.message : 'Upload failed: ' + ((e && e.message) || 'unknown error'));
        setTimeout(() => setInboxUploads(u => u.filter(x => x.key !== key)), 8000);
      }
    }
  };
  // File: ONE explicit action. Creates one purchase per accepted line (shared order group + shared receipt), marks the
  // record filed, and moves linked shopping items to ordered. The ref guards against a double click.
  const fileInboxRecord = async (record, order) => {
    if (inboxFiling.current.has(record.id)) return false;
    const built = buildPurchasesFromInbox({ record, order, shoppingItems: shopping.items, settings: shopping.settings, propertyInServiceDate: activeInServiceDate });
    if (built.length === 0) return false;
    // Every accepted line that matched no Shopping item (and wasn't opted out) also becomes an `ordered` Shopping item, saved
    // only AFTER the filing succeeded so a rollback never leaves stray items behind.
    const { drafts, newItems } = planShoppingFromInbox({ record, drafts: built, shoppingItems: shopping.items, user: (getCurrentUser() || {}).code || '' });
    inboxFiling.current.add(record.id);
    // All-or-nothing: wait for every purchase save, and only then mark the record filed. Any failure rolls the lot back
    // (quietly — the error message below must not be cleared by a rollback "success") so a retry can't double-file.
    const results = await Promise.all(drafts.map(savePurchase));
    const outcome = decideFilingOutcome(results);
    const filedRes = outcome.markFiled ? await saveInboxRecordNow({ ...record, status: 'filed', purchaseIds: drafts.map(d => d.id) }) : false;
    const filedOk = filedRes === true;
    if (!filedOk) {
      const ids = new Set(drafts.map(d => d.id));
      setPurchases(prev => prev.filter(p => !ids.has(p.id)));
      for (const d of drafts) {
        const base = apiUrl('/api/purchases', activeProperty);
        fetch(base + (activeProperty ? '&' : '?') + 'id=' + encodeURIComponent(d.id), { method: 'DELETE' }).catch(() => {});
      }
      if (filedRes !== 'closed') setInbox(prev => prev.map(r => (r.id === record.id ? record : r)));   // 'closed' already adopted the server's record
      inboxFiling.current.delete(record.id);
      setSyncError(outcome.failed
        ? `Filing failed: ${outcome.failed} of ${drafts.length} purchases did not save. Nothing was filed — please try again.`
        : 'Could not mark the receipt as filed. Nothing was filed — please try again.');
      return false;
    }
    newItems.forEach(it => saveShoppingItem(it));
    const byItem = {};
    drafts.forEach(d => { if (d.shoppingItemId) (byItem[d.shoppingItemId] = byItem[d.shoppingItemId] || []).push(d.id); });
    for (const [itemId, pids] of Object.entries(byItem)) {
      const it = shopping.items.find(i => i.id === itemId);
      if (!it) continue;
      const live = (it.purchaseIds || []).filter(pid => purchases.some(p => p.id === pid));
      saveShoppingItem({ ...it, status: ['received', 'kept', 'returned'].includes(it.status) ? it.status : 'ordered', purchaseIds: [...live, ...pids] });
    }
    // Tell the user, with a link — never auto-navigate: that would close an open edit form (losing unsaved edits) and reset
    // the search/filters every time several receipts are filed in a row.
    setInboxNotice({ text: `Filed ${drafts.length} purchase${drafts.length === 1 ? '' : 's'} from ${(record.extraction && record.extraction.vendor) || 'the receipt'}.`, purchaseId: drafts[0].id });
    if (inboxNoticeTimer.current) clearTimeout(inboxNoticeTimer.current);
    inboxNoticeTimer.current = setTimeout(() => setInboxNotice(null), 20000);
    return true;
  };
  const inboxReady = inboxLoaded && !!activeProperty && !inboxLoadError;
  const activePropertyAddress = (properties.find(p => p.id === activeProperty) || {}).address || '';

  // Shopping "Mark purchased" → a pre-filled Purchase, non-destructively (the candidate is untouched).
  // The item moves to "ordered" with the chosen candidate selected and the purchase linked both ways
  // (item.purchaseIds ↔ purchase.shoppingItemId). If the item already has a live purchase, just open it.
  const shoppingPromoting = useRef(new Set());   // double-click guard (state lags a render behind)
  const promoteShoppingItem = (item, candidateId) => {
    const live = (item.purchaseIds || []).map(id => purchases.find(p => p.id === id)).filter(Boolean);
    if (live.length > 0) { setFocusPurchaseMode("view"); setFocusPurchaseId(live[0].id); setActiveView("purchases"); return; }
    if (shoppingPromoting.current.has(item.id)) return;
    const cand = (item.candidates || []).find(c => c.id === candidateId);
    const draft = buildPurchaseFromShopping(item, cand, shopping.settings);
    if (!draft) return;
    shoppingPromoting.current.add(item.id);
    setTimeout(() => shoppingPromoting.current.delete(item.id), 1500);
    savePurchase({ ...draft, placedInServiceDate: activeInServiceDate });
    saveShoppingItem({ ...item, status: "ordered", selectedCandidateId: cand.id, purchaseIds: [...live.map(p => p.id), draft.id] });   // dangling ids (deleted purchases) are dropped
    setFocusPurchaseMode("edit");
    setFocusPurchaseId(draft.id);
    setActiveView("purchases");
  };

  // Which room-furniture items already have a purchase (drives the "✓" badge).
  const promotedFurnitureIds = useMemo(
    () => new Set(purchases.filter(p => p.furnitureId).map(p => p.furnitureId)),
    [purchases]
  );
  // Promote a room-furniture item → a purchase (non-destructive: the furniture entry stays).
  const promoteFurnitureItem = (furn, roomId) => {
    if (promotedFurnitureIds.has(furn.id)) return;
    const roomLabel = (FINISH_ROOMS.find(r => r.id === roomId) || {}).label || roomId || "";
    const draft = {
      ...emptyPurchase(),
      furnitureId: furn.id,
      description: furn.name || "",
      trade: "Furniture / FF&E",
      room: roomLabel,
      unitPrice: furn.price ?? null,
      qty: 1,
      totalPaid: furn.price ?? null,
      ownerPurchased: true,
      assetClass: suggestAssetClass("Furniture / FF&E"),
      placedInServiceDate: activeInServiceDate,
      status: furn.purchased ? "Received" : "Ordered",
      notes: furn.url ? `From design furniture · ${furn.url}` : "From design furniture",
    };
    savePurchase(draft);
    setFocusPurchaseMode("edit");
    setFocusPurchaseId(draft.id);
    setActiveView("purchases");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, fontFamily: font }}>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <Header
        activeView={activeView}
        setActiveView={(v) => { setActiveView(v); setFocusItemId(null); setFocusItemSource(null); }}
        properties={properties}
        activeProperty={activeProperty}
        onSwitchProperty={switchProperty}
        onDownloadBackup={downloadBackup}
      />
      {syncError && (
        <div style={{
          background: '#fee2e2',
          color: '#991b1b',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: '14px',
          borderBottom: '1px solid #fecaca',
        }}>
          {syncError}{!syncError.includes('house info') ? ' — changes saved locally only' : ''}
        </div>
      )}
      {activeView === "dashboard" && <Dashboard tasks={tasks} podcastData={PODCAST_DATABASE} finishes={finishes} onNavigateToItem={navigateToItem} purchases={purchases} onOpenPurchase={openPurchase} />}
      {activeView === "summary" && <ExecutiveSummary />}
      {activeView === "podcast" && <PodcastView podcastData={PODCAST_DATABASE} />}
      {activeView === "tasks" && <TaskView tasks={tasks} setTasks={setTasks} focusItemId={focusItemSource === "task" ? focusItemId : null} />}
      {activeView === "design" && <DesignView finishes={finishes} setFinishes={setFinishes} targetBudget={targetBudget} setTargetBudget={setTargetBudget} roomData={roomData} setRoomData={setRoomData} focusItemId={focusItemSource === "design" ? focusItemId : null} deletedFinishIds={deletedFinishIds} setDeletedFinishIds={setDeletedFinishIds} onPromote={promoteFinishItem} promotedFinishIds={promotedFinishIds} onPromoteFurniture={promoteFurnitureItem} promotedFurnitureIds={promotedFurnitureIds} writeFinishItem={writeFinishItem} tombstoneFinishItem={tombstoneFinishItem} removeFinishItem={removeFinishItem} writeFurniture={writeFurniture} removeFurniture={removeFurniture} writeRoomMeta={writeRoomMeta} writeBudget={writeBudget} />}
      {activeView === "shopping" && <ShoppingView shopping={shopping} loaded={shoppingLoaded} loadError={shoppingLoadError} canEdit={shoppingReady} purchases={purchases} onSaveItem={saveShoppingItem} onRemoveItem={removeShoppingItem} onSaveSettings={saveShoppingSettings} onMarkPurchased={promoteShoppingItem} propertyId={activeProperty} />}
      {activeView === "purchases" && <PurchasesView purchases={purchases} activeProperty={activeProperty} onSave={savePurchase} onDelete={deletePurchase} onReceiptsChange={changePurchaseReceipts} onAddLine={addLineToOrder} reimbursableVendors={shopping.settings.reimbursableVendors} inboxPanel={{ inbox, loaded: inboxLoaded, loadError: inboxLoadError, canUse: inboxReady, uploads: inboxUploads, onUpload: uploadToInbox, onChange: saveInboxRecord, onChangeNow: saveInboxRecordNow, onRemove: removeInboxRecord, onRetry: retryInboxRecord, onFile: fileInboxRecord, shoppingItems: shopping.items, propertyAddress: activePropertyAddress, onOpenPurchase: openPurchase, notice: inboxNotice, onDismissNotice: () => setInboxNotice(null) }} focusPurchaseId={focusPurchaseId} focusPurchaseMode={focusPurchaseMode} onFocusHandled={handlePurchaseFocusCleared} propertyInServiceDate={activeInServiceDate} onSetInServiceDate={setPropertyInServiceDate} />}
      {activeView === "house-info" && <HouseInfoView houseInfo={houseInfo} loaded={houseInfoLoaded} canAdd={houseInfoReady} loadError={houseInfoLoadError} onSave={saveHouseInfo} onDelete={deleteHouseInfo} />}

      {showMigrationModal && migrationNeeded && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.charcoal, margin: "0 0 12px" }}>Set up multi-property</h2>
            <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.5, margin: "0 0 12px" }}>
              We&rsquo;re upgrading Pool &amp; Paddle so it can hold more than one property. Your current
              Design selections and Tasks become your first property, <strong>Pool &amp; Paddle</strong>.
              Nothing is deleted.
            </p>
            <p style={{ fontSize: 14, color: C.charcoal, lineHeight: 1.5, margin: "0 0 16px" }}>
              <strong>First, save a full backup to your computer</strong> &mdash; your safety net. Keep it
              somewhere safe (your Desktop is fine).
            </p>
            <button
              onClick={downloadBackup}
              style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1.5px solid ${C.mint}`, background: C.seafoamFaint, color: C.mintDark, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}
            >&darr; Download full backup</button>
            {backupDownloaded && (
              <p style={{ fontSize: 13, color: C.mint, fontWeight: 600, margin: "0 0 12px" }}>&#10003; Backup downloaded &mdash; you&rsquo;re safe to proceed.</p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                onClick={runMigration}
                disabled={!backupDownloaded || migrating}
                style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: (!backupDownloaded || migrating) ? C.border : C.mint, color: C.white, fontFamily: font, fontSize: 14, fontWeight: 700, cursor: (!backupDownloaded || migrating) ? "not-allowed" : "pointer" }}
              >{migrating ? "Setting up…" : "I've saved my backup — proceed"}</button>
              <button
                onClick={() => setShowMigrationModal(false)}
                disabled={migrating}
                style={{ padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.white, color: C.textSecondary, fontFamily: font, fontSize: 14, fontWeight: 600, cursor: migrating ? "not-allowed" : "pointer" }}
              >Not now</button>
            </div>
            <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, margin: "14px 0 0" }}>
              Choose &ldquo;Not now&rdquo; to keep using the app exactly as it is &mdash; we&rsquo;ll offer this again next time.
            </p>
          </div>
        </div>
      )}

      {showSignoff && (
        <div style={modalOverlayStyle}>
          <div style={modalCardStyle}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.charcoal, margin: "0 0 8px" }}>Setup complete &mdash; quick check</h2>
            <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.5, margin: "0 0 14px" }}>
              Your data is now under <strong>Pool &amp; Paddle</strong>. Please confirm everything looks right:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
              {[
                "All your Tasks are present.",
                "All the finishes you had before are present (nothing deleted has reappeared).",
                "Edit one task — it saves without an error.",
                "Edit one finish — it saves without an error.",
                "The property control in the header shows “Pool & Paddle” with no errors.",
              ].map((item, i) => (
                <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13.5, color: C.charcoal, lineHeight: 1.4, cursor: "pointer" }}>
                  <input type="checkbox" style={{ marginTop: 2, accentColor: C.mint, width: 16, height: 16 }} />
                  <span>{item}</span>
                </label>
              ))}
            </div>
            <button
              onClick={() => setShowSignoff(false)}
              style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: C.mint, color: C.white, fontFamily: font, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >Looks good &mdash; done</button>
          </div>
        </div>
      )}
    </div>
  );
}
