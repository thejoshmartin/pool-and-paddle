# Pool & Paddle — Development Guide

## Project Overview
Luxury STR (short-term rental) command center for Josh & Kerry's beach house at 6401 Broward Street, St. Augustine, FL 32080. Single-page React app with 5 tabs: Dashboard, Executive Brief, Podcast Intel, Task Tracker, and Design (finish selections). Deployed on Vercel with Upstash Redis for shared state.

## URL Structure & Auth
- **Root** (`poolandpaddle.com/`) — branded "Coming Soon" placeholder (`public/coming-soon.html`)
- **Admin app** (`poolandpaddle.com/admin`) — the SPA, requires login
- **Login** (`/admin/login`) — user selector (Josh/Kerry) + password
- **Logout** (`/admin/logout`) — clears session, redirects to login
- **API** (`/api/*`) — protected, returns 401 JSON if unauthenticated
- **Auth cookies**: `pp_session` (HttpOnly, `USERNAME:hash`) + `pp_user` (JS-readable, `JM` or `KM`)
- **Env vars**: `JM_PASSWORD`, `KM_PASSWORD`, `VITE_GOOGLE_MAPS_KEY` (all in Vercel)
- **Domain**: `poolandpaddle.com` → DNS A record to Vercel, `www.poolandpaddle.com` is primary
- **Local dev**: auth bypassed when no password env vars are set

## Architecture
- **Single file app**: Everything lives in `src/App.jsx` (~2800 lines). All components, state, and styling are inline.
- **No routing**: Tab switching via `activeView` state in the App component.
- **Design tokens**: All colors/fonts in `C` object and `font` variable at top of file. Use these — never hardcode colors. Primary accent: `C.mint`/`C.seafoam`. Background: `C.seafoamFaint`.
- **Inline styles only**: No CSS files. All styling is React inline `style={{}}` objects.
- **Data files**: JSON files in `src/` imported statically (podcast-data, executive-summary, tools-data, finishes-data).

## Key Patterns
- **State persistence**: localStorage as fast cache + Upstash Redis as source of truth. Pattern: load from localStorage on mount, fetch from server, merge, then debounced save (500ms) to both on changes.
- **Merge functions**: `mergeTasks()` and `mergeFinishes()` reconcile saved data with defaults — preserves user edits while allowing new default items to appear. User-created items (with `userCreated: true`) are appended after defaults.
- **Room migration**: `ROOM_MIGRATION` map + `migrateRoom()` function migrates user-created items from old room IDs to new ones during merge.
- **Shared state**: Both JM and KM access the same Redis data. The merge pattern handles concurrent edits gracefully.
- **Mobile detection**: DesignView uses `useState`/`useEffect` with `window.innerWidth < 768` to adapt layout. StatCard uses CSS `clamp()` for responsive font sizing.
- **Auto-sort**: Items within each trade/room group are sorted by the cross-reference dimension (room order when grouped by trade, category order when grouped by room).

## API Routes (Vercel Serverless)
- `api/tasks.js` — GET/PUT, Redis key: `tasks`, stores array of task objects
- `api/finishes.js` — GET/PUT, Redis key: `finishes`, stores `{ items: [...], targetBudget: number|null, roomData: {...} }`
- `middleware.js` — Per-user auth (JM/KM), protects `/admin/*` and `/api/*`, serves login page, redirects `/` to coming-soon
- Matcher: `['/', '/admin', '/admin/:path*', '/api/:path*']`

## Dashboard
- Task Progress by Category — progress bars per task category
- Design Decisions — stat card + room-by-room progress bars (mint/seafoam theme)
- Google Maps embed — roadmap view of property location (API key via `VITE_GOOGLE_MAPS_KEY` env var)
- Executive summary was removed from dashboard (still accessible via Executive Brief tab)

## Design Tab Data Model
Items have: `id, category, room, item, contractorOptions[], selection, unitPrice, quantity, unit, url, notes, userCreated, linkedTo`

**Linked items**: `linkedTo` references a parent item ID. Linked items inherit selection, unitPrice, unit, and url from the parent. Quantity and notes remain local. `resolveItem()` function resolves linked values for display/budget calculation.

Categories (11 trades): flooring, shower-bath-tile, kitchens, countertops, paint, decking, doors, plumbing, appliances, electrical, drywall

Rooms (20): whole-house, kitchen-upstairs, wet-bar, 3rd-floor-bath, 3rd-story-porch, master-suite, master-bath, second-master, second-master-bath, bunk-room, bunk-bathroom, ground-floor-king, ground-floor-king-bath, downstairs-full-bed, pool-bath, laundry, garage, summer-kitchen, backyard, exterior

**161 default finish items** across 11 trades and 20 rooms.

**Room data** (`roomData` state): Per-room metadata stored as `{ [roomId]: { miroUrl: string, furniture: [...] } }`. Each furniture item has: `id, name, price, url, notes, purchased`. Persisted alongside finishes in the same Redis payload. Miro URLs are simple link-outs (no API integration).

## Build & Deploy
```bash
npm run dev          # Local dev at localhost:5173
npm run build        # Production build → dist/
git push             # Auto-deploys to Vercel
```

## Known Issues — FIXED (2026-02-19)
- **Stale closures**: Both fetch `useEffect`s had `else` branches that captured stale state — removed
- **Orphaned linked items**: Deleting a parent item left children with dangling `linkedTo` reference — now converts children to standalone
- **Silent save failures**: Server save errors were invisible to user — now shows red sync error banner
- **Cookie parsing**: `getCurrentUser()` could fail on some cookie formats — fixed to use `.split('=')[1]?.trim()`
- **Silent localStorage errors**: 6 `catch` blocks around localStorage were empty — now log with `console.warn`

## Conventions
- Commit messages: imperative mood, 1-2 sentence description of what and why
- Co-author tag: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Assignees: JM = Josh Martin, KM = his wife
- Date inputs: use visible native `<input type="date">` elements — do NOT use invisible overlay pattern (`opacity: 0`), it breaks in Safari
- Clickable controls: use `<button>` not `<div>` for click targets (assignee circles, etc.) — divs with onClick can silently fail
- Mobile: always provide touch alternatives for hover-dependent UI (delete buttons, etc.)
- No external CSS or UI libraries — keep everything in the single App.jsx file
