import React, { useState, useMemo } from 'react';
import { Member, Schedule, ActiveTab } from '../types';
import { calculateSongAnalytics, MemberSongAnalytics } from '../utils/songAnalyticsUtils';
import {
  Mic,
  Star,
  Zap,
  Heart,
  Music,
  BarChart3,
  Users,
  Search,
  Filter,
  Sparkles,
  Info
} from 'lucide-react';

interface MemberFavoriteSongsSectionProps {
  members: Member[];
  schedules: Schedule[];
  setActiveTab: (tab: ActiveTab) => void;
}

export const MemberFavoriteSongsSection: React.FC<MemberFavoriteSongsSectionProps> = ({
  members,
  schedules,
  setActiveTab
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'chart'>('cards');

  const analytics = useMemo(() => {
    return calculateSongAnalytics(schedules, members);
  }, [schedules, members]);

  const { memberAnalytics, songLeaderMembers } = analytics;

  // Filtered members based on search and selection
  const filteredAnalytics = useMemo(() => {
    let list = memberAnalytics;
    if (selectedLeaderId !== 'all') {
      list = list.filter((a) => a.member.id === selectedLeaderId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((a) => {
        const nameMatch = a.member.name.toLowerCase().includes(q);
        const songMatch =
          a.favoriteSongs.some((s) => s.songTitle.toLowerCase().includes(q)) ||
          a.mostPlayedPraise.some((s) => s.songTitle.toLowerCase().includes(q)) ||
          a.mostPlayedWorship.some((s) => s.songTitle.toLowerCase().includes(q));
        return nameMatch || songMatch;
      });
    }
    return list;
  }, [memberAnalytics, selectedLeaderId, searchQuery]);

  // Aggregate favorite songs across all Song Leaders for the visual chart
  const aggregatedFavorites = useMemo(() => {
    const map = new Map<string, { songTitle: string; leaders: { name: string; count: number }[]; totalPlays: number }>();
    memberAnalytics.forEach((ma) => {
      ma.favoriteSongs.forEach((fav) => {
        const key = fav.songTitle.toLowerCase();
        const existing = map.get(key) || { songTitle: fav.songTitle, leaders: [], totalPlays: 0 };
        existing.leaders.push({ name: ma.member.name, count: fav.count });
        existing.totalPlays += fav.count;
        map.set(key, existing);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.totalPlays - a.totalPlays);
  }, [memberAnalytics]);

  if (songLeaderMembers.length === 0) {
    return (
      <div className="p-6 rounded-2xl wwcf-glass-card shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
          <Mic className="w-5 h-5 text-[#1b75bc] dark:text-[#5aa7e8]" />
          <h3 className="text-sm font-bold uppercase tracking-wider">
            Member's Favorite Songs
          </h3>
        </div>
        <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-white/5 border border-dashed border-slate-200 dark:border-white/10 text-slate-500 text-xs space-y-2">
          <p>No members currently have the <strong>"Song Leader"</strong> tag assigned.</p>
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1b75bc] hover:bg-[#16629e] rounded-xl transition-colors cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Manage Member Roster</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#5aa7e8] flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Member's Favorite Songs
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#5aa7e8] border border-[#1b75bc]/20">
              {songLeaderMembers.length} Song Leader{songLeaderMembers.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 pl-9">
            Calculated from saved lineups for members with the <strong>Song Leader</strong> tag. Favorite songs require at least 2 personal plays (≥ 2x).
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-[#1b75bc] text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Leader Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'chart'
                  ? 'bg-[#1b75bc] text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Visual Chart</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl wwcf-glass-card shadow-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search song leader name or song title..."
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#1b75bc]/30 focus:border-[#1b75bc]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={selectedLeaderId}
            onChange={(e) => setSelectedLeaderId(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 focus:outline-hidden cursor-pointer"
          >
            <option value="all">All Song Leaders ({songLeaderMembers.length})</option>
            {songLeaderMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* View Mode: Visual Chart */}
      {viewMode === 'chart' && (
        <div className="p-5 rounded-2xl wwcf-glass-card shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Favorite Songs Distribution (≥ 2x Plays per Leader)
              </h4>
            </div>
            <span className="text-[11px] text-slate-400">
              {aggregatedFavorites.length} qualifying favorite song{aggregatedFavorites.length === 1 ? '' : 's'}
            </span>
          </div>

          {aggregatedFavorites.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500 space-y-1">
              <p className="font-semibold text-slate-600 dark:text-slate-400">
                No Favorite Songs Recorded Yet
              </p>
              <p>A song is recognized as a Favorite when a Song Leader personally leads it at least 2 times (≥ 2x).</p>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {aggregatedFavorites.map((item) => {
                const maxPlays = Math.max(...aggregatedFavorites.map((f) => f.totalPlays), 1);
                const percent = Math.min(100, Math.round((item.totalPlays / maxPlays) * 100));

                return (
                  <div key={item.songTitle} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {item.songTitle}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {item.leaders.map((ldr) => (
                            <span
                              key={ldr.name}
                              className="px-1.5 py-0.2 text-[10px] font-semibold rounded-md bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50 truncate"
                            >
                              {ldr.name} ({ldr.count}x)
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 shrink-0">
                        {item.totalPlays}x
                      </span>
                    </div>

                    {/* Visual Bar */}
                    <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-amber-500 transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View Mode: Leader Cards Grid */}
      {viewMode === 'cards' && (
        <>
          {filteredAnalytics.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
              No matching song leaders or songs found for "{searchQuery}".
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAnalytics.map((item) => (
                <MemberFavoriteSongCard key={item.member.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

interface MemberFavoriteSongCardProps {
  item: MemberSongAnalytics;
}

const MemberFavoriteSongCard: React.FC<MemberFavoriteSongCardProps> = ({ item }) => {
  const { member, favoriteSongs, mostPlayedPraise, mostPlayedWorship, totalSongsLed } = item;

  return (
    <div className="p-5 rounded-2xl wwcf-glass-card shadow-xs flex flex-col justify-between space-y-4 hover:border-[#1b75bc]/40 transition-colors">
      {/* Top: Member Info & Lead Count */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-white/10 pb-3">
          <div className="space-y-1 min-w-0">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
              <span className="truncate">{member.name}</span>
            </h4>
            <div className="flex flex-wrap gap-1">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#1b75bc]/10 text-[#1b75bc] dark:text-[#5aa7e8] border border-[#1b75bc]/20">
                Song Leader
              </span>
              {member.labels
                ?.filter((l) => l.trim().toLowerCase() !== 'song leader')
                .slice(0, 2)
                .map((label) => (
                  <span
                    key={label}
                    className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  >
                    {label}
                  </span>
                ))}
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Total Led
            </span>
            <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200">
              {totalSongsLed > 0 ? `${totalSongsLed} songs` : '0 songs'}
            </span>
          </div>
        </div>

        {/* Section 1: Favorite Songs (≥ 2x plays required) */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            <span>Favorite Songs (≥ 2x)</span>
          </div>
          {favoriteSongs.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic pl-5 py-0.5">
              N/A
            </p>
          ) : (
            <ul className="space-y-1 pl-1">
              {favoriteSongs.map((fav) => (
                <li
                  key={fav.songTitle}
                  className="text-xs text-slate-700 dark:text-slate-200 flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100/60 dark:border-amber-900/30"
                >
                  <span className="font-semibold truncate flex items-center gap-1.5">
                    <span className="text-amber-500">•</span>
                    <span className="truncate">{fav.songTitle}</span>
                  </span>
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 shrink-0">
                    {fav.count}x
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Section 2: Most Played Praise (highest praise count) */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <Zap className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500" />
            <span>Most Played Praise</span>
          </div>
          {mostPlayedPraise.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic pl-5 py-0.5">
              N/A
            </p>
          ) : (
            <ul className="space-y-1 pl-1">
              {mostPlayedPraise.map((p) => (
                <li
                  key={p.songTitle}
                  className="text-xs text-slate-700 dark:text-slate-200 flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100/60 dark:border-emerald-900/30"
                >
                  <span className="font-semibold truncate flex items-center gap-1.5">
                    <span className="text-emerald-500">•</span>
                    <span className="truncate">{p.songTitle}</span>
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                    {p.count}x
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Section 3: Most Played Worship (highest worship count) */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
            <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            <span>Most Played Worship</span>
          </div>
          {mostPlayedWorship.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic pl-5 py-0.5">
              N/A
            </p>
          ) : (
            <ul className="space-y-1 pl-1">
              {mostPlayedWorship.map((w) => (
                <li
                  key={w.songTitle}
                  className="text-xs text-slate-700 dark:text-slate-200 flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100/60 dark:border-rose-900/30"
                >
                  <span className="font-semibold truncate flex items-center gap-1.5">
                    <span className="text-rose-500">•</span>
                    <span className="truncate">{w.songTitle}</span>
                  </span>
                  <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300 shrink-0">
                    {w.count}x
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
