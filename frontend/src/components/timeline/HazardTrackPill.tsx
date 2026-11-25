import React, { useState } from 'react';
import { AlertTriangle, GitMerge, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';

export interface HazardItem {
  id: string;
  type: 'PHANTOM_FREIGHT' | 'LOOP_OVERTAKE' | 'TSR_SLOWDOWN';
  title: string;
  location: string;
  chainage_km: number;
  delay_impact_mins: number;
  description: string;
  mitigation: string;
}

export const HazardTrackPill: React.FC<{ hazard: HazardItem }> = ({ hazard }) => {
  const [expanded, setExpanded] = useState(false);

  const isFreight = hazard.type === 'PHANTOM_FREIGHT';
  const isLoop = hazard.type === 'LOOP_OVERTAKE';

  const badgeTheme = isFreight
    ? 'bg-amber-500/10 text-amber-800 border-amber-300'
    : isLoop
    ? 'bg-rose-500/10 text-rose-800 border-rose-300'
    : 'bg-orange-500/10 text-orange-800 border-orange-300';

  const icon = isFreight ? (
    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
  ) : isLoop ? (
    <GitMerge className="w-3.5 h-3.5 text-rose-600 shrink-0" />
  ) : (
    <ShieldAlert className="w-3.5 h-3.5 text-orange-600 shrink-0" />
  );

  return (
    <div className="relative pl-10 pr-2 py-1.5 my-1 group">
      {/* Node pin on the vertical timeline track */}
      <div className="absolute left-[13px] top-3.5 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-amber-500 flex items-center justify-center shadow-xs z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
      </div>

      {/* Pill Card */}
      <div
        onClick={() => setExpanded(!expanded)}
        className={`rounded-lg border px-3 py-2 cursor-pointer transition-all ${badgeTheme} hover:shadow-xs`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-semibold text-xs">{hazard.title}</span>
            <span className="font-mono text-xs px-1.5 py-0.2 rounded bg-white/70 border border-current">
              km {hazard.chainage_km.toFixed(1)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-white shadow-2xs">
              +{hazard.delay_impact_mins}m
            </span>
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-current opacity-70" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-current opacity-70" />
            )}
          </div>
        </div>

        {/* Collapsible Details */}
        {expanded && (
          <div className="mt-2 pt-2 border-t border-current/20 text-xs space-y-1.5 leading-relaxed">
            <p>
              <strong>Congestion Cause:</strong> {hazard.description}
            </p>
            <p className="text-current/90">
              <strong>Kinematic Impact:</strong> {hazard.mitigation}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
