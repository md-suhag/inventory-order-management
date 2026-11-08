#!/usr/bin/env node
/**
 * Generates docs/diagrams/ERD.drawio (multi-page, editable diagrams.net XML)
 * from backend/prisma/schema.prisma, so the ERD cannot drift from the schema.
 *
 *   node scripts/erd/generate-erd.mjs
 *
 * Table contents, PK/FK/UK markers, PostgreSQL types, nullability and crow's
 * foot cardinalities are all derived from the schema. Only positions and page
 * membership live in ./layout.mjs. Re-run after every schema change, then
 * re-export SVG/PNG (see docs/diagrams/README.md).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, GROUP_COLORS } from './layout.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const schemaSrc = readFileSync(resolve(root, 'backend/prisma/schema.prisma'), 'utf8');

// ---------------------------------------------------------------------------
// 1. Parse schema.prisma
// ---------------------------------------------------------------------------
const blocks = [...schemaSrc.matchAll(/^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
const enumNames = new Set(blocks.filter((b) => b[1] === 'enum').map((b) => b[2]));
const modelNames = new Set(blocks.filter((b) => b[1] === 'model').map((b) => b[2]));

const SCALAR_PG = {
  String: 'text', Int: 'integer', BigInt: 'bigint', Boolean: 'boolean',
  DateTime: 'timestamp(3)', Decimal: 'numeric', Json: 'jsonb', Float: 'float8',
};
function pgType(type, attrs) {
  const db = attrs.match(/@db\.(\w+)(?:\(([^)]*)\))?/);
  if (enumNames.has(type)) return type; // PostgreSQL enum type of the same name
  if (!db) return SCALAR_PG[type];
  const [, t, args] = db;
  const a = args?.replace(/\s/g, '');
  switch (t) {
    case 'Uuid': return 'uuid';
    case 'VarChar': return `varchar(${a})`;
    case 'Char': return `char(${a})`;
    case 'Text': return 'text';
    case 'Decimal': return `numeric(${a})`;
    case 'Timestamptz': return 'timestamptz';
    case 'Date': return 'date';
    case 'JsonB': return 'jsonb';
    default: return t.toLowerCase();
  }
}

const models = {}; // prismaName -> { table, columns[], relations[] }
for (const [, kind, name, body] of blocks) {
  if (kind !== 'model') continue;
  const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name;
  const compositeId = body.match(/@@id\(\[([^\]]+)\]/)?.[1].split(',').map((s) => s.trim()) ?? [];
  const singleUniques = [...body.matchAll(/@@unique\(\[([^\]]+)\]/g)]
    .map((m) => m[1].split(',').map((s) => s.trim()))
    .filter((f) => f.length === 1).map((f) => f[0]);
  const fields = [];
  const relations = [];
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    const m = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
    if (!m || line.startsWith('@@')) continue;
    const [, fname, ftype, isList, optional, attrs] = m;
    if (modelNames.has(ftype)) {
      const rel = attrs.match(/fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]/);
      if (rel) relations.push({ fkField: rel[1].trim(), parentModel: ftype, refField: rel[2].trim() });
      continue;
    }
    if (isList) continue;
    fields.push({
      field: fname,
      column: attrs.match(/@map\("([^"]+)"\)/)?.[1] ?? fname,
      type: pgType(ftype, attrs),
      nullable: Boolean(optional),
      pk: /@id\b/.test(attrs) || compositeId.includes(fname),
      uk: /@unique\b/.test(attrs) || singleUniques.includes(fname),
    });
  }
  models[name] = { name, table, fields, relations };
}
const byTable = Object.fromEntries(Object.values(models).map((m) => [m.table, m]));

// Resolve relations to table/column level.
const RELS = [];
for (const m of Object.values(models)) {
  for (const r of m.relations) {
    const fk = m.fields.find((f) => f.field === r.fkField);
    const parent = models[r.parentModel];
    const ref = parent.fields.find((f) => f.field === r.refField);
    fk.fk = parent.table;
    RELS.push({
      child: m.table, childCol: fk.column, parent: parent.table, parentCol: ref.column,
      optional: fk.nullable, oneToOne: fk.uk && !fk.pk,
    });
  }
}

// Business-rule cardinality: header documents that must have ≥1 line (enforced in services).
const MANDATORY_CHILDREN = new Set([
  'purchases>purchase_items', 'orders>order_items', 'purchase_receipts>purchase_receipt_items',
  'sales_returns>sales_return_items',
]);

// ---------------------------------------------------------------------------
// 2. drawio XML helpers
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ROW_H = 22, HEAD_H = 30;
const COLS = [{ w: 40 }, { w: 160 }, { w: 146 }, { w: 40 }];
const TABLE_W = COLS.reduce((s, c) => s + c.w, 0);
const FONT = 'fontFamily=Helvetica;fontSize=11;';

let seq = 0;
const nid = (p) => `${p}-${++seq}`;

function keyLabel(f) {
  const k = [];
  if (f.pk) k.push('PK');
  if (f.fk) k.push('FK');
  if (f.uk && !f.pk) k.push('UK');
  return k.join(',');
}

function cell(id, parent, value, x, w, style) {
  return `<mxCell id="${id}" value="${esc(value)}" style="shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;overflow=hidden;whiteSpace=wrap;html=1;${FONT}${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" width="${w}" height="${ROW_H}" as="geometry"><mxRectangle width="${w}" height="${ROW_H}" as="alternateBounds"/></mxGeometry></mxCell>`;
}

/**
 * Renders one table. mode: 'full' (all columns), 'compact' (keys only + count),
 * 'stub' (reference to a table detailed on another page).
 * Returns { xml, rowIds: {column -> rowCellId}, id }.
 */
