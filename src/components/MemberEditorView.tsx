import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Member,
  Schedule,
  getAssignmentMembers,
  isMemberUnderDisciplinary,
  calculateDisciplinaryEndDate,
  DisciplinaryDurationType,
  DisciplinaryAction
} from '../types';
import { StorageService } from '../services/storage';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { Modal } from './Modal';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  filterAndSortMembers,
  MemberSortOption,
  MemberStatusFilter,
  isExactDuplicateName,
  isSimilarName,
  getExistingUniqueTagHolder,
  validateUniqueMemberRoles,
  getNormalizedUniqueTagName
} from '../utils/memberUtils';
import { sortTags } from '../utils/tagUtils';
import { getManilaTodayString, getManilaNowISO } from '../utils/dateUtils';
import {
  Users,
  UserPlus,
  Search,
  Edit3,
  Trash2,
  Tag,
  X,
  Check,
  ArrowUpDown,
  Filter,
  RotateCcw,
  ChevronDown,
  ShieldAlert,
  Calendar,
  Clock,
  FileText,
  AlertOctagon,
  CheckCircle2
} from 'lucide-react';

interface MemberEditorViewProps {
  members: Member[];
  labels: string[];
  schedules: Schedule[];
  onAddMember: (member: Omit<Member, 'id'>, id?: string) => void;
  onDeleteMember: (id: string) => void;
  onSaveMembers: (updatedMembers: Member[]) => void;
  onUpdateSchedules: (updatedSchedules: Schedule[]) => void;
  onAddCustomLabel: (label: string) => void;
  showToast: (msg: string, type?: 'success' | 'danger' | 'info') => void;
}

const LOCAL_STORAGE_SORT_KEY = 'wwcf_member_sort_v1';

