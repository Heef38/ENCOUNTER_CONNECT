'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: 'left' | 'right';
  children: React.ReactNode;
  className?: string;
  /** Accessible label for the dialog itself. */
  label?: string;
}

/**
 * Minimal mobile drawer. Uses native <dialog> for focus trap and
 * backdrop. Tailwind `transition-transform` handles the slide-in.
 */
export function Sheet({
  open,
  onClose,
  side = 'left',
  children,
  className,
  label = 'Navigation',
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        // Close when clicking the backdrop (dialog element itself)
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        'fixed inset-0 m-0 h-full max-h-full w-full max-w-full bg-transparent p-0',
        'backdrop:bg-black/40 backdrop:backdrop-blur-sm',
      )}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'absolute top-0 flex h-full w-72 max-w-[85vw] flex-col bg-surface shadow-xl',
          side === 'left' ? 'left-0' : 'right-0',
          className,
        )}
      >
        {children}
      </div>
    </dialog>
  );
}
