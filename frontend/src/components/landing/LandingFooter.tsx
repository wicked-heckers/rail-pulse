import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const LandingFooter: React.FC = () => {
  const { language } = useRailStore();
  const t = TRANSLATIONS[language];

  return (
    <footer className="py-2.5 sm:py-3 px-4 text-center">
      <p className="text-xs text-slate-400">{t.footer}</p>
    </footer>
  );
};
