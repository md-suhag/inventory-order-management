import type { Metadata } from 'next';
import type { PaymentDetail } from '@/lib/api-types';
import { apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { PaymentsClient } from './payments-client';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    type?: string;
    paymentMethodId?: string;
    orderId?: string;
    purchaseId?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
}) {
  const { user, settings } = await requireSession();
  if (!can(user, 'payments.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const { data, meta } = await apiFetchPage<PaymentDetail>('/payments', {
    query: {
      page: sp.page,
      pageSize: sp.pageSize,
      type: sp.type,
      paymentMethodId: sp.paymentMethodId,
      orderId: sp.orderId,
      purchaseId: sp.purchaseId,
      from: sp.from,
      to: sp.to,
      sort: sp.sort,
    },
  });

  return (
    <>
      <PageHeader
        title="Payment Ledger"
        description="Append-only record of customer payments, refunds, and reversals."
      />
      <PaymentsClient
        payments={data}
        meta={meta}
        paymentMethods={settings.paymentMethods}
        canReverse={can(user, 'payments.reverse')}
        formatSettings={settings.settings}
      />
    </>
  );
}
