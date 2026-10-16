import { useState, useCallback, MouseEvent, ChangeEvent } from 'react';

export function useMultiSelect<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  const toggleSelect = useCallback(
    (id: string, index: number, event?: MouseEvent | ChangeEvent) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const isShift = event && 'shiftKey' in event && (event as MouseEvent).shiftKey;

        if (isShift && lastSelectedIndex !== null && items.length > 0) {
          const start = Math.min(lastSelectedIndex, index);
          const end = Math.max(lastSelectedIndex, index);
          for (let i = start; i <= end; i++) {
            if (items[i]) {
              next.add(items[i].id);
            }
          }
        } else {
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
        }
        return next;
      });
      setLastSelectedIndex(index);
    },
    [items, lastSelectedIndex]
  );

  const toggleSelectAll = useCallback(
    (visibleItems: T[]) => {
      setSelectedIds((prev) => {
        const visibleIds = visibleItems.map((i) => i.id);
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));

        const next = new Set(prev);
        if (allVisibleSelected) {
          visibleIds.forEach((id) => next.delete(id));
        } else {
          visibleIds.forEach((id) => next.add(id));
        }
        return next;
      });
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedIndex(null);
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const visibleIds = items.map((i) => i.id);
  const isAllSelected = items.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const isSomeSelected = visibleIds.some((id) => selectedIds.has(id)) && !isAllSelected;

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    isSelected,
    isAllSelected,
    isSomeSelected
  };
}
