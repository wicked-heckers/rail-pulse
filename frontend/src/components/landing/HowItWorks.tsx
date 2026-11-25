import React from 'react';
import { useRailStore } from '../../stores/useRailStore';
import { TRANSLATIONS } from './translations';

export const HowItWorks: React.FC = () => {
  const { language } = useRailStore();
  const t = TRANSLATIONS[language].steps;

  const steps = [
    { title: t.s1Title, body: t.s1Body },
    { title: t.s2Title, body: t.s2Body },
    { title: t.s3Title, body: t.s3Body },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {steps.map((step, i) => (
          <div
            key={i}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 sm:py-3"
          >
            <p className="text-xs sm:text-sm font-semibold text-slate-700 mb-0.5">{step.title}</p>
            <p className="text-xs text-slate-500 leading-normal">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
