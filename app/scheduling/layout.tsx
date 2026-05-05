import Link from 'next/link';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
  { href: '/scheduling',                  label: 'Dashboard' },
  { href: '/scheduling/bookings',         label: 'Bookings' },
  { href: '/scheduling/resources',        label: 'Resources' },
  { href: '/scheduling/appointment-types', label: 'Appt. Types' },
  { href: '/scheduling/availability',     label: 'Availability' },
  { href: '/scheduling/new-booking',      label: '+ New Booking' },
];

export default function SchedulingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold tracking-tight text-gray-900">
            Scheduling Core
          </span>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-7xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
