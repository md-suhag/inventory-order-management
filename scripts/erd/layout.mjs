// Page membership and positions for the generated ERD. Contents come from schema.prisma.
// Column grid: x = 40 / 480 / 920 / 1360 / 1800 (table width 386, gutters for relationship lines).
const C = [40, 480, 920, 1360, 1800];

export const GROUP_COLORS = {
  core: { head: '#DCE8F7', stroke: '#3A6EA5', font: '#1B3A5C', bg: '#F3F7FC' },
  catalog: { head: '#DFF0E3', stroke: '#3C8D5A', font: '#1F4D2F', bg: '#F4FAF5' },
  sales: { head: '#FCE8D5', stroke: '#C2702A', font: '#6B3A10', bg: '#FDF7F1' },
  inventory: { head: '#ECE3F5', stroke: '#7651A8', font: '#3F2565', bg: '#F8F5FC' },
  stub: { head: '#F0F0F0', stroke: '#9AA0A6', font: '#555555', bg: '#FFFFFF' },
};

const actorEdgeOnlyInCore = (r) =>
  r.parent === 'users' && !['users', 'refresh_tokens', 'password_reset_tokens', 'business_settings'].includes(r.child);

export const PAGES = [
  {
    name: 'overview',
    title: '0 · Database Overview',
    subtitle: 'All 25 tables, key columns only. Actor FKs (created_by / performed_by / recorded_by …) to users are labelled inline instead of drawn.',
    skipEdge: actorEdgeOnlyInCore,
    groups: [
      { group: 'core', label: 'Core · Identity, Access & Configuration', x: 20, y: 70, w: 846, h: 680 },
      { group: 'inventory', label: 'Inventory & Audit History', x: 900, y: 70, w: 846, h: 300 },
      { group: 'catalog', label: 'Catalog, Suppliers & Purchasing', x: 20, y: 780, w: 1726, h: 420 },
      { group: 'sales', label: 'Sales, Payments & Returns', x: 20, y: 1240, w: 1726, h: 600 },
    ],
    layout: [
      { table: 'permissions', x: C[0], y: 110, mode: 'compact', group: 'core' },
      { table: 'roles', x: C[0], y: 220, mode: 'compact', group: 'core' },
      { table: 'business_settings', x: C[0], y: 350, mode: 'compact', group: 'core' },
      { table: 'document_sequences', x: C[0], y: 480, mode: 'compact', group: 'core' },
      { table: 'role_permissions', x: C[1], y: 110, mode: 'compact', group: 'core' },
      { table: 'users', x: C[1], y: 240, mode: 'compact', group: 'core' },
      { table: 'refresh_tokens', x: C[1], y: 420, mode: 'compact', group: 'core' },
      { table: 'password_reset_tokens', x: C[1], y: 590, mode: 'compact', group: 'core' },

      { table: 'inventory_movements', x: C[2], y: 110, mode: 'compact', group: 'inventory' },
      { table: 'audit_logs', x: C[3], y: 110, mode: 'compact', group: 'inventory' },

      { table: 'categories', x: C[0], y: 820, mode: 'compact', group: 'catalog' },
      { table: 'product_images', x: C[0], y: 950, mode: 'compact', group: 'catalog' },
      { table: 'suppliers', x: C[0], y: 1080, mode: 'compact', group: 'catalog' },
      { table: 'products', x: C[1], y: 820, mode: 'compact', group: 'catalog' },
      { table: 'purchases', x: C[1], y: 1000, mode: 'compact', group: 'catalog' },
      { table: 'purchase_items', x: C[2], y: 820, mode: 'compact', group: 'catalog' },
      { table: 'purchase_receipts', x: C[2], y: 1000, mode: 'compact', group: 'catalog' },
      { table: 'purchase_receipt_items', x: C[3], y: 820, mode: 'compact', group: 'catalog' },

      { table: 'customers', x: C[0], y: 1280, mode: 'compact', group: 'sales' },
      { table: 'payment_methods', x: C[0], y: 1390, mode: 'compact', group: 'sales' },
      { table: 'orders', x: C[1], y: 1280, mode: 'compact', group: 'sales' },
      { table: 'payments', x: C[1], y: 1560, mode: 'compact', group: 'sales' },
      { table: 'order_items', x: C[2], y: 1280, mode: 'compact', group: 'sales' },
      { table: 'sales_returns', x: C[2], y: 1440, mode: 'compact', group: 'sales' },
      { table: 'sales_return_items', x: C[3], y: 1280, mode: 'compact', group: 'sales' },
    ],
    legend: { x: C[4], y: 110 },
  },
  {
    name: 'core',
    title: '1 · Core Business & User Management',
    subtitle: 'Users, roles/permissions (M:N via role_permissions), sessions, password resets, business configuration.',
    layout: [
      { table: 'permissions', x: C[0], y: 80, group: 'core' },
      { table: 'roles', x: C[0], y: 260, group: 'core' },
      { table: 'business_settings', x: C[0], y: 480, group: 'core' },
      { table: 'role_permissions', x: C[1], y: 80, group: 'core' },
      { table: 'users', x: C[1], y: 260, group: 'core' },
      { table: 'document_sequences', x: C[1], y: 700, group: 'core' },
      { table: 'refresh_tokens', x: C[2], y: 80, group: 'core' },
      { table: 'password_reset_tokens', x: C[2], y: 420, group: 'core' },
    ],
    legend: { x: C[3], y: 80 },
    notes: {
      x: C[3], y: 360, h: 150,
      html: '<b>Notes</b><br>• roles ⟷ permissions is many-to-many, resolved by role_permissions (composite PK).<br>• refresh_tokens.replaced_by_token_id is a 1:1 self-reference forming the rotation chain; family_id groups one login session.<br>• business_settings is a singleton (CHECK id = 1).<br>• Users are never hard-deleted (deactivated), so actor FKs elsewhere use ON DELETE RESTRICT.',
    },
  },
  {
    name: 'catalog-purchasing',
    title: '2 · Products, Suppliers & Purchasing',
    subtitle: 'Catalog, suppliers, purchase orders, line items and partial goods receipts.',
    layout: [
      { table: 'categories', x: C[0], y: 80, group: 'catalog' },
      { table: 'product_images', x: C[0], y: 300, group: 'catalog' },
      { table: 'suppliers', x: C[0], y: 600, group: 'catalog' },
      { table: 'products', x: C[1], y: 80, group: 'catalog' },
      { table: 'purchases', x: C[1], y: 520, group: 'catalog' },
      { table: 'purchase_items', x: C[2], y: 80, group: 'catalog' },
      { table: 'purchase_receipts', x: C[2], y: 520, group: 'catalog' },
      { table: 'purchase_receipt_items', x: C[3], y: 80, group: 'catalog' },
    ],
    legend: { x: C[3], y: 300 },
    notes: {
      x: C[3], y: 580, h: 170,
      html: '<b>Notes</b><br>• UNIQUE (purchase_id, product_id) and (purchase_id, line_no) on purchase_items.<br>• UNIQUE (receipt_id, purchase_item_id) on purchase_receipt_items.<br>• CHECK 0 ≤ received_quantity ≤ quantity prevents over-receiving.<br>• purchase_receipts / purchase_receipt_items are append-only (trigger).<br>• product_name / product_sku are historical snapshots.',
    },
  },
  {
    name: 'sales-payments-returns',
    title: '3 · Orders, Payments & Returns',
    subtitle: 'Customer orders with price/tax snapshots, the payment ledger (orders and purchases), sales returns.',
    layout: [
      { table: 'customers', x: C[0], y: 80, group: 'sales' },
      { table: 'payment_methods', x: C[0], y: 860, group: 'sales' },
      { table: 'purchases', x: C[0], y: 1100, mode: 'stub', note: 'detailed on page 2' },
      { table: 'orders', x: C[1], y: 80, group: 'sales' },
      { table: 'payments', x: C[1], y: 860, group: 'sales' },
      { table: 'order_items', x: C[2], y: 80, group: 'sales' },
      { table: 'sales_returns', x: C[2], y: 520, group: 'sales' },
      { table: 'sales_return_items', x: C[3], y: 80, group: 'sales' },
      { table: 'products', x: C[3], y: 360, mode: 'stub', note: 'detailed on page 2' },
    ],
    legend: { x: C[3], y: 520 },
    notes: {
      x: C[3], y: 800, h: 190,
      html: '<b>Notes</b><br>• payments targets exactly one of order_id / purchase_id (CHECK num_nonnulls = 1).<br>• payments.reversed_payment_id: 1:1 self-reference; a payment can be reversed once.<br>• payments is append-only; corrections are REVERSAL rows.<br>• customer_id NULL = walk-in customer; customer_* columns are billing snapshots.<br>• UNIQUE (order_id, product_id), (order_id, line_no) on order_items; (sales_return_id, order_item_id) on sales_return_items.',
    },
  },
  {
    name: 'inventory-audit',
    title: '4 · Inventory & Audit History',
    subtitle: 'Append-only stock ledger and audit trail.',
    layout: [
      { table: 'products', x: C[0], y: 80, mode: 'stub', note: 'detailed on page 2' },
      { table: 'purchase_receipts', x: C[0], y: 200, mode: 'stub', note: 'detailed on page 2' },
      { table: 'orders', x: C[0], y: 320, mode: 'stub', note: 'detailed on page 3' },
      { table: 'sales_returns', x: C[0], y: 440, mode: 'stub', note: 'detailed on page 3' },
      { table: 'inventory_movements', x: C[1], y: 80, group: 'inventory' },
      { table: 'users', x: C[2], y: 80, mode: 'stub', note: 'detailed on page 1' },
      { table: 'audit_logs', x: C[3], y: 80, group: 'inventory' },
    ],
    legend: { x: C[3], y: 380 },
    notes: {
      x: C[1], y: 500, w: 780, h: 160,
      html: '<b>inventory_movements rules (CHECK constraints)</b><br>• resulting_stock = previous_stock + quantity_change; both ≥ 0; quantity_change ≠ 0.<br>• Sign by type: SALE, ADJUSTMENT_OUT &lt; 0; all other types &gt; 0.<br>• Exactly the reference FK matching the type is set (receipt / order / return); OPENING_STOCK and adjustments have none.<br>• adjustment_reason required iff type is ADJUSTMENT_IN/OUT; reason OTHER requires notes.<br>• UNIQUE (order_id, product_id, type), (purchase_receipt_id, product_id), (sales_return_id, product_id) give DB-level exactly-once stock effects.<br>• inventory_movements and audit_logs reject UPDATE/DELETE (trigger).',
    },
  },
];
