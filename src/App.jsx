import { useState, useEffect, useMemo, useRef } from "react";
import PODCAST_DATABASE from "./podcast-data.json";
import EXEC_SUMMARY from "./executive-summary.json";
import TOOLS_DATA from "./tools-data.json";
import FINISHES_DATA from "./finishes-data.json";

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
      const code = match.substring(8);
      if (code === 'JM') return { code: 'JM', name: 'Josh' };
      if (code === 'KM') return { code: 'KM', name: 'Kerry' };
    }
  } catch (e) { /* local dev or no cookie */ }
  return null;
}

function Header({ activeView, setActiveView }) {
  const user = getCurrentUser();
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
          <nav style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {[
              { key: "dashboard", label: "Dashboard" },
              { key: "tasks", label: "Tasks" },
              { key: "design", label: "Design" },
              { key: "summary", label: "Brief" },
              { key: "podcast", label: "Podcast" },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setActiveView(v.key)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: activeView === v.key ? C.mint : "transparent",
                  color: activeView === v.key ? C.white : C.textSecondary,
                  fontFamily: font,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  letterSpacing: "0.01em",
                }}
              >
                {v.label}
              </button>
            ))}
          </nav>
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
            </div>
          )}
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

function Dashboard({ tasks, podcastData, finishes }) {
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

  // Design progress — count items with a selection made per room
  const designRooms = FINISHES_DATA.rooms.map(room => {
    const roomItems = finishes.filter(f => f.room === room.id);
    const decided = roomItems.filter(f => f.selection && f.selection.trim() !== "");
    return { ...room, total: roomItems.length, decided: decided.length, pct: roomItems.length > 0 ? Math.round((decided.length / roomItems.length) * 100) : 0 };
  });
  const totalDesignItems = finishes.length;
  const totalDecided = finishes.filter(f => f.selection && f.selection.trim() !== "").length;
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

      {/* Upcoming Tasks */}
      {(() => {
        const today = new Date().toISOString().split("T")[0];
        const upcoming = tasks
          .filter(t => !t.done && t.dueDate)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          .slice(0, 8);
        const overdue = upcoming.filter(t => t.dueDate < today);
        if (upcoming.length === 0) return null;
        return (
          <div style={{
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: 28, marginBottom: 32, boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.charcoal, margin: "0 0 4px 0" }}>
              Upcoming Tasks
            </h3>
            <p style={{ fontFamily: font, fontSize: 12, color: C.textMuted, margin: "0 0 16px 0" }}>
              {overdue.length > 0 ? `${overdue.length} overdue · ` : ""}{upcoming.length} tasks with due dates
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {upcoming.map((t, i) => {
                const isOverdue = t.dueDate < today;
                const isSoon = !isOverdue && t.dueDate <= new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
                const catInfo = TASK_CATEGORIES.find(c => c.id === t.category);
                return (
                  <div key={t.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
                    borderTop: i > 0 ? `1px solid ${C.borderLight}` : "none",
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: priorityColors[t.priority] || C.textMuted,
                    }} />
                    <span style={{ fontSize: 16, width: 24, flexShrink: 0 }}>{catInfo?.icon || "📋"}</span>
                    <div style={{ flex: 1, fontFamily: font, fontSize: 13, fontWeight: 500, color: C.charcoal }}>
                      {t.task}
                    </div>
                    {t.assignee && (
                      <span style={{
                        fontFamily: font, fontSize: 10, fontWeight: 700,
                        width: 24, height: 24, borderRadius: "50%",
                        background: t.assignee === "JM" ? C.ocean : C.mint,
                        color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        {t.assignee}
                      </span>
                    )}
                    <span style={{
                      fontFamily: font, fontSize: 12, fontWeight: 600, flexShrink: 0,
                      color: isOverdue ? "#E53E3E" : isSoon ? "#D69E2E" : C.textMuted,
                      background: isOverdue ? "#FED7D7" : isSoon ? "#FEFCBF" : C.pageBg,
                      padding: "3px 10px", borderRadius: 6,
                    }}>
                      {new Date(t.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
          src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=6401+Broward+Street,+St+Augustine,+FL+32080&zoom=16&maptype=roadmap"
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
            fontSize: 14,
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

function TaskView({ tasks, setTasks }) {
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
  const dateRefs = useRef({});

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
    padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
    background: C.white, color: C.charcoal, fontFamily: font, fontSize: 13, fontWeight: 500,
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
                color: C.charcoal, fontFamily: font, fontSize: 13, fontWeight: 500, outline: "none", boxSizing: "border-box",
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
              background: C.white, color: C.charcoal, fontFamily: font, fontSize: 13, fontWeight: 500,
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
                <div key={task.id}>
                  <div
                    onMouseEnter={() => setHoveredRow(task.id)}
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
                    <div
                      style={{ flexShrink: 0, minWidth: 70, textAlign: "center", cursor: "pointer", position: "relative" }}
                    >
                      <span style={{
                        fontFamily: font, fontSize: 12, fontWeight: 500,
                        color: task.dueDate ? (isOverdue(task) ? "#D94444" : C.textSecondary) : C.textMuted,
                        pointerEvents: "none",
                      }}>
                        {fmtDate(task.dueDate) || "Set date"}
                      </span>
                      <input type="date" value={task.dueDate || ""}
                        ref={el => { dateRefs.current[task.id] = el; }}
                        onChange={e => setDueDate(task.id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
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
                    <div
                      onClick={e => { e.stopPropagation(); cycleAssignee(task.id); }}
                      title={task.assignee ? task.assignee : "Unassigned — click to assign"}
                      style={{
                        width: 24, height: 24, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", flexShrink: 0,
                        ...(task.assignee ? {
                          background: task.assignee === "JM" ? C.ocean : C.mint,
                          color: C.white, fontSize: 10, fontWeight: 700, fontFamily: font,
                        } : {
                          border: `1.5px dashed ${C.textMuted}`,
                          color: C.textMuted, fontSize: 12,
                        }),
                      }}
                    >{task.assignee || "+"}</div>

                    {/* Delete button */}
                    <div style={{ width: 36, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                      {confirmDelete === task.id ? (
                        <button onClick={e => { e.stopPropagation(); deleteTask(task.id); }} style={{
                          padding: "2px 8px", borderRadius: 4, border: "none",
                          background: "#D94444", color: C.white,
                          fontFamily: font, fontSize: 11, fontWeight: 700, cursor: "pointer",
                        }}>Yes</button>
                      ) : hoveredRow === task.id ? (
                        <button onClick={e => { e.stopPropagation(); handleDelete(task); }} style={{
                          background: "none", border: "none",
                          color: C.textMuted, fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1,
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
                          color: C.charcoal, fontFamily: font, fontSize: 12, fontWeight: 500,
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

// Migrate old room IDs → new room IDs (2026-02-16 room restructure)
const ROOM_MIGRATION = {
  "bed1-bath": "ground-floor-king",
  "bed2": "downstairs-full-bed",
  "bed3-bath": "second-master",
  "bunk-bath": "bunk-room",
  "upper-half-bath": "3rd-floor-bath",
  "kitchen": "kitchen-upstairs",
};

function migrateRoom(roomId) {
  return ROOM_MIGRATION[roomId] || roomId;
}

function mergeFinishes(saved) {
  if (!saved || !Array.isArray(saved)) return DEFAULT_FINISH_ITEMS;
  const defaultIds = new Set(DEFAULT_FINISH_ITEMS.map(i => i.id));
  const merged = DEFAULT_FINISH_ITEMS.map(item => {
    const s = saved.find(s => s.id === item.id);
    return s ? { ...item, selection: s.selection ?? "", unitPrice: s.unitPrice ?? null, quantity: s.quantity ?? null, unit: s.unit ?? item.unit, url: s.url ?? "", notes: s.notes ?? "", linkedTo: s.linkedTo ?? null, assignee: s.assignee ?? null, dueDate: s.dueDate ?? null } : item;
  });
  const userItems = saved.filter(s => s.userCreated && !defaultIds.has(s.id))
    .map(item => ({ ...item, room: migrateRoom(item.room) }));
  return [...merged, ...userItems];
}

function DesignView({ finishes, setFinishes, targetBudget, setTargetBudget, roomData, setRoomData }) {
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
  const dateRefs = useRef({});

  const selectStyle = {
    padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
    background: C.white, color: C.charcoal, fontFamily: font, fontSize: 13, fontWeight: 500,
  };

  const filtered = useMemo(() => {
    return finishes.filter(item => {
      const matchCat = filterCat === "all" || item.category === filterCat;
      const matchRoom = filterRoom === "all" || item.room === filterRoom;
      const matchStatus = filterStatus === "all" ||
        (filterStatus === "priced" ? (item.unitPrice != null && item.quantity != null) :
         filterStatus === "selected" ? (item.selection && item.selection.trim() !== "") :
         filterStatus === "needs-selection" ? (!item.selection || item.selection.trim() === "") : true);
      const matchAssignee = filterAssignee === "all" ||
        (filterAssignee === "unassigned" ? !item.assignee : item.assignee === filterAssignee);
      return matchCat && matchRoom && matchStatus && matchAssignee;
    });
  }, [finishes, filterCat, filterRoom, filterStatus, filterAssignee]);

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
  const variance = targetBudget != null ? targetBudget - grandTotal : null;

  const updateItem = (id, updates) => {
    setFinishes(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const deleteItem = (id) => {
    setFinishes(prev => prev.filter(item => item.id !== id));
    setConfirmDelete(null);
  };

  const cycleAssignee = (id) => {
    const cycle = [null, "JM", "KM"];
    setFinishes(prev => prev.map(item => {
      if (item.id !== id) return item;
      const idx = cycle.indexOf(item.assignee);
      return { ...item, assignee: cycle[(idx + 1) % cycle.length] };
    }));
  };

  const setItemDueDate = (id, date) => {
    setFinishes(prev => prev.map(item => item.id === id ? { ...item, dueDate: date || null } : item));
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const isItemOverdue = (item) => {
    if (!item.dueDate) return false;
    const hasSelection = item.selection && item.selection.trim() !== "";
    if (hasSelection) return false;
    return item.dueDate < new Date().toISOString().split("T")[0];
  };

  const addItem = () => {
    if (!newItem.item.trim()) return;
    setFinishes(prev => [...prev, {
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
    }]);
    setNewItem({ item: "", category: FINISH_CATEGORIES[0].id, room: FINISH_ROOMS[0].id });
    setShowAddForm(false);
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
    updateRoomData(roomId, {
      furniture: [...rd.furniture, {
        id: "furn" + Date.now(),
        name: newFurniture.name.trim(),
        price: newFurniture.price ? parseFloat(newFurniture.price) : null,
        url: newFurniture.url || "",
        notes: newFurniture.notes || "",
        purchased: false,
      }],
    });
    setNewFurniture({ name: "", price: "", url: "", notes: "" });
    setShowAddFurniture(null);
  };

  const updateFurnitureItem = (roomId, furnId, updates) => {
    const rd = getRoomData(roomId);
    updateRoomData(roomId, {
      furniture: rd.furniture.map(f => f.id === furnId ? { ...f, ...updates } : f),
    });
  };

  const deleteFurnitureItem = (roomId, furnId) => {
    const rd = getRoomData(roomId);
    updateRoomData(roomId, {
      furniture: rd.furniture.filter(f => f.id !== furnId),
    });
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
              const headers = ["Trade", "Room", "Item", "Contractor Options", "Selection", "Unit Price", "Quantity", "Unit", "Line Total", "Product Link", "Notes", "Linked To", "Assignee", "Decision Date"];
              const csvRows = [headers.join(",")];
              finishes.forEach(item => {
                const r = resolveItem(item);
                const catLabel = FINISH_CATEGORIES.find(c => c.id === item.category)?.label || item.category;
                const roomLabel = FINISH_ROOMS.find(rr => rr.id === item.room)?.label || item.room;
                const lineTotal = (r.unitPrice != null && item.quantity != null) ? r.unitPrice * item.quantity : "";
                const parentName = item.linkedTo ? finishes.find(p => p.id === item.linkedTo)?.item || "" : "";
                const esc = (s) => `"${String(s || "").replace(/"/g, '""')}"`;
                csvRows.push([
                  esc(catLabel), esc(roomLabel), esc(item.item),
                  esc((item.contractorOptions || []).join("; ")),
                  esc(r.selection), r.unitPrice ?? "", item.quantity ?? "",
                  esc(r.unit), lineTotal, esc(r.url), esc(item.notes), esc(parentName),
                  esc(item.assignee || ""), esc(item.dueDate || ""),
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
                      f.price ?? "", esc(f.url), esc(f.notes), "",
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
                    setEditingBudget(false);
                  }
                  if (e.key === "Escape") setEditingBudget(false);
                }}
                onBlur={() => {
                  const val = budgetInput.trim() ? parseFloat(budgetInput) : null;
                  setTargetBudget(val);
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
          label="Variance"
          value={variance != null ? (variance >= 0 ? "+" : "") + fmtMoney(Math.abs(variance)) : "—"}
          sub={variance != null ? (variance >= 0 ? "Under budget" : "Over budget") : "Set a budget target first"}
          accent={variance == null ? C.textMuted : variance >= 0 ? C.mint : "#D94444"}
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
                color: C.charcoal, fontFamily: font, fontSize: 13, fontWeight: 500, outline: "none", boxSizing: "border-box",
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
                        if (e.key === "Enter") { updateRoomData(groupId, { miroUrl: miroInput.trim() }); setEditingMiroRoom(null); }
                        if (e.key === "Escape") setEditingMiroRoom(null);
                      }}
                      onBlur={() => { updateRoomData(groupId, { miroUrl: miroInput.trim() }); setEditingMiroRoom(null); }}
                      style={{
                        padding: "5px 10px", borderRadius: 6, border: `1.5px solid ${C.border}`,
                        background: C.white, color: C.charcoal, fontFamily: font, fontSize: 12,
                        fontWeight: 500, outline: "none", width: isMobile ? 160 : 260,
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
                  <div key={item.id}>
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      onMouseEnter={() => !isMobile && setHoveredRow(item.id)}
                      onMouseLeave={() => { setHoveredRow(null); if (confirmDelete === item.id) setConfirmDelete(null); }}
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
                            fontFamily: font, fontSize: 11, fontWeight: 500,
                            color: item.dueDate ? (isItemOverdue(item) ? "#D94444" : C.textSecondary) : C.textMuted,
                            border: "none", background: "transparent", outline: "none",
                            cursor: "pointer", padding: "4px 2px", width: isMobile ? 28 : 110,
                          }}
                        />
                      </div>

                      {/* Assignee avatar */}
                      <div
                        onClick={e => { e.stopPropagation(); cycleAssignee(item.id); }}
                        title={item.assignee ? item.assignee : "Unassigned — click to assign"}
                        style={{
                          width: 24, height: 24, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", flexShrink: 0,
                          ...(item.assignee ? {
                            background: item.assignee === "JM" ? C.ocean : C.mint,
                            color: C.white, fontSize: 10, fontWeight: 700, fontFamily: font,
                          } : {
                            border: `1.5px dashed ${C.textMuted}`,
                            color: C.textMuted, fontSize: 12,
                          }),
                        }}
                      >{item.assignee || "+"}</div>

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
                                  {FINISH_CATEGORIES.map(cat => {
                                    const catItems = linkableItems.filter(li => li.id !== item.id && li.category === cat.id);
                                    if (catItems.length === 0) return null;
                                    return (
                                      <optgroup key={cat.id} label={`${cat.icon} ${cat.label}`}>
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
          No items match your filters. Try adjusting the trade, room, or status filters above.
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

export default function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [tasks, setTasks] = useState(() => {
    try {
      const raw = localStorage.getItem("pool-paddle-tasks-v2");
      if (raw) return mergeTasks(JSON.parse(raw));
    } catch (e) {}
    return DEFAULT_TASKS;
  });
  const [finishes, setFinishes] = useState(() => {
    try {
      const raw = localStorage.getItem("pool-paddle-finishes-v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        return mergeFinishes(parsed.items || parsed);
      }
    } catch (e) {}
    return DEFAULT_FINISH_ITEMS;
  });
  const [targetBudget, setTargetBudget] = useState(() => {
    try {
      const raw = localStorage.getItem("pool-paddle-finishes-v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.targetBudget ?? null;
      }
    } catch (e) {}
    return null;
  });
  const [roomData, setRoomData] = useState(() => {
    try {
      const raw = localStorage.getItem("pool-paddle-finishes-v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.roomData ?? {};
      }
    } catch (e) {}
    return {};
  });
  const serverLoaded = useRef(false);
  const finishesServerLoaded = useRef(false);

  // Fetch tasks from server
  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.json())
      .then(data => {
        serverLoaded.current = true;
        if (data && Array.isArray(data) && data.length > 0) {
          setTasks(mergeTasks(data));
        } else {
          fetch('/api/tasks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tasks),
          }).catch(() => {});
        }
      })
      .catch(() => { serverLoaded.current = true; });
  }, []);

  // Fetch finishes from server
  useEffect(() => {
    fetch('/api/finishes')
      .then(r => r.json())
      .then(data => {
        finishesServerLoaded.current = true;
        if (data && data.items && Array.isArray(data.items) && data.items.length > 0) {
          setFinishes(mergeFinishes(data.items));
          if (data.targetBudget != null) setTargetBudget(data.targetBudget);
          if (data.roomData) setRoomData(data.roomData);
        } else {
          fetch('/api/finishes', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: finishes, targetBudget, roomData }),
          }).catch(() => {});
        }
      })
      .catch(() => { finishesServerLoaded.current = true; });
  }, []);

  // Save tasks to localStorage + server (debounced)
  useEffect(() => {
    try {
      localStorage.setItem("pool-paddle-tasks-v2", JSON.stringify(tasks));
    } catch (e) {}

    if (!serverLoaded.current) return;

    const timer = setTimeout(() => {
      fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tasks),
      }).catch(() => {});
    }, 500);

    return () => clearTimeout(timer);
  }, [tasks]);

  // Save finishes to localStorage + server (debounced)
  useEffect(() => {
    const payload = { items: finishes, targetBudget, roomData };
    try {
      localStorage.setItem("pool-paddle-finishes-v1", JSON.stringify(payload));
    } catch (e) {}

    if (!finishesServerLoaded.current) return;

    const timer = setTimeout(() => {
      fetch('/api/finishes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 500);

    return () => clearTimeout(timer);
  }, [finishes, targetBudget, roomData]);

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, fontFamily: font }}>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <Header activeView={activeView} setActiveView={setActiveView} />
      {activeView === "dashboard" && <Dashboard tasks={tasks} podcastData={PODCAST_DATABASE} finishes={finishes} />}
      {activeView === "summary" && <ExecutiveSummary />}
      {activeView === "podcast" && <PodcastView podcastData={PODCAST_DATABASE} />}
      {activeView === "tasks" && <TaskView tasks={tasks} setTasks={setTasks} />}
      {activeView === "design" && <DesignView finishes={finishes} setFinishes={setFinishes} targetBudget={targetBudget} setTargetBudget={setTargetBudget} roomData={roomData} setRoomData={setRoomData} />}
    </div>
  );
}
