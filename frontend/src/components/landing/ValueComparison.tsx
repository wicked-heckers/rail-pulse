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
        <div className="bg-slate-50/70 px-6 py-5 flex flex-col justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              {t.standardLabel}
            </p>
            <h3 className="text-base font-semibold text-slate-700 leading-snug">
              {t.standardTitle}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              {t.standardDesc}
            </p>
          </div>
        </div>

        {/* Right Half (Clean white background) */}
        <div className="bg-white px-6 py-5 flex flex-col justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <p className="text-xs font-semibold tracking-wider text-emerald-700 uppercase">
                {t.rpLabel}
              </p>
            </div>
            <h3 className="text-base font-semibold text-slate-900 leading-snug">
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