export const MemberEditorView: React.FC<MemberEditorViewProps> = ({
  members,
  labels,
  schedules,
  onAddMember,
  onDeleteMember,
  onSaveMembers,
  onUpdateSchedules,
  onAddCustomLabel,
  showToast
}) => {
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');

  // Filter Memory: Load last-used search, filter labels, status filter, and sort option
  const savedFilters = useMemo(() => StorageService.getMembersFilterSettings(), []);

  const [searchQuery, setSearchQuery] = useState(savedFilters.searchQuery || '');
  const [filterLabels, setFilterLabels] = useState<string[]>(savedFilters.filterLabels || []);
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>(
    (savedFilters.statusFilter as MemberStatusFilter) || 'all'
  );
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // Disciplinary Action Modal state
  const [disciplinaryModalMembers, setDisciplinaryModalMembers] = useState<Member[] | null>(null);
  const [dispStatus, setDispStatus] = useState<'active' | 'cleared'>('active');
  const [dispDurationType, setDispDurationType] = useState<DisciplinaryDurationType>('days');
  const [dispDurationValue, setDispDurationValue] = useState<number>(7);
  const [dispStartDate, setDispStartDate] = useState<string>(
    getManilaTodayString()
  );
  const [dispReason, setDispReason] = useState<string>('');

  // Duplicate & Similar Name Modal state
  const [exactDuplicateMember, setExactDuplicateMember] = useState<Member | null>(null);
  const [similarMatchData, setSimilarMatchData] = useState<{
    existingMember: Member;
    pendingMember: {
      name: string;
      labels: string[];
      customTagToAdd?: string;
    };
  } | null>(null);

  const isDisciplinaryOpen = Boolean(disciplinaryModalMembers && disciplinaryModalMembers.length > 0);
  const { zIndex: disciplinaryZIndex, isTopmost: isDisciplinaryTopmost, isBlocked: isDisciplinaryBlocked } = useOverlay({
    id: 'disciplinary-action-modal',
    isOpen: isDisciplinaryOpen,
    layer: OverlayLayer.CRITICAL_DIALOG,
    onClose: () => setDisciplinaryModalMembers(null),
    closeOnEscape: true
  });

  const isExactDuplicateOpen = Boolean(exactDuplicateMember);
  const { zIndex: exactDuplicateZIndex, isTopmost: isExactDuplicateTopmost, isBlocked: isExactDuplicateBlocked } = useOverlay({
    id: 'exact-duplicate-member-modal',
    isOpen: isExactDuplicateOpen,
    layer: OverlayLayer.NESTED_MODAL,
    onClose: () => setExactDuplicateMember(null),
    closeOnEscape: true
  });

  const isSimilarMatchOpen = Boolean(similarMatchData);
  const { zIndex: similarMatchZIndex, isTopmost: isSimilarMatchTopmost, isBlocked: isSimilarMatchBlocked } = useOverlay({
    id: 'similar-match-member-modal',
    isOpen: isSimilarMatchOpen,
    layer: OverlayLayer.NESTED_MODAL,
    onClose: () => setSimilarMatchData(null),
    closeOnEscape: true
  });

  // Floating Member Add/Edit Dialog State & Overlay Registration
  const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false);
  const addMemberButtonRef = useRef<HTMLButtonElement>(null);

  const { zIndex: memberDialogZIndex, isTopmost: isMemberDialogTopmost, isBlocked: isMemberDialogBlocked } = useOverlay({
    id: 'member-form-dialog',
    isOpen: isMemberDialogOpen,
    layer: OverlayLayer.MODAL,
    onClose: () => handleCloseMemberDialog(),
    closeOnEscape: true
  });

  const handleOpenAddDialog = () => {
    resetForm();
    setIsMemberDialogOpen(true);
  };

  const handleCloseMemberDialog = () => {
    setIsMemberDialogOpen(false);
    resetForm();
    if (addMemberButtonRef.current) {
      addMemberButtonRef.current.focus();
    }
  };

  const handleOpenDisciplinaryModal = (targetMembers: Member[]) => {
    if (targetMembers.length === 0) return;
    setDisciplinaryModalMembers(targetMembers);
    if (targetMembers.length === 1 && targetMembers[0].disciplinaryAction) {
      const da = targetMembers[0].disciplinaryAction;
      setDispStatus(da.status);
      setDispDurationType(da.durationType || 'days');
      setDispDurationValue(da.durationValue || 7);
      setDispStartDate(da.startDate || getManilaTodayString());
      setDispReason(da.reason || '');
    } else {
      setDispStatus('active');
      setDispDurationType('days');
      setDispDurationValue(7);
      setDispStartDate(getManilaTodayString());
      setDispReason('');
    }
  };

  const computedEndDate = calculateDisciplinaryEndDate(
    dispStartDate,
    dispDurationValue,
    dispDurationType
  );

  const handleSaveDisciplinaryAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disciplinaryModalMembers || disciplinaryModalMembers.length === 0) return;

    if (dispStatus === 'active' && (!dispDurationValue || dispDurationValue <= 0)) {
      showToast('Please enter a valid duration value greater than 0.', 'danger');
      return;
    }

    const targetIds = new Set(disciplinaryModalMembers.map((m) => m.id));

    const newAction: DisciplinaryAction = {
      status: dispStatus,
      startDate: dispStartDate,
      durationValue: Number(dispDurationValue),
      durationType: dispDurationType,
      endDate: computedEndDate,
      reason: dispReason.trim() || undefined,
      updatedAt: getManilaNowISO()
    };

    const updatedMembers = members.map((m) =>
      targetIds.has(m.id) ? { ...m, disciplinaryAction: newAction } : m
    );

    onSaveMembers(updatedMembers);

    if (dispStatus === 'active') {
      showToast(
        disciplinaryModalMembers.length === 1
          ? `Disciplinary action active for ${disciplinaryModalMembers[0].name} until ${computedEndDate}.`
          : `Disciplinary action applied to ${disciplinaryModalMembers.length} members until ${computedEndDate}.`,
        'success'
      );
    } else {
      showToast(
        disciplinaryModalMembers.length === 1
          ? `Disciplinary status for ${disciplinaryModalMembers[0].name} has been cleared.`
          : `Disciplinary status for ${disciplinaryModalMembers.length} members has been cleared.`,
        'info'
      );
    }

    clearSelection();
    setDisciplinaryModalMembers(null);
  };

  const [sortOption, setSortOption] = useState<MemberSortOption>(() => {
    if (savedFilters.sortOption) {
      return savedFilters.sortOption as MemberSortOption;
    }
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SORT_KEY);
      if (
        saved === 'name-asc' ||
        saved === 'name-desc' ||
        saved === 'tags-desc' ||
        saved === 'tags-asc' ||
        saved === 'hierarchy-desc' ||
        saved === 'hierarchy-asc' ||
        saved === 'status-desc' ||
        saved === 'status-asc'
      ) {
        return saved as MemberSortOption;
      }
    } catch {
      // Fallback default
    }
    return 'name-asc';
  });

  // Filter Memory: Persist settings whenever they change
  useEffect(() => {
    StorageService.saveMembersFilterSettings({
      searchQuery,
      filterLabels,
      statusFilter,
      sortOption
    });
  }, [searchQuery, filterLabels, statusFilter, sortOption]);

  const handleSortChange = (newSort: MemberSortOption) => {
    setSortOption(newSort);
    try {
      localStorage.setItem(LOCAL_STORAGE_SORT_KEY, newSort);
    } catch (e) {
      console.error('Failed to save sort option to localStorage', e);
    }
  };

  // Close filter dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleFilterLabel = (label: string) => {
    if (filterLabels.includes(label)) {
      setFilterLabels(filterLabels.filter((l) => l !== label));
    } else {
      setFilterLabels([...filterLabels, label]);
    }
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterLabels([]);
    setStatusFilter('all');
    setSortOption('name-asc');
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    filterLabels.length > 0 ||
    statusFilter !== 'all' ||
    sortOption !== 'name-asc';

  // Bulk Delete Modal state
  const [bulkDeleteConfig, setBulkDeleteConfig] = useState<{
    isOpen: boolean;
    targets: Member[];
    affectedSchedulesCount: number;
  }>({
    isOpen: false,
    targets: [],
    affectedSchedulesCount: 0
  });

  const toggleLabel = (label: string) => {
    if (selectedLabels.includes(label)) {
      // Removing a label is always allowed
      setSelectedLabels(sortTags(selectedLabels.filter((l) => l !== label)));
      return;
    }

    // Check single-holder rule for Pastor & Worship Leader
    const uniqueHolder = getExistingUniqueTagHolder(label, members, editingId);
    if (uniqueHolder) {
      showToast(
        `Only one member in the roster may have the "${getNormalizedUniqueTagName(label)}" tag. It is currently assigned to ${uniqueHolder.name}.`,
        'danger'
      );
      return;
    }

    setSelectedLabels(sortTags([...selectedLabels, label]));
  };

  const handleCreateCustomLabel = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customTagInput.trim();
    if (!trimmed) return;

    // Check single-holder rule for Pastor & Worship Leader
    const uniqueHolder = getExistingUniqueTagHolder(trimmed, members, editingId);
    if (uniqueHolder) {
      showToast(
        `Only one member in the roster may have the "${getNormalizedUniqueTagName(trimmed)}" tag. It is currently assigned to ${uniqueHolder.name}.`,
        'danger'
      );
      return;
    }

    if (!labels.includes(trimmed)) {
      onAddCustomLabel(trimmed);
      if (!selectedLabels.includes(trimmed)) {
        setSelectedLabels(sortTags([...selectedLabels, trimmed]));
      }
      setCustomTagInput('');
      showToast(`Added custom label "${trimmed}"`, 'success');
    } else {
      if (!selectedLabels.includes(trimmed)) {
        setSelectedLabels(sortTags([...selectedLabels, trimmed]));
      }
      setCustomTagInput('');
    }
  };

  const handleConfirmMergeSimilar = () => {
    if (!similarMatchData) return;
    const { existingMember, pendingMember } = similarMatchData;

    if (pendingMember.customTagToAdd) {
      onAddCustomLabel(pendingMember.customTagToAdd);
    }

    const mergedLabels = sortTags(
      Array.from(new Set([...(existingMember.labels || []), ...(pendingMember.labels || [])]))
    );

    // Validate uniqueness when merging
    const uniqueCheck = validateUniqueMemberRoles(mergedLabels, members, existingMember.id);
    if (!uniqueCheck.isValid) {
      showToast(uniqueCheck.errorMessage || 'Cannot merge: unique role conflict with another member.', 'danger');
      return;
    }

    const updatedMemberData: Omit<Member, 'id'> = {
      ...existingMember,
      labels: mergedLabels
    };

    onAddMember(updatedMemberData, existingMember.id);
    showToast(`Successfully merged tags and details into "${existingMember.name}".`, 'success');
    setSimilarMatchData(null);
    handleCloseMemberDialog();
  };

  const handleConfirmCreateNewFromSimilar = () => {
    if (!similarMatchData) return;
    const { pendingMember } = similarMatchData;

    if (pendingMember.customTagToAdd) {
      onAddCustomLabel(pendingMember.customTagToAdd);
    }

    // Validate uniqueness when creating new
    const uniqueCheck = validateUniqueMemberRoles(pendingMember.labels, members, editingId || undefined);
    if (!uniqueCheck.isValid) {
      showToast(uniqueCheck.errorMessage || 'Cannot create member: unique role conflict with existing roster member.', 'danger');
      return;
    }

    onAddMember(
      {
        name: pendingMember.name,
        labels: pendingMember.labels
      },
      editingId || undefined
    );

    showToast(`Added new member "${pendingMember.name}" as a separate record.`, 'success');
    setSimilarMatchData(null);
    handleCloseMemberDialog();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = fullName.trim();
    if (!name) {
      showToast('Please enter the member\'s full name.', 'danger');
      return;
    }

    let finalLabels = sortTags([...selectedLabels]);
    const trimmedCustomTag = customTagInput.trim();
    if (trimmedCustomTag) {
      if (!finalLabels.includes(trimmedCustomTag)) {
        finalLabels = sortTags([...finalLabels, trimmedCustomTag]);
      }
    }

    if (finalLabels.length === 0) {
      showToast('Please select at least one tag or enter a custom tag before saving this member.', 'danger');
      return;
    }

    // Check single-holder rule for Pastor & Worship Leader
    const uniqueCheck = validateUniqueMemberRoles(finalLabels, members, editingId);
    if (!uniqueCheck.isValid) {
      showToast(uniqueCheck.errorMessage || 'Role conflict with an existing roster member.', 'danger');
      return;
    }

    // 1. Check for Exact Duplicate
    const exactMatch = members.find((m) => {
      if (editingId && m.id === editingId) return false;
      return isExactDuplicateName(m.name, name);
    });

    if (exactMatch) {
      setExactDuplicateMember(exactMatch);
      return;
    }

    // 2. Check for Similar Name
    const similarMatch = members.find((m) => {
      if (editingId && m.id === editingId) return false;
      return isSimilarName(name, m.name);
    });

    if (similarMatch) {
      setSimilarMatchData({
        existingMember: similarMatch,
        pendingMember: {
          name,
          labels: finalLabels,
          customTagToAdd: trimmedCustomTag && !labels.includes(trimmedCustomTag) ? trimmedCustomTag : undefined
        }
      });
      return;
    }

    // 3. No collision -> Add or update member
    if (trimmedCustomTag && !labels.includes(trimmedCustomTag)) {
      onAddCustomLabel(trimmedCustomTag);
    }

    onAddMember(
      {
        name,
        labels: finalLabels
      },
      editingId || undefined
    );

    showToast(editingId ? 'Member updated successfully!' : 'Member added to roster.', 'success');
    handleCloseMemberDialog();
  };

  const handleEditClick = (member: Member) => {
    setEditingId(member.id);
    setFullName(member.name);
    setSelectedLabels(sortTags(member.labels));
    setCustomTagInput('');
    setIsMemberDialogOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFullName('');
    setSelectedLabels([]);
    setCustomTagInput('');
  };

  // Filter & Sort Pipeline
  const filteredMembers = filterAndSortMembers(members, searchQuery, filterLabels, sortOption, statusFilter);

  // Multi-select hook
  const {
    selectedIds,
    selectedCount,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    isSelected,
    isAllSelected,
    isSomeSelected
  } = useMultiSelect(filteredMembers);

  const handleRequestDelete = (targets: Member[]) => {
    if (targets.length === 0) return;

    const targetIds = new Set(targets.map((m) => m.id));
    const targetNames = new Set(targets.map((m) => m.name.trim().toLowerCase()));

    const affectedSchedules = schedules.filter((sch) => {
      return (sch.ministryAssignments || []).some((assignment) => {
        const assigned = getAssignmentMembers(assignment);
        return assigned.some(
          (am) =>
            (am.memberId && targetIds.has(am.memberId)) ||
            (am.memberName && targetNames.has(am.memberName.trim().toLowerCase()))
        );
      });
    });

    setBulkDeleteConfig({
      isOpen: true,
      targets,
      affectedSchedulesCount: affectedSchedules.length
    });
  };

  const executeDelete = () => {
    const { targets } = bulkDeleteConfig;
    if (targets.length === 0) return;

    const targetIds = new Set(targets.map((m) => m.id));

    // Preserve historical schedules without removing member snapshot
    const remainingMembers = members.filter((m) => !targetIds.has(m.id));
    onSaveMembers(remainingMembers);

    showToast(
      targets.length === 1
        ? `Member removed from roster. Historical saved line-ups remain preserved.`
        : `${targets.length} members removed from roster. Historical saved line-ups remain preserved.`,
      'success'
    );

    clearSelection();
    setBulkDeleteConfig({ isOpen: false, targets: [], affectedSchedulesCount: 0 });
  };

  return (
    <div data-tour="members-view" className="space-y-6 animate-in fade-in duration-300">
      <div className="w-full space-y-4">
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          {/* Header, Search, Sort By, Filter Labels & Clear Filters */}
          <div className="space-y-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
                  <span>WWCF Santa Cruz Roster ({filteredMembers.length})</span>
                </h3>

                <button
                  ref={addMemberButtonRef}
                  type="button"
                  data-tour="add-member-btn"
                  onClick={handleOpenAddDialog}
                  className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] active:bg-[#144d7c] rounded-xl shadow-xs transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add Member</span>
                </button>
              </div>

                {/* 🔍 Search Members */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    data-tour="member-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Members..."
                    className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Controls Bar: Status Filter, Sort By & Filter Labels */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Status Filter Dropdown */}
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                      <span>Status:</span>
                    </label>
                    <select
                      value={statusFilter}
                      data-tour="member-filter-select"
                      onChange={(e) => setStatusFilter(e.target.value as MemberStatusFilter)}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer"
                    >
                      <option value="all">All Members</option>
                      <option value="active">Active</option>
                      <option value="disciplinary">Under Disciplinary Action</option>
                    </select>
                  </div>

                  {/* Sort By Dropdown */}
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap flex items-center gap-1">
                      <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Sort By:</span>
                    </label>
                    <select
                      value={sortOption}
                      data-tour="member-sort-select"
                      onChange={(e) => handleSortChange(e.target.value as MemberSortOption)}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer"
                    >
                      <option value="name-asc">Name (A → Z)</option>
                      <option value="name-desc">Name (Z → A)</option>
                      <option value="tags-desc">Most Tags → Least Tags</option>
                      <option value="tags-asc">Least Tags → Most Tags</option>
                      <option value="hierarchy-desc">Tag Hierarchy (Highest → Lowest)</option>
                      <option value="hierarchy-asc">Tag Hierarchy (Lowest → Highest)</option>
                      <option value="status-desc">Status (Disciplinary First)</option>
                      <option value="status-asc">Status (Active First)</option>
                    </select>
                  </div>

                  {/* Filter Labels Dropdown */}
                  <div className="relative flex items-center gap-1.5" ref={filterDropdownRef}>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap flex items-center gap-1">
                      <Filter className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Filter Labels:</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
                      className="inline-flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer min-w-[130px]"
                    >
                      <span className="truncate">
                        {filterLabels.length === 0
                          ? 'All Labels'
                          : filterLabels.length === 1
                          ? filterLabels[0]
                          : `${filterLabels.length} Labels Selected`}
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isFilterDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Filter Popover Dropdown */}
                    {isFilterDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1.5 w-60 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-30 space-y-1 animate-in fade-in slide-in-from-top-2 duration-150">
                        <button
                          type="button"
                          onClick={() => setFilterLabels([])}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                            filterLabels.length === 0
                              ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>All Labels (Show All)</span>
                          {filterLabels.length === 0 && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                        </button>

                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                        <div className="max-h-52 overflow-y-auto space-y-0.5">
                          {sortTags(labels).map((lbl) => {
                            const isChecked = filterLabels.includes(lbl);
                            return (
                              <label
                                key={lbl}
                                className="flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer text-slate-700 dark:text-slate-300 font-medium select-none"
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleFilterLabel(lbl)}
                                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                  <span>{lbl}</span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Clear Filters Button */}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/80 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded-lg transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear Filters</span>
                  </button>
                )}
              </div>

              {/* Active Filter Label Chips */}
              {filterLabels.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">Filtered Labels:</span>
                  {sortTags(filterLabels).map((lbl) => (
                    <span
                      key={lbl}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80"
                    >
                      <span>{lbl}</span>
                      <button
                        type="button"
                        onClick={() => toggleFilterLabel(lbl)}
                        className="hover:text-indigo-900 dark:hover:text-white cursor-pointer ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFilterLabels([])}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer ml-1"
                  >
                    Clear Labels
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 🌟 Universal Action Buttons Toolbar */}
          <div
            data-tour="member-bulk-actions"
            className="sticky top-[73px] sm:top-[77px] z-20 flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 shadow-sm transition-all"
          >
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeSelected;
                  }}
                  onChange={() => toggleSelectAll(filteredMembers)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Select All ({filteredMembers.length})</span>
              </label>

              {selectedCount > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {selectedCount} selected
                </span>
              )}
            </div>

            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {selectedCount === 1 && (
                  /* Edit Member Button */
                  <button
                    type="button"
                    onClick={() => {
                      const selectedMembers = members.filter((m) => selectedIds.has(m.id));
                      if (selectedMembers.length === 1) {
                        handleEditClick(selectedMembers[0]);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-xs transition-all cursor-pointer select-none btn-press-feedback"
                    title="Edit selected member"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Member</span>
                  </button>
                )}

                {/* DA Member Button */}
                <button
                  type="button"
                  onClick={() => {
                    const selectedMembers = members.filter((m) => selectedIds.has(m.id));
                    if (selectedMembers.length > 0) {
                      handleOpenDisciplinaryModal(selectedMembers);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-xs transition-all cursor-pointer select-none btn-press-feedback"
                  title={
                    selectedCount === 1
                      ? 'Manage Disciplinary Action'
                      : `Apply Disciplinary Action to ${selectedCount} selected members`
                  }
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>DA Member</span>
                </button>

                {/* Delete Member Button */}
                <button
                  type="button"
                  onClick={() => {
                    const selectedMembers = members.filter((m) => selectedIds.has(m.id));
                    if (selectedMembers.length > 0) {
                      handleRequestDelete(selectedMembers);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border bg-rose-600 hover:bg-rose-700 text-white border-rose-600 shadow-xs transition-all cursor-pointer select-none btn-press-feedback"
                  title={
                    selectedCount === 1
                      ? 'Delete selected member'
                      : `Delete ${selectedCount} selected members`
                  }
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Member{selectedCount > 1 ? `s (${selectedCount})` : ''}</span>
                </button>

                {/* Clear Selection */}
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer ml-1"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            {filteredMembers.length === 0 ? (
              members.length === 0 ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 space-y-2">
                  <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 stroke-[1.5]" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">
                    No members yet.
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Add your worship team members to get started.
                  </p>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No ministry members match your search query.
                </div>
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/30">
                      <th className="py-2.5 px-3 w-8" aria-label="Row selection"></th>
                      <th className="py-2.5 px-3">Member Name</th>
                      <th className="py-2.5 px-3">Assigned Labels</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredMembers.map((member, idx) => {
                      const selected = isSelected(member.id);
                      const isDisciplinary = isMemberUnderDisciplinary(member);

                      return (
                        <tr
                          key={member.id}
                          className={`transition-colors ${
                            selected
                              ? 'bg-indigo-50/30 dark:bg-indigo-950/30'
                              : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-3 w-8">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) => toggleSelect(member.id, idx, e)}
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            <div className="flex flex-col items-start gap-1">
                              <span>{member.name}</span>
                              {isDisciplinary && (
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                  <span>🔴 Disciplinary Action</span>
                                  {member.disciplinaryAction?.endDate && (
                                    <span className="text-rose-500 dark:text-rose-400 font-medium">
                                      • Ends: {member.disciplinaryAction.endDate}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1">
                              {sortTags(member.labels).map((lbl) => (
                                <span
                                  key={lbl}
                                  className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60"
                                >
                                  {lbl}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleEditClick(member)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#1b75bc] dark:hover:text-[#54b0e2] hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                              title={`Edit ${member.name}`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      {/* Delete Confirmation Modal */}
      <Modal
        id="member-bulk-delete-modal"
        isOpen={bulkDeleteConfig.isOpen}
        title={
          bulkDeleteConfig.targets.length === 1
            ? 'Delete this member?'
            : `Delete ${bulkDeleteConfig.targets.length} Selected Members?`
        }
        message="This will remove the member from the roster. Historical saved line-ups will remain preserved."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isDanger={true}
        onConfirm={executeDelete}
        onClose={() =>
          setBulkDeleteConfig({ isOpen: false, targets: [], affectedSchedulesCount: 0 })
        }
      />
      {/* Disciplinary Action Modal */}
      {disciplinaryModalMembers && disciplinaryModalMembers.length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          style={{ zIndex: disciplinaryZIndex }}
          data-overlay-id="disciplinary-action-modal"
          data-overlay-topmost={isDisciplinaryTopmost}
          className={`fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 transition-opacity ${
            isDisciplinaryBlocked ? 'pointer-events-none select-none opacity-40' : ''
          }`}
          aria-hidden={isDisciplinaryBlocked}
          inert={isDisciplinaryBlocked ? true : undefined}
        >
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden space-y-0">
            {/* Modal Header */}
            <div className="p-5 bg-rose-50/50 dark:bg-rose-950/30 border-b border-rose-100 dark:border-rose-900/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {disciplinaryModalMembers.length === 1
                      ? 'Disciplinary Action'
                      : 'Apply Disciplinary Action?'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {disciplinaryModalMembers.length === 1 ? (
                      <>
                        Managing status for <span className="font-bold text-slate-800 dark:text-slate-200">{disciplinaryModalMembers[0].name}</span>
                      </>
                    ) : (
                      <>
                        You are about to place <span className="font-bold text-slate-800 dark:text-slate-200">{disciplinaryModalMembers.length} members</span> under Disciplinary Action.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDisciplinaryModalMembers(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* If multiple members selected, show member chips */}
            {disciplinaryModalMembers.length > 1 && (
              <div className="px-6 py-3 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 max-h-28 overflow-y-auto">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                  Selected Members ({disciplinaryModalMembers.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {disciplinaryModalMembers.map((m) => (
                    <span
                      key={m.id}
                      className="px-2 py-0.5 rounded-md text-xs font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveDisciplinaryAction} className="p-6 space-y-5">
              {/* Status Radio Toggles */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Disciplinary Status
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      dispStatus === 'active'
                        ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dispStatus"
                      value="active"
                      checked={dispStatus === 'active'}
                      onChange={() => setDispStatus('active')}
                      className="sr-only"
                    />
                    <AlertOctagon className="w-4 h-4 text-rose-600" />
                    <span>Active Disciplinary</span>
                  </label>

                  <label
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      dispStatus === 'cleared'
                        ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dispStatus"
                      value="cleared"
                      checked={dispStatus === 'cleared'}
                      onChange={() => setDispStatus('cleared')}
                      className="sr-only"
                    />
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Cleared / Restored</span>
                  </label>
                </div>
              </div>

              {dispStatus === 'active' && (
                <div className="space-y-4 pt-1 animate-in fade-in duration-200">
                  {/* Notice Banner */}
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-200">
                    {disciplinaryModalMembers.length === 1
                      ? 'You are about to place 1 member under Disciplinary Action.'
                      : `You are about to place ${disciplinaryModalMembers.length} members under Disciplinary Action.`}
                  </div>

                  {/* Duration Value & Type */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-indigo-500" />
                        <span>Duration</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={dispDurationValue}
                        onChange={(e) => setDispDurationValue(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Duration Type
                      </label>
                      <select
                        value={dispDurationType}
                        onChange={(e) => setDispDurationType(e.target.value as DisciplinaryDurationType)}
                        className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer"
                      >
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                      </select>
                    </div>
                  </div>

                  {/* Start Date & Auto-Calculated End Date */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-indigo-500" />
                        <span>Start Date</span>
                      </label>
                      <input
                        type="date"
                        value={dispStartDate}
                        onChange={(e) => setDispStartDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        End Date (Auto)
                      </label>
                      <div className="px-3 py-2 text-xs font-bold rounded-lg border border-rose-200/80 dark:border-rose-900/80 bg-rose-50/60 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 flex items-center justify-between">
                        <span>{computedEndDate}</span>
                        <span className="text-[10px] font-normal text-rose-500">Calculated</span>
                      </div>
                    </div>
                  </div>

                  {/* Reason Textarea */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-indigo-500" />
                      <span>Reason / Internal Notes (Optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={dispReason}
                      onChange={(e) => setDispReason(e.target.value)}
                      placeholder="e.g. Repeated absences, conduct issue, or personal leave..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDisciplinaryModalMembers(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Confirm DA
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 🛑 Exact Duplicate Warning Modal */}
      {exactDuplicateMember && typeof document !== 'undefined' && createPortal(
        <div
          style={{ zIndex: exactDuplicateZIndex }}
          data-overlay-id="exact-duplicate-member-modal"
          data-overlay-topmost={isExactDuplicateTopmost}
          className={`fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 transition-opacity ${
            isExactDuplicateBlocked ? 'pointer-events-none select-none opacity-40' : ''
          }`}
          aria-hidden={isExactDuplicateBlocked}
          inert={isExactDuplicateBlocked ? true : undefined}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transform animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-amber-50/60 dark:bg-amber-950/20">
              <div className="flex items-center gap-2.5">
                <AlertOctagon className="w-5 h-5 text-amber-500 shrink-0" />
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  Exact Duplicate Found
                </h3>
              </div>
              <button
                onClick={() => setExactDuplicateMember(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                A member with this exact name already exists.
              </p>

              <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/30 text-xs space-y-1.5">
                <div className="font-bold text-amber-950 dark:text-amber-200 text-sm">
                  {exactDuplicateMember.name}
                </div>
                {exactDuplicateMember.labels && exactDuplicateMember.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {exactDuplicateMember.labels.map((l) => (
                      <span
                        key={l}
                        className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-100 dark:bg-amber-900/80 text-amber-800 dark:text-amber-300"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Member names must be unique to avoid ambiguity in ministry assignments. Duplicate records with the exact same name are not permitted.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setExactDuplicateMember(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const memberToEdit = exactDuplicateMember;
                  setExactDuplicateMember(null);
                  handleEditClick(memberToEdit);
                  showToast(`Loaded existing member "${memberToEdit.name}" for editing.`, 'info');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Edit Existing Member
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 🤝 Similar Name Detection / Merge Suggestion Modal */}
      {similarMatchData && typeof document !== 'undefined' && createPortal(
        <div
          style={{ zIndex: similarMatchZIndex }}
          data-overlay-id="similar-match-member-modal"
          data-overlay-topmost={isSimilarMatchTopmost}
          className={`fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200 transition-opacity ${
            isSimilarMatchBlocked ? 'pointer-events-none select-none opacity-40' : ''
          }`}
          aria-hidden={isSimilarMatchBlocked}
          inert={isSimilarMatchBlocked ? true : undefined}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transform animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/60 dark:bg-indigo-950/30">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  A similar member already exists.
                </h3>
              </div>
              <button
                onClick={() => setSimilarMatchData(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 text-xs space-y-2">
                <div className="text-[11px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400">
                  Possible match:
                </div>
                <div className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  {similarMatchData.existingMember.name}
                </div>
                {similarMatchData.existingMember.labels && similarMatchData.existingMember.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {similarMatchData.existingMember.labels.map((l) => (
                      <span
                        key={l}
                        className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-indigo-100 dark:bg-indigo-900/80 text-indigo-800 dark:text-indigo-300"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                The member you&apos;re adding has a similar name.
              </p>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Would you like to merge this member with the existing record or create a separate member?
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSimilarMatchData(null)}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateNewFromSimilar}
                className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Create New Member
              </button>
              <button
                type="button"
                onClick={handleConfirmMergeSimilar}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Merge with Existing
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Add / Edit Member Modal Dialog */}
      {isMemberDialogOpen &&
        createPortal(
          <div
            style={{ zIndex: memberDialogZIndex }}
            data-overlay-id="member-form-dialog"
            data-overlay-topmost={isMemberDialogTopmost}
            className={`fixed inset-0 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200 transition-opacity ${
              isMemberDialogBlocked ? 'pointer-events-none select-none opacity-40' : ''
            }`}
            onClick={handleCloseMemberDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-dialog-title"
          >
            <div
              className="w-full max-w-lg wwcf-glass-modal rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden transform animate-in zoom-in-95 duration-200 max-h-[90vh] my-auto flex flex-col text-slate-900 dark:text-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Dialog Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/50 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2]">
                    {editingId ? <Edit3 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 id="member-dialog-title" className="text-sm font-bold text-slate-900 dark:text-white">
                      {editingId ? 'Edit Ministry Member' : 'Add New Member'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {editingId
                        ? 'Update roster member details and ministry assignments'
                        : 'Add a new volunteer or minister to the WWCF roster'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseMemberDialog}
                  aria-label="Close dialog"
                  title="Close dialog"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dialog Form Body */}
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                <div data-tour="member-form" className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
                  {/* Name field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      data-tour="member-name-input"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Bro. John Reyes"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc] outline-none transition-all"
                      required
                      autoFocus
                    />
                  </div>

                  {/* Labels selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>Assign Ministry Labels</span>
                      <span className="text-[10px] text-slate-400 font-normal normal-case">Select all that apply</span>
                    </label>

                    <div
                      data-tour="member-tags-select"
                      className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 max-h-48 overflow-y-auto"
                    >
                      {sortTags(labels).map((label) => {
                        const isSelectedLabel = selectedLabels.includes(label);
                        const uniqueConflictHolder = getExistingUniqueTagHolder(label, members, editingId);
                        const isUniqueConflict = Boolean(uniqueConflictHolder);

                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleLabel(label)}
                            title={
                              isUniqueConflict
                                ? `Only one member may have the "${getNormalizedUniqueTagName(
                                    label
                                  )}" tag (currently assigned to ${uniqueConflictHolder?.name}).`
                                : undefined
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all select-none ${
                              isUniqueConflict
                                ? 'bg-slate-100/80 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-60'
                                : isSelectedLabel
                                ? 'bg-[#1b75bc] text-white shadow-xs cursor-pointer'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer'
                            }`}
                          >
                            {isSelectedLabel && <Check className="w-3 h-3" />}
                            <span>{label}</span>
                            {isUniqueConflict && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500" title="Single-holder role">
                                🔒
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Single-Holder Notice */}
                    {(getExistingUniqueTagHolder('Pastor', members) ||
                      getExistingUniqueTagHolder('Worship Leader', members)) && (
                      <div className="text-[11px] p-2.5 rounded-xl bg-[#1b75bc]/10 border border-[#1b75bc]/20 text-slate-600 dark:text-slate-300 space-y-1">
                        <div className="font-bold text-[#1b75bc] dark:text-[#54b0e2] uppercase tracking-wider text-[10px]">
                          Single-Holder Roles (1 per Roster)
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                          {(() => {
                            const pastor = getExistingUniqueTagHolder('Pastor', members);
                            if (!pastor) return null;
                            return (
                              <span>
                                <strong className="text-slate-700 dark:text-slate-200">Pastor:</strong> {pastor.name}
                                {editingId === pastor.id && (
                                  <span className="text-[#1b75bc] dark:text-[#54b0e2] font-semibold"> (Current)</span>
                                )}
                              </span>
                            );
                          })()}
                          {(() => {
                            const wl = getExistingUniqueTagHolder('Worship Leader', members);
                            if (!wl) return null;
                            return (
                              <span>
                                <strong className="text-slate-700 dark:text-slate-200">Worship Leader:</strong> {wl.name}
                                {editingId === wl.id && (
                                  <span className="text-[#1b75bc] dark:text-[#54b0e2] font-semibold"> (Current)</span>
                                )}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Custom Tag input */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-[#1b75bc] dark:text-[#54b0e2]" />
                      <span>Create Custom Tag / Label</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customTagInput}
                        onChange={(e) => setCustomTagInput(e.target.value)}
                        placeholder="e.g. Acoustic Guitar"
                        className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc] outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCreateCustomLabel}
                        className="btn-tactile px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/80 dark:border-white/10 rounded-xl transition-all cursor-pointer shrink-0"
                      >
                        Add Tag
                      </button>
                    </div>
                  </div>
                </div>

                {/* Dialog Footer Actions */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-slate-900/50 shrink-0">
                  <button
                    type="button"
                    onClick={handleCloseMemberDialog}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-tour="add-member-btn"
                    className="btn-tactile px-5 py-2 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] active:bg-[#144d7c] rounded-xl shadow-xs shadow-[#1b75bc]/25 transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
                  >
                    {editingId ? 'Update Member' : 'Save Member to Roster'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

