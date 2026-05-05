'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import type {
  SchedulingAvailabilityRule,
  SchedulingBlackout,
  SchedulingAvailabilityRuleType,
  CreateAvailabilityRuleInput,
  CreateBlackoutInput,
} from '@/lib/scheduling/types';
import {
  actionCreateAvailabilityRule,
  actionDeleteAvailabilityRule,
  actionCreateBlackout,
  actionDeleteBlackout,
} from '@/app/scheduling/actions';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface AvailabilityEditorProps {
  resourceId: string;
  initialRules: SchedulingAvailabilityRule[];
  initialBlackouts: SchedulingBlackout[];
}

export function AvailabilityEditor({
  resourceId,
  initialRules,
  initialBlackouts,
}: AvailabilityEditorProps) {
  const [rules, setRules] = useState(initialRules);
  const [blackouts, setBlackouts] = useState(initialBlackouts);
  const [tab, setTab] = useState<'rules' | 'blackouts'>('rules');

  // ── RULE FORM STATE ──────────────────────────────
  const [ruleType, setRuleType] = useState<SchedulingAvailabilityRuleType>('recurring');

  // recurring fields
  const [rDay, setRDay] = useState(1);
  const [rRecurFrom, setRRecurFrom] = useState(''); // optional date range start for recurring
  const [rRecurUntil, setRRecurUntil] = useState('');

  // date_specific fields
  const [rDateFrom, setRDateFrom] = useState('');
  const [rDateUntil, setRDateUntil] = useState('');

  // shared time fields
  const [rStart, setRStart] = useState('09:00');
  const [rEnd, setREnd] = useState('17:00');
  const [rLoading, setRLoading] = useState(false);
  const [rError, setRError] = useState<string | null>(null);

  // ── BLACKOUT FORM STATE ──────────────────────────
  const [bTitle, setBTitle] = useState('');
  const [bReason, setBReason] = useState('');
  const [bStart, setBStart] = useState('');
  const [bEnd, setBEnd] = useState('');
  const [bLoading, setBLoading] = useState(false);
  const [bError, setBError] = useState<string | null>(null);

  // ── HELPERS ─────────────────────────────────────
  const inputCls = 'rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  // ── ADD RULE ─────────────────────────────────────
  async function addRule() {
    setRLoading(true);
    setRError(null);

    const input: CreateAvailabilityRuleInput = {
      resource_id: resourceId,
      rule_type: ruleType,
      start_time: rStart + ':00',
      end_time:   rEnd + ':00',
      ...(ruleType === 'recurring'
        ? {
            day_of_week:    rDay,
            effective_from:  rRecurFrom  || undefined,
            effective_until: rRecurUntil || undefined,
          }
        : {
            effective_from:  rDateFrom,
            effective_until: rDateUntil || rDateFrom,
          }),
    };

    const result = await actionCreateAvailabilityRule(input);
    if (result.success) {
      setRules([...rules, result.data as SchedulingAvailabilityRule]);
      // reset date_specific fields after save
      setRDateFrom(''); setRDateUntil('');
    } else {
      setRError(result.error);
    }
    setRLoading(false);
  }

  async function deleteRule(id: string) {
    const result = await actionDeleteAvailabilityRule(id);
    if (result.success) setRules(rules.filter((r) => r.id !== id));
  }

  // ── ADD BLACKOUT ──────────────────────────────────
  async function addBlackout() {
    setBLoading(true);
    setBError(null);
    const input: CreateBlackoutInput = {
      resource_id: resourceId,
      scope: 'resource',
      title: bTitle,
      reason: bReason || undefined,
      starts_at: new Date(bStart).toISOString(),
      ends_at: new Date(bEnd).toISOString(),
    };
    const result = await actionCreateBlackout(input);
    if (result.success) {
      setBlackouts([...blackouts, result.data as SchedulingBlackout]);
      setBTitle(''); setBReason(''); setBStart(''); setBEnd('');
    } else {
      setBError(result.error);
    }
    setBLoading(false);
  }

  async function deleteBlackout(id: string) {
    const result = await actionDeleteBlackout(id);
    if (result.success) setBlackouts(blackouts.filter((b) => b.id !== id));
  }

  // ── RULE LABEL ────────────────────────────────────
  function ruleLabel(rule: SchedulingAvailabilityRule) {
    const time = `${rule.start_time.slice(0, 5)} – ${rule.end_time.slice(0, 5)}`;
    if ((rule.rule_type ?? 'recurring') === 'recurring') {
      const day = rule.day_of_week !== null ? DAY_FULL[rule.day_of_week] : '?';
      const range = rule.effective_from
        ? ` (${format(parseISO(rule.effective_from), 'MMM d')} – ${format(parseISO(rule.effective_until ?? rule.effective_from), 'MMM d')})`
        : '';
      return `${day}  ${time}${range}`;
    }
    // date_specific
    const from  = rule.effective_from  ? format(parseISO(rule.effective_from),  'MMM d, yyyy') : '?';
    const until = rule.effective_until ? format(parseISO(rule.effective_until), 'MMM d, yyyy') : from;
    const range = from === until ? from : `${from} – ${until}`;
    return `${range}  ${time}`;
  }

  const canAddRule =
    ruleType === 'recurring'
      ? true
      : rDateFrom !== '';

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-6 flex gap-4 border-b border-gray-200">
        {(['rules', 'blackouts'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 text-sm font-medium capitalize ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'rules' ? 'Availability Rules' : 'Blackouts'}
          </button>
        ))}
      </div>

      {/* ── AVAILABILITY RULES ── */}
      {tab === 'rules' && (
        <div className="space-y-5">
          {/* Rule type toggle */}
          <div className="flex gap-3">
            {(['recurring', 'date_specific'] as const).map((rt) => (
              <button
                key={rt}
                onClick={() => setRuleType(rt)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  ruleType === rt
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {rt === 'recurring' ? 'Recurring (weekly)' : 'Specific Date(s)'}
              </button>
            ))}
          </div>

          {/* Recurring rule form */}
          {ruleType === 'recurring' && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Repeats every week on selected day
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Day of Week</label>
                  <select value={rDay} onChange={(e) => setRDay(+e.target.value)} className={inputCls}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                  <input type="time" value={rStart} onChange={(e) => setRStart(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                  <input type="time" value={rEnd} onChange={(e) => setREnd(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Active From (optional)</label>
                  <input type="date" value={rRecurFrom} onChange={(e) => setRRecurFrom(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Active Until (optional)</label>
                  <input type="date" value={rRecurUntil} onChange={(e) => setRRecurUntil(e.target.value)} className={inputCls} />
                </div>
                <button
                  onClick={addRule} disabled={rLoading}
                  className="self-end rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Add Recurring Rule
                </button>
              </div>
            </div>
          )}

          {/* Date-specific rule form */}
          {ruleType === 'date_specific' && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Available on a specific date or date range
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
                  <input type="date" value={rDateFrom} onChange={(e) => setRDateFrom(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    End Date <span className="text-gray-400">(leave blank for single day)</span>
                  </label>
                  <input type="date" value={rDateUntil} onChange={(e) => setRDateUntil(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                  <input type="time" value={rStart} onChange={(e) => setRStart(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                  <input type="time" value={rEnd} onChange={(e) => setREnd(e.target.value)} className={inputCls} />
                </div>
                <button
                  onClick={addRule} disabled={rLoading || !canAddRule}
                  className="self-end rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Add Date Rule
                </button>
              </div>
            </div>
          )}

          {rError && <p className="text-sm text-red-600">{rError}</p>}

          {/* Rules list */}
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {rules.length === 0 && (
              <p className="p-4 text-sm text-gray-500">No availability rules yet.</p>
            )}
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-sm text-gray-800">{ruleLabel(rule)}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                    (rule.rule_type ?? 'recurring') === 'recurring'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-purple-50 text-purple-700'
                  }`}>
                    {(rule.rule_type ?? 'recurring') === 'recurring' ? 'recurring' : 'specific date'}
                  </span>
                  {!rule.is_active && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                </div>
                <button onClick={() => deleteRule(rule.id)} className="text-xs text-red-500 hover:text-red-700">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BLACKOUTS ── */}
      {tab === 'blackouts' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Mark unavailable for a specific time window
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                <input value={bTitle} onChange={(e) => setBTitle(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. Holiday, PTO, Staff Training" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
                <input value={bReason} onChange={(e) => setBReason(e.target.value)} className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start *</label>
                <input type="datetime-local" value={bStart} onChange={(e) => setBStart(e.target.value)} className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">End *</label>
                <input type="datetime-local" value={bEnd} onChange={(e) => setBEnd(e.target.value)} className={`${inputCls} w-full`} />
              </div>
            </div>
            <button
              onClick={addBlackout} disabled={bLoading || !bTitle || !bStart || !bEnd}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add Blackout
            </button>
            {bError && <p className="text-sm text-red-600">{bError}</p>}
          </div>

          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {blackouts.length === 0 && (
              <p className="p-4 text-sm text-gray-500">No blackouts recorded.</p>
            )}
            {blackouts.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{b.title}</p>
                  <p className="text-xs text-gray-500">
                    {format(parseISO(b.starts_at), 'MMM d, yyyy h:mm a')}
                    {' – '}
                    {format(parseISO(b.ends_at), 'MMM d, yyyy h:mm a')}
                    {b.reason ? ` · ${b.reason}` : ''}
                  </p>
                </div>
                <button onClick={() => deleteBlackout(b.id)} className="text-xs text-red-500 hover:text-red-700">
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
