# Diagrams

| File | Content |
|------|---------|
| `ERD.drawio` | **Editable source** (diagrams.net XML, uncompressed). 5 pages: 0 Overview · 1 Core & users · 2 Products, suppliers & purchasing · 3 Orders, payments & returns · 4 Inventory & audit |
| `ERD.svg`, `ERD.png` | Export of page 0 (database overview) |
| `ERD-1-core.*`, `ERD-2-catalog-purchasing.*`, `ERD-3-sales-payments-returns.*`, `ERD-4-inventory-audit.*` | Exports of the detail pages |
| `order-flow.mmd` | Mermaid sequence diagram of the order / payment / return flow |

Notation: Crow's Foot. PK/FK/UK markers, PostgreSQL types, NULL marker per column; a legend is on every page.

## Regenerating after a schema change

The ERD is generated from `backend/prisma/schema.prisma` so it cannot drift from the schema. Positions and page membership are in `scripts/erd/layout.mjs`.

```bash
node scripts/erd/generate-erd.mjs          # rewrites docs/diagrams/ERD.drawio
```

If you hand-edit `ERD.drawio` in diagrams.net, port layout changes back to `layout.mjs`, otherwise the next regeneration overwrites them.

## Exporting SVG / PNG

draw.io desktop CLI (if installed):

```bash
drawio -x -f svg -p 1 -b 20 -o docs/diagrams/ERD.svg docs/diagrams/ERD.drawio
drawio -x -f png -p 1 -b 20 -s 1.5 -o docs/diagrams/ERD.png docs/diagrams/ERD.drawio
```

Without a local install, via Docker (this is how the committed exports were produced; pages are 1-based):

```bash
# from the repository root (Git Bash on Windows: prefix with MSYS_NO_PATHCONV=1)
pages=(overview 1-core 2-catalog-purchasing 3-sales-payments-returns 4-inventory-audit)
for i in 1 2 3 4 5; do
  name=${pages[$((i-1))]}; base="ERD-$name"; [ $i = 1 ] && base="ERD"
  docker run --rm --shm-size=2g -v "$PWD/docs/diagrams:/data" rlespinasse/drawio-desktop-headless \
    -x -f svg -b 20 -p $i -o /data/$base.svg /data/ERD.drawio
  docker run --rm --shm-size=2g -v "$PWD/docs/diagrams:/data" rlespinasse/drawio-desktop-headless \
    -x -f png -s 1.5 -b 20 -p $i -o /data/$base.png /data/ERD.drawio
done
```

`--shm-size=2g` is required; with Docker's default 64 MB the Electron renderer crashes on the larger pages.

Manual alternative: open `ERD.drawio` at https://app.diagrams.net → *File → Export as → SVG/PNG* → select the page.
