import React, { useState, useRef, useEffect } from 'react';
import {
  Clock,
  ArrowLeftRight,
  ArrowRight,
  Info,
  ChevronDown,
} from 'lucide-react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

interface PilotStation {
  code: string;
  name: string;
  km: number;
}

const PILOT_STATIONS: PilotStation[] = [
  { code: 'BHC', name: 'Bhadrak', km: 0.0 },
  { code: 'JJKR', name: 'Jajpur Keonjhar Road', km: 44.0 },
  { code: 'CTC', name: 'Cuttack', km: 115.0 },
  { code: 'BBS', name: 'Bhubaneswar', km: 143.0 },
  { code: 'KUR', name: 'Khurda Road', km: 162.0 },
  { code: 'PURI', name: 'Puri', km: 206.0 },
];

interface PilotTrain {
  no: string;
  name: string;
  direction: 'DN' | 'UP';
  delayStatus: string;
  statusColor: 'amber' | 'emerald';
  departureTime: string;
  origin: string;
  destination: string;
  subtitle: string;
}

const PILOT_TRAINS: PilotTrain[] = [
  {
    no: '12821',
    name: 'Dhauli Express',
    direction: 'DN',
    delayStatus: '+28m late',
    statusColor: 'amber',
    departureTime: '09:50 AM',
    origin: 'Bhadrak (BHC)',
    destination: 'Puri (PURI)',
    subtitle: 'Departs 09:50 AM • Bhadrak (BHC) → Puri (PURI)',
  },
  {
    no: '22895',
    name: 'Vande Bharat',
    direction: 'DN',
    delayStatus: '+2m late',
    statusColor: 'emerald',
    departureTime: '10:17 AM',
    origin: 'Bhadrak (BHC)',
    destination: 'Puri (PURI)',
    subtitle: 'Departs 10:17 AM • Bhadrak (BHC) → Puri (PURI)',
  },
  {
    no: '18410',
    name: 'Sri Jagannath Express',
    direction: 'UP',
    delayStatus: '+5m late',
    statusColor: 'amber',
    departureTime: '09:30 AM',
    origin: 'Puri (PURI)',
    destination: 'Bhadrak (BHC)',
    subtitle: 'Departs 09:30 AM • Puri (PURI) → Bhadrak (BHC)',
  },
];

interface RecentItem {
  id: string;
  label: string;
  fromCode: string;
  toCode: string;
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
    label: 'Cuttack (CTC) → Khurda Road (KUR)',
    fromCode: 'CTC',
    toCode: 'KUR',
  },
];

