import { Member, Schedule } from '../types';
import { getManilaTodayString, getManilaNowISO } from '../utils/dateUtils';

export const DEFAULT_LABELS = [
  'Pastor',
  'Worship Leader',
  'Song Leader',
  'Vocalist',
  'Guitarist',
  'Keyboardist',
  'Bassist',
  'Drummer',
  'Audio/Live Technician',
  'Lyricist'
];

export const DEFAULT_MEMBERS: Member[] = [];

export const DEFAULT_MINISTRY_ROLES = [
  { id: 'role-1', role: 'Song Leader', defaultTarget: 'Song Leader, Worship Leader' },
  { id: 'role-2', role: 'Backup Singer/s', defaultTarget: 'Vocalist' },
  { id: 'role-3', role: 'Guitarist', defaultTarget: 'Guitarist' },
  { id: 'role-4', role: 'Keyboardist', defaultTarget: 'Keyboardist' },
  { id: 'role-5', role: 'Bassist', defaultTarget: 'Bassist' },
  { id: 'role-6', role: 'Drummer', defaultTarget: 'Drummer' },
  { id: 'role-7', role: 'Audio/Live Technician', defaultTarget: 'Audio/Live Technician' },
  { id: 'role-8', role: 'Lyricist', defaultTarget: 'Lyricist' }
];

export const DEFAULT_SCHEDULES: Schedule[] = [];
