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
    <div className="max-w-2xl mx-auto px-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {steps.map((step, i) => (
          <div
            key={i}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-4"
          >
            <p className="text-sm font-semibold text-slate-700 mb-1">{step.title}</p>
            <p className="text-xs text-slate-500 leading-relaxed">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