export const SearchCard: React.FC = () => {
  const { language, navigateToDashboardWithTrain, setSelectedTrain } = useRailStore();
  const t = TRANSLATIONS[language].search;

  const [activeTab, setActiveTab] = useState<'find' | 'track'>('find');
  const [fromStation, setFromStation] = useState('BHC');
  const [toStation, setToStation] = useState('BBS');
  const [trainQuery, setTrainQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PilotTrain[] | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [unmatchedNotice, setUnmatchedNotice] = useState<string | null>(null);

  const autocompleteRef = useRef<HTMLDivElement>(null);

  const [recent, setRecent] = useState<RecentItem[]>(() => {
    try {
      const saved = localStorage.getItem('rp_recent_routes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 2);
      }
      return DEFAULT_RECENT;
    } catch {
      return DEFAULT_RECENT;
    }
  });

  // Handle outside click for autocomplete dropdown
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const saveRecent = (item: Omit<RecentItem, 'id'>) => {
    setRecent((prev) => {
      const filtered = prev.filter(
        (r) => !(r.fromCode === item.fromCode && r.toCode === item.toCode)
      );
      const updated = [{ ...item, id: String(Date.now()) }, ...filtered].slice(0, 2);
      try {
        localStorage.setItem('rp_recent_routes', JSON.stringify(updated));
      } catch {
        /* noop */
      }
      return updated;
    });
  };

  const filterTrains = (fromCode: string, toCode: string) => {
    if (!fromCode || !toCode || fromCode === toCode) {
      setSearchResults(null);
      return;
    }

    const fromStn = PILOT_STATIONS.find((s) => s.code === fromCode);
    const toStn = PILOT_STATIONS.find((s) => s.code === toCode);
    const fromKm = fromStn?.km ?? 0;
    const toKm = toStn?.km ?? 0;

    let matches: PilotTrain[] = [];
    if (fromKm < toKm) {
      matches = PILOT_TRAINS.filter((t) => t.direction === 'DN');
    } else {
      matches = PILOT_TRAINS.filter((t) => t.direction === 'UP');
    }

    setSearchResults(matches);
  };

  const handleFromChange = (newFrom: string) => {
    setFromStation(newFrom);
    filterTrains(newFrom, toStation);
  };

  const handleToChange = (newTo: string) => {
    setToStation(newTo);
    filterTrains(fromStation, newTo);
  };

  const handleSwap = () => {
    const temp = fromStation;
    setFromStation(toStation);
    setToStation(temp);
    filterTrains(toStation, temp);
  };

  const handleSearch = () => {
    filterTrains(fromStation, toStation);
    if (fromStation && toStation && fromStation !== toStation) {
      const fromStn = PILOT_STATIONS.find((s) => s.code === fromStation);
      const toStn = PILOT_STATIONS.find((s) => s.code === toStation);
      saveRecent({
        label: `${fromStn?.name} (${fromStation}) → ${toStn?.name} (${toStation})`,
        fromCode: fromStation,
        toCode: toStation,
      });
    }
  };

  const handleSelectTrainAndNavigate = (trainNo: string, trainLabel?: string) => {
    setSelectedTrain(trainNo);
    if (trainLabel) {
      // save selected train
    }
    navigateToDashboardWithTrain(trainNo);
  };

  const handleTrackSubmit = () => {
    const q = trainQuery.trim();
    if (!q) return;

    // Search against the 3 live corridor trains
    const match = PILOT_TRAINS.find(
      (t) =>
        t.no === q ||
        t.name.toLowerCase().includes(q.toLowerCase()) ||
        q.toLowerCase().includes(t.no)
    );

    if (match) {
      setUnmatchedNotice(null);
      handleSelectTrainAndNavigate(match.no, `${match.no} ${match.name}`);
    } else {
      setUnmatchedNotice(q);
      setShowAutocomplete(false);
    }
  };

  const handleRecentClick = (item: RecentItem) => {
    setFromStation(item.fromCode);
    setToStation(item.toCode);
    setActiveTab('find');
    filterTrains(item.fromCode, item.toCode);
  };

  const handleClearRecent = () => {
    setRecent([]);
    try {
      localStorage.removeItem('rp_recent_routes');
    } catch {
      /* noop */
    }
  };

  // Autocomplete suggestions based on query
  const autocompleteSuggestions = PILOT_TRAINS.filter(
    (t) =>
      !trainQuery.trim() ||
      t.no.includes(trainQuery.trim()) ||
      t.name.toLowerCase().includes(trainQuery.trim().toLowerCase())
  );

  const searchDisabled = !fromStation || !toStation || fromStation === toStation;

  // Filter out whichever route is already selected in the inputs for zero duplicate rows
  const suggestedRoutes = DEFAULT_RECENT.filter(
    (r) => !(r.fromCode === fromStation && r.toCode === toStation)
  );

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-visible relative">
        {/* Tab Switcher - Clean, starts immediately without top banner */}
        <div className="flex border-b border-slate-200 rounded-t-2xl overflow-hidden">
          {(['find', 'track'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setUnmatchedNotice(null);
              }}
              className={`flex-1 py-3 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === tab
                  ? 'text-[#0F294A] border-b-2 border-[#0F294A] bg-white font-bold'
                  : 'text-slate-400 hover:text-slate-600 bg-slate-50'
              }`}
            >
              {tab === 'find' ? t.tabFind : t.tabTrack}
            </button>
          ))}
        </div>

        {/* Card Body with locked consistent height */}
        <div className="p-4 sm:p-5 min-h-[148px] flex flex-col justify-between">
          {activeTab === 'find' ? (
            /* ── Find Trains ── */
            <div className="space-y-3.5 flex flex-col justify-between flex-1">
              <div className="flex items-center gap-2 sm:gap-3">
                {/* From Station */}
                <div className="relative flex-1 min-w-0">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 pl-0.5">
                    FROM
                  </label>
                  <div className="relative">
                    <select
                      value={fromStation}
                      onChange={(e) => handleFromChange(e.target.value)}
                      className="w-full appearance-none pl-3.5 pr-8 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A] transition-all cursor-pointer truncate shadow-2xs"
                    >
                      <option value="" disabled>
                        {t.fromPlaceholder}
                      </option>
                      {PILOT_STATIONS.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* Swap Stations Button */}
                <div className="shrink-0 pt-4">
                  <button
                    type="button"
                    onClick={handleSwap}
                    aria-label="Swap stations"
                    className="w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-500 transition-all active:scale-90 cursor-pointer shadow-2xs"
                    title="Swap Origin & Destination"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                  </button>
                </div>

                {/* To Station */}
                <div className="relative flex-1 min-w-0">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 pl-0.5">
                    TO
                  </label>
                  <div className="relative">
                    <select
                      value={toStation}
                      onChange={(e) => handleToChange(e.target.value)}
                      className="w-full appearance-none pl-3.5 pr-8 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A] transition-all cursor-pointer truncate shadow-2xs"
                    >
                      <option value="" disabled>
                        {t.toPlaceholder}
                      </option>
                      {PILOT_STATIONS.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* Search Button */}
                <div className="shrink-0 pt-4">
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={searchDisabled}
                    className="px-5 sm:px-6 py-2.5 rounded-xl bg-[#0F294A] text-white text-xs sm:text-sm font-bold hover:bg-[#1a3a60] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer shadow-xs"
                  >
                    {t.btnSearch}
                  </button>
                </div>
              </div>

              {/* Matched Trains Section */}
              {searchResults && (
                <div className="pt-3 border-t border-slate-100 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {searchResults.length > 1 ? 'Matching Trains' : 'Matching Train'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {searchResults.map((tr) => (
                      <button
                        type="button"
                        key={tr.no}
                        onClick={() =>
                          handleSelectTrainAndNavigate(tr.no, `${tr.no} ${tr.name}`)
                        }
                        className="w-full text-left p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-[#0F294A] hover:bg-slate-50/80 transition-all cursor-pointer flex items-center justify-between group shadow-xs hover:shadow-md"
                      >
                        <div className="flex items-start gap-3.5 sm:gap-4 min-w-0 flex-1">
                          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0 p-2 shadow-2xs mt-0.5">
                            <img src="/train-icon.png" alt="Train" className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {/* 1. Top & Departure: Lifted up together */}
                            <div>
                              <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                                <span className="font-mono font-extrabold text-base sm:text-lg text-[#0F294A]">
                                  {tr.no}
                                </span>
                                <span className="text-slate-300 font-bold hidden sm:inline">•</span>
                                <span className="font-bold text-base sm:text-lg text-slate-800 truncate">
                                  {tr.name}
                                </span>
                                <span
                                  className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                                    tr.statusColor === 'emerald'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}
                                >
                                  {tr.delayStatus}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 text-xs sm:text-[13px] text-slate-600 font-medium mt-0.5 sm:mt-1">
                                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>Departs {tr.departureTime}</span>
                              </div>
                            </div>

                            {/* 2. Spaced Bottom Row: From – To */}
                            <div className="flex items-center gap-1.5 text-xs sm:text-[13px] text-slate-500 font-medium mt-3 sm:mt-3.5 pt-1.5 border-t border-slate-100/90">
                              <span className="text-slate-700 font-semibold">{tr.origin}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="text-slate-700 font-semibold">{tr.destination}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0F294A]/5 group-hover:bg-[#0F294A] group-hover:text-white text-[#0F294A] text-sm font-bold transition-all shrink-0 ml-4 shadow-2xs">
                          <span>Track</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom Row: When results are shown, show compact single-line "Try route: [Pill] [Pill]" */}
              {searchResults ? (
                suggestedRoutes.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
                    <span className="text-xs font-semibold text-slate-400 shrink-0">Try route:</span>
                    {suggestedRoutes.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setFromStation(r.fromCode);
                          setToStation(r.toCode);
                          filterTrains(r.fromCode, r.toCode);
                        }}
                        className="px-2.5 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                      >
                        {r.label.replace(/ \([A-Z]+\)/g, '')}
                      </button>
                    ))}
                  </div>
                )
              ) : (
                /* When no results are open yet: Single horizontal strip with route pills and subtle Clear link */
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span className="text-xs font-semibold text-slate-400 shrink-0">Recent:</span>
                    {recent.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">No recent routes</span>
                    ) : (
                      recent.slice(0, 2).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleRecentClick(item)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer truncate max-w-[240px] sm:max-w-none"
                        >
                          {item.label}
                        </button>
                      ))
                    )}
                  </div>

                  {recent.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearRecent}
                      className="text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shrink-0 ml-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── Track Train ── */
            <div className="space-y-3 flex flex-col justify-between flex-1">
              <div ref={autocompleteRef}>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 pl-0.5">
                  TRAIN NUMBER OR NAME
                </label>
                <div className="relative flex items-center gap-2 sm:gap-3">
                  <input
                    type="text"
                    value={trainQuery}
                    onChange={(e) => {
                      setTrainQuery(e.target.value);
                      setShowAutocomplete(true);
                      setUnmatchedNotice(null);
                    }}
                    onFocus={() => setShowAutocomplete(true)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTrackSubmit()}
                    placeholder="Enter train no. or name (e.g. 12821, Vande Bharat)"
                    className="flex-1 min-w-0 px-4 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A] transition-all shadow-2xs"
                  />

                  <button
                    type="button"
                    onClick={handleTrackSubmit}
                    disabled={!trainQuery.trim()}
                    className="shrink-0 px-5 sm:px-6 py-2.5 rounded-xl bg-[#0F294A] text-white text-xs sm:text-sm font-bold hover:bg-[#1a3a60] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer shadow-xs"
                  >
                    {t.btnTrack}
                  </button>

                  {/* Autocomplete Dropdown - Spans full width of input + button row */}
                  {showAutocomplete && autocompleteSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-xl border border-slate-200 shadow-xl py-1 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3.5 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        Live Corridor Trains
                      </div>
                      {autocompleteSuggestions.map((t) => (
                        <div
                          key={t.no}
                          onClick={() => {
                            setShowAutocomplete(false);
                            handleSelectTrainAndNavigate(t.no, `${t.no} ${t.name}`);
                          }}
                          className="px-3.5 py-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between border-b border-slate-50 last:border-0 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0 p-1">
                              <img src="/train-icon.png" alt="Train" className="w-6 h-6 object-contain" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#0F294A] text-xs sm:text-sm">
                                  {t.no}
                                </span>
                                <span className="font-semibold text-slate-800 text-xs sm:text-sm truncate">
                                  {t.name}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate">
                                {t.subtitle}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0 ml-2">
                            <span
                              className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                                t.statusColor === 'emerald'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {t.delayStatus}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#0F294A] group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Unmatched Fallback Banner with Quick-Select Pills */}
              {unmatchedNotice && (
                <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-slate-800 space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-700 leading-relaxed">
                      Live telemetry is currently active for the <strong>Bhadrak–Puri pilot corridor</strong>. Choose one of the 3 live trains below:
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-0.5 pl-6">
                    {PILOT_TRAINS.map((tr) => (
                      <button
                        type="button"
                        key={tr.no}
                        onClick={() =>
                          handleSelectTrainAndNavigate(tr.no, `${tr.no} ${tr.name}`)
                        }
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 text-[#0F294A] font-semibold text-xs border border-amber-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <img src="/train-icon.png" alt="" className="w-4 h-4 object-contain" />
                        <span className="font-mono font-bold">{tr.no}</span>
                        <span>{tr.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick corridor train pills in Track tab (hidden while autocomplete dropdown is open) */}
              {!unmatchedNotice && !showAutocomplete && (
                <div className="pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
                  <span className="text-xs font-semibold text-slate-400 shrink-0">Quick select:</span>
                  <button
                    type="button"
                    onClick={() => handleSelectTrainAndNavigate('12821', '12821 Dhauli Express')}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                  >
                    12821 Dhauli Exp
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTrainAndNavigate('22895', '22895 Vande Bharat')}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                  >
                    22895 Vande Bharat
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTrainAndNavigate('18410', '18410 Sri Jagannath Express')}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                  >
                    18410 Sri Jagannath
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
