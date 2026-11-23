import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';

export const ConnectionGuard: React.FC = () => {
  const { rescue, connectionTarget, setConnectionTarget } = useRailStore();

  const survivalPct = rescue?.survival_probability_pct ?? 18.0;
  const riskLevel = rescue?.risk_level ?? 'HIGH_RISK_MISS';

  let badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
  let badgeIcon = <XCircle className="w-4 h-4 text-rose-600" />;
  let barColor = 'bg-rose-500';

  if (survivalPct >= 70) {
    badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    badgeIcon = <ShieldCheck className="w-4 h-4 text-emerald-600" />;
    barColor = 'bg-emerald-500';
  } else if (survivalPct >= 40) {
    badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
    badgeIcon = <AlertTriangle className="w-4 h-4 text-amber-600" />;
    barColor = 'bg-amber-500';
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-xs">
      <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
            Connection Survival Monitor
          </h3>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${badgeColor}`}>
          {badgeIcon}
          <span className="font-mono font-bold">{survivalPct.toFixed(0)}% Survival</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-3">
        {/* Probability Gauge Bar */}
        <div className="flex flex-col justify-center">
          <div className="flex justify-between items-baseline mb-1 text-xs">
            <span className="text-[#64748B]">Catch Connecting Train Probability</span>
            <span className="font-mono font-bold text-[#0F172A]">{survivalPct}%</span>
          </div>
          <div className="h-3 w-full bg-[#F1F5F9] rounded-full overflow-hidden border border-[#E2E8F0]">
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColor}`}
              style={{ width: `${Math.max(5, survivalPct)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#94A3B8] font-mono mt-1">
            <span>0% High Risk</span>
            <span>40% Moderate</span>
            <span>100% Guaranteed</span>
          </div>
        </div>

        {/* Target Details Form */}
        <div className="bg-[#FAF9F6] p-2.5 rounded-lg border border-[#E5E7EB] text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#64748B]">Connecting Train:</span>
            <span className="font-mono font-semibold text-[#0F172A]">20817 Rajdhani Exp</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#64748B]">Transfer Station:</span>
            <select
              value={connectionTarget.station_code}
              onChange={(e) => setConnectionTarget({ station_code: e.target.value })}
              className="bg-white border border-[#CBD5E1] rounded px-2 py-0.5 text-xs font-mono font-medium text-[#0F172A] focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            >
              <option value="BBS">BBS (Bhubaneswar)</option>
              <option value="CTC">CTC (Cuttack)</option>
              <option value="PURI">PURI (Puri)</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#64748B]">Deadline / Cutoff:</span>
            <span className="font-mono font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
              {connectionTarget.deadline_time} PM (15m buffer)
            </span>
          </div>
        </div>
      </div>

      <div className="text-[11px] text-[#64748B] flex items-center justify-between pt-2 border-t border-[#F1F5F9]">
        <span>Risk Assessment: <strong className="text-[#0F172A]">{riskLevel.replace(/_/g, ' ')}</strong></span>
        <span className="text-[10px] text-[#94A3B8]">Evaluated via Two-Piece Normal CDF</span>
      </div>
    </div>
  );
};
