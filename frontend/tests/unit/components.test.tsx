import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/app/(auth)/login/login-form';
import { CsvExportButton } from '@/components/shared/csv-export-button';
import { StatusBadge } from '@/components/shared/status-badge';

const mockLoginAction = vi.fn();

vi.mock('@/lib/actions/auth', () => ({
  loginAction: (...args: unknown[]) => mockLoginAction(...args),
}));

describe('Shared UI components', () => {
  it('StatusBadge maps domain statuses and unknown fallback labels', () => {
    const { rerender } = render(<StatusBadge status="PARTIALLY_RECEIVED" />);
    expect(screen.getByText('Partially Received')).toBeTruthy();

    rerender(<StatusBadge status="SALE_RETURN" />);
    expect(screen.getByText('SALE RETURN')).toBeTruthy();
  });

  it('CsvExportButton disables when rows are empty and enables when data exists', () => {
    const { rerender } = render(
      <CsvExportButton filename="report" rows={[]} columns={[{ header: 'A', value: () => '1' }]} />,
    );
    const emptyBtn = screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement;
    expect(emptyBtn.disabled).toBe(true);

    rerender(
      <CsvExportButton
        filename="report"
        rows={[{ a: 'val' }]}
        columns={[{ header: 'A', value: (r) => r.a }]}
      />,
    );
    const readyBtn = screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement;
    expect(readyBtn.disabled).toBe(false);
  });

  it('LoginForm submits credentials with next path and displays error banner on failure', async () => {
    mockLoginAction.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });

    render(<LoginForm nextPath="/orders" bannerMessage="Password updated" />);
    expect(screen.getByText('Password updated')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'WrongPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeTruthy();
    });
    expect(mockLoginAction).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'WrongPass1',
      next: '/orders',
    });
  });
});
