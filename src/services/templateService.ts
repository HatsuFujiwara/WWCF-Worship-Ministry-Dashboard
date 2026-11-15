/**
 * WWCF Lineup Template Service (L-01)
 *
 * Manages reusable service line-up templates and service-type presets.
 * Persists in LocalStorage under 'wwcf_lineup_templates_v1'.
 */

import { LineupTemplate, ServiceType, normalizeServiceType } from '../types';
import { getManilaNowISO } from '../utils/dateUtils';

export const TEMPLATES_STORAGE_KEY = 'wwcf_lineup_templates_v1';

export function sanitizeLineupTemplate(raw: any, index = 0): LineupTemplate | null {
  if (!raw || typeof raw !== 'object') return null;

  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id.trim().slice(0, 100)
    : `tpl_${Date.now()}_${index}`;
  const name = typeof raw.name === 'string' && raw.name.trim()
    ? raw.name.trim().slice(0, 200)
    : `Template ${index + 1}`;
  const serviceType: ServiceType = normalizeServiceType(
    typeof raw.serviceType === 'string' ? raw.serviceType : 'Sunday Service'
  );
  const description = typeof raw.description === 'string'
    ? raw.description.trim().slice(0, 1000)
    : undefined;

  const praiseSongs = Array.isArray(raw.praiseSongs)
    ? raw.praiseSongs.slice(0, 50).map((s: any) => (typeof s === 'string' ? s.slice(0, 300) : ''))
    : [''];
  const worshipSongs = Array.isArray(raw.worshipSongs)
    ? raw.worshipSongs.slice(0, 50).map((s: any) => (typeof s === 'string' ? s.slice(0, 300) : ''))
    : [''];

  const praiseSongIds = Array.isArray(raw.praiseSongIds)
    ? raw.praiseSongIds.slice(0, 50).map((i: any) => (typeof i === 'string' && i.trim() ? i.trim().slice(0, 100) : undefined))
    : undefined;
  const worshipSongIds = Array.isArray(raw.worshipSongIds)
    ? raw.worshipSongIds.slice(0, 50).map((i: any) => (typeof i === 'string' && i.trim() ? i.trim().slice(0, 100) : undefined))
    : undefined;

  const praiseSongKeys = Array.isArray(raw.praiseSongKeys)
    ? raw.praiseSongKeys.slice(0, 50).map((k: any) => String(k || '').slice(0, 20))
    : undefined;
  const worshipSongKeys = Array.isArray(raw.worshipSongKeys)
    ? raw.worshipSongKeys.slice(0, 50).map((k: any) => String(k || '').slice(0, 20))
    : undefined;

  const ministryRoles = Array.isArray(raw.ministryRoles)
    ? raw.ministryRoles.slice(0, 50).map((r: any) => String(r || '').slice(0, 100))
    : undefined;

  const ministryAssignments = Array.isArray(raw.ministryAssignments)
    ? raw.ministryAssignments.slice(0, 50).map((a: any, aIdx: number) => ({
        id: typeof a?.id === 'string' ? a.id.slice(0, 100) : `assign_${aIdx}`,
        role: typeof a?.role === 'string' ? a.role.slice(0, 100) : 'Ministry Role',
        assignedMembers: Array.isArray(a?.assignedMembers)
          ? a.assignedMembers.map((am: any) => ({
              memberId: typeof am?.memberId === 'string' ? am.memberId.slice(0, 100) : '',
              memberName: typeof am?.memberName === 'string' ? am.memberName.slice(0, 200) : ''
            }))
          : [],
        notes: typeof a?.notes === 'string' ? a.notes.slice(0, 500) : ''
      }))
    : undefined;

  const notes = typeof raw.notes === 'string' ? raw.notes.slice(0, 5000) : undefined;

  const transitionNotes =
    raw.transitionNotes && typeof raw.transitionNotes === 'object' && !Array.isArray(raw.transitionNotes)
      ? Object.entries(raw.transitionNotes).reduce((acc: Record<string, string>, [k, v]) => {
          if (typeof v === 'string') acc[String(k).slice(0, 200)] = v.slice(0, 1000);
          return acc;
        }, {})
      : undefined;

  const isDefault = raw.isDefault === true;
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : getManilaNowISO();
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : getManilaNowISO();
  const version = typeof raw.version === 'number' && raw.version > 0 ? raw.version : 1;

  return {
    id,
    name,
    serviceType,
    description,
    praiseSongs: praiseSongs.length > 0 ? praiseSongs : [''],
    worshipSongs: worshipSongs.length > 0 ? worshipSongs : [''],
    praiseSongIds,
    worshipSongIds,
    praiseSongKeys,
    worshipSongKeys,
    ministryRoles,
    ministryAssignments,
    notes,
    transitionNotes,
    isDefault,
    createdAt,
    updatedAt,
    version
  };
}

