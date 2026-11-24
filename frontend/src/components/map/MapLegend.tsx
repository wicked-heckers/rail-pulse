import React from 'react';
import { Layers } from 'lucide-react';

export const MapLegend: React.FC = () => {
  return (
    <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-md border border-[#E2E8F0] p-3 rounded-xl shadow-md text-xs text-[#334155] max-w-xs space-y-2 pointer-events-auto">
      <div className="flex items-center gap-1.5 font-bold text-[#0F172A] border-b border-[#F1F5F9] pb-1.5">
        <Layers className="w-3.5 h-3.5 text-blue-600" />
        <span>Corridor Digital Twin Legend</span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-medium">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 ring-2 ring-emerald-300" />
          <span>Target Train (Selected)</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
          <span>22895 Vande Bharat</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
          <span>Other Express / Mail</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-3 h-1.5 rounded-xs bg-amber-400 border border-amber-600" />
          <span>Phantom Freight Zone</span>
        </div>

        <div className="flex items-center gap-2 col-span-2 pt-1 border-t border-gray-100">
          <span className="w-4 h-0.5 border-t-2 border-dashed border-emerald-600 inline-block" />
          <span>NH-16 Highway Road Transfer (CTC ➔ BBS)</span>
        </div>
      </div>
    </div>
  );
};
