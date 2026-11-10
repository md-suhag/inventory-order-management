import { AlertCircle } from 'lucide-react';
import type { ApiErrorDetail } from '@/lib/api-types';

interface ErrorBannerProps {
  message?: string | null;
  details?: ApiErrorDetail[];
}

export function ErrorBanner({ message, details }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">{message}</p>
        {details && details.length > 0 ? (
          <ul className="list-disc pl-4 text-xs">
            {details.map((d, idx) => (
              <li key={`${d.field ?? 'err'}-${idx}`}>
                {d.field ? <span className="font-medium">{d.field}: </span> : null}
                {d.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
