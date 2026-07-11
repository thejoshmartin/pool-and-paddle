# Design Tab — Search + Copy-to-Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free-text search box and a "copy an item to multiple rooms" feature (independent copies or linked children) to the Design & Furnishing tab.

**Architecture:** Two pure, node-testable helpers go in a new `src/lib/design-logic.js` (following the `src/lib/purchases-logic.js` convention) with checks appended to `scripts/verify-logic.mjs`. The `DesignView` component in `src/App.jsx` imports and wires them into the existing filter bar and expanded item row. No API, Redis, or schema changes — copies are ordinary `finishes` items saved by the existing debounced whole-payload PUT.

**Tech Stack:** React (single-file `src/App.jsx`, inline styles + `C` design tokens), Vite build, node assert-based logic checks.

**Spec:** `docs/superpowers/specs/2026-07-11-design-search-and-copy-to-rooms-design.md`

---

## Preflight

- [ ] **Create a feature branch** (repo starts on `main`; branch before committing)

Run:
```bash
git checkout -b design-search-and-copy-to-rooms
```

---

## File Structure

- **Create:** `src/lib/design-logic.js` — two pure helpers: `matchesFinishSearch`, `buildRoomCopies`.
- **Modify:** `scripts/verify-logic.mjs` — import + assert the two helpers.
- **Modify:** `src/App.jsx` — `DesignView`: search state + UI + filter wiring; copy-to-rooms state + panel UI + create handler; import the helpers.

The pure helpers hold all branching logic (search matching, copy field-shaping) so it is unit-tested in node; `App.jsx` only does React state + rendering, verified by `npm run build` + manual check.

---

## Task 1: `matchesFinishSearch` pure helper

**Files:**
- Create: `src/lib/design-logic.js`
- Test: `scripts/verify-logic.mjs` (append)

- [ ] **Step 1: Write the failing test** — append to `scripts/verify-logic.mjs` just before the final `console.log(\`\nAll ${passed} checks passed.\`);` line.

First add to the existing import block near the top of the file (after the `purchases-logic.js` import), a new import line:

```js
import { matchesFinishSearch, buildRoomCopies } from '../src/lib/design-logic.js';
```

Then append these checks:

```js
console.log('matchesFinishSearch():');
{
  const item = { item: 'Kohler faucet', notes: 'brushed nickel', url: 'https://kohler.com/x' };
  assert.equal(matchesFinishSearch(item, 'Purist', ''), true);      // blank term matches all
  assert.equal(matchesFinishSearch(item, 'Purist', '   '), true);   // whitespace-only matches all
  assert.equal(matchesFinishSearch(item, 'Purist', 'kohler'), true);   // matches name, case-insensitive
  assert.equal(matchesFinishSearch(item, 'Purist', 'PURIST'), true);   // matches resolved selection
  assert.equal(matchesFinishSearch(item, 'Purist', 'nickel'), true);   // matches notes
  assert.equal(matchesFinishSearch(item, 'Purist', 'kohler.com'), true); // matches url
  assert.equal(matchesFinishSearch(item, 'Purist', 'bathtub'), false);   // no match
  ok('matches name/selection/notes/url case-insensitively; blank term matches all');
  const sparse = { item: 'Towel bar' };
  assert.equal(matchesFinishSearch(sparse, '', 'towel'), true);   // missing fields don't throw
  assert.equal(matchesFinishSearch(sparse, null, 'zzz'), false);
  ok('tolerates missing selection/notes/url fields');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/lib/design-logic.js'` (or `matchesFinishSearch is not a function`).

- [ ] **Step 3: Write minimal implementation** — create `src/lib/design-logic.js`:

