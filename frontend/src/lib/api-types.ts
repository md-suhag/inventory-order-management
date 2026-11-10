import type { Permission } from './permissions';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  requestId?: string;
}

export interface RoleRef {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  role: RoleRef;
}

export interface CurrentUser extends User {
  permissions: Permission[];
}

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface SessionResponse extends TokenPair {
  user: User;
}

export interface PermissionInfo {
  key: Permission;
  module: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export type RecordStatus = 'ACTIVE' | 'ARCHIVED';
export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type StockState = 'IN_STOCK' | 'LOW' | 'OUT';
export type PurchaseStatus = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
export type PaymentType = 'PAYMENT' | 'REFUND' | 'REVERSAL';
export type MovementType =
  | 'OPENING_STOCK'
  | 'PURCHASE_RECEIPT'
  | 'SALE'
  | 'SALE_CANCELLATION'
  | 'SALE_RETURN'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';
export type AdjustmentReason = 'COUNT_CORRECTION' | 'DAMAGED' | 'EXPIRED' | 'LOST' | 'STOLEN' | 'FOUND' | 'OTHER';
export type SalesReturnStatus = 'PENDING' | 'COMPLETED' | 'REJECTED';
export type ReturnCondition = 'RESALABLE' | 'DAMAGED';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  status: RecordStatus;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: string;
}

export interface ProductMovementSummary {
  id: string;
  type: MovementType;
  quantityChange: number;
  previousStock: number;
  resultingStock: number;
  unitCost?: string;
  adjustmentReason: AdjustmentReason | null;
  notes: string | null;
  createdAt: string;
  performedBy: { id: string; name: string };
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  costPrice?: string;
  sellingPrice: string;
  taxRate: string | null;
  stockQuantity: number;
  reorderLevel: number | null;
  lowStockThreshold: number;
  stockState: StockState;
  status: ProductStatus;
  category: { id: string; name: string; status: RecordStatus } | null;
  primaryImageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetail extends Product {
  images: ProductImage[];
  recentMovements: ProductMovementSummary[];
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierDetail extends Supplier {
  summary: {
    purchaseCount: number;
    totalPurchased: string;
    totalPaid: string;
    outstandingBalance: string;
  };
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail extends Customer {
  summary: {
    orderCount: number;
    totalSales: string;
    totalPaid: string;
    outstandingBalance: string;
  };
}

export interface PurchaseListItem {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseStatus;
  paymentStatus: PaymentStatus;
  supplierReference: string | null;
  expectedDeliveryDate: string | null;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  itemCount: number;
  orderedAt: string | null;
  createdAt: string;
}

export interface PurchaseItem {
  id: string;
  productId: string;
  lineNo: number;
  productName: string;
  productSku: string;
  quantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  unitCost: string;
  discountAmount: string;
  allocatedDiscount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
}

export interface PurchaseReceiptItem {
  id: string;
  purchaseItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitCost: string;
}

export interface PurchaseReceipt {
  id: string;
  receiptNumber: string;
  receivedAt: string;
  notes: string | null;
  idempotencyKey: string | null;
  receivedBy: { id: string; name: string; email?: string } | null;
  items: PurchaseReceiptItem[];
}

export interface PurchaseDetail {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  status: PurchaseStatus;
  paymentStatus: PaymentStatus;
  supplierReference: string | null;
  expectedDeliveryDate: string | null;
  subtotal: string;
  discountType: 'FIXED' | 'PERCENTAGE' | null;
  discountValue: string | null;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  refundedAmount: string;
  balanceDue: string;
  notes: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: {
    id: string;
    name: string;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
    status: string;
  };
  createdBy: { id: string; name: string } | null;
  items: PurchaseItem[];
  receipts: PurchaseReceipt[];
}

export interface InventoryProductItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  status: ProductStatus;
  category: { id: string; name: string } | null;
  stockQuantity: number;
  reorderLevel: number | null;
  lowStockThreshold: number;
  stockState: StockState;
  costPrice?: string;
  stockValue?: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  type: MovementType;
  quantityChange: number;
  previousStock: number;
  resultingStock: number;
  unitCost?: string;
  referenceNumber: string | null;
  adjustmentReason: AdjustmentReason | null;
  notes: string | null;
  performedBy: { id: string; name: string; email?: string } | null;
  createdAt: string;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  itemCount: number;
  confirmedAt: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  lineNo: number;
  productName: string;
  productSku: string;
  unit: string;
  quantity: number;
  unitPrice: string;
  unitCost: string | null;
  discountAmount: string;
  allocatedDiscount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
}

export interface PaymentDetail {
  id: string;
  paymentNumber: string;
  type: PaymentType;
  orderId: string | null;
  purchaseId: string | null;
  salesReturnId?: string | null;
  amount: string;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  reversedPaymentId: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  paymentMethod: { id: string; code: string; name: string };
  recordedBy: { id: string; name: string; email?: string } | null;
  reversedBy?: { id: string; paymentNumber: string; createdAt: string } | null;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: string;
  discountType: 'FIXED' | 'PERCENTAGE' | null;
  discountValue: string | null;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  refundedAmount: string;
  returnedAmount: string;
  balanceDue: string;
  notes: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    status: string;
  } | null;
  createdBy: { id: string; name: string } | null;
  confirmedBy: { id: string; name: string } | null;
  completedBy: { id: string; name: string } | null;
  cancelledBy: { id: string; name: string } | null;
  items: OrderItem[];
  payments: {
    id: string;
    paymentNumber: string;
    type: PaymentType;
    amount: string;
    paidAt: string;
    reference: string | null;
    paymentMethod: { id: string; name: string; code: string };
    recordedBy: { id: string; name: string } | null;
  }[];
}

export interface OrderInvoiceDetail {
  invoiceNumber: string;
  status: 'ISSUED' | 'CANCELLED';
  issueDate: string | null;
  dueDate: string | null;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  business: {
    businessName: string;
    currency: string;
    taxEnabled: boolean;
    taxLabel: string;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    invoiceFooter: string | null;
  };
  customer: {
    id: string | null;
    name: string | null;
    phone: string | null;
    address: string | null;
  };
  items: OrderItem[];
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
}

export interface SalesReturnListItem {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  status: SalesReturnStatus;
  reason: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  itemCount: number;
  processedAt: string | null;
  createdAt: string;
}

export interface SalesReturnItem {
  id: string;
  orderItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  quantity: number;
  condition: ReturnCondition;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
}

export interface SalesReturnDetail {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  status: SalesReturnStatus;
  reason: string;
  notes: string | null;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  rejectionReason: string | null;
  idempotencyKey: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    totalAmount: string;
    returnedAmount: string;
    paidAmount: string;
    refundedAmount: string;
    customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  };
  requestedBy: { id: string; name: string } | null;
  processedBy: { id: string; name: string } | null;
  items: SalesReturnItem[];
  refunds: {
    id: string;
    paymentNumber: string;
    amount: string;
    paidAt: string;
    paymentMethod: { id: string; code: string; name: string };
  }[];
  inventoryMovements: {
    id: string;
    productId: string;
    type: string;
    quantityChange: number;
    createdAt: string;
  }[];
}

