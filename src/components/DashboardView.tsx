import React, { useMemo, useState, useEffect } from 'react';
import { Member, Schedule, ActiveTab, formatAssignmentMemberNames, ServiceType, Song } from '../types';
import {
  formatDateDisplayManila,
  getManilaTodayString,
  isDateInCurrentManilaMonth,
  getManilaCurrentMonthLabel
} from '../utils/dateUtils';
import { isScheduleEmpty, ensureMonthlyPlaceholders } from '../utils/scheduleUtils';
import { calculateSongAnalytics } from '../utils/songAnalyticsUtils';
import { resolveScheduleSongTitles } from '../utils/songResolveUtils';
import { MemberFavoriteSongsSection } from './MemberFavoriteSongsSection';
import {
  Users,
  CalendarCheck,
  CalendarX,
  Music,
  Plus,
  ArrowRight,
  Flame,
  Clock,
  Sparkles,
  BookmarkCheck,
  Calendar
} from 'lucide-react';

interface DashboardViewProps {
  members: Member[];
  schedules: Schedule[];
  allSongs?: Song[];
  setActiveTab: (tab: ActiveTab) => void;
  onEditSchedule: (schedule: Schedule) => void;
  onUpdateSchedules?: (updated: Schedule[]) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  members,
  schedules,
  allSongs = [],
  setActiveTab,
  onEditSchedule,
  onUpdateSchedules,
}) => {
  // Track Manila Today Date (automatically updates when day/month changes or tab resumes)
  const [todayManila, setTodayManila] = useState<string>(() => getManilaTodayString());

  useEffect(() => {
    const checkDate = () => {
      const nowManila = getManilaTodayString();
      setTodayManila((prev) => (prev !== nowManila ? nowManila : prev));
    };
    const interval = setInterval(checkDate, 60000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkDate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Sync / ensure current month placeholders in schedules
  useEffect(() => {
    if (onUpdateSchedules) {
      const currentYM = todayManila.substring(0, 7);
      const withPlaceholders = ensureMonthlyPlaceholders(currentYM, schedules);
      if (withPlaceholders.length !== schedules.length) {
        onUpdateSchedules(withPlaceholders);
      }
    }
  }, [todayManila, schedules, onUpdateSchedules]);

  // Current Month & Year filtered schedules dataset:
  // Strictly isolates schedules where serviceDate year === currentYear && serviceDate month === currentMonth.
  const currentMonthSchedules = useMemo(() => {
    const currentYM = todayManila.substring(0, 7);
    const withPlaceholders = ensureMonthlyPlaceholders(currentYM, schedules);
    return withPlaceholders.filter((s) => isDateInCurrentManilaMonth(s.serviceDate, todayManila));
  }, [schedules, todayManila]);

  const currentMonthLabel = useMemo(() => {
    return getManilaCurrentMonthLabel(todayManila);
  }, [todayManila]);

  // Overall Saved vs Empty classification (Saved = >= 1 song, Empty = 0 songs)
  const totalSavedLineups = useMemo(() => {
    return schedules.filter((s) => !isScheduleEmpty(s)).length;
  }, [schedules]);

  const totalEmptyLineups = useMemo(() => {
    return schedules.filter((s) => isScheduleEmpty(s)).length;
  }, [schedules]);

  // Sunday Service lineups (CURRENT MONTH & CURRENT YEAR ONLY)
  const sundaySaved = useMemo(() => {
    return currentMonthSchedules
      .filter((s) => s.serviceType === 'Sunday Service' && !isScheduleEmpty(s))
      .sort((a, b) => (a.serviceDate || '').localeCompare(b.serviceDate || ''));
  }, [currentMonthSchedules]);

  const sundayEmpty = useMemo(() => {
    return currentMonthSchedules
      .filter((s) => s.serviceType === 'Sunday Service' && isScheduleEmpty(s))
      .sort((a, b) => (a.serviceDate || '').localeCompare(b.serviceDate || ''));
  }, [currentMonthSchedules]);

  // Midweek Prayer Service lineups (CURRENT MONTH & CURRENT YEAR ONLY)
  const midweekSaved = useMemo(() => {
    return currentMonthSchedules
      .filter((s) => s.serviceType === 'Midweek Prayer Service' && !isScheduleEmpty(s))
      .sort((a, b) => (a.serviceDate || '').localeCompare(b.serviceDate || ''));
  }, [currentMonthSchedules]);

  const midweekEmpty = useMemo(() => {
    return currentMonthSchedules
      .filter((s) => s.serviceType === 'Midweek Prayer Service' && isScheduleEmpty(s))
      .sort((a, b) => (a.serviceDate || '').localeCompare(b.serviceDate || ''));
  }, [currentMonthSchedules]);

  // Other service types (e.g. Youth Service, Special Worship Event)
  const otherServiceTypes = useMemo(() => {
    const set = new Set<ServiceType>();
    currentMonthSchedules.forEach((s) => {
      if (s.serviceType !== 'Sunday Service' && s.serviceType !== 'Midweek Prayer Service') {
        set.add(s.serviceType);
      }
    });
    // If Youth Service has ever been scheduled in this ministry, ensure its section is available
    if (schedules.some((s) => s.serviceType === 'Youth Service')) {
      set.add('Youth Service');
    }
    return Array.from(set);
  }, [currentMonthSchedules, schedules]);

  // Calculate comprehensive song and song leader analytics
  const songAnalytics = useMemo(() => {
    return calculateSongAnalytics(schedules, members);
  }, [schedules, members]);

  // Most Used Songs: Filter to songs played at least twice (playCount >= 2) before taking top results
  const topSongs = useMemo(() => {
    return songAnalytics.mostUsedSongs
      .filter((song) => song.totalCount >= 2)
      .sort((a, b) => {
        if (b.totalCount !== a.totalCount) {
          return b.totalCount - a.totalCount;
        }
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      })
      .slice(0, 6);
  }, [songAnalytics]);

  const totalUniqueSongs = songAnalytics.totalUniqueSongs;

  // Recent Saved Lineups (only lineups with songs)
  const recentSavedSchedules = useMemo(() => {
    return schedules
      .filter((s) => !isScheduleEmpty(s))
      .sort((a, b) => (b.serviceDate || '').localeCompare(a.serviceDate || ''))
      .slice(0, 4);
  }, [schedules]);

  // Upcoming / Next Service calculation
  const upcomingSchedule = useMemo(() => {
    const future = schedules
      .filter((s) => (s.serviceDate || '') >= todayManila)
      .sort((a, b) => (a.serviceDate || '').localeCompare(b.serviceDate || ''));
    if (future.length > 0) return future[0];
    const sorted = [...schedules].sort((a, b) => (b.serviceDate || '').localeCompare(a.serviceDate || ''));
    return sorted[0] || null;
  }, [schedules, todayManila]);

  const upcomingDetails = useMemo(() => {
    if (!upcomingSchedule) return null;
    const praiseCount = upcomingSchedule.praiseSongs?.filter((s) => Boolean(s.trim())).length || 0;
    const worshipCount = upcomingSchedule.worshipSongs?.filter((s) => Boolean(s.trim())).length || 0;
    const totalSongs = praiseCount + worshipCount;
    const isEmpty = totalSongs === 0;

    const leaderAssignments = (upcomingSchedule.ministryAssignments || []).filter((m) =>
      (m.role || '').toLowerCase().includes('leader')
    );
    const leaderNames = leaderAssignments
      .map((m) => formatAssignmentMemberNames(m))
      .filter((n) => Boolean(n) && n !== 'Unassigned' && n !== '—')
      .join(', ');

    return {
      totalSongs,
      praiseCount,
      worshipCount,
      isEmpty,
      leaderNames: leaderNames || 'None Assigned'
    };
  }, [upcomingSchedule]);

  const handleLineupClick = (schedule: Schedule) => {
    onEditSchedule(schedule);
    setActiveTab('scheduler');
  };

  return (
    <div data-tour="dashboard-view" className="space-y-6 animate-in fade-in duration-300">
      {/* ========================================================================= */}
      {/* 1. PRIMARY WORKSPACE HERO: NEXT SCHEDULED WORSHIP SERVICE                */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden rounded-2xl wwcf-surface-hero p-6 sm:p-8 transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1b75bc] dark:text-[#54b0e2]">
                Next Worship Service
              </span>

              {upcomingSchedule && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {upcomingSchedule.serviceDate === todayManila
                      ? 'Today'
                      : upcomingSchedule.serviceDate > todayManila
                      ? 'Upcoming'
                      : 'Latest Saved'}
                  </span>
                </>
              )}
            </div>

            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                {upcomingSchedule
                  ? formatDateDisplayManila(upcomingSchedule.serviceDate, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })
                  : 'No Upcoming Service Scheduled'}
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {upcomingSchedule?.serviceType || 'Sunday Service'}
                </span>
                <span>•</span>
                <span>Song Leaders: <strong className="text-slate-800 dark:text-slate-200">{upcomingDetails?.leaderNames || 'Pending'}</strong></span>
              </div>
            </div>

            {/* Readiness Summary Banner */}
            <div className="flex items-center gap-3 pt-1">
              {upcomingDetails?.isEmpty ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold">
                  <CalendarX className="w-4 h-4" />
                  <span>Lineup Not Started (0 Songs Added)</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  <BookmarkCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    Lineup Prepared: {upcomingDetails?.totalSongs} Songs ({upcomingDetails?.praiseCount} Praise, {upcomingDetails?.worshipCount} Worship)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions for the upcoming service */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0 justify-center">
            {upcomingSchedule && (
              <button
                type="button"
                onClick={() => handleLineupClick(upcomingSchedule)}
                className="btn-tactile inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#1b75bc] hover:bg-[#165d97] active:bg-[#144d7c] text-white text-sm font-bold shadow-md shadow-[#1b75bc]/25 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
              >
                <span>{upcomingDetails?.isEmpty ? 'Build This Lineup' : 'Review & Edit Lineup'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('scheduler')}
              data-tour="create-lineup-btn"
              className="btn-tactile inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#1b75bc]"
            >
              <Plus className="w-4 h-4 text-[#1b75bc] dark:text-[#54b0e2]" />
              <span>Create Another Service</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. COMPACT MINISTRY METRIC BAR (NO EXCESSIVE ISOLATED CARDS)              */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div data-tour="dashboard-saved-card" className="p-4 rounded-xl wwcf-glass-card shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <BookmarkCheck className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Saved</p>
            <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">{totalSavedLineups}</h4>
          </div>
        </div>

        <div data-tour="dashboard-empty-card" className="p-4 rounded-xl wwcf-glass-card shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <CalendarX className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Empty</p>
            <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">{totalEmptyLineups}</h4>
          </div>
        </div>

        <div className="p-4 rounded-xl wwcf-glass-card shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Team Roster</p>
            <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">{members.length}</h4>
          </div>
        </div>

        <div className="p-4 rounded-xl wwcf-glass-card shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] flex items-center justify-center shrink-0">
            <Music className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Active Songs</p>
            <h4 className="text-lg font-black text-slate-900 dark:text-slate-100">{totalUniqueSongs}</h4>
          </div>
        </div>
      </div>

      {/* Dedicated Service Line-up Cards (Sunday & Midweek) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Service Line-up Status
          </h3>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {currentMonthLabel}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Sunday Service Card */}
          <div data-tour="dashboard-sunday-card" className="p-5 rounded-2xl wwcf-glass-card shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1b75bc] dark:text-[#5aa7e8]" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Sunday Service
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-emerald-700 dark:text-emerald-400">
                  {sundaySaved.length} Saved
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="text-amber-700 dark:text-amber-400">
                  {sundayEmpty.length} Empty
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Saved Sunday Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <BookmarkCheck className="w-3.5 h-3.5" />
                    Saved ({sundaySaved.length})
                  </span>
                </h4>
                {sundaySaved.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic pl-2 py-1">
                    No saved Sunday lineups this month
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {sundaySaved.map((schedule) => {
                      const songCount = (schedule.praiseSongs?.filter((s) => Boolean(s.trim())).length || 0) +
                                        (schedule.worshipSongs?.filter((s) => Boolean(s.trim())).length || 0);
                      return (
                        <li key={schedule.id}>
                          <button
                            type="button"
                            onClick={() => handleLineupClick(schedule)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-50/80 dark:hover:bg-emerald-950/40 text-xs text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-between group cursor-pointer"
                          >
                            <span className="font-semibold flex items-center gap-1.5">
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                              <span>{formatDateDisplayManila(schedule.serviceDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </span>
                            <span className="text-[10px] text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 font-bold shrink-0">
                              {songCount} {songCount === 1 ? 'song' : 'songs'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Empty Sunday Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <CalendarX className="w-3.5 h-3.5" />
                    Empty ({sundayEmpty.length})
                  </span>
                </h4>
                {sundayEmpty.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic pl-2 py-1">
                    No empty Sunday lineups this month
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {sundayEmpty.map((schedule) => {
                      return (
                        <li key={schedule.id}>
                          <button
                            type="button"
                            onClick={() => handleLineupClick(schedule)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-amber-50/80 dark:hover:bg-amber-950/40 text-xs text-slate-600 dark:text-slate-300 transition-colors flex items-center justify-between group cursor-pointer"
                          >
                            <span className="font-semibold flex items-center gap-1.5">
                              <span className="text-amber-500 dark:text-amber-400 font-bold">•</span>
                              <span>{formatDateDisplayManila(schedule.serviceDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </span>
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold opacity-80 group-hover:opacity-100 shrink-0">
                              + Add songs
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Midweek Prayer Service Card */}
          <div data-tour="dashboard-midweek-card" className="p-5 rounded-2xl wwcf-glass-card shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1b75bc] dark:text-[#5aa7e8]" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Midweek Prayer Service
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-emerald-700 dark:text-emerald-400">
                  {midweekSaved.length} Saved
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span className="text-amber-700 dark:text-amber-400">
                  {midweekEmpty.length} Empty
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Saved Midweek Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <BookmarkCheck className="w-3.5 h-3.5" />
                    Saved ({midweekSaved.length})
                  </span>
                </h4>
                {midweekSaved.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic pl-2 py-1">
                    No saved Midweek lineups this month
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {midweekSaved.map((schedule) => {
                      const songCount = (schedule.praiseSongs?.filter((s) => Boolean(s.trim())).length || 0) +
                                        (schedule.worshipSongs?.filter((s) => Boolean(s.trim())).length || 0);
                      return (
                        <li key={schedule.id}>
                          <button
                            type="button"
                            onClick={() => handleLineupClick(schedule)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-50/80 dark:hover:bg-emerald-950/40 text-xs text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-between group cursor-pointer"
                          >
                            <span className="font-semibold flex items-center gap-1.5">
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                              <span>{formatDateDisplayManila(schedule.serviceDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </span>
                            <span className="text-[10px] text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 font-bold shrink-0">
                              {songCount} {songCount === 1 ? 'song' : 'songs'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Empty Midweek Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <CalendarX className="w-3.5 h-3.5" />
                    Empty ({midweekEmpty.length})
                  </span>
                </h4>
                {midweekEmpty.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic pl-2 py-1">
                    No empty Midweek lineups this month
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {midweekEmpty.map((schedule) => {
                      return (
                        <li key={schedule.id}>
                          <button
                            type="button"
                            onClick={() => handleLineupClick(schedule)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-amber-50/80 dark:hover:bg-amber-950/40 text-xs text-slate-600 dark:text-slate-300 transition-colors flex items-center justify-between group cursor-pointer"
                          >
                            <span className="font-semibold flex items-center gap-1.5">
                              <span className="text-amber-500 dark:text-amber-400 font-bold">•</span>
                              <span>{formatDateDisplayManila(schedule.serviceDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </span>
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold opacity-80 group-hover:opacity-100 shrink-0">
                              + Add songs
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Custom / Other Services (if present in schedules) */}
        {otherServiceTypes.map((serviceType) => {
          const savedList = currentMonthSchedules
            .filter((s) => s.serviceType === serviceType && !isScheduleEmpty(s))
            .sort((a, b) => (a.serviceDate || '').localeCompare(b.serviceDate || ''));
          const emptyList = currentMonthSchedules
            .filter((s) => s.serviceType === serviceType && isScheduleEmpty(s))
            .sort((a, b) => (a.serviceDate || '').localeCompare(b.serviceDate || ''));

          return (
            <div key={serviceType} className="p-5 rounded-2xl wwcf-glass-card shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#1b75bc] dark:text-[#5aa7e8]" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {serviceType}
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                    Saved ({savedList.length})
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
                    Empty ({emptyList.length})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <BookmarkCheck className="w-3.5 h-3.5" />
                    <span>Saved ({savedList.length})</span>
                  </h4>
                  {savedList.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 italic pl-2 py-1">
                      No saved {serviceType} lineups this month
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {savedList.map((schedule) => {
                        const songCount = (schedule.praiseSongs?.filter((s) => Boolean(s.trim())).length || 0) +
                                          (schedule.worshipSongs?.filter((s) => Boolean(s.trim())).length || 0);
                        return (
                          <li key={schedule.id}>
                            <button
                              type="button"
                              onClick={() => handleLineupClick(schedule)}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-50/80 dark:hover:bg-emerald-950/40 text-xs text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-between group cursor-pointer"
                            >
                              <span className="font-semibold flex items-center gap-1.5">
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">•</span>
                                <span>{formatDateDisplayManila(schedule.serviceDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              </span>
                              <span className="text-[10px] text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 font-bold shrink-0">
                                {songCount} {songCount === 1 ? 'song' : 'songs'}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <CalendarX className="w-3.5 h-3.5" />
                    <span>Empty ({emptyList.length})</span>
                  </h4>
                  {emptyList.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 italic pl-2 py-1">
                      No empty {serviceType} lineups this month
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {emptyList.map((schedule) => {
                        return (
                          <li key={schedule.id}>
                            <button
                              type="button"
                              onClick={() => handleLineupClick(schedule)}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-amber-50/80 dark:hover:bg-amber-950/40 text-xs text-slate-600 dark:text-slate-300 transition-colors flex items-center justify-between group cursor-pointer"
                            >
                              <span className="font-semibold flex items-center gap-1.5">
                                <span className="text-amber-500 dark:text-amber-400 font-bold">•</span>
                                <span>{formatDateDisplayManila(schedule.serviceDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              </span>
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold opacity-80 group-hover:opacity-100 shrink-0">
                                + Add songs
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid: Recent Saved Lineups & Most Used Songs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Lineups (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#1b75bc] dark:text-[#5aa7e8]" />
              <span>Recent Worship Lineups</span>
            </h3>
            <button
              onClick={() => setActiveTab('schedules')}
              className="text-xs font-semibold text-[#1b75bc] dark:text-[#5aa7e8] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View All ({schedules.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {recentSavedSchedules.length === 0 ? (
              <div className="p-8 text-center rounded-2xl wwcf-glass-card text-slate-500 text-sm">
                No saved worship lineups with songs yet. Click "Create Service Lineup" to start!
              </div>
            ) : (
              recentSavedSchedules.map((schedule) => {
                const songLeaderAssignments = (schedule.ministryAssignments || []).filter(
                  (m) => (m.role || '').toLowerCase().includes('leader')
                );
                const songLeaderDisplay = songLeaderAssignments
                  .map((m) => formatAssignmentMemberNames(m))
                  .filter((n) => Boolean(n) && n !== 'Unassigned' && n !== '—')
                  .join(', ');
                return (
                  <div
                    key={schedule.id}
                    className="p-5 rounded-2xl wwcf-glass-card wwcf-interactive-row shadow-xs border border-slate-200/80 dark:border-white/10 hover:border-[#1b75bc]/40 dark:hover:border-[#1b75bc]/50 group cursor-pointer"
                    onClick={() => handleLineupClick(schedule)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide rounded-full bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#54b0e2] border border-[#1b75bc]/20">
                          {schedule.serviceType}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {formatDateDisplayManila(schedule.serviceDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-[#1b75bc] dark:text-[#54b0e2] group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                        <span>Open Lineup</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-300 pt-1">
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                        <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                          <span>Praise Set</span>
                        </span>
                        <p className="truncate text-slate-600 dark:text-slate-400 font-medium">
                          {resolveScheduleSongTitles(schedule, allSongs).praiseSongs.filter(Boolean).join(' • ') || 'None'}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                        <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider">
                          <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
                          <span>Worship Set</span>
                        </span>
                        <p className="truncate text-slate-600 dark:text-slate-400 font-medium">
                          {resolveScheduleSongTitles(schedule, allSongs).worshipSongs.filter(Boolean).join(' • ') || 'None'}
                        </p>
                      </div>
                    </div>

                    {Boolean(songLeaderDisplay) && (
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10 text-xs flex items-center justify-between text-slate-400 dark:text-slate-500 font-medium">
                        <span>
                          Song Leader: <strong className="text-slate-800 dark:text-slate-200">{songLeaderDisplay}</strong>
                        </span>
                        <span className="text-[11px]">{schedule.ministryAssignments.length} Assigned Roles</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Most Used Songs (1 col) */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-500" />
            <span>Most Used Songs</span>
          </h3>

          <div className="p-5 rounded-2xl wwcf-glass-card shadow-xs">
            {topSongs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                No songs have been played more than once yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {topSongs.map((item, index) => (
                  <div key={item.title} className="py-3 first:pt-0 last:pb-0 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 pr-1">
                        <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 font-bold flex items-center justify-center shrink-0 text-[10px]">
                          {index + 1}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {item.title}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#5aa7e8] font-bold shrink-0 text-[11px] border border-[#1b75bc]/20">
                        {item.totalCount}x
                      </span>
                    </div>

                    {/* Last sung by & Most used by metadata */}
                    <div className="pl-7 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-baseline gap-1.5 truncate">
                        <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0">
                          Last sung by:
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                          {item.lastSungBy}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1.5 truncate">
                        <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0">
                          Most used by:
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                          {item.mostUsedBy}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Member's Favorite Songs Section */}
      <MemberFavoriteSongsSection
        members={members}
        schedules={schedules}
        setActiveTab={setActiveTab}
      />
    </div>
  );
};
