import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const ValueComparison: React.FC = () => {
  const { language } = useRailStore();
  const t = TRANSLATIONS[language].comparison;

  return (
    <div className="max-w-2xl mx-auto px-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Other apps */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-3">
            {t.otherLabel}
          </p>
          <p className="text-lg font-bold text-slate-700 leading-snug mb-2">
            {t.otherQuote}
          </p>
          <p className="text-sm text-slate-500">{t.otherSub}</p>
        </div>

        {/* Rail-Pulse */}
        <div className="bg-white border-[1.5px] border-[#0F294A] rounded-xl p-5">
          <p className="text-[10px] font-bold tracking-widest text-[#0F294A] uppercase mb-3">
            {t.rpLabel}
          </p>
          <p className="text-lg font-bold text-[#0F294A] leading-snug mb-2">
            {t.rpQuote}
            <span className="font-mono tabular-nums">{t.rpQuoteP1}</span>
            {', worst case '}
            <span className="font-mono tabular-nums">{t.rpQuoteP2}</span>
            {'."'}
          </p>
          <p className="text-sm text-slate-600">{t.rpSub}</p>
        </div>
      </div>
    </div>
  );
};
