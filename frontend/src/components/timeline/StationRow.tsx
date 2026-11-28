import React from 'react';
import { Radio } from 'lucide-react';

export interface StationData {
  station_code: string;
  station_name: string;
  chainage_km: number;
  scheduled_arr: string;
  scheduled_dep: string;
  projected_arr: string;
  projected_dep: string;
  delay_mins: number;
  platform: string;
  is_junction?: boolean;
  status: 'passed' | 'current' | 'upcoming';
  is_terminus?: boolean;
  is_halted?: boolean;
}

interface StationRowProps {
  station: StationData;
  isTargetTrainHere?: boolean;
  trainSpeed?: number;
}

export const StationRow: React.FC<StationRowProps> = ({
  station,
  isTargetTrainHere = false,
  trainSpeed = 0,
}) => {
  const isPassed = station.status === 'passed';
  const isCurrent = station.status === 'current';
  const isAtPlatform = (isCurrent && Boolean(station.is_halted)) || isTargetTrainHere || (isCurrent && trainSpeed === 0);
  const isTerminus = Boolean(station.is_terminus) || station.scheduled_dep === '—';

  // Simple, passenger-friendly status label
  const statusLabel = isPassed
    ? 'Departed'
    : isAtPlatform
    ? isTerminus
      ? 'Terminus'
      : 'At Platform'
    : isCurrent
    ? 'Next Stop'
    : 'Upcoming';

  return (
    <div className="relative pl-8 pr-1 py-1.5">
      {/* Station Node on Vertical Track */}
      <div
        className={`absolute left-[11px] top-4 -translate-x-1/2 rounded-full transition-all z-10 flex items-center justify-center ${
          isCurrent
            ? isAtPlatform
              ? 'w-4 h-4 bg-emerald-600 border-2 border-white shadow-md ring-3 ring-emerald-300'
              : 'w-4 h-4 bg-white border-4 border-emerald-600 shadow-md ring-3 ring-emerald-200'
            : isPassed
            ? 'w-4 h-4 bg-white shadow-2xs'
            : 'w-3.5 h-3.5 bg-white border-2 border-slate-300 shadow-2xs'
        }`}
      >
        {isPassed && (
          <img
            src="/reached-tick.png"
            alt="Reached"
            className="w-4 h-4 object-contain"
          />
        )}
        {isCurrent && (
          <span
            className={`w-1.5 h-1.5 rounded-full block m-auto ${
              isAtPlatform ? 'bg-white' : 'bg-emerald-600'
            }`}
          />
        )}
      </div>

      {/* Station Content Card */}
      <div
        className={`p-3 rounded-xl border transition-all ${
          isCurrent
            ? 'bg-emerald-50/70 border-emerald-300 shadow-xs ring-1 ring-emerald-400/40'
            : isPassed
            ? 'bg-slate-50/70 border-slate-200/80 opacity-75'
            : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
        }`}
      >
        <div className="flex items-start justify-between gap-2.5 sm:gap-3">
          {/* Station Name, Code & Simple Status */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-[#0F294A] text-white shrink-0">
                {station.station_code}
              </span>
              <h4 className="text-sm font-bold text-slate-900 whitespace-normal break-words">{station.station_name}</h4>
              {station.is_junction && (
                <span className="text-xs font-mono font-bold px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                  JN
                </span>
              )}
              {/* Passenger status pill: Departed / At Platform / Terminus / Next Stop / Upcoming */}
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                  isPassed
                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                    : isAtPlatform
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300 font-extrabold'
                    : isCurrent
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-slate-100/70 text-slate-500 border-slate-200'
                }`}
              >
                {statusLabel}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-medium">
              <span className="font-mono">km {station.chainage_km.toFixed(1)}</span>
              <span>•</span>
              <span className="text-slate-600">{station.platform}</span>
            </div>
          </div>

          {/* Timing Column: Expected Arrival & Scheduled */}
          <div className="text-right shrink-0">
            <div className="font-mono text-sm font-bold text-slate-900">
              {isPassed
                ? (station.scheduled_dep !== '—' ? station.scheduled_dep : station.scheduled_arr)
                : (station.projected_arr !== '—' ? station.projected_arr : station.projected_dep)}
            </div>

            <div className="text-xs font-mono text-slate-400 mt-0.5">
              Sched: {station.scheduled_arr && station.scheduled_arr !== '—' ? station.scheduled_arr : station.scheduled_dep}
            </div>

            {station.delay_mins > 0 ? (
              <span className="inline-block text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 mt-1 whitespace-nowrap">
                +{station.delay_mins}m delay
              </span>
            ) : (
              <span className="inline-block text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1 whitespace-nowrap">
                On Time
              </span>
            )}
          </div>
        </div>

        {/* Live Train Indicator Badge when train is actively at/approaching this station */}
        {isCurrent && !isPassed && (
          <div className="mt-2 pt-2 border-t border-emerald-200/80 flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center gap-1.5 font-semibold">
              <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              {isAtPlatform ? (
                isTerminus ? (
                  <span>Arrived at Terminus • Journey Complete</span>
                ) : (
                  <span>Stopped at Platform • Commercial Dwell</span>
                )
              ) : (
                <span>Approaching station • {Math.round(trainSpeed)} km/h</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
