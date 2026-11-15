import { MemberAvailability, AvailabilityStatus, normalizeServiceType } from '../types';

const STORAGE_KEY = 'wwcf_member_availability_v1';

export const VALID_AVAILABILITY_STATUSES: AvailabilityStatus[] = ['available', 'unavailable', 'maybe'];

export function buildAvailabilityId(memberId: string, date: string, serviceType?: string): string {
  const cleanMember = memberId.trim();
  const cleanDate = date.trim();
  if (serviceType && serviceType.trim()) {
    const norm = normalizeServiceType(serviceType).toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `${cleanMember}_${cleanDate}_${norm}`;
  }
  return `${cleanMember}_${cleanDate}`;
}

export function validateMemberAvailabilityRecord(
  raw: any,
  index = 0
): { valid: MemberAvailability | null; error?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: null, error: `Member availability entry #${index + 1} is not a valid object.` };
  }
  const memberId = typeof raw.memberId === 'string' ? raw.memberId.trim().slice(0, 100) : '';
  const date = typeof raw.date === 'string' ? raw.date.trim().slice(0, 20) : '';
  if (!memberId || !date) {
    return { valid: null, error: `Member availability entry #${index + 1} is missing a valid memberId or date.` };
  }

  if (typeof raw.status !== 'string' || !VALID_AVAILABILITY_STATUSES.includes(raw.status as AvailabilityStatus)) {
    return {
      valid: null,
      error: `Invalid member availability status "${String(raw.status ?? '')}" for member "${memberId}" on ${date}. Expected available, unavailable, or maybe.`
    };
  }
  const status = raw.status as AvailabilityStatus;

  const serviceType =
    typeof raw.serviceType === 'string' && raw.serviceType.trim()
      ? normalizeServiceType(raw.serviceType.trim().slice(0, 100))
      : undefined;
  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim().slice(0, 100)
      : buildAvailabilityId(memberId, date, serviceType);
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 500) : undefined;
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 50) : new Date().toISOString();

  return {
    valid: {
      id,
      memberId,
      date,
      serviceType,
      status,
      note,
      updatedAt
    }
  };
}

export function sanitizeMemberAvailability(raw: any): MemberAvailability | null {
  return validateMemberAvailabilityRecord(raw).valid;
}

export class AvailabilityService {
  static getAvailabilityListSync(): MemberAvailability[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        try {
          localStorage.setItem(`wwcf_quarantine_${STORAGE_KEY}`, raw);
        } catch {}
        return [];
      }
      const valid: MemberAvailability[] = [];
      let rejectedCount = 0;
      for (let i = 0; i < parsed.length; i++) {
        const res = validateMemberAvailabilityRecord(parsed[i], i);
        if (res.valid) {
          valid.push(res.valid);
        } else {
          rejectedCount++;
        }
      }
      if (rejectedCount > 0) {
        console.warn(`[AvailabilityService] Ignored ${rejectedCount} malformed availability record(s) without coercing status.`);
        try {
          localStorage.setItem(`wwcf_quarantine_${STORAGE_KEY}`, raw);
        } catch {}
      }
      return valid;
    } catch (e) {
      console.error('[AvailabilityService] Failed to load member availability:', e);
      return [];
    }
  }

  static saveAvailabilityListSync(list: MemberAvailability[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const valid = list
        .map(sanitizeMemberAvailability)
        .filter((item): item is MemberAvailability => item !== null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    } catch (e) {
      console.error('[AvailabilityService] Failed to save member availability:', e);
      throw e;
    }
  }

  static getAvailabilityForDate(date: string, serviceType?: string): MemberAvailability[] {
    const cleanDate = date.trim();
    const list = this.getAvailabilityListSync().filter((item) => item.date === cleanDate);
    if (!serviceType || !serviceType.trim()) return list;

    const normType = normalizeServiceType(serviceType);
    return list.filter((item) => !item.serviceType || item.serviceType === normType);
  }

  static getAvailabilityMapForDate(date: string, serviceType?: string): Map<string, MemberAvailability> {
    const cleanDate = date.trim();
    const list = this.getAvailabilityListSync().filter((item) => item.date === cleanDate);
    const map = new Map<string, MemberAvailability>();

    const normType = serviceType && serviceType.trim() ? normalizeServiceType(serviceType) : undefined;

    // First populate legacy/unscoped records
    list.forEach((item) => {
      if (!item.serviceType) {
        map.set(item.memberId, item);
      }
    });

    // Then overwrite with specific serviceType records if requested
    if (normType) {
      list.forEach((item) => {
        if (item.serviceType === normType) {
          map.set(item.memberId, item);
        }
      });
    }

    return map;
  }

  static getAvailability(memberId: string, date: string, serviceType?: string): MemberAvailability | undefined {
    const list = this.getAvailabilityListSync();
    const cleanMember = memberId.trim();
    const cleanDate = date.trim();
    const normType = serviceType && serviceType.trim() ? normalizeServiceType(serviceType) : undefined;

    if (normType) {
      const specific = list.find(
        (item) => item.memberId === cleanMember && item.date === cleanDate && item.serviceType === normType
      );
      if (specific) return specific;
    }

    // Fall back to unscoped legacy record
    return list.find(
      (item) => item.memberId === cleanMember && item.date === cleanDate && !item.serviceType
    );
  }

  static setAvailability(
    memberId: string,
    date: string,
    status: AvailabilityStatus,
    note?: string,
    serviceType?: string
  ): MemberAvailability {
    if (!VALID_AVAILABILITY_STATUSES.includes(status)) {
      throw new Error(`Invalid availability status "${String(status)}". Expected available, unavailable, or maybe.`);
    }
    const list = this.getAvailabilityListSync();
    const cleanMember = memberId.trim();
    const cleanDate = date.trim();
    const normType = serviceType && serviceType.trim() ? normalizeServiceType(serviceType) : undefined;

    const targetId = buildAvailabilityId(cleanMember, cleanDate, normType);

    const existingIndex = list.findIndex((item) => {
      if (item.id === targetId) return true;
      if (normType) {
        return item.memberId === cleanMember && item.date === cleanDate && item.serviceType === normType;
      }
      return item.memberId === cleanMember && item.date === cleanDate && !item.serviceType;
    });

    const record: MemberAvailability = {
      id: targetId,
      memberId: cleanMember,
      date: cleanDate,
      status,
      note: note?.trim() || undefined,
      serviceType: normType,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      list[existingIndex] = record;
    } else {
      list.push(record);
    }

    this.saveAvailabilityListSync(list);
    return record;
  }

  static removeAvailability(id: string): void {
    const list = this.getAvailabilityListSync();
    const filtered = list.filter((item) => item.id !== id);
    this.saveAvailabilityListSync(filtered);
  }

  static clearOldAvailability(beforeDate: string): void {
    const list = this.getAvailabilityListSync();
    const filtered = list.filter((item) => item.date >= beforeDate);
    this.saveAvailabilityListSync(filtered);
  }
}
