'use client';

import {
  ArrowLeftRight,
  LayoutDashboard,
  Package,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  warehouse: Warehouse,
  inventory: Package,
  movements: ArrowLeftRight,
  users: Users,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

export function SidebarNav({
  items,
  onNavigate,
}: {
  items: NavItem[];
  /** Called when a nav item is activated — used to close the mobile drawer. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
            )}
          >
            <Icon className={cn('size-4', active && 'text-primary')} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
