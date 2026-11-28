import React, { useState } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { ChevronUp, X } from 'lucide-react';

const TrainLegendIcon: React.FC<{ isTarget?: boolean }> = ({ isTarget = false }) => (
  <span
    className={`inline-flex items-center justify-center w-5 h-5 rounded-full bg-white shrink-0 ${
      isTarget ? 'border-2 border-[#EA580C] ring-2 ring-orange-200' : 'border-2 border-[#2563EB]'
    }`}
  >
    <img src="/dashboard-train-icon.png" alt="" className="w-3.5 h-3.5 object-contain" />
  </span>
);

export const MapLegend: React.FC = () => {
  const { rescue, passengerStatus, activeMapView, activeCorridorId } = useRailStore();
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const isRescueVisible =
    activeMapView === 'alternative_route' ||
    ((rescue?.survival_probability_pct ?? 34.0) < 40 && passengerStatus === 'ON_BOARD');

  const isKolkata = activeCorridorId === 'SER_HWH_KGP';

  return (
    <>
      {/* Mobile Legend (< md): Collapsed by default into compact bottom-left pill */}
      {!mobileExpanded ? (
        <button
          type="button"
          onClick={() => setMobileExpanded(true)}
          className="md:hidden absolute bottom-4 left-3 z-10 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/95 backdrop-blur-sm border border-slate-200/80 shadow-md text-xs font-semibold text-slate-800 cursor-pointer"
          aria-expanded={false}
          aria-label="Show map legend"
        >
          <span>Legend</span>
          <ChevronUp className="w-3.5 h-3.5 text-slate-600" />
        </button>
      ) : (
        <div
          className="md:hidden absolute bottom-4 left-3 right-3 z-30 p-3.5 rounded-2xl bg-white/95 backdrop-blur-sm border border-slate-200/80 shadow-lg"
          role="region"
          aria-label="Map legend"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">Legend</span>
            <button
              type="button"
              onClick={() => setMobileExpanded(false)}
              className="p-1 -mr-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close map legend"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mt-2.5 text-xs font-semibold">
            <div className="flex items-center gap-2 min-w-0">
              <TrainLegendIcon isTarget />
              <span className="text-[#0F294A] truncate">Your Train</span>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <TrainLegendIcon />
              <span className="text-slate-700 truncate">Other Trains</span>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3.5 h-1.5 rounded-xs bg-amber-500 border border-amber-600 shrink-0" />
              <span className="text-amber-900 truncate">Slow Traffic Ahead</span>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="w-4 h-0.5 border-t-2 border-dashed border-emerald-600 inline-block shrink-0" />
              <span className="text-emerald-800 truncate">
                Cab Route ({isKolkata ? 'Kona Exp' : 'NH-16'})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Legend (md and up): Unchanged horizontal bottom bar */}
      <div className="hidden md:block absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-[95%]">
        <div className="backdrop-blur-md bg-white/95 border border-slate-200/90 rounded-full px-4 py-2 shadow-md flex items-center gap-3.5 text-xs font-semibold text-slate-800">
          <div className="flex items-center gap-3.5 flex-nowrap">
            {/* 1. Passenger Train */}
            <div className="flex items-center gap-1.5 whitespace-nowrap" title="Your selected journey train">
              <TrainLegendIcon isTarget />
              <span className="font-bold text-[#0F294A] whitespace-nowrap">Your Train</span>
            </div>

            {/* 2. Other Trains */}
            <div className="flex items-center gap-1.5 whitespace-nowrap" title="Other corridor passenger & express trains">
              <TrainLegendIcon />
              <span className="text-slate-600 whitespace-nowrap">Other Trains</span>
            </div>

            {/* 3. Slow Traffic Ahead */}
            <div className="flex items-center gap-1.5" title="Active or predicted delay sections">
              <span className="w-3.5 h-1.5 rounded-xs bg-amber-500 border border-amber-600" />
              <span className="text-amber-900">Slow Traffic Ahead</span>
            </div>

            {/* 4. Alternative Road Route (Contextual, visible only when active) */}
            {isRescueVisible && (
              <div className="flex items-center gap-1.5" title="Alternative NH-16 highway road transfer route">
                <span className="w-4 h-0.5 border-t-2 border-dashed border-emerald-600 inline-block" />
                <span className="text-emerald-800 font-bold">
                  Faster Cab Route ({isKolkata ? 'Kona Exp' : 'NH-16'})
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
