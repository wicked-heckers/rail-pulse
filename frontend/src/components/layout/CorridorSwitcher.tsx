import React, { useState, useEffect, useRef } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { ChevronDown, Check, GitBranch, MapPin } from 'lucide-react';

export const CorridorSwitcher: React.FC = () => {
  const {
    activeCorridorId,
    availableCorridors,
    fetchCorridors,
    switchCorridor,
  } = useRailStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCorridors();
  }, [fetchCorridors]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const activeCorridor =
    availableCorridors.find((c) => c.id === activeCorridorId) || availableCorridors[0];

  const handleSelect = async (corridorId: string) => {
    if (corridorId === activeCorridorId) {
      setIsOpen(false);
      return;
    }
    setIsSwitching(true);
    try {
      await switchCorridor(corridorId);
    } finally {
      setIsSwitching(false);
      setIsOpen(false);
    }
  };

  const getCorridorBadge = (id: string) => {
    if (id === 'SER_HWH_KGP') return 'SER • HWH–KGP';
    return 'ECoR • BHC–PURI';
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer shadow-2xs ${
          activeCorridorId === 'SER_HWH_KGP'
            ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
            : 'bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100'
        }`}
        title={`Active Corridor: ${activeCorridor?.name || 'ECoR'}. Click to switch.`}
      >
        <GitBranch className="w-3.5 h-3.5 shrink-0 opacity-75" />
        <span className="tabular-nums whitespace-nowrap">
          {getCorridorBadge(activeCorridorId)}
        </span>
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-80 sm:w-96 rounded-xl bg-white shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Select Railway Corridor
            </span>
            <span className="text-[10px] font-medium text-slate-400">
              Multi-Corridor Simulation
            </span>
          </div>

          <div className="p-1.5 space-y-1">
            {availableCorridors.map((c) => {
              const isActive = c.id === activeCorridorId;
              const isKolkata = c.id === 'SER_HWH_KGP';

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c.id)}
                  disabled={isSwitching}
                  className={`w-full text-left p-3 rounded-lg transition-all border cursor-pointer ${
                    isActive
                      ? isKolkata
                        ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-300'
                        : 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-300'
                      : 'hover:bg-slate-50 border-transparent text-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900">
                          {c.name}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                            isKolkata
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {c.region.split(' ')[0]}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                        <span>{c.section}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-600 font-mono pt-0.5">
                        <span className="bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">
                          {c.length_km} km
                        </span>
                        <span className="bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">
                          {c.stations_count} Stations
                        </span>
                        <span className="text-emerald-700 font-medium">
                          {c.primary_highway}
                        </span>
                      </div>
                    </div>

                    {isActive && (
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          isKolkata
                            ? 'bg-amber-600 text-white'
                            : 'bg-indigo-600 text-white'
                        }`}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
            Switching loads corridor topology, calibrated timetables & highway rescue router.
          </div>
        </div>
      )}
    </div>
  );
};
