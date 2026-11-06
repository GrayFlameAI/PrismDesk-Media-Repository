import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { MediaItem, ViewMode } from '../types';
import { MediaCard } from './MediaCard';

interface VirtualMediaGridProps {
  items: MediaItem[];
  viewMode: ViewMode;
  selectedMediaIds: Set<string>;
  scrollParent: HTMLElement | null;
  onToggleSelect: (id: string) => void;
  onBatchSelectIds?: (ids: Set<string>) => void;
  onOpenLightbox: (item: MediaItem) => void;
  onCopyItem: (item: MediaItem) => void;
  onDeleteItem: (id: string) => void;
  onSetAsFolderCover?: (item: MediaItem) => void;
  onContextMenuItem?: (e: React.MouseEvent, item: MediaItem) => void;
  onNativeDragStart?: (item: MediaItem, posterUrl?: string) => void;
  renderItemFooter?: (item: MediaItem) => React.ReactNode;
}

interface MarqueeBoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function computeColumnsForWidth(width: number, viewMode: ViewMode): number {
  const winW = typeof window !== 'undefined' ? window.innerWidth : width;
  if (viewMode === 'compact') {
    if (winW >= 1280) return 6;
    if (winW >= 1024) return 5;
    if (winW >= 768) return 4;
    if (winW >= 640) return 3;
    return 2;
  }
  if (viewMode === 'spacious') {
    if (winW >= 1024) return 4;
    if (winW >= 768) return 3;
    if (winW >= 640) return 2;
    return 1;
  }
  // normal
  if (winW >= 1280) return 5;
  if (winW >= 1024) return 4;
  if (winW >= 768) return 3;
  return 2;
}

