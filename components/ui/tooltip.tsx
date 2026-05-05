'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type Side = 'top' | 'bottom';

export interface TooltipProps {
  /** Rich content shown in the bubble. May contain links — they remain hoverable. */
  content: React.ReactNode;
  /** The element that triggers the tooltip on hover. Receives ref + handlers. */
  children: React.ReactElement;
  /** Preferred side. Will flip if there's no room. Default: 'top'. */
  side?: Side;
  /** ms to wait before showing. Default: 80. */
  openDelay?: number;
  /** ms to wait before hiding when cursor leaves. Default: 120 (lets cursor cross gap to bubble). */
  closeDelay?: number;
  /** Constrain bubble width. Default: 280px. */
  maxWidth?: number;
  className?: string;
}

interface Position {
  top: number;
  left: number;
  side: Side;
}

const GAP = 8;

export function Tooltip({
  content,
  children,
  side = 'top',
  openDelay = 80,
  closeDelay = 120,
  maxWidth = 280,
  className,
}: TooltipProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearTimers = useCallback(() => {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const compute = useCallback(() => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;
    const t = trigger.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let chosen: Side = side;
    const fitsTop = t.top - GAP - b.height >= 4;
    const fitsBottom = t.bottom + GAP + b.height <= vh - 4;
    if (chosen === 'top' && !fitsTop && fitsBottom) chosen = 'bottom';
    if (chosen === 'bottom' && !fitsBottom && fitsTop) chosen = 'top';

    const top =
      chosen === 'top'
        ? t.top - GAP - b.height + window.scrollY
        : t.bottom + GAP + window.scrollY;

    let left = t.left + t.width / 2 - b.width / 2 + window.scrollX;
    const minLeft = 4 + window.scrollX;
    const maxLeft = vw - b.width - 4 + window.scrollX;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    setPos({ top, left, side: chosen });
  }, [side]);

  const show = useCallback(() => {
    clearTimers();
    openTimer.current = window.setTimeout(() => {
      setOpen(true);
      // Compute position after the bubble has rendered.
      requestAnimationFrame(compute);
    }, openDelay);
  }, [clearTimers, compute, openDelay]);

  const hide = useCallback(() => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), closeDelay);
  }, [clearTimers, closeDelay]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => compute();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, compute]);

  if (!isValidElement(children)) return children;

  const childProps = children.props as Record<string, unknown>;
  const triggerProps = {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // Forward the node to the child's existing ref, if any. React 19 passes
      // refs as a normal prop, so we need to mirror it explicitly.
      const incoming = (children as { ref?: unknown }).ref;
      if (typeof incoming === 'function') {
        (incoming as (n: HTMLElement | null) => void)(node);
      } else if (incoming && typeof incoming === 'object') {
        // eslint-disable-next-line react-hooks/immutability
        (incoming as { current: HTMLElement | null }).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      (childProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      (childProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      show();
      (childProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      (childProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
    },
  };

  return (
    <>
      {cloneElement(children, triggerProps)}
      {mounted && open
        ? createPortal(
            <div
              ref={bubbleRef}
              role="tooltip"
              onMouseEnter={() => clearTimers()}
              onMouseLeave={hide}
              style={{
                position: 'absolute',
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                maxWidth,
                visibility: pos ? 'visible' : 'hidden',
              }}
              className={cn(
                'z-50 rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground shadow-lg',
                className,
              )}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
