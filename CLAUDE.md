# Pool & Paddle — Development Guide

## Project Overview
Luxury STR (short-term rental) command center for Josh & KM's beach house. Single-page React app with 5 tabs: Dashboard, Executive Brief, Podcast Intel, Task Tracker, and Design (finish selections). Deployed on Vercel with Upstash Redis for shared state.

## Architecture
- **Single file app**: Everything lives in `src/App.jsx` (~2700 lines). All components, state, and styling are inline.
- **No routing**: Tab switching via `activeView` state in the App component.
- **Design tokens**: All colors/fonts in `C` object and `font` variable at top of file. Use these — never hardcode colors.
- **Inline styles only**: No CSS files. All styling is React inline `style={{}}` objects.
- **Data files**: JSON files in `src/` imported statically (podcast-data, executive-summary, tools-data, finishes-data).

## Key Patterns
- **State persistence**: localStorage as fast cache + Upstash Redis as source of truth. Pattern: load from localStorage on mount, fetch from server, merge, then debounced save (500ms) to both on changes.
- **Merge functions**: `mergeTasks()` and `mergeFinishes()` reconcile saved data with defaults — preserves user edits while allowing new default items to appear. User-created items (with `userCreated: true`) are appended after defaults.
- **Shared state**: Both JM and KM access the same Redis data. The merge pattern handles concurrent edits gracefully.
- **Mobile detection**: DesignView uses `useState`/`useEffect` with `window.innerWidth < 768` to adapt layout. StatCard uses CSS `clamp()` for responsive font sizing.

## API Routes (Vercel Serverless)
- `api/tasks.js` — GET/PUT, Redis key: `tasks`, stores array of task objects
- `api/finishes.js` — GET/PUT, Redis key: `finishes`, stores `{ items: [...], targetBudget: number|null, roomData: {...} }`
- `middleware.js` — Password protection via Vercel Edge Middleware

## Design Tab Data Model
Items have: `id, category, room, item, contractorOptions[], selection, unitPrice, quantity, unit, url, notes, userCreated, linkedTo`

**Linked items**: `linkedTo` references a parent item ID. Linked items inherit selection, unitPrice, unit, and url from the parent. Quantity and notes remain local. `resolveItem()` function resolves linked values for display/budget calculation.

Categories (11 trades): flooring, shower-bath-tile, kitchens, countertops, paint, decking, doors, plumbing, appliances, electrical, drywall

Rooms (14): whole-house, master-suite, bed1-bath, bed2, bed3-bath, bunk-bath, pool-bath, upper-half-bath, kitchen, wet-bar, summer-kitchen, laundry, garage, exterior

**Room data** (`roomData` state): Per-room metadata stored as `{ [roomId]: { miroUrl: string, furniture: [...] } }`. Each furniture item has: `id, name, price, url, notes, purchased`. Persisted alongside finishes in the same Redis payload. Miro URLs are simple link-outs (no API integration).

## Build & Deploy
```bash
npm run dev          # Local dev at localhost:5173
npm run build        # Production build → dist/
git push             # Auto-deploys to Vercel
```

## Conventions
- Commit messages: imperative mood, 1-2 sentence description of what and why
- Co-author tag: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Assignees: JM = Josh Martin, KM = his wife
- iOS compatibility: avoid `showPicker()` on date inputs — use full-size transparent native inputs instead
- Mobile: always provide touch alternatives for hover-dependent UI (delete buttons, etc.)
- No external CSS or UI libraries — keep everything in the single App.jsx file
