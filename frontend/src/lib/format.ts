import Decimal from 'decimal.js';

export interface FormatSettings {
  currencyCode: string;
  locale: string;
  timezone: string;
}

export const DEFAULT_FORMAT_SETTINGS: FormatSettings = {
  currencyCode: 'USD',
  locale: 'en-US',
  timezone: 'UTC',
};

export function formatMoney(
  value: string | number | null | undefined,
  settings: Partial<FormatSettings> = DEFAULT_FORMAT_SETTINGS,
): string {
  const numeric = value === null || value === undefined || value === '' ? 0 : Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  const currency = settings.currencyCode || 'USD';
  const locale = settings.locale || 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeValue);
  } catch {
    return `${currency} ${safeValue.toFixed(2)}`;
  }
}

export function formatCost(
  value: string | number | null | undefined,
  settings: Partial<FormatSettings> = DEFAULT_FORMAT_SETTINGS,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const currency = settings.currencyCode || 'USD';
  try {
    const d = new Decimal(value);
    return `${currency} ${d.toFixed(4)}`;
  } catch {
    return '—';
  }
}

export function formatDate(
  value: string | Date | null | undefined,
  settings: Partial<FormatSettings> = DEFAULT_FORMAT_SETTINGS,
  withTime = false,
): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = settings.locale || 'en-US';
  const timeZone = settings.timezone || 'UTC';
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(date);
  } catch {
    return withTime ? date.toISOString().slice(0, 16).replace('T', ' ') : date.toISOString().slice(0, 10);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface PreviewLineInput {
  quantity: number;
  unitAmount: string;
  discountAmount?: string;
  taxRate?: string;
}

export interface PreviewDocumentResult {
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  lineTotals: string[];
}

export function calculateDocumentPreview(
  lines: PreviewLineInput[],
  headerDiscountType?: 'FIXED' | 'PERCENTAGE' | null,
  headerDiscountValue?: string | null,
): PreviewDocumentResult {
  try {
    let subtotal = new Decimal(0);
    const netLines: { net: Decimal; taxRate: Decimal }[] = [];

    for (const line of lines) {
      const qty = Math.max(0, Math.floor(line.quantity || 0));
      const unit = new Decimal(line.unitAmount || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const gross = unit.mul(qty).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const lineDiscount = new Decimal(line.discountAmount || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const net = Decimal.max(0, gross.sub(lineDiscount));
      const taxRate = new Decimal(line.taxRate || 0);
      subtotal = subtotal.add(net);
      netLines.push({ net, taxRate });
    }

    subtotal = subtotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    let discountAmount = new Decimal(0);
    if (headerDiscountType && headerDiscountValue) {
      const val = new Decimal(headerDiscountValue || 0);
      if (headerDiscountType === 'FIXED') {
        discountAmount = Decimal.min(subtotal, val.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
      } else {
        discountAmount = subtotal.mul(Decimal.min(100, Decimal.max(0, val))).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
    }

    let taxAmount = new Decimal(0);
    const lineTotals: string[] = [];
    for (const entry of netLines) {
      const share = subtotal.gt(0) ? entry.net.div(subtotal).mul(discountAmount) : new Decimal(0);
      const taxable = Decimal.max(0, entry.net.sub(share.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)));
      const lineTax = taxable.mul(entry.taxRate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      taxAmount = taxAmount.add(lineTax);
      lineTotals.push(taxable.add(lineTax).toFixed(2));
    }

    taxAmount = taxAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const totalAmount = subtotal.sub(discountAmount).add(taxAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      subtotal: subtotal.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      lineTotals,
    };
  } catch {
    return {
      subtotal: '0.00',
      discountAmount: '0.00',
      taxAmount: '0.00',
      totalAmount: '0.00',
      lineTotals: lines.map(() => '0.00'),
    };
  }
}
