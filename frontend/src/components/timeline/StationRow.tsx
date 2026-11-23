import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Radio } from 'lucide-react';

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
  intermediate_blocks?: {
    block_id: string;
    length_km: number;
    speed_limit_kmh: number;
    signal: 'GREEN' | 'DOUBLE_YELLOW' | 'YELLOW' | 'RED';
  }[];
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
  const [blocksOpen, setBlocksOpen] = useState(false);

  const isPassed = station.status === 'passed';
  const isCurrent = station.status === 'current' || isTargetTrainHere;

  return (
    <div className="relative pl-10 pr-2 py-2">
      {/* Station Node on Vertical Track */}
      <div
        className={`absolute left-[13px] top-4 -translate-x-1/2 rounded-full transition-all z-10 ${
          isCurrent
            ? 'w-5 h-5 bg-white border-4 border-emerald-600 shadow-md ring-4 ring-emerald-200'
            : isPassed
            ? 'w-4 h-4 bg-emerald-600 border-2 border-white shadow-xs'
            : 'w-4 h-4 bg-white border-2 border-[#94A3B8] shadow-2xs'
        }`}
      >
        {isPassed && <CheckCircle2 className="w-3 h-3 text-white -mt-0.5 -ml-0.5 stroke-[3]" />}
        {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 block m-auto mt-0.5" />}
      </div>

      {/* Station Content Card */}
      <div
        className={`p-3 rounded-xl border transition-all ${
          isCurrent
            ? 'bg-emerald-50/70 border-emerald-300 shadow-xs ring-1 ring-emerald-400/40'
            : isPassed
            ? 'bg-[#F8FAFC]/70 border-[#E2E8F0] opacity-80'
            : 'bg-white border-[#E5E7EB] hover:border-[#CBD5E1] shadow-2xs'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Station Name & Code */}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-[#0F172A] text-white">
                {station.station_code}
              </span>
              <h4 className="text-sm font-bold text-[#0F172A]">{station.station_name}</h4>
              {station.is_junction && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  JN
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1 text-[11px] text-[#64748B]">
              <span className="font-mono">km {station.chainage_km.toFixed(1)}</span>
              <span>•</span>
              <span className="font-medium text-[#475569]">{station.platform}</span>
            </div>
          </div>

          {/* Timing Column */}
          <div className="text-right">
            <div className="font-mono text-xs font-bold text-[#0F172A]">
              {isPassed ? station.scheduled_dep : station.projected_arr}
            </div>

            <div className="text-[10px] font-mono text-[#64748B] mt-0.5">
              Sched: {station.scheduled_arr || station.scheduled_dep}
            </div>

            {station.delay_mins > 0 ? (
              <span className="inline-block text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 mt-1">
                +{station.delay_mins}m delay
              </span>
            ) : (
              <span className="inline-block text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 mt-1">
                On Time
              </span>
            )}
          </div>
        </div>

        {/* Live Train Indicator Badge when train is actively at/approaching this station */}
        {isCurrent && (
          <div className="mt-2.5 pt-2 border-t border-emerald-200 flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center gap-1.5 font-semibold">
              <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              <span>Train actively approaching • {trainSpeed} km/h</span>
            </div>
            <span className="text-[11px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-emerald-300">
              Auto-Block Track 1
            </span>
          </div>
        )}

        {/* Intermediate Collapsible Blocks */}
        {station.intermediate_blocks && station.intermediate_blocks.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-[#F1F5F9]">
            <button
              onClick={() => setBlocksOpen(!blocksOpen)}
              className="flex items-center gap-1.5 text-[11px] font-mono text-[#64748B] hover:text-[#0F172A] transition-colors"
            >
              <span>{station.intermediate_blocks.length} intermediate automatic signal blocks</span>
              {blocksOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {blocksOpen && (
              <div className="mt-2 space-y-1.5 bg-[#FAF9F6] p-2.5 rounded-lg border border-[#E2E8F0]">
                {station.intermediate_blocks.map((blk) => (
                  <div
                    key={blk.block_id}
                    className="flex items-center justify-between text-[11px] font-mono py-0.5 border-b border-gray-100 last:border-0"
                  >
                    <span className="text-[#334155]">{blk.block_id}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[#64748B]">{blk.length_km} km</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          blk.signal === 'GREEN'
                            ? 'bg-emerald-100 text-emerald-800'
                            : blk.signal === 'DOUBLE_YELLOW'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {blk.signal}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