```js
/**
 * Pure, non-UI logic for the Design & Furnishing tab (search + copy-to-rooms).
 * No React, no browser APIs — unit-tested in scripts/verify-logic.mjs.
 */

/**
 * True if `term` matches the finish item's name, its resolved selection, notes, or url.
 * Case-insensitive. A blank/whitespace-only term matches everything.
 * @param {object} item - a finish item ({ item, notes, url, ... })
 * @param {string} resolvedSelection - the item's selection after linkedTo resolution
 * @param {string} term - the raw search text
 */
export function matchesFinishSearch(item, resolvedSelection, term) {
  const t = (term || "").trim().toLowerCase();
  if (!t) return true;
  const haystack = [item.item, resolvedSelection, item.notes, item.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(t);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — the `matchesFinishSearch()` checks print `✓`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design-logic.js scripts/verify-logic.mjs
git commit -m "feat(design): add matchesFinishSearch pure helper + tests"
```

---

## Task 2: `buildRoomCopies` pure helper

**Files:**
- Modify: `src/lib/design-logic.js`
- Test: `scripts/verify-logic.mjs` (append)

Behavior: given a source finish item, a list of target room ids, a mode, and a numeric `idBase`, return one new finish item per room. **Independent** copies carry the source's selection/price/unit/url/contractorOptions and set `linkedTo: null`. **Linked** copies leave selection/price/url blank (inherited live via `resolveItem` in the UI), set `contractorOptions: []`, and set `linkedTo` to the **root** parent id — if the source is itself a linked child (`source.linkedTo` truthy), point at `source.linkedTo`, not the child, so `resolveItem`'s single hop still resolves. Both modes copy `category`, `item`, `quantity`, `notes`; both blank out `assignee`/`dueDate`; both set `userCreated: true` and a unique id `` `uf${idBase}${idx}` ``.

- [ ] **Step 1: Write the failing test** — append to `scripts/verify-logic.mjs` before the final summary line (the import was already added in Task 1):

```js
console.log('buildRoomCopies():');
{
  const source = {
    id: 'p1', category: 'plumbing', room: 'primary-bath', item: 'Shower valve',
    contractorOptions: ['A', 'B'], selection: 'Delta 17T', unitPrice: 120, quantity: 2,
    unit: 'ea', url: 'https://x.com', notes: 'trim in nickel', assignee: 'JM', dueDate: '2026-01-01',
    userCreated: false, linkedTo: null,
  };

  // Independent mode
  const ind = buildRoomCopies({ source, roomIds: ['guest-bath', 'pool-bath'], mode: 'independent', idBase: 1000 });
  assert.equal(ind.length, 2);
  assert.equal(ind[0].id, 'uf10000');
  assert.equal(ind[1].id, 'uf10001');
  assert.notEqual(ind[0].id, ind[1].id);
  assert.equal(ind[0].room, 'guest-bath');
  assert.equal(ind[0].item, 'Shower valve');
  assert.equal(ind[0].category, 'plumbing');
  assert.equal(ind[0].selection, 'Delta 17T');    // carried over
  assert.equal(ind[0].unitPrice, 120);
  assert.equal(ind[0].unit, 'ea');
  assert.equal(ind[0].url, 'https://x.com');
  assert.deepEqual(ind[0].contractorOptions, ['A', 'B']);
  assert.equal(ind[0].quantity, 2);
  assert.equal(ind[0].notes, 'trim in nickel');
  assert.equal(ind[0].linkedTo, null);
  assert.equal(ind[0].userCreated, true);
  assert.equal(ind[0].assignee, null);             // never carried
  assert.equal(ind[0].dueDate, null);
  ok('independent copies carry selection/price/unit/url/options, blank assignee/dueDate, unique ids');

  // contractorOptions is a fresh array (no shared reference)
  ind[0].contractorOptions.push('C');
  assert.deepEqual(source.contractorOptions, ['A', 'B']);
  ok('independent copy does not share the source contractorOptions array');

  // Linked mode from a root source
  const lnk = buildRoomCopies({ source, roomIds: ['guest-bath'], mode: 'linked', idBase: 2000 });
  assert.equal(lnk[0].linkedTo, 'p1');             // links to the source (it is the root)
  assert.equal(lnk[0].selection, '');              // inherited live, not copied
  assert.equal(lnk[0].unitPrice, null);
  assert.equal(lnk[0].url, '');
  assert.deepEqual(lnk[0].contractorOptions, []);
  assert.equal(lnk[0].quantity, 2);                // own quantity, seeded from source
  assert.equal(lnk[0].notes, 'trim in nickel');
  assert.equal(lnk[0].item, 'Shower valve');
  assert.equal(lnk[0].userCreated, true);
  ok('linked copies point at source id, leave selection/price/url blank, keep own quantity/notes');

  // Linked mode from a child source → links to the ROOT, not the child
  const childSource = { ...source, id: 'child1', linkedTo: 'root9' };
  const lnk2 = buildRoomCopies({ source: childSource, roomIds: ['pool-bath'], mode: 'linked', idBase: 3000 });
  assert.equal(lnk2[0].linkedTo, 'root9');
  ok('linked copy of a linked child points at the root parent (no two-level chain)');

  // Empty room list → empty result
  assert.deepEqual(buildRoomCopies({ source, roomIds: [], mode: 'independent', idBase: 4000 }), []);
  ok('no rooms → no copies');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `buildRoomCopies is not a function`.

- [ ] **Step 3: Write minimal implementation** — append to `src/lib/design-logic.js`:

```js
/**
 * Build independent-or-linked copies of a finish item across target rooms.
 * @param {object}   args
 * @param {object}   args.source   - the finish item being copied
 * @param {string[]} args.roomIds  - target room ids (one copy each)
 * @param {'independent'|'linked'} args.mode
 * @param {number}   args.idBase   - unique base for generated ids (caller passes Date.now())
 * @returns {object[]} new finish items ready to append to `finishes`
 */
