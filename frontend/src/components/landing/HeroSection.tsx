import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const HeroSection: React.FC = () => {
  const { language } = useRailStore();
  const t = TRANSLATIONS[language].hero;

  return (
    <div className="text-center px-4 pt-10 pb-2">
      <h1 className="text-3xl sm:text-4xl font-bold text-[#0F294A] leading-tight tracking-tight">
        {t.headline}
      </h1>
      <p className="mt-3 text-base text-slate-500 max-w-xl mx-auto leading-relaxed">
        {t.subtitle}
      </p>
    </div>
  );
};
