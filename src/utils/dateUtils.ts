/**
 * Asia/Manila (UTC+8) Time Zone Utilities
 * Single source of truth for all date/time calculations across the application.
 */

export const MANILA_TIMEZONE = 'Asia/Manila';

/**
 * Returns today's date in Asia/Manila timezone as "YYYY-MM-DD"
 */
export function getManilaTodayString(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  let year = '', month = '', day = '';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Parses a YYYY-MM-DD date string or Date object in Asia/Manila context and returns parts:
 * { year, month (1-12), day (1-31), dayOfWeek (0-6, 0=Sunday), yearMonth ("YYYY-MM") }
 */
export function getManilaDateParts(dateStrOrDate?: string | Date): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  yearMonth: string;
} {
  let year: number;
  let month: number;
  let day: number;

  if (typeof dateStrOrDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStrOrDate)) {
    const parts = dateStrOrDate.substring(0, 10).split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else {
    const targetDate = dateStrOrDate instanceof Date ? dateStrOrDate : new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: MANILA_TIMEZONE,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const parts = formatter.formatToParts(targetDate);
    year = 0;
    month = 0;
    day = 0;
    for (const part of parts) {
      if (part.type === 'year') year = parseInt(part.value, 10);
      if (part.type === 'month') month = parseInt(part.value, 10);
      if (part.type === 'day') day = parseInt(part.value, 10);
    }
  }

  // Pure UTC date math for day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = utcDate.getUTCDay();
  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');

  return {
    year,
    month,
    day,
    dayOfWeek,
    yearMonth: `${year}-${monthStr}`,
  };
}

/**
 * Adds or subtracts calendar days from a "YYYY-MM-DD" string cleanly without timezone shifts.
 */
export function addDaysToDateString(dateStr: string, daysToAdd: number): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return getManilaTodayString();
  }
  const parts = dateStr.substring(0, 10).split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const utc = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Formats a "YYYY-MM-DD" date string into a user-friendly display string in Asia/Manila locale.
 * Example: "2026-08-09" -> "Sunday, August 9, 2026" or "Sun, Aug 9, 2026"
 */
export function formatDateDisplayManila(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
): string {
  if (!dateStr) return '';
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr;

  const parts = dateStr.substring(0, 10).split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIMEZONE,
    ...options,
  }).format(utcDate);
}

/**
 * Returns current ISO timestamp for updates
 */
export function getManilaNowISO(): string {
  return new Date().toISOString();
}

/**
 * Checks if a YYYY-MM-DD date string belongs to the current calendar month and current year
 * in the Asia/Manila (UTC+8) time zone.
 *
 * Both the YEAR and the MONTH must match the reference date (defaults to Manila today).
 * For example, September 2025 will NOT match September 2026.
 */
export function isDateInCurrentManilaMonth(
  dateStr?: string,
  referenceTodayStr?: string
): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const todayStr = referenceTodayStr || getManilaTodayString();

  const targetMatch = dateStr.trim().match(/^(\d{4})-(\d{2})/);
  const refMatch = todayStr.trim().match(/^(\d{4})-(\d{2})/);

  if (!targetMatch || !refMatch) return false;

  const targetYear = targetMatch[1];
  const targetMonth = targetMatch[2];
  const currentYear = refMatch[1];
  const currentMonth = refMatch[2];

  return targetYear === currentYear && targetMonth === currentMonth;
}

/**
 * Returns formatted current month and year in Asia/Manila context, e.g. "September 2026"
 */
export function getManilaCurrentMonthLabel(referenceTodayStr?: string): string {
  const todayStr = referenceTodayStr || getManilaTodayString();
  const match = todayStr.match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const utcDate = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIMEZONE,
    month: 'long',
    year: 'numeric',
  }).format(utcDate);
}

export interface ServiceDateValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Validates a service date according to church ministry scheduling rules:
 * - Sunday Service: Sunday only (dayOfWeek === 0)
 * - Midweek Prayer Service: Monday to Friday only (dayOfWeek >= 1 && dayOfWeek <= 5)
 * - Other service types: Any valid calendar date
 */
export function isValidServiceDateForType(
  serviceType: string,
  dateStr: string
): ServiceDateValidationResult {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return {
      isValid: false,
      errorMessage: 'Please enter a valid date in YYYY-MM-DD format.'
    };
  }

  const { dayOfWeek } = getManilaDateParts(dateStr.trim());

  if (serviceType === 'Sunday Service') {
    if (dayOfWeek !== 0) {
      return {
        isValid: false,
        errorMessage: 'Sunday Service lineups must be scheduled on a Sunday.'
      };
    }
  } else if (serviceType === 'Midweek Prayer Service') {
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        isValid: false,
        errorMessage: 'Midweek Prayer Service lineups must be scheduled on a weekday (Monday–Friday).'
      };
    }
  }

  return { isValid: true };
}
