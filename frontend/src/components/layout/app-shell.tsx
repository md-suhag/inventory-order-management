'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  BarChart3,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Package2,
  RotateCcw,
  ScrollText,
  Settings,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Tags,
  Truck,
  User as UserIcon,
  UserCog,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import type { BusinessSettings, CurrentUser } from '@/lib/api-types';
import { logoutAction } from '@/lib/actions/auth';
import { hasAnyPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NAV_GROUPS, type NavItemConfig } from './nav-config';

const ICON_MAP: Record<NavItemConfig['icon'], React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Package,
  Tags,
  Users,
  Truck,
  ShoppingBag,
  Warehouse,
  ArrowLeftRight,
  ShoppingCart,
  CreditCard,
  RotateCcw,
  BarChart3,
  UserCog,
  Shield,
  ScrollText,
  Settings,
};

function isLinkActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname === '/dashboard';
  if (href === '/inventory') {
    return pathname === '/inventory';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({
  user,
  businessName,
  onNavigate,
}: {
  user: CurrentUser;
  businessName: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <Package2 className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{businessName}</p>
          <p className="text-[11px] text-sidebar-foreground/60">Inventory &amp; Orders</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) =>
            hasAnyPermission(user.permissions, item.anyPermissions),
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.title} className="space-y-1">
              <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = ICON_MAP[item.icon];
                  const active = isLinkActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3 text-xs text-sidebar-foreground/70">
        <p className="truncate font-medium text-sidebar-foreground">{user.name}</p>
        <p className="truncate">{user.role.name}</p>
      </div>
    </div>
  );
}

export function AppShell({
  user,
  settings,
  children,
}: {
  user: CurrentUser;
  settings: BusinessSettings;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="no-print hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-64 border-r border-sidebar-border">
        <SidebarContent user={user} businessName={settings.businessName} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 flex w-64 flex-col">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-white hover:bg-sidebar-accent"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </Button>
            <SidebarContent
              user={user}
              businessName={settings.businessName}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64 flex min-h-screen flex-col">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur-xs lg:px-6">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-2 py-0.5 font-medium text-foreground">
                {settings.currencyCode}
              </span>
              <span>{settings.timezone}</span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:inline text-sm font-medium">{user.name}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                <div className="truncate text-sm font-medium text-foreground">{user.name}</div>
                <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <UserIcon className="size-4" />
                  Profile &amp; Security
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  void logoutAction();
                }}
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-7xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