export interface DashboardSummary {
  range: { from: string; to: string; timezone: string };
  counts: {
    activeProducts: number;
    activeCustomers: number;
    activeSuppliers: number;
  };
  orders: {
    createdInRange: {
      DRAFT: number;
      CONFIRMED: number;
      COMPLETED: number;
      CANCELLED: number;
    };
    pending: number;
    drafts: number;
  };
  stock: {
    lowStock: number;
    outOfStock: number;
    items: {
      id: string;
      sku: string;
      name: string;
      stockQuantity: number;
      lowStockThreshold: number;
      stockState: 'LOW' | 'OUT';
    }[];
  };
  recentOrders?: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    totalAmount: string;
    customerName: string | null;
    customer: { id: string; name: string } | null;
    createdAt: string;
  }[];
  recentPurchases?: {
    id: string;
    purchaseNumber: string;
    status: PurchaseStatus;
    paymentStatus: PaymentStatus;
    totalAmount: string;
    supplier: { id: string; name: string };
    createdAt: string;
  }[];
  financials?: {
    inventoryValue: string;
    outstandingCustomerBalance: string;
    outstandingSupplierBalance: string;
  };
}

export interface SalesSummaryReport {
  range: { from: string; to: string; timezone: string };
  totals: {
    grossSales: string;
    discounts: string;
    returns: string;
    netSales: string;
    taxCollected: string;
    orderCount: number;
    completedReturnsCount: number;
  };
  byPeriod: {
    period: string;
    grossSales: string;
    discounts: string;
    returns: string;
    netSales: string;
    tax: string;
    orderCount: number;
  }[];
  ordersByStatus: Record<string, { count: number; totalAmount: string }>;
}