function renderTable(tableName, { x, y, mode = 'full', group, note }, page) {
  const model = byTable[tableName];
  if (!model) throw new Error(`Unknown table in layout: ${tableName}`);
  const colors = GROUP_COLORS[mode === 'stub' ? 'stub' : group];
  let fields = model.fields;
  let hidden = 0;
  if (mode === 'compact') {
    fields = model.fields.filter((f) => f.pk || f.fk || f.uk);
    hidden = model.fields.length - fields.length;
  } else if (mode === 'stub') {
    fields = model.fields.filter((f) => f.pk);
  }
  const rows = fields.length + (hidden ? 1 : 0) + (mode === 'stub' ? 1 : 0);
  const id = nid(`t-${tableName}`);
  const title = tableName;
  const tableStyle = [
    'shape=table;startSize=30;container=1;collapsible=0;childLayout=tableLayout;fixedRows=1;rowLines=0;',
    'fontStyle=1;align=center;resizeLast=1;html=1;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;',
    `fillColor=${colors.head};strokeColor=${colors.stroke};fontColor=${colors.font};swimlaneFillColor=#FFFFFF;`,
    mode === 'stub' ? 'dashed=1;' : '', 'arcSize=4;rounded=1;',
  ].join('');
  let xml = `<mxCell id="${id}" value="${esc(title)}" style="${tableStyle}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${TABLE_W}" height="${HEAD_H + rows * ROW_H}" as="geometry"/></mxCell>`;
  const rowIds = {};
  let ry = HEAD_H;
  const addRow = (cells, opts = {}) => {
    const rid = nid('r');
    const sep = opts.separator ? 'bottom=1;' : 'bottom=0;';
    xml += `<mxCell id="${rid}" value="" style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;${sep}strokeColor=${colors.stroke};html=1;" vertex="1" parent="${id}"><mxGeometry y="${ry}" width="${TABLE_W}" height="${ROW_H}" as="geometry"/></mxCell>`;
    let cx = 0;
    cells.forEach((c, i) => {
      xml += cell(nid('c'), rid, c.v, cx, COLS[i].w, c.s);
      cx += COLS[i].w;
    });
    ry += ROW_H;
    return rid;
  };
  const pkCount = fields.filter((f) => f.pk).length;
  fields.forEach((f, idx) => {
    // FK whose parent is not drawn on this page: show the target inline.
    const offPageFk = f.fk && (!page.tables.has(f.fk) || page.suppressed.has(`${tableName}.${f.column}`));
    const type = offPageFk ? `${f.type} → ${f.fk}` : f.type;
    const isKeyRow = f.pk;
    rowIds[f.column] = addRow([
      { v: keyLabel(f), s: `align=center;fontStyle=1;fontColor=${f.pk ? '#B8860B' : f.fk ? '#1F5FAD' : '#7A3E9D'};` },
      { v: f.column, s: `align=left;spacingLeft=4;${isKeyRow ? 'fontStyle=5;' : f.fk ? 'fontStyle=0;' : ''}` },
      { v: type, s: `align=left;spacingLeft=2;fontColor=${offPageFk ? '#1F5FAD' : '#333333'};${offPageFk ? 'fontSize=10;' : ''}` },
      { v: f.nullable ? 'NULL' : '', s: 'align=center;fontColor=#999999;fontStyle=2;fontSize=9;' },
    ], { separator: idx === pkCount - 1 && fields.length > pkCount });
  });
  if (hidden) {
    addRow([{ v: '', s: '' }, { v: `+ ${hidden} more columns`, s: 'align=left;spacingLeft=4;fontStyle=2;fontColor=#888888;fontSize=10;' }, { v: '', s: '' }, { v: '', s: '' }]);
  }
  if (mode === 'stub') {
    addRow([{ v: '', s: '' }, { v: note ?? 'see detail page', s: 'align=left;spacingLeft=4;fontStyle=2;fontColor=#888888;fontSize=10;' }, { v: '', s: '' }, { v: '', s: '' }]);
  }
  return { xml, rowIds, id };
}