export function buildRoomCopies({ source, roomIds, mode, idBase }) {
  const rootId = source.linkedTo || source.id;   // never create a two-level link chain
  return roomIds.map((room, idx) => {
    const base = {
      id: `uf${idBase}${idx}`,
      category: source.category,
      room,
      item: source.item,
      quantity: source.quantity ?? null,
      notes: source.notes ?? "",
      unit: source.unit ?? "ea",
      assignee: null,
      dueDate: null,
      userCreated: true,
    };
    if (mode === "linked") {
      return {
        ...base,
        linkedTo: rootId,
        contractorOptions: [],
        selection: "",
        unitPrice: null,
        url: "",
      };
    }
    return {
      ...base,
      linkedTo: null,
      contractorOptions: Array.isArray(source.contractorOptions) ? [...source.contractorOptions] : [],
      selection: source.selection ?? "",
      unitPrice: source.unitPrice ?? null,
      url: source.url ?? "",
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `buildRoomCopies()` checks print `✓`, ending with `All N checks passed.`

- [ ] **Step 5: Commit**

```bash
git add src/lib/design-logic.js scripts/verify-logic.mjs
git commit -m "feat(design): add buildRoomCopies pure helper + tests"
```

---

## Task 3: Wire free-text search into DesignView

**Files:**
- Modify: `src/App.jsx` (import; `DesignView` state ~line 1738; focus effect ~line 1744; `filtered` memo ~line 1762; filter-bar UI ~line 2201; empty-state copy ~line 2981)

- [ ] **Step 1: Import the helper.** At the top of `src/App.jsx`, find the existing import of purchases-logic (search for `from "./lib/purchases-logic`) and add below it:

```js
import { matchesFinishSearch, buildRoomCopies } from "./lib/design-logic.js";
```

- [ ] **Step 2: Add search state.** In `DesignView`, immediately after the line `const [filterAssignee, setFilterAssignee] = useState("all");` (~line 1738) add:

```js
  const [search, setSearch] = useState("");
```

- [ ] **Step 3: Clear search on Dashboard deep-link.** In the focus-item effect (the `useEffect` that runs on `[focusItemId]`, ~line 1744), add `setSearch("");` alongside the existing `setFilterCat("all");` resets:

```js
    setFilterCat("all");
    setFilterRoom("all");
    setFilterStatus("all");
    setFilterAssignee("all");
    setSearch("");
```

- [ ] **Step 4: Apply search in the `filtered` memo.** Replace the `filtered` useMemo body (~line 1762-1778) so it also checks the search term and adds `search` to the deps. The resolved selection is already computed there as `resolvedSel`:

```js
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
```

- [ ] **Step 5: Add the search box to the filter bar.** In the filter bar `<div>` (~line 2162), insert the search input immediately before the `filterAssignee` `<select>` (or anywhere among the selects). Place this block right after the `filterStatus` select's closing `</select>` (~line 2200):

```jsx
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            style={{ ...selectStyle, paddingRight: search ? 30 : 14, minWidth: 180 }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              style={{
                position: "absolute", right: 8, background: "none", border: "none",
                color: C.textMuted, fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1,
              }}
            >×</button>
          )}
        </div>
```

- [ ] **Step 6: Update the empty-state copy.** The no-results block (~line 2976) mentions only "trade, room, or status filters." Update its text to include search:

```jsx
          No items match your filters. Try adjusting the search or the trade, room, and status filters above.
```

- [ ] **Step 7: Verify build + logic.**

Run: `npm run build && npm test`
Expected: build succeeds (writes `dist/`); all logic checks pass.

- [ ] **Step 8: Manual check** (dev server): `npm run dev`, open the Design tab. Type in the search box → the list narrows live and the "N items" counter updates; the ✕ clears it. Confirm searching by a selection value and by a notes word both work.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx
git commit -m "feat(design): add free-text search box to the Design filter bar"
```

---

## Task 4: Copy-to-rooms panel on the expanded item row

**Files:**
- Modify: `src/App.jsx` (`DesignView` state ~line 1738; new handler near `addItem` ~line 1888; expanded-row UI after the promote block ~line 2962)

- [ ] **Step 1: Add panel state.** In `DesignView`, after the `const [search, setSearch] = useState("");` line added in Task 3, add:

```js
  const [copyPanelId, setCopyPanelId] = useState(null);   // id of the item whose copy panel is open
  const [copyRooms, setCopyRooms] = useState([]);         // checked target room ids
  const [copyMode, setCopyMode] = useState("independent"); // "independent" | "linked"
  const [copyToast, setCopyToast] = useState("");         // transient "Copied to N rooms" message
```

- [ ] **Step 2: Add the create handler.** Immediately after the `addItem` function (ends ~line 1908) add:

```js
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
    setCopyToast(`Copied to ${copies.length} room${copies.length !== 1 ? "s" : ""}`);
    setCopyPanelId(null);
    setCopyRooms([]);
  };
```

- [ ] **Step 3: Add the Copy button + panel to the expanded row.** In the expanded-row body, insert this block immediately after the Promote block's closing `)}` (the `{onPromote && ( ... )}` that ends ~line 2962), before the `</>` that closes the expanded fragment (~line 2963):

```jsx
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
                                    onClick={() => setCopyMode(opt.key)}
                                    style={{
                                      padding: "7px 14px", border: "none",
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
                                      onClick={() => setCopyRooms(prev => checked ? prev.filter(x => x !== r.id) : [...prev, r.id])}
                                      style={{
                                        padding: "6px 12px", borderRadius: 8,
                                        border: `1.5px solid ${checked ? C.mint : C.border}`,
                                        background: checked ? C.seafoamFaint : C.white,
                                        color: checked ? C.mint : C.textSecondary,
                                        fontFamily: font, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                      }}
                                    >{checked ? "✓ " : ""}{r.label}</button>
                                  );
                                })}
                              </div>
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <button
                                  onClick={() => createRoomCopies(item)}
                                  disabled={copyRooms.length === 0}
                                  style={{
                                    padding: "8px 18px", borderRadius: 8, border: "none",
                                    background: C.mint, color: C.white, fontFamily: font, fontSize: 13, fontWeight: 700,
                                    cursor: copyRooms.length === 0 ? "default" : "pointer",
                                    opacity: copyRooms.length === 0 ? 0.5 : 1,
                                  }}
                                >Create copies</button>
                                <button
                                  onClick={() => { setCopyPanelId(null); setCopyRooms([]); }}
                                  style={{ background: "none", border: "none", color: C.textMuted, fontFamily: font, fontSize: 12, cursor: "pointer" }}
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
                                onClick={e => { e.stopPropagation(); openCopyPanel(item); }}
                                style={{ padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${C.mint}`, background: C.white, color: C.mint, fontFamily: font, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                              >Copy to rooms…</button>
                              {copyToast && (
                                <span style={{ marginLeft: 12, fontFamily: font, fontSize: 12, fontWeight: 600, color: C.mint, background: C.seafoamFaint, padding: "7px 14px", borderRadius: 8 }}>{copyToast}</span>
                              )}
                            </>
                          )}
                        </div>
```

- [ ] **Step 4: Verify build + logic.**

Run: `npm run build && npm test`
Expected: build succeeds; all logic checks pass.

- [ ] **Step 5: Manual check** (`npm run dev`): expand a Design item → click **Copy to rooms…** → the panel shows the mode toggle and room chips (current room absent). Check 2–3 rooms; **Create copies** is disabled until ≥1 is checked. Create in **Independent** mode → new rows appear in each room; editing one room's selection does NOT change the others. Repeat in **Linked** mode → new rows inherit the source's selection/price; editing the source updates all linked rooms; each linked row keeps its own quantity/notes/owner/date. Copy from an already-linked child → new rows link to the root parent. Confirm the "Copied to N rooms" toast appears.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(design): copy an item to multiple rooms (independent or linked)"
```

---

## Task 5: Final verification & docs

**Files:**
- Modify: `CLAUDE.md` (Design & Purchases data models section — one line noting search + copy-to-rooms)

- [ ] **Step 1: Full gate.**

Run: `npm test && npm run build`
Expected: all logic checks pass; production build succeeds.

- [ ] **Step 2: Note the feature in CLAUDE.md.** In the "Design & Purchases data models" section, after the **Promote** bullet, add a short bullet:

```markdown
- **Copy to rooms** (Design tab, expanded row): fan one finish item out to multiple rooms at once — **Independent copies** (standalone, `linkedTo:null`) or **Linked** children (`linkedTo` = root parent id, inheriting selection/price via `resolveItem`). Pure logic (`buildRoomCopies`, plus the search matcher `matchesFinishSearch`) lives in `src/lib/design-logic.js`. The Design filter bar also has a free-text search box.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note Design search + copy-to-rooms in CLAUDE.md"
```

- [ ] **Step 4: Finish the branch.** Use superpowers:finishing-a-development-branch to decide merge/PR.

---

## Self-Review Notes

- **Spec coverage:** search (Task 1 + 3), copy independent/linked (Task 2 + 4), root-parent link resolution (Task 2), current-room exclusion + disabled-until-checked (Task 4), transient confirmation (Task 4), no API/schema changes (all tasks), Dashboard deep-link interaction (Task 3 step 3). Covered.
- **Type consistency:** helper names `matchesFinishSearch` / `buildRoomCopies` and the `{ source, roomIds, mode, idBase }` arg shape are identical across the import, tests, and call site. New finish items include the same field set as `addItem` plus `linkedTo`.
- **`C` tokens used:** `C.mint`, `C.white`, `C.border`, `C.textSecondary`, `C.textMuted`, `C.charcoal`, `C.borderLight`, `C.seafoamFaint` — all already used elsewhere in `App.jsx`.
