# Design Tab — Search + Copy-to-Rooms

**Date:** 2026-07-11
**Area:** `src/App.jsx` → `DesignView`
**Status:** Approved, ready for implementation plan

## Problem

Two gaps in the Design & Furnishing tab:

1. **No free-text search.** Dropdown filters exist (Trade, Room, Status, Owner) but there's
   no way to type and find an item by name/selection/notes.
2. **No copy function.** The same finish item often belongs in many rooms. Today the only
   options are (a) create each item by hand per room, or (b) create then link one-at-a-time
   via the `linkedTo` dropdown. Both are tedious. We want to pick one item and fan it out to
   many rooms in a single action — either as independent copies or as linked children.

## Scope

- All changes are in `src/App.jsx` (single-file UI convention).
- **No API, Redis, or schema changes.** Copies are just additional `finishes` items persisted
  by the existing whole-payload debounced PUT.
- The existing `linkedTo` feature and `resolveItem()` are reused, not modified.

## Feature 1 — Free-text search

### State
- Add `const [search, setSearch] = useState("")` in `DesignView`.

### Filtering
- In the `filtered` useMemo (currently ~line 1762), add a case-insensitive term match ANDed
  with the existing dropdown predicates. Match against, for each item:
  - `item.item` (description)
  - resolved selection (`item.linkedTo ? parent.selection : item.selection`)
  - `item.notes`
  - `item.url`
- A blank/whitespace-only search matches everything.
- Add `search` to the memo dependency array.

### UI
- Add a search text input to the existing filter bar (~line 2162), styled to match
  `selectStyle` (`fontSize: 16` to avoid iOS zoom). Include a small ✕ clear affordance
  (a `<button>`, not a div) shown when `search` is non-empty.
- The existing "N items" counter already reflects `filtered.length`, so it updates for free.

### Deep-link interaction
- In the Dashboard focus-item effect (~line 1744, which already resets the dropdown filters),
  also `setSearch("")` so a stale search can't hide an item deep-linked from the Dashboard.

## Feature 2 — Copy item to multiple rooms

### Trigger
- On the **expanded item row**, add a **"Copy to rooms…"** button (a `<button>`, `C` tokens).
- Clicking it opens an inline panel (state: which item's panel is open, e.g.
  `const [copyPanelId, setCopyPanelId] = useState(null)`).

### Panel contents
- **Room checkbox list:** all `FINISH_ROOMS`, with the source item's current room excluded
  (it already exists there). Track checked rooms in local state, e.g.
  `const [copyRooms, setCopyRooms] = useState([])`.
- **Mode toggle:** segmented control matching the existing "By Trade / By Room" toggle style:
  - **Independent copies**
  - **Linked to this item**
- **"Create copies" button:** disabled until ≥1 room is checked.

### Create logic
Given the source item and a list of checked target room ids, append one new finish item per
room via `setFinishes`.

Shared for every new item:
- `id`: unique per item (e.g. `` `uf${Date.now()}${idx}` ``)
- `userCreated: true`
- `room`: the target room id
- `assignee: null`, `dueDate: null`
- `category`, `item` copied from source
- `quantity`, `notes` copied from source

**Independent mode** additionally:
- `linkedTo: null`
- copies `contractorOptions`, `selection`, `unitPrice`, `unit`, `url`

**Linked mode** additionally:
- `linkedTo`: the **root** parent id. If the source item is itself a linked child
  (`source.linkedTo` is set), point new children at `source.linkedTo` (the root) rather than
  at the child — this avoids a broken two-level inherit chain, since `resolveItem()` only
  resolves one hop.
- does **not** copy `selection`/`unitPrice`/`unit`/`url` (those are inherited live via
  `resolveItem()`); leave them at empty/null defaults.
- `contractorOptions: []` (children don't carry their own options).

### After create
- Close the panel (`setCopyPanelId(null)`, `setCopyRooms([])`).
- Show a brief confirmation ("Copied to N rooms") — a transient inline message consistent with
  existing UI patterns.
- New items persist through the normal debounced finishes save; no extra persistence code.

## Testing

- **Logic:** if any copy logic is extracted as a pure helper it goes in `src/lib/` and gets a
  node check; otherwise verify via `npm run build` (compile gate) and manual UI check.
  Copy-to-rooms and search are UI-bound, so primary verification is `npm run build` + manual.
- **Manual checks:**
  - Search narrows the list live and the count updates; ✕ clears it; Dashboard deep-link
    still expands its item with search cleared.
  - Independent copies: editing one room's selection does **not** change the others.
  - Linked copies: editing the source selection **does** update all linked rooms; each linked
    room keeps its own quantity/notes/assignee/dueDate.
  - Copying from an already-linked child links new rooms to the root parent (no double hop).
  - Current room is excluded from the target list; "Create copies" disabled with 0 rooms.

## Out of scope

- No bulk copy of *multiple source items* at once (one source item per action).
- No changes to the promote-to-Purchase flow, the link dropdown, or persistence internals.
- No new API routes or schema/version bumps.
