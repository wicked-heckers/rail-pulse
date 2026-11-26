import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const LandingFooter: React.FC = () => {
  const { language } = useRailStore();
  const t = TRANSLATIONS[language];

  return (
    <footer className="w-full border-t border-slate-200/80 bg-white/70 backdrop-blur-sm mt-14">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Upper Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Left: Brand & Subtitle */}
          <div>
            <span className="text-sm font-bold tracking-tight text-slate-900">
              RAIL-PULSE
            </span>
            <p className="text-xs text-slate-500 mt-0.5">
              Traffic-aware arrival forecasts &amp; connection protection for East Coast Railway.
            </p>
          </div>

          {/* Right: Corridor Coverage Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/80 border border-slate-200/70 text-xs font-medium text-slate-600 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Bhadrak (BHC) – Bhubaneswar (BBS) – Puri (PURI)</span>
          </div>
        </div>

        {/* Lower Row */}
        <div className="mt-4 pt-4 border-t border-slate-200/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-400">
          <p>
            {language === 'EN'
              ? 'Arrival windows are live estimates and may shift with track signals. Not an official Indian Railways or IRCTC service.'
              : t.footer}
          </p>
          <p className="whitespace-nowrap">
            &copy; 2026 RAIL-PULSE &bull; Passenger Transit Prototype
          </p>
        </div>
      </div>
    </footer>
  );
};
