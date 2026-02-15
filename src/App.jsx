import { useState, useEffect, useMemo, useRef } from "react";

// ─── DATA ───────────────────────────────────────────────────────────────────

const PODCAST_DATABASE = [
  // ── GETTING STARTED & PRE-LAUNCH ──
  { id: 1, ep: 526, title: "What to Do Before You Get the Keys to Your First STR", category: "Getting Started", priority: "critical", tags: ["pre-launch","business setup","financial systems","insurance","tax strategy","market research","pricing","calendar management"], summary: "Before a single guest checks in: set up business bank accounts, build an advisory team (legal, insurance, tax), research your market's seasonality and revenue potential, learn strategic pricing and calendar management, and create operational habits. Avoid information overload—action beats consumption.", keyInsight: "What you do before opening day determines how profitable your hosting journey will be.", source: "https://thanksforvisiting.com/podcasts/526/", isGimmick: false },
  { id: 2, ep: 520, title: "How to Pick the Right Guest Avatar for Your STR", category: "Getting Started", priority: "critical", tags: ["guest avatar","target market","branding","positioning","luxury","niche"], summary: "Choosing your ideal guest type is one of the most strategic decisions you'll make. When you try to appeal to everyone, you confuse potential guests and lose bookings. Guests need to immediately know who your property is for. Define your guest avatar early and let it guide every decision from design to amenities to pricing.", keyInsight: "When you confuse, you lose. Pick a guest avatar and build everything around them.", source: "https://thanksforvisiting.com/podcasts/520/", isGimmick: false },
  { id: 3, ep: 528, title: "Choosing Your Lane — Revenue, Experience, or Both?", category: "Getting Started", priority: "high", tags: ["strategy","identity","revenue","guest experience","intentional hosting","lifestyle"], summary: "Clarify your 'why' before making property decisions. Are you building to maximize revenue, support a specific lifestyle, or create a highly intentional luxury experience? Your answer should guide every decision from amenities to pricing to operations. Aligned decisions lead to confident, profitable hosting.", keyInsight: "Clarify whether you're optimizing for revenue, lifestyle, or experience—it changes everything.", source: "https://thanksforvisiting.com/podcasts/528/", isGimmick: false },
  { id: 4, ep: 291, title: "Boardrooms to Bedrooms: How An NYC-Based Host Crushed Hospitality in the Hudson Valley", category: "Getting Started", priority: "high", tags: ["luxury","corporate background","hospitality","design","guest experience","hudson valley","standout property"], summary: "A corporate professional's transition into luxury STR hosting, proving that business acumen translates directly to hospitality success. Applying corporate-level standards to guest experience, branding, and operations creates properties that dominate their markets.", keyInsight: "Business skills from any industry translate powerfully into luxury hosting when applied with intention.", source: "https://thanksforvisiting.com/podcasts/291/", isGimmick: false },

  // ── PRICING & REVENUE ──
  { id: 5, ep: 249, title: "Dynamic Pricing Strategies with Andrew Kitchell (Wheelhouse)", category: "Pricing & Revenue", priority: "critical", tags: ["dynamic pricing","revenue management","wheelhouse","data","PMS","A/B testing","strategy"], summary: "Andrew Kitchell (founder of Beyond Pricing and Wheelhouse) shares how to use revenue management data to develop correct pricing strategies. Covers when to implement dynamic pricing, what to look for in a PMS, and how to A/B test listings to increase revenue. Rely on data, not gut feelings, to make pricing decisions.", keyInsight: "Implement dynamic pricing software early—gut-feel pricing leaves significant money on the table.", source: "https://thanksforvisiting.com/podcasts/249/", isGimmick: false },
  { id: 6, ep: 530, title: "Should You Adjust Airbnb Fees in PriceLabs or Airbnb?", category: "Pricing & Revenue", priority: "high", tags: ["PriceLabs","Airbnb fees","host fees","dynamic pricing","base rate","pricing strategy"], summary: "Airbnb's updated host fee structure has created confusion for hosts using dynamic pricing tools like PriceLabs. Handle fee adjustments in the platform (Airbnb), not in your pricing tool—distorting your base rate in PriceLabs creates cascading problems in your pricing strategy.", keyInsight: "Never adjust Airbnb's platform fees inside your dynamic pricing tool—handle fees where they originate.", source: "https://thanksforvisiting.com/podcasts/530/", isGimmick: false },
  { id: 7, ep: 535, title: "How To Plan Your 2026 Holiday Pricing Without Leaving Money on the Table", category: "Pricing & Revenue", priority: "high", tags: ["holiday pricing","calendar","revenue","turnovers","seasonal strategy","2026"], summary: "Holiday pricing is about how guests plan their entire trip, not just the holiday itself. Strategic breakdown of the calendar year showing how to avoid blocked calendars, forced turnovers, and missed revenue by understanding how holidays fall and guests book around them.", keyInsight: "Price around how guests plan trips, not just the holiday dates themselves.", source: "https://thanksforvisiting.com/podcasts/535/", isGimmick: false },
  { id: 8, ep: 525, title: "How to Boost Income in Slow Seasons", category: "Pricing & Revenue", priority: "high", tags: ["slow season","shoulder season","revenue","occupancy","strategy","market demand"], summary: "Your slow season isn't a setback—it's a tool. Stop trying to 'beat' your slow season. Lower market demand isn't a reflection of your listing. Use slow periods strategically: adjust pricing, run maintenance, update photos, and build systems that make peak season more profitable.", keyInsight: "Slow seasons are for building systems and maintenance that make peak season more profitable.", source: "https://thanksforvisiting.com/podcasts/525/", isGimmick: false },
  { id: 9, ep: 536, title: "Unconventional Ways Hosts Are Making Money Without Overnight Guests", category: "Pricing & Revenue", priority: "medium", tags: ["alternative revenue","day-use","events","experiences","shoulder season","monetization"], summary: "Properties can generate income without anyone sleeping there. Strategic hosts unlock new revenue streams: day-use bookings, event hosting, photography sessions, experience packages. Especially valuable during shoulder seasons when overnight demand is lower.", keyInsight: "Your property is an asset beyond overnight stays—explore day-use, events, and experience revenue.", source: "https://thanksforvisiting.com/podcasts/536/", isGimmick: false },

  // ── FURNISHING & DESIGN ──
  { id: 10, ep: 531, title: "Where to Splurge—and Where to Save—When Furnishing an STR", category: "Furnishing & Design", priority: "critical", tags: ["furnishing","splurge","save","beds","bedding","cookware","seating","rugs","design","budget"], summary: "SPLURGE on: beds/bedding (hospitality-grade), cookware/kitchen essentials, quality seating with performance fabrics, rugs, and one intentional visual 'wow' moment. SAVE on: wine glasses/barware (they break), bathroom amenities (clean basics over luxury brands), decorative clutter (more work for cleaners, no ROI). Rule: splurge on anything guests sleep on, sit on, or use repeatedly.", keyInsight: "Splurge on sleep, seating, and kitchen. Save on breakables and decorative clutter.", source: "https://thanksforvisiting.com/podcasts/531/", isGimmick: false },
  { id: 11, ep: 165, title: "Double Your Bookings with This STR Listing Strategy", category: "Furnishing & Design", priority: "high", tags: ["listing strategy","photos","visibility","Airbnb algorithm","double listing","SEO"], summary: "Your listing can show up ethically twice on Airbnb. Strategic listing optimization and positioning techniques that dramatically increase visibility without gaming the system. Focus on how your property photographs and how your listing copy speaks to your target guest.", keyInsight: "Ethical strategies exist to dramatically increase your Airbnb visibility—learn the platform mechanics.", source: "https://thanksforvisiting.com/podcasts/165/", isGimmick: false },

  // ── GUEST EXPERIENCE & AMENITIES ──
  { id: 12, ep: 239, title: "5 Essential Tools You Must Leave for Airbnb Guests", category: "Guest Experience", priority: "critical", tags: ["cleaning tools","guest supplies","essentials","microfibre cloths","vacuum","plunger","broom","cleaning supplies"], summary: "Five basic but essential cleaning tools that must be available to both your cleaning team AND guests: microfibre cloths with multipurpose cleaner, broom and dustpan, vacuum (invest in quality), plunger (non-negotiable), and reusable spray bottles. Keep them accessible but out of sight. These are investments, not expenses.", keyInsight: "Leave guests the tools to keep your property clean—it protects your asset and prevents bad reviews.", source: "https://thanksforvisiting.com/podcasts/239/", isGimmick: false },
  { id: 13, ep: 522, title: "Should You Really Provide Shampoo in Every Bathroom?", category: "Guest Experience", priority: "medium", tags: ["amenities","toiletries","shampoo","bathrooms","guest experience","hotel standards"], summary: "Yes—provide shampoo, conditioner, and body wash in every bathroom. Use refillable dispensers with a consistent, mid-range brand. This is a basic expectation guests have from hotel stays. Not providing it creates friction and negative reviews. It's inexpensive relative to the guest satisfaction impact.", keyInsight: "Refillable toiletry dispensers in every bathroom are a low-cost, high-impact must-have.", source: "https://thanksforvisiting.com/podcasts/522/", isGimmick: false },
  { id: 14, ep: 524, title: "How to Align With the Right Guests Without 'Screening'", category: "Guest Experience", priority: "high", tags: ["guest screening","guest alignment","hospitality","booking requests","communication","house rules"], summary: "Reframe 'screening' as 'alignment.' The goal isn't to judge guests—it's to ensure your property is the right fit. Use clear listing descriptions, house rules, and pre-booking communication to attract your ideal guest and set expectations. Words carry weight in hospitality.", keyInsight: "Don't screen guests—align with them through clear descriptions, rules, and communication.", source: "https://thanksforvisiting.com/podcasts/524/", isGimmick: false },

  // ── OPERATIONS & SYSTEMS ──
  { id: 15, ep: 518, title: "When to Outsource Your Cleaner and How to Trust It's Done Right", category: "Operations", priority: "critical", tags: ["cleaning","outsourcing","systems","checklists","turnover","quality control","SOPs"], summary: "Stop cleaning yourself as soon as possible. Build cleaning checklists and SOPs before hiring so you can train to a standard. Document everything with photos. Create quality control processes. Trust comes from systems, not from doing it yourself. Your time is better spent on strategy and growth.", keyInsight: "Build documented cleaning SOPs first, then hire—trust comes from systems, not personal oversight.", source: "https://thanksforvisiting.com/podcasts/518/", isGimmick: false },
  { id: 16, ep: 538, title: "How to Use a Virtual Assistant to Grow Your Hosting Business", category: "Operations", priority: "medium", tags: ["virtual assistant","delegation","follow-through","operations","scaling","time management"], summary: "VAs don't replace you—they help you follow through. Most hosts aren't overwhelmed by workload; they're overwhelmed by incomplete follow-through. VAs handle guest messaging, review responses, listing updates, and operational tasks so you can focus on strategic growth.", keyInsight: "The real bottleneck isn't workload—it's follow-through. VAs solve that.", source: "https://thanksforvisiting.com/podcasts/538/", isGimmick: false },

  // ── TECHNOLOGY & TOOLS ──
  { id: 17, ep: 265, title: "Maximize Revenue and Bookings with Intellihost", category: "Technology", priority: "high", tags: ["Intellihost","analytics","revenue","bookings","data","optimization","tools"], summary: "Intellihost provides analytics and insights that help hosts understand their booking performance, identify gaps, and optimize revenue. Data-driven hosting outperforms intuition-based decisions every time. Track your metrics religiously.", keyInsight: "Track and analyze your booking data—what gets measured gets improved.", source: "https://thanksforvisiting.com/podcasts/265/", isGimmick: false },
  { id: 18, ep: 537, title: "The Airbnb Metrics That Actually Drive Bookings", category: "Technology", priority: "critical", tags: ["Airbnb metrics","Professional Hosting Tools","search ranking","conversion rate","views","impressions","data"], summary: "Stop guessing what's wrong with your listing—Airbnb's Professional Hosting Tools provide the data. Track impressions, views, and conversion rates. Most hosts don't look at this data even though it tells you exactly where your funnel is breaking. Feelings don't get bookings—data does.", keyInsight: "Airbnb's built-in metrics tell you exactly where your booking funnel breaks—use them.", source: "https://thanksforvisiting.com/podcasts/537/", isGimmick: false },
  { id: 19, ep: 533, title: "How AI Is Changing the Way Guests Find and Book Your STR", category: "Technology", priority: "high", tags: ["AI","search","guest discovery","SEO","ChatGPT","booking behavior","future trends"], summary: "Guests increasingly use AI tools to search for travel recommendations instead of traditional search. AI pulls answers from websites and listings it can access. Ensure your listing descriptions, direct booking site, and web presence are AI-readable and rich with relevant keywords and details.", keyInsight: "Optimize your listing and website for AI discovery—it's the next search frontier.", source: "https://thanksforvisiting.com/podcasts/533/", isGimmick: false },
  { id: 20, ep: 527, title: "The Real Risks of Using AI in Your STR Business", category: "Technology", priority: "medium", tags: ["AI risks","legal","liability","guest messaging","automation","attorney","compliance"], summary: "Not all AI uses are equal. AI is great for drafting listings and automating simple messages, but relying on it for legal, safety, or complex guest situations creates liability. Joined by attorney Scott Brown discussing where human expertise remains essential.", keyInsight: "Use AI for drafts and simple automation, but keep humans in the loop for legal and safety matters.", source: "https://thanksforvisiting.com/podcasts/527/", isGimmick: false },
  { id: 21, ep: 532, title: "Does Renaming Airbnb Photos Actually Improve SEO?", category: "Technology", priority: "low", tags: ["SEO","photo naming","Airbnb photos","search","accessibility","listing optimization"], summary: "Intentional photo naming supports search alignment and accessibility. While not a magic bullet, naming photos with descriptive keywords contributes to long-term listing performance and helps accessibility tools describe your property.", keyInsight: "Name your listing photos descriptively—it's a small effort with compounding SEO benefits.", source: "https://thanksforvisiting.com/podcasts/532/", isGimmick: true },

  // ── MARKETING & DIRECT BOOKING ──
  { id: 22, ep: 523, title: "How to Shop Your Competition Using ChatGPT and Boost Bookings", category: "Marketing", priority: "high", tags: ["competition analysis","ChatGPT","reviews","market research","positioning","competitive advantage"], summary: "Use ChatGPT to analyze competitors' reviews at scale. Feed it review data from comparable listings and ask it to identify common complaints, praised amenities, and gaps. This reveals exactly where you can differentiate and what guests in your market truly value.", keyInsight: "Analyze competitor reviews with AI to find the gaps your property can fill.", source: "https://thanksforvisiting.com/podcasts/523/", isGimmick: false },

  // ── LEGAL, INSURANCE & COMPLIANCE ──
  { id: 23, ep: 519, title: "Airbnb's New Cancellation Rules: What Hosts Need to Do Now", category: "Legal & Compliance", priority: "critical", tags: ["cancellation policy","Airbnb policy","24-hour cancellation","risk management","booking protection"], summary: "Airbnb's 24-hour free cancellation policy for stays under 28 days aligns with hotels and airlines but creates new uncertainty for hosts. Adapt by: understanding the policy mechanics, adjusting your pricing strategy to account for cancellation risk, and considering direct booking channels for more control.", keyInsight: "Adapt to Airbnb's cancellation policies by diversifying to direct booking channels.", source: "https://thanksforvisiting.com/podcasts/519/", isGimmick: false },

  // ── INDUSTRY TRENDS ──
  { id: 24, ep: 521, title: "2026 STR Predictions: What Hosts Need to Know", category: "Industry Trends", priority: "high", tags: ["2026 predictions","market trends","regulations","professionalization","standards","luxury","competition"], summary: "The STR industry is maturing: higher standards, tighter regulations, and a market that rewards strategy over luck. After normalization in 2025, 2026 will favor hosts who operate professionally, invest in guest experience, understand their data, and treat hosting as a real business.", keyInsight: "The era of 'list it and they'll come' is over—professional operators will dominate 2026.", source: "https://thanksforvisiting.com/podcasts/521/", isGimmick: false },
  { id: 25, ep: 529, title: "Top STR Hosting Lessons of 2025: Pricing, Profit & Strategy", category: "Industry Trends", priority: "high", tags: ["2025 review","top lessons","pricing","revenue management","insurance","taxes","upgrades"], summary: "The most-downloaded episodes of 2025 focused on pricing, revenue management, insurance, taxes, and strategic upgrades—the operational backbone of profitable hosting. Hosts are moving past aesthetics-first thinking toward business-first strategy.", keyInsight: "The market is shifting from aesthetics-first to business-operations-first hosting.", source: "https://thanksforvisiting.com/podcasts/529/", isGimmick: false },
];

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
            Launch Task Tracker
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
      {activeView === "podcast" && <PodcastView podcastData={PODCAST_DATABASE} />}
      {activeView === "tasks" && <TaskView tasks={tasks} setTasks={setTasks} />}
    </div>
  );
}
