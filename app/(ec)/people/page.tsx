import Link from 'next/link';
import { CheckCircle2, Plus, ShieldCheck, ShieldHalf, Users, UserPlus } from 'lucide-react';
import { requireStaff } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { deleteStaffAccount } from '@/lib/people/actions';
import { deleteParticipantAccount } from '@/lib/participants/actions';
import type { ECUserRole } from '@/lib/church/types';

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: ECUserRole;
  is_platform_admin: boolean;
  campus_id: string | null;
}

interface ConnectorRow {
  id: string;
  profile_id: string;
  campus_id: string | null;
  is_active: boolean;
}

interface ParticipantRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
  campus_id: string | null;
  profile_id: string | null;
}

interface CampusRow {
  id: string;
  name: string;
}

const ROLE_TONE: Record<ECUserRole, 'primary' | 'info' | 'warning' | 'neutral'> = {
  church_admin: 'primary',
  campus_admin: 'info',
  connector:    'warning',
  participant:  'neutral',
};

export default async function PeoplePage() {
  const session = await requireStaff();
  const myId = session.id;
  const churchId = session.profile?.church_id;
  const role = session.profile?.role;
  const isPlatform = session.profile?.is_platform_admin ?? false;
  const canManage = isPlatform || role === 'church_admin';
  const canManageConnectors = canManage || role === 'campus_admin';

  const supabase = await createServerSupabaseClient();

  const profilesQ = churchId
    ? supabase
        .from('profiles')
        .select('id, first_name, last_name, email, role, is_platform_admin, campus_id')
        .eq('church_id', churchId)
        .order('first_name')
    : Promise.resolve({ data: [] });

  const [profilesResult, connectorsResult, participantsResult, campusesResult] = await Promise.all([
    profilesQ,
    supabase
      .from('connectors')
      .select('id, profile_id, campus_id, is_active'),
    churchId
      ? supabase
          .from('participants')
          .select('id, first_name, last_name, email, status, campus_id, profile_id')
          .eq('church_id', churchId)
          .order('last_action_at', { ascending: false, nullsFirst: false })
          .limit(200)
      : Promise.resolve({ data: [] }),
    churchId
      ? supabase
          .from('campuses')
          .select('id, name')
          .eq('church_id', churchId)
          .order('name')
      : Promise.resolve({ data: [] }),
  ]);

  const profiles = (profilesResult.data ?? []) as Profile[];
  const connectors = (connectorsResult.data ?? []) as ConnectorRow[];

  // Connector → team name, for the "Team" badge in the connectors section.
  const { data: teamMemberRows } = await supabase
    .from('connector_team_members')
    .select('connector_id, team:connector_teams!inner(name)');
  const teamByConnector = new Map<string, string>();
  for (const r of (teamMemberRows ?? []) as unknown as Array<{
    connector_id: string;
    team: { name: string } | null;
  }>) {
    if (r.team) teamByConnector.set(r.connector_id, r.team.name);
  }
  const participants = (participantsResult.data ?? []) as ParticipantRow[];
  const campuses = (campusesResult.data ?? []) as CampusRow[];

  const campusName = (id: string | null): string =>
    !id ? '—' : campuses.find((c) => c.id === id)?.name ?? '—';

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const churchAdmins = profiles.filter(
    (p) => p.is_platform_admin || p.role === 'church_admin',
  );
  const campusAdmins = profiles.filter(
    (p) => !p.is_platform_admin && p.role === 'campus_admin',
  );
  // Connectors section — sourced from connectors table to include is_active
  const connectorsView = connectors
    .map((c) => {
      const profile = profileById.get(c.profile_id);
      if (!profile) return null;
      return { connector: c, profile };
    })
    .filter((x): x is { connector: ConnectorRow; profile: Profile } => x !== null);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            People
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Everyone connected to your church — admins, connectors, and participants.
          </p>
        </div>
        {canManage && (
          <Link href="/people/invite">
            <Button>
              <UserPlus className="h-4 w-4" />
              Invite staff
            </Button>
          </Link>
        )}
      </div>

      <Section
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Church admins"
        count={churchAdmins.length}
        empty="No church admins yet."
        addHref={canManage ? '/people/promote?role=church_admin' : null}
        addLabel="Add admin"
      >
        {churchAdmins.map((p) => (
          <PersonRow
            key={p.id}
            href={canManage ? `/people/${p.id}` : null}
            name={`${p.first_name} ${p.last_name}`}
            email={p.email}
            campus={campusName(p.campus_id)}
            badges={
              <>
                <Badge tone={ROLE_TONE.church_admin}>Church admin</Badge>
                {p.is_platform_admin && <Badge tone="primary">Platform</Badge>}
              </>
            }
            action={
              canManage && p.id !== myId && (isPlatform || !p.is_platform_admin) ? (
                <ConfirmDeleteButton
                  icon
                  label={`Delete ${p.first_name} ${p.last_name}`}
                  message={`Permanently delete ${p.first_name} ${p.last_name}'s account? This removes their login and admin access and cannot be undone.`}
                  action={deleteStaffAccount.bind(null, p.id)}
                />
              ) : undefined
            }
          />
        ))}
      </Section>

      <Section
        icon={<ShieldHalf className="h-4 w-4" />}
        title="Campus admins"
        count={campusAdmins.length}
        empty="No campus admins yet."
        addHref={canManage ? '/people/promote?role=campus_admin' : null}
        addLabel="Add campus admin"
      >
        {campusAdmins.map((p) => (
          <PersonRow
            key={p.id}
            href={canManage ? `/people/${p.id}` : null}
            name={`${p.first_name} ${p.last_name}`}
            email={p.email}
            campus={campusName(p.campus_id)}
            badges={<Badge tone={ROLE_TONE.campus_admin}>Campus admin</Badge>}
            action={
              canManage && p.id !== myId ? (
                <ConfirmDeleteButton
                  icon
                  label={`Delete ${p.first_name} ${p.last_name}`}
                  message={`Permanently delete ${p.first_name} ${p.last_name}'s account? This removes their login and admin access and cannot be undone.`}
                  action={deleteStaffAccount.bind(null, p.id)}
                />
              ) : undefined
            }
          />
        ))}
      </Section>

      <Section
        icon={<Users className="h-4 w-4" />}
        title="Connectors"
        count={connectorsView.length}
        empty="No connectors yet."
        addHref={canManageConnectors ? '/connectors/new' : null}
        addLabel="Add connector"
      >
        {connectorsView.map(({ connector, profile }) => (
          <PersonRow
            key={connector.id}
            href={`/connectors/${connector.id}`}
            name={`${profile.first_name} ${profile.last_name}`}
            email={profile.email}
            campus={campusName(connector.campus_id)}
            badges={
              <>
                <Badge tone={ROLE_TONE.connector}>Connector</Badge>
                {teamByConnector.has(connector.id) && (
                  <Badge tone="info">Team: {teamByConnector.get(connector.id)}</Badge>
                )}
                {!connector.is_active && <Badge tone="neutral">Inactive</Badge>}
              </>
            }
            action={
              canManage && profile.id !== myId ? (
                <ConfirmDeleteButton
                  icon
                  label={`Delete ${profile.first_name} ${profile.last_name}`}
                  message={`Permanently delete ${profile.first_name} ${profile.last_name}'s account? This removes their login and connector record and cannot be undone.`}
                  action={deleteStaffAccount.bind(null, profile.id)}
                />
              ) : undefined
            }
          />
        ))}
      </Section>

      <Section
        icon={<UserPlus className="h-4 w-4" />}
        title="Participants"
        count={participants.length}
        empty="No participants yet."
        addHref="/participants/new"
        addLabel="Add participant"
        footer={
          participants.length >= 200 ? (
            <Link
              href="/participants"
              className="text-xs text-primary hover:underline"
            >
              View all participants →
            </Link>
          ) : null
        }
      >
        {participants.map((p) => (
          <PersonRow
            key={p.id}
            href={`/participants/${p.id}`}
            name={`${p.first_name} ${p.last_name}`}
            email={p.email}
            campus={campusName(p.campus_id)}
            badges={
              <>
                <Badge tone={ROLE_TONE.participant}>Participant</Badge>
                {p.status === 'completed' ? (
                  <Badge tone="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Journey complete
                  </Badge>
                ) : (
                  <Badge tone="neutral">{p.status.replace('_', ' ')}</Badge>
                )}
                {!p.profile_id && (
                  <Badge tone="warning" className="text-[10px]">No login</Badge>
                )}
              </>
            }
            action={
              canManage ? (
                <ConfirmDeleteButton
                  icon
                  label={`Delete ${p.first_name} ${p.last_name}`}
                  message={`Permanently delete ${p.first_name} ${p.last_name}'s account? This removes their login, journey, and assessment data and cannot be undone.`}
                  action={deleteParticipantAccount.bind(null, p.id)}
                />
              ) : undefined
            }
          />
        ))}
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  empty,
  addHref,
  addLabel,
  footer,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  empty: string;
  addHref: string | null;
  addLabel: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const isEmpty = items.filter(Boolean).length === 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-surface-muted text-foreground-muted">
            {icon}
          </span>
          {title}
          <span className="text-foreground-subtle">({count})</span>
        </h2>
        {addHref && (
          <Link href={addHref}>
            <Button variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" />
              {addLabel}
            </Button>
          </Link>
        )}
      </div>

      {isEmpty ? (
        <div className="rounded-md border border-dashed border-border bg-surface p-4 text-center text-xs text-foreground-subtle">
          {empty}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {children}
        </ul>
      )}

      {footer && <div>{footer}</div>}
    </section>
  );
}

function PersonRow({
  href,
  name,
  email,
  campus,
  badges,
  action,
}: {
  href: string | null;
  name: string;
  email: string | null;
  campus: string;
  badges: React.ReactNode;
  action?: React.ReactNode;
}) {
  const inner = (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {(name.match(/\b\w/g) ?? []).slice(0, 2).join('').toUpperCase() || '?'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p className="truncate text-xs text-foreground-subtle">
            {email ?? 'no email'} · {campus}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {badges}
      </div>
    </div>
  );

  // The delete control lives outside the navigation Link so clicking it
  // never triggers row navigation.
  return (
    <li className="flex items-stretch">
      {href ? (
        <Link href={href} className="block min-w-0 flex-1 hover:bg-surface-muted/60">
          {inner}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{inner}</div>
      )}
      {action && <div className="flex flex-none items-center pr-2">{action}</div>}
    </li>
  );
}
