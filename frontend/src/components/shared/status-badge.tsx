import { Badge, type BadgeProps } from '@/components/ui/badge';

const STATUS_MAP: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  INACTIVE: { label: 'Inactive', variant: 'secondary' },
  ARCHIVED: { label: 'Archived', variant: 'outline' },
  IN_STOCK: { label: 'In Stock', variant: 'success' },
  LOW: { label: 'Low Stock', variant: 'warning' },
  OUT: { label: 'Out of Stock', variant: 'destructive' },
  DRAFT: { label: 'Draft', variant: 'secondary' },
  ORDERED: { label: 'Ordered', variant: 'info' },
  PARTIALLY_RECEIVED: { label: 'Partially Received', variant: 'warning' },
  RECEIVED: { label: 'Received', variant: 'success' },
  CONFIRMED: { label: 'Confirmed', variant: 'info' },
  SHIPPED: { label: 'Shipped', variant: 'info' },
  DELIVERED: { label: 'Delivered', variant: 'success' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
  UNPAID: { label: 'Unpaid', variant: 'destructive' },
  PARTIALLY_PAID: { label: 'Partially Paid', variant: 'warning' },
  PAID: { label: 'Paid', variant: 'success' },
  PARTIALLY_REFUNDED: { label: 'Partially Refunded', variant: 'warning' },
  REFUNDED: { label: 'Refunded', variant: 'secondary' },
  PENDING: { label: 'Pending', variant: 'warning' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  PAYMENT: { label: 'Payment', variant: 'success' },
  REFUND: { label: 'Refund', variant: 'warning' },
  REVERSAL: { label: 'Reversal', variant: 'destructive' },
  RESALABLE: { label: 'Resalable', variant: 'success' },
  DAMAGED: { label: 'Damaged', variant: 'destructive' },
  ISSUED: { label: 'Issued', variant: 'success' },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const entry = STATUS_MAP[status] ?? {
    label: status.replace(/_/g, ' '),
    variant: 'outline' as const,
  };
  return (
    <Badge variant={entry.variant} className={className}>
      {entry.label}
    </Badge>
  );
}
