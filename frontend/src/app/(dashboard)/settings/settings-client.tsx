'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { DocumentSequence, FullSettingsResponse, PaymentMethod } from '@/lib/api-types';
import {
  updatePaymentMethodAction,
  updateSequenceAction,
  updateSettingsAction,
} from '@/lib/actions/admin';
import { ErrorBanner } from '@/components/shared/error-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

function SequenceRow({ seq }: { seq: DocumentSequence }) {
  const router = useRouter();
  const [prefix, setPrefix] = React.useState(seq.prefix);
  const [padding, setPadding] = React.useState(String(seq.padding));
  const [pending, startTransition] = React.useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateSequenceAction(seq.documentType, {
        prefix: prefix.trim(),
        padding: Number(padding),
      });
      if (res.ok) {
        toast.success(`Sequence ${seq.documentType} updated`);
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs font-medium">{seq.documentType}</TableCell>
      <TableCell>
        <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="h-8 w-28 font-mono" />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={1}
          max={12}
          value={padding}
          onChange={(e) => setPadding(e.target.value)}
          className="h-8 w-20 font-mono"
        />
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {prefix}
        {String(seq.nextNumber).padStart(Math.max(1, Number(padding) || 6), '0')}
      </TableCell>
      <TableCell className="text-right">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={save}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function PaymentMethodRow({ method }: { method: PaymentMethod }) {
  const router = useRouter();
  const [name, setName] = React.useState(method.name);
  const [isActive, setIsActive] = React.useState(method.isActive);
  const [sortOrder, setSortOrder] = React.useState(String(method.sortOrder));
  const [pending, startTransition] = React.useTransition();

  function save() {
    startTransition(async () => {
      const res = await updatePaymentMethodAction(method.id, {
        name: name.trim(),
        isActive,
        sortOrder: Number(sortOrder) || 0,
      });
      if (res.ok) {
        toast.success(`Payment method "${res.data.name}" updated`);
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{method.code}</TableCell>
      <TableCell>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-44" />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="h-8 w-20 font-mono"
        />
      </TableCell>
      <TableCell>
        <Switch checked={isActive} onCheckedChange={setIsActive} aria-label={`Active ${method.name}`} />
      </TableCell>
      <TableCell className="text-right">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={save}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function SettingsClient({ data }: { data: FullSettingsResponse }) {
  const router = useRouter();
  const s = data.settings;

  const [businessName, setBusinessName] = React.useState(s.businessName);
  const [legalName, setLegalName] = React.useState(s.legalName ?? '');
  const [taxRegNo, setTaxRegNo] = React.useState(s.taxRegistrationNumber ?? '');
  const [email, setEmail] = React.useState(s.email ?? '');
  const [phone, setPhone] = React.useState(s.phone ?? '');
  const [address, setAddress] = React.useState(s.address ?? '');
  const [currencyCode, setCurrencyCode] = React.useState(s.currencyCode);
  const [locale, setLocale] = React.useState(s.locale);
  const [timezone, setTimezone] = React.useState(s.timezone);
  const [taxEnabled, setTaxEnabled] = React.useState(s.taxEnabled);
  const [taxLabel, setTaxLabel] = React.useState(s.taxLabel);
  const [defaultTaxRate, setDefaultTaxRate] = React.useState(s.defaultTaxRate);
  const [invoiceFooter, setInvoiceFooter] = React.useState(s.invoiceFooter ?? '');
  const [defaultLowStockThreshold, setDefaultLowStockThreshold] = React.useState(
    String(s.defaultLowStockThreshold),
  );
  const [lowStockAlertsEnabled, setLowStockAlertsEnabled] = React.useState(s.lowStockAlertsEnabled);
  const [allowSelfRegistration, setAllowSelfRegistration] = React.useState(s.allowSelfRegistration);

  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateSettingsAction({
        businessName,
        legalName: legalName || null,
        taxRegistrationNumber: taxRegNo || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        currencyCode,
        locale,
        timezone,
        taxEnabled,
        taxLabel,
        defaultTaxRate,
        invoiceFooter: invoiceFooter || null,
        defaultLowStockThreshold: Number(defaultLowStockThreshold) || 0,
        lowStockAlertsEnabled,
        allowSelfRegistration,
      });
      if (res.ok) {
        toast.success('Business settings updated');
        router.refresh();
      } else {
        setError(res.error.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Business Profile, Localization &amp; Defaults</CardTitle>
          <CardDescription>
            Currency code is locked once confirmed orders, purchases, or payments exist. Tax changes apply to
            new drafts only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSettings} className="space-y-5">
            <ErrorBanner message={error} />

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="set-name">Business Name *</Label>
                <Input
                  id="set-name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  disabled={pending}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-legal">Legal Name</Label>
                <Input
                  id="set-legal"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-taxreg">Tax Registration #</Label>
                <Input
                  id="set-taxreg"
                  value={taxRegNo}
                  onChange={(e) => setTaxRegNo(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="set-email">Business Email</Label>
                <Input
                  id="set-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-phone">Business Phone</Label>
                <Input
                  id="set-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-addr">Address</Label>
                <Input
                  id="set-addr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="set-curr">Currency (ISO 4217)</Label>
                <Input
                  id="set-curr"
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                  maxLength={3}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-locale">Locale</Label>
                <Input
                  id="set-locale"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-tz">Timezone (IANA)</Label>
                <Input
                  id="set-tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 items-end">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Tax Enabled</p>
                  <p className="text-xs text-muted-foreground">Apply default tax on new drafts</p>
                </div>
                <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} disabled={pending} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-taxlabel">Tax Label</Label>
                <Input
                  id="set-taxlabel"
                  value={taxLabel}
                  onChange={(e) => setTaxLabel(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-taxrate">Default Tax Rate (%)</Label>
                <Input
                  id="set-taxrate"
                  value={defaultTaxRate}
                  onChange={(e) => setDefaultTaxRate(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="set-lowstock">Default Low-Stock Threshold</Label>
                <Input
                  id="set-lowstock"
                  type="number"
                  min={0}
                  value={defaultLowStockThreshold}
                  onChange={(e) => setDefaultLowStockThreshold(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Low-Stock Alerts</p>
                  <p className="text-xs text-muted-foreground">Highlight low inventory</p>
                </div>
                <Switch
                  checked={lowStockAlertsEnabled}
                  onCheckedChange={setLowStockAlertsEnabled}
                  disabled={pending}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Self-Registration</p>
                  <p className="text-xs text-muted-foreground">Inactive Staff signup</p>
                </div>
                <Switch
                  checked={allowSelfRegistration}
                  onCheckedChange={setAllowSelfRegistration}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="set-footer">Invoice Footer Text</Label>
              <Textarea
                id="set-footer"
                value={invoiceFooter}
                onChange={(e) => setInvoiceFooter(e.target.value)}
                disabled={pending}
                rows={2}
              />
            </div>

            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save Business Settings'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Document Number Sequences</CardTitle>
            <CardDescription>Prefix and zero-padding for gap-free document numbering.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Padding</TableHead>
                  <TableHead>Next Preview</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.documentSequences.map((seq) => (
                  <SequenceRow key={seq.documentType} seq={seq} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>Inactive methods cannot be used for new payments or refunds.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.paymentMethods.map((m) => (
                  <PaymentMethodRow key={m.id} method={m} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
