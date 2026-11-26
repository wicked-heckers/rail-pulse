import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { CorridorSwitcher } from '../layout/CorridorSwitcher';
import { TRANSLATIONS, type Lang } from './translations';

export const LandingNav: React.FC = () => {
  const { language, setLanguage } = useRailStore();
  const t = TRANSLATIONS[language].nav;

  const langs: { code: Lang; label: string }[] = [
    { code: 'EN', label: 'EN' },
    { code: 'HI', label: 'हिन्दी' },
    { code: 'OR', label: 'ଓଡ଼ିଆ' },
  ];

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-white/95 border-b border-slate-200 px-4 sm:px-6 shadow-2xs">
      <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-2 h-16 sm:h-[68px]">
        {/* Brand */}
        <div className="flex items-center gap-2 sm:gap-3 select-none shrink-0">
          <img src="/logo.png" alt="Rail-Pulse logo" className="w-8 h-8 sm:w-9 sm:h-9 object-contain shrink-0" />
          <span className="font-bold text-lg sm:text-xl tracking-wider text-[#0F294A] whitespace-nowrap shrink-0">
            {t.brand}
          </span>
        </div>

        {/* Controls: Corridor Switcher + Language Selector */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <CorridorSwitcher />

          {/* Language segmented control */}
          <div className="flex items-center bg-slate-100/90 rounded-xl p-0.5 sm:p-1 border border-slate-200 shrink-0">
            {langs.map((l) => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className={`px-2 sm:px-3 py-1 text-xs sm:text-sm font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  language === l.code
                    ? 'bg-white text-[#0F294A] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};
