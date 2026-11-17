import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Member, MemberAvailability, AvailabilityStatus, ServiceType, normalizeServiceType } from '../types';
import { AvailabilityService } from '../services/availabilityService';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import { formatDateDisplayManila, getManilaTodayString } from '../utils/dateUtils';
import {
  X,
  Calendar,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Filter,
  UserCheck,
  Search,
  Clock,
  AlertTriangle,
  ChevronRight,
  Info
} from 'lucide-react';

interface MemberAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  initialDate?: string;
  serviceType?: ServiceType;
  showToast: (text: string, type?: 'success' | 'danger' | 'info') => void;
  onAvailabilityChanged?: () => void;
}

export const MemberAvailabilityModal: React.FC<MemberAvailabilityModalProps> = ({
  isOpen,
  onClose,
  members,
  initialDate,
  serviceType,
  showToast,
  onAvailabilityChanged
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialDate && initialDate.trim()) return initialDate.trim();
    return getManilaTodayString();
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Load current availability list from local service
  const [availabilityList, setAvailabilityList] = useState<MemberAvailability[]>(() =>
    AvailabilityService.getAvailabilityListSync()
  );
  const [editingNoteMemberId, setEditingNoteMemberId] = useState<string | null>(null);
  const [noteInputValue, setNoteInputValue] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (initialDate && initialDate.trim()) {
        setSelectedDate(initialDate.trim());
      } else {
        setSelectedDate(getManilaTodayString());
      }
      setAvailabilityList(AvailabilityService.getAvailabilityListSync());
      setEditingNoteMemberId(null);
      setNoteInputValue('');
    }
  }, [isOpen, initialDate]);

  const normalizedServiceType = useMemo(
    () => (serviceType && serviceType.trim() ? normalizeServiceType(serviceType) : undefined),
    [serviceType]
  );

  const { zIndex, isTopmost, isBlocked } = useOverlay({
    id: 'member-availability-modal',
    isOpen,
    layer: OverlayLayer.MODAL,
    onClose,
    closeOnEscape: true
  });

  // Current availability lookup for selected date & serviceType (unscoped fallback overridden by exact serviceType)
  const dateAvailabilityMap = useMemo(() => {
    const map = new Map<string, MemberAvailability>();
    const forDate = availabilityList.filter((item) => item.date === selectedDate);
    forDate.forEach((item) => {
      if (!item.serviceType) {
        map.set(item.memberId, item);
      }
    });
    if (normalizedServiceType) {
      forDate.forEach((item) => {
        if (item.serviceType === normalizedServiceType) {
          map.set(item.memberId, item);
        }
      });
    }
    return map;
  }, [availabilityList, selectedDate, normalizedServiceType]);

  // Extract all unique ministry tags from members
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    members.forEach((m) => {
      (m.labels || []).forEach((t) => tagSet.add(t));
    });
    return Array.from(tagSet).sort();
  }, [members]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = m.name.toLowerCase().includes(q);
        const matchesTag = (m.labels || []).some((l) => l.toLowerCase().includes(q));
        if (!matchesName && !matchesTag) return false;
      }

      if (filterTag !== 'all') {
        if (!(m.labels || []).includes(filterTag)) return false;
      }

      if (filterStatus !== 'all') {
        const avail = dateAvailabilityMap.get(m.id);
        const currentStatus = avail ? avail.status : 'unknown';
        if (filterStatus === 'unknown') {
          if (avail) return false;
        } else if (currentStatus !== filterStatus) {
          return false;
        }
      }

      return true;
    });
  }, [members, searchQuery, filterTag, filterStatus, dateAvailabilityMap]);

  // Count summaries for selected date
  const counts = useMemo(() => {
    let available = 0;
    let unavailable = 0;
    let maybe = 0;
    let unknown = 0;

    members.forEach((m) => {
      const avail = dateAvailabilityMap.get(m.id);
      if (!avail) unknown++;
      else if (avail.status === 'available') available++;
      else if (avail.status === 'unavailable') unavailable++;
      else if (avail.status === 'maybe') maybe++;
    });

    return { available, unavailable, maybe, unknown, total: members.length };
  }, [members, dateAvailabilityMap]);

  const handleSetStatus = (memberId: string, status: AvailabilityStatus, note?: string): boolean => {
    try {
      AvailabilityService.setAvailability(
        memberId,
        selectedDate,
        status,
        note,
        normalizedServiceType
      );
      const refreshed = AvailabilityService.getAvailabilityListSync();
      setAvailabilityList(refreshed);
      onAvailabilityChanged?.();
      return true;
    } catch (err: any) {
      console.error('[MemberAvailabilityModal] Failed to save availability:', err);
      showToast(err?.message || 'Failed to save availability change. Storage may be full.', 'danger');
      return false;
    }
  };

  const handleOpenNoteEditor = (memberId: string, currentNote?: string) => {
    if (editingNoteMemberId === memberId) {
      setEditingNoteMemberId(null);
      setNoteInputValue('');
      return;
    }
    setEditingNoteMemberId(memberId);
    setNoteInputValue(currentNote || '');
  };

  const handleSaveNote = (memberId: string) => {
    const current = dateAvailabilityMap.get(memberId);
    const saved = handleSetStatus(memberId, current ? current.status : 'available', noteInputValue);
    if (saved) {
      setEditingNoteMemberId(null);
      setNoteInputValue('');
      showToast('Availability note saved', 'success');
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{ zIndex }}
      data-overlay-id="member-availability-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] my-auto flex flex-col transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2]">
              <UserCheck className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Team Member Availability Matrix
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Word for the World Christian Fellowship • Santa Cruz
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Date Selector & Stats Summary */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 space-y-4 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Target Service Date:
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/60 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc] outline-none"
              />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {formatDateDisplayManila(selectedDate, { month: 'short', day: 'numeric', year: 'numeric', weekday: 'short' })}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/20">
                {normalizedServiceType || 'All Service Types'}
              </span>
            </div>

            {/* Availability Summary Badges */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="px-2.5 py-1 rounded-full font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{counts.available} Available</span>
              </span>
              <span className="px-2.5 py-1 rounded-full font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                <span>{counts.unavailable} Unavailable</span>
              </span>
              <span className="px-2.5 py-1 rounded-full font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{counts.maybe} Maybe</span>
              </span>
              <span className="px-2.5 py-1 rounded-full font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                {counts.unknown} Unset
              </span>
            </div>
          </div>

          {/* Search & Tag Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search member name or ministry role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-1 focus:ring-[#1b75bc]"
              />
            </div>

            {/* Tag Filter */}
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/60 text-slate-900 dark:text-slate-100 outline-none"
            >
              <option value="all">All Roles</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/60 text-slate-900 dark:text-slate-100 outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available Only</option>
              <option value="unavailable">Unavailable Only</option>
              <option value="maybe">Maybe Only</option>
              <option value="unknown">Unset Only</option>
            </select>
          </div>
        </div>

        {/* Member Roster List */}
        <div className="p-6 overflow-y-auto space-y-2.5 flex-1 divide-y divide-slate-100 dark:divide-slate-800">
          {filteredMembers.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-xs">
              No team members match your current search or filters.
            </div>
          ) : (
            filteredMembers.map((member) => {
              const avail = dateAvailabilityMap.get(member.id);
              const currentStatus = avail?.status;
              const note = avail?.note;

              return (
                <div
                  key={member.id}
                  className="pt-2.5 first:pt-0"
                >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                        {member.name}
                      </span>
                      {note && (
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[200px]"
                          title={note}
                        >
                          "{note}"
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {(member.labels || []).join(' • ') || 'No ministry tag'}
                    </div>
                  </div>

                  {/* Status Toggle Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSetStatus(member.id, 'available', note)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                        currentStatus === 'available'
                          ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Available</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetStatus(member.id, 'unavailable', note)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                        currentStatus === 'unavailable'
                          ? 'bg-rose-600 text-white shadow-2xs font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600'
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Unavailable</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetStatus(member.id, 'maybe', note)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                        currentStatus === 'maybe'
                          ? 'bg-amber-600 text-white shadow-2xs font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600'
                      }`}
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Maybe</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenNoteEditor(member.id, note)}
                      title="Add or edit availability note"
                      aria-label={`Add or edit availability note for ${member.name}`}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        editingNoteMemberId === member.id
                          ? 'text-[#1b75bc] dark:text-[#54b0e2] bg-[#1b75bc]/10'
                          : 'text-slate-400 hover:text-[#1b75bc] dark:hover:text-[#54b0e2]'
                      }`}
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {editingNoteMemberId === member.id && (
                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2">
                    <input
                      type="text"
                      value={noteInputValue}
                      onChange={(e) => setNoteInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveNote(member.id);
                        } else if (e.key === 'Escape') {
                          setEditingNoteMemberId(null);
                        }
                      }}
                      placeholder='Optional note (e.g. "Out of town", "Available after 10am")'
                      className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-black/60 text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-[#1b75bc]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveNote(member.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1b75bc] hover:bg-[#155d97] rounded-lg cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingNoteMemberId(null)}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Availability changes save instantly to your local database.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#155d97] rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
