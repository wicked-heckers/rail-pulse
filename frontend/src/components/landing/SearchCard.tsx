import React, { useState } from 'react';
import { Clock, ArrowLeftRight, ArrowRight } from 'lucide-react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';
import { CORRIDOR_STATIONS } from '../../services/corridorData';

interface RecentItem {
  id: string;
  label: string;
  trainNo?: string;
  fromCode?: string;
  toCode?: string;
}

const DEFAULT_RECENT: RecentItem[] = [
  {
    id: 'r1',
    label: 'Bhadrak (BHC) → Bhubaneswar (BBS)',
    fromCode: 'BHC',
    toCode: 'BBS',
  },
  {
    id: 'r2',
    label: '12821 Dhauli Express • Bhadrak (BHC) → Puri (PURI)',
    trainNo: '12821',
    fromCode: 'BHC',
    toCode: 'PURI',
  },
];

export const SearchCard: React.FC = () => {
  const { language, navigateToDashboardWithTrain, setSelectedTrain } = useRailStore();
  const t = TRANSLATIONS[language].search;

  const [activeTab, setActiveTab] = useState<'find' | 'track'>('find');
  const [fromStation, setFromStation] = useState('');
  const [toStation, setToStation] = useState('');
  const [trainQuery, setTrainQuery] = useState('');
  const [recent, setRecent] = useState<RecentItem[]>(() => {
    try {
      const saved = localStorage.getItem('rp_recent');
      return saved ? JSON.parse(saved) : DEFAULT_RECENT;
    } catch {
      return DEFAULT_RECENT;
    }
  });

  const saveRecent = (item: Omit<RecentItem, 'id'>) => {
    setRecent((prev) => {
      const filtered = prev.filter((r) => r.label !== item.label);
      const updated = [{ ...item, id: String(Date.now()) }, ...filtered].slice(0, 4);
      try { localStorage.setItem('rp_recent', JSON.stringify(updated)); } catch { /* noop */ }
      return updated;
    });
  };

  const handleSwap = () => {
    setFromStation(toStation);
    setToStation(fromStation);
  };

  const handleSearch = () => {
    if (!fromStation || !toStation || fromStation === toStation) return;
    const fromName = CORRIDOR_STATIONS.find((s) => s.code === fromStation)?.name ?? fromStation;
    const toName = CORRIDOR_STATIONS.find((s) => s.code === toStation)?.name ?? toStation;
    saveRecent({ label: `${fromName} (${fromStation}) → ${toName} (${toStation})`, fromCode: fromStation, toCode: toStation });
    navigateToDashboardWithTrain();
  };

  const handleTrack = () => {
    const q = trainQuery.trim();
    if (!q) return;
    // Try to match a known train number prefix
    const known = ['12821', '22895', '18410'];
    const match = known.find((n) => q.startsWith(n) || q.toLowerCase().includes(n));
    const trainNo = match ?? '12821';
    saveRecent({ label: `${q}`, trainNo });
    setSelectedTrain(trainNo);
    navigateToDashboardWithTrain(trainNo);
  };

  const handleRecentClick = (item: RecentItem) => {
    if (item.trainNo) {
      setSelectedTrain(item.trainNo);
      navigateToDashboardWithTrain(item.trainNo);
    } else {
      if (item.fromCode) setFromStation(item.fromCode);
      if (item.toCode) setToStation(item.toCode);
      setActiveTab('find');
      navigateToDashboardWithTrain();
    }
  };

  const handleClearRecent = () => {
    setRecent([]);
    try { localStorage.removeItem('rp_recent'); } catch { /* noop */ }
  };

  const searchDisabled = !fromStation || !toStation || fromStation === toStation;

  return (
    <div className="max-w-2xl mx-auto px-4">
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200">
          {(['find', 'track'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'text-[#0F294A] border-b-2 border-[#0F294A] bg-white'
                  : 'text-slate-400 hover:text-slate-600 bg-slate-50'
              }`}
            >
              {tab === 'find' ? t.tabFind : t.tabTrack}
            </button>
          ))}
        </div>

        {/* Card Body */}
        <div className="p-5">
          {activeTab === 'find' ? (
            /* ── Find Trains ── */
            <div className="flex items-center gap-2">
              {/* From */}
              <select
                value={fromStation}
                onChange={(e) => setFromStation(e.target.value)}
                className={`flex-1 min-w-0 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/30 focus:border-[#0F294A] transition-all ${
                  !fromStation ? 'text-slate-400' : 'text-slate-900'
                }`}
              >
                <option value="" disabled>{t.fromPlaceholder}</option>
                {CORRIDOR_STATIONS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>

              {/* Swap */}
              <button
                onClick={handleSwap}
                aria-label="Swap stations"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-500 transition-all active:scale-90"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>

              {/* To */}
              <select
                value={toStation}
                onChange={(e) => setToStation(e.target.value)}
                className={`flex-1 min-w-0 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/30 focus:border-[#0F294A] transition-all ${
                  !toStation ? 'text-slate-400' : 'text-slate-900'
                }`}
              >
                <option value="" disabled>{t.toPlaceholder}</option>
                {CORRIDOR_STATIONS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>

              {/* Search button */}
              <button
                onClick={handleSearch}
                disabled={searchDisabled}
                className="shrink-0 px-5 py-2.5 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#1a3a60] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {t.btnSearch}
              </button>
            </div>
          ) : (
            /* ── Track Train ── */
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={trainQuery}
                onChange={(e) => setTrainQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
                placeholder={t.trackPlaceholder}
                className="flex-1 min-w-0 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/30 focus:border-[#0F294A] transition-all"
              />
              <button
                onClick={handleTrack}
                disabled={!trainQuery.trim()}
                className="shrink-0 px-5 py-2.5 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#1a3a60] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {t.btnTrack}
              </button>
            </div>
          )}

          {/* Recent Searches */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Clock className="w-3.5 h-3.5" />
                <span>{t.recentTitle}</span>
              </div>
              {recent.length > 0 && (
                <button
                  onClick={handleClearRecent}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {t.recentClear}
                </button>
              )}
            </div>

            {recent.length === 0 ? (
              <p className="text-xs text-slate-400 py-1">No recent searches.</p>
            ) : (
              <ul className="space-y-1">
                {recent.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => handleRecentClick(item)}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 hover:text-[#0F294A] transition-colors group"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#0F294A] shrink-0 transition-colors" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
