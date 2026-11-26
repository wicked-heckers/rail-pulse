import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const HeroSection: React.FC = () => {
  const { language } = useRailStore();
  const t = TRANSLATIONS[language].hero;

  return (
    <div className="text-center px-4 pt-2 sm:pt-4 pb-1">
      <h1 className="text-2xl sm:text-4xl font-bold text-[#0F294A] leading-tight tracking-tight">
        {t.headline}
      </h1>
      <p className="mt-1.5 text-sm sm:text-base text-slate-700 font-medium max-w-xl mx-auto leading-relaxed">
        {t.subtitle}
      </p>
    </div>
  );
};
