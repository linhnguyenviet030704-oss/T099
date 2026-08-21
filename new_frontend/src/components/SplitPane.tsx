import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  /** initial width of the left pane in percent (0-100) */
  initialLeftPct?: number;
  /** clamp bounds for the left pane width in percent */
  minPct?: number;
  maxPct?: number;
  /** below this viewport width the panes stack vertically (no splitter) */
  stackBelowPx?: number;
}

/**
 * Two horizontally-arranged panes separated by a draggable divider. Dragging
 * the divider left/right resizes the panes so their widths always sum to 100%.
 * Below `stackBelowPx` the layout stacks vertically and the divider hides.
 */
export const SplitPane: React.FC<SplitPaneProps> = ({
  left,
  right,
  initialLeftPct = 38,
  minPct = 22,
  maxPct = 78,
  stackBelowPx = 1024,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPct, setLeftPct] = useState(initialLeftPct);
  const [dragging, setDragging] = useState(false);
  const [isWide, setIsWide] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= stackBelowPx : true,
  );

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= stackBelowPx);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [stackBelowPx]);

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(maxPct, Math.max(minPct, pct)));
    },
    [minPct, maxPct],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      updateFromClientX(e.clientX);
    };
    const onUp = () => setDragging(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // Prevent text selection / set resize cursor while dragging
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging, updateFromClientX]);

  if (!isWide) {
    return (
      <div className="flex flex-col gap-4">
        <div>{left}</div>
        <div>{right}</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex items-stretch w-full">
      <div style={{ width: `${leftPct}%` }} className="min-w-0">
        {left}
      </div>

      {/* Draggable divider */}
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDragging(true);
        }}
        onDoubleClick={() => setLeftPct(initialLeftPct)}
        title="Kéo để chỉnh kích thước · nhấn đúp để đặt lại"
        className={`group relative shrink-0 w-3 mx-1 flex items-center justify-center cursor-col-resize select-none ${
          dragging ? '' : ''
        }`}
      >
        <div
          className={`h-full w-[3px] rounded-full transition-colors ${
            dragging
              ? 'bg-emerald-500'
              : 'bg-slate-800 group-hover:bg-emerald-500/60'
          }`}
        />
        <div
          className={`absolute flex items-center justify-center w-5 h-10 rounded-md border transition-colors ${
            dragging
              ? 'bg-emerald-500 border-emerald-400 text-slate-950'
              : 'bg-slate-900 border-slate-700 text-slate-500 group-hover:text-emerald-400 group-hover:border-emerald-500/50'
          }`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      </div>

      <div style={{ width: `${100 - leftPct}%` }} className="min-w-0">
        {right}
      </div>
    </div>
  );
};

export default SplitPane;
