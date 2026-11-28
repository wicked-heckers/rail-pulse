import React, { useState } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { StationRow } from './StationRow';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  ArrowRight,
  MapPin,
} from 'lucide-react';
import {
  getDelayCauses,
  getStationTimeline,
} from '../dashboard/passengerUtils';

export const VerticalTimeline: React.FC = () => {
  const {
    selectedTrain,
    activeSnapshot,
    forecast,
    selectedDelayId,
    setSelectedDelayId,
    setActiveMapView,
  } = useRailStore();

  // Side-by-side toggle state: 'journey' (left, default) or 'delay' (right)
  const [activeTab, setActiveTab] = useState<'journey' | 'delay'>('journey');

  // If a delay is selected via map interaction, switch to the delay tab
  React.useEffect(() => {
    if (selectedDelayId) {
      setActiveTab('delay');
    }
  }, [selectedDelayId]);

  const currentTrain =
    activeSnapshot.trains.find((t) => t.train_no === selectedTrain) ||
    activeSnapshot.trains[0];

  // Delay Causes in everyday passenger wording
  const delayCauses = getDelayCauses(
    selectedTrain,
    forecast,
    currentTrain?.current_station,
    currentTrain?.current_delay_mins,
    activeSnapshot
  );

  // Filter active delays (excludes clear route)
  const activeDelays = delayCauses.filter((c) => c.tagType !== 'clear');

  // Full Station Timeline
  const stationTimeline = getStationTimeline(
    selectedTrain,
    forecast,
    activeSnapshot
  );

  const trainSpeed = currentTrain?.speed_kmph ?? 0;

  const handleToggleDelay = (causeId: string) => {
    if (selectedDelayId === causeId) {
      setSelectedDelayId(null);
      setActiveMapView('my_train');
    } else {
      setSelectedDelayId(causeId);
      setActiveMapView('delays_ahead');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-5 shadow-xs flex flex-col transition-all">
      {/* ── Top Side-by-Side Segmented Toggle (Journey details on left, Delay cause on right) ── */}
      <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1 shrink-0 mb-3.5 sticky top-0 z-10">
        <button
          type="button"
          onClick={() => setActiveTab('journey')}
          className={`w-full min-w-0 py-2 px-1.5 sm:px-3 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
            activeTab === 'journey'
              ? 'bg-white text-[#0F294A] shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="truncate whitespace-nowrap">Journey Details</span>
          <span
            className={`px-1.5 sm:px-2 py-0.5 text-xs font-mono font-bold rounded-full whitespace-nowrap shrink-0 ${
              activeTab === 'journey'
                ? 'bg-slate-100 text-slate-700 border border-slate-300'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            <span className="sm:hidden">{stationTimeline.length}</span>
            <span className="hidden sm:inline">{stationTimeline.length} stops</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('delay')}
          className={`w-full min-w-0 py-2 px-1.5 sm:px-3 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
            activeTab === 'delay'
              ? 'bg-white text-[#0F294A] shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="truncate whitespace-nowrap">Delay Cause</span>
          {activeDelays.length > 0 ? (
            <span
              className={`px-1.5 sm:px-2 py-0.5 text-xs font-bold rounded-full whitespace-nowrap shrink-0 ${
                activeTab === 'delay'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-amber-200/80 text-amber-900'
              }`}
            >
              {activeDelays.length}
            </span>
          ) : (
            <span
              className={`px-1.5 sm:px-2 py-0.5 text-xs font-bold rounded-full whitespace-nowrap shrink-0 ${
                activeTab === 'delay'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-emerald-200/80 text-emerald-900'
              }`}
            >
              0
            </span>
          )}
        </button>
      </div>

      {/* ── View 1: Delay Cause (Default) ── */}
      {activeTab === 'delay' && (
        <div className="flex flex-col space-y-2.5">
          {activeDelays.length === 0 ? (
            /* Calm green empty state when no delays exist */
            <div className="rounded-xl p-5 bg-emerald-50/70 border border-emerald-200 flex flex-col items-center justify-center text-center gap-2">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-2xs">
                <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-emerald-950">Track is Clear Ahead</h4>
                <p className="text-[13px] text-emerald-800 mt-1 max-w-xs leading-relaxed">
                  No delays reported ahead—track is clear.
                </p>
              </div>
            </div>
          ) : (
            /* Active delay reason cards in plain passenger language */
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-0.5 uppercase tracking-wider">
                <span>ACTIVE FACTORS ({activeDelays.length})</span>
                <span className="text-xs font-medium text-slate-400 normal-case">Click card to inspect on map</span>
              </div>

              {activeDelays.map((cause) => {
                const isSelected = selectedDelayId === cause.id;
                const isConfirmed = cause.tagType === 'confirmed';

                return (
                  <div
                    key={cause.id}
                    onClick={() => handleToggleDelay(cause.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggleDelay(cause.id);
                      }
                    }}
                    className={`rounded-xl p-4 border transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'ring-2 ring-orange-500 bg-orange-50/90 border-orange-300 shadow-sm'
                        : isConfirmed
                        ? 'bg-amber-50/70 border-amber-200 hover:border-amber-300'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                    title="Click to view and center this delay on the map"
                  >
                    {/* Compact top row: Status indicator on left, badges on right */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isConfirmed ? (
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                        <span className={`text-[13px] font-bold ${isConfirmed ? 'text-amber-800' : 'text-slate-600'}`}>
                          {isConfirmed ? 'Active Delay' : 'Projected Wait'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 justify-end">
                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${
                            isSelected
                              ? 'bg-white text-orange-800 border-orange-300'
                              : isConfirmed
                              ? 'bg-white text-amber-800 border-amber-200'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {cause.tag}
                        </span>
                      </div>
                    </div>

                    {/* Full-width Title spanning 1-2 lines without ellipsis truncation */}
                    <h4 className="font-bold text-sm sm:text-base text-slate-900 leading-snug mb-1.5">
                      {cause.title}
                    </h4>

                    {/* Description text */}
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {cause.explanation}
                    </p>

                    {/* Clean "View on map →" action row */}
                    <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[13px] sm:text-sm">
                      <div className="flex items-center gap-1.5 text-[13px] sm:text-sm text-slate-500 font-medium truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{cause.locationName || 'Trunk corridor'}</span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleDelay(cause.id);
                        }}
                        className={`text-[13px] sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ml-2 ${
                          isSelected
                            ? 'text-orange-700 underline'
                            : 'text-[#0F294A] hover:text-blue-700'
                        }`}
                      >
                        <span>{isSelected ? 'Focused on map' : 'View on map'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── View 2: Journey Details (Station-by-Station Timetable) ── */}
      {activeTab === 'journey' && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-4 px-1 text-xs text-slate-400 font-semibold mb-1.5 shrink-0">
            <span className="shrink-0">STATION & PLATFORM</span>
            <span className="shrink-0">EXPECTED ARRIVAL</span>
          </div>

          <div className="relative rounded-xl border border-slate-200/90 bg-white p-1">
            {/* Continuous Vertical Rail Track Line */}
            <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-200 -translate-x-1/2 z-0" />

            {stationTimeline.map((stn) => {
              const isAtThisStation = Boolean(stn.is_halted) || currentTrain?.current_station === stn.station_code;
              return (
                <StationRow
                  key={stn.station_code}
                  station={stn}
                  isTargetTrainHere={isAtThisStation}
                  trainSpeed={trainSpeed}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
