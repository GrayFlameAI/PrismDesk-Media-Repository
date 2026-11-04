import React, { useEffect, useRef, useState } from 'react';

interface VirtualGridCellProps {
  children: React.ReactNode;
  /** Estimated height in px before first measurement */
  estimatedHeight?: number;
  /** Viewport buffer margin around scroll viewport */
  rootMargin?: string;
}

/**
 * Lightweight Virtual Scrolling Cell powered by native IntersectionObserver.
 * Only mounts child DOM when inside the viewport (plus vertical buffer);
 * unmounts offscreen cards and preserves exact layout height to prevent scroll jump.
 */
export const VirtualGridCell: React.FC<VirtualGridCellProps> = ({
  children,
  estimatedHeight = 220,
  rootMargin = '420px 0px',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [measuredHeight, setMeasuredHeight] = useState<number>(estimatedHeight);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setIsVisible(true);
        } else {
          // Record current rendered height before unmounting child DOM
          if (entry.boundingClientRect.height > 40) {
            setMeasuredHeight(entry.boundingClientRect.height);
          }
          setIsVisible(false);
        }
      },
      {
        root: null,
        rootMargin,
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [rootMargin]);

  return (
    <div
      ref={containerRef}
      style={!isVisible ? { minHeight: `${measuredHeight}px` } : undefined}
      className="w-full"
    >
      {isVisible ? (
        children
      ) : (
        <div
          style={{ height: `${measuredHeight}px` }}
          className="w-full rounded-xl bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800/60"
          aria-hidden="true"
        />
      )}
    </div>
  );
};