export const VirtualMediaGrid: React.FC<VirtualMediaGridProps> = ({
  items,
  viewMode,
  selectedMediaIds,
  scrollParent,
  onToggleSelect,
  onBatchSelectIds,
  onOpenLightbox,
  onCopyItem,
  onDeleteItem,
  onSetAsFolderCover,
  onContextMenuItem,
  onNativeDragStart,
  renderItemFooter,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState<number>(() =>
    computeColumnsForWidth(typeof window !== 'undefined' ? window.innerWidth : 1280, viewMode)
  );

  // 任务三：左键长按滑动多选 / 桌面级矩形框选 (Marquee & Long-Press Swipe Selection)
  const [marqueeRect, setMarqueeRect] = useState<MarqueeBoxRect | null>(null);
  const [isSwipeSelectMode, setIsSwipeSelectMode] = useState(false);

  const selectedIdsRef = useRef<Set<string>>(selectedMediaIds);
  useEffect(() => {
    selectedIdsRef.current = selectedMediaIds;
  }, [selectedMediaIds]);

  const dragSessionRef = useRef<{
    active: boolean;
    startedSelection: boolean;
    canSelect: boolean;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    additive: boolean;
    initialSelected: Set<string>;
    originCardId: string | null;
    longPressTimer: ReturnType<typeof setTimeout> | null;
  }>({
    active: false,
    startedSelection: false,
    canSelect: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    additive: false,
    initialSelected: new Set(),
    originCardId: null,
    longPressTimer: null,
  });

  useEffect(() => {
    const updateColumns = () => {
      const w = wrapperRef.current?.clientWidth || window.innerWidth;
      const nextCols = computeColumnsForWidth(w, viewMode);
      setColumns((prev) => (prev === nextCols ? prev : nextCols));
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => {
      window.removeEventListener('resize', updateColumns);
    };
  }, [viewMode]);

  const rows = useMemo(() => {
    const result: MediaItem[][] = [];
    const safeCols = Math.max(1, columns);
    for (let i = 0; i < items.length; i += safeCols) {
      result.push(items.slice(i, i + safeCols));
    }
    return result;
  }, [items, columns]);

  const gridRowClass = useMemo(() => {
    if (viewMode === 'compact') {
      return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 pb-3';
    }
    if (viewMode === 'spacious') {
      return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pb-6';
    }
    return 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-4';
  }, [viewMode]);

  /**
   * 实时计算框选矩形与视口内所有 [data-media-id] 卡片的碰撞交集 (AABB 碰撞检测)
   */
  const computeAndApplyBoxSelection = useCallback(
    (box: MarqueeBoxRect, initialSet: Set<string>, additive: boolean, originCardId: string | null) => {
      if (!wrapperRef.current || !onBatchSelectIds) return;
      const nextSet = additive ? new Set(initialSet) : new Set<string>();
      if (originCardId) {
        nextSet.add(originCardId);
      }

      const boxRight = box.left + box.width;
      const boxBottom = box.top + box.height;

      const cardNodes = wrapperRef.current.querySelectorAll<HTMLElement>('[data-media-id]');
      cardNodes.forEach((node) => {
        const mediaId = node.getAttribute('data-media-id');
        if (!mediaId) return;
        const r = node.getBoundingClientRect();
        const intersects =
          r.left <= boxRight &&
          r.right >= box.left &&
          r.top <= boxBottom &&
          r.bottom >= box.top;
        if (intersects) {
          nextSet.add(mediaId);
        }
      });

      // 仅当集合发生变化时才触发状态更新，避免无效重渲染
      const prevSet = selectedIdsRef.current;
      let changed = prevSet.size !== nextSet.size;
      if (!changed) {
        for (const id of nextSet) {
          if (!prevSet.has(id)) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        onBatchSelectIds(nextSet);
      }
    },
    [onBatchSelectIds]
  );

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      const session = dragSessionRef.current;
      if (!session.active) return;

      session.currentX = e.clientX;
      session.currentY = e.clientY;

      const dx = Math.abs(e.clientX - session.startX);
      const dy = Math.abs(e.clientY - session.startY);
      const movedDistance = Math.hypot(dx, dy);

      // 如果用户在卡片上按下后未满 220ms 就立即大幅拖动，说明意图是“原生文件拖出到外部应用 (Task 4)”，取消长按框选
      if (!session.canSelect && movedDistance > 7) {
        if (session.longPressTimer) {
          clearTimeout(session.longPressTimer);
          session.longPressTimer = null;
        }
        session.active = false;
        return;
      }

      if (!session.canSelect) return;

      if (!session.startedSelection && movedDistance > 4) {
        session.startedSelection = true;
        setIsSwipeSelectMode(true);
      }

      if (session.startedSelection) {
        const box: MarqueeBoxRect = {
          left: Math.min(session.startX, e.clientX),
          top: Math.min(session.startY, e.clientY),
          width: Math.max(2, Math.abs(e.clientX - session.startX)),
          height: Math.max(2, Math.abs(e.clientY - session.startY)),
        };
        setMarqueeRect(box);
        computeAndApplyBoxSelection(box, session.initialSelected, session.additive, session.originCardId);

        // 当鼠标框选靠近滚动容器上下边缘时自动平滑滚屏
        if (scrollParent) {
          const spRect = scrollParent.getBoundingClientRect();
          const edgeThreshold = 48;
          if (e.clientY > spRect.bottom - edgeThreshold) {
            scrollParent.scrollTop += 14;
          } else if (e.clientY < spRect.top + edgeThreshold) {
            scrollParent.scrollTop -= 14;
          }
        }
      }
    };

    const stopSelectionSession = () => {
      const session = dragSessionRef.current;
      if (session.longPressTimer) {
        clearTimeout(session.longPressTimer);
        session.longPressTimer = null;
      }
      if (session.active || session.startedSelection) {
        session.active = false;
        session.startedSelection = false;
        session.canSelect = false;
        session.originCardId = null;
        setMarqueeRect(null);
        setIsSwipeSelectMode(false);
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove, { passive: true });
    window.addEventListener('mouseup', stopSelectionSession);
    window.addEventListener('dragstart', stopSelectionSession);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', stopSelectionSession);
      window.removeEventListener('dragstart', stopSelectionSession);
    };
  }, [computeAndApplyBoxSelection, scrollParent]);

  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 仅响应鼠标左键 (button === 0)
    if (e.button !== 0 || !onBatchSelectIds) return;

    const targetEl = e.target as HTMLElement | null;
    if (!targetEl) return;
    // 忽略按钮与输入框点击
    if (targetEl.closest('button, input, select, textarea, a')) return;

    const cardNode = targetEl.closest<HTMLElement>('[data-media-id]');
    const cardId = cardNode ? cardNode.getAttribute('data-media-id') : null;
    const isModifierPressed = e.shiftKey || e.ctrlKey || e.metaKey;

    const session = dragSessionRef.current;
    if (session.longPressTimer) {
      clearTimeout(session.longPressTimer);
      session.longPressTimer = null;
    }

    session.active = true;
    session.startedSelection = false;
    session.startX = e.clientX;
    session.startY = e.clientY;
    session.currentX = e.clientX;
    session.currentY = e.clientY;
    session.additive = isModifierPressed || selectedIdsRef.current.size > 0;
    session.initialSelected = new Set(selectedIdsRef.current);
    session.originCardId = cardId;

    if (!cardId || isModifierPressed) {
      // 在空白区域/卡片间隙按下左键（或按住 Shift/Ctrl）：立即允许拖拽拉出选择框
      session.canSelect = true;
    } else {
      // 在卡片上按下左键：区分“立即拖出文件到外部应用 (<220ms)”与“左键长按滑动多选 (>=220ms)”
      session.canSelect = false;
      session.longPressTimer = setTimeout(() => {
        if (!session.active) return;
        session.canSelect = true;
        session.startedSelection = true;
        setIsSwipeSelectMode(true);
        // 长按触发时立即选中起点卡片
        const next = new Set(session.initialSelected);
        next.add(cardId);
        onBatchSelectIds(next);
      }, 220);
    }
  };

  // 任务一：绑定基于物理文件路径的唯一稳定行 Key，严禁使用易变的数组 index
  const computeStableRowKey = useCallback((rowIndex: number, rowItems: MediaItem[]) => {
    if (!rowItems || rowItems.length === 0) return `empty_row_${rowIndex}`;
    return rowItems.map((m) => m.filePath || m.id).join('||');
  }, []);

  return (
    <div
      ref={wrapperRef}
      onMouseDown={handleContainerMouseDown}
      className="w-full relative min-h-[320px] select-none"
    >
      <Virtuoso
        useWindowScroll={false}
        customScrollParent={scrollParent || undefined}
        data={rows}
        computeItemKey={computeStableRowKey}
        defaultItemHeight={240}
        overscan={480}
        increaseViewportBy={{ top: 480, bottom: 640 }}
        itemContent={(_rowIndex, rowItems) => (
          <div className={gridRowClass}>
            {rowItems.map((item) => (
              <div key={item.filePath || item.id} className="flex flex-col gap-1 min-w-0">
                <MediaCard
                  item={item}
                  isSelected={selectedMediaIds.has(item.id)}
                  disableNativeDrag={isSwipeSelectMode}
                  onToggleSelect={onToggleSelect}
                  onOpenLightbox={onOpenLightbox}
                  onCopyItem={onCopyItem}
                  onDeleteItem={onDeleteItem}
                  onSetAsFolderCover={onSetAsFolderCover}
                  onContextMenuItem={onContextMenuItem}
                  onNativeDragStart={onNativeDragStart}
                />
                {renderItemFooter && renderItemFooter(item)}
              </div>
            ))}
          </div>
        )}
      />

      {/* 任务三：左键框选 / 长按滑动多选的实时半透明矩形选框 */}
      {marqueeRect && (
        <div
          className="fixed z-50 pointer-events-none rounded-md border border-sky-500 bg-sky-500/15 dark:bg-sky-400/20 shadow-sm backdrop-blur-[1px]"
          style={{
            left: `${marqueeRect.left}px`,
            top: `${marqueeRect.top}px`,
            width: `${marqueeRect.width}px`,
            height: `${marqueeRect.height}px`,
          }}
        />
      )}
    </div>
  );
};
