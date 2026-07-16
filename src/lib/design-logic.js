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

// Migrate old room IDs → new room IDs (2026-02-16 room restructure)
export const ROOM_MIGRATION = {
  "bed1-bath": "ground-floor-king",
  "bed2": "downstairs-full-bed",
  "bed3-bath": "second-master",
  "bunk-bath": "bunk-room",
  "upper-half-bath": "3rd-floor-bath",
  "kitchen": "kitchen-upstairs",
};

export function migrateRoom(roomId) {
  return ROOM_MIGRATION[roomId] || roomId;
}

/**
 * Reconcile saved finish data with the default catalogue.
 * Default items are rebuilt from `defaults` but keep every user-edited field
 * (name, category, room, selection, price, etc.). User-created items pass through.
 * @param {object[]} saved      - the persisted finishes array
 * @param {string[]} deletedIds - ids of default items the user removed
 * @param {object[]} defaults   - the default finish catalogue (DEFAULT_FINISH_ITEMS)
 */
export function mergeFinishes(saved, deletedIds = [], defaults = []) {
  if (!saved || !Array.isArray(saved)) return defaults;
  const deletedSet = new Set(deletedIds);
  const defaultIds = new Set(defaults.map(i => i.id));
  const merged = defaults
    .filter(item => !deletedSet.has(item.id))
    .map(item => {
      const s = saved.find(s => s.id === item.id);
      return s ? { ...item, item: s.item ?? item.item, category: s.category ?? item.category, room: s.room ? migrateRoom(s.room) : item.room, selection: s.selection ?? "", unitPrice: s.unitPrice ?? null, quantity: s.quantity ?? null, unit: s.unit ?? item.unit, url: s.url ?? "", notes: s.notes ?? "", linkedTo: s.linkedTo ?? null, assignee: s.assignee ?? null, dueDate: s.dueDate ?? null } : item;
    });
  const userItems = saved.filter(s => s.userCreated && !defaultIds.has(s.id))
    .map(item => ({ ...item, room: migrateRoom(item.room) }));
  return [...merged, ...userItems];
}

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

/* ── Per-record finish hash: field encoding/decoding ──────────────────────────
 * Finishes persist as a Redis HASH (`finish-records:<propertyId>`) with one
 * independently-writable field per editable unit, so concurrent edits to
 * different units never overwrite each other. Field layout:
 *   item:<itemId>              → a finish item's saved record
 *   item:<itemId> {__deleted}  → tombstone for a deleted DEFAULT item
 *   furn:<roomId>:<furnId>     → one furniture item
 *   room:<roomId>              → { miroUrl }
 *   budget                     → the targetBudget scalar
 *   __migrated                 → idempotency stamp (ignored on decode)
 * Room/furniture/item ids are colon-free, so `prefix:...` parses unambiguously.
 */
export const BUDGET_FIELD = 'budget';
export const MIGRATED_FIELD = '__migrated';

export function finishItemField(id) { return `item:${id}`; }
export function furnitureField(roomId, furnId) { return `furn:${roomId}:${furnId}`; }
export function roomField(roomId) { return `room:${roomId}`; }
export function tombstone(id) { return { id, __deleted: true }; }

// Legacy blob { items, roomData, targetBudget, deletedIds } → { field: value } map.
// Values are plain objects/scalars; the caller JSON-stringifies before HSET.
export function blobToFields(blob) {
  const fields = {};
  const b = blob || {};
  for (const item of Array.isArray(b.items) ? b.items : []) {
    if (item && item.id != null) fields[finishItemField(item.id)] = item;
  }
  for (const id of Array.isArray(b.deletedIds) ? b.deletedIds : []) {
    fields[finishItemField(id)] = tombstone(id);
  }
  const rooms = b.roomData && typeof b.roomData === 'object' ? b.roomData : {};
  for (const [roomId, rd] of Object.entries(rooms)) {
    const data = rd || {};
    fields[roomField(roomId)] = { miroUrl: data.miroUrl || '' };
    for (const furn of Array.isArray(data.furniture) ? data.furniture : []) {
      if (furn && furn.id != null) fields[furnitureField(roomId, furn.id)] = furn;
    }
  }
  if (b.targetBudget != null) fields[BUDGET_FIELD] = b.targetBudget;
  return fields;
}

// Raw HGETALL map ({ field: objectOrJsonString }) → the shapes App state uses.
export function partitionFinishFields(map) {
  const out = { savedItems: [], deletedIds: [], roomData: {}, targetBudget: null };
  if (!map || typeof map !== 'object') return out;
  const val = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  const ensureRoom = (roomId) => {
    if (!out.roomData[roomId]) out.roomData[roomId] = { miroUrl: '', furniture: [] };
    return out.roomData[roomId];
  };
  for (const [field, raw] of Object.entries(map)) {
    if (field === MIGRATED_FIELD) continue;
    if (field === BUDGET_FIELD) { out.targetBudget = val(raw); continue; }
    if (field.startsWith('item:')) {
      const rec = val(raw);
      if (rec && rec.__deleted) out.deletedIds.push(rec.id != null ? rec.id : field.slice(5));
      else if (rec) out.savedItems.push(rec);
      continue;
    }
    if (field.startsWith('room:')) {
      const roomId = field.slice(5);
      ensureRoom(roomId).miroUrl = (val(raw) || {}).miroUrl || '';
      continue;
    }
    if (field.startsWith('furn:')) {
      const rest = field.slice(5);
      const idx = rest.lastIndexOf(':');
      if (idx < 0) continue;
      const roomId = rest.slice(0, idx);
      ensureRoom(roomId).furniture.push(val(raw));
      continue;
    }
    // unknown prefix → ignore
  }
  // HGETALL field order is arbitrary; sort each room's furniture by id (ids embed
  // Date.now(), so this is chronological) for a STABLE order across reloads — otherwise
  // furniture rows would visibly reshuffle every load.
  for (const rd of Object.values(out.roomData)) {
    rd.furniture.sort((a, b) => String((a && a.id) || '').localeCompare(String((b && b.id) || '')));
  }
  return out;
}
