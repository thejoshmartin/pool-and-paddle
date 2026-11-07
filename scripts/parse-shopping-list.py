#!/usr/bin/env python3
"""
Parse the Pool & Paddle Master Shopping List → src/shopping-seed.json.

Usage:
  python3 scripts/parse-shopping-list.py <master-list.csv> [--out src/shopping-seed.json] [--check]

Input:  a CSV export of the Master List tab (File → Download → CSV in Sheets / Excel). Plain CSV on
        purpose: no spreadsheet library to install.
Output: {"generatedFrom": ..., "items": [...]} in the same shape as scripts/build-shopping-seed.mjs.
        Items carry only the fields the sheet provides; the app fills every other field with its
        defaults (normalizeShoppingItem), and saved edits always win over the seed (mergeShopping), so
        re-running this never overwrites decisions already made in the app.
--check validates the file and prints a summary without writing anything.

Columns (header names are case-insensitive; several aliases are accepted):
  Item ID / ID           stable id (kept; blank → "sh-seed-<slug of item name>")
  Item / Name            required
  Category               required, one of CATEGORIES below
  Zone                   indoor | outdoor | both (blank → both)
  Room
  Final qty / Qty        the quantity to buy (becomes a fixed qtyRule)
  Quality tier           Premium | Value  → qualityTier (extra field the research agent reads)
  Requirements           → requirements   (extra field)
  Kerry decides          yes/true/y/1     → kerryDecides (extra field)
  Priority               launch-critical | launch | nice-to-have (blank → launch)
  Notes
  Uses per guest per day (blank for non-dishware) → usesPerGuestPerDay; the item name (minus any
                         trailing "(indoor)"/"(outdoor)") becomes dishType, so indoor + outdoor sets combine
  Qty per guest / per bedroom / per bathroom (optional) → a scaling qtyRule instead of a fixed quantity
                         (so the quantity follows the guest count); Final qty is then only the starting estimate

Exit status is non-zero (and the row number printed) if any row is invalid.
"""
import argparse
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "src" / "shopping-seed.json"

# Keep in sync with SHOPPING_CATEGORIES in src/lib/shopping-logic.js (a unit test compares them).
CATEGORIES = [
    "Small Appliances", "Cookware & Bakeware", "Dinnerware", "Flatware", "Glassware & Drinkware",
    "Serveware & Entertaining", "Kitchen Tools & Utensils", "Food Storage", "Bar & Coffee",
    "Outdoor / Pool Dining", "Linens & Towels", "Bath", "Cleaning & Laundry", "Supplies & Consumables",
    "Game Room & Recreation", "Furniture", "Electronics & Tech", "Safety & First Aid", "Other",
]
ZONES = ["indoor", "outdoor", "both"]
PRIORITIES = ["launch-critical", "launch", "nice-to-have"]

ALIASES = {
    "id": ["item id", "id"],
    "name": ["item", "name", "item name"],
    "category": ["category"],
    "zone": ["zone"],
    "room": ["room"],
    "qty": ["final qty", "qty", "quantity", "final quantity"],
    "tier": ["quality tier", "tier"],
    "requirements": ["requirements", "requirement"],
    "kerry": ["kerry decides", "kerry-decides", "kerry decides?"],
    "priority": ["priority"],
    "notes": ["notes", "note"],
    "uses": ["uses per guest per day", "uses/guest/day", "uses per guest"],
    "per_guest": ["qty per guest", "per guest", "multiplier", "qty per guest (multiplier)"],
    "per_bedroom": ["qty per bedroom", "per bedroom"],
    "per_bathroom": ["qty per bathroom", "per bathroom"],
}


def slugify(text):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")


def dish_type(name):
    return re.sub(r"\s*\((indoor|outdoor|both)\)\s*$", "", name, flags=re.IGNORECASE).strip()


def number(text):
    text = (text or "").strip().replace(",", "")
    if text == "":
        return None
    return float(text)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv_path")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--check", action="store_true", help="validate only; write nothing")
    args = ap.parse_args()

    with open(args.csv_path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        headers = {h.strip().lower(): h for h in (reader.fieldnames or [])}

        def col(key):
            for alias in ALIASES[key]:
                if alias in headers:
                    return headers[alias]
            return None

        cols = {k: col(k) for k in ALIASES}
        if not cols["name"] or not cols["category"]:
            print("error: the CSV needs at least 'Item' and 'Category' columns", file=sys.stderr)
            return 2

        def get(row, key):
            c = cols[key]
            return (row.get(c) or "").strip() if c else ""

        items, errors, seen = [], [], set()
        for n, row in enumerate(reader, start=2):  # row 1 is the header
            if not any((v or "").strip() for v in row.values()):
                continue
            name = get(row, "name")
            category = get(row, "category")
            if not name:
                errors.append(f"row {n}: missing item name")
                continue
            if category not in CATEGORIES:
                errors.append(f"row {n}: invalid category {category!r} (must be one of the app's categories)")
                continue
            zone = get(row, "zone").lower() or "both"
            if zone not in ZONES:
                errors.append(f"row {n}: invalid zone {zone!r}")
                continue
            priority = get(row, "priority").lower() or "launch"
            if priority not in PRIORITIES:
                errors.append(f"row {n}: invalid priority {priority!r}")
                continue
            try:
                qty = number(get(row, "qty"))
                uses = number(get(row, "uses"))
                per = {b: number(get(row, k)) for b, k in (("guests", "per_guest"), ("bedrooms", "per_bedroom"), ("bathrooms", "per_bathroom"))}
            except ValueError:
                errors.append(f"row {n}: quantity / uses-per-guest must be numbers")
                continue
            master_id = get(row, "id")
            item_id = "sh-seed-" + slugify(master_id) if master_id else "sh-seed-" + slugify(name)
            if item_id in seen or not re.fullmatch(r"sh-seed-[a-z0-9-]+", item_id):
                errors.append(f"row {n}: duplicate or invalid id {item_id!r}")
                continue
            seen.add(item_id)
            scaled = next(((b, v) for b, v in per.items() if v is not None), None)
            rule = (
                {"basis": scaled[0], "multiplier": scaled[1], "fixedQty": 0} if scaled
                else {"basis": "fixed", "multiplier": 1, "fixedQty": qty if qty is not None else 0}
            )
            item = {
                "id": item_id, "name": name, "category": category, "zone": zone, "room": get(row, "room"),
                "qtyRule": rule,
                "qtyNeeded": qty if qty is not None else 0,
                "priority": priority, "status": "researching", "notes": get(row, "notes"),
                "userCreated": False, "proposed": False,
            }
            if master_id:
                item["masterId"] = master_id   # the research agent keys its rows by this Item ID
            if uses is not None:
                item["usesPerGuestPerDay"] = uses
                item["dishType"] = dish_type(name)
            tier = get(row, "tier")
            if tier:
                item["qualityTier"] = tier
            if get(row, "requirements"):
                item["requirements"] = get(row, "requirements")
            if cols["kerry"]:
                item["kerryDecides"] = get(row, "kerry").lower() in ("yes", "y", "true", "1", "x")
            items.append(item)

    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"{len(errors)} invalid row(s); nothing written.", file=sys.stderr)
        return 1
    print(f"{len(items)} item(s) OK")
    if args.check:
        return 0
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(
        json.dumps({"generatedFrom": f"master list: {Path(args.csv_path).name} (scripts/parse-shopping-list.py)", "items": items}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
