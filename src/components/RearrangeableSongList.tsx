import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Music,
  Check,
  PlusCircle,
  MoveVertical,
  Edit2
} from 'lucide-react';
import { PlaylistItem } from '../services/youtubePlaylistService';
import { StorageService } from '../services/storage';
import { triggerHaptic } from '../utils/haptics';
import { SwapTitleArtistButton } from './SwapTitleArtistButton';

interface RearrangeableSongListProps {
  items: PlaylistItem[];
  onReorder: (newItems: PlaylistItem[]) => void;
  selectedItemsMap?: Record<string, boolean>;
  selectedMap?: Record<string, boolean>;
  onToggleItem: (videoId: string) => void;
  onUpdateItem?: (updatedItem: PlaylistItem) => void;
}

export const RearrangeableSongList: React.FC<RearrangeableSongListProps> = ({
  items = [],
  onReorder,
  selectedItemsMap,
  selectedMap,
  onToggleItem
}) => {
  const activeSelectedMap = selectedItemsMap || selectedMap || {};

  // Accessibility / performance preferences
  const accessibility = useMemo(() => {
    try {
      return StorageService.getAccessibilitySettings();
    } catch {
      return { reducedMotion: false, performanceMode: false };
    }
  }, []);
  const isReducedMotion = accessibility.reducedMotion;
  const isLowEndMode = accessibility.performanceMode;

  // Normalized items: ensure every item has a reviewed category
  const normalizedItems = useMemo<PlaylistItem[]>(() => {
    return items.map((item, idx) => {
      if (item.category === 'praise' || item.category === 'worship') {
        return item;
      }
      // Fallback initialization rule:
      // If exactly 2 songs: Song 1 -> praise, Song 2 -> worship
      // If 3+ songs: Song 1 & 2 -> praise, Song 3+ -> worship
      const fallbackCat: 'praise' | 'worship' =
        items.length === 2
          ? (idx === 0 ? 'praise' : 'worship')
          : (idx < 2 ? 'praise' : 'worship');
      return {
        ...item,
        category: fallbackCat
      };
    });
  }, [items]);

  // Split into Praise and Worship buckets
  const praiseItems = useMemo(() => {
    return normalizedItems.filter((i) => i.category === 'praise');
  }, [normalizedItems]);

  const worshipItems = useMemo(() => {
    return normalizedItems.filter((i) => i.category === 'worship');
  }, [normalizedItems]);

  // Dragging state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragSourceCategory, setDragSourceCategory] = useState<'praise' | 'worship' | null>(null);
  const [dropTargetCategory, setDropTargetCategory] = useState<'praise' | 'worship' | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // References to section containers for drop calculation
  const containerRef = useRef<HTMLDivElement>(null);
  const praiseZoneRef = useRef<HTMLDivElement>(null);
  const worshipZoneRef = useRef<HTMLDivElement>(null);

  // Pointer drag tracking refs to avoid stale closures
  const dragStartPosRef = useRef<{ x: number; y: number; id: string; category: 'praise' | 'worship' } | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const draggedIdRef = useRef<string | null>(null);
  const dropTargetCatRef = useRef<'praise' | 'worship' | null>(null);
  const dropTargetIdxRef = useRef<number | null>(null);

  // Synchronize state to refs
  useEffect(() => {
    isDraggingRef.current = isDragging;
    draggedIdRef.current = draggedId;
    dropTargetCatRef.current = dropTargetCategory;
    dropTargetIdxRef.current = dropTargetIndex;
  }, [isDragging, draggedId, dropTargetCategory, dropTargetIndex]);

  // Clean up global listeners on unmount
  useEffect(() => {
    return () => {
      // Emergency unmount reset
      dragStartPosRef.current = null;
      isDraggingRef.current = false;
    };
  }, []);

  // Compute live preview state when actively dragging
  const { livePraiseItems, liveWorshipItems } = useMemo(() => {
    if (!isDragging || !draggedId || !dropTargetCategory || dropTargetIndex === null) {
      return { livePraiseItems: praiseItems, liveWorshipItems: worshipItems };
    }

    const draggedItem = normalizedItems.find((i) => i.videoId === draggedId);
    if (!draggedItem) {
      return { livePraiseItems: praiseItems, liveWorshipItems: worshipItems };
    }

    // Remove dragged item from both lists
    const nextPraise = praiseItems.filter((i) => i.videoId !== draggedId);
    const nextWorship = worshipItems.filter((i) => i.videoId !== draggedId);

    const updatedItem: PlaylistItem = {
      ...draggedItem,
      category: dropTargetCategory
    };

    if (dropTargetCategory === 'praise') {
      const idx = Math.max(0, Math.min(nextPraise.length, dropTargetIndex));
      nextPraise.splice(idx, 0, updatedItem);
    } else {
      const idx = Math.max(0, Math.min(nextWorship.length, dropTargetIndex));
      nextWorship.splice(idx, 0, updatedItem);
    }

    return { livePraiseItems: nextPraise, liveWorshipItems: nextWorship };
  }, [isDragging, draggedId, dropTargetCategory, dropTargetIndex, praiseItems, worshipItems, normalizedItems]);

  // Pointer Down on Grip Handle
  const handlePointerDown = (
    e: React.PointerEvent,
    item: PlaylistItem,
    category: 'praise' | 'worship'
  ) => {
    // Only primary mouse button or touch/pen
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    dragStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      id: item.videoId,
      category
    };

    setDraggedId(item.videoId);
    setDragSourceCategory(category);
    setDropTargetCategory(category);

    const currentList = category === 'praise' ? praiseItems : worshipItems;
    const itemIndex = currentList.findIndex((i) => i.videoId === item.videoId);
    setDropTargetIndex(itemIndex >= 0 ? itemIndex : 0);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragStartPosRef.current) return;

      const deltaX = Math.abs(moveEvent.clientX - dragStartPosRef.current.x);
      const deltaY = Math.abs(moveEvent.clientY - dragStartPosRef.current.y);

      // Movement threshold: 5px to avoid accidental trigger on tap
      if (!isDraggingRef.current) {
        if (deltaX < 5 && deltaY < 5) {
          return;
        }
        setIsDragging(true);
        triggerHaptic('tap');
      }

      // Container auto-scroll
      if (containerRef.current) {
        const cRect = containerRef.current.getBoundingClientRect();
        const pY = moveEvent.clientY;
        const scrollThreshold = 40;
        const scrollSpeed = 8;

        if (pY < cRect.top + scrollThreshold) {
          containerRef.current.scrollTop -= scrollSpeed;
        } else if (pY > cRect.bottom - scrollThreshold) {
          containerRef.current.scrollTop += scrollSpeed;
        }
      }

      // Determine which category section the pointer is over
      const pointerY = moveEvent.clientY;
      const praiseRect = praiseZoneRef.current?.getBoundingClientRect();
      const worshipRect = worshipZoneRef.current?.getBoundingClientRect();

      let targetCat: 'praise' | 'worship' = category;

      if (praiseRect && worshipRect) {
        const praiseMid = praiseRect.top + praiseRect.height / 2;
        const worshipMid = worshipRect.top + worshipRect.height / 2;

        if (pointerY < worshipRect.top) {
          targetCat = 'praise';
        } else if (pointerY > praiseRect.bottom) {
          targetCat = 'worship';
        } else {
          // In-between boundary: use closest center
          targetCat = Math.abs(pointerY - praiseMid) <= Math.abs(pointerY - worshipMid) ? 'praise' : 'worship';
        }
      } else if (praiseRect && pointerY <= praiseRect.bottom + 20) {
        targetCat = 'praise';
      } else if (worshipRect && pointerY >= worshipRect.top - 20) {
        targetCat = 'worship';
      }

      setDropTargetCategory(targetCat);

      // Determine insertion index within targetCat
      const targetZone = targetCat === 'praise' ? praiseZoneRef.current : worshipZoneRef.current;
      if (!targetZone) return;

      const itemElements = targetZone.querySelectorAll<HTMLElement>('[data-item-id]');
      const elementList = Array.from(itemElements).filter(
        (el) => el.getAttribute('data-item-id') !== dragStartPosRef.current?.id
      );

      if (elementList.length === 0) {
        setDropTargetIndex(0);
        return;
      }

      let insertIdx = elementList.length;
      for (let i = 0; i < elementList.length; i++) {
        const rect = elementList[i].getBoundingClientRect();
        const itemMiddleY = rect.top + rect.height / 2;
        if (pointerY < itemMiddleY) {
          insertIdx = i;
          break;
        }
      }

      setDropTargetIndex(insertIdx);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      const activeDrag = isDraggingRef.current;
      const activeId = draggedIdRef.current;
      const targetCat = dropTargetCatRef.current;
      const targetIdx = dropTargetIdxRef.current;

      dragStartPosRef.current = null;
      setIsDragging(false);
      setDraggedId(null);
      setDragSourceCategory(null);
      setDropTargetCategory(null);
      setDropTargetIndex(null);

      if (!activeDrag || !activeId || !targetCat || targetIdx === null) {
        return;
      }

      // Reconstruct final preview array
      const draggedItem = normalizedItems.find((i) => i.videoId === activeId);
      if (!draggedItem) return;

      const newPraise = praiseItems.filter((i) => i.videoId !== activeId);
      const newWorship = worshipItems.filter((i) => i.videoId !== activeId);

      const updatedItem: PlaylistItem = {
        ...draggedItem,
        category: targetCat
      };

      if (targetCat === 'praise') {
        const clampedIdx = Math.max(0, Math.min(newPraise.length, targetIdx));
        newPraise.splice(clampedIdx, 0, updatedItem);
      } else {
        const clampedIdx = Math.max(0, Math.min(newWorship.length, targetIdx));
        newWorship.splice(clampedIdx, 0, updatedItem);
      }

      const finalCombined = [...newPraise, ...newWorship];
      triggerHaptic('selection');
      onReorder(finalCombined);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // Move button action (Accessibility fallback: Keyboard / screen-reader / click buttons)
  const handleMoveItem = (
    item: PlaylistItem,
    currentCategory: 'praise' | 'worship',
    direction: 'up' | 'down'
  ) => {
    const isPraise = currentCategory === 'praise';
    const list = isPraise ? [...praiseItems] : [...worshipItems];
    const itemIndex = list.findIndex((i) => i.videoId === item.videoId);
    if (itemIndex === -1) return;

    if (direction === 'up') {
      if (itemIndex > 0) {
        // Swap with previous inside same category
        const temp = list[itemIndex - 1];
        list[itemIndex - 1] = list[itemIndex];
        list[itemIndex] = temp;
        const newCombined = isPraise ? [...list, ...worshipItems] : [...praiseItems, ...list];
        onReorder(newCombined);
      } else if (!isPraise) {
        // Move from top of Worship to bottom of Praise!
        const movedItem: PlaylistItem = { ...item, category: 'praise' };
        const newWorship = list.filter((i) => i.videoId !== item.videoId);
        const newPraise = [...praiseItems, movedItem];
        onReorder([...newPraise, ...newWorship]);
        triggerHaptic('tap');
      }
    } else {
      if (itemIndex < list.length - 1) {
        // Swap with next inside same category
        const temp = list[itemIndex + 1];
        list[itemIndex + 1] = list[itemIndex];
        list[itemIndex] = temp;
        const newCombined = isPraise ? [...list, ...worshipItems] : [...praiseItems, ...list];
        onReorder(newCombined);
      } else if (isPraise) {
        // Move from bottom of Praise to top of Worship!
        const movedItem: PlaylistItem = { ...item, category: 'worship' };
        const newPraise = list.filter((i) => i.videoId !== item.videoId);
        const newWorship = [movedItem, ...worshipItems];
        onReorder([...newPraise, ...newWorship]);
        triggerHaptic('tap');
      }
    }
  };

  // Direct toggle between Praise and Worship
  const handleToggleCategory = (
    item: PlaylistItem,
    currentCategory: 'praise' | 'worship'
  ) => {
    const targetCategory: 'praise' | 'worship' =
      currentCategory === 'praise' ? 'worship' : 'praise';
    const newPraise = praiseItems.filter((i) => i.videoId !== item.videoId);
    const newWorship = worshipItems.filter((i) => i.videoId !== item.videoId);

    const updatedItem: PlaylistItem = {
      ...item,
      category: targetCategory
    };

    if (targetCategory === 'praise') {
      newPraise.push(updatedItem);
    } else {
      newWorship.push(updatedItem);
    }

    triggerHaptic('selection');
    onReorder([...newPraise, ...newWorship]);
  };

  // Compute overall continuous position numbers
  const displayPraise = isDragging ? livePraiseItems : praiseItems;
  const displayWorship = isDragging ? liveWorshipItems : worshipItems;

  const renderItemRow = (
    item: PlaylistItem,
    category: 'praise' | 'worship',
    indexInCategory: number,
    positionNumber: number
  ) => {
    if (!item) return null;
    const isChecked = Boolean(item.videoId && activeSelectedMap[item.videoId]);
    const isBeingDragged = draggedId === item.videoId && isDragging;
    const isPraise = category === 'praise';

    // Insertion line indicator before this item
    const showInsertionBefore =
      isDragging &&
      dropTargetCategory === category &&
      dropTargetIndex === indexInCategory &&
      draggedId !== item.videoId;

    return (
      <React.Fragment key={item.videoId}>
        {/* Subtle Insertion Line Marker */}
        {showInsertionBefore && (
          <div className="relative py-1 flex items-center justify-center">
            <div
              className={`w-full h-0.5 rounded-full ${
                isPraise ? 'bg-amber-500' : 'bg-indigo-500'
              } shadow-sm shadow-current`}
            />
            <span
              className={`absolute left-4 w-2 h-2 rounded-full ${
                isPraise ? 'bg-amber-500' : 'bg-indigo-500'
              }`}
            />
          </div>
        )}

        <div
          data-item-id={item.videoId}
          data-drop-category={category}
          className={`group relative flex items-center gap-2.5 p-2.5 rounded-xl border transition-all duration-150 ${
            isBeingDragged
              ? isLowEndMode
                ? 'bg-indigo-100 dark:bg-indigo-950 border-indigo-500 opacity-90'
                : 'bg-white dark:bg-slate-850 border-[#1b75bc] dark:border-[#54b0e2] shadow-xl ring-2 ring-[#1b75bc]/30 scale-[1.01] z-20 opacity-95'
              : isChecked
              ? 'bg-white/90 dark:bg-slate-900/90 border-slate-200/80 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
              : 'bg-slate-100/50 dark:bg-slate-900/40 border-slate-200/40 dark:border-white/5 opacity-55 hover:opacity-85'
          }`}
        >
          {/* Drag Handle */}
          <div
            onPointerDown={(e) => handlePointerDown(e, item, category)}
            className="touch-none cursor-grab active:cursor-grabbing p-1.5 text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shrink-0"
            title="Drag to reorder position or move between Praise and Worship"
            aria-label="Drag handle"
          >
            <GripVertical className="w-4 h-4" />
          </div>

          {/* Position Number (Communicates final reviewed playlist order) */}
          <span className="w-6 text-center text-xs font-black font-mono text-slate-500 dark:text-slate-400 shrink-0">
            {positionNumber}.
          </span>

          {/* Checkbox */}
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onToggleItem(item.videoId)}
            aria-label={`Select ${item.title}`}
            className="w-4 h-4 text-[#1b75bc] rounded-md border-slate-300 dark:border-slate-700 focus:ring-[#1b75bc] shrink-0 cursor-pointer"
          />

          {/* Thumbnail */}
          <div className="w-12 h-8 rounded-lg overflow-hidden border border-slate-200/80 dark:border-white/10 bg-slate-200 dark:bg-slate-800 shrink-0 shadow-2xs">
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <Music className="w-4 h-4" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[220px] sm:max-w-[340px]">
                {item.title}
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
              {item.artist || 'Unknown Artist'} {item.album ? `• ${item.album}` : ''}
            </p>
          </div>

          {/* Category Badge - Click or tap to toggle between Praise and Worship */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleCategory(item, category);
              }}
              title={`Assigned as ${isPraise ? 'Praise' : 'Worship'}. Click or tap to switch to ${isPraise ? 'Worship' : 'Praise'}.`}
              aria-label={`Switch ${item.title} to ${isPraise ? 'Worship' : 'Praise'}`}
              className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center gap-1 ${
                isPraise
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                  : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25'
              }`}
            >
              <span>{isPraise ? 'Praise' : 'Worship'}</span>
              <span className="text-[9px] opacity-60">⇄</span>
            </button>
          </div>

          {/* Duration */}
          {item.duration && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono shrink-0 hidden sm:inline">
              {item.duration}
            </span>
          )}

          {/* Accessible Move Up / Move Down buttons */}
          <div className="flex flex-col gap-0.5 shrink-0 opacity-80 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => handleMoveItem(item, category, 'up')}
              disabled={isPraise && indexInCategory === 0}
              className="p-1 text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] disabled:opacity-20 rounded cursor-pointer"
              title={
                !isPraise && indexInCategory === 0
                  ? 'Move to Praise Songs section'
                  : 'Move Up'
              }
              aria-label={`Move ${item.title} up`}
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleMoveItem(item, category, 'down')}
              disabled={!isPraise && indexInCategory === worshipItems.length - 1}
              className="p-1 text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] disabled:opacity-20 rounded cursor-pointer"
              title={
                isPraise && indexInCategory === praiseItems.length - 1
                  ? 'Move to Worship Songs section'
                  : 'Move Down'
              }
              aria-label={`Move ${item.title} down`}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </React.Fragment>
    );
  };

  return (
    <div
      ref={containerRef}
      className="p-2 sm:p-3 border border-slate-200/80 dark:border-white/10 rounded-2xl max-h-[380px] overflow-y-auto space-y-4 bg-slate-50/60 dark:bg-slate-900/60 select-none shadow-inner"
    >
      {/* PRAISE SONGS SECTION (Drop Zone A) */}
      <div
        ref={praiseZoneRef}
        data-drop-zone="praise"
        className={`p-2.5 rounded-xl border transition-all duration-200 ${
          isDragging && dropTargetCategory === 'praise'
            ? 'border-amber-400/80 dark:border-amber-400 bg-amber-500/10 shadow-xs ring-2 ring-amber-400/20'
            : 'border-slate-200/60 dark:border-white/5 bg-white/40 dark:bg-white/[0.02]'
        }`}
      >
        {/* Praise Header Bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 rounded-lg mb-2">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full bg-amber-500 ${isReducedMotion ? '' : 'animate-pulse'}`} />
            <span className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider">
              Praise Songs ({displayPraise.length})
            </span>
          </div>
          <span className="text-[10px] font-bold text-amber-700/90 dark:text-amber-300">
            {displayPraise.length === 1 ? '1 song assigned' : `${displayPraise.length} songs assigned`}
          </span>
        </div>

        {/* Praise Item List or Empty Drop Target */}
        <div className="space-y-1.5">
          {displayPraise.length > 0 ? (
            <>
              {displayPraise.map((item, idx) =>
                renderItemRow(item, 'praise', idx, idx + 1)
              )}
              {/* Insertion marker at end of list if dragging */}
              {isDragging &&
                dropTargetCategory === 'praise' &&
                dropTargetIndex === displayPraise.length && (
                  <div className="relative py-1 flex items-center justify-center">
                    <div className="w-full h-0.5 rounded-full bg-amber-500 shadow-sm shadow-current" />
                    <span className="absolute left-4 w-2 h-2 rounded-full bg-amber-500" />
                  </div>
                )}
            </>
          ) : (
            /* Active Empty Drop Target */
            <div
              className={`p-5 rounded-xl border-2 border-dashed text-center transition-all ${
                isDragging && dropTargetCategory === 'praise'
                  ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                  : 'border-slate-300/80 dark:border-slate-700/80 text-slate-400 dark:text-slate-500'
              }`}
            >
              <PlusCircle className="w-5 h-5 mx-auto mb-1 opacity-70" />
              <p className="text-xs font-bold">
                {isDragging && dropTargetCategory === 'praise'
                  ? 'Release to assign song as Praise'
                  : 'No praise songs assigned'}
              </p>
              <p className="text-[11px] opacity-80 mt-0.5">
                Drag a song here to assign as Praise
              </p>
            </div>
          )}
        </div>
      </div>

      {/* WORSHIP SONGS SECTION (Drop Zone B) */}
      <div
        ref={worshipZoneRef}
        data-drop-zone="worship"
        className={`p-2.5 rounded-xl border transition-all duration-200 ${
          isDragging && dropTargetCategory === 'worship'
            ? 'border-indigo-400/80 dark:border-indigo-400 bg-indigo-500/10 shadow-xs ring-2 ring-indigo-400/20'
            : 'border-slate-200/60 dark:border-white/5 bg-white/40 dark:bg-white/[0.02]'
        }`}
      >
        {/* Worship Header Bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-indigo-500/15 border border-indigo-500/25 rounded-lg mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="text-xs font-black text-indigo-900 dark:text-indigo-200 uppercase tracking-wider">
              Worship Songs ({displayWorship.length})
            </span>
          </div>
          <span className="text-[10px] font-bold text-indigo-700/90 dark:text-indigo-300">
            {displayWorship.length === 1 ? '1 song assigned' : `${displayWorship.length} songs assigned`}
          </span>
        </div>

        {/* Worship Item List or Empty Drop Target */}
        <div className="space-y-1.5">
          {displayWorship.length > 0 ? (
            <>
              {displayWorship.map((item, idx) =>
                renderItemRow(item, 'worship', idx, displayPraise.length + idx + 1)
              )}
              {/* Insertion marker at end of list if dragging */}
              {isDragging &&
                dropTargetCategory === 'worship' &&
                dropTargetIndex === displayWorship.length && (
                  <div className="relative py-1 flex items-center justify-center">
                    <div className="w-full h-0.5 rounded-full bg-indigo-500 shadow-sm shadow-current" />
                    <span className="absolute left-4 w-2 h-2 rounded-full bg-indigo-500" />
                  </div>
                )}
            </>
          ) : (
            /* Active Empty Drop Target */
            <div
              className={`p-5 rounded-xl border-2 border-dashed text-center transition-all ${
                isDragging && dropTargetCategory === 'worship'
                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-800 dark:text-indigo-200'
                  : 'border-slate-300/80 dark:border-slate-700/80 text-slate-400 dark:text-slate-500'
              }`}
            >
              <PlusCircle className="w-5 h-5 mx-auto mb-1 opacity-70" />
              <p className="text-xs font-bold">
                {isDragging && dropTargetCategory === 'worship'
                  ? 'Release to assign song as Worship'
                  : 'No worship songs assigned'}
              </p>
              <p className="text-[11px] opacity-80 mt-0.5">
                Drag a song here to assign as Worship
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
