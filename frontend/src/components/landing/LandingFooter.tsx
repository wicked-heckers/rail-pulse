import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const LandingFooter: React.FC = () => {
  const { language, activeCorridorId } = useRailStore();
  const t = TRANSLATIONS[language];
  const isKolkata = activeCorridorId === 'SER_HWH_KGP';

  return (
    <footer className="w-full bg-white/95 backdrop-blur-sm border-t border-slate-200/80 mt-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-0 py-6">
        {/* Upper Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Left: Brand & Subtitle */}
          <div>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Rail-Pulse" className="w-5 h-5 object-contain shrink-0" />
              <span className="text-sm font-bold tracking-tight text-slate-900">
                RAIL-PULSE
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Smarter predictions. Safer connections.
            </p>
          </div>

          {/* Right: Active Corridor Coverage Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200/80 text-xs font-medium text-slate-700 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="whitespace-nowrap">
              {isKolkata
                ? 'South Eastern Railway • HWH – SRC – KGP'
                : 'East Coast Railway • BHC – BBS – PURI'}
            </span>
          </div>
        </div>

        {/* Lower Legal Row */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-400">
          <p>
            {language === 'EN'
              ? 'Independent prototype. Arrival windows are live estimates and may change. Not affiliated with Indian Railways.'
              : t.footer}
          </p>
          <p className="whitespace-nowrap">
            &copy; 2026 RAIL-PULSE
          </p>
        </div>
      </div>
    </footer>
  );
};
