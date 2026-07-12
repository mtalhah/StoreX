import {
  canViewWarehousesSection,
  hasPermission,
  Permission,
} from '@/core/application/auth/permissions';
import { AppShell } from '@/components/layout/app-shell';
import { type NavItem } from '@/components/layout/sidebar-nav';
import { getTenantContext } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/format';

/**
 * Authenticated shell. A server component: it resolves the TenantContext
 * (redirecting to sign-in when absent) and derives the navigation from the
 * same permission matrix the API enforces — the sidebar can never show a
 * destination the role cannot use.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTenantContext();

  // Each nav item declares a predicate over the context. Most are a plain
  // permission check; the Warehouses section has its own rule (admins always,
  // managers only when they run more than one warehouse, operators never).
  const navItems: Array<NavItem & { visible: boolean }> = [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', visible: hasPermission(ctx.role, Permission.AnalyticsRead) },
    { href: '/warehouses', label: 'Warehouses', icon: 'warehouse', visible: canViewWarehousesSection(ctx) },
    { href: '/inventory', label: 'Inventory', icon: 'inventory', visible: hasPermission(ctx.role, Permission.InventoryRead) },
    { href: '/movements', label: 'Movements', icon: 'movements', visible: hasPermission(ctx.role, Permission.MovementsRead) },
    { href: '/users', label: 'Users', icon: 'users', visible: hasPermission(ctx.role, Permission.UsersManage) },
  ];
  const visibleItems = navItems
    .filter((item) => item.visible)
    .map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <AppShell
      navItems={visibleItems}
      email={ctx.email}
      roleLabel={ROLE_LABELS[ctx.role] ?? ctx.role}
    >
      {children}
    </AppShell>
  );
}
