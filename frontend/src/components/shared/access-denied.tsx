import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AccessDenied({
  title = 'Access Restricted',
  description = 'You do not have the required permission to view this page.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-10 text-center">
      <div className="mb-3 rounded-full bg-amber-100 p-3 text-amber-700">
        <ShieldAlert className="size-6" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      <Button asChild variant="outline" className="mt-4">
        <Link href="/">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
