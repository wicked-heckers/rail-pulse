import React from 'react';
import { Clock, CheckCircle2 } from 'lucide-react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const ValueComparison: React.FC = () => {
  const { language } = useRailStore();
  const t = TRANSLATIONS[language].comparison;

  return (
    <section aria-label="Tracker comparison" className="w-full">
      <div className="w-full rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-xs overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200/80 shadow-sm">
        {/* Left Half: Standard Trackers */}
        <div className="bg-slate-50/80 px-5 py-5 sm:px-7 sm:py-6 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider text-slate-500 uppercase">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{t.standardLabel}</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800 leading-snug">
              {t.standardTitle}
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t.standardDesc}
            </p>
          </div>
        </div>

        {/* Right Half: Rail-Pulse */}
        <div className="bg-emerald-50/35 px-5 py-5 sm:px-7 sm:py-6 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider text-emerald-800 uppercase">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{t.rpLabel}</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
              {t.rpTitle}
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {t.rpDesc}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
