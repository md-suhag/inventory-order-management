import type { Metadata } from 'next';
import type { PurchaseListItem, SupplierDetail } from '@/lib/api-types';
import { apiFetch, apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { SupplierDetailClient } from './supplier-detail-client';

export const metadata: Metadata = { title: 'Supplier Detail' };

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireSession();
  if (!can(user, 'suppliers.read')) {
    return <AccessDenied />;
  }

  const { id } = await params;
  const [supplier, purchasesPage] = await Promise.all([
    apiFetch<SupplierDetail>(`/suppliers/${id}`),
    can(user, 'purchases.read')
      ? apiFetchPage<PurchaseListItem>('/purchases', { query: { supplierId: id, pageSize: 10 } })
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title={supplier.name}
        description="Supplier contact details, payable summary, and purchase history."
        backHref="/suppliers"
        backLabel="Back to Suppliers"
      />
      <SupplierDetailClient
        key={supplier.updatedAt}
        supplier={supplier}
        purchases={purchasesPage?.data ?? null}
        canManage={can(user, 'suppliers.manage')}
        formatSettings={settings.settings}
      />
    </>
  );
}
