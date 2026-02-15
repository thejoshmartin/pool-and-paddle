import { useState, useEffect, useMemo, useRef } from "react";
import PODCAST_DATABASE from "./podcast-data.json";
import EXEC_SUMMARY from "./executive-summary.json";
import TOOLS_DATA from "./tools-data.json";

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

function Header({ activeView, setActiveView }) {
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
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "16px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
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
          <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[
              { key: "dashboard", label: "Dashboard" },
              { key: "summary", label: "Executive Brief" },
              { key: "podcast", label: "Podcast Intel" },
              { key: "tasks", label: "Task Tracker" },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setActiveView(v.key)}
                style={{
                  padding: "9px 20px",
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
      padding: "24px 26px",
      flex: "1 1 200px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      <div style={{
        fontFamily: font,
        fontSize: 36,
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

function Dashboard({ tasks, podcastData }) {
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

  return (
    <div style={{ padding: "36px 32px", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontFamily: font, fontSize: 26, fontWeight: 800, color: C.charcoal, margin: "0 0 6px 0", letterSpacing: "-0.02em" }}>
          Mission Control
        </h2>
        <p style={{ fontFamily: font, fontSize: 14, color: C.textMuted, margin: 0, fontWeight: 500 }}>
          Your path to becoming a top luxury Airbnb property
        </p>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <StatCard label="Overall Progress" value={`${pct}%`} sub={`${completed} of ${total} tasks complete`} accent={C.mint} />
        <StatCard label="Critical Tasks" value={`${critPct}%`} sub={`${criticalDone} of ${critical.length} must-haves done`} accent={C.ocean} />
        <StatCard label="Podcast Insights" value={podcastData.length} sub="Episodes cataloged" accent={C.mint} />
        <StatCard label="Gimmicks Flagged" value={tasks.filter(t => t.isGimmick).length} sub="Items to skip or deprioritize" accent={C.textMuted} />
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
          Category Progress
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

      {/* Executive Summary */}
      <div style={{
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 28,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
        <h3 style={{ fontFamily: font, fontSize: 18, fontWeight: 700, color: C.charcoal, margin: "0 0 16px 0" }}>
          Executive Summary — Thanks for Visiting Podcast
        </h3>
        <div style={{ fontFamily: font, fontSize: 14, color: C.textSecondary, lineHeight: 1.8 }}>
          <p style={{ margin: "0 0 14px 0" }}>
            <strong style={{ color: C.charcoal }}>The Podcast:</strong> Thanks for Visiting is hosted by Annette Grant and Sarah Karakaian — two seasoned STR operators with 538+ episodes and over 2.4 million downloads. The show consistently ranks in the top 10% on Apple Podcasts. They cover every aspect of short-term rental hosting from pre-launch strategy through scaling a portfolio, with a strong emphasis on treating hosting as a real business rather than a side hustle.
          </p>
          <p style={{ margin: "0 0 14px 0" }}>
            <strong style={{ color: C.charcoal }}>Core Philosophy:</strong> Build your business foundation before your first guest arrives. Define your guest avatar early and let it drive every decision. Rely on data over feelings — use dynamic pricing tools, track Airbnb's built-in metrics, and analyze competitor reviews systematically. Invest where guests notice (sleep, seating, kitchen) and save where they don't (decorative clutter, fancy barware).
          </p>
          <p style={{ margin: "0 0 14px 0" }}>
            <strong style={{ color: C.charcoal }}>For Pool & Paddle (Luxury Positioning):</strong> Your pool and paddle sports focus gives you a clear guest avatar and differentiator — lean into it hard. The podcast emphasizes that confused positioning loses bookings. Every design choice, amenity, photo, and listing word should reinforce your luxury pool & paddle identity. Create one unforgettable "wow" moment that guests photograph and share.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: C.charcoal }}>What to Skip:</strong> Annette and Sarah consistently warn against over-investing in decorative items guests don't notice, cheap furniture that wears out fast, and chasing every new tool or trend. Focus on the fundamentals that drive reviews and revenue: sleep quality, cleanliness systems, strategic pricing, and a clear brand identity.
          </p>
        </div>
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
                      onClick={e => { e.stopPropagation(); try { dateRefs.current[task.id]?.showPicker(); } catch(_) { dateRefs.current[task.id]?.focus(); } }}
                      style={{ flexShrink: 0, minWidth: 70, textAlign: "center", cursor: "pointer", position: "relative" }}
                    >
                      <span style={{
                        fontFamily: font, fontSize: 12, fontWeight: 500,
                        color: task.dueDate ? (isOverdue(task) ? "#D94444" : C.textSecondary) : C.textMuted,
                      }}>
                        {fmtDate(task.dueDate) || "Set date"}
                      </span>
                      <input type="date" value={task.dueDate || ""}
                        ref={el => { dateRefs.current[task.id] = el; }}
                        onChange={e => setDueDate(task.id, e.target.value)}
                        tabIndex={-1}
                        style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" }} />
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

// ─── MAIN APP ──────────────────────────────────────────────────────────────

export default function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [tasks, setTasks] = useState(() => {
    try {
      const raw = localStorage.getItem("pool-paddle-tasks-v2");
      if (raw) {
        const saved = JSON.parse(raw);
        const defaultIds = new Set(DEFAULT_TASKS.map(t => t.id));
        const merged = DEFAULT_TASKS.map(t => {
          const s = saved.find(s => s.id === t.id);
          return s ? { ...t, done: s.done, notes: s.notes ?? t.notes, assignee: s.assignee ?? null, dueDate: s.dueDate ?? null, completedDate: s.completedDate ?? null } : t;
        });
        const userTasks = saved.filter(s => s.userCreated && !defaultIds.has(s.id));
        return [...merged, ...userTasks];
      }
    } catch (e) { /* localStorage not available */ }
    return DEFAULT_TASKS;
  });

  useEffect(() => {
    try {
      localStorage.setItem("pool-paddle-tasks-v2", JSON.stringify(tasks));
    } catch (e) { /* localStorage not available */ }
  }, [tasks]);

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, fontFamily: font }}>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <Header activeView={activeView} setActiveView={setActiveView} />
      {activeView === "dashboard" && <Dashboard tasks={tasks} podcastData={PODCAST_DATABASE} />}
      {activeView === "summary" && <ExecutiveSummary />}
      {activeView === "podcast" && <PodcastView podcastData={PODCAST_DATABASE} />}
      {activeView === "tasks" && <TaskView tasks={tasks} setTasks={setTasks} />}
    </div>
  );
}
