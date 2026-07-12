'use client';

import { Boxes, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SidebarNav, type NavItem } from '@/components/layout/sidebar-nav';
import { UserMenu } from '@/components/layout/user-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** App wordmark + logo, shared between the sidebar and the mobile top bar. */
function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Boxes className="size-4" />
      </div>
      <span className="text-[15px] font-semibold tracking-tight">Storex</span>
    </div>
  );
}

/**
 * Sidebar body (brand → nav → user menu). Reused verbatim by the static
 * desktop sidebar and the mobile slide-out drawer so navigation stays a
 * single source of truth. `headerAction` lets the drawer add a close button.
 */
function SidebarPanel({
  items,
  email,
  roleLabel,
  onNavigate,
  headerAction,
}: {
  items: NavItem[];
  email: string;
  roleLabel: string;
  onNavigate?: () => void;
  headerAction?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2.5 border-b px-5">
        <Brand />
        {headerAction}
      </div>
      <SidebarNav items={items} onNavigate={onNavigate} />
      <div className="border-t p-3">
        <UserMenu email={email} roleLabel={roleLabel} />
      </div>
    </>
  );
}

/**
 * Authenticated app shell.
 *
 * - Desktop (≥1024px / `lg`): a static sidebar, identical to the original
 *   layout — nothing about the desktop presentation changes.
 * - Tablet & mobile (<1024px): the sidebar collapses into a slide-out drawer
 *   opened from a hamburger in a compact top bar. Same nav items, same user
 *   menu, same permissions (they are computed server-side and passed in).
 */
export function AppShell({
  navItems,
  email,
  roleLabel,
  children,
}: {
  navItems: NavItem[];
  email: string;
  roleLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // The drawer also closes on navigation (each nav link calls `onNavigate`),
  // on backdrop click, and via the close button below.

  // Escape closes the drawer, matching native dialog behaviour.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex h-screen overflow-hidden bg-muted/40">
      {/* Desktop sidebar — static at lg+, unchanged from the original layout. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <SidebarPanel items={navItems} email={email} roleLabel={roleLabel} />
      </aside>

      {/* Backdrop for the mobile drawer (below lg only). */}
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Slide-out drawer (below lg only). */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-sidebar shadow-xl transition-transform duration-200 ease-out lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarPanel
          items={navItems}
          email={email}
          roleLabel={roleLabel}
          onNavigate={() => setOpen(false)}
          headerAction={
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          }
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Compact top bar with the hamburger (below lg only). */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-sidebar px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <Brand />
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
