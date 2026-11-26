import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Clock,
  ArrowLeftRight,
  ArrowRight,
  Info,
  ChevronDown,
  X,
} from 'lucide-react';
import { useRailStore } from '../../stores/useRailStore';
import { useManagerTrainStore } from '../../stores/useManagerTrainStore';
import { TRANSLATIONS } from './translations';
import {
  PILOT_STATIONS,
  PILOT_TRAINS,
  DEFAULT_RECENT,
  type PilotTrain,
  type RecentItem,
} from './searchConstants';

export const SearchCard: React.FC = () => {
  const { language, navigateToDashboardWithTrain, setSelectedTrain } = useRailStore();
  const managerTrains = useManagerTrainStore((s) => s.trains);
  const t = TRANSLATIONS[language].search;

  // Combine pilot trains with any manager / custom trains dynamically
  const allCorridorTrains = useMemo<PilotTrain[]>(() => {
    const custom = managerTrains.filter(
      (mt) => !PILOT_TRAINS.some((pt) => pt.no === mt.no)
    );
    const mappedCustom: PilotTrain[] = custom.map((ct) => ({
      no: ct.no,
      name: ct.name,
      direction: ct.direction,
      delayStatus: (ct.currentDelayMins ?? 0) > 0 ? `+${ct.currentDelayMins}m late` : 'On time',
      statusColor: (ct.currentDelayMins ?? 0) <= 5 ? 'emerald' : 'amber',
      departureTime: '10:00 AM',
      origin: `${ct.from}`,
      destination: `${ct.to}`,
      subtitle: `${ct.from} → ${ct.to} • ${ct.priority} (${ct.direction})`,
    }));
    return [...PILOT_TRAINS, ...mappedCustom];
  }, [managerTrains]);

  const [activeTab, setActiveTab] = useState<'find' | 'track'>('find');
  const [fromStation, setFromStation] = useState('BHC');
  const [toStation, setToStation] = useState('BBS');
  const [trainQuery, setTrainQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PilotTrain[] | null>(null);
  const [showFindPopover, setShowFindPopover] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [unmatchedNotice, setUnmatchedNotice] = useState<string | null>(null);

  const findPopoverRef = useRef<HTMLDivElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  const [recent, setRecent] = useState<RecentItem[]>(() => {
    try {
      const saved = localStorage.getItem('rp_recent_routes');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.slice(0, 2);
      }
      return DEFAULT_RECENT;
    } catch {
      return DEFAULT_RECENT;
    }
  });

  // Handle outside click and Escape key for Find popover and Autocomplete
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        findPopoverRef.current &&
        !findPopoverRef.current.contains(target) &&
        !searchButtonRef.current?.contains(target) &&
        !target.closest('.recent-route-pill')
      ) {
        setShowFindPopover(false);
      }
      if (autocompleteRef.current && !autocompleteRef.current.contains(target)) {
        setShowAutocomplete(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFindPopover(false);
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
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
      matches = allCorridorTrains.filter((t) => t.direction === 'DN');
    } else {
      matches = allCorridorTrains.filter((t) => t.direction === 'UP');
    }

    setSearchResults(matches);
  };

  const handleFromChange = (newFrom: string) => {
    setFromStation(newFrom);
    setShowFindPopover(false);
  };

  const handleToChange = (newTo: string) => {
    setToStation(newTo);
    setShowFindPopover(false);
  };

  const handleSwap = () => {
    const temp = fromStation;
    setFromStation(toStation);
    setToStation(temp);
    setShowFindPopover(false);
  };

  const handleSearch = () => {
    if (searchDisabled) return;
    filterTrains(fromStation, toStation);
    setShowFindPopover(true);
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
    setShowFindPopover(false);
    setSelectedTrain(trainNo);
    if (trainLabel) {
      // save selected train
    }
    navigateToDashboardWithTrain(trainNo);
  };

  const handleTrackSubmit = () => {
    const q = trainQuery.trim();
    if (!q) return;

    // Search against all corridor trains (exact no first, then exact name, then partial match)
    const qLower = q.toLowerCase();
    const exactNoMatch = allCorridorTrains.find((t) => t.no === q);
    const exactNameMatch = allCorridorTrains.find(
      (t) => t.name.toLowerCase() === qLower
    );
    const partialMatch =
      q.length >= 2
        ? allCorridorTrains.find(
            (t) =>
              t.no.includes(q) ||
              t.name.toLowerCase().includes(qLower) ||
              qLower.includes(t.name.toLowerCase())
          )
        : null;

    const match = exactNoMatch || exactNameMatch || partialMatch;

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
    setShowFindPopover(true);
  };

  const handleClearRecent = () => {
    setRecent([]);
    try {
      localStorage.setItem('rp_recent_routes', '[]');
    } catch {
      /* noop */
    }
  };

  // Autocomplete suggestions based on query
  const autocompleteSuggestions = useMemo(() => {
    const q = trainQuery.trim().toLowerCase();
    if (!q) return allCorridorTrains;
    return allCorridorTrains.filter(
      (t) =>
        t.no.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q)
    );
  }, [allCorridorTrains, trainQuery]);

  const searchDisabled = !fromStation || !toStation || fromStation === toStation;

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
                setShowFindPopover(false);
                setShowAutocomplete(false);
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
              <div className="relative">
                <div className="flex flex-col md:flex-row md:items-end gap-2.5">
                  {/* From Station */}
                  <div className="relative w-full min-w-0 md:flex-1">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 pl-0.5">
                      FROM
                    </label>
                    <div className="relative">
                      <select
                        value={fromStation}
                        onChange={(e) => handleFromChange(e.target.value)}
                        className="w-full appearance-none pl-3.5 pr-8 h-11 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A] transition-all cursor-pointer truncate shadow-2xs"
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
                  <div className="shrink-0 self-center -my-1 md:my-0 md:self-auto rotate-90 md:rotate-0 md:pb-0.5">
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
                  <div className="relative w-full min-w-0 md:flex-1">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 pl-0.5">
                      TO
                    </label>
                    <div className="relative">
                      <select
                        value={toStation}
                        onChange={(e) => handleToChange(e.target.value)}
                        className="w-full appearance-none pl-3.5 pr-8 h-11 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A] transition-all cursor-pointer truncate shadow-2xs"
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
                  <div className="w-full md:w-auto shrink-0">
                    <button
                      ref={searchButtonRef}
                      type="button"
                      onClick={handleSearch}
                      disabled={searchDisabled}
                      className="w-full md:w-auto h-11 px-5 sm:px-6 rounded-xl bg-[#0F294A] text-white text-xs sm:text-sm font-bold hover:bg-[#1a3a60] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer shadow-xs flex items-center justify-center"
                    >
                      {t.btnSearch}
                    </button>
                  </div>
                </div>

                {/* Floating Results Popover (Matching Track Train) */}
                {showFindPopover && searchResults && (
                  <div
                    ref={findPopoverRef}
                    className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 animate-in fade-in zoom-in-95 duration-150"
                  >
                    {/* Header: MATCHING TRAINS ([count]) + × Close button */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2 px-1">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        MATCHING TRAINS ({searchResults.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowFindPopover(false)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Matched Train Rows */}
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {searchResults.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500 font-medium">
                          No live trains found for this route.
                        </div>
                      ) : (
                        searchResults.map((tr) => (
                          <button
                            type="button"
                            key={tr.no}
                            onClick={() =>
                              handleSelectTrainAndNavigate(tr.no, `${tr.no} ${tr.name}`)
                            }
                            className="w-full text-left p-3 sm:p-3.5 rounded-xl border border-slate-200 hover:border-[#0F294A] hover:bg-slate-50/80 transition-all cursor-pointer flex items-center justify-between group shadow-2xs hover:shadow-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0 p-1.5 shadow-2xs">
                                <img src="/train-icon.png" alt="Train" className="w-7 h-7 object-contain" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold text-sm sm:text-base text-[#0F294A]">
                                    {tr.no}
                                  </span>
                                  <span className="text-slate-300 font-bold hidden sm:inline">•</span>
                                  <span className="font-bold text-sm sm:text-base text-slate-800 truncate">
                                    {tr.name}
                                  </span>
                                  <span
                                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${
                                      tr.statusColor === 'emerald'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }`}
                                  >
                                    {tr.delayStatus}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium mt-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>
                                    Departs {tr.departureTime} • {tr.origin.replace(/ \([A-Z]+\)/g, '')} → {tr.destination.replace(/ \([A-Z]+\)/g, '')}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F294A]/5 group-hover:bg-[#0F294A] group-hover:text-white text-[#0F294A] text-xs font-bold transition-all shrink-0 ml-3 shadow-2xs">
                              <span>Live ETA</span>
                              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Single horizontal strip with route pills and subtle Clear link - ALWAYS stays in place without shifting card */}
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
                        className="recent-route-pill px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer truncate max-w-full"
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
            </div>
          ) : (
            /* ── Track Train ── */
            <div className="space-y-3 flex flex-col justify-between flex-1">
              <div ref={autocompleteRef}>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 pl-0.5">
                  TRAIN NUMBER OR NAME
                </label>
                <div className="relative flex flex-col sm:flex-row gap-2.5">
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
                    className="w-full sm:flex-1 min-w-0 px-4 h-11 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F294A]/20 focus:border-[#0F294A] transition-all shadow-2xs"
                  />

                  <button
                    type="button"
                    onClick={handleTrackSubmit}
                    disabled={!trainQuery.trim()}
                    className="w-full sm:w-auto h-11 px-5 sm:px-6 rounded-xl bg-[#0F294A] text-white text-xs sm:text-sm font-bold hover:bg-[#1a3a60] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer shadow-xs flex items-center justify-center"
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
                      Live telemetry is currently active for the <strong>Bhadrak–Puri pilot corridor</strong>. Choose one of the {allCorridorTrains.length} live trains below:
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-0.5 pl-6">
                    {allCorridorTrains.map((tr) => (
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
                  {allCorridorTrains.slice(0, 5).map((tr) => (
                    <button
                      type="button"
                      key={tr.no}
                      onClick={() => handleSelectTrainAndNavigate(tr.no, `${tr.no} ${tr.name}`)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                    >
                      {tr.no} {tr.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
