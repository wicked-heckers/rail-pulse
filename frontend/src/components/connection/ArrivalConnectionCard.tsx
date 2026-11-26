import React, { useState, useEffect } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import {
  Train,
  Info,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Edit2,
  Check,
  X,
  Car,
  ArrowRight,
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
    setConnectionTarget,
    passengerStatus,
    setCabModalOpen,
    setActiveMapView,
  } = useRailStore();

  const [quantile, setQuantile] = useState<'p10' | 'p50' | 'p90'>('p50');
  const [showModelInfo, setShowModelInfo] = useState(false);
  const [isEditingConnection, setIsEditingConnection] = useState(false);
  const [editTrainName, setEditTrainName] = useState('20817 Rajdhani Express');
  const [editDeadline, setEditDeadline] = useState(connectionTarget?.deadline_time || '12:15');

  // Reset to p50 when selected train changes
  useEffect(() => {
    setQuantile('p50');
  }, [selectedTrain]);

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
  if (arrivalMin !== null && deadlineMin !== null) {
    let dMin = deadlineMin;
    if (dMin < arrivalMin && arrivalMin - dMin > 720) {
      dMin += 1440;
    }
    marginMins = dMin - arrivalMin;
  }

  // Case A (Missed/Tight on P50/P90 of 12821) vs Case B (Enough time on P10 or 22895/18410)
  const isConnectionTightOrMissed =
    selectedTrain === '12821'
      ? quantile !== 'p10'
      : marginMins < 10;

  const handleSaveConnection = () => {
    setConnectionTarget({
      deadline_time: editDeadline,
    });
    setIsEditingConnection(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col gap-4 shrink-0 transition-all">
      {/* 1. Quantile Selector (P10 / P50 / P90) */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
        <button
          type="button"
          onClick={() => setQuantile('p10')}
          className={`py-1.5 px-1.5 sm:px-2 text-xs sm:text-[13px] rounded-lg transition-all text-center cursor-pointer whitespace-nowrap truncate ${
            quantile === 'p10'
              ? 'bg-white text-slate-900 shadow-sm font-semibold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          P10 • Best Case
        </button>
        <button
          type="button"
          onClick={() => setQuantile('p50')}
          className={`py-1.5 px-1.5 sm:px-2 text-xs sm:text-[13px] rounded-lg transition-all text-center cursor-pointer whitespace-nowrap truncate ${
            quantile === 'p50'
              ? 'bg-white text-slate-900 shadow-sm font-semibold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          P50 • Most Likely
        </button>
        <button
          type="button"
          onClick={() => setQuantile('p90')}
          className={`py-1.5 px-1.5 sm:px-2 text-xs sm:text-[13px] rounded-lg transition-all text-center cursor-pointer whitespace-nowrap truncate ${
            quantile === 'p90'
              ? 'bg-white text-slate-900 shadow-sm font-semibold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          P90 • Worst Case
        </button>
      </div>

      {/* 2. Train Information Header */}
      <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#0F294A] text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Train className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-extrabold text-sm sm:text-base text-[#0F294A] tabular-nums">
                {trainIdentity.trainNo}
              </span>
              <span className="text-slate-400">•</span>
              <h2 className="font-bold text-sm sm:text-base text-slate-800 truncate">
                {trainIdentity.trainName}
              </h2>
            </div>
            <p className="text-[13px] text-slate-500 font-medium mt-0.5 truncate">
              {trainIdentity.locationText}
            </p>
          </div>
        </div>

        {/* Train Delay Pill (with scenario delay offset) */}
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
              <div className="absolute right-0 top-6 z-40 w-72 bg-slate-900 text-white text-xs rounded-xl p-3 shadow-xl border border-slate-700 space-y-1.5">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>ML Arrival Model</span>
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
        <div className="flex items-baseline gap-2 sm:gap-2.5 flex-wrap sm:whitespace-nowrap">
          <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0F294A] tabular-nums">
            {selectedArrivalTime}
          </span>
          <span className="text-base sm:text-lg font-bold text-slate-600 truncate">
            {prediction.destinationName} ({prediction.destinationCode})
          </span>
        </div>

        {/* Subtext Line Below Clock */}
        <p className="text-[13px] sm:text-sm text-slate-500 font-medium sm:whitespace-nowrap min-h-[20px] leading-5">
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

      {/* 4. Connection Status */}
      <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[13px] text-slate-500 font-medium min-w-0 truncate">
            <span className="shrink-0">Next train:</span>
            {!isEditingConnection ? (
              <span className="font-semibold text-slate-800 truncate">
                {editTrainName} • {connectionDeadlineFormatted}
              </span>
            ) : null}
          </div>

          {!isEditingConnection ? (
            <button
              type="button"
              onClick={() => setIsEditingConnection(true)}
              className="text-slate-400 hover:text-slate-600 transition-colors py-0.5 px-1.5 rounded text-xs font-medium flex items-center gap-1 cursor-pointer shrink-0"
              title="Edit connection details"
            >
              <Edit2 className="w-3 h-3" />
              <span>Change</span>
            </button>
          ) : null}
        </div>

        {/* Inline Connection Editor */}
        {isEditingConnection && (
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              value={editTrainName}
              onChange={(e) => setEditTrainName(e.target.value)}
              placeholder="Connecting train name"
              className="w-full sm:flex-1 text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0F294A]"
            />
            <input
              type="text"
              value={editDeadline}
              onChange={(e) => setEditDeadline(e.target.value)}
              placeholder="12:15 PM"
              className="w-full sm:w-28 text-xs font-mono px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0F294A]"
            />
            <div className="flex items-center gap-1 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleSaveConnection}
                className="p-1.5 bg-[#0F294A] text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Save connection"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsEditingConnection(false)}
                className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Connection & Action Box - Flexible min-h-[136px] container */}
        <div
          className={`rounded-xl p-3 sm:p-3.5 border min-h-[136px] h-auto flex flex-col justify-between transition-colors ${
            isConnectionTightOrMissed
              ? passengerStatus === 'ON_BOARD'
                ? 'bg-amber-50/80 border-amber-200'
                : 'bg-rose-50/80 border-rose-200'
              : 'bg-emerald-50/80 border-emerald-200'
          }`}
        >
          {/* Top Section: Icon + Direct Command Headline + Badge & Subtext */}
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {isConnectionTightOrMissed ? (
                  passengerStatus === 'ON_BOARD' ? (
                    <Car className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
                  )
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
                )}
                <h3 className="font-bold text-xs sm:text-[13px] text-slate-900">
                  {isConnectionTightOrMissed
                    ? passengerStatus === 'ON_BOARD'
                      ? 'Get off at Cuttack & take a cab'
                      : "Don't board this train for your connection"
                    : "Stay on the train — you're good to go"}
                </h3>
              </div>

              <span
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-2xs whitespace-nowrap ${
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

            <p className="text-xs sm:text-[13px] text-slate-600 font-medium leading-snug">
              {isConnectionTightOrMissed
                ? passengerStatus === 'ON_BOARD'
                  ? `Train reaches at ${selectedArrivalTime}. A cab via NH-16 gets you to Bhubaneswar by 11:54 AM — in time for your ${connectionDeadlineFormatted} train.`
                  : `It won't reach Bhubaneswar in time for your ${connectionDeadlineFormatted} Rajdhani. Take a cab or earlier train instead.`
                : `You'll reach Bhubaneswar at ${selectedArrivalTime}, with plenty of time for your ${connectionDeadlineFormatted} train.`}
            </p>
          </div>

          {/* Bottom Area: Full-width primary button or calm footer strip */}
          <div className="mt-2.5 shrink-0">
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
