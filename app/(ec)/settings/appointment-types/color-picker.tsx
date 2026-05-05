'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { PALETTE } from '@/lib/dashboard/colors';
import { cn } from '@/lib/utils';
import { setAppointmentTypeColor } from './actions';

interface Props {
  appointmentTypeId: string;
  current: string | null;
  fallback: string;
  appointmentName: string;
}

export function ColorPicker({ appointmentTypeId, current, fallback, appointmentName }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-color-popover]') || t.closest('[data-color-trigger]')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
      });
    }
    setOpen(true);
  }

  function pick(hex: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await setAppointmentTypeColor(appointmentTypeId, hex);
      if (!res.ok) setError(res.error ?? 'Could not save.');
      else setOpen(false);
    });
  }

  const display = current ?? fallback;
  const isUnset = current === null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-color-trigger
        onClick={toggle}
        disabled={pending}
        aria-label={`Change color for ${appointmentName}`}
        className={cn(
          'group flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground-muted hover:border-border-strong hover:text-foreground',
          pending && 'opacity-60',
        )}
      >
        <span
          className="h-4 w-4 rounded-full ring-1 ring-border"
          style={{ background: display }}
        />
        <span>{isUnset ? 'Default' : display.toUpperCase()}</span>
      </button>

      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-color-popover
              style={{ position: 'absolute', top: pos.top, left: pos.left }}
              className="z-50 w-56 rounded-md border border-border bg-surface p-3 shadow-xl"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
                  Pick a color
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-foreground-subtle hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {PALETTE.map((c) => {
                  const selected = current?.toLowerCase() === c.hex.toLowerCase();
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => pick(c.hex)}
                      disabled={pending}
                      title={c.name}
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-border transition-transform hover:scale-110',
                        selected && 'ring-2 ring-foreground',
                      )}
                      style={{ background: c.hex }}
                    >
                      {selected && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
                    </button>
                  );
                })}
              </div>
              {!isUnset && (
                <button
                  type="button"
                  onClick={() => pick(null)}
                  disabled={pending}
                  className="mt-3 w-full rounded-md border border-border px-2 py-1 text-xs text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                >
                  Reset to default
                </button>
              )}
              {error && (
                <p className="mt-2 text-xs text-danger">{error}</p>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
