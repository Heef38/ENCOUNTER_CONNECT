'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export interface NavItem {
  href: string;
  label: string;
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

const TONE_CLASSES: Record<NavGroupRender['color'], { border: string; text: string; bg: string }> = {
  info:    { border: 'border-info/60',    text: 'text-info',    bg: 'bg-surface' },
  success: { border: 'border-success/60', text: 'text-success', bg: 'bg-surface' },
  warning: { border: 'border-warning/60', text: 'text-warning', bg: 'bg-surface' },
  primary: { border: 'border-primary/60', text: 'text-primary', bg: 'bg-surface' },
};

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
            <img src="/EC.png" alt="Encounter Connect" className="h-8 w-auto" />
          </Link>
        </div>

        <nav className="hidden min-w-0 items-center justify-center gap-1 overflow-x-auto whitespace-nowrap md:flex">
          {groups.map((group, gi) => (
            <Fragment key={group.key}>
              {gi > 0 && (
                <span aria-hidden className="px-1 text-foreground-subtle">|</span>
              )}
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </Fragment>
          ))}
        </nav>

        <div className="flex flex-none items-center gap-1 justify-self-end">
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
        <nav className="flex flex-col gap-4 p-3">
          {groups.map((group) => (
            <MobileGroup key={group.key} group={group} onNavigate={() => setOpen(false)} />
          ))}
        </nav>
        {userLabel && (
          <div className="mt-auto border-t border-border px-4 py-3 text-xs text-foreground-subtle">
            {userLabel}
          </div>
        )}
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
  const tone = TONE_CLASSES[group.color];
  return (
    <div className={cn('relative rounded-md border p-2 pt-3', tone.border)}>
      <span
        className={cn(
          'absolute -top-2 left-2 rounded bg-surface px-1.5 text-[10px] font-semibold uppercase tracking-wide',
          tone.text,
        )}
      >
        {group.label}
      </span>
      <div className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className="rounded-md px-3 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'rounded-md px-2.5 py-1 text-sm text-foreground-muted transition-colors',
        'hover:bg-surface-muted hover:text-foreground',
      )}
    >
      {item.label}
    </Link>
  );
}
