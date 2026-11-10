import type { Permission } from '@/lib/permissions';

export interface NavItemConfig {
  label: string;
  href: string;
  icon:
    | 'LayoutDashboard'
    | 'Package'
    | 'Tags'
    | 'Users'
    | 'Truck'
    | 'ShoppingBag'
    | 'Warehouse'
    | 'ArrowLeftRight'
    | 'ShoppingCart'
    | 'CreditCard'
    | 'RotateCcw'
    | 'BarChart3'
    | 'UserCog'
    | 'Shield'
    | 'ScrollText'
    | 'Settings';
  anyPermissions: readonly Permission[];
}

export interface NavGroupConfig {
  title: string;
  items: NavItemConfig[];
}

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    title: 'Overview',
    items: [
      {
        label: 'Dashboard',
        href: '/',
        icon: 'LayoutDashboard',
        anyPermissions: ['dashboard.read'],
      },
    ],
  },
  {
    title: 'Catalog',
    items: [
      {
        label: 'Products',
        href: '/products',
        icon: 'Package',
        anyPermissions: ['products.read'],
      },
      {
        label: 'Categories',
        href: '/categories',
        icon: 'Tags',
        anyPermissions: ['categories.read'],
      },
    ],
  },
  {
    title: 'Parties',
    items: [
      {
        label: 'Customers',
        href: '/customers',
        icon: 'Users',
        anyPermissions: ['customers.read'],
      },
      {
        label: 'Suppliers',
        href: '/suppliers',
        icon: 'Truck',
        anyPermissions: ['suppliers.read'],
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        label: 'Purchases',
        href: '/purchases',
        icon: 'ShoppingBag',
        anyPermissions: ['purchases.read'],
      },
      {
        label: 'Inventory',
        href: '/inventory',
        icon: 'Warehouse',
        anyPermissions: ['inventory.read'],
      },
      {
        label: 'Movements',
        href: '/inventory/movements',
        icon: 'ArrowLeftRight',
        anyPermissions: ['inventory.read'],
      },
      {
        label: 'Orders',
        href: '/orders',
        icon: 'ShoppingCart',
        anyPermissions: ['orders.read'],
      },
      {
        label: 'Payments',
        href: '/payments',
        icon: 'CreditCard',
        anyPermissions: ['payments.read'],
      },
      {
        label: 'Sales Returns',
        href: '/sales-returns',
        icon: 'RotateCcw',
        anyPermissions: ['returns.read'],
      },
    ],
  },
  {
    title: 'Analytics',
    items: [
      {
        label: 'Reports',
        href: '/reports',
        icon: 'BarChart3',
        anyPermissions: ['reports.sales', 'reports.purchases', 'reports.inventory', 'reports.financial'],
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        label: 'Users',
        href: '/users',
        icon: 'UserCog',
        anyPermissions: ['users.read'],
      },
      {
        label: 'Roles',
        href: '/roles',
        icon: 'Shield',
        anyPermissions: ['roles.read'],
      },
      {
        label: 'Audit Logs',
        href: '/audit-logs',
        icon: 'ScrollText',
        anyPermissions: ['audit_logs.read'],
      },
      {
        label: 'Settings',
        href: '/settings',
        icon: 'Settings',
        anyPermissions: ['settings.update'],
      },
    ],
  },
];
