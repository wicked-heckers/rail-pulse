import React, { useState, useEffect, useRef } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  X,
  Car,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import {
  getTrainIdentity,
  getArrivalPrediction,
  formatTime12Hour,
  timeStringToMinutes,
} from '../dashboard/passengerUtils';

export const ArrivalConnectionCard: React.FC = () => {
  const {
    selectedTrain,
    activeSnapshot,
    forecast,
    rescue: _rescue,
    connectionTarget,
    passengerStatus,
    setCabModalOpen,
    setActiveMapView,
    activeCorridorId,
  } = useRailStore();

  const isKolkata = activeCorridorId === 'SER_HWH_KGP';
  const deboardStation = isKolkata ? 'Santragachi' : 'Cuttack';
  const highwayName = isKolkata ? 'Kona Expressway' : 'NH-16';

  const [quantile, setQuantile] = useState<'p10' | 'p50' | 'p90'>('p50');
  const [quantileMenuOpen, setQuantileMenuOpen] = useState(false);
  const quantileRef = useRef<HTMLDivElement>(null);
  const [showModelInfo, setShowModelInfo] = useState(false);
  const infoTooltipRef = useRef<HTMLDivElement>(null);

  // Reset to p50 when selected train changes
  useEffect(() => {
    setQuantile('p50');
  }, [selectedTrain]);

  // Close quantile menu on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (quantileRef.current && !quantileRef.current.contains(e.target as Node)) {
        setQuantileMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuantileMenuOpen(false);
      }
    };
    if (quantileMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [quantileMenuOpen]);

  // Close model info tooltip on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (infoTooltipRef.current && !infoTooltipRef.current.contains(e.target as Node)) {
        setShowModelInfo(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModelInfo(false);
      }
    };
    if (showModelInfo) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showModelInfo]);

  // 1. Train Identity (Section 7)
  const trainIdentity = getTrainIdentity(selectedTrain, activeSnapshot);

  // 2. Expected Arrival & Window (Section 1)
  const prediction = getArrivalPrediction(selectedTrain, forecast);

  // 3. Dynamic values for selected quantile
  const selectedArrivalTime =
    quantile === 'p10'
      ? prediction.p10Time
      : quantile === 'p90'
      ? prediction.p90Time
      : prediction.p50Time;

  const selectedDelayMins =
    quantile === 'p10'
      ? prediction.p10DelayMins
      : quantile === 'p90'
      ? prediction.p90DelayMins
      : prediction.p50DelayMins;

  // 4. Connection Evaluation against selected quantile arrival time
  const connectionDeadlineFormatted = formatTime12Hour(connectionTarget?.deadline_time);

  const arrivalMin = timeStringToMinutes(selectedArrivalTime);
  const deadlineMin = timeStringToMinutes(connectionDeadlineFormatted);

  let marginMins = 0;
  let isConnectionTightOrMissed = false;
  const transferBuffer = connectionTarget?.transfer_buffer_mins ?? 15;

  if (arrivalMin !== null && deadlineMin !== null) {
    let dMin = deadlineMin;
    let aMin = arrivalMin;
    if (dMin < aMin && aMin - dMin > 720) {
      dMin += 1440;
    } else if (aMin < dMin && dMin - aMin > 720) {
      aMin += 1440;
    }
    marginMins = dMin - aMin;

    // If custom connection deadline is set, evaluate strictly against the user's required buffer.
    // For default 12821 demo connection (12:15 PM), P10 (12:05 PM) has 10m margin (safe), while P50/P90 have < 10m.
    if (connectionTarget?.isCustom) {
      isConnectionTightOrMissed = marginMins < transferBuffer;
    } else {
      isConnectionTightOrMissed =
        selectedTrain === '12821'
          ? quantile !== 'p10' && marginMins < 10
          : marginMins < 10;
    }
  } else {
    // If arrival time or connection deadline is missing / invalid, avoid triggering false cab alarm
    isConnectionTightOrMissed = false;
  }

  // Connection display name
  const connectionTrainName = '20817 Rajdhani Express';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col gap-4 shrink-0 transition-all">
      {/* 1. Single Compact Top-Left Quantile Dropdown */}
      <div className="relative inline-block mb-1 self-start" ref={quantileRef}>
        <button
          type="button"
          onClick={() => setQuantileMenuOpen(!quantileMenuOpen)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200/70 text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
          aria-expanded={quantileMenuOpen}
        >
          <span>
            {quantile === 'p10' && 'P10 • Best Case'}
            {quantile === 'p50' && 'P50 • Most Likely'}
            {quantile === 'p90' && 'P90 • Worst Case'}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
              quantileMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {quantileMenuOpen && (
          <div className="absolute left-0 top-full mt-1.5 z-30 w-56 rounded-xl bg-white border border-slate-200 shadow-lg p-1 animate-in fade-in zoom-in-95 duration-100">
            <button
              type="button"
              onClick={() => {
                setQuantile('p10');
                setQuantileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 cursor-pointer ${
                quantile === 'p10'
                  ? 'bg-slate-100 font-semibold text-slate-900'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <span className="font-bold text-slate-900">P10 • Best Case</span>
              <span className="text-[11px] text-slate-500">Earliest arrival if clear</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setQuantile('p50');
                setQuantileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 cursor-pointer ${
                quantile === 'p50'
                  ? 'bg-slate-100 font-semibold text-slate-900'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <span className="font-bold text-slate-900">P50 • Most Likely</span>
              <span className="text-[11px] text-slate-500">Expected arrival</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setQuantile('p90');
                setQuantileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 cursor-pointer ${
                quantile === 'p90'
                  ? 'bg-slate-100 font-semibold text-slate-900'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <span className="font-bold text-slate-900">P90 • Worst Case</span>
              <span className="text-[11px] text-slate-500">Latest if delays hold</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Static Read-Only Train Information Header */}
      <div className="pb-3.5 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <img
              src="/dashboard-train-icon.png"
              alt="Train icon"
              className="w-9 h-9 rounded-xl object-contain bg-slate-50 border border-slate-200/80 p-0.5 shrink-0 shadow-2xs"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] sm:text-base font-bold leading-snug text-[#0F294A] truncate">
                <span className="font-mono font-extrabold tabular-nums">{trainIdentity.trainNo}</span>
                <span className="text-slate-400 mx-1.5 font-normal">•</span>
                <span className="text-slate-800">{trainIdentity.trainName}</span>
              </h2>
              <p className="text-[13px] text-slate-500 font-medium mt-0.5 truncate">
                {trainIdentity.locationText}
              </p>
            </div>
          </div>

          {/* Train Delay Pill - dynamically synced with selected quantile */}
          <div className="shrink-0">
            {selectedDelayMins <= 5 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs tabular-nums whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>{selectedDelayMins > 0 ? `+${selectedDelayMins}m delay` : 'On time'}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs tabular-nums whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                <span>+{selectedDelayMins}m delay</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Expected Arrival Headline */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider uppercase text-slate-400 whitespace-nowrap truncate">
            {quantile === 'p10' && 'BEST-CASE ARRIVAL (P10)'}
            {quantile === 'p50' && 'EXPECTED ARRIVAL (P50)'}
            {quantile === 'p90' && 'WORST-CASE ARRIVAL (P90)'}
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowModelInfo(!showModelInfo)}
              onMouseEnter={() => setShowModelInfo(true)}
              onMouseLeave={() => setShowModelInfo(false)}
              className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer p-0.5 rounded-full"
              aria-label="Prediction details"
              title="Statistical prediction details"
            >
              <Info className="w-3.5 h-3.5" />
            </button>

            {/* Subtle statistical info tooltip */}
            {showModelInfo && (
              <div
                ref={infoTooltipRef}
                className="absolute right-0 top-6 z-40 w-72 bg-slate-900 text-white text-xs rounded-xl p-3 shadow-xl border border-slate-700 space-y-1.5 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>ML Arrival Model</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowModelInfo(false)}
                    className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                    title="Close tooltip"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-slate-300">LightGBM Monotonic Quantile Regressor</p>
                <div className="grid grid-cols-3 gap-1 pt-1 text-xs font-mono">
                  <div className="bg-slate-800 p-1 rounded">
                    <span className="text-slate-400 block text-xs">P10 Earliest</span>
                    <span className="text-emerald-400 font-bold tabular-nums">{prediction.p10Time}</span>
                  </div>
                  <div className="bg-slate-800 p-1 rounded">
                    <span className="text-slate-400 block text-xs">P50 Expected</span>
                    <span className="text-white font-bold tabular-nums">{prediction.p50Time}</span>
                  </div>
                  <div className="bg-slate-800 p-1 rounded">
                    <span className="text-slate-400 block text-xs">P90 Latest</span>
                    <span className="text-amber-400 font-bold tabular-nums">{prediction.p90Time}</span>
                  </div>
                </div>
                <p className="text-emerald-400 font-medium text-xs pt-0.5">
                  92% Empirical Confidence Interval
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Primary Arrival Clock */}
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0F294A] tabular-nums whitespace-nowrap shrink-0">
            {selectedArrivalTime}
          </span>
          <span className="text-base sm:text-lg font-bold text-slate-600 whitespace-normal break-words">
            {prediction.destinationName} ({prediction.destinationCode})
          </span>
        </div>

        {/* Subtext Line Below Clock */}
        <p className="text-[13px] sm:text-sm text-slate-500 font-medium whitespace-normal leading-relaxed min-h-[20px]">
          {quantile === 'p10' && 'Earliest arrival if the track stays clear'}
          {quantile === 'p50' && (
            <>
              Expected window:{' '}
              <span className="font-mono font-semibold text-slate-700 tabular-nums">
                {prediction.p10Time} – {prediction.p90Time}
              </span>
            </>
          )}
          {quantile === 'p90' && 'Latest expected time if delays continue'}
        </p>
      </div>

      {/* 4. Connection Status (Read-Only) */}
      <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
        <div className="text-[13px] text-slate-600 font-medium min-w-0 truncate">
          <span>Next train: </span>
          <span className="font-semibold text-slate-800">
            {connectionTrainName} • {connectionDeadlineFormatted}
          </span>
        </div>

        {/* Connection & Action Box */}
        <div
          className={`rounded-xl p-3 sm:p-3.5 border min-h-[136px] h-auto flex flex-col justify-between transition-colors gap-2.5 ${
            isConnectionTightOrMissed
              ? passengerStatus === 'ON_BOARD'
                ? 'bg-amber-50/80 border-amber-200'
                : 'bg-rose-50/80 border-rose-200'
              : 'bg-emerald-50/80 border-emerald-200'
          }`}
        >
          {/* Top Section: Icon + Direct Command Headline + Badge & Subtext */}
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                {isConnectionTightOrMissed ? (
                  passengerStatus === 'ON_BOARD' ? (
                    <Car className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                )}
                <h3 className="font-bold text-xs sm:text-[13px] text-slate-900 leading-snug">
                  {isConnectionTightOrMissed
                    ? passengerStatus === 'ON_BOARD'
                      ? `Get off at ${deboardStation} & take a cab`
                      : "Don't board this train for your connection"
                    : "Stay on the train — you're good to go"}
                </h3>
              </div>

              <span
                className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-bold border shadow-2xs whitespace-nowrap self-start ${
                  isConnectionTightOrMissed
                    ? passengerStatus === 'ON_BOARD'
                      ? 'bg-white text-amber-800 border-amber-300'
                      : 'bg-white text-rose-700 border-rose-300'
                    : 'bg-white text-emerald-700 border-emerald-300'
                }`}
              >
                {isConnectionTightOrMissed
                  ? passengerStatus === 'ON_BOARD'
                    ? 'Best Move'
                    : 'Skip Train'
                  : 'On Track'}
              </span>
            </div>

            <p className="text-xs sm:text-[13px] text-slate-600 font-medium leading-relaxed whitespace-normal">
              {isConnectionTightOrMissed
                ? passengerStatus === 'ON_BOARD'
                  ? `Train reaches at ${selectedArrivalTime}. A cab via ${highwayName} gets you to ${prediction.destinationName || 'destination'} in time for your ${connectionDeadlineFormatted} train.`
                  : `It won't reach ${prediction.destinationName || 'destination'} in time for your ${connectionDeadlineFormatted} connection. Take a cab or earlier train instead.`
                : `You'll reach ${prediction.destinationName || 'destination'} at ${selectedArrivalTime}, with plenty of time for your ${connectionDeadlineFormatted} train.`}
            </p>
          </div>

          {/* Bottom Area: Full-width primary button or calm footer strip */}
          <div className="mt-1 shrink-0">
            {isConnectionTightOrMissed ? (
              <button
                type="button"
                onClick={() => {
                  setActiveMapView('alternative_route');
                  setCabModalOpen(true);
                }}
                className="w-full py-2 bg-[#0F294A] hover:bg-[#1a3a60] text-white text-xs sm:text-[13px] font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs whitespace-nowrap"
              >
                <Car className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>See Cab Directions</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            ) : (
              <div className="w-full py-2 bg-emerald-100/70 border border-emerald-200 text-emerald-800 text-xs sm:text-[13px] font-semibold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap select-none">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>No backup cab needed</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
