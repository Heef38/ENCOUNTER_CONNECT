'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Menu, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export interface NavItem {
  href?: string;
  label: string;
  children?: NavItem[];
}

export interface NavGroupRender {
  key: string;
  label: string;
  /** CSS custom-property-friendly tone token from globals.css. */
  color: 'info' | 'success' | 'warning' | 'primary';
  items: NavItem[];
}

interface Props {
  groups: NavGroupRender[];
  userLabel: string | null;
  homeHref: string;
}

export function ECNav({ groups, userLabel, homeHref }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
      <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link
            href={homeHref}
            aria-label="Encounter Connect — home"
            className="block flex-none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/EC.png" alt="Encounter Connect" className="h-7 w-auto" />
          </Link>
        </div>

        <nav className="hidden min-w-0 items-center justify-center gap-1 whitespace-nowrap md:flex">
          {groups.map((group, gi) => (
            <Fragment key={group.key}>
              {gi > 0 && (
                <span aria-hidden className="px-1 text-foreground-subtle">|</span>
              )}
              {group.items.map((item) =>
                item.children ? (
                  <NavDropdown key={item.label} item={item} />
                ) : (
                  <NavLink key={item.href ?? item.label} item={item} />
                ),
              )}
            </Fragment>
          ))}
        </nav>

        <div className="hidden flex-none items-center gap-1 justify-self-end md:flex">
          {userLabel && (
            <span className="mx-2 hidden text-xs text-foreground-subtle md:inline">
              {userLabel}
            </span>
          )}
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-display text-base font-semibold">Menu</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
          {groups.map((group) => (
            <MobileGroup key={group.key} group={group} onNavigate={() => setOpen(false)} />
          ))}
        </nav>
        <div className="mt-auto border-t border-border px-4 py-3">
          {userLabel && (
            <p className="mb-2 text-xs text-foreground-subtle">{userLabel}</p>
          )}
          <div className="flex items-center justify-between gap-2">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </Sheet>
    </header>
  );
}

function MobileGroup({
  group,
  onNavigate,
}: {
  group: NavGroupRender;
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
        {group.label}
      </p>
      {group.items.map((item) =>
        item.children ? (
          <Fragment key={item.label}>
            <p className="px-3 pt-2 pb-0.5 text-xs font-medium text-foreground-subtle">
              {item.label}
            </p>
            {item.children.map((c) => (
              <Link
                key={c.href ?? c.label}
                href={c.href ?? '#'}
                onClick={onNavigate}
                className="rounded-md px-3 py-2 pl-5 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground"
              >
                {c.label}
              </Link>
            ))}
          </Fragment>
        ) : (
          <Link
            key={item.href ?? item.label}
            href={item.href ?? '#'}
            onClick={onNavigate}
            className="rounded-md px-3 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground"
          >
            {item.label}
          </Link>
        ),
      )}
    </div>
  );
}

function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      href={item.href ?? '#'}
      className={cn(
        'rounded-md px-2.5 py-1 text-sm text-foreground-muted transition-colors',
        'hover:bg-surface-muted hover:text-foreground',
      )}
    >
      {item.label}
    </Link>
  );
}

function NavDropdown({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false);
  const children = item.children ?? [];
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        {item.label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        // top-full (no gap) keeps the menu contiguous with the trigger so
        // hovering down into it doesn't fire mouseleave and close it.
        <div
          role="menu"
          className="absolute left-0 top-full z-50 min-w-44 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-xl"
        >
          {children.map((c) => (
            <Link
              key={c.href ?? c.label}
              href={c.href ?? '#'}
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground"
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
