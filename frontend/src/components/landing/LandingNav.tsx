import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS, type Lang } from './translations';

export const LandingNav: React.FC = () => {
  const { language, setLanguage, navigateToDashboardWithTrain, selectedTrain } =
    useRailStore();
  const t = TRANSLATIONS[language].nav;

  const langs: { code: Lang; label: string }[] = [
    { code: 'EN', label: 'EN' },
    { code: 'HI', label: 'हिन्दी' },
    { code: 'OR', label: 'ଓଡ଼ିଆ' },
  ];

  return (
    <nav className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 sm:px-8">
      <div className="max-w-4xl mx-auto flex items-center justify-between h-14">
        {/* Brand */}
        <span className="font-bold text-base tracking-widest text-[#0F294A] select-none">
          {t.brand}
        </span>

        {/* Right controls */}
        <div className="flex items-center gap-1 sm:gap-3">
          {/* Nav links */}
          <button
            onClick={() => {
              if (selectedTrain) navigateToDashboardWithTrain(selectedTrain);
            }}
            className="hidden sm:inline-flex px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
          >
            {t.myJourney}
          </button>
          <button
            onClick={() => navigateToDashboardWithTrain()}
            className="hidden sm:inline-flex px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
          >
            {t.allTrains}
          </button>

          {/* Language segmented control */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
            {langs.map((l) => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                  language === l.code
                    ? 'bg-white text-[#0F294A] shadow-sm'
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