export class TemplateService {
  static getTemplatesSync(): LineupTemplate[] {
    try {
      const data = localStorage.getItem(TEMPLATES_STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((t, idx) => sanitizeLineupTemplate(t, idx))
        .filter((t): t is LineupTemplate => t !== null);
    } catch (e) {
      console.warn('[TemplateService] Failed to load templates:', e);
      return [];
    }
  }

  static saveTemplatesSync(templates: LineupTemplate[]): void {
    try {
      const clean = templates
        .map((t, idx) => sanitizeLineupTemplate(t, idx))
        .filter((t): t is LineupTemplate => t !== null);
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(clean));
      window.dispatchEvent(new CustomEvent('wwcf:templates-changed', { detail: { templates: clean } }));
    } catch (e) {
      console.error('[TemplateService] Failed to save templates:', e);
      throw e;
    }
  }

  static getTemplateById(id: string): LineupTemplate | null {
    const list = this.getTemplatesSync();
    return list.find((t) => t.id === id) || null;
  }

  static getDefaultTemplate(serviceType: string): LineupTemplate | null {
    const list = this.getTemplatesSync();
    const normalized = normalizeServiceType(serviceType);
    return list.find((t) => t.isDefault && normalizeServiceType(t.serviceType) === normalized) || null;
  }

  static saveTemplate(
    input: Omit<LineupTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version'> & { id?: string }
  ): LineupTemplate {
    const list = this.getTemplatesSync();
    const now = getManilaNowISO();
    const isNew = !input.id || !list.some((t) => t.id === input.id);
    const id = isNew ? `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : input.id!;

    // If setting as default, clear any other default for the same service type
    let updatedList = list;
    if (input.isDefault) {
      const targetType = normalizeServiceType(input.serviceType);
      updatedList = list.map((t) => (normalizeServiceType(t.serviceType) === targetType ? { ...t, isDefault: false } : t));
    }

    const newTemplate: LineupTemplate = {
      ...input,
      id,
      serviceType: normalizeServiceType(input.serviceType),
      praiseSongs: input.praiseSongs && input.praiseSongs.length > 0 ? input.praiseSongs : [''],
      worshipSongs: input.worshipSongs && input.worshipSongs.length > 0 ? input.worshipSongs : [''],
      createdAt: isNew ? now : (list.find((t) => t.id === id)?.createdAt || now),
      updatedAt: now,
      version: 1
    };

    const sanitized = sanitizeLineupTemplate(newTemplate);
    if (!sanitized) {
      throw new Error('Template failed validation');
    }

    if (isNew) {
      updatedList.unshift(sanitized);
    } else {
      updatedList = updatedList.map((t) => (t.id === id ? sanitized : t));
    }

    this.saveTemplatesSync(updatedList);
    return sanitized;
  }

  static duplicateTemplate(id: string): LineupTemplate | null {
    const original = this.getTemplateById(id);
    if (!original) return null;

    const duplicated: Omit<LineupTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version'> = {
      ...original,
      name: `${original.name} (Copy)`,
      isDefault: false // Copies never take default status automatically
    };

    return this.saveTemplate(duplicated);
  }

  static deleteTemplate(id: string): boolean {
    const list = this.getTemplatesSync();
    const filtered = list.filter((t) => t.id !== id);
    if (filtered.length !== list.length) {
      this.saveTemplatesSync(filtered);
      return true;
    }
    return false;
  }

  static setDefaultTemplate(id: string, serviceType: string): void {
    const list = this.getTemplatesSync();
    const targetType = normalizeServiceType(serviceType);
    const updated = list.map((t) => {
      if (t.id === id) {
        return { ...t, isDefault: true, serviceType: targetType, updatedAt: getManilaNowISO() };
      }
      if (normalizeServiceType(t.serviceType) === targetType) {
        return { ...t, isDefault: false };
      }
      return t;
    });
    this.saveTemplatesSync(updated);
  }
}
