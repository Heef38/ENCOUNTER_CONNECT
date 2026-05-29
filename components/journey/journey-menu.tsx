'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, Map, FileText } from 'lucide-react';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { SignOutButton } from '@/components/auth/sign-out-button';

/**
 * Header actions for the participant journey. Inline on desktop; collapsed
 * into a hamburger menu on mobile (Full journey, Documents, theme, sign out).
 */
export function JourneyMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop: inline */}
      <div className="hidden flex-none items-center gap-3 md:flex">
        <Link
          href="/journey/map"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted hover:text-foreground"
        >
          <Map className="h-4 w-4" />
          Full journey
        </Link>
        <Link
          href="/journey/documents"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted hover:text-foreground"
        >
          <FileText className="h-4 w-4" />
          Documents
        </Link>
        <ThemeToggle />
        <SignOutButton />
      </div>

      {/* Mobile: hamburger menu */}
      <div className="relative flex-none md:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Menu"
          aria-haspopup="menu"
          aria-expanded={open}
          className="rounded-md p-2 text-foreground hover:bg-surface-muted"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        {open && (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-20 cursor-default"
            />
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-xl"
            >
              <Link
                href="/journey/map"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground"
              >
                <Map className="h-4 w-4" />
                Full journey
              </Link>
              <Link
                href="/journey/documents"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground"
              >
                <FileText className="h-4 w-4" />
                Documents
              </Link>
              <div className="my-1 border-t border-border" />
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-sm text-foreground-muted">Theme</span>
                <ThemeToggle />
              </div>
              <div className="px-1 py-0.5">
                <SignOutButton />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