export interface SalesByProductReport {
  range: { from: string; to: string; timezone: string };
  data: {
    productId: string;
    productName: string;
    sku: string;
    categoryName: string | null;
    quantitySold: number;
    quantityReturned: number;
    grossSales: string;
    discounts: string;
    returns: string;
    netSales: string;
    cogs?: string;
    grossProfit?: string;
    marginPercentage?: string;
  }[];
  meta: PageMeta;
}

export interface SalesByCustomerReport {
  range: { from: string; to: string; timezone: string };
  data: {
    customerId: string;
    customerName: string;
    phone: string | null;
    email: string | null;
    orderCount: number;
    grossSales: string;
    discounts: string;
    returns: string;
    netSales: string;
    totalPaid: string;
    outstandingBalance: string;
  }[];
  meta: PageMeta;
}

export interface PurchasesReport {
  range: { from: string; to: string; timezone: string };
  summary: {
    orderedAmount: string;
    receivedValue: string;
    paidAmount: string;
    purchaseCount: number;
  };
  bySupplier: {
    supplierId: string;
    supplierName: string;
    purchaseCount: number;
    orderedAmount: string;
    receivedValue: string;
    paidAmount: string;
    outstandingBalance: string;
  }[];
  purchases: {
    data: {
      id: string;
      purchaseNumber: string;
      supplierName: string;
      status: PurchaseStatus;
      paymentStatus: PaymentStatus;
      totalAmount: string;
      paidAmount: string;
      orderedAt: string | null;
      createdAt: string;
    }[];
    meta: PageMeta;
  };
}

export interface InventorySummaryReport {
  range: { from: string; to: string; timezone: string };
  statusCounts: {
    totalProducts: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
  movementsSummary: {
    type: MovementType;
    movementCount: number;
    totalQuantityChange: number;
  }[];
  lowStockItems: {
    id: string;
    sku: string;
    name: string;
    stockQuantity: number;
    threshold: number;
    stockState: 'LOW' | 'OUT';
  }[];
}

export interface InventoryValuationReport {
  totalValuation: string;
  totalQuantity: number;
  totalItems: number;
  byCategory: {
    categoryId: string | null;
    categoryName: string;
    productCount: number;
    totalQuantity: number;
    totalValuation: string;
  }[];
  items: {
    data: {
      id: string;
      sku: string;
      name: string;
      categoryName: string | null;
      stockQuantity: number;
      costPrice: string;
      valuation: string;
    }[];
    meta: PageMeta;
  };
}

export interface FinancialSummaryReport {
  range: { from: string; to: string; timezone: string };
  revenue: {
    grossSales: string;
    discounts: string;
    returns: string;
    netSales: string;
    taxCollected: string;
  };
  costs: {
    cogs: string;
    estimatedGrossProfit: string;
    grossMarginPercentage: string;
    purchaseCost: string;
  };
  cashFlow: {
    moneyIn: string;
    moneyOut: string;
    netCashFlow: string;
    byMethod: {
      methodId: string;
      code: string;
      name: string;
      moneyIn: string;
      moneyOut: string;
      netFlow: string;
    }[];
  };
  balances: {
    outstandingCustomerBalance: string;
    outstandingSupplierBalance: string;
  };
}

export interface AgingBucketRow {
  current: string;
  days31To60: string;
  days61To90: string;
  over90: string;
  total: string;
}

export interface FinancialAgingReport {
  asOf: string;
  customers: {
    summary: AgingBucketRow;
    details: (AgingBucketRow & { customerId: string | null; customerName: string })[];
  };
  suppliers: {
    summary: AgingBucketRow;
    details: (AgingBucketRow & { supplierId: string; supplierName: string })[];
  };
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

export interface BusinessSettings {
  id: number;
  businessName: string;
  legalName: string | null;
  taxRegistrationNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoPath: string | null;
  currencyCode: string;
  locale: string;
  timezone: string;
  taxEnabled: boolean;
  taxLabel: string;
  defaultTaxRate: string;
  invoiceFooter: string | null;
  defaultLowStockThreshold: number;
  lowStockAlertsEnabled: boolean;
  allowSelfRegistration: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}

export interface DocumentSequence {
  documentType: 'ORDER' | 'INVOICE' | 'PURCHASE' | 'PURCHASE_RECEIPT' | 'PAYMENT' | 'SALES_RETURN';
  prefix: string;
  nextNumber: number;
  padding: number;
  updatedAt: string;
}

export interface PaymentMethod {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FullSettingsResponse {
  settings: BusinessSettings;
  documentSequences: DocumentSequence[];
  paymentMethods: PaymentMethod[];
}
