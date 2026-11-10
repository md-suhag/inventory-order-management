import * as React from 'react';
import { Package2 } from 'lucide-react';

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/40 p-4">
      <div className="mb-6 flex items-center gap-2.5 text-primary">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
          <Package2 className="size-5" />
        </div>
        <div>
          <p className="text-lg font-semibold leading-none tracking-tight">Inventory OMS</p>
          <p className="text-xs text-muted-foreground">Operations &amp; Order Management</p>
        </div>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
