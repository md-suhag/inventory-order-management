import type { Metadata } from 'next';
import type { OrderDetail, OrderListItem, SalesReturnDetail, SalesReturnListItem } from '@/lib/api-types';
import { apiFetch, apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { NewReturnClient } from './new-return-client';

export const metadata: Metadata = { title: 'Request Sales Return' };

export default async function NewSalesReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { user } = await requireSession();
  if (!can(user, 'returns.create')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const eligiblePage = await apiFetchPage<OrderListItem>('/orders', {
    query: { status: 'DELIVERED,COMPLETED', pageSize: 100 },
  });

  const targetOrderId = sp.orderId || eligiblePage.data[0]?.id;
  let selectedOrder: OrderDetail | null = null;
  const remainingMap: Record<string, number> = {};

  if (targetOrderId) {
    selectedOrder = await apiFetch<OrderDetail>(`/orders/${targetOrderId}`);
    for (const item of selectedOrder.items) {
      remainingMap[item.id] = item.quantity;
    }

    if (can(user, 'returns.read')) {
      const existingReturns = await apiFetchPage<SalesReturnListItem>('/sales-returns', {
        query: { orderId: targetOrderId, status: 'PENDING,COMPLETED', pageSize: 100 },
      });
      const details = await Promise.all(
        existingReturns.data.map((r) => apiFetch<SalesReturnDetail>(`/sales-returns/${r.id}`)),
      );
      for (const ret of details) {
        for (const ri of ret.items) {
          remainingMap[ri.orderItemId] = Math.max(0, (remainingMap[ri.orderItemId] ?? 0) - ri.quantity);
        }
      }
    }
  }

  return (
    <>
      <PageHeader
        title="New Sales Return"
        description="Request a customer return against a delivered or completed order."
        backHref="/sales-returns"
        backLabel="Back to Sales Returns"
      />
      <NewReturnClient
        key={selectedOrder?.id ?? 'none'}
        eligibleOrders={eligiblePage.data}
        selectedOrder={selectedOrder}
        remainingMap={remainingMap}
      />
    </>
  );
}
