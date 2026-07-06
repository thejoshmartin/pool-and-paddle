# Pool & Paddle — Codebase Guide

> A single-page React app that serves as a private "command center" for launching Josh & Kerry's luxury short-term rental (STR) beach house at 6401 Broward Street, St. Augustine, FL 32080. Deployed on Vercel with Upstash Redis for shared state. This document explains how the app is built so you can reason about or extend it.

> ⚠️ **CURRENT ARCHITECTURE lives in `CLAUDE.md`.** Sections 1–13 below describe the *original* app and are still accurate for the parts they cover (auth, design tokens, tasks/design data model, dashboard, conventions). Since then the app added **multi-property scoping, a Purchases feature (receipts + allowance reconciliation + Design→Purchase promote), and cost-seg capture + CSV export** — summarized in "§14 — 2026-07 additions" at the bottom. Where anything here conflicts with the current code, `CLAUDE.md` + the code win.

---

## 1. What it is

A password-protected admin dashboard with **5 tabs**:

1. **Dashboard** — at-a-glance stats, action items, progress bars, property map
2. **Executive Brief** — curated insights distilled from an STR podcast
3. **Podcast Intel** — searchable database of ~534 podcast episodes
4. **Task Tracker** — launch checklist (tasks grouped by category)
5. **Design** — finish selections + budget tracking per room/trade

Two users share the same data: **JM = Josh Martin**, **KM = Kerry** (his wife).

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | React 18 (function components + hooks) |
| Build tool | Vite 6 (`@vitejs/plugin-react`) |
| Hosting | Vercel (static SPA + serverless functions + edge middleware) |
| State store | Upstash Redis (source of truth) + `localStorage` (fast cache) |
| Auth | Custom Vercel Edge Middleware (cookie + SHA-256 hash) |
| Styling | 100% inline React styles — **no CSS files, no UI libraries** |
| Fonts | Plus Jakarta Sans (loaded via Google Fonts `<link>`) |

`package.json` dependencies: `react`, `react-dom`, `@upstash/redis`, `@anthropic-ai/sdk` (the last is only used by build scripts, not the app runtime).

---

## 3. Directory layout

```
pool-and-paddle/
├── index.html               # Vite entry HTML (mounts #root)
├── middleware.js            # Vercel Edge Middleware — auth for /admin + /api
├── vercel.json              # rewrites (/admin → SPA, / → coming-soon) + cron
├── vite.config.js           # Vite config (outDir: dist)
├── package.json
├── public/
│   └── coming-soon.html     # Public landing page at the root domain
├── api/                     # Vercel serverless functions
│   ├── tasks.js             # GET/PUT Redis key "tasks"
│   ├── finishes.js          # GET/PUT Redis key "finishes"
│   └── keepalive.js         # Cron ping to keep Upstash free tier alive
├── src/
│   ├── main.jsx             # React entry — renders <App/> into #root
│   ├── App.jsx              # THE ENTIRE APP (~2950 lines, all components)
│   ├── podcast-data.json    # 534 episode records (built by scripts)
│   ├── executive-summary.json # Curated brief (built by scripts)
│   ├── tools-data.json      # Tools/software mentioned in the podcast
│   └── finishes-data.json   # Default finish categories/rooms/items
└── scripts/                 # Offline data-pipeline (Node, run manually)
    ├── fetch-episodes.js    # Pull podcast episodes + process w/ Claude
    ├── build-exec-summary.js# Regenerate executive-summary.json
    └── parse-finishes.py    # Parse finish selections into JSON
```

---

## 4. URL structure & routing

There is **no client-side router**. All "routing" happens at two levels:

**Vercel level** (`vercel.json` rewrites):
- `/` → serves `public/coming-soon.html` (public placeholder)
- `/admin` and `/admin/*` → serves `index.html` (the SPA)

**App level**: tab switching is just an `activeView` string in React state (`"dashboard" | "tasks" | "design" | "podcast" | "exec"`). No URL changes when you switch tabs.

