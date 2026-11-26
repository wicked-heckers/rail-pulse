import React, { useState } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { ChevronUp, ChevronDown, Layers } from 'lucide-react';

export const MapLegend: React.FC = () => {
  const { rescue, passengerStatus, activeMapView, activeCorridorId } = useRailStore();
  const [collapsed, setCollapsed] = useState(false);

  const isRescueVisible =
    activeMapView === 'alternative_route' ||
    ((rescue?.survival_probability_pct ?? 34.0) < 40 && passengerStatus === 'ON_BOARD');

  const isKolkata = activeCorridorId === 'SER_HWH_KGP';

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto max-w-[95%]">
      <div className="backdrop-blur-md bg-white/95 border border-slate-200/90 rounded-2xl sm:rounded-full px-3.5 py-1.5 sm:px-4 sm:py-2 shadow-md flex items-center gap-3.5 text-xs font-semibold text-slate-800 transition-all">
        {/* Toggle button on small screens */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="sm:hidden flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Legend</span>
          {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {(!collapsed || typeof window === 'undefined') && (
          <div className="flex items-center gap-3.5 flex-wrap sm:flex-nowrap">
            {/* 1. Passenger Train */}
            <div className="flex items-center gap-1.5" title="Your selected journey train">
              <span className="w-3 h-3 rounded-full bg-orange-600 ring-3 ring-orange-300 animate-pulse" />
              <span className="font-bold text-[#0F294A]">Your Train</span>
            </div>

            {/* 2. Other Trains */}
            <div className="flex items-center gap-1.5" title="Other corridor passenger & express trains">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-1 ring-white" />
              <span className="text-slate-600">Other Trains</span>
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
        )}
      </div>
    </div>
  );
};
