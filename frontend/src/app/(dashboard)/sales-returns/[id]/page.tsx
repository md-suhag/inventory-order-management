import type { Metadata } from 'next';
import type { SalesReturnDetail } from '@/lib/api-types';
import { apiFetch } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { ReturnDetailClient } from './return-detail-client';

export const metadata: Metadata = { title: 'Sales Return Detail' };

export default async function SalesReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireSession();
  if (!can(user, 'returns.read')) {
    return <AccessDenied />;
  }

  const { id } = await params;
  const salesReturn = await apiFetch<SalesReturnDetail>(`/sales-returns/${id}`);

  return (
    <>
      <PageHeader
        title={salesReturn.returnNumber}
        description={`Return against order ${salesReturn.orderNumber}`}
        backHref="/sales-returns"
        backLabel="Back to Sales Returns"
      />
      <ReturnDetailClient
        key={salesReturn.updatedAt}
        salesReturn={salesReturn}
        paymentMethods={settings.paymentMethods}
        settings={settings.settings}
        canProcess={can(user, 'returns.process')}
        canRefund={can(user, 'payments.refund')}
      />
    </>
  );
}