Key routes:
| Path | Purpose |
|---|---|
| `poolandpaddle.com/` | Branded "Coming Soon" page |
| `/admin` | The SPA (requires login) |
| `/admin/login` | User selector (Josh/Kerry) + password form |
| `/admin/logout` | Clears cookies, redirects to login |
| `/api/*` | Protected JSON endpoints (401 if unauthenticated) |

---

## 5. Authentication (`middleware.js`)

A Vercel **Edge Middleware** protects `/admin/*` and `/api/*`. Config matcher:
`['/', '/admin', '/admin/:path*', '/api/:path*']`.

**How it works:**
- Two users hardcoded: `JM` (Josh) and `KM` (Kerry). Each has a password stored in a Vercel env var (`JM_PASSWORD`, `KM_PASSWORD`).
- On login POST, the submitted password is compared to the env var. On success, the middleware sets two cookies:
  - `pp_session` — **HttpOnly**, value `USERNAME:hash` where `hash = SHA-256("pool-and-paddle:" + username + ":" + password)`
  - `pp_user` — **JS-readable**, value `JM` or `KM` (so the React app can show who's logged in)
- On every protected request, `validateSession()` recomputes the expected hash from the env-var password and compares. No server-side session store — the cookie *is* the session (stateless).
- Cookie max age: 30 days. Both cookies are `Secure; SameSite=Lax`.
- **Login page HTML is generated inline** inside `middleware.js` (`loginPage()` function) — it is not a React component.

**Local dev bypass:** if neither `JM_PASSWORD` nor `KM_PASSWORD` is set (i.e. local machine), auth is skipped entirely and everything is accessible.

**Exceptions to auth:** `/api/keepalive` is always allowed through (it only pings Redis, exposes no data).

The React side reads the `pp_user` cookie via `getCurrentUser()` in `App.jsx` to map `JM → { code:'JM', name:'Josh' }` etc.

---

## 6. `src/App.jsx` — the whole app in one file

Everything (all components, state, styling) lives in this ~2950-line file. There is no component-file splitting. Top-to-bottom structure:

### 6a. Data constants (top of file)
- `TASK_CATEGORIES` — 9 task categories (id, label, emoji icon)
- `DEFAULT_TASKS` — ~55 seed tasks (`t1`…`t55`), each `.map`ped to add `assignee/dueDate/completedDate/userCreated` defaults
- `DEFAULT_FINISH_ITEMS` — 161 finish items derived from `finishes-data.json`
- Static JSON imports: `podcast-data.json`, `executive-summary.json`, `tools-data.json`, `finishes-data.json`

### 6b. Design tokens — **use these, never hardcode**
```js
const C = {
  white:"#FFFFFF", offWhite:"#F7FAF8",
  seafoam:"#93E9BE", seafoamLight:"#D6F5E6", seafoamFaint:"#EDF9F3",
  mint:"#2EAF7B", mintDark:"#238C62",
  ocean:"#2D7DD2", oceanLight:"#E3EFF9",
  charcoal:"#333333", textSecondary:"#666666", textMuted:"#999999",
  border:"#E2E8E5", borderLight:"#EEF2F0",
  cardBg:"#FFFFFF", pageBg:"#F5F8F6",
};
const font = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const priorityColors = { critical:C.ocean, high:C.mint, medium:C.textSecondary, low:C.textMuted };
```
Primary accent is `mint`/`seafoam`; page background is `pageBg`. Priority colors drive task/insight badges.

### 6c. Components (all in this file)
| Component | Line ~ | Role |
|---|---|---|
| `getCurrentUser()` | 111 | Reads `pp_user` cookie → `{code,name}` |
| `Header` | 123 | Top nav / tab switcher (`activeView`, `setActiveView`) |
| `StatCard` | 259 | Reusable metric card (responsive via CSS `clamp()`) |
| `Dashboard` | 296 | Stats, action items, progress, map |
| `PodcastView` | 570 | Searchable/filterable episode database |
| `TaskView` | 781 | Task tracker (grouping, assignees, due dates) |
| `ExecutiveSummary` | 1228 | Renders `executive-summary.json` |
| `migrateRoom` / `mergeFinishes` | 1632 | Reconcile saved finishes with defaults |
| `DesignView` | 1651 | Finish selections + budget + per-room furniture |
| `mergeTasks` | 2891 | Reconcile saved tasks with defaults |
| `App` (default export) | 2904 | Root — owns all state + persistence |

### 6d. The `App` root component — state & persistence
`App` owns all shared state and passes it down via props (no context/Redux):

- `activeView`, `focusItemId`, `focusItemSource` — navigation + deep-link-to-item
- `tasks`, `finishes`, `targetBudget`, `roomData`, `deletedFinishIds`
- `syncError` — surfaces server save failures as a red banner

**The persistence pattern (important):**
1. **Initialize** each state slice from `localStorage` (synchronous, instant paint). Keys: `pool-paddle-tasks-v2`, `pool-paddle-finishes-v1`.
2. **On mount**, `fetch()` from the server (`/api/tasks`, `/api/finishes`). If the server has data, it **merges** and overrides local. `serverLoaded` / `finishesServerLoaded` refs gate this so the save effect doesn't fire before the initial load completes (prevents clobbering server data with defaults).
3. **On change**, a **debounced (500ms)** effect writes to *both* `localStorage` and the server (`PUT`). Server errors set `syncError`.

**Merge functions** (`mergeTasks`, `mergeFinishes`) reconcile saved data with current defaults so new default items appear for users while preserving their edits. User-created items (`userCreated: true`) are appended after defaults. `ROOM_MIGRATION` map + `migrateRoom()` remap user items from old room IDs to renamed ones.

**Deep-linking between tabs:** `navigateToItem(source, itemId)` sets `focusItemId`/`focusItemSource` and switches tab. `TaskView`/`DesignView` receive `focusItemId` to auto-expand + scroll to that item. This powers the Dashboard "Action Items" click-through.

---

## 7. Data models

### Tasks (`api/tasks` Redis key `tasks` — a plain array)
```
{ id, category, task, done, priority, isGimmick, notes,
  relatedEps:[epNumbers], assignee:"JM"|"KM"|null,
  dueDate, completedDate, userCreated }
```
Categories: pre-launch, legal, design, technology, operations, marketing, guest-exp, pricing, launch.

### Finishes / Design (`api/finishes` Redis key `finishes`)
Stored as an object:
```
{ items:[...], targetBudget: number|null, roomData:{...}, deletedIds:[...] }
```
Each finish **item**:
```
{ id, category, room, item, contractorOptions[], selection,
  unitPrice, quantity, unit, url, notes, userCreated,
  linkedTo, assignee, dueDate }
```
- **11 trade categories**: flooring, shower-bath-tile, kitchens, countertops, paint, decking, doors, plumbing, appliances, electrical, drywall
- **20 rooms**: whole-house, kitchen-upstairs, wet-bar, 3rd-floor-bath, 3rd-story-porch, master-suite, master-bath, second-master, second-master-bath, bunk-room, bunk-bathroom, ground-floor-king, ground-floor-king-bath, downstairs-full-bed, pool-bath, laundry, garage, summer-kitchen, backyard, exterior
- **161 default items** total.
- **Linked items**: `linkedTo` points at a parent item id. Linked items inherit `selection/unitPrice/unit/url` from the parent; `quantity`/`notes` stay local. `resolveItem()` resolves inherited values for display/budget math. Deleting a parent converts children to standalone (avoids dangling refs).
- **`roomData`**: per-room metadata `{ [roomId]: { miroUrl, furniture:[{ id,name,price,url,notes,purchased }] } }`. Miro URLs are plain link-outs (no API).

### Podcast (`src/podcast-data.json` — static, 534 records)
```
{ id, ep, title, category, priority, tags, summary, keyInsight, isGimmick, source }
```
`isGimmick` flags low-value/clickbait episodes so they can be filtered out.

### Executive summary (`src/executive-summary.json` — static object)
```
{ generatedDate, totalEpisodes, nonGimmickCount, categories,
  topInsights, tagCloud, lastIndexedEpisode }
```

### Tools (`src/tools-data.json` — static object)
`{ tools:[{name,category,description,episodes[],episodeCount,mentionContext}], categories, promoMentions, meta }`

---

## 8. API routes (Vercel serverless — `api/*.js`)

All three use `@upstash/redis` with **explicit** credentials (`PP_REDIS_URL`, `PP_REDIS_TOKEN`) — **not** `Redis.fromEnv()`.

| Route | Methods | Behavior |
|---|---|---|
| `api/tasks.js` | GET / PUT | GET returns array or `null`; PUT validates it's an array, `redis.set('tasks', ...)` |
| `api/finishes.js` | GET / PUT | GET returns object or `null`; PUT validates `{ items:[...] }`, `redis.set('finishes', ...)` |
| `api/keepalive.js` | any | `redis.ping()` — invoked by cron, exempt from auth |

Auth for these routes is enforced upstream by `middleware.js`, not inside the handlers.

---

## 9. Redis / Upstash

- **Database**: `upstash-kv-citrine-cushion` (`social-buffalo-87782.upstash.io`)
- **Env vars**: `PP_REDIS_URL`, `PP_REDIS_TOKEN` (set in Vercel)
- **Why explicit vars**: the old Vercel KV integration vars (`KV_REST_API_*`) still exist but point at a dead/archived DB (`sky-yacht`) and can't be deleted (integration-managed). The `PP_*` vars bypass that.
- **Keepalive cron** (`vercel.json`): `GET /api/keepalive` every Monday 09:00 UTC (`0 9 * * 1`). Upstash free tier auto-archives (deletes) a DB after 14 days of inactivity; the ping prevents that.
- **Keys**: `tasks` (array), `finishes` (`{ items, targetBudget, roomData, deletedIds }`).

---

## 10. Offline data pipeline (`scripts/`)

These are run **manually on a dev machine**, not in production. They regenerate the static JSON files that ship in the bundle.

- **`fetch-episodes.js`** — pulls episodes from the "Thanks for Visiting" WordPress API, optionally fetches transcripts, and processes them through Claude (needs `ANTHROPIC_API_KEY`) to produce `podcast-data.json`. Intermediate files: `scripts/raw-episodes.json`, `scripts/processed-episodes.json`.
- **`build-exec-summary.js`** — regenerates `executive-summary.json` from `podcast-data.json`. Hybrid: deterministic parts (counts, tag cloud, dates) always recomputed; curated parts (top episodes, top insights) preserved, only folding in newly-indexed critical episodes.
- **`parse-finishes.py`** — parses finish selections into `finishes-data.json`.

The recent git history shows these run periodically ("Auto-update: new podcast episodes …", "Auto-rebuild Executive Brief").

---

## 11. Build & deploy

```bash
npm run dev      # local dev server → http://localhost:5173 (auth bypassed)
npm run build    # production build → dist/
npm run preview  # preview the built bundle
git push         # auto-deploys to Vercel (main branch)
```

Deployment is push-to-Vercel; there is no separate staging environment.

---

## 12. Conventions & gotchas (learned the hard way)

- **Single-file discipline**: keep everything in `App.jsx`. No external CSS or UI libraries.
- **Inline styles only** — style objects `style={{...}}`; pull colors from the `C` token object, never hardcode hex.
- **Date inputs**: use a visible native `<input type="date">`. Do **not** use the invisible-overlay pattern (`opacity:0`) — it breaks in Safari.
- **Clickable controls**: use `<button>`, not `<div onClick>`. Divs with onClick can silently fail (assignee circles, etc.).
- **Mobile**: always give touch alternatives for hover-only UI (delete buttons). `DesignView` detects mobile with `window.innerWidth < 768`; `StatCard` uses `clamp()` for responsive fonts.
- **State merges**: never blindly overwrite saved data with defaults — go through `mergeTasks`/`mergeFinishes`, and respect the `serverLoaded` refs so the debounced save doesn't clobber server data during initial load.
- **Assignees**: `JM` = Josh, `KM` = Kerry.
- **Commit style**: imperative mood, 1–2 sentence what+why.

### Historical bugs already fixed (don't reintroduce)
- Stale closures in the fetch `useEffect`s (removed the `else` branches that captured stale state).
- Orphaned linked items when deleting a parent (now converts children to standalone).
- Silent save failures (now show a red sync-error banner).
- Cookie parsing edge cases in `getCurrentUser()` (use `.split('=')[1]?.trim()`).
- Empty `catch` blocks around `localStorage` (now `console.warn`).
- Upstash DB archived after 14 days idle (fixed via keepalive cron + explicit `PP_REDIS_*` vars).

---

## 13. Quick mental model

> Static JSON (podcast/exec/tools/finishes defaults) is baked into the bundle at build time. User-mutable data (tasks + finishes/design) lives in Redis, cached in localStorage, and is synced by a debounced save. A stateless cookie-hash middleware gates the whole `/admin` surface for two known users. The entire UI is one React file of inline-styled components switched by an `activeView` string.

---

## 14. 2026-07 additions (multi-property · purchases · cost-seg)

The app is now **6 tabs** (added **Purchases**). Full current detail is in `CLAUDE.md`; this is the orientation.

**Multi-property scoping.** All user data is scoped per property. A `properties` registry key (`{schemaVersion:'v2', activeId, properties:[{id,name,address,inServiceDate}]}`) plus per-property Redis keys `tasks:<id>` / `finishes:<id>` / `purchases:<id>`. Only `pp` ("Pool & Paddle") exists; there's no add-property UI yet. **Legacy global `tasks`/`finishes` are kept as backup.** `activeProperty` state (null pre-migration → reads/writes the legacy keys). Key helpers: `scopedKey` (`api/_scope.js`), `apiUrl`/`lsKey` (App). A one-time, backup-gated, server-side **migration** (`api/migrate.js`, NX-locked + write-then-stamp) copied legacy → `:pp` verbatim; already run on prod.

**Persistence discipline (critical).** Fetch effects reset a `serverLoaded` ref + use a per-run `isCancelled` guard so an out-of-order resolution after a rapid property switch can't apply under the wrong key. The tasks/finishes SAVE effects **deliberately omit `activeProperty` from their deps** (else a bare switch writes the previous property's data under the new key) — do not "fix." **Purchases persist as a Redis HASH with per-record `HSET`/`HDEL`, never a whole-array write.**

**Purchases** (`src/lib/purchases-logic.js` holds the pure model + constants; `PurchasesView` in `App.jsx` is the UI): log/edit/delete purchases (fields mirror the Excel tracker; see CLAUDE.md), **receipt upload** to a private Vercel Blob store (server-side, token never client-side; `api/receipts-*`), and an **Exhibit B allowance reconciliation** ($446k / 11 categories). **Promote**: a Design item or room-furniture item → a Purchase, non-destructively (linked by `finishItemId`/`furnitureId`; the source is never changed).

**Cost-seg (CPA export).** Per-purchase `assetClass` (auto-suggested from trade via `suggestAssetClass`, overridable), `placedInServiceDate` (defaults from the property `inServiceDate`), `section` (blank by default — never guessed). **"Export Cost Seg CSV"** (`buildCostSegCsv`) groups by asset class with subtotals; labeled "suggested — confirm with CPA."

**Testing.** `npm test` runs `scripts/verify-phase1-logic.mjs` (migration/scoping) + `scripts/verify-logic.mjs` (cost-seg CSV, asset-class map, purchase shape, receipt-path validation). Pure logic only — no DB/browser (the sandbox can't reach a local server). See `docs/known-issues.md` for consciously-deferred tradeoffs.
