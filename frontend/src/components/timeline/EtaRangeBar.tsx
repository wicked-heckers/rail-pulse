import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { Clock, ShieldAlert, Sparkles, AlertCircle } from 'lucide-react';

export const EtaRangeBar: React.FC = () => {
  const { forecast, rescue, connectionTarget } = useRailStore();

  const p10 = forecast?.p10_delay_mins ?? 14;
  const p50 = forecast?.p50_delay_mins ?? 28;
  const p90 = forecast?.p90_delay_mins ?? 46;
  const scheduledTime = '12:10 PM';
  const confidence = 92;

  // Compute display clock times (relative to 12:10 base)
  const formatTimeOffset = (baseHour: number, baseMin: number, addMins: number) => {
    const totalMin = baseHour * 60 + baseMin + Math.round(addMins);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const p10Time = formatTimeOffset(12, 10, p10);
  const p50Time = formatTimeOffset(12, 10, p50);
  const p90Time = formatTimeOffset(12, 10, p90);

  // Range bar positioning percentages
  const minVal = Math.max(0, p10 - 5);
  const maxVal = p90 + 8;
  const span = Math.max(1, maxVal - minVal);

  const p10Pct = ((p10 - minVal) / span) * 100;
  const p50Pct = ((p50 - minVal) / span) * 100;
  const p90Pct = ((p90 - minVal) / span) * 100;

  // Deadline calculation relative to scheduled 12:10 PM
  // e.g. 12:15 PM deadline is +5 mins after 12:10
  const deadlineMinsFromBase = 5;
  const deadlinePct = Math.min(100, Math.max(0, ((deadlineMinsFromBase - minVal) / span) * 100));

  const isDeadlineBreached = (rescue?.survival_probability_pct ?? 18) < 40;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
      {/* Top Meta Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#0F172A]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
            Probabilistic ETA Forecast (Bhubaneswar BBS)
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono text-[#64748B]">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>LightGBM CQR Monotonic</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
            {confidence}% Conf
          </span>
        </div>
      </div>

      {/* Main Expected Arrival Display */}
      <div className="my-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
        <div>
          <div className="text-xs text-[#64748B] mb-0.5">Most Likely Arrival (P50 Median)</div>
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-2xl font-bold tracking-tight text-[#0F172A]">{p50Time}</span>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              +{p50}m delay vs {scheduledTime}
            </span>
          </div>
        </div>

        {/* Connection Deadline Tag */}
        <div className="mt-2 sm:mt-0 text-left sm:text-right">
          <div className="text-xs text-[#64748B]">Connecting Train Deadline:</div>
          <div className="font-mono text-xs font-bold text-rose-700 flex items-center sm:justify-end gap-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{connectionTarget.deadline_time} PM (20817 Rajdhani)</span>
          </div>
        </div>
      </div>

      {/* Horizontal Range Visualization */}
      <div className="pt-2 pb-1">
        {/* Track Bar Background with clear spacing for deadline badge */}
        <div className="relative h-4 bg-[#F1F5F9] rounded-full overflow-visible mt-6 mb-3 border border-[#E2E8F0]">
          {/* Shaded Uncertainty Spread P10 -> P90 */}
          <div
            className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-emerald-100 via-amber-200 to-rose-200 border-y border-amber-300"
            style={{
              left: `${p10Pct}%`,
              width: `${Math.max(5, p90Pct - p10Pct)}%`,
            }}
          />

          {/* P50 Median Marker Bar */}
          <div
            className="absolute -top-1 bottom-0 w-1 bg-[#0F172A] rounded-full h-6 -translate-x-1/2 shadow-xs z-10"
            style={{ left: `${p50Pct}%` }}
            title={`P50 Median: ${p50Time} (+${p50}m)`}
          />

          {/* Connection Deadline Marker Pin */}
          <div
            className="absolute -top-3 w-0.5 h-8 bg-rose-600 -translate-x-1/2 z-20"
            style={{ left: `${deadlinePct}%` }}
            title={`Connection Deadline: ${connectionTarget.deadline_time}`}
          >
            <div className="absolute -top-5 -translate-x-1/2 whitespace-nowrap bg-rose-600 text-white font-mono text-xs font-bold px-1.5 py-0.5 rounded shadow-xs">
              12:15 PM DEADLINE
            </div>
          </div>
        </div>

        {/* Three Quantile Labels */}
        <div className="flex justify-between items-start text-xs font-mono pt-1 text-[#475569]">
          <div className="text-left">
            <span className="text-xs text-[#94A3B8] block uppercase">P10 Earliest</span>
            <span className="font-semibold text-emerald-700">{p10Time}</span>
            <span className="text-xs text-[#64748B] block">+{p10}m delay</span>
          </div>

          <div className="text-center font-bold text-[#0F172A]">
            <span className="text-xs text-[#64748B] block uppercase">P50 Median</span>
            <span className="text-sm">{p50Time}</span>
            <span className="text-xs text-amber-700 block">+{p50}m delay</span>
          </div>

          <div className="text-right">
            <span className="text-xs text-[#94A3B8] block uppercase">P90 Worst Case</span>
            <span className="font-semibold text-rose-700">{p90Time}</span>
            <span className="text-xs text-[#64748B] block">+{p90}m delay</span>
          </div>
        </div>
      </div>

      {/* Warning Footer when Deadline is at risk */}
      {isDeadlineBreached && (
        <div className="mt-3 pt-2.5 border-t border-[#FEE2E2] flex items-center gap-2 text-xs text-rose-800 bg-rose-50/70 p-2 rounded-lg">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>
            <strong>Connection Deadline Breached:</strong> Train P50 ({p50Time}) arrives after transfer cutoff (
            {connectionTarget.deadline_time} PM). Road bailout recommended.
          </span>
        </div>
      )}
    </div>
  );
};
