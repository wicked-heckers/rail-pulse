import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { ShieldCheck, Car, AlertTriangle, ArrowRight, Info, CheckCircle2 } from 'lucide-react';

export const RescueBanner: React.FC = () => {
  const { passengerStatus, rescue, setCabModalOpen, selectedTrain } = useRailStore();

  const isPreBoarding = passengerStatus === 'PRE_BOARDING';
  const survivalPct = rescue?.survival_probability_pct ?? 18.0;
  const isHighRisk = survivalPct < 40;

  // CASE 1: Pre-boarding Safe-Boarding Lock
  if (isPreBoarding) {
    return (
      <div className="bg-emerald-50/90 border border-emerald-300 rounded-xl p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-emerald-900">
                Safe-Boarding Guardrail Active (At Home Protection)
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                LOCKED
              </span>
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed">
              <strong>Official IR Advisory:</strong> Report to your originating station on scheduled time. Even if {selectedTrain}
              is currently delayed upstream, section controllers can prioritize runs and recover 15–20 minutes
              of schedule slack.
            </p>
            <p className="text-[11px] text-emerald-700 italic">
              Multimodal road bailout suggestions are suppressed until you are actively onboard to prevent false station
              abandonment.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // CASE 2: On-Board and Connection is Safe
  if (!isHighRisk) {
    return (
      <div className="bg-white border border-emerald-200 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <div className="text-xs font-bold text-[#0F172A]">Connection Target Safe</div>
            <div className="text-[11px] text-[#64748B]">
              Your train is projected to arrive at Bhubaneswar in time to comfortably make your connection.
            </div>
          </div>
        </div>
        <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
          {survivalPct.toFixed(0)}% Probability
        </span>
      </div>
    );
  }

  // CASE 3: On-Board and Connection at Risk -> Early Junction Rescue Card!
  return (
    <div className="bg-gradient-to-br from-amber-50 to-rose-50 border-2 border-rose-300 rounded-xl p-4 shadow-sm relative overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-rose-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-rose-900">Connection At Risk — Early-Junction Bailout</h4>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                ACTION REQUIRED
              </span>
            </div>
            <p className="text-xs text-rose-800">
              Train {selectedTrain} is delayed due to freight congestion. Rail arrival at BBS will miss your 12:15 PM deadline.
            </p>
          </div>
        </div>

        <button
          onClick={() => setCabModalOpen(true)}
          className="flex items-center gap-2 bg-[#0F172A] hover:bg-[#1E293B] text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors whitespace-nowrap self-stretch sm:self-auto justify-center"
        >
          <Car className="w-4 h-4 text-amber-400" />
          <span>Book NH-16 Cab</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Rescue Comparison Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3 text-xs">
        {/* Rail Option */}
        <div className="bg-white/80 p-2.5 rounded-lg border border-rose-200">
          <span className="text-[10px] uppercase font-bold text-[#64748B] block">Stay On Train {selectedTrain}</span>
          <span className="font-mono font-bold text-sm text-rose-700 block my-0.5">12:38 PM</span>
          <span className="text-[11px] text-rose-600 block">Misses 12:15 deadline by 23m</span>
        </div>

        {/* Road Bailout Option */}
        <div className="bg-emerald-50/90 p-2.5 rounded-lg border border-emerald-300">
          <span className="text-[10px] uppercase font-bold text-emerald-800 block">Deboard at Cuttack (CTC)</span>
          <span className="font-mono font-bold text-sm text-emerald-800 block my-0.5">12:02 PM</span>
          <span className="text-[11px] text-emerald-700 font-semibold block">Saves 36 mins via NH-16</span>
        </div>

        {/* Highway Specs */}
        <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
          <span className="text-[10px] uppercase font-bold text-[#64748B] block">NH-16 Highway Transit</span>
          <span className="font-mono font-bold text-sm text-[#0F172A] block my-0.5">27.4 km • 38 mins</span>
          <span className="text-[11px] text-[#64748B] block">Live traffic matrix calibrated</span>
        </div>
      </div>

      <div className="mt-2.5 text-[10px] text-rose-700/80 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>Deboarding remains the passenger&apos;s voluntary decision. Official IR tickets are non-transferable to road.</span>
      </div>
    </div>
  );
};
