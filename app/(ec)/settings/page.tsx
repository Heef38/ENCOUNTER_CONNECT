import Link from 'next/link';
import {
  Calendar,
  BookOpen,
  ClipboardList,
  Building2,
  Users,
  FileText,
  Bell,
} from 'lucide-react';
import { requireChurchAdmin } from '@/lib/auth/dal';

interface SettingItem {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const ITEMS: SettingItem[] = [
  {
    href: '/settings/campuses',
    title: 'Campuses',
    description: 'Manage your physical or virtual campus locations.',
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    href: '/settings/serve-teams',
    title: 'Serve Teams',
    description: 'Teams participants can be plugged into based on their gifts.',
    icon: <Users className="h-5 w-5" />,
  },
  {
    href: '/settings/connect-docs',
    title: 'Connect Docs',
    description: 'Documents and resources visible to staff, participants, or everyone.',
    icon: <FileText className="h-5 w-5" />,
  },
  {
    href: '/settings/lessons',
    title: 'Lessons',
    description: 'Create and edit Markdown lessons that flow steps can reference.',
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    href: '/settings/appointment-types',
    title: 'Appointment Types',
    description: 'Pick a color for each kind of appointment so calendar entries are easy to scan.',
    icon: <Calendar className="h-5 w-5" />,
  },
  {
    href: '/settings/assessments',
    title: 'Assessments',
    description: 'Customize the personal, connect-with-God, and spiritual gifts questionnaires.',
    icon: <ClipboardList className="h-5 w-5" />,
  },
  {
    href: '/settings/notifications',
    title: 'Notifications',
    description: 'Email + SMS templates and the outbox queue. Stale-step reminders fire on a daily cron.',
    icon: <Bell className="h-5 w-5" />,
  },
];

export default async function SettingsPage() {
  await requireChurchAdmin();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Configure how Encounter Connect works for your church.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong"
          >
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              {item.icon}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-foreground group-hover:text-primary">
                {item.title}
              </div>
              <p className="mt-0.5 text-sm text-foreground-muted">{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
