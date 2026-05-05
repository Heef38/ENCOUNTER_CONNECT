import { requirePlatformAdmin } from '@/lib/auth/dal';
import { getTestChurchStatus } from '@/lib/testing/test-data';
import { TEST_PASSWORD, TEST_USERS } from '@/lib/testing/test-users';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { TestDataButtons } from './test-data-buttons';

export const dynamic = 'force-dynamic';

export default async function PlatformTestDataPage() {
  await requirePlatformAdmin();
  const status = await getTestChurchStatus();

  const existingByEmail = new Map(status.users.map((u) => [u.email, u]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Test data
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Spin up an isolated &ldquo;Test Church&rdquo; tenant with one user
            for each role so you can log in and walk through the whole product
            end-to-end. Wipe deletes the church and every test auth user.
          </p>
        </div>
        <TestDataButtons exists={status.exists} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            {status.exists
              ? 'Test church is seeded.'
              : 'Test church is not seeded yet. Click "Seed test church" to provision it.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CountTile label="Church admins"  value={status.userCounts.churchAdmins} />
            <CountTile label="Campus admins"  value={status.userCounts.campusAdmins} />
            <CountTile label="Connectors"     value={status.userCounts.connectors} />
            <CountTile label="Participants"   value={status.userCounts.participants} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test logins</CardTitle>
          <CardDescription>
            Every test user has the password{' '}
            <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              {TEST_PASSWORD}
            </code>
            . Sign out, then sign in as any of these to see the product from
            that role&rsquo;s perspective.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border">
            <Table>
              <THead>
                <TR>
                  <TH>Role</TH>
                  <TH>Email</TH>
                  <TH>Name</TH>
                  <TH>What they test</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {TEST_USERS.map((spec) => {
                  const present = existingByEmail.has(spec.email);
                  return (
                    <TR key={spec.key}>
                      <TD>
                        <RoleBadge role={spec.role} />
                      </TD>
                      <TD className="font-mono text-xs text-foreground-muted">
                        {spec.email}
                      </TD>
                      <TD className="text-foreground-muted">
                        {spec.firstName} {spec.lastName}
                      </TD>
                      <TD className="text-xs text-foreground-muted">{spec.label}</TD>
                      <TD>
                        {present ? (
                          <Badge tone="success">Seeded</Badge>
                        ) : (
                          <Badge tone="neutral">Not seeded</Badge>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What gets seeded</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 text-sm text-foreground-muted">
            <li>
              <span className="font-medium text-foreground">Test Church</span>{' '}
              tenant (slug{' '}
              <code className="rounded bg-surface-muted px-1 font-mono text-xs">
                test-church
              </code>
              ) with one campus.
            </li>
            <li>Seven auth users + profiles, one per role above.</li>
            <li>
              Two{' '}
              <code className="rounded bg-surface-muted px-1 font-mono text-xs">
                connectors
              </code>{' '}
              rows so the auto-match path has someone to match against.
            </li>
            <li>
              A &ldquo;Test Journey&rdquo; flow with the full Encounter Connect
              template (video → 3 assessments → schedule, output =
              auto_match_connector).
            </li>
            <li>
              <span className="font-medium text-foreground">
                participant-mid
              </span>{' '}
              has progress initialized (first step active).{' '}
              <span className="font-medium text-foreground">
                participant-done
              </span>{' '}
              has every step marked completed.{' '}
              <span className="font-medium text-foreground">
                participant-new
              </span>{' '}
              has no progress yet.
            </li>
          </ul>
          <p className="mt-3 text-xs text-foreground-subtle">
            Wipe deletes the test church (cascade-removes campuses, flows,
            connectors, participants) and every auth user on{' '}
            <code className="font-mono">@test.local</code>. Real tenants are
            untouched because the harness only ever writes to{' '}
            <code className="font-mono">test-church</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-foreground-subtle">
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const tone =
    role === 'church_admin' ? 'info' :
    role === 'campus_admin' ? 'info' :
    role === 'connector'    ? 'success' :
                              'primary';
  return <Badge tone={tone}>{role.replace(/_/g, ' ')}</Badge>;
}
