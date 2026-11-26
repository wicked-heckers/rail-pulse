import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const ValueComparison: React.FC = () => {
  const { language } = useRailStore();
  const t = TRANSLATIONS[language].comparison;

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="w-full rounded-2xl border border-slate-200/80 bg-white overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200/80 shadow-2xs">
        {/* Left Half (Muted background) */}
        <div className="bg-slate-50/70 px-6 py-4 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase mb-1.5">
              {t.standardLabel}
            </p>
            <h3 className="text-base font-semibold text-slate-700 leading-snug mb-1">
              {t.standardTitle}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              {t.standardDesc}
            </p>
          </div>
        </div>

        {/* Right Half (Clean white background) */}
        <div className="bg-white px-6 py-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <p className="text-xs font-semibold tracking-wider text-emerald-700 uppercase">
                {t.rpLabel}
              </p>
            </div>
            <h3 className="text-base font-semibold text-slate-900 leading-snug mb-1">
              {t.rpTitle}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t.rpDesc}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
