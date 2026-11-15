import React, { useState, useEffect, useMemo } from 'react';
import { LineupTemplate, ServiceType, Schedule, Song, Member, CANONICAL_SERVICE_TYPES, normalizeServiceType } from '../types';
import { TemplateService } from '../services/templateService';
import { useOverlay, OverlayLayer } from '../hooks/useOverlay';
import {
  X,
  LayoutTemplate,
  Plus,
  Copy,
  Trash2,
  Check,
  Star,
  ChevronDown,
  ChevronUp,
  Music,
  Users,
  FileText,
  AlertCircle,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface LineupTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentScheduleDraft?: Partial<Schedule> | null;
  allSongs?: Song[];
  members?: Member[];
  onApplyTemplate: (
    template: LineupTemplate,
    options: { includeKeys: boolean; includeMembers: boolean }
  ) => void;
  showToast?: (text: string, type?: 'success' | 'danger' | 'info') => void;
}

export const LineupTemplatesModal: React.FC<LineupTemplatesModalProps> = ({
  isOpen,
  onClose,
  currentScheduleDraft,
  allSongs = [],
  members = [],
  onApplyTemplate,
  showToast
}) => {
  const [templates, setTemplates] = useState<LineupTemplate[]>([]);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);

  // Form modal state for creating/editing template
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSavingFromDraft, setIsSavingFromDraft] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<LineupTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [formServiceType, setFormServiceType] = useState<string>('Sunday Service');
  const [formDescription, setFormDescription] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);

  // Apply confirmation dialog state
  const [applyingTemplate, setApplyingTemplate] = useState<LineupTemplate | null>(null);
  const [includeKeys, setIncludeKeys] = useState(true);
  const [includeMembers, setIncludeMembers] = useState(false);

  // Delete confirmation
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  const { isBlocked, isTopmost, zIndex } = useOverlay({
    id: 'lineup-templates-modal',
    isOpen,
    onClose,
    layer: OverlayLayer.MODAL
  });

  const reloadTemplates = () => {
    setTemplates(TemplateService.getTemplatesSync());
  };

  useEffect(() => {
    if (isOpen) {
      reloadTemplates();
      setPreviewTemplateId(null);
      setIsFormOpen(false);
      setApplyingTemplate(null);
      setDeletingTemplateId(null);
    }
  }, [isOpen]);

  const filteredTemplates = useMemo(() => {
    if (selectedTypeFilter === 'all') return templates;
    const target = normalizeServiceType(selectedTypeFilter);
    return templates.filter((t) => normalizeServiceType(t.serviceType) === target);
  }, [templates, selectedTypeFilter]);

  const availableServiceTypes = useMemo(() => {
    const fromTemplates = templates.map((t) => t.serviceType);
    const combined = Array.from(new Set([...CANONICAL_SERVICE_TYPES, ...fromTemplates]));
    return combined;
  }, [templates]);

  // Open form to save current scheduler lineup as template
  const handleOpenSaveCurrentAsTemplate = () => {
    if (!currentScheduleDraft) return;
    setEditingTemplate(null);
    setIsSavingFromDraft(true);
    setFormName(`${currentScheduleDraft.serviceType || 'Sunday Service'} Template`);
    setFormServiceType(currentScheduleDraft.serviceType || 'Sunday Service');
    setFormDescription('Standard lineup structure created from current draft');
    setFormIsDefault(false);
    setIsFormOpen(true);
  };

  // Open empty form
  const handleOpenCreateBlankTemplate = () => {
    setEditingTemplate(null);
    setIsSavingFromDraft(false);
    setFormName('');
    setFormServiceType('Sunday Service');
    setFormDescription('');
    setFormIsDefault(false);
    setIsFormOpen(true);
  };

  // Open edit form for existing template
  const handleOpenEditTemplate = (tpl: LineupTemplate) => {
    setEditingTemplate(tpl);
    setIsSavingFromDraft(false);
    setFormName(tpl.name);
    setFormServiceType(tpl.serviceType);
    setFormDescription(tpl.description || '');
    setFormIsDefault(Boolean(tpl.isDefault));
    setIsFormOpen(true);
  };

  const handleSaveFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast?.('Please enter a template name.', 'danger');
      return;
    }

    try {
      if (editingTemplate) {
        // Updating existing template metadata
        TemplateService.saveTemplate({
          ...editingTemplate,
          name: formName.trim(),
          serviceType: formServiceType,
          description: formDescription.trim(),
          isDefault: formIsDefault
        });
        showToast?.('Template updated successfully.', 'success');
      } else if (currentScheduleDraft && isSavingFromDraft) {
        // Creating template from current schedule draft while preserving slot alignment
        const rawPraise = currentScheduleDraft.praiseSongs || [];
        const praiseSlots = rawPraise
          .map((title, idx) => ({
            title: (title || '').trim(),
            id: currentScheduleDraft.praiseSongIds?.[idx],
            key: currentScheduleDraft.praiseSongKeys?.[idx] || ''
          }))
          .filter((slot) => Boolean(slot.title));

        const rawWorship = currentScheduleDraft.worshipSongs || [];
        const worshipSlots = rawWorship
          .map((title, idx) => ({
            title: (title || '').trim(),
            id: currentScheduleDraft.worshipSongIds?.[idx],
            key: currentScheduleDraft.worshipSongKeys?.[idx] || ''
          }))
          .filter((slot) => Boolean(slot.title));

        TemplateService.saveTemplate({
          name: formName.trim(),
          serviceType: formServiceType,
          description: formDescription.trim(),
          isDefault: formIsDefault,
          praiseSongs: praiseSlots.length > 0 ? praiseSlots.map((s) => s.title) : [''],
          worshipSongs: worshipSlots.length > 0 ? worshipSlots.map((s) => s.title) : [''],
          praiseSongIds: praiseSlots.length > 0 ? praiseSlots.map((s) => s.id) : [undefined],
          worshipSongIds: worshipSlots.length > 0 ? worshipSlots.map((s) => s.id) : [undefined],
          praiseSongKeys: praiseSlots.length > 0 ? praiseSlots.map((s) => s.key) : [''],
          worshipSongKeys: worshipSlots.length > 0 ? worshipSlots.map((s) => s.key) : [''],
          ministryAssignments: currentScheduleDraft.ministryAssignments,
          notes: currentScheduleDraft.notes,
          transitionNotes: currentScheduleDraft.transitionNotes
        });
        showToast?.(`Template "${formName.trim()}" created from current lineup!`, 'success');
      } else {
        // Creating blank template structure
        TemplateService.saveTemplate({
          name: formName.trim(),
          serviceType: formServiceType,
          description: formDescription.trim(),
          isDefault: formIsDefault,
          praiseSongs: ['', ''],
          worshipSongs: ['', ''],
          ministryRoles: ['Song Leader', 'Backup Singer', 'Guitarist', 'Keyboardist', 'Bassist', 'Drummer', 'Audio/Live Technician', 'Lyricist']
        });
        showToast?.(`Template "${formName.trim()}" created!`, 'success');
      }

      setIsFormOpen(false);
      setIsSavingFromDraft(false);
      reloadTemplates();
    } catch (err: any) {
      console.error('Template save error:', err);
      showToast?.(err?.message || 'Failed to save template.', 'danger');
    }
  };

  const handleDuplicate = (id: string) => {
    try {
      const copy = TemplateService.duplicateTemplate(id);
      if (copy) {
        showToast?.(`Duplicated "${copy.name}".`, 'success');
        reloadTemplates();
      }
    } catch (err: any) {
      console.error('Template duplicate error:', err);
      showToast?.(err?.message || 'Failed to duplicate template.', 'danger');
    }
  };

  const handleDeleteConfirm = (id: string) => {
    try {
      TemplateService.deleteTemplate(id);
      showToast?.('Template deleted.', 'info');
      setDeletingTemplateId(null);
      reloadTemplates();
    } catch (err: any) {
      console.error('Template delete error:', err);
      showToast?.(err?.message || 'Failed to delete template.', 'danger');
    }
  };

  const handleToggleDefault = (tpl: LineupTemplate) => {
    try {
      if (tpl.isDefault) {
        // Unset default
        TemplateService.saveTemplate({ ...tpl, isDefault: false });
        showToast?.(`Removed "${tpl.name}" as default for ${tpl.serviceType}.`, 'info');
      } else {
        TemplateService.setDefaultTemplate(tpl.id, tpl.serviceType);
        showToast?.(`Set "${tpl.name}" as default for ${tpl.serviceType}.`, 'success');
      }
      reloadTemplates();
    } catch (err: any) {
      console.error('Template default toggle error:', err);
      showToast?.(err?.message || 'Failed to update default template.', 'danger');
    }
  };

  const handleExecuteApply = () => {
    if (!applyingTemplate) return;
    onApplyTemplate(applyingTemplate, { includeKeys, includeMembers });
    setApplyingTemplate(null);
    onClose();
    showToast?.(`Applied template "${applyingTemplate.name}" to lineup!`, 'success');
  };

  if (!isOpen) return null;

  return (
    <div
      style={{ zIndex }}
      data-overlay-id="lineup-templates-modal"
      data-overlay-topmost={isTopmost}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 transition-opacity ${
        isBlocked ? 'pointer-events-none select-none opacity-40' : ''
      }`}
      aria-hidden={isBlocked}
      inert={isBlocked ? true : undefined}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] my-auto flex flex-col transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2]">
              <LayoutTemplate className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base leading-snug">
                Line-up Templates & Presets
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Save and reuse standard worship set structures across services
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
          {/* Service Type Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
            <button
              type="button"
              onClick={() => setSelectedTypeFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                selectedTypeFilter === 'all'
                  ? 'bg-[#1b75bc] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All ({templates.length})
            </button>
            {availableServiceTypes.map((type) => {
              const count = templates.filter((t) => normalizeServiceType(t.serviceType) === normalizeServiceType(type)).length;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedTypeFilter(type)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedTypeFilter === type
                      ? 'bg-[#1b75bc] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {type} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>

          {/* New / Save current buttons */}
          <div className="flex items-center gap-2">
            {currentScheduleDraft && (
              <button
                type="button"
                onClick={handleOpenSaveCurrentAsTemplate}
                className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/20 hover:bg-[#1b75bc]/20 transition-colors cursor-pointer"
                title="Save current lineup slots & roles as a new reusable template"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Save Current as Template</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenCreateBlankTemplate}
              className="btn-tactile inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1b75bc] text-white hover:bg-[#165d97] transition-colors cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Template</span>
            </button>
          </div>
        </div>

        {/* Body / List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {filteredTemplates.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                <LayoutTemplate className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                No templates saved yet
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Create a template from scratch or click &quot;Save Current as Template&quot; to save your current lineup structure.
              </p>
              <button
                type="button"
                onClick={handleOpenCreateBlankTemplate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#1b75bc] text-white hover:bg-[#165d97] transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Template</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {filteredTemplates.map((tpl) => {
                const isPreviewing = previewTemplateId === tpl.id;
                const praiseCount = tpl.praiseSongs?.filter(Boolean).length || 0;
                const worshipCount = tpl.worshipSongs?.filter(Boolean).length || 0;
                const rolesCount = tpl.ministryAssignments?.length || tpl.ministryRoles?.length || 0;

                return (
                  <div
                    key={tpl.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs space-y-3 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {tpl.name}
                          </h4>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/70 text-[#1b75bc] dark:text-[#54b0e2] border border-blue-200/60 dark:border-blue-800/60">
                            {tpl.serviceType}
                          </span>
                          {tpl.isDefault && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                              <span>Default for {tpl.serviceType}</span>
                            </span>
                          )}
                        </div>
                        {tpl.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {tpl.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setApplyingTemplate(tpl)}
                          className="btn-tactile inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] transition-all cursor-pointer shadow-xs"
                        >
                          <span>Apply</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Metadata summary chips */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300 pt-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium">
                        <Music className="w-3 h-3 text-[#1b75bc]" />
                        <span>Praise: {praiseCount}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium">
                        <Music className="w-3 h-3 text-purple-600" />
                        <span>Worship: {worshipCount}</span>
                      </span>
                      {rolesCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium">
                          <Users className="w-3 h-3 text-emerald-600" />
                          <span>Roles: {rolesCount}</span>
                        </span>
                      )}
                      {tpl.notes && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium">
                          <FileText className="w-3 h-3 text-slate-500" />
                          <span>Includes Notes</span>
                        </span>
                      )}

                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewTemplateId(isPreviewing ? null : tpl.id)}
                          className="text-xs font-semibold text-[#1b75bc] dark:text-[#54b0e2] hover:underline flex items-center gap-0.5 cursor-pointer px-1 py-0.5"
                        >
                          <span>{isPreviewing ? 'Hide Details' : 'View Details'}</span>
                          {isPreviewing ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleDefault(tpl)}
                          className="p-1 text-slate-400 hover:text-amber-500 rounded transition-colors cursor-pointer"
                          title={tpl.isDefault ? 'Remove Default status' : 'Set as default for this service type'}
                        >
                          <Star className={`w-4 h-4 ${tpl.isDefault ? 'fill-amber-500 text-amber-500' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(tpl.id)}
                          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded transition-colors cursor-pointer"
                          title="Duplicate template"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditTemplate(tpl)}
                          className="p-1 text-slate-400 hover:text-[#1b75bc] rounded transition-colors cursor-pointer"
                          title="Edit template details"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingTemplateId(tpl.id)}
                          className="p-1 text-slate-400 hover:text-rose-500 rounded transition-colors cursor-pointer"
                          title="Delete template"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Preview Details */}
                    {isPreviewing && (
                      <div className="mt-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-2.5 animate-in fade-in duration-150">
                        <div>
                          <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            Praise Songs ({praiseCount}):
                          </span>
                          <ol className="list-decimal list-inside space-y-0.5 text-slate-600 dark:text-slate-400">
                            {tpl.praiseSongs.map((s, idx) => (
                              <li key={idx}>
                                {s.trim() || <span className="italic text-slate-400">Empty Praise Slot</span>}
                                {tpl.praiseSongKeys?.[idx] && (
                                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 ml-1.5">
                                    [Key: {tpl.praiseSongKeys[idx]}]
                                  </span>
                                )}
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div>
                          <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            Worship Songs ({worshipCount}):
                          </span>
                          <ol className="list-decimal list-inside space-y-0.5 text-slate-600 dark:text-slate-400">
                            {tpl.worshipSongs.map((s, idx) => (
                              <li key={idx}>
                                {s.trim() || <span className="italic text-slate-400">Empty Worship Slot</span>}
                                {tpl.worshipSongKeys?.[idx] && (
                                  <span className="font-semibold text-purple-600 dark:text-purple-400 ml-1.5">
                                    [Key: {tpl.worshipSongKeys[idx]}]
                                  </span>
                                )}
                              </li>
                            ))}
                          </ol>
                        </div>

                        {rolesCount > 0 && (
                          <div>
                            <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                              Ministry Roles Structure:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {(tpl.ministryAssignments || tpl.ministryRoles || []).map((r: any, idx: number) => {
                                const roleName = typeof r === 'string' ? r : r.role;
                                return (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px]"
                                  >
                                    {roleName}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {tpl.notes && (
                          <div>
                            <span className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                              Default Service Notes:
                            </span>
                            <p className="text-slate-600 dark:text-slate-400 whitespace-pre-line italic">
                              {tpl.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Create / Edit Form Overlay */}
        {isFormOpen && (
          <div className="absolute inset-0 z-10 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between overflow-y-auto animate-in fade-in duration-150">
            <form onSubmit={handleSaveFormSubmit} className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  {editingTemplate ? 'Edit Template Details' : 'Create New Line-up Template'}
                </h4>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Sunday Service 4-Song Flow, Midweek 3-Song Prayer"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-[#1b75bc]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Associated Service Type
                </label>
                <select
                  value={formServiceType}
                  onChange={(e) => setFormServiceType(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-[#1b75bc]"
                >
                  {availableServiceTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Description / Intended Use (Optional)
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g., 2 Praise + 2 Worship songs with acoustic guitar transition for morning worship."
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-[#1b75bc]"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsDefault}
                  onChange={(e) => setFormIsDefault(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-slate-300 dark:border-slate-600 text-[#1b75bc] focus:ring-[#1b75bc]"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold block text-slate-800 dark:text-slate-200">
                    Set as default template for {formServiceType}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    Automatically pre-selects this template structure when planning a new {formServiceType}.
                  </span>
                </div>
              </label>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-tactile px-5 py-2 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] rounded-xl cursor-pointer shadow-xs"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Apply Confirmation Dialog */}
        {applyingTemplate && (
          <div className="absolute inset-0 z-20 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-[#1b75bc]/10 text-[#1b75bc] shrink-0">
                  <LayoutTemplate className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    Apply Template: {applyingTemplate.name}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    This loads the template structure into your current Scheduler lineup draft.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 pt-1 text-xs">
                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeKeys}
                    onChange={(e) => setIncludeKeys(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#1b75bc] focus:ring-[#1b75bc]"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    Include performed keys from template
                  </span>
                </label>

                <label className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeMembers}
                    onChange={(e) => setIncludeMembers(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[#1b75bc] focus:ring-[#1b75bc]"
                  />
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 block">
                      Copy assigned team member names
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      Default applies role rows only. Copying members requires confirming active eligibility, DA, and Song Leader limits.
                    </span>
                  </div>
                </label>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <p>
                  Applying a template sets up your <strong>unsaved draft</strong>. Your existing saved schedules will not be modified unless you explicitly click &quot;Save Lineup&quot;.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setApplyingTemplate(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteApply}
                  className="btn-tactile px-5 py-2 text-xs font-bold text-white bg-[#1b75bc] hover:bg-[#165d97] rounded-xl cursor-pointer shadow-xs"
                >
                  Apply to Lineup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deletingTemplateId && (
          <div className="absolute inset-0 z-20 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Delete Line-up Template?
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Are you sure you want to delete this template? This will not affect any lineups already saved.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingTemplateId(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteConfirm(deletingTemplateId)}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