function edge(rel, src, dst) {
  const childKey = `${rel.parent}>${rel.child}`;
  const parentEnd = rel.optional ? 'ERzeroToOne' : 'ERmandOne';
  const childEnd = rel.oneToOne ? 'ERzeroToOne' : MANDATORY_CHILDREN.has(childKey) ? 'ERoneToMany' : 'ERzeroToMany';
  const self = rel.parent === rel.child;
  const style = [
    self ? 'edgeStyle=orthogonalEdgeStyle;' : 'edgeStyle=entityRelationEdgeStyle;',
    `startArrow=${parentEnd};endArrow=${childEnd};startFill=0;endFill=0;startSize=10;endSize=10;`,
    'rounded=0;html=1;strokeColor=#5F6B7A;strokeWidth=1.2;',
    self ? 'exitX=1;exitY=0.5;entryX=1;entryY=0.5;' : '',
  ].join('');
  const id = nid('e');
  const pts = self ? '<Array as="points"></Array>' : '';
  return `<mxCell id="${id}" value="" style="${style}" edge="1" parent="1" source="${src}" target="${dst}"><mxGeometry relative="1" as="geometry">${pts}</mxGeometry></mxCell>`;
}

function textBox(id, value, x, y, w, h, style) {
  return `<mxCell id="${id}" value="${esc(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
}

function legend(x, y) {
  const html = [
    '<b>Notation</b> (Crow\'s Foot)<br>',
    '<b>PK</b> primary key &nbsp; <b>FK</b> foreign key &nbsp; <b>UK</b> unique<br>',
    '<u>underlined</u> = primary-key column<br>',
    '<i>NULL</i> = nullable column (blank = NOT NULL)<br>',
    '<span style="color:#1F5FAD">type → table</span> = FK whose line is not drawn here<br>',
    'Dashed table = reference stub (detailed on another page)<br><br>',
    '<b>Line ends</b><br>',
    '┤├ exactly one &nbsp;&nbsp; o┤ zero or one<br>',
    'o&lt; zero or many &nbsp;&nbsp; ┤&lt; one or many<br><br>',
    'Composite / multi-column UNIQUE constraints, CHECK<br>',
    'constraints and append-only triggers are listed in<br>',
    'docs/database/DATABASE_DESIGN.md.',
  ].join('');
  return textBox(nid('legend'), html, x, y, 340, 250,
    'rounded=1;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacing=10;fontFamily=Helvetica;fontSize=11;fillColor=#FAFAFA;strokeColor=#C8CDD3;arcSize=3;');
}

// ---------------------------------------------------------------------------
// 3. Build pages
// ---------------------------------------------------------------------------
const diagrams = [];
for (const page of PAGES) {
  page.tables = new Set(page.layout.map((t) => t.table));
  page.suppressed = new Set(RELS.filter((r) => page.skipEdge?.(r)).map((r) => `${r.child}.${r.childCol}`));
  let xml = '<mxCell id="0"/><mxCell id="1" parent="0"/>';
  xml += textBox(nid('title'), `<b style="font-size:20px">${esc(page.title)}</b><br><span style="color:#666">${esc(page.subtitle)}</span>`,
    40, 10, 1400, 50, 'text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontFamily=Helvetica;fontSize=12;');
  for (const g of page.groups ?? []) {
    const c = GROUP_COLORS[g.group];
    xml += textBox(nid('grp'), `<b>${esc(g.label)}</b>`, g.x, g.y, g.w, g.h,
      `rounded=1;arcSize=2;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacing=10;fontFamily=Helvetica;fontSize=13;fontColor=${c.stroke};fillColor=${c.bg};strokeColor=${c.stroke};dashed=1;opacity=60;`);
  }
  const rendered = {};
  for (const t of page.layout) {
    const r = renderTable(t.table, t, page);
    rendered[t.table] = r;
    xml += r.xml;
  }
  for (const rel of RELS) {
    if (!rendered[rel.parent] || !rendered[rel.child]) continue;
    if (page.skipEdge?.(rel)) continue;
    if (page.layout.find((l) => l.table === rel.child).mode === 'stub') continue; // stubs show no FK columns
    const src = rendered[rel.parent].rowIds[rel.parentCol];
    const dst = rendered[rel.child].rowIds[rel.childCol];
    if (!src || !dst) throw new Error(`Missing row for ${rel.child}.${rel.childCol} -> ${rel.parent}.${rel.parentCol} on ${page.name}`);
    xml += edge(rel, src, dst);
  }
  if (page.legend) xml += legend(page.legend.x, page.legend.y);
  if (page.notes) {
    xml += textBox(nid('note'), page.notes.html, page.notes.x, page.notes.y, page.notes.w ?? 340, page.notes.h ?? 120,
      'rounded=1;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacing=10;fontFamily=Helvetica;fontSize=11;fillColor=#FFF8E1;strokeColor=#E0C068;arcSize=3;');
  }
  diagrams.push(`<diagram id="${page.name}" name="${esc(page.title)}"><mxGraphModel dx="1600" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0"><root>${xml}</root></mxGraphModel></diagram>`);
}

// Sanity: every table appears on at least one non-overview page in full mode.
for (const t of Object.keys(byTable)) {
  const full = PAGES.some((p) => p.name !== 'overview' && p.layout.some((l) => l.table === t && (l.mode ?? 'full') === 'full'));
  if (!full) throw new Error(`Table ${t} is not detailed on any page`);
}

const out = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="scripts/erd/generate-erd.mjs" version="24.0.0" compressed="false">\n${diagrams.join('\n')}\n</mxfile>\n`;
writeFileSync(resolve(root, 'docs/diagrams/ERD.drawio'), out);
console.log(`ERD.drawio written: ${PAGES.length} pages, ${Object.keys(byTable).length} tables, ${RELS.length} relationships.`);
