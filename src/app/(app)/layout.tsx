import { Boxes } from 'lucide-react';
import { hasPermission, Permission } from '@/core/application/auth/permissions';
import { SidebarNav, type NavItem } from '@/components/layout/sidebar-nav';
import { UserMenu } from '@/components/layout/user-menu';
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

  const navItems: Array<NavItem & { permission: Permission }> = [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', permission: Permission.AnalyticsRead },
    { href: '/warehouses', label: 'Warehouses', icon: 'warehouse', permission: Permission.WarehousesRead },
    { href: '/inventory', label: 'Inventory', icon: 'inventory', permission: Permission.InventoryRead },
    { href: '/movements', label: 'Movements', icon: 'movements', permission: Permission.MovementsRead },
    { href: '/users', label: 'Users', icon: 'users', permission: Permission.UsersManage },
  ];
  const visibleItems = navItems
    .filter((item) => hasPermission(ctx.role, item.permission))
    .map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <div className="flex h-screen overflow-hidden bg-muted/40">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-14 items-center gap-2.5 border-b px-5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="size-4" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Storex</span>
        </div>
        <SidebarNav items={visibleItems} />
        <div className="border-t p-3">
          <UserMenu email={ctx.email} roleLabel={ROLE_LABELS[ctx.role] ?? ctx.role} />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
