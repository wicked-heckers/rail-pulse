import React, { useState } from 'react';
import { useRailStore } from '../../stores/useRailStore';
import {
  Train,
  Info,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Edit2,
  Check,
  X,
  Car,
  Shield,
  ArrowRight,
} from 'lucide-react';
import {
  getTrainIdentity,
  getArrivalPrediction,
  evaluateLogicalConnection,
  formatTime12Hour,
} from '../dashboard/passengerUtils';

export const ArrivalConnectionCard: React.FC = () => {
  const {
    selectedTrain,
    activeSnapshot,
    forecast,
    rescue,
    connectionTarget,
    setConnectionTarget,
    passengerStatus,
    setCabModalOpen,
    setActiveMapView,
  } = useRailStore();

  const [showModelInfo, setShowModelInfo] = useState(false);
  const [isEditingConnection, setIsEditingConnection] = useState(false);
  const [editTrainName, setEditTrainName] = useState('20817 Rajdhani Express');
  const [editDeadline, setEditDeadline] = useState(connectionTarget?.deadline_time || '12:15');

  // 1. Train Identity (Section 7)
  const trainIdentity = getTrainIdentity(selectedTrain, activeSnapshot);

  // 2. Expected Arrival & Window (Section 1)
  const prediction = getArrivalPrediction(
    selectedTrain,
    forecast,
    rescue,
    connectionTarget?.station_code || 'BBS'
  );

  // 3. Logical Connection Evaluation (Section 1)
  const connectionDeadlineFormatted = formatTime12Hour(connectionTarget?.deadline_time);

  const connectionEval = evaluateLogicalConnection(
    prediction.expectedTime,
    prediction.worstCaseTime,
    connectionDeadlineFormatted,
    connectionTarget?.transfer_buffer_mins ?? 15,
    rescue?.survival_probability_pct,
    editTrainName
  );

  const handleSaveConnection = () => {
    setConnectionTarget({
      deadline_time: editDeadline,
      isCustom: true,
    });
    setIsEditingConnection(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col gap-4 shrink-0 transition-all">
      {/* 1. Simplified Train Information Card (Section 7) */}
      <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#0F294A] text-white flex items-center justify-center shrink-0 shadow-2xs">
            <Train className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-extrabold text-sm sm:text-base text-[#0F294A]">
                {trainIdentity.trainNo}
              </span>
              <span className="text-slate-400">•</span>
              <h2 className="font-bold text-sm sm:text-base text-slate-800 truncate">
                {trainIdentity.trainName}
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">
              {trainIdentity.locationText}
            </p>
          </div>
        </div>

        {/* Single Running Status Pill (Strictly avoid multiple badges) */}
        <div className="shrink-0">
          {trainIdentity.statusTone === 'amber' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>{trainIdentity.statusText}</span>
            </span>
          )}
          {trainIdentity.statusTone === 'emerald' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>{trainIdentity.statusText}</span>
            </span>
          )}
          {trainIdentity.statusTone === 'slate' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span>{trainIdentity.statusText}</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Section One: Expected Arrival Headline (Question 1) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">
            Expected Arrival
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
                <div className="grid grid-cols-3 gap-1 pt-1 text-[11px] font-mono">
                  <div className="bg-slate-800 p-1 rounded">
                    <span className="text-slate-400 block text-[9px]">P10 Earliest</span>
                    <span className="text-emerald-400 font-bold">{prediction.p10Time}</span>
                  </div>
                  <div className="bg-slate-800 p-1 rounded">
                    <span className="text-slate-400 block text-[9px]">P50 Expected</span>
                    <span className="text-white font-bold">{prediction.p50Time}</span>
                  </div>
                  <div className="bg-slate-800 p-1 rounded">
                    <span className="text-slate-400 block text-[9px]">P90 Latest</span>
                    <span className="text-amber-400 font-bold">{prediction.p90Time}</span>
                  </div>
                </div>
                <p className="text-emerald-400 font-medium text-[11px] pt-0.5">
                  92% Empirical Confidence Interval
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Most prominent arrival element */}
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0F294A]">
            {prediction.expectedTime}
          </span>
          <span className="text-base sm:text-lg font-bold text-slate-600">
            {prediction.destinationName} ({prediction.destinationCode})
          </span>
        </div>

        {/* Likely arrival window beneath it */}
        <p className="text-xs sm:text-sm text-slate-500 font-medium">
          Likely arrival window:{' '}
          <span className="font-mono font-semibold text-slate-700">{prediction.likelyWindow}</span>
        </p>
      </div>

      {/* 3. Section One: Connection Status (Question 2) */}
      <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span>Your connection:</span>
            {!isEditingConnection ? (
              <span className="font-semibold text-slate-800">
                {connectionEval.connectingTrainName} — {connectionEval.connectionDeadline}
              </span>
            ) : null}
          </div>

          {!isEditingConnection ? (
            <button
              type="button"
              onClick={() => setIsEditingConnection(true)}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded text-xs flex items-center gap-1 cursor-pointer"
              title="Edit connection details"
            >
              <Edit2 className="w-3 h-3" />
              <span className="hidden sm:inline">Change</span>
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

        {/* Connection Status Indicator & Short Human Message */}
        <div
          className={`rounded-xl p-3 border transition-all ${connectionEval.status === 'at_risk'
              ? 'bg-rose-50/80 border-rose-200 text-rose-900'
              : connectionEval.status === 'uncertain'
                ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            }`}
        >
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              {connectionEval.status === 'at_risk' && (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              {connectionEval.status === 'uncertain' && (
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              {connectionEval.status === 'safe' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-xs sm:text-[13px] font-bold">
                  {connectionEval.explanation}
                </p>
                <p className="text-[11px] opacity-80 mt-0.5">
                  Required transfer window at {prediction.destinationCode}: {connectionEval.bufferMins} mins
                </p>
              </div>
            </div>

            <span
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs ${connectionEval.status === 'at_risk'
                  ? 'bg-white text-rose-700 border-rose-300'
                  : connectionEval.status === 'uncertain'
                    ? 'bg-white text-amber-700 border-amber-300'
                    : 'bg-white text-emerald-700 border-emerald-300'
                }`}
            >
              {connectionEval.label}
            </span>
          </div>

          {/* Actionable NH-16 Cab Rescue Button (Only when On Board, At Risk, and backend found a viable cab bailout) */}
          {passengerStatus === 'ON_BOARD' &&
            connectionEval.status === 'at_risk' &&
            rescue?.bailout_recommended &&
            rescue?.bailout_plan && (
              <div className="mt-2.5 pt-2 border-t border-rose-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-rose-950 font-semibold">
                  <Car className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    Hop off at {rescue.bailout_plan.deboard_station_name} → Cab via NH-16 saves ~
                    {Math.round(rescue.bailout_plan.minutes_saved)} mins
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMapView('alternative_route');
                    setCabModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-[#0F294A] hover:bg-[#1a3a60] text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                >
                  <Car className="w-3.5 h-3.5 text-amber-400" />
                  <span>View Cab Rescue Plan</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

          {/* Safe-Boarding Note (When Pre-Boarding & At Risk) */}
          {passengerStatus === 'PRE_BOARDING' && connectionEval.status === 'at_risk' && (
            <div className="mt-2 pt-1.5 border-t border-rose-200/60 flex items-center gap-1.5 text-[11px] text-rose-800">
              <Shield className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>Safe-Boarding Rule: Report to station on schedule. Road bailout activates once on board.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
