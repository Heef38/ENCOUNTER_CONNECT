'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { IMPORT_FIELDS, guessMapping, parseCsv, toImportRow, type ImportField, type ImportRow, type Mapping } from '@/lib/import/csv';
import { importPeople, sendPreparedInvites, type ImportReport, type NewGroupKind } from '@/lib/import/actions';

const select = 'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground';

export function ImportForm({
  campuses,
  preparedInvites,
  defaultCampusId,
}: {
  campuses: Array<{ id: string; name: string }>;
  preparedInvites: number;
  defaultCampusId: string | null;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [kind, setKind] = useState<'member' | 'guest'>('member');
  const [campusId, setCampusId] = useState<string>(defaultCampusId ?? (campuses.length === 1 ? campuses[0].id : ''));
  const [groupKind, setGroupKind] = useState<NewGroupKind>('home_group');
  const [sendInvites, setSendInvites] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sentPrepared, setSentPrepared] = useState<string | null>(null);

  const headers = table?.[0] ?? [];
  const body = useMemo(() => (table ? table.slice(1) : []), [table]);
  const parsed = useMemo(() => body.map((cells) => toImportRow(cells, mapping)), [body, mapping]);
  const good = parsed.filter((r): r is ImportRow => !('error' in r));

  async function onFile(file: File | undefined) {
    setReport(null);
    setFileError(null);
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setFileError('That file is over 8 MB. Split it into smaller files.');
      return;
    }
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      setFileError('The file needs a header row and at least one person.');
      return;
    }
    setFileName(file.name);
    setTable(rows);
    setMapping(guessMapping(rows[0]));
  }

  function setField(field: ImportField, value: string) {
    setMapping((m) => {
      const next = { ...m };
      if (value === '') delete next[field];
      else next[field] = Number(value);
      return next;
    });
  }

  function submit() {
    // Every line goes to the server, bad ones included, so its report can
    // name the line in the file.
    const rows: ImportRow[] = parsed.map((r) =>
      'error' in r ? { first_name: '', last_name: '', email: null, phone: null, external_id: null, joined_on: null, groups: [] } : r,
    );
    start(async () => {
      const result = await importPeople({ kind, rows, campusId: campusId || null, newGroupKind: groupKind, sendInvites: kind === 'member' && sendInvites });
      setReport(result);
    });
  }

  if (report?.ok) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5 text-sm">
          <h2 className="font-display text-lg font-medium text-foreground">Imported</h2>
          <ul className="space-y-1 text-foreground">
            <li>{report.created} added, {report.updated} already here and updated.</li>
            {report.groupsCreated > 0 && <li>{report.groupsCreated} new groups created.</li>}
            {report.groupLinks > 0 && <li>{report.groupLinks} group memberships added for people who have accounts.</li>}
            {kind === 'member' && (
              <li>
                {report.invitesPrepared} invites prepared
                {report.invitesQueued ? `, ${report.invitesQueued} on their way over the next while` : ', not sent yet'}.
              </li>
            )}
            {report.groupsWaiting > 0 && <li>{report.groupsWaiting} group memberships wait until those people have accounts.</li>}
          </ul>
          {report.skipped.length > 0 && (
            <div className="space-y-1">
              <p className="font-medium text-foreground">Skipped {report.skipped.length}:</p>
              <ul className="max-h-48 overflow-auto text-xs text-foreground-muted">
                {report.skipped.slice(0, 200).map((s) => (
                  <li key={`${s.line}-${s.reason}`}>
                    Line {s.line}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link href="/people">
              <Button variant="outline">Back to People</Button>
            </Link>
            <Button
              variant="ghost"
              onClick={() => {
                setReport(null);
                setTable(null);
                setFileName(null);
              }}
            >
              Import another file
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {preparedInvites > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span className="text-foreground">
              {sentPrepared ?? `${preparedInvites} imported members have invites ready that haven't been sent.`}
            </span>
            {!sentPrepared && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await sendPreparedInvites();
                    setSentPrepared(r.ok ? `${r.queued} invites are on their way. They go out over the next while.` : (r.error ?? 'Could not send.'));
                  })
                }
              >
                Send them now
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <Label htmlFor="file">CSV file</Label>
            <input
              id="file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="mt-1 block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5"
            />
            <p className="mt-1 text-xs text-foreground-subtle">
              A Planning Center People export works as it is. So does any spreadsheet saved as CSV with a header row.
            </p>
            {fileError && <p className="mt-1 text-sm text-danger">{fileError}</p>}
          </div>
        </CardContent>
      </Card>

      {table && (
        <>
          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="font-display text-lg font-medium text-foreground">Who is in {fileName}?</h2>
              <fieldset className="space-y-2 text-sm text-foreground">
                <label className="flex items-start gap-2">
                  <input type="radio" name="kind" checked={kind === 'member'} onChange={() => setKind('member')} className="mt-0.5" />
                  <span>
                    People who already belong here
                    <span className="block text-xs text-foreground-muted">They come in as members and never show up as newcomers.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name="kind" checked={kind === 'guest'} onChange={() => setKind('guest')} className="mt-0.5" />
                  <span>
                    New people to welcome
                    <span className="block text-xs text-foreground-muted">
                      They come in as newcomers. The date they first came starts their contact clock, so nobody looks newer than they are.
                    </span>
                  </span>
                </label>
              </fieldset>
              {campuses.length > 1 && (
                <div>
                  <Label htmlFor="campus">Campus</Label>
                  <select id="campus" value={campusId} onChange={(e) => setCampusId(e.target.value)} className={select}>
                    <option value="">No campus</option>
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {mapping.groups !== undefined && (
                <div>
                  <Label htmlFor="group_kind">Groups in the file that you don&apos;t have yet are</Label>
                  <select id="group_kind" value={groupKind} onChange={(e) => setGroupKind(e.target.value as NewGroupKind)} className={select}>
                    <option value="home_group">Small groups</option>
                    <option value="ministry">Ministries</option>
                    <option value="serve">Serve teams</option>
                    <option value="interest">Interest groups</option>
                    <option value="custom">Other</option>
                  </select>
                </div>
              )}
              {kind === 'member' && (
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={sendInvites} onChange={(e) => setSendInvites(e.target.checked)} className="mt-0.5" />
                  <span>
                    Email each of them an invite now
                    <span className="block text-xs text-foreground-muted">
                      Leave this off to send the invites later, from this page, once you&apos;ve had a look.
                    </span>
                  </span>
                </label>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="font-display text-lg font-medium text-foreground">Match the columns</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {IMPORT_FIELDS.map((f) => (
                  <div key={f.key}>
                    <Label htmlFor={`map_${f.key}`}>{f.label}</Label>
                    <select
                      id={`map_${f.key}`}
                      value={mapping[f.key] === undefined ? '' : String(mapping[f.key])}
                      onChange={(e) => setField(f.key, e.target.value)}
                      className={select}
                    >
                      <option value="">Not in this file</option>
                      {headers.map((h, i) => (
                        <option key={`${h}-${i}`} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-xs">
                  <thead className="text-foreground-subtle">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Name</th>
                      <th className="py-1 pr-3 font-medium">Email</th>
                      <th className="py-1 pr-3 font-medium">Phone</th>
                      <th className="py-1 pr-3 font-medium">First came</th>
                      <th className="py-1 font-medium">Groups</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground">
                    {parsed.slice(0, 6).map((r, i) =>
                      'error' in r ? (
                        <tr key={i} className="text-danger">
                          <td colSpan={5} className="py-1">
                            Line {i + 2}: {r.error}
                          </td>
                        </tr>
                      ) : (
                        <tr key={i} className="border-t border-border">
                          <td className="py-1 pr-3">
                            {r.first_name} {r.last_name}
                          </td>
                          <td className="py-1 pr-3">{r.email ?? '—'}</td>
                          <td className="py-1 pr-3">{r.phone ?? '—'}</td>
                          <td className="py-1 pr-3">{r.joined_on ? r.joined_on.slice(0, 10) : '—'}</td>
                          <td className="py-1">{r.groups.join(', ') || '—'}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-foreground-subtle">
                {good.length} of {parsed.length} rows are ready.
                {parsed.length - good.length > 0 ? ` ${parsed.length - good.length} have no first name and will be skipped.` : ''}
              </p>
            </CardContent>
          </Card>

          {report && !report.ok && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{report.error}</p>}
          <Button onClick={submit} disabled={pending || good.length === 0}>
            {pending ? 'Importing…' : `Import ${good.length} ${kind === 'member' ? 'members' : 'new people'}`}
          </Button>
        </>
      )}
    </div>
  );
}
