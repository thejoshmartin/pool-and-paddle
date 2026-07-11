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
